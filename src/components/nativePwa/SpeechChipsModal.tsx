import React from 'react';
import { X } from 'lucide-react';
import { SPEECH_SAMPLE_CHIPS } from '../../services/medicalSpeechDecoder';
import { triggerHaptic } from './types';

interface SpeechChipsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChip: (speech: string, label: string) => void;
}

export const SpeechChipsModal: React.FC<SpeechChipsModalProps> = ({
  isOpen,
  onClose,
  onSelectChip,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[85vh] bg-[#0F172A] border border-amber-500/50 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
          <div className="text-xs sm:text-sm font-bold text-amber-300 flex items-center gap-1.5">
            <span>🎙️</span>
            <span>医療音声解読 推奨発話例文</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 shrink-0">タップすると例文をカルテに即挿入・解読します：</p>
        <div className="flex-1 overflow-y-auto flex flex-wrap gap-1.5 pr-1 min-h-[140px]">
          {SPEECH_SAMPLE_CHIPS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onSelectChip(chip.speech, chip.label);
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-slate-800 hover:bg-amber-950/70 text-slate-200 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 transition-all flex items-center gap-1.5 group cursor-pointer"
              title={`発話: 「${chip.speech}」➔ 自動解読挿入`}
            >
              <span className="font-semibold text-amber-400">{chip.label}</span>
              <span className="text-[10px] text-slate-400 group-hover:text-amber-300">
                ({chip.speech})
              </span>
            </button>
          ))}
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
