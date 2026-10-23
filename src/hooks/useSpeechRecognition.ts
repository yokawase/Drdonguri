import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  cleanExtractedMedicalText,
  mergeSpeechTranscripts,
  removeSpeechDuplications,
} from '../utils/chartTextCleaner';
import {
  decodeMedicalSpeech,
  getDecodedSpeechTokens,
} from '../services/medicalSpeechDecoder';
import { triggerHaptic } from '../components/nativePwa/types';

interface UseSpeechRecognitionParams {
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  onAhoCorasickReplace?: (text: string) => { result: string; replacedCount: number };
  onLearnAsrDiff?: (rawSpeechText: string, finalizedText: string) => Promise<any>;
}

export function useSpeechRecognition({
  setInputText,
  onAhoCorasickReplace,
  onLearnAsrDiff,
}: UseSpeechRecognitionParams) {
  // 音声入力録音状態
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const lastRestartTimeRef = useRef<number>(0);

  // マイク波形（発話アクティビティ連動）— React state を使わず ref で直接描画（発熱対策）
  const wavePath1Ref = useRef<SVGPathElement | null>(null);
  const wavePath2Ref = useRef<SVGPathElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  const applyWaveformLevel = useCallback((level: number) => {
    wavePath1Ref.current?.setAttribute(
      'd',
      `M 10 12 Q 40 ${12 - level * 20 - 1} 70 12 T 120 ${12 + level * 18 + 1} T 170 ${12 - level * 16} T 230 12`
    );
    wavePath2Ref.current?.setAttribute(
      'd',
      `M 10 12 Q 50 ${12 + level * 14 + 2} 90 12 T 140 ${12 - level * 12 - 1} T 190 ${12 + level * 13} T 230 12`
    );
  }, []);

  // 中間認識結果のUI反映を間引くタイマー（onresult 毎の全体再レンダー＋正規表現解読を抑制）
  const interimFlushTimerRef = useRef<number | null>(null);

  const [speechSuccessNotice, setSpeechSuccessNotice] = useState<string | null>(null);

  // 音声入力中の波形アニメーションループ (約20fps・再レンダー0回)
  const startWaveformLoop = useCallback(() => {
    let phase = 0;
    let lastFrame = 0;
    const FRAME_INTERVAL_MS = 50; // 約20fps
    const waveLoop = (now: number) => {
      if (!isRecordingRef.current) {
        applyWaveformLevel(0);
        animFrameRef.current = null;
        return;
      }
      if (now - lastFrame >= FRAME_INTERVAL_MS) {
        lastFrame = now;
        phase += isSpeakingRef.current ? 0.6 : 0.2;
        const baseAmp = isSpeakingRef.current ? 0.75 : 0.2;
        const noise = isSpeakingRef.current ? Math.random() * 0.25 : Math.random() * 0.05;
        applyWaveformLevel(Math.min(1.0, ((Math.sin(phase) + 1) / 2) * baseAmp + noise));
      }
      animFrameRef.current = requestAnimationFrame(waveLoop);
    };
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(waveLoop);
  }, [applyWaveformLevel]);

  const stopWaveformLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    applyWaveformLevel(0);
    isSpeakingRef.current = false;
  }, [applyWaveformLevel]);

  // 音声認識（Web Speech API / SpeechRecognition）の初期化と制御
  const toggleSpeechRecognition = useCallback(async () => {
    triggerHaptic(isRecordingRef.current ? [20, 40, 20] : 30);

    if (isRecordingRef.current) {
      // 録音停止
      isRecordingRef.current = false;
      setIsRecording(false);
      stopWaveformLoop();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('SpeechRecognition stop error:', e);
        }
      }

      // 認識結果全文（確定＋中間）を重複排除して医療音声解読エンジンで自動補正
      const rawFull = removeSpeechDuplications(
        mergeSpeechTranscripts(finalTranscriptRef.current, interimTranscriptRef.current)
      );

      // 【系統B：ASR生音声の誤認識の自動学習 ＆ Aho-Corasick事前置換】
      // 1. Aho-Corasick多パターン置換（ミリ秒）: 学習済みの「ひろゆき」「白井君」等を即時復元
      const acResult = onAhoCorasickReplace ? onAhoCorasickReplace(rawFull) : { result: rawFull, replacedCount: 0 };
      const preReplaced = acResult.result;

      // 2. 医療音声解読エンジンで補正
      const decodedResult = decodeMedicalSpeech(preReplaced);
      const fullRecorded = cleanExtractedMedicalText(decodedResult.decodedText);

      // 3. ASR誤認識自己学習パイプラインへ非同期投入 (rawFull ➔ fullRecorded)
      if (onLearnAsrDiff && rawFull && fullRecorded && rawFull !== fullRecorded) {
        onLearnAsrDiff(rawFull, fullRecorded).catch((err) => {
          console.warn('[AutoLearn ASR] 学習エラー:', err);
        });
      }

      const totalCorrections = decodedResult.corrections.length + acResult.replacedCount;
      if (totalCorrections > 0) {
        const catLabels =
          decodedResult.detectedCategories.length > 0
            ? decodedResult.detectedCategories.join('・')
            : 'Aho-Corasick自己学習辞書';
        setSpeechSuccessNotice(
          `🩺 医療専門用語 ${totalCorrections}件 (${catLabels}) を自動解読・構造化しました`
        );
        setTimeout(() => setSpeechSuccessNotice(null), 3500);
      }

      if (fullRecorded) {
        setInputText((prev) => {
          const trimmed = cleanExtractedMedicalText(prev);
          if (!trimmed) {
            return `【主訴】${fullRecorded}\n【現病歴】\n【アセスメント】\n【プラン】`;
          }
          return cleanExtractedMedicalText(`${trimmed}\n${fullRecorded}`);
        });
      }

      if (interimFlushTimerRef.current !== null) {
        window.clearTimeout(interimFlushTimerRef.current);
        interimFlushTimerRef.current = null;
      }
      setInterimTranscript('');
      interimTranscriptRef.current = '';
      finalTranscriptRef.current = '';
      return;
    }

    // 録音開始
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'お使いのブラウザは音声認識 (Web Speech API) に対応していません。Google Chrome または Safari をご使用ください。'
      );
      return;
    }

    try {
      // 録音状態を先行してアクティブ化
      isRecordingRef.current = true;
      setIsRecording(true);
      startWaveformLoop();

      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isRecordingRef.current = true;
        setIsRecording(true);
      };

      recognition.onspeechstart = () => {
        isSpeakingRef.current = true;
      };

      recognition.onspeechend = () => {
        isSpeakingRef.current = false;
      };

      recognition.onresult = (event: any) => {
        isSpeakingRef.current = true;
        let interim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptChunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            currentFinal += transcriptChunk;
          } else {
            interim += transcriptChunk;
          }
        }

        if (currentFinal) {
          finalTranscriptRef.current = removeSpeechDuplications(
            mergeSpeechTranscripts(finalTranscriptRef.current, currentFinal)
          );
        }

        interimTranscriptRef.current = interim;
        // UI反映は約250ms間隔に間引く（スマホ発熱・CPU過負荷防止）
        if (interimFlushTimerRef.current === null) {
          interimFlushTimerRef.current = window.setTimeout(() => {
            interimFlushTimerRef.current = null;
            if (!isRecordingRef.current) return;
            setInterimTranscript(
              removeSpeechDuplications(
                mergeSpeechTranscripts(finalTranscriptRef.current, interimTranscriptRef.current)
              )
            );
          }, 250);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          isRecordingRef.current = false;
          setIsRecording(false);
          stopWaveformLoop();
          alert(
            'マイクへのアクセスが拒否されています。ブラウザのアドレスバーの鍵アイコンから「マイクの許可」を有効にしてください。'
          );
        } else if (event.error === 'no-speech') {
          // 無音検出は正常動作としてセッション維持
        } else if (event.error === 'aborted') {
          // 意図的中断
        }
      };

      recognition.onend = () => {
        if (!isRecordingRef.current) {
          setIsRecording(false);
          stopWaveformLoop();
          return;
        }

        const now = Date.now();
        const elapsed = now - lastRestartTimeRef.current;
        const delay = Math.max(300, 600 - elapsed);
        lastRestartTimeRef.current = now + delay;

        setTimeout(() => {
          if (isRecordingRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch (e) {
              console.debug('Speech recognition restart suppressed:', e);
            }
          }
        }, delay);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      console.error('Speech recognition initiation failed:', err);
      isRecordingRef.current = false;
      setIsRecording(false);
      stopWaveformLoop();
      alert(`音声認識の起動に失敗しました: ${err?.message || err}`);
    }
  }, [setInputText, startWaveformLoop, stopWaveformLoop, onAhoCorasickReplace, onLearnAsrDiff]);

  // アンマウント時に音声認識・波形ループ・間引きタイマーを解放
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (interimFlushTimerRef.current !== null) window.clearTimeout(interimFlushTimerRef.current);
      try {
        recognitionRef.current?.abort?.();
      } catch {}
    };
  }, []);

  // 録音中の医療用語ライブ解読
  const liveSpeechDecode = useMemo(
    () => (isRecording ? getDecodedSpeechTokens(interimTranscript) : null),
    [isRecording, interimTranscript]
  );

  return {
    isRecording,
    interimTranscript,
    liveSpeechDecode,
    speechSuccessNotice,
    setSpeechSuccessNotice,
    wavePath1Ref,
    wavePath2Ref,
    toggleSpeechRecognition,
  };
}
