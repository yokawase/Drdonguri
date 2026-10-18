import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { bleManager } from './utils/webBluetooth';
import { buildTransmissionSession, PreparedSession } from './utils/packetBuilder';
import { DispatchMode } from './types';
import { APP_VERSION, LATEST_FIRMWARE_VERSION } from './version';
import { NativePwaEdgeLayout } from './components/NativePwaEdgeLayout';

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

export default function App() {
  // 入力テキスト (Local-first: 自動永続化)
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_BUFFER) || '';
    }
    return '';
  });

  // テキスト更新時に自動保存
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_BUFFER, inputText);
    }
  }, [inputText]);

  // ドングルBLE接続 & 送信状態
  const [isBleConnected, setIsBleConnected] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [transmissionProgress, setTransmissionProgress] = useState<number>(0);
  const [transmissionStage, setTransmissionStage] = useState<string>('');

  // モーダル開閉ステート
  const [isMedicalSearchOpen, setIsMedicalSearchOpen] = useState(false);
  const [medicalSearchInitialTab, setMedicalSearchInitialTab] = useState<any>('all');
  const [isCoprocessorModalOpen, setIsCoprocessorModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
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

    // 切断監視
    ble.setOnDisconnect(() => {
      setIsBleConnected(false);
      showToast('warning', 'T-Dongle-S3 とのBluetooth接続が切断されました。');
    });

    return () => {
      removeAckListener();
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

  // 電カル送信ハンドラ (Sudachi Mode C 長単位結合 ➔ v20.1 HYBRIDキーストローク送出)
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
      setTransmissionStage('コンパイル中...');

      // Sudachi Mode C 形態素解析 & v20.1 HYBRID エンコード
      const session: PreparedSession = buildTransmissionSession(
        inputText,
        DispatchMode.MODE_HYBRID_UNICODE,
        {
          enablePreprocessor: true,
          enableImeBoost: true,
        }
      );

      // BLEチャンク送出
      await bleManager.transmitSession(session, (pct, stage) => {
        setTransmissionProgress(pct);
        setTransmissionStage(stage);
      });

      showToast('info', '送信完了！カルテPC側への自動打鍵を開始しています...');
    } catch (err: any) {
      setIsSending(false);
      showToast('error', `送信エラー: ${err?.message || err}`);
    }
  };

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
        onOpenSearch={handleOpenSearch}
        onOpenCoprocessor={() => setIsCoprocessorModalOpen(true)}
        onOpenWebLlm={() => setIsAiModalOpen(true)}
        onOpenTemplates={() => setIsTemplateModalOpen(true)}
        onOpenCameraOcr={() => setIsCameraOcrOpen(true)}
      />

      {/* 臨床モーダル群 (オンデマンド遅延マウント) */}
      <Suspense fallback={null}>
        {isMedicalSearchOpen && (
          <MedicalDataSearchModal
            isOpen={isMedicalSearchOpen}
            onClose={() => setIsMedicalSearchOpen(false)}
            inputText={inputText}
            initialTab={medicalSearchInitialTab}
            onInsertText={(text) => {
              setInputText((prev) => (prev ? `${prev}\n${text}` : text));
            }}
          />
        )}

        {isCoprocessorModalOpen && (
          <MedicalCoprocessorModal
            isOpen={isCoprocessorModalOpen}
            onClose={() => setIsCoprocessorModalOpen(false)}
            isBleConnected={isBleConnected}
            onWriteBackToChart={async (text: string) => {
              setInputText(text);
              const session = buildTransmissionSession(text, DispatchMode.MODE_HYBRID_UNICODE);
              if (isBleConnected) {
                await bleManager.transmitSession(session);
              }
            }}
          />
        )}

        {isAiModalOpen && (
          <AiAssistModal
            isOpen={isAiModalOpen}
            onClose={() => setIsAiModalOpen(false)}
            originalText={inputText}
            onApplyFormattedText={(text: string) => {
              setInputText(text);
            }}
          />
        )}

        {isTemplateModalOpen && (
          <TemplateManagerModal
            isOpen={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            currentInputText={inputText}
            templates={[]}
            onApplyTemplate={(content: string, mode: 'replace' | 'append') => {
              if (mode === 'append') {
                setInputText((prev) => (prev ? `${prev}\n\n${content}` : content));
              } else {
                setInputText(content);
              }
            }}
            onSaveTemplate={() => {}}
            onDeleteTemplate={() => {}}
          />
        )}

        {isCameraOcrOpen && (
          <CameraOcrModal
            isOpen={isCameraOcrOpen}
            onClose={() => setIsCameraOcrOpen(false)}
            onApplyText={(extracted: string, mode: 'replace' | 'append') => {
              if (mode === 'append') {
                setInputText((prev) => (prev ? `${prev}\n\n${extracted}` : extracted));
              } else {
                setInputText(extracted);
              }
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
