import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { bleManager } from './utils/webBluetooth';
import { buildTransmissionSession, PreparedSession } from './utils/packetBuilder';
import { DispatchMode, DEFAULT_PRESET_TEMPLATES, MedicalTemplate } from './types';
import { APP_VERSION } from './version';
import { NativePwaEdgeLayout } from './components/NativePwaEdgeLayout';
import { cleanExtractedMedicalText, DEFAULT_SAMPLE_CHART_TEXT } from './utils/chartTextCleaner';
import { prewarmWebLlmEngine } from './services/webLlmService';
import { useAutoDictionary } from './hooks/useAutoDictionary';
import { ensureLexiconLoaded } from './services/KeyStrokeCompiler';

// 臨床現場で真に必要なモーダルのみオンデマンド遅延ロード
const MedicalDataSearchModal = React.lazy(() =>
  import('./components/MedicalDataSearchModal').then((m) => ({ default: m.MedicalDataSearchModal }))
);
const MedicalCoprocessorModal = React.lazy(() =>
  import('./components/MedicalCoprocessorModal').then((m) => ({ default: m.MedicalCoprocessorModal }))
);
const AiAssistModal = React.lazy(() =>
  import('./components/AiAssistModal').then((m) => ({ default: m.AiAssistModal }))
);
const TemplateManagerModal = React.lazy(() =>
  import('./components/TemplateManagerModal').then((m) => ({ default: m.TemplateManagerModal }))
);
const CameraOcrModal = React.lazy(() =>
  import('./components/CameraOcrModal').then((m) => ({ default: m.CameraOcrModal }))
);
const LearnedDictionaryModal = React.lazy(() =>
  import('./components/LearnedDictionaryModal').then((m) => ({ default: m.LearnedDictionaryModal }))
);

const STORAGE_KEY_BUFFER = 'drvoice_dispatcher_buf';
const STORAGE_KEY_TEMPLATES = 'drvoice_custom_templates';

