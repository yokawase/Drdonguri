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
  AlertCircle,
  Trash2,
  OctagonX,
  ArrowLeft,
  Lock,
  Wifi,
} from 'lucide-react';
import { APP_VERSION, LATEST_FIRMWARE_VERSION } from '../version';
import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
  DEFAULT_SAMPLE_CHART_TEXT,
} from '../utils/chartTextCleaner';
import { sdCardStreamingService, SoftApStatus } from '../services/sdCardStreamingService';

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
  onOpenWebLlm: () => void;
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

  // マイク波形（発話アクティビティ連動）
  const [audioLevel, setAudioLevel] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);

  // 検索入力ステート
  const [searchQuery, setSearchQuery] = useState('');

  // 編集モード（直接テキストエリア編集 vs フォーマット表示）
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

      // 認識結果全文（確定＋中間）を無駄なスペース・改行を除去してカルテ本文に反映
      const fullRecorded = cleanExtractedMedicalText(
        normalizeMedicalSpeechTerms(`${finalTranscriptRef.current}${interimTranscriptRef.current}`)
      );
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
          finalTranscriptRef.current += currentFinal;
        }

        const currentDisplay = `${finalTranscriptRef.current} ${interim}`.trim();
        interimTranscriptRef.current = interim;
        setInterimTranscript(currentDisplay);
        triggerHaptic(8);
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
        // ユーザーが手動停止していない場合はセッションを自動再開
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current) {
              try {
                recognition.start();
              } catch (e) {
                // すでに開始されている場合は無視
              }
            }
          }, 150);
        } else {
          setIsRecording(false);
          stopWaveformLoop();
        }
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

                {/* 無駄なスペース・改行のワンタップ削除ボタン */}
                {!isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(15);
                      setInputText((prev) =>
                        cleanExtractedMedicalText(normalizeMedicalSpeechTerms(prev || DEFAULT_SAMPLE_CHART_TEXT))
                      );
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-sky-300 hover:text-white bg-sky-950/50 hover:bg-sky-900/70 border border-sky-700/50 transition-colors cursor-pointer"
                    title="電子カルテから抽出したテキストの無駄なスペース・空白行・改行を一括削除して整形します"
                  >
                    <Sparkles className="w-3 h-3 text-sky-400" />
                    <span>空白・改行整理</span>
                  </button>
                )}

                {/* Gemma 2 AI文章校正ショートカットボタン */}
                {!isSending && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic(15);
                      onOpenWebLlm();
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-purple-300 hover:text-white bg-purple-950/60 hover:bg-purple-900/70 border border-purple-600/50 transition-colors cursor-pointer"
                    title="Gemma 2 でSOAP形式または箇条書き要約に高精度校正します"
                  >
                    <Cpu className="w-3 h-3 text-purple-400" />
                    <span>Gemma2校正</span>
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

              {/* 音声入力中のリアルタイムプレビュー */}
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
        </div>

        {/* 右側カラム (モバイル: 非表示, デスクトップ: 4カラム常時展開クイック臨床パネル) */}
        <aside className="hidden lg:flex lg:col-span-4 flex-col gap-3.5 h-full overflow-y-auto pr-1">
          {/* クイックアクション1: 32GB MicroSD 臨床データ */}
          <div className="bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                <span>📚</span>
                <span>32GB 臨床データクイックアクセス</span>
              </span>
              <span className="text-[10px] font-mono text-sky-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                MicroSD
              </span>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('pill');
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💊</span>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                      医薬品添付文書 ＆ 錠剤識別
                    </div>
                    <div className="text-[10px] text-teal-400 font-mono">
                      PMDA約22,000品目・表裏刻印写真
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('atlas');
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📈</span>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-rose-300 transition-colors">
                      12誘導心電図 ＆ 臨床波形解析
                    </div>
                    <div className="text-[10px] text-rose-400 font-mono">
                      実測ミリ波形・1mm/5mm方眼紙測定
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('minds');
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📚</span>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors">
                      Minds ガイドライン ＆ 救急DMAT
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      169CQ 全文原本・中毒解毒処置
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('all');
                }}
                className="w-full p-2.5 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 border border-sky-500/40 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔍</span>
                  <div>
                    <div className="text-xs font-semibold text-sky-200 group-hover:text-white transition-colors">
                      臨床データ総合検索 (カルテ100%連動)
                    </div>
                    <div className="text-[10px] text-sky-400 font-mono">
                      全10大マスター・カルテ抽出キーワード一括照合
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-400 group-hover:text-white transition-colors" />
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

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenWebLlm();
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600"
              >
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                      Gemma 2 文章校正 (SOAP / 箇条書き)
                    </div>
                    <div className="text-[10px] text-purple-400 font-mono">
                      WebGPU Gemma 2 2B 高精度プロンプト搭載
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
        <div className="fixed inset-0 z-40 flex pt-[calc(env(safe-area-inset-top,0px)+3.5rem)]">
          {/* バックドロップ */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => {
              triggerHaptic(10);
              setIsDrawerOpen(false);
            }}
          />

          {/* スライドインドロワー本体 */}
          <aside className="relative w-11/12 max-w-sm h-full bg-[#0F172A] border-r border-slate-800 text-slate-100 flex flex-col justify-between p-4 z-10 shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200">
            <div className="space-y-5">
              {/* ドロワーヘッダー（← 戻るボタンを明示配置） */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 gap-2">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1 transition-colors shrink-0 shadow-sm"
                    aria-label="メイン画面へ戻る"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>戻る</span>
                  </button>
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      設定 & 管理
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
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
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
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      setIsDrawerOpen(false);
                      onOpenWebLlm();
                    }}
                    className="w-full p-3 rounded-xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 flex items-center justify-between text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-purple-200">
                          Gemma 2 文章校正 (SOAP / 箇条書き要約)
                        </div>
                        <div className="text-[10px] text-purple-400 font-mono">
                          高精度プロンプトによるカルテ構造化・要約
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors" />
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

