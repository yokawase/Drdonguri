import { useState, useEffect, useCallback } from 'react';

export type DeviceType = 'desktop' | 'tablet' | 'mobile';
export type AdaptiveMode = 'auto' | DeviceType;

export interface AdaptiveLayoutState {
  /** ユーザー選択モード ('auto' | 'desktop' | 'tablet' | 'mobile') */
  mode: AdaptiveMode;
  /** 実際に適用されるデバイスタイプ ('desktop' | 'tablet' | 'mobile') */
  deviceType: DeviceType;
  /** 画面幅 */
  width: number;
  /** 画面高さ */
  height: number;
  /** 横向き表示かどうか (width > height) */
  isLandscape: boolean;
  /** タッチスクリーン搭載かどうか */
  isTouch: boolean;
  /** デスクトップ判定 (effective) */
  isDesktop: boolean;
  /** タブレット判定 (effective) */
  isTablet: boolean;
  /** スマホ判定 (effective) */
  isMobile: boolean;
  /** モード変更ハンドラ */
  setMode: (mode: AdaptiveMode) => void;
}

const STORAGE_KEY = 'drdongly_adaptive_mode_v1';

/**
 * 画面サイズとデバイス種別を検知・制御するアダプティブデザイン用フック
 * - Breakpoints:
 *   - Mobile: < 640px
 *   - Tablet: 640px <= width < 1024px
 *   - Desktop: >= 1024px
 * - 手動切替（auto / desktop / tablet / mobile）に対応し、PC上でスマホUIのテストも可能
 */
export function useAdaptiveLayout(): AdaptiveLayoutState {
  const [mode, setModeState] = useState<AdaptiveMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY) as AdaptiveMode | null;
      if (saved && ['auto', 'desktop', 'tablet', 'mobile'].includes(saved)) {
        return saved;
      }
    }
    return 'auto';
  });

  const [windowDimensions, setWindowDimensions] = useState(() => {
    if (typeof window !== 'undefined') {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      };
    }
    return {
      width: 1200,
      height: 800,
      isTouch: false,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
        isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const setMode = useCallback((newMode: AdaptiveMode) => {
    setModeState(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newMode);
    }
  }, []);

  // 実画面サイズに基づく自動判定
  const detectedType: DeviceType = (() => {
    const { width } = windowDimensions;
    if (width < 640) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  })();

  // 手動オーバーライドがある場合はそれを優先、autoの場合は自動判定
  const deviceType: DeviceType = mode === 'auto' ? detectedType : mode;

  const isLandscape = windowDimensions.width > windowDimensions.height;

  return {
    mode,
    deviceType,
    width: windowDimensions.width,
    height: windowDimensions.height,
    isLandscape,
    isTouch: windowDimensions.isTouch,
    isDesktop: deviceType === 'desktop',
    isTablet: deviceType === 'tablet',
    isMobile: deviceType === 'mobile',
    setMode,
  };
}
