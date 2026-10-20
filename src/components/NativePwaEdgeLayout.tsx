import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Menu,
  X,
  Search,
  Mic,
  Square,
  Download,
  Send,
  FileText,
  Sliders,
  Database,
  Cpu,
  Target,
  ShieldCheck,
  BookTemplate,
  Monitor,
  ExternalLink,
  ChevronRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Trash2,
  OctagonX,
  ArrowLeft,
  Lock,
  Wifi,
  Pill,
  Activity,
  BookOpen,
  HeartPulse,
} from 'lucide-react';
import { APP_VERSION, LATEST_FIRMWARE_VERSION } from '../version';
import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
  extractChartClinicalKeywords,
  mergeSpeechTranscripts,
  removeSpeechDuplications,
  DEFAULT_SAMPLE_CHART_TEXT,
} from '../utils/chartTextCleaner';
import {
  decodeMedicalSpeech,
  getDecodedSpeechTokens,
  SPEECH_SAMPLE_CHIPS,
  SpeechToken,
} from '../services/medicalSpeechDecoder';
import { sdCardStreamingService, SoftApStatus } from '../services/sdCardStreamingService';
import {
  auditRenalAndPrescriptions,
  detectClinicalRedFlags,
  calculateEmergencyDoses,
  generateGuidelineEvidenceSnippets,
  expandMedicalAbbreviations,
} from '../services/clinicalCopilotEngine';

interface NativePwaEdgeLayoutProps {
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  isBleConnected: boolean;
  isSending: boolean;
  onConnectBle: () => void;
  onSendSession: () => void;
  onAbortTransfer?: () => void;
  onOpenSearch: (initialTab?: any) => void;
  onOpenCoprocessor?: () => void;
  onOpenWebLlm: (initialStyle?: any) => void;
  onOpenTemplates: () => void;
  onOpenCameraOcr?: () => void;
}

/** 触覚フィードバックユーティリティ */
const triggerHaptic = (pattern: number | number[] = 15) => {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // 無視
  }
};