export default function App() {
  // 入力テキスト (Local-first: 自動永続化 ＆ 無駄なスペース・改行削除)
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_BUFFER);
      if (saved !== null) {
        return cleanExtractedMedicalText(saved);
      }
    }
    return DEFAULT_SAMPLE_CHART_TEXT;
  });

  // 定型文リスト (プリセット + カスタム保存分)
  const [templates, setTemplates] = useState<MedicalTemplate[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_TEMPLATES);
        if (raw) {
          const customList = JSON.parse(raw) as MedicalTemplate[];
          return [...DEFAULT_PRESET_TEMPLATES, ...customList];
        }
      } catch {}
    }
    return DEFAULT_PRESET_TEMPLATES;
  });

  // テキスト更新時に非同期デバウンス自動保存（タイピング中のメインスレッドブロッキングを完全排除）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_BUFFER, inputText);
      } catch {}
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inputText]);

  // 初回アイドル時に WebGPU Gemma 2 エンジンをバックグラウンドプリウォーム
  useEffect(() => {
    prewarmWebLlmEngine();
  }, []);

  // ドングルBLE接続 & 送信状態
  const [isBleConnected, setIsBleConnected] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [, setTransmissionProgress] = useState<number>(0);
  const [, setTransmissionStage] = useState<string>('');

  // モーダル開閉ステート
  const [isMedicalSearchOpen, setIsMedicalSearchOpen] = useState(false);
  const [medicalSearchInitialTab, setMedicalSearchInitialTab] = useState<any>('all');
  const [isCoprocessorModalOpen, setIsCoprocessorModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalInitialStyle, setAiModalInitialStyle] = useState<any>('soap');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isCameraOcrOpen, setIsCameraOcrOpen] = useState(false);
  const [isLearnedDictOpen, setIsLearnedDictOpen] = useState(false);

  // 送信直前テキストのバッファ (【系統A：電カルIME誤変換自動学習】の正解ターゲット)
  const lastSentTextRef = useRef<string>('');
  // エディタテキストのRef保持 (イベントリスナー内から最新値を参照)
  const inputTextRef = useRef<string>(inputText);
  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);
  // 手動吸い上げ直前の原文バッファ (手動吸い上げテキストとの差分検証用)
  const prePullOriginalTextRef = useRef<string>('');
  // 送信直後のバックグラウンド自動学習用吸い上げかどうかのフラグ（エディタ内容を誤変換テキストで上書きしないため）
  const isAutoLearnPullRef = useRef<boolean>(false);
  const autoLearnPullResetTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // 電カル照合＆自己学習クローズドループのステータスバッジ
  const [ehrSyncStatus, setEhrSyncStatus] = useState<{
    status: 'idle' | 'syncing' | 'verified' | 'learning';
    text: string;
  }>({ status: 'idle', text: '' });
  const ehrSyncTimerRef = useRef<number | null>(null);

  const updateEhrSyncStatus = useCallback((status: 'idle' | 'syncing' | 'verified' | 'learning', text: string, autoClearMs = 0) => {
    if (ehrSyncTimerRef.current !== null) {
      window.clearTimeout(ehrSyncTimerRef.current);
      ehrSyncTimerRef.current = null;
    }
    setEhrSyncStatus({ status, text });
    if (autoClearMs > 0) {
      ehrSyncTimerRef.current = window.setTimeout(() => {
        setEhrSyncStatus({ status: 'idle', text: '' });
        ehrSyncTimerRef.current = null;
      }, autoClearMs);
    }
  }, []);

  // 臨床通知トースト (自動消退)
  const [toastNotice, setToastNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const showToast = useCallback((type: 'info' | 'success' | 'warning' | 'error', message: string, duration = 3500) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastNotice({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToastNotice((cur) => (cur?.message === message ? null : cur));
      toastTimerRef.current = null;
    }, duration);
  }, []);

  // 自己学習クローズドループ辞書マネージャー (Aho-Corasick ＆ IndexedDB ＆ Whisper連動)
  const {
    entries: learnedEntries,
    promotedEntries,
    recordPair,
    deleteEntry,
    learnFromImeDiff,
    learnFromAsrDiff,
    replaceWithLearnedDict,
    getWhisperInitialPrompt,
  } = useAutoDictionary({
    onNotice: (msg) => {
      // 画面隅に控えめな学習インジケータ（1.8秒間トースト表示）
      showToast('info', msg, 1800);
    },
  });

  // 最新の学習関数をRefで保持 (イベントリスナー内のクロージャ問題を完全防止)
  const learnFromImeDiffRef = useRef(learnFromImeDiff);
  useEffect(() => {
    learnFromImeDiffRef.current = learnFromImeDiff;
  }, [learnFromImeDiff]);

  // BLE 接続イベントリスナー登録
  useEffect(() => {
    const ble = bleManager;

    // ACKイベント監視
    const removeAckListener = ble.addAckListener((event) => {
      if (event.ackType === 'USB_REPORTS_SENT') {
        setIsSending(false);
        showToast('success', '【USB打鍵完了】電子カルテPCへの自動入力が正常に完了しました！');

        // 【系統A：外部ループ自動吸い上げトリガー】
        // HID打鍵完了後、電カルIMEの変換確定とカーソル落ち着きを待って即座に仮想プリンタBulk OUTから自動吸い上げ
        setTimeout(async () => {
          try {
            if (ble.isConnected()) {
              isAutoLearnPullRef.current = true;
              updateEhrSyncStatus('syncing', '🔄 電カル照合中…', 3500);

              if (autoLearnPullResetTimerRef.current !== null) {
                window.clearTimeout(autoLearnPullResetTimerRef.current);
              }
              autoLearnPullResetTimerRef.current = window.setTimeout(() => {
                isAutoLearnPullRef.current = false;
                autoLearnPullResetTimerRef.current = null;
                updateEhrSyncStatus('idle', '');
              }, 3500);
              ble.clearPrinterBuffer();
              await ble.triggerAutoPull();
            }
          } catch (e) {
            isAutoLearnPullRef.current = false;
            updateEhrSyncStatus('idle', '');
            console.debug('[AutoPull] 自動吸い上げトリガー待機:', e);
          }
        }, 350);
      } else if (event.ackType === 'ALL_PACKETS_READY') {
        showToast('info', '【転送完了】ドングル側で打鍵準備が整いました。');
      } else if (event.ackType === 'PHYSICAL_BTN_PRESSED') {
        showToast('info', 'ドングル本体ボタンが押されました。');
      }
    });

    // 電カルから仮想プリンタ経由で文章が抽出された際、自動学習 ＆ 無駄なスペース・改行を自動削除して反映
    const removePrinterComplete = ble.addPrinterCompleteListener((fullText) => {
      const wasBackgroundAutoLearnPull = isAutoLearnPullRef.current;
      isAutoLearnPullRef.current = false;
      if (autoLearnPullResetTimerRef.current !== null) {
        window.clearTimeout(autoLearnPullResetTimerRef.current);
        autoLearnPullResetTimerRef.current = null;
      }

      // 【系統A：電カルIME誤変換の自動学習】（外部ループ）
      if (lastSentTextRef.current && fullText) {
        learnFromImeDiffRef.current(fullText, lastSentTextRef.current)
          .then((pairs) => {
            if (pairs.length > 0) {
              console.log('[AutoLearn IME] 学習候補ペア抽出完了:', pairs);
              if (wasBackgroundAutoLearnPull) {
                updateEhrSyncStatus('learning', `⚡ 誤字検知: ${pairs.length}件を自動学習中…`, 1800);
                showToast('info', `⚡ 誤字検知: ${pairs.length}件の学習候補を照合中…`, 1800);
              }
            } else {
              if (wasBackgroundAutoLearnPull) {
                updateEhrSyncStatus('verified', '✓ 電カル照合完了（差分なし）', 1500);
                showToast('success', '✓ 電カル照合完了（差分なし）', 1500);
              }
            }
          })
          .catch((err) => {
            console.warn('[AutoLearn IME] 学習処理エラー:', err);
            if (wasBackgroundAutoLearnPull) {
              updateEhrSyncStatus('idle', '');
            }
          });
      } else if (wasBackgroundAutoLearnPull) {
        updateEhrSyncStatus('verified', '✓ 電カル照合完了（差分なし）', 1500);
        showToast('success', '✓ 電カル照合完了（差分なし）', 1500);
      }

      // 送信直後のバックグラウンド自動学習吸い上げ時は、電カル側のIME誤変換テキストで
      // 医師のクリーンな入力エディタを上書きしない（手動吸い上げ時もエディタ原文を完全保護 ＆ 差分を検証・学習）
      if (!wasBackgroundAutoLearnPull) {
        const cleaned = cleanExtractedMedicalText(fullText);
        // 手動吸い上げ直前エディタ原文、または直前送信テキストを正解ターゲットとして取得
        const correctOriginal = prePullOriginalTextRef.current?.trim() || inputTextRef.current?.trim() || lastSentTextRef.current?.trim();
        const hasExistingEditorText = Boolean(inputTextRef.current?.trim());

        if (correctOriginal && cleaned && correctOriginal !== cleaned) {
          // 手動吸い上げテキスト（誤字側）と正しい原文（正解側）の差分を検証し、手動即時昇格（forcePromote: true）で学習辞書に追加！
          learnFromImeDiffRef.current(cleaned, correctOriginal, true)
            .then((pairs) => {
              if (pairs.length > 0) {
                const pairStr = pairs.map((p) => `「${p.source}」➔「${p.target}」`).join('、');
                updateEhrSyncStatus('learning', `⚡ 誤字検知: ${pairs.length}件を学習辞書に追加`, 2500);
                showToast('success', `⚡ 手動吸い上げから誤変換を検知: ${pairStr} を学習辞書に追加しました！（エディタ原文は保持）`, 4500);
              } else {
                showToast('success', hasExistingEditorText ? '✓ 電カル照合完了: 誤字差分なし（エディタ原文は保持）' : '【電カル抽出完了】カルテ内容を読み込みました！');
              }
            })
            .catch((err) => {
              console.warn('[AutoLearn IME] 手動吸い上げ差分検証エラー:', err);
              showToast('info', '【電カル抽出完了】カルテデータを受信しました');
            });
        } else {
          showToast('success', hasExistingEditorText ? '✓ 電カル照合完了（エディタ原文は保持）' : '【電カル抽出完了】カルテ内容を読み込みました！');
        }

        // メイン画面のエディタが完全に空の時のみ、吸い上げテキストを初期セット
        // （既存の入力がある場合は絶対に上書きせず医師の原文を完全保護！）
        if (!hasExistingEditorText && cleaned) {
          setInputText(cleaned);
        }
      }
    });

    // 切断監視
    ble.setOnDisconnect(() => {
      setIsBleConnected(false);
      showToast('warning', 'T-Dongle-S3 とのBluetooth接続が切断されました。');
    });

    const handleState = (state: string) => {
      setIsBleConnected(state === 'connected');
    };
    ble.on('stateChange', handleState);

    // 以前ペアリング済みのドングルがあればサイレント自動再接続
    ble.tryAutoReconnect().then((ok) => {
      if (ok) {
        setIsBleConnected(true);
        showToast('success', `T-Dongle-S3 (Dr.Dongly v${APP_VERSION}) と自動再接続しました！`);
      }
    });

    return () => {
      removeAckListener();
      removePrinterComplete();
      ble.off('stateChange', handleState);
    };
  }, [showToast, updateEhrSyncStatus]);

  // 実機BLE接続ハンドラ
  const handleConnectBle = async () => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      showToast('warning', 'プレビュー枠内(iframe)ではBLEが制限されます。スマートフォンまたは独立タブで開いてください。');
      return;
    }

    try {
      if (isBleConnected) {
        bleManager.disconnect();
        setIsBleConnected(false);
        showToast('info', 'BLE接続を切断しました。');
        return;
      }

      showToast('info', 'T-Dongle-S3 デバイスをスキャンしています...');
      const ok = await bleManager.connect();
      if (ok) {
        setIsBleConnected(true);
        showToast('success', `T-Dongle-S3 (Dr.Dongly v${APP_VERSION}) との接続に成功しました！`);
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('DEVICE_CANCELLED') || errMsg.includes('User cancelled')) {
        showToast('info', 'デバイス選択がキャンセルされました。');
      } else {
        showToast('error', `Bluetooth接続失敗: ${errMsg}`);
      }
    }
  };

  // 電カル送信ハンドラ (Sudachi Mode C 長単位結合 ➔ v20.1 HYBRIDキーストローク送出 ➔ 自動打鍵転送)
  const handleSendDirect = async () => {
    if (!inputText.trim()) {
      showToast('warning', '送信するカルテ所見が入力されていません。');
      return;
    }

    if (!isBleConnected) {
      showToast('warning', 'T-Dongle-S3 が未接続です。先にBluetooth接続を行ってください。');
      try {
        await handleConnectBle();
      } catch {}
      return;
    }

    try {
      setIsSending(true);
      setTransmissionProgress(5);
      setTransmissionStage('長単位結合コンパイル中...');

      // 【系統A：外部ループ】送信テキストをバッファ (電カル吸い上げ時の正解ターゲット)
      lastSentTextRef.current = inputText;

      // 形態素辞書（32万語）のロード完了を保証（未ロード時のみ非同期ロード）
      await ensureLexiconLoaded();

      // Sudachi Mode C 形態素解析 & v20.1 HYBRID エンコード
      const session: PreparedSession = buildTransmissionSession(
        inputText,
        DispatchMode.MODE_HYBRID_UNICODE,
        {
          enablePreprocessor: true,
          enableImeBoost: true,
        }
      );

      // BLEチャンク送出 & 自動打鍵トリガー & 完了待機
      const sent = await bleManager.transmitSession(session, (pct, stage) => {
        setTransmissionProgress(pct);
        setTransmissionStage(stage);
      });

      if (!sent) {
        throw new Error('ドングルからの完了応答がタイムアウトしました。打鍵が完了していない可能性があります。カルテ画面を確認してください。');
      }

      showToast('success', '電子カルテへの自動打鍵が完了しました！');
    } catch (err: any) {
      if (err?.message === 'TRANSMISSION_ABORTED') {
        showToast('warning', '電子カルテへの転送を中断しました。');
      } else if (err?.message?.includes('ERR_USB_NOT_READY')) {
        showToast('error', 'ドングルがカルテPCにUSB接続されていません（紫色LED）。PCのUSBポートに挿入してください。');
      } else {
        showToast('error', `送信エラー: ${err?.message || err}`);
      }
    } finally {
      setIsSending(false);
      setTransmissionProgress(0);
      setTransmissionStage('');
    }
  };

  // 転送中断ハンドラ
  const handleAbortTransfer = async () => {
    try {
      await bleManager.abortTransmission();
      setIsSending(false);
      showToast('warning', '電子カルテへの転送を中断しました（ドングルメモリ消去済）。');
    } catch (err: any) {
      setIsSending(false);
      showToast('error', `中断処理エラー: ${err?.message || err}`);
    }
  };

  // モーダルクローズ時のビューポート強制原点復帰（ハンバーガーボタン画面外消失の完全防止）
  const resetViewportScroll = useCallback(() => {
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }
  }, []);

  // 統合検索モーダルを開く
  const handleOpenSearch = (initialTab: any = 'all') => {
    setMedicalSearchInitialTab(initialTab);
    setIsMedicalSearchOpen(true);
  };

  return (
    <div className="w-full h-[100dvh] overflow-hidden bg-[#0F172A] overscroll-none touch-manipulation">
      {/* 臨床通知トースト (最前面通知) */}
      {toastNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] max-w-sm w-[90%] pointer-events-none animate-in fade-in slide-in-from-top duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs font-semibold flex items-center gap-2.5 ${
              toastNotice.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-[0_4px_20px_rgba(16,185,129,0.3)]'
                : toastNotice.type === 'warning'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/60 shadow-[0_4px_20px_rgba(245,158,11,0.3)]'
                : toastNotice.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/60 shadow-[0_4px_20px_rgba(244,63,94,0.3)]'
                : 'bg-slate-900/90 text-slate-200 border-slate-700 shadow-xl'
            }`}
          >
            <span className="text-sm">
              {toastNotice.type === 'success' && '✅'}
              {toastNotice.type === 'warning' && '⚠️'}
              {toastNotice.type === 'error' && '🛑'}
              {toastNotice.type === 'info' && 'ℹ️'}
            </span>
            <span className="flex-1 leading-snug">{toastNotice.message}</span>
          </div>
        </div>
      )}

      {/* 画面隅の電カル照合・自己学習ステータスバッジ (軽量フローティング) */}
      {ehrSyncStatus.status !== 'idle' && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <button
            type="button"
            onClick={() => setIsLearnedDictOpen(true)}
            className={`px-3.5 py-1.5 rounded-full border shadow-xl backdrop-blur-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
              ehrSyncStatus.status === 'syncing'
                ? 'bg-cyan-950/90 text-cyan-200 border-cyan-500/60 shadow-[0_4px_16px_rgba(6,182,212,0.35)]'
                : ehrSyncStatus.status === 'verified'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-[0_4px_16px_rgba(16,185,129,0.35)]'
                : 'bg-amber-950/90 text-amber-200 border-amber-500/60 shadow-[0_4px_16px_rgba(245,158,11,0.35)]'
            }`}
            title="クリックで自己学習辞書を開く"
          >
            <span
              className={`text-sm ${
                ehrSyncStatus.status === 'syncing' ? 'inline-block animate-spin' : ''
              }`}
            >
              {ehrSyncStatus.status === 'syncing' && '🔄'}
              {ehrSyncStatus.status === 'verified' && '✓'}
              {ehrSyncStatus.status === 'learning' && '⚡'}
            </span>
            <span className="tracking-wide">{ehrSyncStatus.text}</span>
            <span className="text-[10px] text-slate-400 border-l border-slate-700 pl-1.5 ml-0.5">
              辞書
            </span>
          </button>
        </aside>
      )}

      {/* ネイティブ風PWA仕様 メインレイアウト */}
      <NativePwaEdgeLayout
        inputText={inputText}
        setInputText={setInputText}
        isBleConnected={isBleConnected}
        isSending={isSending}
        onConnectBle={handleConnectBle}
        onSendSession={handleSendDirect}
        onAbortTransfer={handleAbortTransfer}
        onOpenSearch={handleOpenSearch}
        onOpenCoprocessor={() => {
          prePullOriginalTextRef.current = inputText;
          setIsCoprocessorModalOpen(true);
        }}
        onOpenWebLlm={(style?: any) => {
          setAiModalInitialStyle(style || 'soap');
          setIsAiModalOpen(true);
        }}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        onOpenCameraOcr={() => setIsCameraOcrOpen(true)}
        onLearnAsrDiff={learnFromAsrDiff}
        onAhoCorasickReplace={(text) => replaceWithLearnedDict(text)}
        whisperInitialPrompt={getWhisperInitialPrompt()}
        onOpenLearnedDict={() => setIsLearnedDictOpen(true)}
        learnedDictCount={promotedEntries.length}
      />

      {/* 臨床モーダル群 (オンデマンド遅延マウント) */}
      <Suspense fallback={null}>
        {isMedicalSearchOpen && (
          <MedicalDataSearchModal
            isOpen={isMedicalSearchOpen}
            onClose={() => {
              setIsMedicalSearchOpen(false);
              resetViewportScroll();
            }}
            inputText={inputText}
            initialTab={medicalSearchInitialTab}
            onInsertText={(text) => {
              setInputText((prev) => cleanExtractedMedicalText(prev ? `${prev}\n${text}` : text));
            }}
          />
        )}

        {isCoprocessorModalOpen && (
          <MedicalCoprocessorModal
            isOpen={isCoprocessorModalOpen}
            onClose={() => {
              setIsCoprocessorModalOpen(false);
              resetViewportScroll();
            }}
            isBleConnected={isBleConnected}
            originalText={inputText || lastSentTextRef.current}
            onLearnDiff={learnFromImeDiff}
            onOpenLearnedDict={() => setIsLearnedDictOpen(true)}
            onWriteBackToChart={async (text: string) => {
              const cleaned = cleanExtractedMedicalText(text);
              setInputText(cleaned);
              lastSentTextRef.current = cleaned;
              const session = buildTransmissionSession(cleaned, DispatchMode.MODE_HYBRID_UNICODE);
              if (isBleConnected) {
                const sent = await bleManager.transmitSession(session);
                if (!sent) {
                  showToast('error', 'ドングルからの完了応答がタイムアウトしました。カルテ画面を確認してください。');
                }
              }
            }}
          />
        )}

        {isAiModalOpen && (
          <AiAssistModal
            isOpen={isAiModalOpen}
            onClose={() => {
              setIsAiModalOpen(false);
              resetViewportScroll();
            }}
            originalText={inputText}
            initialStyle={aiModalInitialStyle}
            isBleConnected={isBleConnected}
            onApplyFormattedText={(text: string) => {
              const cleaned = cleanExtractedMedicalText(text);
              // 【系統B：SLM整形によるASR誤認識の自動自己学習】
              if (inputText && cleaned && inputText !== cleaned) {
                learnFromAsrDiff(inputText, cleaned).catch((err) => {
                  console.warn('[AutoLearn ASR SLM] 学習エラー:', err);
                });
              }
              setInputText(cleaned);
              showToast('success', '生成ドキュメントをカルテ領域に反映しました！');
            }}
            onDirectSendToEmr={async (text: string) => {
              const cleaned = cleanExtractedMedicalText(text);
              setInputText(cleaned);
              lastSentTextRef.current = cleaned;
              if (isBleConnected) {
                const session = buildTransmissionSession(cleaned, DispatchMode.MODE_HYBRID_UNICODE);
                const sent = await bleManager.transmitSession(session);
                if (sent) {
                  showToast('success', '生成ドキュメントを電子カルテへUSB-HID直接打鍵しました！');
                } else {
                  showToast('error', 'ドングルからの完了応答がタイムアウトしました。カルテ画面を確認してください。');
                }
              } else {
                showToast('info', 'カルテに反映しました（BLE接続後に「電カル送信」で打鍵できます）。');
              }
            }}
          />
        )}

        {isLearnedDictOpen && (
          <LearnedDictionaryModal
            isOpen={isLearnedDictOpen}
            onClose={() => {
              setIsLearnedDictOpen(false);
              resetViewportScroll();
            }}
            entries={learnedEntries}
            onAddPair={recordPair}
            onDeleteEntry={deleteEntry}
            whisperPrompt={getWhisperInitialPrompt()}
          />
        )}

        {isTemplateModalOpen && (
          <TemplateManagerModal
            isOpen={isTemplateModalOpen}
            onClose={() => {
              setIsTemplateModalOpen(false);
              resetViewportScroll();
            }}
            currentInputText={inputText}
            templates={templates}
            onApplyTemplate={(content: string, mode: 'replace' | 'append') => {
              const cleanedContent = cleanExtractedMedicalText(content);
              if (mode === 'append') {
                setInputText((prev) => cleanExtractedMedicalText(prev ? `${prev}\n\n${cleanedContent}` : cleanedContent));
              } else {
                setInputText(cleanedContent);
              }
            }}
            onSaveTemplate={(newTmpl: MedicalTemplate) => {
              setTemplates((prev) => {
                const updated = [...prev, newTmpl];
                try {
                  localStorage.setItem(
                    STORAGE_KEY_TEMPLATES,
                    JSON.stringify(updated.filter((t) => t.isCustom))
                  );
                } catch {}
                return updated;
              });
              showToast('success', `定型文「${newTmpl.title}」を保存しました。`);
            }}
            onDeleteTemplate={(templateId: string) => {
              setTemplates((prev) => {
                const updated = prev.filter((t) => t.id !== templateId);
                try {
                  localStorage.setItem(
                    STORAGE_KEY_TEMPLATES,
                    JSON.stringify(updated.filter((t) => t.isCustom))
                  );
                } catch {}
                return updated;
              });
              showToast('info', '定型文を削除しました。');
            }}
          />
        )}

        {isCameraOcrOpen && (
          <CameraOcrModal
            isOpen={isCameraOcrOpen}
            onClose={() => {
              setIsCameraOcrOpen(false);
              resetViewportScroll();
            }}
            onApplyText={(extracted: string, mode: 'replace' | 'append') => {
              const cleanedExtracted = cleanExtractedMedicalText(extracted);
              if (mode === 'append') {
                setInputText((prev) => cleanExtractedMedicalText(prev ? `${prev}\n\n${cleanedExtracted}` : cleanedExtracted));
              } else {
                setInputText(cleanedExtracted);
              }
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
