import React, { useState, useRef, useEffect } from 'react';
import { Monitor, Tablet, Smartphone, Sparkles, ChevronDown } from 'lucide-react';
import { AdaptiveMode, DeviceType } from '../hooks/useAdaptiveLayout';
import { playMacBeep } from '../utils/macAudio';

interface AdaptiveModeSwitcherProps {
  mode: AdaptiveMode;
  deviceType: DeviceType;
  onSelectMode: (mode: AdaptiveMode) => void;
  compact?: boolean;
}

export const AdaptiveModeSwitcher: React.FC<AdaptiveModeSwitcherProps> = ({
  mode,
  deviceType,
  onSelectMode,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getLabel = () => {
    if (mode === 'auto') {
      const typeLabel = deviceType === 'desktop' ? 'PC' : deviceType === 'tablet' ? 'タブレット' : 'スマホ';
      return `自動 (${typeLabel})`;
    }
    if (mode === 'desktop') return 'PC固定';
    if (mode === 'tablet') return 'タブレット固定';
    return 'スマホ固定';
  };

  const getIcon = () => {
    if (mode === 'auto') {
      if (deviceType === 'desktop') return <Monitor className="w-3 h-3 text-neutral-800" />;
      if (deviceType === 'tablet') return <Tablet className="w-3 h-3 text-neutral-800" />;
      return <Smartphone className="w-3 h-3 text-neutral-800" />;
    }
    if (mode === 'desktop') return <Monitor className="w-3 h-3" />;
    if (mode === 'tablet') return <Tablet className="w-3 h-3" />;
    return <Smartphone className="w-3 h-3" />;
  };

  const handleSelect = (m: AdaptiveMode) => {
    playMacBeep();
    onSelectMode(m);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block text-xs select-none">
      <button
        type="button"
        onClick={() => {
          playMacBeep();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-1 border border-black bg-white hover:bg-neutral-100 px-1.5 py-0.5 shadow-[1px_1px_0_#000] cursor-pointer text-[10px] font-mono ${
          mode !== 'auto' ? 'bg-amber-50 font-bold' : ''
        }`}
        title="アダプティブ表示モード切り替え（PC / タブレット / スマホ画面の最適化）"
      >
        {getIcon()}
        {!compact && <span>{getLabel()}</span>}
        <ChevronDown className="w-2.5 h-2.5 text-neutral-600" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border-2 border-black shadow-[3px_3px_0_#000] py-1 z-50 text-xs">
          <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-black/20 font-bold">
            アダプティブ表示切替
          </div>

          <button
            type="button"
            onClick={() => handleSelect('auto')}
            className={`w-full text-left px-2 py-1 flex items-center justify-between hover:bg-black hover:text-white cursor-pointer ${
              mode === 'auto' ? 'bg-neutral-100 font-bold' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>自動検出 (推奨)</span>
            </span>
            {mode === 'auto' && <span>✓</span>}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('desktop')}
            className={`w-full text-left px-2 py-1 flex items-center justify-between hover:bg-black hover:text-white cursor-pointer ${
              mode === 'desktop' ? 'bg-neutral-100 font-bold' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" />
              <span>💻 PC / デスクトップ</span>
            </span>
            {mode === 'desktop' && <span>✓</span>}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('tablet')}
            className={`w-full text-left px-2 py-1 flex items-center justify-between hover:bg-black hover:text-white cursor-pointer ${
              mode === 'tablet' ? 'bg-neutral-100 font-bold' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Tablet className="w-3.5 h-3.5" />
              <span>📱 タブレット</span>
            </span>
            {mode === 'tablet' && <span>✓</span>}
          </button>

          <button
            type="button"
            onClick={() => handleSelect('mobile')}
            className={`w-full text-left px-2 py-1 flex items-center justify-between hover:bg-black hover:text-white cursor-pointer ${
              mode === 'mobile' ? 'bg-neutral-100 font-bold' : ''
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>📲 スマホ / モバイル</span>
            </span>
            {mode === 'mobile' && <span>✓</span>}
          </button>

          <div className="border-t border-black/20 mt-1 pt-1 px-2 text-[9px] text-gray-500">
            ※各端末の画面サイズに合わせて自動最適化されます
          </div>
        </div>
      )}
    </div>
  );
};
