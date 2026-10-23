import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { CopilotData, triggerHaptic } from './types';

interface ClinicalCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  copilotTab: 'redflag' | 'renal' | 'emergency' | 'evidence';
  onChangeCopilotTab: (tab: 'redflag' | 'renal' | 'emergency' | 'evidence') => void;
  copilotData: CopilotData;
  patientWeightKg: number;
  onChangePatientWeight: (w: number) => void;
  onAppendText: (snippet: string, successNotice: string) => void;
  onOpenWebLlm: (initialStyle?: any) => void;
}

export const ClinicalCopilotModal: React.FC<ClinicalCopilotModalProps> = ({
  isOpen,
  onClose,
  copilotTab,
  onChangeCopilotTab,
  copilotData,
  onChangePatientWeight,
  onAppendText,
  onOpenWebLlm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-xl max-h-[85vh] bg-[#0F172A] border border-emerald-500/50 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3 overflow-hidden">
        <div className="flex items-center justify-between gap-1 border-b border-slate-800 pb-2 shrink-0">
          <span className="text-xs sm:text-sm font-bold text-emerald-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>スーパーオンプレミス臨床コパイロット</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ切り替え */}
        <div className="flex items-center gap-1 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => onChangeCopilotTab('redflag')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              copilotTab === 'redflag'
                ? 'bg-rose-500 text-white'
                : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
            }`}
          >
            🚨 鑑別Red Flags ({copilotData.redFlags.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeCopilotTab('renal')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              copilotTab === 'renal'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-slate-800 text-amber-300 hover:bg-slate-700'
            }`}
          >
            💊 eGFR処方監査 ({copilotData.renalAudit.alerts.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeCopilotTab('emergency')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              copilotTab === 'emergency'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-slate-800 text-sky-300 hover:bg-slate-700'
            }`}
          >
            ⚡ 救急電卓 ({copilotData.effectiveWeight}kg)
          </button>
          <button
            type="button"
            onClick={() => onChangeCopilotTab('evidence')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              copilotTab === 'evidence'
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-emerald-300 hover:bg-slate-700'
            }`}
          >
            📚 GL根拠 ({copilotData.glSnippets.length})
          </button>
        </div>

        {/* コパイロットコンテンツ部 (スクロール可能) */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px]">
          {copilotTab === 'redflag' && (
            <div className="space-y-1.5">
              {copilotData.redFlags.map((rf) => (
                <div
                  key={rf.id}
                  className="p-2 rounded-lg bg-slate-950/90 border border-rose-500/30 flex items-center justify-between gap-2"
                >
                  <div className="text-[11px] space-y-0.5">
                    <div className="font-bold text-rose-300">{rf.syndrome}</div>
                    <div className="text-[10px] text-slate-300">
                      除外鑑別:{' '}
                      <span className="text-amber-300 font-semibold">
                        {rf.criticalDifferentials.join(' / ')}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">確認所見: {rf.mustCheckSigns.join(' ・ ')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      onAppendText(rf.defensiveChartSnippet, '✨ 防衛カルテ記載を追記しました');
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shrink-0 cursor-pointer"
                  >
                    ＋防衛記載追記
                  </button>
                </div>
              ))}
            </div>
          )}

          {copilotTab === 'renal' && (
            <div className="space-y-1.5">
              {copilotData.renalAudit.alerts.length > 0 ? (
                copilotData.renalAudit.alerts.map((al) => (
                  <div
                    key={al.id}
                    className="p-2 rounded-lg bg-slate-950/90 border border-amber-500/40 flex items-center justify-between gap-2"
                  >
                    <div className="text-[11px] space-y-0.5">
                      <div className="font-bold text-amber-300">
                        💊 {al.drugName} ({al.detectedEgfr !== null ? `eGFR ${al.detectedEgfr}` : '腎機能基準'})
                      </div>
                      <div className="text-[10px] text-slate-200">{al.recommendedAction}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic(15);
                        onAppendText(al.orderSnippet, '✨ 処方監査根拠を追記しました');
                        onClose();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                    >
                      ＋監査根拠追記
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-[11px] text-slate-300 p-2.5 bg-slate-950/80 rounded-lg border border-slate-800">
                  ✅ 現在処方に重篤な腎機能用量逸脱は検出されていません
                </div>
              )}
            </div>
          )}

          {copilotTab === 'emergency' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                <span className="text-sky-300 font-bold">患者体重設定 (ワンタップ換算):</span>
                <div className="flex items-center gap-1">
                  {[40, 50, 60, 70, 80].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onChangePatientWeight(w)}
                      className={`px-2 py-0.5 rounded font-mono font-bold cursor-pointer ${
                        copilotData.effectiveWeight === w
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {w}kg
                    </button>
                  ))}
                </div>
              </div>
              {copilotData.emergencyDoses.map((em) => (
                <div
                  key={em.id}
                  className="p-2 rounded-lg bg-slate-950/90 border border-sky-500/30 flex items-center justify-between gap-2"
                >
                  <div className="text-[11px] space-y-0.5">
                    <div className="font-bold text-sky-300 flex items-center gap-1.5">
                      <span>⚡ {em.title}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-200 border border-sky-500/40">
                        {em.badge}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-200 font-mono">{em.calculatedSummary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      onAppendText(em.orderText, '✨ 救急指示を挿入しました');
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                  >
                    ＋指示挿入
                  </button>
                </div>
              ))}
            </div>
          )}

          {copilotTab === 'evidence' && (
            <div className="space-y-1.5">
              {copilotData.glSnippets.map((gl) => (
                <div
                  key={gl.id}
                  className="p-2 rounded-lg bg-slate-950/90 border border-emerald-500/30 flex items-center justify-between gap-2"
                >
                  <div className="text-[11px] space-y-0.5">
                    <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <span>📚 {gl.title}</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-200 border border-emerald-500/40">
                        {gl.badge}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-300 line-clamp-2">{gl.snippet}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(15);
                      onAppendText(gl.snippet, '✨ ガイドライン根拠を追記しました');
                      onClose();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[10px] font-bold shrink-0 cursor-pointer"
                  >
                    ＋根拠追記
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 下部クイック起草 & 閉じる */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWebLlm('referral');
              }}
              className="px-2 py-1 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
            >
              📄 紹介状
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWebLlm('order_sbar');
              }}
              className="px-2 py-1 rounded bg-purple-950/80 hover:bg-purple-900 text-purple-200 border border-purple-500/40 text-[10px] font-semibold cursor-pointer"
            >
              📋 指示簿
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
