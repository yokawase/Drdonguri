import React from 'react';
import { Download, Square, Mic, OctagonX, Send } from 'lucide-react';
import { triggerHaptic } from './types';

interface PwaBottomBarProps {
  isRecording: boolean;
  isSending: boolean;
  inputText: string;
  wavePath1Ref: React.RefObject<SVGPathElement | null>;
  wavePath2Ref: React.RefObject<SVGPathElement | null>;
  toggleSpeechRecognition: () => Promise<void>;
  onOpenCoprocessor?: () => void;
  onAbortTransfer?: () => void;
  onSendSession: () => void;
}

export const PwaBottomBar: React.FC<PwaBottomBarProps> = ({
  isRecording,
  isSending,
  inputText,
  wavePath1Ref,
  wavePath2Ref,
  toggleSpeechRecognition,
  onOpenCoprocessor,
  onAbortTransfer,
  onSendSession,
}) => {
  return (
    <nav className="w-full pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pt-1 px-4 bg-[#0F172A]/95 border-t border-slate-800/80 backdrop-blur-md shrink-0 flex flex-col items-center relative z-20">
      {/* 音声録音中のオシロスコープ波形（FAB上部） */}
      {isRecording && (
        <div className="w-full max-w-xs sm:max-w-sm h-6 flex items-center justify-center mb-0.5 animate-in fade-in">
          <svg className="w-full h-6 overflow-visible" viewBox="0 0 240 24" fill="none">
            {/* 第1波形 (主波形: ローズレッド) */}
            <path
              ref={wavePath1Ref}
              d="M 10 12 Q 40 11 70 12 T 120 13 T 170 12 T 230 12"
              stroke="#F43F5E"
              strokeWidth="2"
              strokeLinecap="round"
              className="animate-waveform-1"
            />
            {/* 第2波形 (副波形: ソフトピンク・位相ずれ) */}
            <path
              ref={wavePath2Ref}
              d="M 10 12 Q 50 14 90 12 T 140 11 T 190 12 T 230 12"
              stroke="#FB7185"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.8"
              className="animate-waveform-2"
            />
          </svg>
        </div>
      )}

      <div className="w-full flex items-center justify-between max-w-xs sm:max-w-sm mx-auto">
        {/* 【左側】電カルから受信 (コーラルピンク・コンパクト44px) */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(25);
              onOpenCoprocessor?.();
            }}
            className="w-11 h-11 rounded-full bg-[#1E293B] border border-[#F43F5E]/60 text-[#F43F5E] hover:bg-[#F43F5E]/10 active:scale-90 transition-all flex items-center justify-center shadow-md group cursor-pointer"
            title="閉域網電子カルテから過去カルテを吸い上げ"
          >
            <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
          </button>
          <span className="text-[10px] font-semibold text-[#F43F5E] tracking-tight">
            電カル受信
          </span>
        </div>

        {/* 【中央】音声入力 ⇒ 自動テキスト化整形 (コンパクト48px FAB) */}
        <div className="flex flex-col items-center gap-0.5 -translate-y-1">
          <div className="relative flex items-center justify-center">
            {/* 同心円の外側グローサークル */}
            <div
              className={`absolute w-15 h-15 rounded-full transition-all duration-300 pointer-events-none ${
                isRecording
                  ? 'bg-rose-950/70 ring-2 ring-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse'
                  : 'bg-amber-500/15 ring-1.5 ring-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
              }`}
            />

            <button
              type="button"
              onClick={toggleSpeechRecognition}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 relative z-10 shadow-lg cursor-pointer ${
                isRecording
                  ? 'bg-[#F43F5E] hover:bg-[#E11D48] text-white shadow-[0_6px_20px_rgba(225,29,72,0.5)]'
                  : 'bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 shadow-[0_6px_20px_rgba(245,158,11,0.35)]'
              }`}
              title={isRecording ? '録音を停止してカルテを自動整形' : 'マイクを起動して音声入力開始'}
            >
              {isRecording ? (
                <Square className="w-5 h-5 fill-white" />
              ) : (
                <Mic className="w-5.5 h-5.5 stroke-[2.4]" />
              )}
            </button>
          </div>
          <span
            className={`text-[10px] font-bold tracking-tight transition-colors ${
              isRecording ? 'text-rose-400 animate-pulse' : 'text-slate-100'
            }`}
          >
            {isRecording ? '完了・整形' : '音声入力'}
          </span>
        </div>

        {/* 【右側】電カルへ送信 / 転送中断 (スカイブルー / ローズ・コンパクト44px) */}
        <div className="flex flex-col items-center gap-0.5">
          {isSending ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic([40, 80]);
                onAbortTransfer?.();
              }}
              className="w-11 h-11 rounded-full bg-rose-600 hover:bg-rose-500 border border-rose-400 text-white active:scale-90 transition-all flex items-center justify-center shadow-[0_0_15px_rgba(244,63,94,0.6)] animate-pulse group cursor-pointer"
              title="電子カルテへの転送・打鍵を安全に中断"
            >
              <OctagonX className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                triggerHaptic([30, 60, 30]);
                onSendSession();
              }}
              disabled={!inputText.trim()}
              className={`w-11 h-11 rounded-full bg-[#1E293B] border border-sky-400/60 text-sky-400 hover:bg-sky-400/10 active:scale-90 transition-all flex items-center justify-center shadow-md group cursor-pointer ${
                !inputText.trim() ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="電子カルテ端末へUSB-HID自動打鍵転送"
            >
              <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          )}
          <span
            className={`text-[10px] font-semibold tracking-tight transition-colors ${
              isSending ? 'text-rose-400 font-bold animate-pulse' : 'text-sky-400'
            }`}
          >
            {isSending ? '転送中断' : '電カル送信'}
          </span>
        </div>
      </div>

      {/* ホームインジケータバー */}
      <div className="w-24 h-0.5 bg-slate-600/60 rounded-full mt-1.5 shrink-0" />
    </nav>
  );
};
