import { compileToKeyStrokeStream } from '../../services/KeyStrokeCompiler';
import {
  auditRenalAndPrescriptions,
  detectClinicalRedFlags,
  calculateEmergencyDoses,
  generateGuidelineEvidenceSnippets,
} from '../../services/clinicalCopilotEngine';
import { extractChartClinicalKeywords } from '../../utils/chartTextCleaner';

export interface CompiledStreamPreview {
  stream: ReturnType<typeof compileToKeyStrokeStream>;
  zCount: number;
  kCount: number;
  hCount: number;
  aCount: number;
  anchorBsCount: number;
  totalLength: number;
}

export interface CopilotData {
  renalAudit: ReturnType<typeof auditRenalAndPrescriptions>;
  redFlags: ReturnType<typeof detectClinicalRedFlags>;
  emergencyDoses: ReturnType<typeof calculateEmergencyDoses>;
  glSnippets: ReturnType<typeof generateGuidelineEvidenceSnippets>;
  effectiveWeight: number;
}

export type ChartContext = ReturnType<typeof extractChartClinicalKeywords>;

/** 触覚フィードバックユーティリティ */
export const triggerHaptic = (pattern: number | number[] = 15) => {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {}
};
