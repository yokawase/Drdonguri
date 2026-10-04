import React, { useState } from 'react';
import { 
  Wand2, 
  Check, 
  X, 
  ArrowRight, 
  CheckCircle2, 
  Info, 
  Layers, 
  Pill, 
  Stethoscope, 
  Activity, 
  Type, 
  SlidersHorizontal 
} from 'lucide-react';
import { 
  PREPROCESS_RULES, 
  preprocessMedicalText, 
  PreprocessOptions, 
  PreprocessResult 
} from '../utils/medicalTextPreprocessor';

interface MedicalPreprocessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onApplyText: (processedText: string) => void;
  currentOptions: PreprocessOptions;
  onOptionsChange: (options: PreprocessOptions) => void;
}

export const MedicalPreprocessorModal: React.FC<MedicalPreprocessorModalProps> = ({
  isOpen,
  onClose,
  inputText,
  onApplyText,
  currentOptions,
  onOptionsChange,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'rules'>('preview');

  const result: PreprocessResult = React.useMemo(() => {
    return preprocessMedicalText(inputText, currentOptions);
  }, [inputText, currentOptions]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 via-emerald-700 to-cyan-800 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center border border-white/20 shadow-inner">
              <Wand2 className="w-5 h-5 text-teal-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">カルテテキスト プリプロセッサ</h3>
                <span className="text-[10px] bg-emerald-400/25 border border-emerald-300/40 text-emerald-100 font-mono px-2 py-0.5 rounded-full font-bold">
                  安定置換エンジン
                </span>
              </div>
              <p className="text-xs text-teal-100/90 mt-0.5">
                電カル端末の一般IMEで多発する「感冒➔幹部」「回分➔回文」「錠➔上」「℃文字化け」を自動事前置換
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector & Stats Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              置換プレビュー ({result.totalReplacementCount}件)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'rules'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              置換ルール一覧 ({PREPROCESS_RULES.length}件)
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">自動検知:</span>
            <span className="font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md font-mono">
              {result.replacements.length} 種類 / {result.totalReplacementCount} 箇所
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'preview' ? (
            <>
              {/* Replacement Badges */}
              {result.replacements.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>検出された自動置換項目 ({result.replacements.length}件):</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {result.replacements.map((r, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-xl border border-teal-200 bg-teal-50/60 flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-teal-900">{r.original}</span>
                            <span className="text-slate-400">➔</span>
                            <span className="font-bold text-emerald-800 bg-white px-1.5 py-0.2 rounded border border-emerald-200 font-mono">
                              {r.replaced}
                            </span>
                          </div>
                          <p className="text-[11px] text-teal-700/90">{r.description}</p>
                        </div>
                        <span className="shrink-0 bg-teal-200 text-teal-800 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded-md">
                          {r.count}件
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                  現在入力されているテキストには、誤変換ハイリスクな単語や記号は検知されませんでした。
                </div>
              )}

              {/* Side-by-side or stacked diff */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                    <span>原文テキスト (置換前)</span>
                    <span className="text-[11px] font-normal text-slate-400 font-mono">{inputText.length} 文字</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed">
                    {inputText || '（カルテテキストが未入力です）'}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-700">
                    <div className="flex items-center gap-1">
                      <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>置換後テキスト (安定送信用)</span>
                    </div>
                    <span className="text-[11px] font-normal text-emerald-600 font-mono">
                      {result.processedText.length} 文字
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-300 font-mono text-xs text-slate-900 whitespace-pre-wrap max-h-56 overflow-y-auto leading-relaxed shadow-inner">
                    {result.processedText || '（カルテテキストが未入力です）'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Rules list tab */
            <div className="space-y-4">
              {/* Category Filter Toggles */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                  <span>有効化カテゴリ設定</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enableHeadingNormalization !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enableHeadingNormalization: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">見出し正規化 (主訴等)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enableTemperatureNormalization !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enableTemperatureNormalization: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">体温安全化 (38.3℃まで➔度まで)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enableTimingNormalization !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enableTimingNormalization: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">日時正規化 (昨日夜より➔昨夜より)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enablePrescriptionSpacing !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enablePrescriptionSpacing: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">処方・錠・回分 (1場・回文防止)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enableUnitNormalization !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enableUnitNormalization: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">単位 (room air, SpO2, mmHg等)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentOptions.enableSymbolNormalization !== false}
                      onChange={(e) => onOptionsChange({ ...currentOptions, enableSymbolNormalization: e.target.checked })}
                      className="rounded text-teal-600 focus:ring-teal-500"
                    />
                    <span className="font-semibold text-slate-700">記号 (※➔*, (+)/(-)等)</span>
                  </label>
                </div>
              </div>

              {/* Rules List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">登録済み置換ルール一覧 ({PREPROCESS_RULES.length}件)</div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {PREPROCESS_RULES.map((rule) => {
                    const isMatched = result.replacements.some((r) => r.ruleId === rule.id);
                    return (
                      <div
                        key={rule.id}
                        className={`p-3 rounded-xl border text-xs transition-colors ${
                          isMatched
                            ? 'bg-emerald-50/80 border-emerald-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{rule.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                              {rule.category}
                            </span>
                            {isMatched && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                                本文内でマッチ中
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-1">{rule.description}</p>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                          <span className="text-rose-700 line-through">{rule.exampleBefore}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-emerald-700 font-bold">{rule.exampleAfter}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-teal-600 shrink-0" />
            <span>「カルテ欄に反映」を押すと、入力テキストエリアに置換後テキストが反映されます。</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="button"
              disabled={!inputText.trim()}
              onClick={() => {
                onApplyText(result.processedText);
                onClose();
              }}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-98 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>カルテ欄に反映 ({result.totalReplacementCount}件置換)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
