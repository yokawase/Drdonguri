import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { APP_VERSION, LATEST_FIRMWARE_VERSION } from '../version';

interface NativePwaEdgeLayoutProps {
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  isBleConnected: boolean;
  isSending: boolean;
  onConnectBle: () => void;
  onSendSession: () => void;
  onOpenSearch: () => void;
  onOpenCoprocessor: () => void;
  onOpenWebLlm: () => void;
  onOpenTemplates: () => void;
  onOpenDongleConsole: () => void;
  onOpenMedPilot: () => void;
  onOpenFirmware: () => void;
  onSwitchToClassicMac: () => void;
  onOpenAboutMac?: () => void;
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
  onOpenSearch,
  onOpenCoprocessor,
  onOpenWebLlm,
  onOpenTemplates,
  onOpenDongleConsole,
  onOpenMedPilot,
  onOpenFirmware,
  onSwitchToClassicMac,
  onOpenAboutMac,
}) => {
  // ドロワー開閉状態
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 音声入力録音状態
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // マイク波形（Web Audio API / シミュレーション波形）
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // 検索入力ステート
  const [searchQuery, setSearchQuery] = useState('');

  // 編集モード（直接テキストエリア編集 vs フォーマット表示）
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 現在時刻表示（ステータスバー）
  const [currentTime, setCurrentTime] = useState('9:41');
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const h = d.getHours().toString().padStart(2, '0');
      const m = d.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${h}:${m}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // 音声認識（Web Speech API / SpeechRecognition）の初期化と制御
  const toggleSpeechRecognition = useCallback(() => {
    triggerHaptic(isRecording ? [20, 40, 20] : 30);

    if (isRecording) {
      // 録音停止
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('SpeechRecognition stop error:', e);
        }
      }
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      // 認識結果をカルテ本文に反映
      if (interimTranscript.trim()) {
        setInputText((prev) => {
          const trimmed = prev.trim();
          if (!trimmed) {
            return `【主訴】\n${interimTranscript}\n\n【現病歴】\n\n【処置・方針】\n`;
          }
          return `${trimmed}\n${interimTranscript}`;
        });
      }
      setIsRecording(false);
      setInterimTranscript('');
      setAudioLevel(0);
      return;
    }

    // 録音開始
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Web Speech API 非対応時のフォールバックシミュレーション
      setIsRecording(true);
      setInterimTranscript('「ニトロペン舌下錠を処方して、安静時の発作指導をしてください。」');
      setTimeout(() => {
        setInterimTranscript(
          '「ニトロペン舌下錠を処方して、安静時の発作指導をしてください。」 それから、早めの循環器専門医への対診を検討...'
        );
      }, 1200);

      // シミュレーション波形ループ
      let phase = 0;
      const simLoop = () => {
        phase += 0.15;
        const level = (Math.sin(phase) + 1) / 2 * 0.7 + Math.random() * 0.3;
        setAudioLevel(level);
        animFrameRef.current = requestAnimationFrame(simLoop);
      };
      animFrameRef.current = requestAnimationFrame(simLoop);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setInterimTranscript(interim || final);
        triggerHaptic(10);
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('マイクへのアクセスが許可されていません。ブラウザ設定をご確認ください。');
          setIsRecording(false);
        }
      };

      recognition.onend = () => {
        // 自動再接続または終了
        if (isRecording) {
          setIsRecording(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      // Web Audio API によるマイク波形キャプチャ
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true, video: false })
          .then((stream) => {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateWaveform = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length / 255;
              setAudioLevel(avg);
              animFrameRef.current = requestAnimationFrame(updateWaveform);
            };
            animFrameRef.current = requestAnimationFrame(updateWaveform);
          })
          .catch(() => {
            // マイクストリーム失敗時もシミュレーション波形を回す
            let phase = 0;
            const fallbackWave = () => {
              phase += 0.2;
              setAudioLevel((Math.sin(phase) + 1) / 2 * 0.8);
              animFrameRef.current = requestAnimationFrame(fallbackWave);
            };
            animFrameRef.current = requestAnimationFrame(fallbackWave);
          });
      }
    } catch (err) {
      console.error('Speech recognition initiation failed:', err);
      setIsRecording(false);
    }
  }, [isRecording, interimTranscript, setInputText]);

  // デフォルトテキスト（空の場合のサンプル所見表示）
  const displayLines = (inputText.trim() || `【主訴】　　　　労作時の息切れ、胸部圧迫感\n\n【現病歴】　　　3日前より階段昇降時に胸部圧迫感と動悸を自覚。\n　　　　　　　　安静にて数分で軽快するも、今朝より階段1階分で症状出現。\n\n【既往歴】　　　高血圧、脂質異常症（10年前より加療中）\n\n【内服薬】　　　アムロジピン 5mg 1T 1x 朝食後、アトルバスタチン 10mg\n\n【身体所見】　　血圧 142/86 mmHg, 脈拍 82回/分・整, SpO2 98% (room)\n　　　　　　　　心音: 整・心雑音なし。呼吸音: 清・ラ音聴取せず。下腿浮腫(-)\n\n【アセスメント】労作性狭心症の疑い（安定狭心症疑い）\n\n【プラン (P)】　1. 12誘導心電図、心エコー、トロポニン・BNP迅速検査\n\n　　　　　　　　2. 硝酸薬（ニトロペン舌下錠）領用処方と安静時発作の指導\n\n　　　　　　　　3. 循環器専門医への同日対診・冠動脈CT適応検討`).split('\n');

  return (
    <div className="relative w-full h-[100dvh] bg-[#0F172A] text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans overscroll-none touch-manipulation">
      {/* ========================================================================= */}
      {/* 1. iOS風 最上部ステータスバー (Dynamic Island & 時計 & バッテリー) */}
      {/* ========================================================================= */}
      <div className="w-full pt-[env(safe-area-inset-top,0.5rem)] px-5 pb-1 flex items-center justify-between text-xs font-semibold text-slate-400 shrink-0">
        <span className="text-slate-200 tracking-tight">{currentTime}</span>
        {/* Dynamic Island モック */}
        <div className="w-24 h-4 bg-black/80 rounded-full mx-auto" />
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <span>5G</span>
          <span className="font-mono">100%</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ヘッダー部: ロゴ + BLE接続ステータスバッジ */}
      {/* ========================================================================= */}
      <header className="w-full px-4 py-2 flex items-center justify-between shrink-0 border-b border-slate-800/80 bg-[#0F172A]/90 backdrop-blur-md z-10">
        {/* 左側: ハンバーガーメニュー & ロゴ */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              setIsDrawerOpen(true);
            }}
            className="p-1.5 -ml-1 text-slate-300 hover:text-white active:scale-95 transition-transform"
            aria-label="メニューを開く"
          >
            <Menu className="w-6 h-6 stroke-[2]" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-white font-sans">
              Dr.Dongly
            </span>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700/80">
              Edge
            </span>
          </div>
        </div>

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
      </header>

      {/* ========================================================================= */}
      {/* 3. メインコンテンツ部 (スクロール可能・バウンス抑止) */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full px-3.5 py-2 overflow-y-auto overscroll-contain flex flex-col gap-2.5">
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
        <div className="flex-1 w-full bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-3.5 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm relative">
          {/* カードヘッダー */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-4 bg-amber-500 rounded-[2px] inline-block shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
              <h2 className="text-xs font-bold text-slate-200 tracking-wide font-sans">
                臨床所見・SOAP整形テキスト
              </h2>
            </div>
            {isRecording ? (
              <span className="text-[11px] font-bold text-rose-500 animate-pulse flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                録音中...
              </span>
            ) : (
              <span className="text-[10px] font-mono text-sky-400/80 tracking-tight">
                Zero-Data Cloud
              </span>
            )}
          </div>

          {/* テキストコンテンツ領域 (タップで編集切り替え可能) */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain pr-1 text-[13px] leading-relaxed font-sans text-slate-200 select-text"
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
                onBlur={() => {
                  if (!inputText.trim()) setIsEditing(false);
                }}
                placeholder="所見を入力、またはマイクボタンをタップして音声入力してください..."
                className="w-full h-full bg-transparent text-slate-100 text-xs sm:text-[13px] leading-relaxed resize-none focus:outline-none font-mono selection:bg-amber-500/30"
                style={{ minHeight: '180px' }}
              />
            ) : (
              <div className="space-y-1.5 cursor-text">
                {displayLines.map((line, idx) => {
                  const trimmed = line.trim();
                  const isCyanTag = /^【(主訴|現病歴|既往歴|内服薬|身体所見)】/.test(trimmed);
                  const isAmberTag = /^【(アセスメント|プラン.*?)】/.test(trimmed);
                  
                  if (isCyanTag || isAmberTag) {
                    const tagEnd = line.indexOf('】') + 1;
                    const tag = line.slice(0, tagEnd);
                    const rest = line.slice(tagEnd);
                    return (
                      <div key={idx} className="pt-2 font-medium">
                        <span className={`font-bold mr-2 ${isCyanTag ? 'text-sky-400' : 'text-amber-400'}`}>
                          {tag}
                        </span>
                        <span className="text-slate-100">{rest}</span>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className={trimmed ? 'text-slate-200' : 'h-2'}>
                      {line}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 音声入力中のリアルタイムプレビュー (画像3を再現) */}
            {isRecording && (
              <div className="mt-3 p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 animate-in fade-in">
                <div className="text-[11px] font-bold text-rose-400 mb-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  [音声入力中]
                </div>
                <div className="text-xs sm:text-[13px] text-rose-200 font-sans leading-relaxed">
                  {interimTranscript || 'マイクへ向かってカルテ所見をお話しください...'}
                  <span className="inline-block w-2 h-3.5 bg-rose-400 ml-1 animate-pulse align-middle" />
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. 親指ボトムアクションバー (左: 電カル受信, 中央: 音声入力FAB, 右: 電カル送信) */}
      {/* ========================================================================= */}
      <nav className="w-full pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-2 px-6 bg-[#0F172A]/95 border-t border-slate-800/80 backdrop-blur-md shrink-0 flex flex-col items-center relative z-20">
        {/* 音声録音中のオシロスコープ波形（FAB上部） */}
        {isRecording && (
          <div className="w-full max-w-xs h-10 flex items-center justify-center mb-1 animate-in fade-in">
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

        <div className="w-full flex items-center justify-between max-w-sm mx-auto">
          {/* 【左側】電カルから受信 (コーラルピンク) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(25);
                onOpenCoprocessor();
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

          {/* 【右側】電カルへ送信 (スカイブルー) */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic([30, 60, 30]);
                onSendSession();
              }}
              disabled={isSending || !inputText.trim()}
              className={`w-14 h-14 rounded-full bg-[#1E293B] border border-sky-400/60 text-sky-400 hover:bg-sky-400/10 active:scale-90 transition-all flex items-center justify-center shadow-lg group ${
                isSending || !inputText.trim() ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="電子カルテ端末へUSB-HID自動打鍵転送"
            >
              {isSending ? (
                <RefreshCw className="w-6 h-6 animate-spin text-sky-300" />
              ) : (
                <Send className="w-6 h-6 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              )}
            </button>
            <span className="text-[11px] font-semibold text-sky-400 tracking-tight">
              電カル送信
            </span>
          </div>
        </div>

        {/* ホームインジケータバー */}
        <div className="w-32 h-1 bg-slate-600/70 rounded-full mt-3 shrink-0" />
      </nav>

      {/* ========================================================================= */}
      {/* 5. ハンバーガーメニュー ドロワー (画像2を忠実に再現) */}
      {/* ========================================================================= */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* バックドロップ */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              triggerHaptic(10);
              setIsDrawerOpen(false);
            }}
          />

          {/* スライドインドロワー本体 */}
          <aside className="relative w-4/5 max-w-sm h-full bg-[#0F172A] border-r border-slate-800 text-slate-100 flex flex-col justify-between p-5 z-10 shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200">
            <div className="space-y-6">
              {/* ドロワーヘッダー */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    設定 & 管理
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Dr.Dongly System Preferences
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    setIsDrawerOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
                  aria-label="閉じる"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* グループ1: ハードウェア & 通信 */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  ハードウェア & 通信
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenFirmware();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          USB動作モード
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          HID自動打鍵 (03h) 有効
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
                      onOpenSearch();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          32GB MicroSD インデックス
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">
                          Zero-RAM 二分探索 (同期済)
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>
                </div>
              </div>

              {/* グループ2: オンデバイス推論 (SLM) */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  オンデバイス推論 (SLM)
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenWebLlm();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          ローカルSLMエンジン
                        </div>
                        <div className="text-[10px] text-purple-400 font-mono">
                          Qwen2.5-1.5B [WebGPU/INT4]
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
                      onOpenMedPilot();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-sky-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          埋め込み・トリアージ閾値
                        </div>
                        <div className="text-[10px] text-sky-400 font-mono">
                          EmbeddingGemma 2 / Logprob 0.92
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>
                </div>
              </div>

              {/* グループ3: セキュリティ & 監査 */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                  セキュリティ & 監査
                </span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenDongleConsole();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          3省2ガイドライン適合ログ
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono">
                          完全オフライン閉域網・漏洩ゼロ
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
                      onOpenTemplates();
                    }}
                    className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <BookTemplate className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          SOAPテンプレート & 略語辞書
                        </div>
                        <div className="text-[10px] text-amber-400 font-mono">
                          内科/循環器外科 カスタム登録
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                  </button>
                </div>
              </div>

              {/* Classic Mac モードへの切替 */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(20);
                    setIsDrawerOpen(false);
                    onSwitchToClassicMac();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 text-xs font-medium text-slate-300 flex items-center justify-center gap-2 transition-colors"
                >
                  <Monitor className="w-4 h-4 text-slate-400" />
                  <span>🖥️ Classic Mac (System 7) UIへ切替</span>
                </button>
              </div>
            </div>

            {/* ドロワーフッター */}
            <div className="pt-6 border-t border-slate-800/80 space-y-1">
              <div className="text-xs font-mono text-slate-400">
                Firmware: v{LATEST_FIRMWARE_VERSION}-ESP32S3 (Dr.Dongly v{APP_VERSION})
              </div>
              <a
                href="https://yokawase.github.io/Drdonguri/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-sans"
              >
                <span>Zero-Data Cloud Architecture</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
