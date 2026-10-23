import React from 'react';
import {
  Search,
  BookTemplate,
  Cpu,
  Download,
  ChevronRight,
  Pill,
  Activity,
  BookOpen,
} from 'lucide-react';
import { cleanExtractedMedicalText } from '../../utils/chartTextCleaner';
import { Gemma2MedicalChatPanel } from '../Gemma2MedicalChatPanel';
import { CompiledStreamPreview, CopilotData, ChartContext, triggerHaptic } from './types';

interface ClinicalRightPaneProps {
  rightPaneTab: 'clinical' | 'chat';
  setRightPaneTab: React.Dispatch<React.SetStateAction<'clinical' | 'chat'>>;
  localDraft: string;
  inputText: string;
  setLocalDraft: React.Dispatch<React.SetStateAction<string>>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  isBleConnected: boolean;
  isSending: boolean;
  onSendSession: () => void;
  onOpenSearch: (tab?: any) => void;
  onOpenTemplates: () => void;
  onOpenWebLlm: (style?: any) => void;
  onOpenCameraOcr?: () => void;
  onOpenCoprocessor?: () => void;
  chartContext: ChartContext;
  copilotData: CopilotData;
  compiledStreamPreview: CompiledStreamPreview;
}

export const ClinicalRightPane: React.FC<ClinicalRightPaneProps> = ({
  rightPaneTab,
  setRightPaneTab,
  localDraft,
  inputText,
  setLocalDraft,
  setInputText,
  isBleConnected,
  isSending,
  onSendSession,
  onOpenSearch,
  onOpenTemplates,
  onOpenWebLlm,
  onOpenCameraOcr,
  onOpenCoprocessor,
  chartContext,
  copilotData,
  compiledStreamPreview,
}) => {
  return (
    <aside className="hidden lg:flex lg:col-span-4 flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* 右ペイン 2モード切替タブ */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            setRightPaneTab('clinical');
          }}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
            rightPaneTab === 'clinical'
              ? 'bg-amber-500 text-slate-950 shadow-sm'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          🎯 臨床連動
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            setRightPaneTab('chat');
          }}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
            rightPaneTab === 'chat'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-300 hover:bg-slate-800'
          }`}
        >
          💬 秘書チャット
        </button>
      </div>

      {rightPaneTab === 'chat' ? (
        <Gemma2MedicalChatPanel
          chartText={localDraft || inputText}
          isBleConnected={isBleConnected}
          onApplyToChart={(newText, mode) => {
            const cleaned = cleanExtractedMedicalText(newText);
            if (mode === 'append') {
              const merged = cleanExtractedMedicalText(
                localDraft ? `${localDraft}\n\n${cleaned}` : cleaned
              );
              setLocalDraft(merged);
              setInputText(merged);
            } else {
              setLocalDraft(cleaned);
              setInputText(cleaned);
            }
          }}
          onDirectSendToEmr={(newText) => {
            const cleaned = cleanExtractedMedicalText(newText);
            setLocalDraft(cleaned);
            setInputText(cleaned);
            setTimeout(() => onSendSession(), 80);
          }}
          className="flex-1"
        />
      ) : (
        <>

          {/* カルテ100%動的連動: 臨床意思決定支援 ＆ 32GBデータパネル */}
          <div className="bg-[#1E293B]/70 border-2 border-amber-500/40 rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
              <span className="text-xs font-bold text-amber-300 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>🎯 カルテ100%連動 臨床意思決定支援</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                {chartContext.allKeywords.length} キーワード抽出済
              </span>
            </div>

            {/* カルテ全体から抽出された臨床キーワードタグクラウド */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                <span>カルテ抽出キーワード（タップで即照合）:</span>
                <span className="text-[10px] text-slate-400 font-mono">10大マスター連動</span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                {chartContext.allKeywords.length > 0 ? (
                  chartContext.allKeywords.slice(0, 12).map((kw, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        triggerHaptic(10);
                        onOpenSearch('all');
                      }}
                      className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-amber-500/20 text-slate-200 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 transition-colors flex items-center gap-1 cursor-pointer"
                      title={`「${kw}」で全10大医療データを検索`}
                    >
                      <span className="text-amber-400">#</span>
                      <span>{kw}</span>
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">
                    所見を入力すると自動で臨床キーワードを抽出します
                  </span>
                )}
              </div>
            </div>

            {/* カルテ内容と100%リンクした3大臨床データダイレクトカード */}
            <div className="space-y-2 pt-1 border-t border-slate-700/60">
              {/* 1. 連動医薬品 ＆ 錠剤鑑別 */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('pill');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-teal-500/30 hover:border-teal-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <Pill className="w-3.5 h-3.5 text-teal-400" />
                    <span>連動医薬品 ＆ 錠剤刻印</span>
                  </span>
                  <span className="text-[10px] text-teal-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.drugKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.drugKeywords.length > 0
                    ? `処方・内服: ${chartContext.drugKeywords.slice(0, 3).join('、')}`
                    : 'カルテ内の薬剤（アムロジピン、ニトロペン等）を常時検出'}
                </div>
              </div>

              {/* 2. 連動12誘導心電図 ＆ 臨床波形解析 */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('atlas');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-rose-500/30 hover:border-rose-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                    <span>連動12誘導心電図 ＆ 波形</span>
                  </span>
                  <span className="text-[10px] text-rose-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.atlasEcgKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.atlasEcgKeywords.length > 0
                    ? `病態波形: ${chartContext.atlasEcgKeywords.slice(0, 3).join('、')}`
                    : '主訴・症状から狭心症・心筋虚血・不整脈波形を自動抽出'}
                </div>
              </div>

              {/* 3. 連動Mindsガイドライン ＆ 救急プロトコル */}
              <div
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('minds');
                }}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-emerald-500/30 hover:border-emerald-400/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    <span>連動Minds原本 ＆ 救急CQ</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono group-hover:translate-x-0.5 transition-transform">
                    {chartContext.mindsEmerKeywords.length}件 ➔
                  </span>
                </div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-1 font-mono">
                  {chartContext.mindsEmerKeywords.length > 0
                    ? `ガイドライン: ${chartContext.mindsEmerKeywords.slice(0, 3).join('、')}`
                    : '学会公式原本PDF 450タイトル・CQ構造化照合'}
                </div>
              </div>

              {/* 全件一括照合ボタン */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenSearch('all');
                }}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500/20 via-sky-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Search className="w-3.5 h-3.5 text-amber-400" />
                <span>カルテ全キーワードで総合照合 (32GB全領域)</span>
              </button>
            </div>
          </div>

          {/* クイックアクション2: カルテ入力支援 ＆ AIツール */}
          <div className="bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-2 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
              <span className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                <span>⚡</span>
                <span>入力支援 ＆ エッジAIツール</span>
              </span>
              <span className="text-[10px] font-mono text-purple-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                Gemma 2 Q4F16
              </span>
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onOpenTemplates();
                }}
                className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600 cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <BookTemplate className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                      SOAPテンプレート ＆ 略語マスター
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      内科・外来定型文 ワンタップ展開
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

              <div className="p-2.5 rounded-xl bg-slate-800/60 border border-purple-500/30 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenWebLlm('soap');
                  }}
                  className="w-full flex items-center justify-between text-left transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-purple-300 transition-colors">
                        Gemma 2 臨床AIスタジオ ＆ 医療秘書
                      </div>
                      <div className="text-[10px] text-purple-400 font-mono">
                        SOAP・紹介状・指示簿・SBAR・IC説明・秘書対話
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
                <div className="grid grid-cols-2 gap-1 pt-1 border-t border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('chat');
                    }}
                    className="col-span-2 px-2 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 text-[10px] font-bold text-center cursor-pointer"
                  >
                    💬 Gemma 2 専属医療秘書チャットを開く
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('referral');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-sky-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    📄 紹介状・サマリー
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('order_sbar');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-emerald-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    📋 指示簿・SBAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('patient_ic');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-pink-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    👪 患者IC説明書
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onOpenWebLlm('clinical_audit');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-950/70 text-rose-300 border border-slate-700 hover:border-purple-500/40 text-[10px] font-semibold text-left truncate cursor-pointer"
                  >
                    🛡️ 処方・RedFlag監査
                  </button>
                </div>
              </div>

              {onOpenCameraOcr && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenCameraOcr();
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">📷</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-300 transition-colors">
                        処方箋・カルテ カメラOCR取込
                      </div>
                      <div className="text-[10px] text-sky-400 font-mono">
                        書類・薬剤名テキスト自動抽出 (空白除去)
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
              )}

              {onOpenCoprocessor && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onOpenCoprocessor();
                  }}
                  className="w-full p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-all group hover:border-slate-600 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Download className="w-4 h-4 text-rose-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-rose-300 transition-colors">
                        電カル双方向受信コプロセッサ
                      </div>
                      <div className="text-[10px] text-rose-400 font-mono">
                        仮想プリンタ (07h) カルテ吸い上げ・空白自動削除
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
};
