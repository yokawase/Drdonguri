import React, { startTransition } from 'react';
import { RefreshCw, Trash2, Sparkles, Camera } from 'lucide-react';
import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
} from '../../utils/chartTextCleaner';
import { getDecodedSpeechTokens } from '../../services/medicalSpeechDecoder';
import { triggerHaptic } from './types';

interface ClinicalEditorCardProps {
  isSending: boolean;
  isRecording: boolean;
  localDraft: string;
  inputText: string;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalDraft: React.Dispatch<React.SetStateAction<string>>;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  onAbortTransfer?: () => void;
  onOpenCameraOcr?: () => void;
  speechSuccessNotice: string | null;
  setSpeechSuccessNotice: React.Dispatch<React.SetStateAction<string | null>>;
  handleEditorChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  displayLines: string[];
  liveSpeechDecode: ReturnType<typeof getDecodedSpeechTokens> | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isTypingRef: React.MutableRefObject<boolean>;
}

export const ClinicalEditorCard: React.FC<ClinicalEditorCardProps> = ({
  isSending,
  isRecording,
  localDraft,
  inputText,
  isEditing,
  setIsEditing,
  setLocalDraft,
  setInputText,
  onAbortTransfer,
  onOpenCameraOcr,
  speechSuccessNotice,
  setSpeechSuccessNotice,
  handleEditorChange,
  displayLines,
  liveSpeechDecode,
  textareaRef,
  isTypingRef,
}) => {
  return (
    <div className="flex-1 w-full bg-[#1E293B]/50 border border-slate-800 rounded-2xl p-2.5 sm:p-3 lg:p-4 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm relative min-h-0">
      {/* カードヘッダー (1行スリム化・最小限表示) */}
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80 mb-1.5 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-4 bg-amber-500 rounded-[2px] inline-block shadow-[0_0_8px_rgba(245,158,11,0.5)] shrink-0" />
          <h2 className="text-xs sm:text-sm font-bold text-slate-200 tracking-wide font-sans truncate">
            臨床所見・SOAP整形テキスト
          </h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 📷 カメラOCR取込ボタン (目立つ位置) */}
          {onOpenCameraOcr && !isSending && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(15);
                onOpenCameraOcr();
              }}
              className="px-2 py-0.5 rounded-lg bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/50 text-sky-200 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
              title="スマホカメラで処方箋・カルテ・検査結果を撮影して文字取込"
            >
              <Camera className="w-3 h-3 text-sky-400 shrink-0" />
              <span>カメラ取込</span>
            </button>
          )}
          {isSending ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[10px] font-bold animate-pulse">
              <RefreshCw className="w-2.5 h-2.5 animate-spin text-rose-400" />
              <span>電カル打鍵中...</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic([30, 50]);
                  onAbortTransfer?.();
                }}
                className="ml-1 px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold cursor-pointer transition-colors"
                title="転送を中断"
              >
                中断
              </button>
            </div>
          ) : isRecording ? (
            <span className="text-[11px] font-bold text-rose-500 animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              録音中...
            </span>
          ) : null}

          {/* 入力文字数カウンター (入力時のみ表示) */}
          {(localDraft.trim() || inputText.trim()) && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800">
              {(localDraft || inputText).length}文字
            </span>
          )}

          {/* カルテ消去ボタン (コンパクトアイコン) */}
          {(localDraft.trim() || inputText.trim()) && !isSending && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(20);
                if (window.confirm('入力中のカルテテキストをすべて消去しますか？')) {
                  setLocalDraft('');
                  setInputText('');
                  setIsEditing(false);
                }
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-700/60 hover:border-rose-500/50 transition-colors cursor-pointer"
              title="入力内容を消去"
              aria-label="消去"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 音声解読完了マイクロ通知 */}
      {speechSuccessNotice && (
        <div className="mx-2 my-1 px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-lg animate-in fade-in duration-200 shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
            <span>{speechSuccessNotice}</span>
          </span>
          <button
            type="button"
            onClick={() => setSpeechSuccessNotice(null)}
            className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* テキストコンテンツ領域 (タップで編集切り替え可能・0ms Zero-Lag Local Buffer駆動) */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain pr-1 text-[13px] lg:text-sm leading-relaxed font-sans text-slate-200 select-text min-h-0 flex flex-col"
        onClick={() => {
          if (!isEditing) {
            setLocalDraft(inputText);
            setIsEditing(true);
            setTimeout(() => textareaRef.current?.focus(), 20);
          }
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={localDraft}
            onChange={handleEditorChange}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData('text');
              if (pasted) {
                e.preventDefault();
                const cleanedPaste = cleanExtractedMedicalText(normalizeMedicalSpeechTerms(pasted));
                const next = localDraft.trim()
                  ? cleanExtractedMedicalText(`${localDraft}\n${cleanedPaste}`)
                  : cleanedPaste;
                setLocalDraft(next);
                startTransition(() => {
                  setInputText(next);
                });
              }
            }}
            onBlur={() => {
              isTypingRef.current = false;
              if (!localDraft.trim()) {
                setIsEditing(false);
                setInputText('');
              } else {
                const cleaned = cleanExtractedMedicalText(localDraft);
                setLocalDraft(cleaned);
                setInputText(cleaned);
              }
            }}
            placeholder="所見を入力、または下の音声入力ボタンをタップして音声入力してください..."
            className="w-full flex-1 h-full min-h-[280px] bg-transparent text-slate-100 text-xs sm:text-[13px] lg:text-sm leading-relaxed resize-none focus:outline-none font-mono selection:bg-amber-500/30"
          />
        ) : (
          <div className="space-y-1 cursor-text flex-1 min-h-[280px]">
            {displayLines.map((line, idx) => {
              const trimmed = line.trim();
              const isCyanTag = /^【(S|主訴|現病歴|既往歴|内服薬|O|身体所見|検査)】/.test(trimmed);
              const isAmberTag = /^【(A|アセスメント|P|プラン.*?)】/.test(trimmed);

              if (isCyanTag || isAmberTag) {
                const tagEnd = line.indexOf('】') + 1;
                const tag = line.slice(0, tagEnd);
                const rest = line.slice(tagEnd).trim();
                return (
                  <div key={idx} className="pt-1.5 font-medium">
                    <span className={`font-bold mr-1.5 ${isCyanTag ? 'text-sky-400' : 'text-amber-400'}`}>
                      {tag}
                    </span>
                    <span className="text-slate-100">{rest}</span>
                  </div>
                );
              }
              return (
                <div key={idx} className={trimmed ? 'text-slate-200' : 'h-1.5'}>
                  {line}
                </div>
              );
            })}
          </div>
        )}

        {/* 音声入力中のリアルタイムプレビュー ＆ 医療用語インラインハイライト解読 */}
        {isRecording && liveSpeechDecode && (() => {
          const { tokens, result: liveDecoded } = liveSpeechDecode;
          return (
            <div className="mt-3 p-3 rounded-2xl bg-gradient-to-br from-rose-950/60 via-slate-900/90 to-purple-950/50 border-2 border-rose-600/70 shadow-2xl animate-in fade-in space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <div className="text-rose-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-mono tracking-wider">[リアルタイム音声認識中]</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  <span className="flex items-center gap-1 text-[10px] text-emerald-300 font-mono bg-emerald-950/90 px-2 py-0.5 rounded-full border border-emerald-500/50">
                    <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" />
                    <span>医療音声解読中</span>
                  </span>
                  {liveDecoded.detectedCategories.map((cat, i) => (
                    <span
                      key={i}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              {/* インラインハイライト表示本文 */}
              <div className="text-xs sm:text-[13px] text-slate-100 font-sans leading-relaxed p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                {tokens.length > 0 ? (
                  tokens.map((token, idx) => {
                    if (!token.isDecoded) {
                      return (
                        <span key={idx} className="text-slate-200">
                          {token.text}
                        </span>
                      );
                    }

                    let badgeColor = 'bg-emerald-900/80 text-emerald-200 border-emerald-500/60';
                    let icon = '✨';
                    if (token.category === 'vital') {
                      badgeColor =
                        'bg-rose-900/80 text-rose-200 border-rose-500/60 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
                      icon = '🫀';
                    } else if (token.category === 'drug') {
                      badgeColor =
                        'bg-cyan-900/80 text-cyan-200 border-cyan-500/60 shadow-[0_0_8px_rgba(6,182,212,0.4)]';
                      icon = '💊';
                    } else if (token.category === 'abbreviation') {
                      badgeColor =
                        'bg-purple-900/80 text-purple-200 border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.4)]';
                      icon = '🔬';
                    } else if (token.category === 'dosage') {
                      badgeColor = 'bg-amber-900/80 text-amber-200 border-amber-500/60';
                      icon = '📋';
                    } else if (token.category === 'section') {
                      badgeColor = 'bg-sky-900/80 text-sky-200 border-sky-500/60 font-bold';
                      icon = '📑';
                    }

                    return (
                      <mark
                        key={idx}
                        className={`inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded-lg border text-xs font-mono font-bold ${badgeColor}`}
                        title={token.original ? `発音: 「${token.original}」から自動解読` : undefined}
                      >
                        <span className="text-[10px]">{icon}</span>
                        <span>{token.text}</span>
                      </mark>
                    );
                  })
                ) : (
                  <span className="text-slate-400 italic">
                    マイクへ向かってカルテ所見をお話しください...（例: 「ビーピー 140の90」「大導寺に胸部圧迫感」「アムロジピン 1T 朝食後」）
                  </span>
                )}
                <span className="inline-block w-2 h-3.5 bg-rose-400 ml-1 animate-pulse align-middle" />
              </div>

              {/* リアルタイム解読ログチップス */}
              {liveDecoded.corrections.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-rose-900/50">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                    <span>解読一覧:</span>
                  </span>
                  {liveDecoded.corrections.slice(0, 6).map((c, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-slate-900/90 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/40 font-mono flex items-center gap-1"
                    >
                      <span className="line-through text-slate-500">{c.original}</span>
                      <span>➔</span>
                      <span className="font-bold text-emerald-200">{c.corrected}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