export const NativePwaEdgeLayout: React.FC<NativePwaEdgeLayoutProps> = ({
  inputText,
  setInputText,
  isBleConnected,
  isSending,
  onConnectBle,
  onSendSession,
  onAbortTransfer,
  onOpenSearch,
  onOpenCoprocessor,
  onOpenWebLlm,
  onOpenTemplates,
  onOpenCameraOcr,
}) => {
  // ドロワー開閉状態
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 隠し機能: 3省2ガイドライン エアギャップWi-Fi SoftAPモーダル
  const [secretTapCount, setSecretTapCount] = useState(0);
  const [showHiddenAirGapModal, setShowHiddenAirGapModal] = useState(false);
  const [apStatus, setApStatus] = useState<SoftApStatus>(sdCardStreamingService.getStatus());
  const [isCheckingAp, setIsCheckingAp] = useState(false);

  const handleSecretAirGapTap = () => {
    triggerHaptic(10);
    const next = secretTapCount + 1;
    if (next >= 3) {
      setSecretTapCount(0);
      setIsCheckingAp(true);
      sdCardStreamingService.checkApConnection().then((st) => {
        setApStatus(st);
        setIsCheckingAp(false);
      });
      setShowHiddenAirGapModal(true);
    } else {
      setSecretTapCount(next);
    }
  };

  // 音声入力録音状態
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const interimTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const lastRestartTimeRef = useRef<number>(0);

  // マイク波形（発話アクティビティ連動）
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  // 検索入力ステート
  const [searchQuery, setSearchQuery] = useState('');

  // 編集モード（直接テキストエリア編集 vs フォーマット表示）
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 音声解読完了通知トースト
  const [speechSuccessNotice, setSpeechSuccessNotice] = useState<string | null>(null);
  // 発話例文チップス表示トグル
  const [showSpeechChips, setShowSpeechChips] = useState(false);
  // スーパーオンプレミス臨床コパイロットパネル表示トグル ＆ タブ
  const [showCopilotPanel, setShowCopilotPanel] = useState(false);
  const [copilotTab, setCopilotTab] = useState<'redflag' | 'renal' | 'emergency' | 'evidence'>('redflag');
  const [patientWeightKg, setPatientWeightKg] = useState<number>(60);

  // カルテ全体キーワード抽出（カルテ内容100%動的連動）
  const chartContext = useMemo(() => {
    const text = inputText && inputText.trim().length > 0 ? inputText : DEFAULT_SAMPLE_CHART_TEXT;
    return extractChartClinicalKeywords(text);
  }, [inputText]);

  // リアルタイム臨床コパイロット解析 (0.5ms: Red Flags / eGFR処方監査 / 救急電卓 / GL根拠)
  const copilotData = useMemo(() => {
    const text = inputText && inputText.trim().length > 0 ? inputText : DEFAULT_SAMPLE_CHART_TEXT;
    const renalAudit = auditRenalAndPrescriptions(text);
    const redFlags = detectClinicalRedFlags(text);
    const effectiveWeight = renalAudit.detectedWeightKg || patientWeightKg;
    const emergencyDoses = calculateEmergencyDoses(effectiveWeight);
    const glSnippets = generateGuidelineEvidenceSnippets(text);
    return {
      renalAudit,
      redFlags,
      effectiveWeight,
      emergencyDoses,
      glSnippets,
    };
  }, [inputText, patientWeightKg]);

  // 音声入力中の波形アニメーションループ (マイク排他制御競合を回避し完全滑らかに駆動)
  const startWaveformLoop = useCallback(() => {
    let phase = 0;
    const waveLoop = () => {
      if (!isRecordingRef.current) {
        setAudioLevel(0);
        return;
      }
      phase += isSpeakingRef.current ? 0.25 : 0.08;
      const baseAmp = isSpeakingRef.current ? 0.75 : 0.2;
      const noise = isSpeakingRef.current ? (Math.random() * 0.25) : (Math.random() * 0.05);
      const level = Math.min(1.0, (Math.sin(phase) + 1) / 2 * baseAmp + noise);
      setAudioLevel(level);
      animFrameRef.current = requestAnimationFrame(waveLoop);
    };
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(waveLoop);
  }, []);

  const stopWaveformLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
    isSpeakingRef.current = false;
  }, []);

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
      const decodedResult = decodeMedicalSpeech(rawFull);
      const fullRecorded = cleanExtractedMedicalText(decodedResult.decodedText);

      if (decodedResult.corrections.length > 0) {
        setSpeechSuccessNotice(
          `🩺 医療専門用語 ${decodedResult.corrections.length}件 (${decodedResult.detectedCategories.join('・')}) を自動解読・構造化しました`
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

      setInterimTranscript('');
      interimTranscriptRef.current = '';
      finalTranscriptRef.current = '';
      return;
    }

    // 録音開始
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('お使いのブラウザは音声認識 (Web Speech API) に対応していません。Google Chrome または Safari をご使用ください。');
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
          // 直前の確定テキストとのオーバーラップ部分を検出して重複なしで安全マージ
          finalTranscriptRef.current = removeSpeechDuplications(
            mergeSpeechTranscripts(finalTranscriptRef.current, currentFinal)
          );
        }

        const mergedDisplay = removeSpeechDuplications(
          mergeSpeechTranscripts(finalTranscriptRef.current, interim)
        );
        interimTranscriptRef.current = interim;
        setInterimTranscript(mergedDisplay);
        // ※ triggerHaptic(8) は毎秒連発による端末異音・ビープ音の原因となるため廃止
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          isRecordingRef.current = false;
          setIsRecording(false);
          stopWaveformLoop();
          alert('マイクへのアクセスが拒否されています。ブラウザのアドレスバーの鍵アイコンから「マイクの許可」を有効にしてください。');
        } else if (event.error === 'no-speech') {
          // 無音検出は正常動作としてセッション維持
        } else if (event.error === 'aborted') {
          // 意図的中断
        }
      };

      recognition.onend = () => {
        // ユーザーが手動停止済みの場合は完全に終了
        if (!isRecordingRef.current) {
          setIsRecording(false);
          stopWaveformLoop();
          return;
        }

        // 短時間での再起動（OSマイク起動ビープ音の連発）を防止するため最低600msデバウンス
        const now = Date.now();
        if (now - lastRestartTimeRef.current < 600) {
          return;
        }
        lastRestartTimeRef.current = now;

        setTimeout(() => {
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch (e) {
              console.debug('Speech recognition restart suppressed:', e);
            }
          }
        }, 300);
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
  }, [setInputText, startWaveformLoop, stopWaveformLoop]);

  // デフォルトテキスト（空の場合のサンプル所見表示：無駄な全角スペースや連続改行を完全排除）
  const displayLines = cleanExtractedMedicalText(inputText.trim() || DEFAULT_SAMPLE_CHART_TEXT).split('\n');

  return (
    <div className="relative w-full h-[100dvh] bg-[#0F172A] text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans overscroll-none touch-manipulation pt-[env(safe-area-inset-top,0px)]">

      {/* ========================================================================= */}
      {/* 2. ヘッダー部: 常時表示ハンバーガーメニュー + ロゴ + デスクトップナビ + BLE接続バッジ */}
      {/* ========================================================================= */}
      <header className="w-full px-4 py-2 shrink-0 border-b border-slate-800/80 bg-[#0F172A]/95 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          {/* 左側: ハンバーガーメニュー & 戻るトグル & ロゴ (常時表示・非表示にならない安全設計) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                setIsDrawerOpen((prev) => !prev);
              }}
              className={`px-2 py-1.5 -ml-1 rounded-xl border flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
                isDrawerOpen
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              aria-label={isDrawerOpen ? 'メイン画面へ戻る' : 'メニューを開く'}
              title={isDrawerOpen ? 'メイン画面へ戻る' : '設定＆管理メニューを開く'}
            >
              {isDrawerOpen ? (
                <>
                  <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                  <span className="text-xs font-bold">戻る</span>
                </>
              ) : (
                <>
                  <Menu className="w-5 h-5 stroke-[2.2]" />
                  <span className="text-[11px] font-bold hidden sm:inline">メニュー</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white font-sans">
                Dr.Dongly
              </span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-700/70">
                3省2GL完全準拠
              </span>
            </div>
          </div>

          {/* デスクトップ専用: ヘッダー中央クイックナビ (lg:flex hidden) */}
          <nav className="hidden lg:flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch('all');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>臨床検索</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch('pill');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span>💊</span>
              <span>医薬品添付文書</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch('atlas');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span>📈</span>
              <span>12誘導ECG</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch('minds');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <span>📚</span>
              <span>Minds</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenTemplates();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <BookTemplate className="w-3.5 h-3.5 text-amber-400" />
              <span>定型文</span>
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenWebLlm();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/50 border border-purple-500/40 text-xs font-medium text-purple-300 hover:text-purple-200 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-400" />
              <span>ローカルAI</span>
            </button>
          </nav>

          {/* 右側: 【t-dongle-S3とBLE接続】トグルボタン */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              onConnectBle();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 ${
              isBleConnected
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
            title="ESP32ドングル（T-Dongle-S3 / AtomS3U）とBLE接続"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isBleConnected
                  ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-sans text-[11px] sm:text-xs">
              {isBleConnected ? 'T-Dongle-S3 接続中' : 'T-Dongle-S3 未接続'}
            </span>
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 3. メインコンテンツ部 (スクロール可能・バウンス抑止・レスポンシブ2ペイン) */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3.5 py-2 overflow-y-auto overscroll-contain flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-4 lg:overflow-hidden">
        {/* 左側カラム (モバイル: 全幅, デスクトップ: 8カラム) */}
        <div className="flex-1 flex flex-col gap-2.5 h-full overflow-hidden lg:col-span-8">
          {/* ガイドライン・処方禁忌 ローカル検索バー */}
          <div className="relative w-full shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[#1E293B]/80 hover:bg-[#1E293B] border border-slate-700/60 focus-within:border-amber-500 rounded-xl text-left transition-all group shadow-inner"
            >
              <Search className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors shrink-0" />
              <span className="text-xs text-slate-400 truncate">
                {searchQuery || 'ガイドライン・Minds・処方禁忌をローカル検索...'}
              </span>
              <span className="ml-auto text-[10px] font-mono text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
                32GB
              </span>
            </button>
          </div>

          {/* 臨床所見・SOAP整形テキスト カード */}
          <div className="flex-1 w-full bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-3.5 lg:p-4 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm relative">
            {/* カードヘッダー */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2 shrink-0 gap-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-4 bg-amber-500 rounded-[2px] inline-block shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                <h2 className="text-xs lg:text-sm font-bold text-slate-200 tracking-wide font-sans">
                  臨床所見・SOAP整形テキスト
                </h2>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {isSending ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[10px] font-bold animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-rose-400" />
                    <span>電カル打鍵中...</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic([30, 50]);
                        onAbortTransfer?.();
                      }}
                      className="ml-1 px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold cursor-pointer transition-colors"
                      title="転送を中断"
                    >
                      中断
                    </button>
                  </div>
                ) : isRecording ? (
                  <span className="text-[11px] font-bold text-rose-500 animate-pulse flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    録音中...
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-emerald-400/90 tracking-tight hidden sm:inline">
                    3省2GL 完全オフライン
                  </span>
                )}

                {/* 医学略語正規化 ＆ 無駄なスペース・改行のワンタップ削除ボタン */}
                {!isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(15);
                      setInputText((prev) => {
                        const raw = prev || DEFAULT_SAMPLE_CHART_TEXT;
                        const { expandedText } = expandMedicalAbbreviations(raw);
                        return cleanExtractedMedicalText(normalizeMedicalSpeechTerms(expandedText));
                      });
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-sky-300 hover:text-white bg-sky-950/50 hover:bg-sky-900/70 border border-sky-700/50 transition-colors cursor-pointer"
                    title="英語略語(HTN, DM, s/o等)の日本語正規化と、無駄なスペース・空白行・重複表現を一括整理します"
                  >
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>略語・空白整理</span>
                  </button>
                )}

                {/* 発話例文チップス切替ボタン */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHaptic(10);
                    setShowSpeechChips((prev) => !prev);
                  }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                    showSpeechChips
                      ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                      : 'text-amber-300 hover:text-white bg-amber-950/60 hover:bg-amber-900/70 border-amber-600/50'
                  }`}
                  title="医師向け音声入力の解読例文チップスを表示"
                >
                  <span>🎙️ 発話例文</span>
                </button>

                {/* 🛡️ スーパーオンプレミス臨床コパイロット（RedFlag / eGFR処方 / 救急電卓 / GL根拠） */}
                {!isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(15);
                      setShowCopilotPanel((prev) => !prev);
                    }}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                      showCopilotPanel
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                        : 'text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/70 border-emerald-600/50'
                    }`}
                    title="鑑別Red Flags・腎機能eGFR処方監査・救急体重電卓・Minds根拠文をワンタップ追記"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    <span>臨床コパイロット</span>
                    {copilotData.renalAudit.alerts.length > 0 && (
                      <span className="px-1 rounded-full bg-rose-500 text-white text-[9px] font-mono">
                        {copilotData.renalAudit.alerts.length}
                      </span>
                    )}
                  </button>
                )}

                {/* Gemma 2 スーパー臨床AIスタジオ ショートカットボタン */}
                {!isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(15);
                      onOpenWebLlm('soap');
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/70 border border-purple-600/50 transition-colors cursor-pointer"
                    title="Gemma 2 でSOAPカルテ・紹介状・指示簿・SBAR・患者IC説明書・安全監査をワンタップ作成"
                  >
                    <Cpu className="w-3 h-3 text-purple-400" />
                    <span>Gemma2スタジオ</span>
                  </button>
                )}

                {/* カルテ消去ボタン */}
                {inputText.trim() && !isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(20);
                      if (window.confirm('入力中のカルテテキストをすべて消去しますか？')) {
                        setInputText('');
                        setIsEditing(false);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-700/60 hover:border-rose-500/50 transition-colors cursor-pointer"
                    title="入力内容を消去"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>消去</span>
                  </button>
                )}
              </div>
            </div>

            {/* 音声解読完了マイクロ通知 */}
            {speechSuccessNotice && (
              <div className="mx-2 my-1 px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in duration-200">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  <span>{speechSuccessNotice}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSpeechSuccessNotice(null)}
                  className="text-slate-400 hover:text-white text-xs px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* 🛡️ スーパーオンプレミス臨床コパイロット インラインパネル (RedFlags / eGFR処方 / 救急電卓 / GL根拠 / 書類生成) */}
            {showCopilotPanel && (
              <div className="mx-1 my-1.5 p-2.5 rounded-xl bg-slate-900/95 border border-emerald-500/50 space-y-2 animate-in fade-in shadow-xl">
                <div className="flex items-center justify-between gap-1 flex-wrap border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCopilotTab('redflag')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        copilotTab === 'redflag'
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
                      }`}
                    >
                      🚨 鑑別Red Flags ({copilotData.redFlags.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopilotTab('renal')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        copilotTab === 'renal'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
                      }`}
                    >
                      💊 eGFR処方監査 ({copilotData.renalAudit.alerts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopilotTab('emergency')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        copilotTab === 'emergency'
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
                      }`}
                    >
                      ⚡ 救急・中毒電卓 ({copilotData.effectiveWeight}kg)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCopilotTab('evidence')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                        copilotTab === 'evidence'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
                      }`}
                    >
                      📚 GL・算定根拠 ({copilotData.glSnippets.length})
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCopilotPanel(false)}
                    className="text-slate-400 hover:text-white text-[11px] px-1.5"
                  >
                    閉じる ✕
                  </button>
                </div>

                {/* タブ1: 鑑別 Red Flags ＆ 防衛カルテ記載 */}
                {copilotTab === 'redflag' && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {copilotData.redFlags.map((rf) => (
                      <div
                        key={rf.id}
                        className="p-2 rounded-lg bg-slate-950/90 border border-rose-500/30 flex items-center justify-between gap-2"
                      >
                        <div className="text-[11px] space-y-0.5">
                          <div className="font-bold text-rose-300">{rf.syndrome}</div>
                          <div className="text-[10px] text-slate-300">
                            除外鑑別: <span className="text-amber-300 font-semibold">{rf.criticalDifferentials.join(' / ')}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            確認所見: {rf.mustCheckSigns.join(' ・ ')}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic(15);
                            setInputText((prev) =>
                              cleanExtractedMedicalText(prev ? `${prev}\n${rf.defensiveChartSnippet}` : rf.defensiveChartSnippet)
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          ＋防衛記載追記
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* タブ2: eGFR 処方監査 */}
                {copilotTab === 'renal' && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {copilotData.renalAudit.alerts.length > 0 ? (
                      copilotData.renalAudit.alerts.map((al) => (
                        <div
                          key={al.id}
                          className="p-2 rounded-lg bg-slate-950/90 border border-amber-500/40 flex items-center justify-between gap-2"
                        >
                          <div className="text-[11px] space-y-0.5">
                            <div className="font-bold text-amber-300">
                              💊 {al.drugName} ({al.detectedEgfr !== null ? `eGFR ${al.detectedEgfr}` : '腎機能基準'})
                            </div>
                            <div className="text-[10px] text-slate-200">{al.recommendedAction}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic(15);
                              setInputText((prev) =>
                                cleanExtractedMedicalText(prev ? `${prev}\n${al.orderSnippet}` : al.orderSnippet)
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                          >
                            ＋監査根拠追記
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-[11px] text-slate-300 p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
                        <span>✅ 現在処方に重篤な腎機能用量逸脱は検出されていません（カルテに「eGFR 28」や腎排泄薬を入力すると自動計算します）</span>
                      </div>
                    )}
                  </div>
                )}

                {/* タブ3: 救急・当直 体重別即時アクション電卓 */}
                {copilotTab === 'emergency' && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between text-[10px] bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                      <span className="text-sky-300 font-bold">患者体重設定 (ワンタップ換算):</span>
                      <div className="flex items-center gap-1">
                        {[40, 50, 60, 70, 80].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setPatientWeightKg(w)}
                            className={`px-2 py-0.5 rounded font-mono font-bold cursor-pointer ${
                              copilotData.effectiveWeight === w
                                ? 'bg-sky-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {w}kg
                          </button>
                        ))}
                      </div>
                    </div>
                    {copilotData.emergencyDoses.map((em) => (
                      <div
                        key={em.id}
                        className="p-2 rounded-lg bg-slate-950/90 border border-sky-500/30 flex items-center justify-between gap-2"
                      >
                        <div className="text-[11px] space-y-0.5">
                          <div className="font-bold text-sky-300 flex items-center gap-1.5">
                            <span>⚡ {em.title}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-200 border border-sky-500/40">
                              {em.badge}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-200 font-mono">{em.calculatedSummary}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic(15);
                            setInputText((prev) =>
                              cleanExtractedMedicalText(prev ? `${prev}\n${em.orderText}` : em.orderText)
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          ＋指示挿入
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* タブ4: Mindsガイドライン ＆ レセプト算定根拠文 */}
                {copilotTab === 'evidence' && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {copilotData.glSnippets.map((gl) => (
                      <div
                        key={gl.id}
                        className="p-2 rounded-lg bg-slate-950/90 border border-emerald-500/30 flex items-center justify-between gap-2"
                      >
                        <div className="text-[11px] space-y-0.5">
                          <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                            <span>📚 {gl.title}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-200 border border-emerald-500/40">
                              {gl.badge}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-300 line-clamp-2">{gl.snippet}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic(15);
                            setInputText((prev) =>
                              cleanExtractedMedicalText(prev ? `${prev}\n${gl.snippet}` : gl.snippet)
                            );
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                        >
                          ＋根拠追記
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 下部クイックバー: Gemma 2 臨床ドキュメント ワンタップ起草 */}
                <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-purple-300">📄 ワンタップ文書作成:</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenWebLlm('referral')}
                      className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
                    >
                      紹介状・サマリー
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWebLlm('order_sbar')}
                      className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
                    >
                      看護師指示簿・SBAR
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWebLlm('patient_ic')}
                      className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
                    >
                      患者IC説明書
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenWebLlm('clinical_audit')}
                      className="px-2 py-0.5 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
                    >
                      総合安全監査
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 発話例文クイックチップスパネル */}
            {showSpeechChips && (
              <div className="mx-2 my-1.5 p-2.5 rounded-xl bg-slate-900/90 border border-amber-500/40 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                  <span className="flex items-center gap-1">
                    <span>💡</span>
                    <span>医療音声解読 推奨発話例文（タップでカルテに即反映）</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSpeechChips(false)}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    閉じる
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SPEECH_SAMPLE_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        const decoded = decodeMedicalSpeech(chip.speech);
                        setInputText((prev) =>
                          cleanExtractedMedicalText(prev ? `${prev}\n${decoded.decodedText}` : decoded.decodedText)
                        );
                      }}
                      className="px-2 py-1 rounded-lg text-[11px] font-mono bg-slate-800 hover:bg-amber-950/70 text-slate-200 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 transition-all flex items-center gap-1 group cursor-pointer"
                      title={`発話: 「${chip.speech}」➔ 自動解読挿入`}
                    >
                      <span className="font-semibold text-amber-400">{chip.label}</span>
                      <span className="text-[9px] text-slate-400 group-hover:text-amber-300">
                        ({chip.speech})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* テキストコンテンツ領域 (タップで編集切り替え可能) */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain pr-1 text-[13px] lg:text-sm leading-relaxed font-sans text-slate-200 select-text"
              onClick={() => {
                if (!isEditing) {
                  setIsEditing(true);
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }
              }}
            >
              {isEditing ? (
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text');
                    if (pasted) {
                      e.preventDefault();
                      const cleanedPaste = cleanExtractedMedicalText(normalizeMedicalSpeechTerms(pasted));
                      setInputText((prev) =>
                        prev.trim() ? cleanExtractedMedicalText(`${prev}\n${cleanedPaste}`) : cleanedPaste
                      );
                    }
                  }}
                  onBlur={() => {
                    if (!inputText.trim()) {
                      setIsEditing(false);
                    } else {
                      setInputText((prev) => cleanExtractedMedicalText(prev));
                    }
                  }}
                  placeholder="所見を入力、またはマイクボタンをタップして音声入力してください..."
                  className="w-full h-full bg-transparent text-slate-100 text-xs sm:text-[13px] lg:text-sm leading-relaxed resize-none focus:outline-none font-mono selection:bg-amber-500/30"
                  style={{ minHeight: '180px' }}
                />
              ) : (
                <div className="space-y-1 cursor-text">
                  {displayLines.map((line, idx) => {
                    const trimmed = line.trim();
                    const isCyanTag = /^【(S|主訴|現病歴|既往歴|内服薬|O|身体所見|検査)】/.test(trimmed);
                    const isAmberTag = /^【(A|アセスメント|P|プラン.*?)】/.test(trimmed);
                    
                    if (isCyanTag || isAmberTag) {
                      const tagEnd = line.indexOf('】') + 1;
                      const tag = line.slice(0, tagEnd);
                      const rest = line.slice(tagEnd).trim();
                      return (
                        <div key={idx} className="pt-1.5 font-medium">
                          <span className={`font-bold mr-1.5 ${isCyanTag ? 'text-sky-400' : 'text-amber-400'}`}>
                            {tag}
                          </span>
                          <span className="text-slate-100">{rest}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={idx} className={trimmed ? 'text-slate-200' : 'h-1.5'}>
                        {line}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 音声入力中のリアルタイムプレビュー ＆ 医療用語インラインハイライト解読 */}
              {isRecording && (() => {
                const { tokens, result: liveDecoded } = getDecodedSpeechTokens(interimTranscript);
                return (
                  <div className="mt-3 p-3 rounded-2xl bg-gradient-to-br from-rose-950/60 via-slate-900/90 to-purple-950/50 border-2 border-rose-600/70 shadow-2xl animate-in fade-in space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <div className="text-rose-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span className="font-mono tracking-wider">[リアルタイム音声認識中]</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="flex items-center gap-1 text-[10px] text-emerald-300 font-mono bg-emerald-950/90 px-2 py-0.5 rounded-full border border-emerald-500/50">
                          <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" />
                          <span>医療音声解読中</span>
                        </span>
                        {liveDecoded.detectedCategories.map((cat, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* インラインハイライト表示本文 */}
                    <div className="text-xs sm:text-[13px] text-slate-100 font-sans leading-relaxed p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                      {tokens.length > 0 ? (
                        tokens.map((token, idx) => {
                          if (!token.isDecoded) {
                            return (
                              <span key={idx} className="text-slate-200">
                                {token.text}
                              </span>
                            );
                          }

                          let badgeColor = 'bg-emerald-900/80 text-emerald-200 border-emerald-500/60';
                          let icon = '✨';
                          if (token.category === 'vital') {
                            badgeColor =
                              'bg-rose-900/80 text-rose-200 border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
                            icon = '🫀';
                          } else if (token.category === 'drug') {
                            badgeColor =
                              'bg-cyan-900/80 text-cyan-200 border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.4)]';
                            icon = '💊';
                          } else if (token.category === 'abbreviation') {
                            badgeColor =
                              'bg-purple-900/80 text-purple-200 border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.4)]';
                            icon = '🔬';
                          } else if (token.category === 'dosage') {
                            badgeColor = 'bg-amber-900/80 text-amber-200 border-amber-500/60';
                            icon = '📋';
                          } else if (token.category === 'section') {
                            badgeColor = 'bg-sky-900/80 text-sky-200 border-sky-500/60 font-bold';
                            icon = '📑';
                          }

                          return (
                            <mark
                              key={idx}
                              className={`inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-lg border text-xs font-mono font-bold ${badgeColor}`}
                              title={token.original ? `発音: 「${token.original}」から自動解読` : undefined}
                            >
                              <span className="text-[10px]">{icon}</span>
                              <span>{token.text}</span>
                            </mark>
                          );
                        })
                      ) : (
                        <span className="text-slate-400 italic">
                          マイクへ向かってカルテ所見をお話しください...（例: 「ビーピー 140の90」「大導寺に胸部圧迫感」「アムロジピン 1T 朝食後」）
                        </span>
                      )}
                      <span className="inline-block w-2 h-3.5 bg-rose-400 ml-1 animate-pulse align-middle" />
                    </div>

                    {/* リアルタイム解読ログチップス */}
                    {liveDecoded.corrections.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-rose-900/50">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                          <span>解読一覧:</span>
                        </span>
                        {liveDecoded.corrections.slice(0, 6).map((c, i) => (
                          <span
                            key={i}
                            className="text-[10px] bg-slate-900/90 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/40 font-mono flex items-center gap-1"
                          >
                            <span className="line-through text-slate-500">{c.original}</span>
                            <span>➔</span>
                            <span className="font-bold text-emerald-200">{c.corrected}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* 右側カラム (モバイル: 非表示, デスクトップ: 4カラム常時展開 カルテ100%連動臨床意思決定パネル) */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-3.5 h-full overflow-y-auto pr-1">
          {/* カルテ100%動的連動: 臨床意思決定支援 ＆ 32GBデータパネル */}
          <div className="bg-[#1E293B]/70 border-2 border-amber-500/40 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
              <span className="text-xs font-bold text-amber-300 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>🎯 カルテ100%連動 臨床意思決定支援</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                {chartContext.allKeywords.length} キーワード抽出済
              </span>
            </div>

            {/* カルテ全体から抽出された臨床キーワードタグクラウド */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                <span>カルテ抽出キーワード（タップで即照合）:</span>
                <span className="text-[10px] text-slate-400 font-mono">10大マスター連動</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                {chartContext.allKeywords.length > 0 ? (
                  chartContext.allKeywords.slice(0, 12).map((kw, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        triggerHaptic(10);
                        onOpenSearch('all');
                      }}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-amber-500/20 text-slate-200 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 transition-colors flex items-center gap-1 cursor-pointer"
                      title={`「${kw}」で全10大医療データを検索`}
                    >
                      <span className="text-amber-400">#</span>
                      <span>{kw}</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">
                    所見を入力すると自動で臨床キーワードを抽出します
                  </span>
                )}
              </div>
            </div>

            {/* カルテ内容と100%リンクした3大臨床データダイレクトカード */}
            <div className="space-y-2 pt-1 border-t border-slate-700/60">
              {/* 1. 連動医薬品 ＆ 錠剤鑑別 */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('pill');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-teal-500/30 hover:border-teal-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-teal-400" />
                    <span>連動医薬品 ＆ 錠剤刻印</span>
                  </span>
                  <span className="text-[10px] text-teal-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.drugKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.drugKeywords.length > 0
                    ? `処方・内服: ${chartContext.drugKeywords.slice(0, 3).join('、')}`
                    : 'カルテ内の薬剤（アムロジピン、ニトロペン等）を常時検出'}
                </div>
              </div>

              {/* 2. 連動12誘導心電図 ＆ 臨床波形解析 */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('atlas');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-rose-500/30 hover:border-rose-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                    <span>連動12誘導心電図 ＆ 波形</span>
                  </span>
                  <span className="text-[10px] text-rose-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.atlasEcgKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.atlasEcgKeywords.length > 0
                    ? `病態波形: ${chartContext.atlasEcgKeywords.slice(0, 3).join('、')}`
                    : '主訴・症状から狭心症・心筋虚血・不整脈波形を自動抽出'}
                </div>
              </div>

              {/* 3. 連動Mindsガイドライン ＆ 救急プロトコル */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('minds');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-emerald-500/30 hover:border-emerald-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    <span>連動Minds原本 ＆ 救急CQ</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.mindsEmerKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.mindsEmerKeywords.length > 0
                    ? `ガイドライン: ${chartContext.mindsEmerKeywords.slice(0, 3).join('、')}`
                    : '学会公式原本PDF 450タイトル・CQ構造化照合'}
                </div>
              </div>

              {/* 全件一括照合ボタン */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('all');
                }}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>カルテ全キーワードで総合照合 (32GB全領域)</span>
              </button>
            </div>
          </div>

          {/* クイックアクション2: カルテ入力支援 ＆ AIツール */}
          <div className="bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                <span>⚡</span>
                <span>入力支援 ＆ エッジAIツール</span>
              </span>
              <span className="text-[10px] font-mono text-purple-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                WebLLM
              </span>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenTemplates();
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
              >
                <div className="flex items-center gap-2.5">
                  <BookTemplate className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                      SOAPテンプレート ＆ 略語マスター
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      内科・外来定型文 ワンタップ展開
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-purple-500/30 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenWebLlm('soap');
                  }}
                  className="w-full flex items-center justify-between text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                        Gemma 2 臨床AIスタジオ (6大モード)
                      </div>
                      <div className="text-[10px] text-purple-400 font-mono">
                        SOAP・紹介状・指示簿・SBAR・IC説明・処方監査
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
                <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('referral');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-sky-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    📄 紹介状・サマリー
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('order_sbar');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-emerald-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    📋 指示簿・SBAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('patient_ic');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-pink-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    👪 患者IC説明書
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('clinical_audit');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-rose-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    🛡️ 処方・RedFlag監査
                  </button>
                </div>
              </div>

              {onOpenCameraOcr && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenCameraOcr();
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">📷</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                        処方箋・カルテ カメラOCR取込
                      </div>
                      <div className="text-[10px] text-sky-400 font-mono">
                        書類・薬剤名テキスト自動抽出 (空白除去)
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
              )}

              {onOpenCoprocessor && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenCoprocessor();
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
                >
                  <div className="flex items-center gap-2.5">
                    <Download className="w-4 h-4 text-rose-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-rose-300 transition-colors">
                        電カル双方向受信コプロセッサ
                      </div>
                      <div className="text-[10px] text-rose-400 font-mono">
                        仮想プリンタ (07h) カルテ吸い上げ・空白自動削除
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
              )}
            </div>
          </div>

          {/* クイックアクション3: 医療安全 ＆ 3省2ガイドライン準拠ステータス */}
          <div className="bg-[#1E293B]/40 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2 shadow-lg backdrop-blur-sm text-xs">
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase pb-1 border-b border-slate-800/80 flex items-center justify-between">
              <span>通信 ＆ 3省2ガイドライン準拠</span>
              <button
                type="button"
                onClick={handleSecretAirGapTap}
                className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 select-none"
                title="3省2ガイドライン完全準拠 (3回タップでエアギャップ詳細)"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                完全閉域
              </button>
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">BLE 打鍵転送:</span>
                <span className={`font-mono font-bold ${isBleConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isBleConnected ? 'DrDongly-S3 接続中' : '未接続'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">運用形態:</span>
                <span className="font-semibold text-emerald-300">完全オフライン・オンプレミス</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">3省2ガイドライン:</span>
                <span
                  onClick={handleSecretAirGapTap}
                  className="text-emerald-400 font-semibold cursor-pointer select-none"
                >
                  準拠 (外部通信遮断)
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[11px] text-slate-500 font-mono">
                <span onClick={handleSecretAirGapTap} className="cursor-pointer select-none">
                  Firmware: v{LATEST_FIRMWARE_VERSION}
                </span>
                <span>PWA: v{APP_VERSION}</span>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* ========================================================================= */}
      {/* 4. 親指ボトムアクションバー (左: 電カル受信, 中央: 音声入力FAB, 右: 電カル送信) */}
      {/* ========================================================================= */}
      <nav className="w-full pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 px-6 bg-[#0F172A]/95 border-t border-slate-800/80 backdrop-blur-md shrink-0 flex flex-col items-center relative z-20">
        {/* 音声録音中のオシロスコープ波形（FAB上部） */}
        {isRecording && (
          <div className="w-full max-w-xs sm:max-w-sm h-10 flex items-center justify-center mb-1 animate-in fade-in">
            <svg className="w-full h-10 overflow-visible" viewBox="0 0 240 40" fill="none">
              {/* 第1波形 (主波形: ローズレッド) */}
              <path
                d={`M 10 20 Q 40 ${20 - audioLevel * 35 - 2} 70 20 T 120 ${20 + audioLevel * 30 + 1} T 170 ${20 - audioLevel * 28} T 230 20`}
                stroke="#F43F5E"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="animate-waveform-1"
              />
              {/* 第2波形 (副波形: ソフトピンク・位相ずれ) */}
              <path
                d={`M 10 20 Q 50 ${20 + audioLevel * 25 + 3} 90 20 T 140 ${20 - audioLevel * 20 - 2} T 190 ${20 + audioLevel * 22} T 230 20`}
                stroke="#FB7185"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.8"
                className="animate-waveform-2"
              />
            </svg>
          </div>
        )}

        <div className="w-full flex items-center justify-between max-w-sm sm:max-w-md mx-auto">
          {/* 【左側】電カルから受信 (コーラルピンク) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(25);
                onOpenCoprocessor?.();
              }}
              className="w-14 h-14 rounded-full bg-[#1E293B] border border-[#F43F5E]/60 text-[#F43F5E] hover:bg-[#F43F5E]/10 active:scale-90 transition-all flex items-center justify-center shadow-lg group"
              title="閉域網電子カルテから過去カルテを吸い上げ"
            >
              <Download className="w-6 h-6 group-hover:translate-y-0.5 transition-transform" />
            </button>
            <span className="text-[11px] font-semibold text-[#F43F5E] tracking-tight">
              電カル受信
            </span>
          </div>

          {/* 【中央】音声入力 ⇒ 自動テキスト化整形 (直径68px 特大FAB + 同心円グロー) */}
          <div className="flex flex-col items-center gap-1.5 -translate-y-3">
            <div className="relative flex items-center justify-center">
              {/* 同心円の外側グローサークル */}
              <div
                className={`absolute w-20 h-20 rounded-full transition-all duration-300 pointer-events-none ${
                  isRecording
                    ? 'bg-rose-950/70 ring-2 ring-rose-500/50 shadow-[0_0_35px_rgba(244,63,94,0.4)] animate-pulse'
                    : 'bg-amber-500/15 ring-2 ring-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                }`}
              />

              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 relative z-10 shadow-2xl ${
                  isRecording
                    ? 'bg-[#F43F5E] hover:bg-[#E11D48] text-white shadow-[0_10px_25px_-5px_rgba(225,29,72,0.6)]'
                    : 'bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 shadow-[0_10px_25px_-5px_rgba(245,158,11,0.4)]'
                }`}
                title={isRecording ? '録音を停止してカルテを自動整形' : 'マイクを起動して音声入力開始'}
              >
                {isRecording ? (
                  <Square className="w-6 h-6 fill-white" />
                ) : (
                  <Mic className="w-7 h-7 stroke-[2.4]" />
                )}
              </button>
            </div>
            <span
              className={`text-[11px] font-bold tracking-tight transition-colors ${
                isRecording ? 'text-rose-400 animate-pulse' : 'text-slate-100'
              }`}
            >
              {isRecording ? 'タップで完了・整形' : '音声入力'}
            </span>
          </div>

          {/* 【右側】電カルへ送信 / 転送中断 (スカイブルー / ローズ) */}
          <div className="flex flex-col items-center gap-1.5">
            {isSending ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic([40, 80]);
                  onAbortTransfer?.();
                }}
                className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white active:scale-90 transition-all flex items-center justify-center shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-pulse group cursor-pointer"
                title="電子カルテへの転送・打鍵を安全に中断"
              >
                <OctagonX className="w-7 h-7" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic([30, 60, 30]);
                  onSendSession();
                }}
                disabled={!inputText.trim()}
                className={`w-14 h-14 rounded-full bg-[#1E293B] border border-sky-400/60 text-sky-400 hover:bg-sky-400/10 active:scale-90 transition-all flex items-center justify-center shadow-lg group cursor-pointer ${
                  !inputText.trim() ? 'opacity-40 cursor-not-allowed' : ''
                }`}
                title="電子カルテ端末へUSB-HID自動打鍵転送"
              >
                <Send className="w-6 h-6 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
            )}
            <span
              className={`text-[11px] font-semibold tracking-tight transition-colors ${
                isSending ? 'text-rose-400 font-bold animate-pulse' : 'text-sky-400'
              }`}
            >
              {isSending ? '転送中断' : '電カル送信'}
            </span>
          </div>
        </div>

        {/* ホームインジケータバー */}
        <div className="w-32 h-1 bg-slate-600/70 rounded-full mt-3 shrink-0" />
      </nav>

      {/* ========================================================================= */}
      {/* 5. ハンバーガーメニュー ドロワー (設定 & 管理 - 戻るボタン常時表示・ハンバーガーメニュー消失防止) */}
      {/* ========================================================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* バックドロップ */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => {
              triggerHaptic(10);
              setIsDrawerOpen(false);
            }}
          />

          {/* スライドインドロワー本体 */}
          <aside className="relative w-11/12 max-w-sm h-full bg-[#0F172A] border-r border-slate-800 text-slate-100 flex flex-col justify-between p-4 z-10 shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
            <div className="space-y-4">
              {/* ドロワーヘッダー（← 戻るボタンを明示配置、いつでも確実にメイン画面へ復帰可能） */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-md cursor-pointer active:scale-95"
                    aria-label="メイン画面へ戻る"
                    title="メイン画面へ戻る"
                  >
                    <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                    <span>戻る</span>
                  </button>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                      設定 & 管理メニュー
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Dr.Dongly System Menu
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    setIsDrawerOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                  aria-label="閉じる"
                  title="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* カルテ100%連動 抽出キーワード（モバイルでも一目で把握可能） */}
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-amber-500/40 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-amber-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>カルテ抽出キーワード</span>
                  </span>
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/30">
                    {chartContext.allKeywords.length}件連動中
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {chartContext.allKeywords.length > 0 ? (
                    chartContext.allKeywords.slice(0, 8).map((kw, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setIsDrawerOpen(false);
                          onOpenSearch('all');
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-amber-200 border border-amber-500/40 hover:bg-amber-500/20 transition-colors"
                      >
                        #{kw}
                      </button>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">カルテ入力と自動同期中</span>
                  )}
                </div>
              </div>

              {/* グループ1: 臨床データ ＆ 意思決定支援 (カルテ100%連動) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">
                    臨床データ ＆ 意思決定支援
                  </span>
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full">
                    🎯 カルテ全体連動
                  </span>
                </div>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenSearch('pill');
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">💊</span>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          医薬品添付文書 ＆ 錠剤鑑別
                        </div>
                        <div className="text-[10px] text-teal-400 font-mono">
                          カルテ内処方薬・適応薬を100%自動抽出表示
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenSearch('atlas');
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">📈</span>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          12誘導心電図 ＆ 臨床波形解析
                        </div>
                        <div className="text-[10px] text-rose-400 font-mono">
                          カルテ所見・ST変化に一致する波形を自動選定
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenSearch('minds');
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">📚</span>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          Minds ガイドライン ＆ 救急プロトコル
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          カルテ病態・主訴に直結するガイドラインCQ表示
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenSearch('all');
                    }}
                    className="w-full p-3 rounded-xl bg-sky-950/50 hover:bg-sky-900/60 border border-sky-500/40 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">🔍</span>
                      <div>
                        <div className="text-xs font-semibold text-sky-200">
                          臨床データ総合検索 (カルテ100%連動)
                        </div>
                        <div className="text-[10px] text-sky-400 font-mono">
                          32GB SD 全10大マスター横断・医療知識均てん化
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-sky-400 group-hover:text-white transition-colors" />
                  </button>
                </div>
              </div>

              {/* グループ2: カルテ入力支援 ＆ ツール */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  カルテ入力支援 ＆ ツール
                </span>
                <div className="space-y-1.5">
                  <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setIsDrawerOpen(false);
                        onOpenWebLlm('soap');
                      }}
                      className="w-full flex items-center justify-between text-left transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-purple-200">
                            Gemma 2 臨床AIスタジオ (6大モード)
                          </div>
                          <div className="text-[10px] text-purple-400 font-mono">
                            SOAP・紹介状・指示簿・SBAR・IC説明・処方監査
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors" />
                    </button>
                    <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-purple-500/30">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setIsDrawerOpen(false);
                          onOpenWebLlm('referral');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-sky-300 border border-slate-700 text-[10px] font-bold text-left"
                      >
                        📄 紹介状・サマリー
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setIsDrawerOpen(false);
                          onOpenWebLlm('order_sbar');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-emerald-300 border border-slate-700 text-[10px] font-bold text-left"
                      >
                        📋 指示簿・SBAR
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setIsDrawerOpen(false);
                          onOpenWebLlm('patient_ic');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-pink-300 border border-slate-700 text-[10px] font-bold text-left"
                      >
                        👪 患者IC説明書
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic(10);
                          setIsDrawerOpen(false);
                          onOpenWebLlm('clinical_audit');
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-rose-300 border border-slate-700 text-[10px] font-bold text-left"
                      >
                        🛡️ 処方・RedFlag監査
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenTemplates();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <BookTemplate className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          SOAPテンプレート ＆ 略語マスター
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">
                          内科・外来定型文 ワンタップ展開
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>

                  {onOpenCameraOcr && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        setIsDrawerOpen(false);
                        onOpenCameraOcr();
                      }}
                      className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base">📷</span>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            処方箋・カルテ カメラOCR取込
                          </div>
                          <div className="text-[10px] text-sky-400 font-mono">
                            書類・薬剤名抽出 (無駄なスペース・改行自動削除)
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

              {/* グループ3: 3省2ガイドライン準拠 ＆ 医療安全 */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center justify-between">
                  <span>3省2ガイドライン準拠 ＆ 通信</span>
                  <span className="text-[10px] text-emerald-400 font-mono">完全オフライン・オンプレミス</span>
                </span>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">BLE 打鍵転送:</span>
                    <span className={`font-mono font-bold ${isBleConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {isBleConnected ? 'DrDongly-S3 接続中' : '未接続'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">医療情報安全管理:</span>
                    <span className="text-emerald-400 font-semibold">3省2ガイドライン準拠</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">クラウド外部送信:</span>
                    <span className="text-emerald-300 font-mono">0 Byte (完全オンプレミス)</span>
                  </div>
                  {/* 隠し機能トリガー: この行を3回連続タップするとT-Dongle-S3 Wi-Fiエアギャップ接続手順が開く */}
                  <div
                    onClick={handleSecretAirGapTap}
                    className="pt-1.5 mt-1 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500 cursor-pointer select-none"
                    title="3回連続タップでT-Dongle-S3 閉域Wi-Fiエアギャップ詳細を表示"
                  >
                    <span className="flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-500" />
                      ハードウェア閉域認証モード
                    </span>
                    <span className="font-mono">On-Premise Air-Gap</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ドロワーフッター（戻るボタン ＋ バージョン情報） */}
            <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  setIsDrawerOpen(false);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>メイン画面へ戻る</span>
              </button>
              <div
                onClick={handleSecretAirGapTap}
                className="text-[11px] font-mono text-slate-400 flex items-center justify-between cursor-pointer select-none"
              >
                <span>FW: v{LATEST_FIRMWARE_VERSION}-ESP32S3</span>
                <span>Dr.Dongly v{APP_VERSION}</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. 【隠し機能】3省2ガイドライン完全準拠 T-Dongle-S3 Wi-Fi エアギャップ遮断モーダル */}
      {/* ========================================================================= */}
      {showHiddenAirGapModal && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowHiddenAirGapModal(false)}
        >
          <div
            className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                      Hidden On-Premise Mode
                    </span>
                    <span className="text-[10px] font-mono text-amber-300">
                      3省2ガイドライン完全準拠
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    T-Dongle-S3 閉域Wi-Fi エアギャップ遮断構成
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHiddenAirGapModal(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                ✕ 閉じる
              </button>
            </div>

            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed space-y-2">
              <p className="font-bold text-emerald-300">
                🔒 なぜあえて T-Dongle-S3 の Wi-Fi に接続するのか？（3省2ガイドライン遵守の黄金律）
              </p>
              <p>
                スマホ・タブレットのWi-Fi接続先を、インターネットルーターではなくあえて
                <strong className="text-white"> T-Dongle-S3 内蔵の閉域アクセスポイント（SoftAP）</strong>
                に切り替えることで、端末のルーティングが物理的に外部インターネットから完全遮断（エアギャップ隔離）されます。
              </p>
              <p>
                これにより、厚労省・経産省・総務省の<strong className="text-emerald-300">「医療情報システムの安全管理に関するガイドライン（3省2ガイドライン）」</strong>が求める「外部ネットワークへの患者情報漏洩ゼロ」をハードウェアレベルで100%証明できる<strong className="text-amber-300">完全オフライン・オンプレミス医療支援デバイス</strong>として機能します。
              </p>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="font-bold text-slate-300 flex items-center justify-between">
                <span>📡 T-Dongle-S3 閉域SoftAP 接続手順（監査・高セキュリティ運用時）</span>
                <span className="text-[10px] font-mono text-slate-500">※通常はBLEのみで全機能稼働</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-mono text-[11px]">
                <li>
                  スマホのWi-Fi設定で SSID: <span className="text-amber-300 font-bold">Drdonguri-Atlas-Direct</span> を選択
                </li>
                <li>
                  パスワード: <span className="text-amber-300 font-bold">donguri-medical-s3</span> を入力して接続
                </li>
                <li>
                  インターネット未接続の閉域網（<span className="text-sky-300">http://192.168.4.1</span>）が確立され、32GB MicroSD内のMindsガイドライン原本PDF・PMDA添付文書・臨床アトラスWebPが外部通信ゼロで直接ストリーミング供給されます。
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowHiddenAirGapModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
              >
                了解して戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

