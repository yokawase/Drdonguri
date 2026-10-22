import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Zap,
  Copy,
  Check,
  FilePlus2,
  FileCheck2,
  Trash2,
  Cpu,
  BookOpen,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import {
  SecretaryChatMessage,
  SECRETARY_QUICK_PROMPTS,
  chatWithGemma2Secretary,
  GEMMA_2_JPN_FAST_F16_MODEL,
  GEMMA_2_JPN_MODEL,
  prewarmWebLlmEngine,
  ModelLoadProgress,
} from '../services/webLlmService';

interface Gemma2MedicalChatPanelProps {
  currentChartText?: string;
  chartText?: string;
  isBleConnected?: boolean;
  onReplaceChart?: (newText: string) => void;
  onAppendChart?: (appendText: string) => void;
  onApplyToChart?: (newText: string, mode: 'replace' | 'append') => void;
  onDirectTypeToEmr?: (textToType: string) => void;
  onDirectSendToEmr?: (textToType: string) => void;
  compact?: boolean;
  className?: string;
}

export const Gemma2MedicalChatPanel: React.FC<Gemma2MedicalChatPanelProps> = ({
  currentChartText,
  chartText,
  onReplaceChart,
  onAppendChart,
  onApplyToChart,
  onDirectTypeToEmr,
  onDirectSendToEmr,
  compact = false,
  className = '',
}) => {
  const effectiveChartText = currentChartText ?? chartText ?? '';
  const effectiveDirectSend = onDirectTypeToEmr ?? onDirectSendToEmr;
  const [messages, setMessages] = useState<SecretaryChatMessage[]>(() => [
    {
      id: 'welcome-secretary',
      role: 'assistant',
      content:
        '先生、お疲れ様です！Dr.Dongly 専属医療秘書（Gemma 2 + 32GB 10大医療マスター統合）です。\n現在入力中のカルテ所見をリアルタイムで把握しています。処方・腎機能(eGFR)監査、鑑別Red Flags確認、SOAP清書、紹介状・患者説明文の作成など、何でもご指示ください。',
      timestamp: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
      references: ['32GB 10大医療マスター', 'Gemma 2 2B JPN'],
      mode: 'instant_rag',
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [chatMode, setChatMode] = useState<'instant' | 'deep'>('deep');
  const [selectedModel, setSelectedModel] = useState<string>(GEMMA_2_JPN_FAST_F16_MODEL);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadProgress, setLoadProgress] = useState<ModelLoadProgress | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // チャットパネル表示時にキャッシュ済みモデルがあればバックグラウンドでプリウォーム
    prewarmWebLlmEngine(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  const handleSendQuery = async (overridePrompt?: string) => {
    const queryText = (overridePrompt ?? inputQuery).trim();
    if (!queryText || isGenerating) return;

    if (!overridePrompt) {
      setInputQuery('');
    }

    const nowStr = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const userMsg: SecretaryChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: queryText,
      timestamp: nowStr,
    };

    const assistantId = `assistant-${Date.now() + 1}`;
    const placeholderMsg: SecretaryChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '医療マスター照合・推論中...',
      timestamp: nowStr,
      mode: chatMode === 'instant' ? 'instant_rag' : 'gemma2_deep',
    };

    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, placeholderMsg]);
    setIsGenerating(true);

    try {
      const result = await chatWithGemma2Secretary(nextHistory, effectiveChartText, {
        mode: chatMode,
        modelId: selectedModel,
        onProgress: (rep) => setLoadProgress(rep),
        onStream: (streamedText, meta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: streamedText,
                    references: meta?.references || m.references,
                  }
                : m
            )
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.reply,
                references: result.references,
                tokPerSec: result.telemetry.tokensPerSec,
                ttftMs: result.telemetry.ttftMs,
                mode: result.usedMode,
              }
            : m
        )
      );
    } finally {
      setIsGenerating(false);
      setLoadProgress(null);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleApplyToChart = (id: string, text: string, mode: 'replace' | 'append') => {
    if (onApplyToChart) {
      onApplyToChart(text, mode);
    } else if (mode === 'replace') {
      onReplaceChart?.(text);
    } else {
      onAppendChart?.(text);
    }
    setAppliedId(`${id}-${mode}`);
    setTimeout(() => setAppliedId(null), 1800);
  };

  return (
    <div className={`rounded-2xl border border-indigo-500/35 bg-gradient-to-br from-slate-900/95 via-indigo-950/30 to-slate-900/95 shadow-xl overflow-hidden flex flex-col ${className}`}>
      {/* ヘッダー: 医療秘書ステータス & 推論エンジン切替 */}
      <div className="px-3.5 py-2.5 bg-indigo-950/60 border-b border-indigo-500/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-white tracking-tight">
                Gemma 2 専属医療秘書チャット
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                完全ローカル閉域網
              </span>
            </div>
            <p className="text-[10px] text-indigo-200/80">
              カルテ文脈 ＋ 32GB 10大医療マスターRAG ＋ Gemma 2 WebGPU深層推論
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 即応0.01秒 vs Gemma2深層推論 切替 */}
          <div className="inline-flex rounded-lg bg-slate-900/90 p-0.5 border border-slate-700/80">
            <button
              type="button"
              onClick={() => setChatMode('instant')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                chatMode === 'instant'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="0.01秒で10大医療マスターとカルテ監査結果を即答します"
            >
              <Zap className="w-3 h-3" />
              0.01秒即応
            </button>
            <button
              type="button"
              onClick={() => setChatMode('deep')}
              className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                chatMode === 'deep'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="0.01秒RAGプレビュー表示後、Gemma 2 WebGPUで深層回答を生成します"
            >
              <Sparkles className="w-3 h-3" />
              Gemma 2 深層
            </button>
          </div>

          {/* 量子化速度モード選択 (f16 2.2倍速 / f32 安定) */}
          {chatMode === 'deep' && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              aria-label="Gemma 2 量子化エンジン選択"
              className="bg-slate-900/90 border border-indigo-500/40 text-indigo-200 text-[10px] font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-400"
            >
              <option value={GEMMA_2_JPN_FAST_F16_MODEL}>⚡ FP16爆速 (2.2x)</option>
              <option value={GEMMA_2_JPN_MODEL}>🛡️ FP32高安定</option>
            </select>
          )}

          <button
            type="button"
            onClick={() =>
              setMessages([
                {
                  id: `welcome-${Date.now()}`,
                  role: 'assistant',
                  content:
                    'チャット履歴をクリアしました。現在のカルテ所見を踏まえて、いつでもご質問・ご指示ください。',
                  timestamp: new Date().toLocaleTimeString('ja-JP', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                  references: ['32GB 10大医療マスター'],
                  mode: 'instant_rag',
                },
              ])
            }
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-rose-300 border border-slate-700/70 transition-colors"
            title="チャット履歴をクリア"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ワンタップ医療秘書クイック指示チップス */}
      <div className="px-3 py-2 bg-slate-900/70 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold text-indigo-300 shrink-0">秘書コマンド:</span>
        {SECRETARY_QUICK_PROMPTS.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={isGenerating}
            onClick={() => handleSendQuery(item.prompt)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-950/70 hover:bg-indigo-800/70 text-indigo-100 border border-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* WebGPU モデルロード進捗バー */}
      {loadProgress && loadProgress.progress < 1 && (
        <div className="px-3.5 py-1.5 bg-indigo-950/90 border-b border-indigo-500/30 flex items-center justify-between gap-2 text-[10px] text-indigo-200">
          <div className="flex items-center gap-1.5 truncate">
            <Loader2 className="w-3 h-3 animate-spin text-cyan-400 shrink-0" />
            <span className="truncate">{loadProgress.text}</span>
          </div>
          <span className="font-mono font-bold text-cyan-300 shrink-0">
            {Math.round(loadProgress.progress * 100)}%
          </span>
        </div>
      )}

      {/* チャットメッセージタイムライン */}
      <div
        ref={scrollContainerRef}
        className={`p-3 space-y-3 overflow-y-auto ${
          compact ? 'max-h-[280px] min-h-[190px]' : 'max-h-[380px] min-h-[240px]'
        }`}
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-sm shadow-md'
                    : 'bg-slate-800/95 text-slate-100 border border-slate-700/80 rounded-bl-sm shadow-md'
                }`}
              >
                {/* アシスタントヘッダーバッジ */}
                {!isUser && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5 pb-1 border-b border-slate-700/70">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold text-cyan-300 flex items-center gap-1">
                        <Bot className="w-3 h-3" />
                        どんぐり医療秘書
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          msg.mode === 'gemma2_deep'
                            ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {msg.mode === 'gemma2_deep' ? 'Gemma 2 深層推論' : '0.01s 医療マスターRAG'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                      {msg.tokPerSec !== undefined && msg.tokPerSec > 0 && (
                        <span className="text-emerald-300 font-bold flex items-center gap-0.5">
                          <Cpu className="w-2.5 h-2.5" />
                          {msg.tokPerSec >= 500 ? '即時0.01s' : `${msg.tokPerSec} tok/s`}
                        </span>
                      )}
                      {msg.ttftMs !== undefined && msg.ttftMs > 0 && (
                        <span>TTFT:{msg.ttftMs}ms</span>
                      )}
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                )}

                <div className="whitespace-pre-wrap break-words font-medium">{msg.content}</div>

                {/* 参照した医療マスター根拠タグ */}
                {!isUser && msg.references && msg.references.length > 0 && (
                  <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex flex-wrap items-center gap-1">
                    <BookOpen className="w-3 h-3 text-indigo-300 shrink-0" />
                    {msg.references.map((ref) => (
                      <span
                        key={ref}
                        className="px-1.5 py-0.5 rounded bg-slate-900/90 text-indigo-200 border border-indigo-500/25 text-[9px] font-semibold"
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                )}

                {/* 医師向けワンタップ活用アクションバー */}
                {!isUser && msg.id !== 'welcome-secretary' && (
                  <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyToChart(msg.id, msg.content, 'append')}
                      className="px-2 py-1 rounded-lg bg-emerald-600/25 hover:bg-emerald-600/40 text-emerald-200 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    >
                      {appliedId === `${msg.id}-append` ? (
                        <Check className="w-3 h-3 text-emerald-300" />
                      ) : (
                        <FilePlus2 className="w-3 h-3" />
                      )}
                      {appliedId === `${msg.id}-append` ? 'カルテに追記完了' : 'カルテ末尾へ追記'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleApplyToChart(msg.id, msg.content, 'replace')}
                      className="px-2 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold flex items-center gap-1 transition-colors"
                    >
                      {appliedId === `${msg.id}-replace` ? (
                        <Check className="w-3 h-3 text-indigo-300" />
                      ) : (
                        <FileCheck2 className="w-3 h-3" />
                      )}
                      {appliedId === `${msg.id}-replace` ? 'カルテ置換完了' : 'カルテ本文へ反映'}
                    </button>

                    {effectiveDirectSend && (
                      <button
                        type="button"
                        onClick={() => effectiveDirectSend(msg.content)}
                        className="px-2 py-1 rounded-lg bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Zap className="w-3 h-3" />
                        電カルへ直接打鍵
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="px-2 py-1 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-[10px] font-bold flex items-center gap-1 transition-colors ml-auto"
                    >
                      {copiedId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copiedId === msg.id ? 'コピー済' : 'コピー'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* チャット入力フッター */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendQuery();
        }}
        className="p-2.5 bg-slate-900/95 border-t border-indigo-500/30 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="医療秘書へ質問・指示（例: 腎機能減量は？ / 紹介状を書いて / 鑑別診断は？）..."
          disabled={isGenerating}
          className="flex-1 bg-slate-950/90 border border-slate-700/80 focus:border-indigo-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || isGenerating}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-40 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95 shrink-0"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              応答中
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              送信
            </>
          )}
        </button>
      </form>
    </div>
  );
};
