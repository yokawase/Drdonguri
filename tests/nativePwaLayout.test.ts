import { describe, it, expect, vi } from 'vitest';
import { triggerHaptic } from '../src/components/nativePwa/types';
import { extractChartClinicalKeywords } from '../src/utils/chartTextCleaner';
import { auditRenalAndPrescriptions, detectClinicalRedFlags, calculateEmergencyDoses } from '../src/services/clinicalCopilotEngine';

describe('NativePwaEdgeLayout 分割モジュール検証', () => {
  it('triggerHaptic が navigator.vibrate の有無に関わらずクラッシュしない', () => {
    expect(() => triggerHaptic(15)).not.toThrow();
    expect(() => triggerHaptic([20, 40, 20])).not.toThrow();
  });

  it('臨床キーワード抽出とコパイロットエンジンが連動する', () => {
    const sampleText = '【主訴】労作時胸部絞扼感\n【現病歴】ST上昇を認め心電図にて急性心筋梗塞疑い。アムロジピン5mg内服中、eGFR 28。';
    const kw = extractChartClinicalKeywords(sampleText);
    expect(kw.allKeywords.length).toBeGreaterThan(0);
    expect(kw.drugKeywords).toContain('アムロジピン');

    const renal = auditRenalAndPrescriptions(sampleText);
    expect(renal.detectedEgfr).toBe(28);

    const redFlags = detectClinicalRedFlags(sampleText);
    expect(redFlags.length).toBeGreaterThan(0);

    const doses = calculateEmergencyDoses(60);
    expect(doses.length).toBeGreaterThan(0);
  });

  it('空文字が渡された場合は DEFAULT_SAMPLE_CHART_TEXT にフォールバックせず空のコンテキストを返す', () => {
    const emptyKw = extractChartClinicalKeywords('');
    expect(emptyKw.allKeywords.length).toBe(0);
    expect(emptyKw.directKeywords.length).toBe(0);
    expect(emptyKw.drugKeywords.length).toBe(0);
    expect(emptyKw.summaryLabel).toBe('');

    const emptyRenal = auditRenalAndPrescriptions('');
    expect(emptyRenal.alerts.length).toBe(0);

    const emptyRedFlags = detectClinicalRedFlags('');
    expect(emptyRedFlags.length).toBe(0);
  });
});
