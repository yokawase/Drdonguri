import React from 'react';
import { playMacBeep } from '../utils/macAudio';
import { LATEST_FIRMWARE_VERSION } from '../data/firmwareSource';

interface AboutMacModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVirtualMode: boolean;
  isBleConnected: boolean;
}

export const AboutMacModal: React.FC<AboutMacModalProps> = ({
  isOpen,
  onClose,
  isVirtualMode,
  isBleConnected,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[480px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-4 text-xs select-none"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        {/* ダイアログ上部: タイトルバー */}
        <div className="border-b-2 border-black pb-2 mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* 1ビット風 Happy Mac / どんぐり君ビットマップ */}
            <div className="w-10 h-10 border border-black bg-white flex items-center justify-center text-2xl shadow-[1px_1px_0_#000]">
              🌰
            </div>
            <div>
              <div className="font-bold text-sm">DrVoice どんぐり君！</div>
              <div className="text-[11px] text-gray-700">Macintosh Classic II Edition (System 7.1)</div>
            </div>
          </div>
          <div className="text-right text-[10px]">
            <div>Version {LATEST_FIRMWARE_VERSION}</div>
            <div>© 1991-2026 Apple / DrVoice DX</div>
          </div>
        </div>

        {/* ハードウェア構成サマリー */}
        <div className="border border-black p-2.5 mb-3 bg-white space-y-1.5 leading-relaxed">
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">対象マイコン:</span>
            <span>M5Stack AtomS3U (ESP32-S3FN8)</span>
          </div>
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">フラッシュ容量:</span>
            <span>8,192 KB (QD, No PSRAM 厳守)</span>
          </div>
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">内部SRAM:</span>
            <span>512 KB</span>
          </div>
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">USB動作構成:</span>
            <span>USB Composite (HID打鍵 ＋ 仮想プリンター吸い上げ)</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">稼働ステータス:</span>
            <span className="font-bold">
              {isBleConnected ? '実機 BLE 接続中 (緑点灯)' : isVirtualMode ? '仮想シミュレータ動作中' : 'BLE待機中 (青点灯)'}
            </span>
          </div>
        </div>

        {/* 懐かしのメモリ消費量メーター (System 7 伝統のバーグラフ) */}
        <div className="border border-black p-2.5 mb-4 bg-white space-y-2">
          <div className="font-bold mb-1 flex justify-between">
            <span>メモリ (RAM) 使用状況</span>
            <span>8,192 KB</span>
          </div>

          {/* バー 1: System Software */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span>System Software 7.1</span>
              <span>1,850 KB</span>
            </div>
            <div className="h-3 w-full border border-black p-0.5 bg-white">
              <div className="h-full bg-black w-[22%]" />
            </div>
          </div>

          {/* バー 2: DrVoice SendText Application */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span>DrVoice SendText (JIS/IME)</span>
              <span>2,340 KB</span>
            </div>
            <div className="h-3 w-full border border-black p-0.5 bg-white">
              <div className="h-full bg-black w-[35%]" />
            </div>
          </div>

          {/* バー 3: Largest Unused Block */}
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span>空きメモリ (カルテ展開領域)</span>
              <span>4,002 KB</span>
            </div>
            <div className="h-3 w-full border border-black p-0.5 bg-white">
              <div className="h-full mac-progress-stripe w-[43%]" />
            </div>
          </div>
        </div>

        {/* 下部ボタン */}
        <div className="flex justify-end gap-2">
          <div className="mac-btn-default-wrapper">
            <button
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="mac-btn mac-btn-default px-6 py-1 font-bold"
            >
              OK ↩
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
