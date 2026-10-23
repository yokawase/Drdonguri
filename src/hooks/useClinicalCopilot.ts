import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { extractChartClinicalKeywords } from '../utils/chartTextCleaner';
import {
  auditRenalAndPrescriptions,
  detectClinicalRedFlags,
  calculateEmergencyDoses,
  generateGuidelineEvidenceSnippets,
} from '../services/clinicalCopilotEngine';
import {
  compileToKeyStrokeStream,
  ensureLexiconLoaded,
  isLexiconLoaded,
} from '../services/KeyStrokeCompiler';
import { bleManager } from '../utils/webBluetooth';
import {
  CompiledStreamPreview,
  CopilotData,
  ChartContext,
} from '../components/nativePwa/types';

interface UseClinicalCopilotParams {
  inputText: string;
  isBleConnected: boolean;
}

export function useClinicalCopilot({ inputText, isBleConnected }: UseClinicalCopilotParams) {
  const [showCopilotPanel, setShowCopilotPanel] = useState(false);
  const [copilotTab, setCopilotTab] = useState<'redflag' | 'renal' | 'emergency' | 'evidence'>('redflag');
  const [patientWeightKg, setPatientWeightKg] = useState<number>(60);
  const [showKanjiInspector, setShowKanjiInspector] = useState(false);

  const deferredInputText = useDeferredValue(inputText);

  // カルテ全体キーワード抽出（deferredInputText によりタイピング遅延 0ms）
  const chartContext: ChartContext = useMemo(() => {
    const text = deferredInputText.trim();
    return extractChartClinicalKeywords(text);
  }, [deferredInputText]);

  // スーパーオンプレミス臨床コパイロット（腎機能監査・Red Flags・救急電卓・GLエビデンス）
  const copilotData: CopilotData = useMemo(() => {
    const text = deferredInputText.trim();
    const renalAudit = auditRenalAndPrescriptions(text);
    const redFlags = detectClinicalRedFlags(text);
    const effectiveWeight = patientWeightKg || 60;
    const emergencyDoses = calculateEmergencyDoses(effectiveWeight);
    const glSnippets = generateGuidelineEvidenceSnippets(text);

    return {
      renalAudit,
      redFlags,
      emergencyDoses,
      glSnippets,
      effectiveWeight,
    };
  }, [deferredInputText, patientWeightKg]);

  const [lexiconVersion, setLexiconVersion] = useState(() => (isLexiconLoaded() ? 1 : 0));
  useEffect(() => {
    let mounted = true;
    ensureLexiconLoaded().then(() => {
      if (mounted) setLexiconVersion((v) => v + 1);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const compiledStreamPreview: CompiledStreamPreview = useMemo(() => {
    const text = deferredInputText.trim();
    const stream = compileToKeyStrokeStream(text);
    let zCount = 0;
    let kCount = 0;
    let hCount = 0;
    let aCount = 0;
    let anchorBsCount = 0;

    for (const tok of stream.tokens) {
      if (tok.tag === 'Z') {
        zCount++;
        if (tok.romaji.includes('\x08')) anchorBsCount++;
      } else if (tok.tag === 'K') kCount++;
      else if (tok.tag === 'H') hCount++;
      else if (tok.tag === 'A') aCount++;
    }

    return {
      stream,
      zCount,
      kCount,
      hCount,
      aCount,
      anchorBsCount,
      totalLength: stream.streamText.length,
    };
  }, [deferredInputText, lexiconVersion]);

  // BLE接続時・カルテ更新時に T-Dongle-S3 実機の液晶 (Page 2: CLINICAL HUD) へ臨床テレメトリを自動同期
  useEffect(() => {
    if (!isBleConnected) return;
    const timer = window.setTimeout(() => {
      const egfrStr =
        copilotData.renalAudit.detectedEgfr !== null
          ? `eGFR:${copilotData.renalAudit.detectedEgfr}${
              copilotData.renalAudit.alerts.length > 0 ? '(!減量)' : '(正常)'
            }`
          : 'eGFR:未検出(監査待機)';
      const rfStr =
        copilotData.redFlags.length > 0
          ? `RF:${copilotData.redFlags.length}件 ${copilotData.redFlags[0].syndrome.slice(0, 8)}`
          : 'RF:0件 安全確認済';
      const kwStr =
        chartContext.allKeywords.length > 0
          ? chartContext.allKeywords.slice(0, 3).join('/')
          : '待機中';
      bleManager.syncHudTelemetry(
        compiledStreamPreview.zCount,
        compiledStreamPreview.kCount,
        compiledStreamPreview.aCount,
        compiledStreamPreview.hCount,
        98,
        copilotData.renalAudit.alerts.length + copilotData.redFlags.length,
        `${egfrStr} | ${rfStr} | ${kwStr}`
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isBleConnected, copilotData, chartContext, compiledStreamPreview]);

  return {
    showCopilotPanel,
    setShowCopilotPanel,
    copilotTab,
    setCopilotTab,
    patientWeightKg,
    setPatientWeightKg,
    showKanjiInspector,
    setShowKanjiInspector,
    chartContext,
    copilotData,
    compiledStreamPreview,
    deferredInputText,
  };
}
