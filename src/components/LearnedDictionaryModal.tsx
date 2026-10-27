/**
 * =============================================================================
 * DrVoice どんぐり君！ (Dr.Dongly)
 * 自己学習辞書管理モーダル (Learned Medical Dictionary Modal)
 * =============================================================================
 * 
 * 医師の手間ゼロで自動学習された
 * 1. 【系統A：電カルIME誤変換】
 * 2. 【系統B：ASR生音声誤認識】
 * の置換テーブル、出現頻度スコア、昇格ステータス (n >= 2) を可視化・管理する。
 */

import React, { useState } from 'react';
import {
  X,
  Zap,
  ArrowRight,
  Trash2,
  Plus,
  Sparkles,
  Layers,
  Mic,
  Cpu,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { LearnedDictRecord } from '../hooks/useAutoDictionary';
import { isTwoKanjiDecomposable, getDecompositionPreview } from '../constants/safeKanjiMaster';

interface LearnedDictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LearnedDictRecord[];
  onAddPair: (source: string, target: string, type: 'ime' | 'asr', enableDecomposition?: boolean) => Promise<any>;
  onDeleteEntry?: (id: string) => void;
  whisperPrompt: string;
}

export const LearnedDictionaryModal: React.FC<LearnedDictionaryModalProps> = ({
  isOpen,
  onClose,
  entries,
  onAddPair,
  onDeleteEntry,
  whisperPrompt,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'ime' | 'asr'>('all');
  const [filterQuery, setFilterQuery] = useState('');
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newType, setNewType] = useState<'ime' | 'asr'>('ime');
  const [enableDecomposition, setEnableDecomposition] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isDecomposable = isTwoKanjiDecomposable(newTarget.trim());
  const decompositionPreview = isDecomposable ? getDecompositionPreview(newTarget.trim()) : null;

  const filteredEntries = entries.filter((item) => {
    if (activeTab !== 'all' && item.type !== activeTab) return false;
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      item.source.toLowerCase().includes(q) ||
      item.target.toLowerCase().includes(q)
    );
  });

  const promotedList = filteredEntries.filter((e) => e.promoted);
  const candidateList = filteredEntries.filter((e) => !e.promoted);

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.trim() || !newTarget.trim()) return;

    try {
      setIsSubmitting(true);
      // 手動追加は臨床確度100%として即座に2回観測扱い（即昇格）にするため2回呼び出し
      const useDecomp = isDecomposable ? enableDecomposition : false;
      await onAddPair(newSource.trim(), newTarget.trim(), newType, useDecomp);
      await onAddPair(newSource.trim(), newTarget.trim(), newType, useDecomp);
      setNewSource('');
      setNewTarget('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* モーダルヘッダー */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                自己学習クローズドループ辞書
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                  Aho-Corasick ＆ Whisper連動
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                電カル確定吸い上げ ＆ 音声認識から自動抽出された自己進化テーブル
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Whisper initial_prompt プレビューバナー */}
        <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-[11px] flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 truncate">
            <span className="text-slate-400 font-medium">Whisper注入プロンプト: </span>
            <span className="text-slate-200 font-mono">{whisperPrompt}</span>
          </div>
        </div>

        {/* タブ ＆ 検索バー */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row gap-2.5 justify-between items-center">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                activeTab === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              すべて ({entries.length})
            </button>
            <button
              onClick={() => setActiveTab('ime')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                activeTab === 'ime'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3 h-3" />
              電カルIME ({entries.filter((e) => e.type === 'ime').length})
            </button>
            <button
              onClick={() => setActiveTab('asr')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                activeTab === 'asr'
                  ? 'bg-pink-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3 h-3" />
              ASR誤認識 ({entries.filter((e) => e.type === 'asr').length})
            </button>
          </div>

          <div className="relative w-full sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="単語を検索..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* 手動登録フォーム */}
        <form
          onSubmit={handleManualAdd}
          className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-col gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              即時学習:
            </span>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as any)}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none"
            >
              <option value="ime">電カルIME</option>
              <option value="asr">ASR誤認識</option>
            </select>
            <input
              type="text"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              placeholder="誤認識語 (例: 協力, こんち)"
              className="flex-1 min-w-[120px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
            />
            <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="正解用語 (例: 強力, 根治)"
              className="flex-1 min-w-[120px] px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={isSubmitting || !newSource.trim() || !newTarget.trim()}
              className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 disabled:opacity-50 transition"
            >
              登録
            </button>
          </div>

          {/* 二文字誤変換単語は訓読み分解登録トグル ＆ プレビュー */}
          {isDecomposable && (
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-[11px] animate-in fade-in duration-150">
              <label className="flex items-center gap-1.5 cursor-pointer text-amber-300 font-semibold select-none">
                <input
                  type="checkbox"
                  checked={enableDecomposition}
                  onChange={(e) => setEnableDecomposition(e.target.checked)}
                  className="rounded border-amber-600 text-amber-500 focus:ring-0 w-3.5 h-3.5 accent-amber-500"
                />
                <span>二文字誤変換単語は訓読み分解登録（変換率100%保証）</span>
              </label>
              <div className="text-slate-300 font-mono text-[10px] truncate max-w-[50%]">
                <span className="text-amber-400 font-bold">分解: </span>
                {decompositionPreview}
              </div>
            </div>
          )}
        </form>

        {/* 辞書一覧 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 昇格済み（アクティブ置換） */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                正式昇格済み・即時自動置換 (n ≥ 2: {promotedList.length}件)
              </span>
              <span className="text-[10px] text-slate-400">
                Aho-Corasick Trie木でミリ秒置換
              </span>
            </div>

            {promotedList.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                該当する昇格済みエントリはありません
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {promotedList.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-950/80 border border-emerald-500/30 flex items-center justify-between gap-2 shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-rose-400 font-mono line-through truncate max-w-[45%]">
                          {item.source}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="text-emerald-300 font-bold truncate max-w-[45%]">
                          {item.target}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                        <span
                          className={`px-1.5 py-0.2 rounded font-semibold ${
                            item.type === 'ime'
                              ? 'bg-sky-950 text-sky-300 border border-sky-800/60'
                              : 'bg-pink-950 text-pink-300 border border-pink-800/60'
                          }`}
                        >
                          {item.type === 'ime' ? '電カルIME' : 'ASR誤認識'}
                        </span>
                        <span className="text-slate-400">観測: {item.count}回</span>
                        {item.isDecomposed && (
                          <span
                            className="px-1.5 py-0.2 rounded font-semibold bg-amber-950/70 text-amber-300 border border-amber-500/50 flex items-center gap-0.5 truncate max-w-[170px]"
                            title={item.decompositionRule || '訓読み安全分解'}
                          >
                            ⚡ 訓読み分解
                          </span>
                        )}
                      </div>
                    </div>
                    {onDeleteEntry && (
                      <button
                        onClick={() => onDeleteEntry(item.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                        title="辞書から削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 昇格前候補 (観測1回) */}
          {candidateList.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  昇格候補・監視中 (n = 1: {candidateList.length}件)
                </span>
                <span className="text-[10px] text-slate-400">
                  あと1回観測されると自動昇格
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {candidateList.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-2 opacity-75"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-slate-400 font-mono truncate max-w-[45%]">
                          {item.source}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className="text-slate-300 font-semibold truncate max-w-[45%]">
                          {item.target}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                        <span>{item.type === 'ime' ? '電カルIME' : 'ASR誤認識'}</span>
                        <span>観測: {item.count}回 (保留中)</span>
                        {item.isDecomposed && (
                          <span
                            className="px-1.5 py-0.2 rounded font-semibold bg-amber-950/50 text-amber-300 border border-amber-500/40 truncate max-w-[150px]"
                            title={item.decompositionRule || '訓読み安全分解'}
                          >
                            ⚡ 訓読み分解
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>厳格ルール: PII・数値ノイズ排除 ＆ 同一ペア2回以上観測で自動昇格</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
};
