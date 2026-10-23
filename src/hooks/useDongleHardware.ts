import { useState, useCallback, useRef } from 'react';
import { bleManager } from '../utils/webBluetooth';
import { triggerHaptic } from '../components/nativePwa/types';

export function useDongleHardware() {
  const [ledBrightness, setLedBrightness] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('drdongly_led_bright');
      if (saved !== null) return Math.max(0, Math.min(100, Number(saved)));
    }
    return 65;
  });

  const [lcdBrightness, setLcdBrightness] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('drdongly_lcd_bright');
      if (saved !== null) return Math.max(5, Math.min(100, Number(saved)));
    }
    return 90;
  });

  const [lcdPage, setLcdPage] = useState<0 | 1 | 2 | 3>(0);
  const [showDongleCockpit, setShowDongleCockpit] = useState(false);
  const bleBrightTimerRef = useRef<number | null>(null);

  const handleLedBrightnessChange = useCallback((pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    setLedBrightness(clamped);
    try {
      localStorage.setItem('drdongly_led_bright', String(clamped));
    } catch {}
    if (bleBrightTimerRef.current) window.clearTimeout(bleBrightTimerRef.current);
    bleBrightTimerRef.current = window.setTimeout(() => {
      bleManager.setLedBrightness(clamped);
    }, 45);
  }, []);

  const handleLcdBrightnessChange = useCallback((pct: number) => {
    const clamped = Math.max(5, Math.min(100, Math.round(pct)));
    setLcdBrightness(clamped);
    try {
      localStorage.setItem('drdongly_lcd_bright', String(clamped));
    } catch {}
    if (bleBrightTimerRef.current) window.clearTimeout(bleBrightTimerRef.current);
    bleBrightTimerRef.current = window.setTimeout(() => {
      bleManager.setLcdBrightness(clamped);
    }, 45);
  }, []);

  const handleSelectLcdPage = useCallback((page: 0 | 1 | 2 | 3) => {
    triggerHaptic(10);
    setLcdPage(page);
    bleManager.setLcdPage(page);
  }, []);

  const toggleDongleCockpit = useCallback(() => {
    triggerHaptic(10);
    setShowDongleCockpit((prev) => !prev);
  }, []);

  return {
    ledBrightness,
    lcdBrightness,
    lcdPage,
    showDongleCockpit,
    setShowDongleCockpit,
    toggleDongleCockpit,
    handleLedBrightnessChange,
    handleLcdBrightnessChange,
    handleSelectLcdPage,
  };
}
