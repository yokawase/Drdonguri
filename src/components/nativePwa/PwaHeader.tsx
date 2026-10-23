import React from 'react';
import {
  Menu,
  ArrowLeft,
  Search,
  BookTemplate,
  Cpu,
  MessageSquare,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { triggerHaptic } from './types';

interface PwaHeaderProps {
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpenSearch: (tab?: any) => void;
  onOpenTemplates: () => void;
  onOpenWebLlm: (style?: any) => void;
  onSelectRightPaneTab: (tab: 'clinical' | 'chat' | 'dongle') => void;
  onToggleInlineChat: () => void;
  showDongleCockpit: boolean;
  onToggleDongleCockpit: () => void;
  ledBrightness: number;
  isMuted: boolean;
  handleToggleMute: () => void;
  isBleConnected: boolean;
  onConnectBle: () => void;
}

export const PwaHeader: React.FC<PwaHeaderProps> = ({
  isDrawerOpen,
  onToggleDrawer,
  onOpenSearch,
  onOpenTemplates,
  onOpenWebLlm,
  onSelectRightPaneTab,
  onToggleInlineChat,
  showDongleCockpit,
  onToggleDongleCockpit,
  ledBrightness,
  isMuted,
  handleToggleMute,
  isBleConnected,
  onConnectBle,
}) => {
  return (
    <header className="sticky top-0 left-0 right-0 w-full px-4 pt-[calc(env(safe-area-inset-top,0px)+0.35rem)] pb-1.5 shrink-0 border-b border-slate-800/80 bg-[#0F172A]/95 backdrop-blur-md z-50">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
        {/* 左側: ハンバーガーメニュー & 戻るトグル */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onToggleDrawer();
            }}
            className={`px-2.5 py-1.5 -ml-1 rounded-xl border flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0 z-10 ${
              isDrawerOpen
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            aria-label={isDrawerOpen ? 'メイン画面へ戻る' : 'メニューを開く'}
            title={isDrawerOpen ? 'メイン画面へ戻る' : '設定＆管理メニューを開く'}
          >
            {isDrawerOpen ? (
              <>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                <span className="text-xs font-bold">戻る</span>
              </>
            ) : (
              <>
                <Menu className="w-5 h-5 stroke-[2.2]" />
                <span className="text-[11px] font-bold">メニュー</span>
              </>
            )}
          </button>
        </div>

        {/* デスクトップ専用: ヘッダー中央クイックナビ (lg:flex hidden) */}
        <nav className="hidden lg:flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onOpenSearch('all');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 text-amber-400" />
            <span>臨床検索</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onOpenSearch('pill');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <span>💊</span>
            <span>医薬品添付文書</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onOpenSearch('atlas');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <span>📈</span>
            <span>12誘導ECG</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onOpenTemplates();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/80 border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <BookTemplate className="w-3.5 h-3.5 text-amber-400" />
            <span>定型文</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onOpenWebLlm('soap');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/50 hover:bg-purple-900/50 border border-purple-500/40 text-xs font-medium text-purple-300 hover:text-purple-200 transition-colors cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>AIスタジオ</span>
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onSelectRightPaneTab('chat');
              onToggleInlineChat();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/50 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>Gemma2医療秘書チャット</span>
          </button>
        </nav>

        {/* 右側: LED輝度クイックボタン ＆ タップ音ミュート ＆ 【t-dongle-S3とBLE接続】 */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* T-Dongle-S3 液晶＆LED輝度クイックボタン */}
          <button
            type="button"
            onClick={onToggleDongleCockpit}
            className={`px-2 py-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95 ${
              showDongleCockpit
                ? 'bg-sky-500 text-slate-950 border-sky-300'
                : 'bg-slate-800/90 text-sky-300 border-slate-700 hover:bg-slate-700'
            }`}
            title="T-Dongle-S3 液晶画面切替 ＆ LED輝度調節スライダー"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-mono hidden sm:inline">LED:{ledBrightness}%</span>
          </button>

          {/* ボタンタップ音・ビープ音 ミュート切替ボタン */}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`px-2 py-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95 ${
              isMuted
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/70 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                : 'bg-slate-800/90 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-700'
            }`}
            title={isMuted ? 'タップ音・ビープ音を有効化（消音解除）' : 'タップ音・ビープ音を消音（ミュート）'}
            aria-label={isMuted ? '消音中（タップで音声有効化）' : '効果音ON（タップで消音）'}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold text-rose-300">消音中</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-medium hidden sm:inline">効果音ON</span>
              </>
            )}
          </button>

          {/* 【t-dongle-S3とBLE接続】トグルボタン */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(20);
              onConnectBle();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95 cursor-pointer ${
              isBleConnected
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
            title="ESP32ドングル（T-Dongle-S3 / AtomS3U）とBLE接続"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isBleConnected
                  ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-sans text-[11px] sm:text-xs">
              {isBleConnected ? 'T-Dongle-S3 接続中' : 'T-Dongle-S3 未接続'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
