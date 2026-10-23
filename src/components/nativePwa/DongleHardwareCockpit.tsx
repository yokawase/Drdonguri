import React from 'react';
import { Monitor, Sun } from 'lucide-react';
import { LATEST_FIRMWARE_VERSION } from '../../version';
import { CompiledStreamPreview, CopilotData, ChartContext, triggerHaptic } from './types';

interface DongleHardwareCockpitProps {
  compact?: boolean;
  isSending: boolean;
  isBleConnected: boolean;
  lcdPage: 0 | 1 | 2 | 3;
  lcdBrightness: number;
  ledBrightness: number;
  handleSelectLcdPage: (page: 0 | 1 | 2 | 3) => void;
  handleLedBrightnessChange: (pct: number) => void;
  handleLcdBrightnessChange: (pct: number) => void;
  compiledStreamPreview: CompiledStreamPreview;
  copilotData: CopilotData;
  chartContext: ChartContext;
}

export const DongleHardwareCockpit: React.FC<DongleHardwareCockpitProps> = ({
  compact = false,
  isSending,
  isBleConnected,
  lcdPage,
  lcdBrightness,
  ledBrightness,
  handleSelectLcdPage,
  handleLedBrightnessChange,
  handleLcdBrightnessChange,
  compiledStreamPreview,
  copilotData,
  chartContext,
}) => {
  return (
    <div className="bg-slate-900/95 border border-sky-500/40 rounded-2xl p-3 space-y-2.5 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 gap-1.5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Monitor className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-xs font-bold text-white">
            T-Dongle-S3 液晶コックピット &amp; LED輝度制御
          </span>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-950/90 text-sky-300 border border-sky-500/40">
          160×80 IPS / 4画面切替
        </span>
      </div>

      {/* 160x80 IPS ST7735S 実機液晶スクリーン ライブミラー */}
      <div className="relative mx-auto w-full max-w-[320px] rounded-xl bg-slate-950 p-2.5 border-2 border-slate-700 shadow-inner flex items-center gap-2.5">
        {/* 液晶画面本体 (2:1 アスペクト比) */}
        <div
          className="flex-1 rounded-lg bg-[#090D16] border border-slate-800 p-2 font-mono text-[10px] leading-tight select-none overflow-hidden transition-opacity duration-150"
          style={{
            opacity: Math.max(0.25, lcdBrightness / 100),
            boxShadow: `inset 0 0 18px rgba(14,165,233,${(lcdBrightness / 100) * 0.18})`,
          }}
        >
          {/* LCD Top Status Bar */}
          <div className="flex items-center justify-between bg-[#101827] -mx-2 -mt-2 px-2 py-1 mb-1.5 border-b border-slate-800">
            <span className="text-[9px] font-bold text-amber-400">Dr.Dongly v23.0</span>
            <span
              className={`text-[9px] font-bold px-1 rounded ${
                isSending
                  ? 'bg-amber-500 text-slate-950 animate-pulse'
                  : isBleConnected
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                  : 'bg-sky-950 text-sky-300'
              }`}
            >
              {isSending ? 'TYPING' : isBleConnected ? 'BLE+USB OK' : 'BLE WAIT'}
            </span>
          </div>

          {/* Page 0: COCKPIT */}
          {lcdPage === 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-400 font-bold">
                  {isSending ? '>>> SENDING HID' : isBleConnected ? 'READY (11ms SAFE)' : 'SCANNING BLE...'}
                </span>
                <span className="text-sky-300">540 WPM</span>
              </div>
              <div className="text-[9px] text-slate-400 truncate">
                USB: HID Keyboard + Printer(07h)
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 transition-all"
                  style={{ width: isSending ? '75%' : isBleConnected ? '100%' : '20%' }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400 pt-0.5">
                <span>LED:{ledBrightness}%</span>
                <span>LCD:{lcdBrightness}%</span>
                <span className="text-amber-300">[1/4 COCKPIT]</span>
              </div>
            </div>
          )}

          {/* Page 1: 100% KANJI STREAM */}
          {lcdPage === 1 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-amber-300 font-bold">Sudachi Mode C + v20.1</span>
                <span className="text-emerald-400 font-bold">100%確定</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[9px] bg-slate-900/90 p-1 rounded border border-slate-800">
                <span className="text-emerald-300">[Z]:{compiledStreamPreview.zCount}</span>
                <span className="text-sky-300">[K]:{compiledStreamPreview.kCount}</span>
                <span className="text-amber-300">[H]:{compiledStreamPreview.hCount}</span>
                <span className="text-purple-300">[A]:{compiledStreamPreview.aCount}</span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-300">
                <span>単漢字BS確定: {compiledStreamPreview.anchorBsCount}件</span>
                <span className="text-emerald-400">ALT:0 (安全)</span>
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span>全電カル100%互換</span>
                <span className="text-amber-300">[2/4 KANJI]</span>
              </div>
            </div>
          )}

          {/* Page 2: CLINICAL HUD */}
          {lcdPage === 2 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-rose-300 font-bold">CLINICAL SAFETY HUD</span>
                <span className="text-emerald-300 text-[9px]">LIVE連動</span>
              </div>
              <div className="text-[9px] text-amber-300 truncate">
                💊{' '}
                {copilotData.renalAudit.detectedEgfr !== null
                  ? `eGFR ${copilotData.renalAudit.detectedEgfr} (警告:${copilotData.renalAudit.alerts.length}件)`
                  : 'eGFR: カルテ監視中 (逸脱0件)'}
              </div>
              <div className="text-[9px] text-rose-300 truncate">
                🚨 RedFlags: {copilotData.redFlags.length}件 / KW:{chartContext.allKeywords.length}件
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span className="truncate max-w-[140px]">
                  #{chartContext.allKeywords.slice(0, 2).join(' #') || '所見連動'}
                </span>
                <span className="text-amber-300">[3/4 HUD]</span>
              </div>
            </div>
          )}

          {/* Page 3: 32GB SD & 3省2GL */}
          {lcdPage === 3 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-400 font-bold">3省2GL Air-Gap LOCK</span>
                <span className="text-sky-300">32GB SD</span>
              </div>
              <div className="text-[9px] text-slate-300">
                10大医療マスター: 29.8GB 読取専用保護
              </div>
              <div className="text-[9px] text-emerald-300">
                外部通信: 0 Byte / MSC完全遮断済
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span>FW: v{LATEST_FIRMWARE_VERSION}</span>
                <span className="text-amber-300">[4/4 SYSTEM]</span>
              </div>
            </div>
          )}
        </div>

        {/* 実機右側: 物理RGB LED インジケータ ＋ タクトボタン */}
        <div className="flex flex-col items-center justify-between gap-2 shrink-0">
          <div className="flex flex-col items-center gap-0.5">
            <div
              className="w-3.5 h-3.5 rounded-full border border-slate-600 transition-all duration-150"
              style={{
                backgroundColor:
                  ledBrightness === 0
                    ? '#1e293b'
                    : isSending
                    ? `rgba(245, 158, 11, ${ledBrightness / 100})`
                    : isBleConnected
                    ? `rgba(16, 185, 129, ${ledBrightness / 100})`
                    : `rgba(14, 165, 233, ${ledBrightness / 100})`,
                boxShadow:
                  ledBrightness === 0
                    ? 'none'
                    : `0 0 ${Math.round((ledBrightness / 100) * 14)}px ${
                        isSending ? '#f59e0b' : isBleConnected ? '#10b981' : '#0ea5e9'
                      }`,
              }}
              title={`T-Dongle-S3 本体RGB LED (現在輝度: ${ledBrightness}%)`}
            />
            <span className="text-[8px] font-mono text-slate-400">LED</span>
          </div>

          <button
            type="button"
            onClick={() => handleSelectLcdPage(((lcdPage + 1) % 4) as 0 | 1 | 2 | 3)}
            className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-mono text-amber-300 cursor-pointer active:scale-90 transition-transform"
            title="T-Dongle-S3 液晶ページ切替 (本体ボタン短押しと同等)"
          >
            BTN⟳
          </button>
        </div>
      </div>

      {/* 4画面ダイレクト切替ボタン */}
      <div className="grid grid-cols-4 gap-1">
        {[
          { idx: 0 as const, label: '① 状態/WPM' },
          { idx: 1 as const, label: '② 漢字100%' },
          { idx: 2 as const, label: '③ 臨床HUD' },
          { idx: 3 as const, label: '④ 32GB/閉域' },
        ].map((p) => (
          <button
            key={p.idx}
            type="button"
            onClick={() => handleSelectLcdPage(p.idx)}
            className={`py-1 px-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer truncate ${
              lcdPage === p.idx
                ? 'bg-sky-500 text-slate-950 border-sky-300 shadow-sm'
                : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 💡 T-Dongle-S3 本体LED 輝度調節スライダー (0%〜100%) */}
      <div className="space-y-1.5 pt-1 border-t border-slate-800">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-bold text-amber-300 flex items-center gap-1">
            <Sun className="w-3.5 h-3.5 text-amber-400" />
            <span>T-Dongle-S3 LED輝度スライダー:</span>
          </span>
          <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
            {ledBrightness === 0 ? '🌙 0% (完全消灯)' : `${ledBrightness}%`}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={ledBrightness}
          onChange={(e) => handleLedBrightnessChange(Number(e.target.value))}
          aria-label="T-Dongle-S3 LED輝度調節スライダー"
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
        />

        {/* ワンタップ輝度プリセット */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { pct: 0, label: '🌙 0% 消灯' },
            { pct: 20, label: '🏥 20% 静音' },
            { pct: 65, label: '☀️ 65% 標準' },
            { pct: 100, label: '⚡ 100% 最大' },
          ].map((preset) => (
            <button
              key={preset.pct}
              type="button"
              onClick={() => {
                triggerHaptic(10);
                handleLedBrightnessChange(preset.pct);
              }}
              className={`py-1 rounded text-[9px] font-mono font-bold border transition-colors cursor-pointer ${
                ledBrightness === preset.pct
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 液晶バックライト輝度スライダー */}
        {!compact && (
          <div className="pt-1 flex items-center justify-between gap-2 text-[10px]">
            <span className="text-slate-400 shrink-0">IPS液晶バックライト: {lcdBrightness}%</span>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={lcdBrightness}
              onChange={(e) => handleLcdBrightnessChange(Number(e.target.value))}
              aria-label="T-Dongle-S3 液晶バックライト輝度スライダー"
              className="w-28 sm:w-36 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400"
            />
          </div>
        )}
      </div>
    </div>
  );
};
