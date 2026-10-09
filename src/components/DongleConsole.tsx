import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  Bluetooth, 
  Usb, 
  ShieldCheck, 
  Radio, 
  Terminal,
  Activity,
  Download,
  FileSpreadsheet,
  FileText,
  Copy,
  Check,
  Trash2,
  Clock,
  Gauge,
  Send,
  Lightbulb
} from 'lucide-react';
import { SystemState, LedStatus, CommunicationLogEntry, SessionTransmissionStatus } from '../types';
import { LED_DEFINITIONS } from '../utils/virtualDongle';
import { playMacBeep, playSosumi } from '../utils/macAudio';

const STORAGE_KEY_AUTO_ON_COMPLETE = 'drvoice_auto_csv_on_complete_v1';
const STORAGE_KEY_AUTO_INTERVAL = 'drvoice_auto_csv_interval_v1';

interface DongleConsoleProps {
  currentState: SystemState;
  ledStatus: LedStatus;
  isUsbMounted: boolean;
  isBleConnected: boolean;
  isVirtualMode: boolean;
  transmissionStatus: SessionTransmissionStatus | null;
  logs: CommunicationLogEntry[];
  onPressButton: () => void;
  onClearLogs: () => void;
  onToggleUsbMounted: () => void;
  onSendPing?: () => Promise<{ rttMs: number }>;
  onSendWipe?: () => Promise<boolean>;
  onSendLedTest?: () => Promise<boolean>;
  onRequestStatus?: () => Promise<string>;
  onRequestDictInfo?: () => Promise<string>;
  onClose?: () => void;
}

