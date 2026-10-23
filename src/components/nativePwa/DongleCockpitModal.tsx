import React from 'react';
import { X, Sun } from 'lucide-react';
import { DongleHardwareCockpit } from './DongleHardwareCockpit';
import { CompiledStreamPreview, CopilotData, ChartContext } from './types';

interface DongleCockpitModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSending: boolean;
  isBleConnected: boolean;
  lcdPage: 0 | 1 | 2 | 3;
  lcdBrightness: number;
  ledBrightness: number;
  handleSelectLcdPage: (page: 0 | 1 | 2 | 3) => void;
  handleLedBrightnessChange: (pct: number) => void;
  handleLcdBrightnessChange: (pct: number) => void;
  compiledStreamPreview: CompiledStreamPreview;
  copilotData: CopilotData;
  chartContext: ChartContext;
}

export const DongleCockpitModal: React.FC<DongleCockpitModalProps> = ({
  isOpen,
  onClose,
  ...cockpitProps
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-md max-h-[85vh] bg-[#0F172A] border border-sky-500/50 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
          <span className="text-xs sm:text-sm font-bold text-sky-300 flex items-center gap-1.5">
            <Sun className="w-4 h-4 text-amber-400" />
            <span>T-Dongle-S3 液晶 ＆ LED輝度調節</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <DongleHardwareCockpit compact={false} {...cockpitProps} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold shrink-0 transition-colors cursor-pointer"
        >
          閉じる
        </button>
      </div>
    </div>
  );
};
