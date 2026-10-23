import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { CompiledStreamPreview } from './types';

interface KanjiInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  compiledStreamPreview: CompiledStreamPreview;
}

export const KanjiInspectorModal: React.FC<KanjiInspectorModalProps> = ({
  isOpen,
  onClose,
  compiledStreamPreview,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-lg max-h-[85vh] bg-[#0F172A] border border-emerald-500/50 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-xs sm:text-sm font-bold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>全電子カルテ100%漢字変換確定ストリーム</span>
            </span>
            <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded">
              ALTコード:0件 / 32万語連動
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-[10px] text-slate-300 leading-relaxed shrink-0">
          Google Mozc公式辞書＋DMiME医療辞書＋長単位結合オートマトン（Sudachi Mode C）により、<strong className="text-emerald-300">100%狙った漢字に確定</strong>し、助詞は<strong className="text-amber-300">[H] Space禁止即時Enter</strong>で誤変換を完全遮断します。
        </div>

        <div className="flex-1 overflow-y-auto p-2 rounded-lg bg-slate-950/90 border border-slate-800 flex flex-wrap gap-1 min-h-[140px] max-h-60">
          {compiledStreamPreview.stream.tokens.slice(0, 100).map((tok, i) => {
            const hasBsAnchor = tok.romaji.includes('\x08');
            const badgeStyle =
              tok.tag === 'Z'
                ? hasBsAnchor
                  ? 'bg-teal-950/90 text-teal-200 border-teal-400/60'
                  : 'bg-emerald-950/80 text-emerald-200 border-emerald-500/50'
                : tok.tag === 'K'
                ? 'bg-sky-950/80 text-sky-200 border-sky-500/50'
                : tok.tag === 'H'
                ? 'bg-amber-950/80 text-amber-200 border-amber-500/50'
                : 'bg-purple-950/80 text-purple-200 border-purple-500/50';
            return (
              <span
                key={i}
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono inline-flex items-center gap-1 ${badgeStyle}`}
                title={`[${tok.tag}] ローマ字打鍵: ${tok.romaji.replace(/\x08/g, '[BS]')}`}
              >
                <span className="font-bold opacity-75">[{tok.tag}]</span>
                <span>{tok.surface === '\n' ? '↵改行' : tok.surface}</span>
                {hasBsAnchor && (
                  <span className="text-[8px] px-1 rounded bg-teal-500/30 text-teal-200">
                    ⚓100%確定
                  </span>
                )}
              </span>
            );
          })}
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