export const DongleConsole: React.FC<DongleConsoleProps> = ({
  currentState,
  ledStatus,
  isUsbMounted,
  isBleConnected,
  isVirtualMode,
  transmissionStatus,
  logs,
  onPressButton,
  onClearLogs,
  onToggleUsbMounted,
  onSendPing,
  onSendWipe,
  onSendLedTest,
  onRequestStatus,
  onRequestDictInfo,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ rttMs: number; time: string } | null>(null);
  const [isOperating, setIsOperating] = useState<string | null>(null);

  const showNotice = (msg: string) => {
    setExportNotice(msg);
    setTimeout(() => setExportNotice((cur) => (cur === msg ? null : cur)), 3500);
  };

  const handlePing = async () => {
    if (!onSendPing) return;
    setIsOperating('ping');
    try {
      playMacBeep();
      const res = await onSendPing();
      setPingResult({ rttMs: res.rttMs, time: new Date().toLocaleTimeString() });
      showNotice(`【BLE通信疎通】Ping応答を確認 (RTT: ${res.rttMs}ms)`);
    } catch (e: any) {
      showNotice(`Pingエラー: ${e.message}`);
    } finally {
      setIsOperating(null);
    }
  };

  const handleLedTest = async () => {
    if (!onSendLedTest) return;
    setIsOperating('led');
    try {
      playMacBeep();
      await onSendLedTest();
      showNotice('【実機LEDテスト】発光点検完了');
    } catch (e: any) {
      showNotice(`LEDテストエラー: ${e.message}`);
    } finally {
      setIsOperating(null);
    }
  };

  const handleRemoteWipe = async () => {
    if (!onSendWipe) return;
    setIsOperating('wipe');
    try {
      playSosumi();
      await onSendWipe();
      showNotice('【メモリ完全消去】AtomS3Uのメモリゼロクリアを実行しました');
    } catch (e: any) {
      showNotice(`消去エラー: ${e.message}`);
    } finally {
      setIsOperating(null);
    }
  };

  const handleStatusCheck = async () => {
    if (!onRequestStatus) return;
    setIsOperating('status');
    try {
      playMacBeep();
      const resp = await onRequestStatus();
      showNotice(`【ステータス取得】${resp}`);
    } catch (e: any) {
      showNotice(`ステータス取得エラー: ${e.message}`);
    } finally {
      setIsOperating(null);
    }
  };

  const handleDictInfoCheck = async () => {
    if (!onRequestDictInfo) return;
    setIsOperating('dict');
    try {
      playMacBeep();
      const resp = await onRequestDictInfo();
      showNotice(`【SPIFFS辞書状態】${resp}`);
    } catch (e: any) {
      showNotice(`辞書状態取得エラー: ${e.message}`);
    } finally {
      setIsOperating(null);
    }
  };

  const handleCopyLogs = async () => {
    if (logs.length === 0) {
      showNotice('コピー可能なログがありません');
      return;
    }
    const text = logs
      .map((log) => `[${log.timestamp}] [${log.direction.toUpperCase()}] [${log.tag}] ${log.message}${log.hex ? ` (${log.hex})` : ''}`)
      .join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      playMacBeep();
      showNotice('ログをクリップボードにコピーしました');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showNotice('クリップボードへのコピーに失敗しました');
    }
  };

  const handleDownloadTextLogs = () => {
    if (logs.length === 0) return;
    const bodyLines = logs.map((log) => `[${log.timestamp}] [${log.direction.toUpperCase()}] [${log.tag}] ${log.message}`);
    const blob = new Blob([bodyLines.join('\r\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `drvoice_dongle_log.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice(`テキストログ (${logs.length}件) をダウンロードしました`);
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}>
      {/* Toast Notice */}
      {exportNotice && (
        <div className="fixed top-8 right-6 z-50 bg-white border-2 border-black p-2 shadow-[3px_3px_0_#000] text-xs flex items-center gap-2 select-none animate-in fade-in">
          <span className="font-bold">ℹ</span>
          <span>{exportNotice}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ★ SYSTEM 7 ウィンドウ: どんぐり君 (AtomS3U) インスペクター */}
      {/* ========================================================================= */}
      <div className="mac-window w-full">
        {/* ウィンドウ タイトルバー */}
        <div className="h-6 mac-title-stripes border-b border-black flex items-center justify-between px-2 select-none">
          <button
            onClick={() => {
              playMacBeep();
              if (onClose) onClose();
            }}
            className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] active:bg-black cursor-pointer flex items-center justify-center shrink-0"
            title="閉じる"
          />

          <div className="bg-white border border-black px-2 sm:px-3 py-0.2 font-bold text-xs tracking-wider flex items-center gap-1 sm:gap-2 truncate min-w-0">
            <span className="truncate">どんぐり君 (AtomS3U) インスペクター</span>
          </div>

          <div className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 border border-black" />
          </div>
        </div>

        {/* ウィンドウ内部 */}
        <div className="p-3 bg-white space-y-4">
          {/* ハードウェア実動モニタ (Classic 1-bit Hardware Mockup) */}
          <div className="border border-black p-3 bg-white flex flex-col md:flex-row items-center justify-between gap-4">
            {/* 1ビット風 AtomS3U ドングル外観 */}
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-bold mb-1">M5Stack AtomS3U (ESP32-S3FN8 / 8MB)</div>

              <div className="flex items-center">
                {/* USB-A オスプラグ */}
                <div
                  onClick={() => {
                    playMacBeep();
                    onToggleUsbMounted();
                  }}
                  className={`w-9 h-14 border border-black flex flex-col items-center justify-center cursor-pointer shadow-[1px_1px_0_#000] ${
                    isUsbMounted ? 'bg-white' : 'mac-progress-stripe'
                  }`}
                  title={isVirtualMode ? 'クリックでUSB抜去/挿入' : '実機USBステータス'}
                >
                  <span className="text-[9px] font-bold">USB-A</span>
                  <span className="text-[8px]">{isUsbMounted ? '挿入' : '抜去'}</span>
                </div>

                {/* AtomS3U シャーシ */}
                <div className="w-32 h-32 border-2 border-black bg-white shadow-[2px_2px_0_#000] p-2 flex flex-col justify-between">
                  <div className="flex justify-between items-center text-[9px] font-bold">
                    <span>AtomS3U</span>
                    <span>GPIO 35/41</span>
                  </div>

                  {/* 中央 RGB LED (WS2812) */}
                  <div className="flex flex-col items-center justify-center my-auto">
                    <div
                      className="w-8 h-8 rounded-full border-2 border-black flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: ledStatus.hex,
                        boxShadow: `0 0 10px ${ledStatus.hex}`,
                      }}
                    >
                      <span className="text-white text-[9px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                        ●
                      </span>
                    </div>
                    <span className="text-[10px] font-bold mt-1">
                      {ledStatus.colorName.split(' ')[0]}
                    </span>
                  </div>

                  {/* 正面ボタンスイッチ (M5.BtnA, GPIO 41) */}
                  <button
                    onClick={() => {
                      playMacBeep();
                      onPressButton();
                    }}
                    className={`mac-btn text-[10px] py-1 font-bold ${
                      currentState === SystemState.STATE_READY_TO_TYPE ? 'bg-black text-white' : ''
                    }`}
                  >
                    <span>{currentState === SystemState.STATE_READY_TO_TYPE ? '打鍵送出 🔘' : 'BtnA (GPIO 41)'}</span>
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-gray-700 mt-1">※ボタン押下で打鍵ディスパッチ</div>
            </div>

            {/* ハードウェア稼働メトリクス */}
            <div className="flex-1 w-full space-y-2 border-t md:border-t-0 md:border-l border-black pt-3 md:pt-0 md:pl-4 text-xs">
              <div className="flex items-center justify-between border-b border-black pb-1.5 font-bold">
                <span>システム稼働ステータス</span>
                <div className="flex items-center gap-2">
                  {pingResult && (
                    <span className="border border-black px-1.5 py-0.2 bg-white text-[10px]">
                      RTT: {pingResult.rttMs}ms
                    </span>
                  )}
                  <span className="text-[11px]">
                    {isVirtualMode ? '仮想モード稼働中' : isBleConnected ? '実機接続中' : '実機未接続'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="border border-black p-2 bg-white">
                  <div className="text-[10px] text-gray-700 font-bold">USB-HID状態</div>
                  <div className="font-bold text-xs mt-0.5">
                    {isUsbMounted ? 'マウント済 (単独HID)' : '未接続 (紫点灯)'}
                  </div>
                </div>

                <div className="border border-black p-2 bg-white">
                  <div className="text-[10px] text-gray-700 font-bold">BLE接続状態</div>
                  <div className="font-bold text-xs mt-0.5">
                    {isBleConnected ? 'ペアリング完了' : '待機中 (青点灯)'}
                  </div>
                </div>

                <div className="border border-black p-2 bg-white">
                  <div className="text-[10px] text-gray-700 font-bold">ステートマシン</div>
                  <div className="font-bold text-xs mt-0.5 truncate">
                    {currentState}
                  </div>
                </div>
              </div>

              <div className="border border-black p-2 bg-white text-xs leading-relaxed">
                <strong>{ledStatus.colorName}:</strong> {ledStatus.description}。
                {currentState === SystemState.STATE_READY_TO_TYPE && (
                  <span className="font-bold ml-1">
                    カルテ画面の入力欄をクリックし、正面ボタンを押下してください。
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 実動診断ツールバー */}
          <div className="border border-black p-2.5 bg-white space-y-2">
            <div className="font-bold text-xs border-b border-black pb-1">
              実動ハードウェア診断ツール
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                onClick={() => {
                  playMacBeep();
                  onPressButton();
                }}
                disabled={currentState !== SystemState.STATE_READY_TO_TYPE && !isVirtualMode}
                className="mac-btn py-1.5 font-bold"
              >
                <span>リモート打鍵送出</span>
              </button>

              <button
                onClick={handleDictInfoCheck}
                disabled={!isBleConnected && !isVirtualMode}
                className="mac-btn py-1.5 font-bold bg-amber-50"
                title="AtomS3Uの5.87MB SPIFFS辞書(約5万語)の登録件数と稼働状態を取得"
              >
                <span>SPIFFS 辞書状態 💾</span>
              </button>

              <button
                onClick={handlePing}
                disabled={!isBleConnected && !isVirtualMode}
                className="mac-btn py-1.5"
              >
                <span>BLE Ping 疎通診断</span>
              </button>

              <button
                onClick={handleLedTest}
                disabled={!isBleConnected && !isVirtualMode}
                className="mac-btn py-1.5"
              >
                <span>LED 発光点検</span>
              </button>

              <button
                onClick={handleRemoteWipe}
                disabled={!isBleConnected && !isVirtualMode}
                className="mac-btn py-1.5 font-bold text-red-700"
              >
                <span>メモリ消去 (Wipe)</span>
              </button>
            </div>
          </div>

          {/* リアルタイム通信ログ & HEXインスペクター */}
          <div className="border border-black p-2.5 bg-white space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold">リアルタイム通信ログ ({logs.length}件)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className="mac-btn text-[11px] py-0.5"
                >
                  <span>{copied ? 'コピー完了 ✓' : 'ログコピー'}</span>
                </button>

                <button
                  onClick={handleDownloadTextLogs}
                  disabled={logs.length === 0}
                  className="mac-btn text-[11px] py-0.5"
                >
                  <span>ログ保存 (.txt)</span>
                </button>

                <button
                  onClick={() => {
                    playSosumi();
                    onClearLogs();
                  }}
                  disabled={logs.length === 0}
                  className="mac-btn text-[11px] py-0.5"
                >
                  <span>全消去</span>
                </button>
              </div>
            </div>

            {/* Monaco モノスペース ターミナル */}
            <div
              className="h-56 overflow-y-auto border border-black p-2 bg-white text-xs font-mono select-text space-y-1 shadow-[inset_1px_1px_0_#000]"
              style={{ fontFamily: "'Monaco', 'Courier New', monospace" }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500 py-8 text-center text-xs">
                  通信ログはまだありません。カルテ送信やPingテストを実行するとここに記録されます。
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="leading-tight flex items-start gap-1">
                    <span className="text-gray-500 shrink-0">[{log.timestamp}]</span>
                    <span className={`font-bold shrink-0 ${log.direction === 'tx' ? 'underline' : ''}`}>
                      [{log.direction.toUpperCase()}]
                    </span>
                    <span className="font-bold shrink-0">[{log.tag}]</span>
                    <span className="break-all">{log.message}</span>
                    {log.hex && (
                      <span className="text-gray-600 text-[10px] shrink-0 font-mono">
                        ({log.hex})
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
