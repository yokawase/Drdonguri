import React from 'react';
import { playMacBeep, playSosumi } from '../utils/macAudio';
import { LATEST_FIRMWARE_VERSION } from '../data/firmwareSource';

interface MacDesktopIconsProps {
  onOpenInput: () => void;
  onOpenDongle: () => void;
  onOpenFirmware: () => void;
  onClearChart: () => void;
  hasChartContent: boolean;
}

export const MacDesktopIcons: React.FC<MacDesktopIconsProps> = ({
  onOpenInput,
  onOpenDongle,
  onOpenFirmware,
  onClearChart,
  hasChartContent,
}) => {
  return (
    <div
      className="hidden md:flex flex-col gap-6 fixed right-4 top-10 z-20 select-none text-xs"
      style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
    >
      {/* 1. Macintosh HD (カルテ保存 / 送信メイン) */}
      <button
        onClick={() => {
          playMacBeep();
          onOpenInput();
        }}
        className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
        title="ダブルクリック / クリックでカルテ送信を開く"
      >
        <div className="w-12 h-10 border border-black bg-white shadow-[1px_1px_0_#000] flex flex-col items-center justify-center p-1 group-active:bg-black group-active:text-white">
          <div className="w-8 h-4 border border-black bg-white group-active:bg-white group-active:border-white mb-0.5" />
          <div className="w-8 h-1 bg-black group-active:bg-white" />
        </div>
        <span className="bg-white border border-transparent px-1 group-hover:border-black group-active:bg-black group-active:text-white group-active:border-black">
          Macintosh HD
        </span>
      </button>

      {/* 2. どんぐり君 (AtomS3U ドングル) */}
      <button
        onClick={() => {
          playMacBeep();
          onOpenDongle();
        }}
        className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
        title="AtomS3U どんぐり君インスペクターを開く"
      >
        <div className="w-12 h-10 border border-black bg-white shadow-[1px_1px_0_#000] flex items-center justify-center text-xl group-active:bg-black group-active:text-white">
          🌰
        </div>
        <span className="bg-white border border-transparent px-1 group-hover:border-black group-active:bg-black group-active:text-white group-active:border-black text-center">
          どんぐり君
        </span>
      </button>

      {/* 3. ファームウェア (フロッピーディスク風) */}
      <button
        onClick={() => {
          playMacBeep();
          onOpenFirmware();
        }}
        className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none"
        title={`ファームウェア ${LATEST_FIRMWARE_VERSION} を開く`}
      >
        <div className="w-11 h-11 border border-black bg-white shadow-[1px_1px_0_#000] flex flex-col items-center justify-between p-1 group-active:bg-black group-active:text-white">
          <div className="w-6 h-3 border border-black bg-white group-active:bg-white" />
          <div className="text-[9px] font-bold">FD 8MB</div>
        </div>
        <span className="bg-white border border-transparent px-1 group-hover:border-black group-active:bg-black group-active:text-white group-active:border-black text-center">
          FW {LATEST_FIRMWARE_VERSION}
        </span>
      </button>

      {/* 4. ゴミ箱 (Trash) */}
      <button
        onClick={() => {
          playSosumi();
          onClearChart();
        }}
        className="flex flex-col items-center gap-1 group cursor-pointer focus:outline-none mt-4"
        title={hasChartContent ? 'ゴミ箱をクリックしてカルテを全消去' : 'ゴミ箱（空）'}
      >
        <div className="w-11 h-12 border border-black bg-white shadow-[1px_1px_0_#000] flex flex-col items-center justify-center p-1 group-active:bg-black group-active:text-white relative">
          <div className="text-xl">
            {hasChartContent ? '🗑️' : '🗑️'}
          </div>
          {hasChartContent && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-black rounded-full border border-white" />
          )}
        </div>
        <span className="bg-white border border-transparent px-1 group-hover:border-black group-active:bg-black group-active:text-white group-active:border-black">
          ゴミ箱
        </span>
      </button>
    </div>
  );
};
