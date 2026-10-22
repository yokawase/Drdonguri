import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { bleManager } from './utils/webBluetooth';
import { buildTransmissionSession, PreparedSession } from './utils/packetBuilder';
import { DispatchMode, DEFAULT_PRESET_TEMPLATES, MedicalTemplate } from './types';
import { APP_VERSION } from './version';
import { NativePwaEdgeLayout } from './components/NativePwaEdgeLayout';
import { cleanExtractedMedicalText, DEFAULT_SAMPLE_CHART_TEXT } from './utils/chartTextCleaner';
import { prewarmWebLlmEngine } from './services/webLlmService';

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

const STORAGE_KEY_BUFFER = 'drvoice_dispatcher_buf';
const STORAGE_KEY_TEMPLATES = 'drvoice_custom_templates';

export default function App() {
  // 入力テキスト (Local-first: 自動永続化 ＆ 無駄なスペース・改行削除)
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_BUFFER);
      if (saved && saved.trim()) {
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

  // 臨床通知トースト (自動消退)
  const [toastNotice, setToastNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  const showToast = useCallback((type: 'info' | 'success' | 'warning' | 'error', message: string, duration = 3500) => {
    setToastNotice({ type, message });
    setTimeout(() => {
      setToastNotice((cur) => (cur?.message === message ? null : cur));
    }, duration);
  }, []);

  // BLE 接続イベントリスナー登録
  useEffect(() => {
    const ble = bleManager;

    // ACKイベント監視
    const removeAckListener = ble.addAckListener((event) => {
      if (event.ackType === 'USB_REPORTS_SENT') {
        setIsSending(false);
        showToast('success', '【USB打鍵完了】電子カルテPCへの自動入力が正常に完了しました！');
      } else if (event.ackType === 'ALL_PACKETS_READY') {
        showToast('info', '【転送完了】ドングル側で打鍵準備が整いました。');
      } else if (event.ackType === 'PHYSICAL_BTN_PRESSED') {
        showToast('info', 'ドングル本体ボタンが押されました。');
      }
    });

    // 電カルから仮想プリンタ経由で文章が抽出された際、無駄なスペース・改行を自動削除して反映
    const removePrinterComplete = ble.addPrinterCompleteListener((fullText) => {
      const cleaned = cleanExtractedMedicalText(fullText);
      if (cleaned) {
        setInputText(cleaned);
        showToast('success', '【電カル抽出完了】無駄なスペース・改行を削除し、カルテ内容を100%同期しました！');
      }
    });

    // 切断監視
    ble.setOnDisconnect(() => {
      setIsBleConnected(false);
      showToast('warning', 'T-Dongle-S3 とのBluetooth接続が切断されました。');
    });

    return () => {
      removeAckListener();
      removePrinterComplete();
    };
  }, [showToast]);

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
      await bleManager.transmitSession(session, (pct, stage) => {
        setTransmissionProgress(pct);
        setTransmissionStage(stage);
      });

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
        onOpenCoprocessor={() => setIsCoprocessorModalOpen(true)}
        onOpenWebLlm={(style?: any) => {
          setAiModalInitialStyle(style || 'soap');
          setIsAiModalOpen(true);
        }}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        onOpenCameraOcr={() => setIsCameraOcrOpen(true)}
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
            onWriteBackToChart={async (text: string) => {
              const cleaned = cleanExtractedMedicalText(text);
              setInputText(cleaned);
              const session = buildTransmissionSession(cleaned, DispatchMode.MODE_HYBRID_UNICODE);
              if (isBleConnected) {
                await bleManager.transmitSession(session);
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
              setInputText(cleanExtractedMedicalText(text));
              showToast('success', '生成ドキュメントをカルテ領域に反映しました！');
            }}
            onDirectSendToEmr={async (text: string) => {
              const cleaned = cleanExtractedMedicalText(text);
              setInputText(cleaned);
              if (isBleConnected) {
                const session = buildTransmissionSession(cleaned, DispatchMode.MODE_HYBRID_UNICODE);
                await bleManager.transmitSession(session);
                showToast('success', '生成ドキュメントを電子カルテへUSB-HID直接打鍵しました！');
              } else {
                showToast('info', 'カルテに反映しました（BLE接続後に「電カル送信」で打鍵できます）。');
              }
            }}
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
