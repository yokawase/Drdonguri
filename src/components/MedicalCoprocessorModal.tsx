import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Send, 
  Sparkles, 
  RefreshCw, 
  Printer, 
  Footprints,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Eraser,
  Zap,
  FileText
} from 'lucide-react';
import { bleManager } from '../utils/webBluetooth';
import { playMacBeep, playSosumi, triggerMacScreenFlash } from '../utils/macAudio';
import { cleanExtractedMedicalText } from '../utils/chartTextCleaner';
import {
  generateFourPointChartDigest,
  expandMedicalAbbreviations,
} from '../services/clinicalCopilotEngine';
import type { LearnedPair } from '../workers/diffWorker';

interface MedicalCoprocessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isBleConnected: boolean;
  onWriteBackToChart: (text: string) => Promise<void>;
  originalText?: string;
  onLearnDiff?: (pulledText: string, originalText: string, forcePromote?: boolean) => Promise<LearnedPair[]>;
  onOpenLearnedDict?: () => void;
}

// 誤変換を含む電カル吸い上げテキスト (誤字側: きょう新将、心金梗塞、新田図)
const SAMPLE_INGESTED_PAST_CHART = `2026/09/15 内科外来
Hx: HTN, T2DM, CKD G3b, pAf (ペニシリンアレルギーあり)
Rp) アムロジピン 5mg 1T 1x 朝食後、メトグルコ 500mg 2T 2x 朝夕食後、エリキュース 5mg 2T 2x 朝夕食後
BP 148/88 mmHg, HR 78/min, SpO2 98%, Cre 1.45 mg/dL, eGFR 36.2 mL/min, HbA1c 7.4%
c/o 階段昇降時の軽い息切れ。s/o 労作性きょう新将、r/o 心金梗塞増悪。
次回新田図・BNP再検予定。腎機能低下につきメトホルミン・DOAC減量基準要確認。`;

// 医師が意図した正しい原文 (正解側: 狭心症、心筋梗塞、心電図)
const SAMPLE_CORRECT_ORIGINAL_CHART = `2026/09/15 内科外来
Hx: HTN, T2DM, CKD G3b, pAf (ペニシリンアレルギーあり)
Rp) アムロジピン 5mg 1T 1x 朝食後、メトグルコ 500mg 2T 2x 朝夕食後、エリキュース 5mg 2T 2x 朝夕食後
BP 148/88 mmHg, HR 78/min, SpO2 98%, Cre 1.45 mg/dL, eGFR 36.2 mL/min, HbA1c 7.4%
c/o 階段昇降時の軽い息切れ。s/o 労作性狭心症、r/o 心筋梗塞増悪。
次回心電図・BNP再検予定。腎機能低下につきメトホルミン・DOAC減量基準要確認。`;

export const MedicalCoprocessorModal: React.FC<MedicalCoprocessorModalProps> = ({
  isOpen,
  onClose,
  isBleConnected,
  onWriteBackToChart,
  originalText = '',
  onLearnDiff,
  onOpenLearnedDict,
}) => {
  // 受信ステート
  const [ingestedRawText, setIngestedRawText] = useState<string>('');
  const [ingestedBytes, setIngestedBytes] = useState<number>(0);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [isReceiving, setIsReceiving] = useState<boolean>(false);
  const [isStructuring, setIsStructuring] = useState<boolean>(false);
  const [structuredSoapText, setStructuredSoapText] = useState<string>('');
  const [outputMode, setOutputMode] = useState<'soap' | 'digest'>('soap');
  const [copied, setCopied] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('電カル待機中：USBプリンター吸い上げ準備完了');
  const [isWritingBack, setIsWritingBack] = useState<boolean>(false);

  // 差分検証ステート
  const [customOriginalText, setCustomOriginalText] = useState<string>(originalText || '');
  const [detectedPairs, setDetectedPairs] = useState<LearnedPair[]>([]);
  const [isVerifyingDiff, setIsVerifyingDiff] = useState<boolean>(false);
  const [diffNotice, setDiffNotice] = useState<string>('');

  useEffect(() => {
    if (originalText && !customOriginalText) {
      setCustomOriginalText(originalText);
    }
  }, [originalText]);

  // 吸い上げテキストと正しい原文の差分を検証して学習辞書へ追加
  const handleVerifyAndLearn = async (pulled: string, original: string) => {
    if (!pulled.trim() || !original.trim() || !onLearnDiff) return;
    setIsVerifyingDiff(true);
    setDiffNotice('');
    try {
      const pairs = await onLearnDiff(pulled, original, true);
      setDetectedPairs(pairs);
      if (pairs.length > 0) {
        const pairSummary = pairs.map((p) => `「${p.source}」➔「${p.target}」`).join('、');
        setDiffNotice(`⚡ 誤変換検知: ${pairSummary} を学習辞書に追加しました！`);
        playMacBeep();
      } else {
        setDiffNotice('✓ 差分検証完了: 誤字・誤変換は検出されませんでした（原文と完全一致）');
      }
    } catch (err: any) {
      console.warn('[Coprocessor] 差分検証エラー:', err);
      setDiffNotice('⚠️ 差分検証中にエラーが発生しました');
    } finally {
      setIsVerifyingDiff(false);
    }
  };

  // BLE 仮想プリンタリスナー登録
  useEffect(() => {
    if (!isOpen) return;

    const unregData = bleManager.addPrinterDataListener((chunk: string, totalBytes: number) => {
      setIsReceiving(true);
      setIngestedBytes(totalBytes);
      setIngestedRawText(prev => prev + chunk);
      setStatusMessage(`📥 電カルからデータ受信中 (${totalBytes} Bytes 着弾)`);
    });

    const unregComplete = bleManager.addPrinterCompleteListener((fullText: string, totalBytes: number) => {
      setIsReceiving(false);
      setIsPulling(false);
      const { expandedText } = expandMedicalAbbreviations(fullText);
      const cleaned = cleanExtractedMedicalText(expandedText);
      setIngestedBytes(totalBytes);
      setIngestedRawText(cleaned);
      setStatusMessage(`✅ 電カル生データ吸い上げ＆略語正規化・空白削除完了 (${totalBytes} Bytes / ${cleaned.length} 文字)`);
      playSosumi();
      triggerMacScreenFlash();
      
      // 自動構造化をトリガー
      structureIntoSoap(cleaned, outputMode);

      // 正しい原文があれば、即座に差分を検証して学習辞書に追加！
      if (customOriginalText.trim() && onLearnDiff) {
        handleVerifyAndLearn(cleaned, customOriginalText);
      }
    });

    return () => {
      unregData();
      unregComplete();
    };
  }, [isOpen, outputMode, customOriginalText, onLearnDiff]);

  // フットペダル (Space / Enter キー) での書き戻しショートカット待機
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + Enter または F8キーでフットペダル代行
      if ((e.shiftKey && e.key === 'Enter') || e.key === 'F8') {
        e.preventDefault();
        if (structuredSoapText && !isWritingBack) {
          handleExecuteWriteBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, structuredSoapText, isWritingBack]);

  if (!isOpen) return null;

  // 1. 電カル過去カルテ吸い上げ (Ctrl+P -> Enter 自動打鍵)
  const handleTriggerAutoPull = async () => {
    playMacBeep();
    if (!isBleConnected) {
      alert('AtomS3U / T-Dongle-S3 とBLE接続されていません。\n右上の「BLE接続」を行うか、「長文過去カルテ試用読込」をお試しください。');
      return;
    }
    try {
      setIsPulling(true);
      setIngestedRawText('');
      setIngestedBytes(0);
      setStructuredSoapText('');
      bleManager.clearPrinterBuffer();
      setStatusMessage('⚡ ドングルが電カル画面へ [Ctrl+P] -> [Enter] を自動打鍵中...');
      await bleManager.triggerAutoPull();
      setStatusMessage('⏳ 電カルからの印刷スプール着弾を待機中...');
    } catch (err: any) {
      setIsPulling(false);
      setStatusMessage(`❌ 吸い上げエラー: ${err?.message || err}`);
      playSosumi();
    }
  };

  // 2. スマホエッジAIによる自律構造化 (SOAP下書き または 過去カルテ4点ダイジェスト)
  const structureIntoSoap = (raw: string, targetMode: 'soap' | 'digest' = outputMode) => {
    const { expandedText, appliedCount } = expandMedicalAbbreviations(raw);
    const cleanedRaw = cleanExtractedMedicalText(expandedText);
    if (!cleanedRaw.trim()) return;
    setIngestedRawText(cleanedRaw);
    setIsStructuring(true);
    setOutputMode(targetMode);
    setStatusMessage(
      targetMode === 'digest'
        ? '⚡ 過去カルテから4点爆速ダイジェスト（既往/処方/経過/To-Do）を生成中...'
        : '🧠 略語正規化・無駄な空白除去 ＆ 本日のSOAP自律構造化中...'
    );

    setTimeout(() => {
      try {
        if (targetMode === 'digest') {
          const digest = generateFourPointChartDigest(cleanedRaw);
          setStructuredSoapText(digest);
          setStatusMessage(
            `✨ 過去カルテ4点ダイジェスト完了！${appliedCount > 0 ? `（医学略語${appliedCount}件を日本語正規化）` : ''}`
          );
          return;
        }

        const lines = cleanedRaw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        
        // カテゴリ別分類
        const subjectiveLines: string[] = [];
        const objectiveLines: string[] = [];
        const assessmentLines: string[] = [];
        const planLines: string[] = [];

        // キーワード解析ルール
        const vitalRegex = /(?:BP|血圧|HR|心拍|脈拍|BT|体温|SpO2|KT|PR|RR)[:：\s]?\s*([0-9/.]+)/i;
        const labRegex = /(?:WBC|RBC|Hb|Plt|CRP|AST|ALT|γ-GTP|BUN|Cre|eGFR|HbA1c|Glu|BS)[:：\s]?\s*([0-9/.]+)/i;
        const rxRegex = /(?:処方|内服|Rp|錠|Cap|mg|g|日分|包|外用|点眼)/i;
        const dxRegex = /(?:病名|診断|疑い|除外|症候群|炎|症|不全|癌|病|障害)/i;

        lines.forEach(line => {
          if (vitalRegex.test(line) || labRegex.test(line) || line.includes('所見') || line.includes('検査')) {
            objectiveLines.push(line);
          } else if (rxRegex.test(line) || line.includes('指示') || line.includes('次回') || line.includes('点滴') || line.includes('予定')) {
            planLines.push(line);
          } else if (dxRegex.test(line) && !line.includes('処方')) {
            assessmentLines.push(line);
          } else {
            subjectiveLines.push(line);
          }
        });

        // 抽出できない場合のフォールバック整形
        const sPart = subjectiveLines.length > 0 
          ? subjectiveLines.slice(0, 5).join('\n') 
          : '前回カルテ経過確認。症状の推移をフォロー。';
        const oPart = objectiveLines.length > 0 
          ? objectiveLines.slice(0, 6).join('\n') 
          : 'バイタル安定。理学所見著変なし。';
        const aPart = assessmentLines.length > 0 
          ? assessmentLines.slice(0, 3).join('\n') 
          : '経過順調、病勢コントロール良好。';
        const pPart = planLines.length > 0 
          ? planLines.slice(0, 5).join('\n') 
          : '前回処方を継続投与。症状増悪時は再診指示。';

        const todayStr = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const soapDraft = `【${todayStr} 経過SOAP】
【S】
${sPart}

【O】
${oPart}

【A】
${aPart}

【P】
${pPart}`;

        setStructuredSoapText(soapDraft);
        setStatusMessage(
          `✨ スマホAI自律構造化完了！${appliedCount > 0 ? `（略語${appliedCount}件正規化済）` : ''}内容を確認し書き戻しを押してください。`
        );
      } finally {
        setIsStructuring(false);
      }
    }, 150);
  };

  // 3. カルテへの書き戻し打鍵実行
  const handleExecuteWriteBack = async () => {
    if (!structuredSoapText.trim()) return;
    playMacBeep();
    setIsWritingBack(true);
    setStatusMessage('🚀 AtomS3U経由で電カルへ新規カルテを100%着弾打鍵中...');
    try {
      await onWriteBackToChart(structuredSoapText);
      setStatusMessage('🎉 電カル新規カルテ欄へ完全着弾！双方向ループ完了');
      playSosumi();
      triggerMacScreenFlash();
      setTimeout(() => {
        setIsWritingBack(false);
      }, 1500);
    } catch (err: any) {
      setIsWritingBack(false);
      setStatusMessage(`❌ 書き戻しエラー: ${err?.message || err}`);
      playSosumi();
    }
  };

  // コピー
  const handleCopy = () => {
    if (!structuredSoapText) return;
    navigator.clipboard.writeText(structuredSoapText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    playMacBeep();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 animate-in fade-in backdrop-blur-md select-none font-sans">
      <div className="bg-[#0F172A] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* ヘッダー */}
        <div className="bg-[#1E293B] border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { playMacBeep(); onClose(); }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              aria-label="戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>戻る</span>
            </button>
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">電カル双方向受信コプロセッサ</h3>
                <span className="text-[10px] bg-slate-800 text-rose-400 border border-slate-700 font-bold px-2 py-0.5 rounded-full">
                  仮想プリンタ (07h)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                電子カルテから過去カルテ・検査所見を吸い上げ（無駄なスペース・改行を自動削除）
              </p>
            </div>
          </div>
          <button
            onClick={() => { playMacBeep(); onClose(); }}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* コプロセッサ サブヘッダー */}
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isBleConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-rose-500'}`} />
            <span className="font-bold text-slate-200">
              {isBleConnected ? 'T-Dongle-S3 双方向リンク確立中 (GATT 5.0)' : '⚠️ ドングル未接続 (画面右上でBLE接続してください)'}
            </span>
          </div>
          <span className="text-[11px] text-sky-400 font-mono">
            {statusMessage}
          </span>
        </div>

        {/* メインコンテンツエリア (2ペイン分割) */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
          
          {/* 左ペイン: 電カル過去テキスト吸い上げ (Virtual Printer Bulk OUT) */}
          <div className="flex flex-col border border-slate-700/80 bg-[#1E293B] rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/70 mb-2">
              <div className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-xs text-slate-100">① 電カル生データ吸い上げ (上り)</span>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 text-sky-300 border border-slate-700 rounded-lg px-2 py-0.5">
                {ingestedBytes > 0 ? `${ingestedBytes} Bytes` : '待機中'}
              </span>
            </div>

            {/* 吸い上げ実行ボタン */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={handleTriggerAutoPull}
                disabled={isPulling || isReceiving}
                className="flex-1 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isPulling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>自動吸い上げ打鍵中...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-slate-950" />
                    <span>📥 過去カルテ吸い上げ (Ctrl+P)</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setIngestedBytes(412);
                  const demoPulled = SAMPLE_INGESTED_PAST_CHART;
                  const demoOriginal = SAMPLE_CORRECT_ORIGINAL_CHART;
                  setCustomOriginalText(demoOriginal);
                  structureIntoSoap(demoPulled, 'digest');
                  if (onLearnDiff) {
                    handleVerifyAndLearn(demoPulled, demoOriginal);
                  }
                }}
                className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-sky-500/40 text-sky-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                title="誤変換を含む過去カルテの吸い上げ＆差分検証・自己学習を即座にシミュレートします"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span>過去カルテ試用 (差分学習体験)</span>
              </button>
            </div>

            <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-slate-800 mb-2 leading-relaxed">
              💡 <strong>逆流スキャン＆略語正規化:</strong> ドングルが電カルへ <code className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded border border-slate-700">[Ctrl+P] ➔ [Enter]</code> を自動打鍵！英語略語（HTN, DM, s/o, r/o等）を正式日本語に展開し、無駄な空白を除去して取り込みます。
            </div>

            {/* 吸い上げ生テキストモニター */}
            <div className="flex-1 flex flex-col min-h-[140px]">
              <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                <span>着弾テキスト (略語正規化 ＆ 空白・改行削除済):</span>
                {ingestedRawText && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const { expandedText } = expandMedicalAbbreviations(ingestedRawText);
                        const cleaned = cleanExtractedMedicalText(expandedText);
                        setIngestedRawText(cleaned);
                        setStatusMessage('✨ 医学略語の正規化 ＆ 無駄な空白削除を実行しました');
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-normal flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Eraser className="w-2.5 h-2.5" /> 略語・空白整理
                    </button>
                    <button
                      onClick={() => structureIntoSoap(ingestedRawText, outputMode)}
                      className="text-sky-400 hover:text-sky-300 font-normal flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> 再解析
                    </button>
                  </div>
                )}
              </div>
              <textarea
                value={ingestedRawText}
                onChange={(e) => setIngestedRawText(e.target.value)}
                onBlur={() => {
                  if (ingestedRawText.trim()) {
                    setIngestedRawText(cleanExtractedMedicalText(ingestedRawText));
                  }
                }}
                placeholder="電カルから吸い上げた過去カルテや紹介状テキストがここに自動着弾します... (直接ペースト時も自動で略語正規化・空白削除)"
                className="flex-1 w-full p-2.5 text-xs font-mono border border-slate-700/80 rounded-xl resize-none bg-[#0F172A] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 leading-relaxed min-h-[100px]"
              />
            </div>

            {/* 誤変換差分検証 ＆ 自己学習辞書への追加パネル */}
            <div className="mt-2.5 p-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>正しい原文との差分検証 ＆ 学習辞書追加</span>
                </div>
                {onOpenLearnedDict && (
                  <button
                    type="button"
                    onClick={onOpenLearnedDict}
                    className="text-[10px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
                  >
                    学習辞書を確認
                  </button>
                )}
              </div>

              {/* 正しい原文入力欄 */}
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-slate-400 flex justify-between">
                  <span>比較対象の正しい原文 (正解ターゲット):</span>
                  {originalText && (
                    <button
                      type="button"
                      onClick={() => setCustomOriginalText(originalText)}
                      className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                    >
                      メインエディタ原文を引用
                    </button>
                  )}
                </div>
                <textarea
                  value={customOriginalText}
                  onChange={(e) => setCustomOriginalText(e.target.value)}
                  placeholder="スマホで作成した正しい原文テキスト（メインエディタ下書き）..."
                  rows={2}
                  className="w-full p-2 text-[11px] font-mono border border-slate-700/80 rounded-lg bg-[#0F172A] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleVerifyAndLearn(ingestedRawText, customOriginalText)}
                  disabled={isVerifyingDiff || !ingestedRawText.trim() || !customOriginalText.trim()}
                  className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isVerifyingDiff ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>差分検証中...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-slate-950" />
                      <span>誤変換差分を検証して学習辞書に追加</span>
                    </>
                  )}
                </button>
              </div>

              {/* 検証結果表示 */}
              {diffNotice && (
                <div
                  className={`text-[11px] p-2 rounded-lg border leading-snug flex items-start gap-1.5 ${
                    detectedPairs.length > 0
                      ? 'bg-amber-950/70 text-amber-200 border-amber-500/50'
                      : 'bg-emerald-950/70 text-emerald-200 border-emerald-500/50'
                  }`}
                >
                  <span className="text-sm shrink-0">
                    {detectedPairs.length > 0 ? '⚡' : '✓'}
                  </span>
                  <div className="flex-1 flex flex-col gap-1">
                    <span>{diffNotice}</span>
                    {detectedPairs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {detectedPairs.map((p, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/60 border border-amber-500/40 rounded text-[10px] font-mono text-amber-100"
                          >
                            <span className="line-through opacity-75">{p.source}</span>
                            <ArrowRight className="w-2.5 h-2.5 text-amber-400" />
                            <strong className="text-white">{p.target}</strong>
                            <span className="text-[9px] bg-amber-500 text-slate-950 rounded px-1 font-bold">
                              即昇格済
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右ペイン: スマホエッジAI 自律構造化 ＆ カルテ書き戻し (下り) */}
          <div className="flex flex-col border border-slate-700/80 bg-[#1E293B] rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/70 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-xs text-slate-100">② 過去カルテ4点ダイジェスト / SOAP下書き</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  disabled={!structuredSoapText}
                  className="text-[10px] px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  title="クリップボードへコピー"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '済' : 'コピー'}</span>
                </button>
              </div>
            </div>

            {/* AI再生成 2モード切替ボタン */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                onClick={() => structureIntoSoap(ingestedRawText || SAMPLE_INGESTED_PAST_CHART, 'digest')}
                disabled={isStructuring}
                className={`font-bold text-xs py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  outputMode === 'digest'
                    ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>⚡ 4点爆速ダイジェスト</span>
              </button>
              <button
                onClick={() => structureIntoSoap(ingestedRawText || SAMPLE_INGESTED_PAST_CHART, 'soap')}
                disabled={isStructuring}
                className={`font-bold text-xs py-2 px-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  outputMode === 'soap'
                    ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                    : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/40'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>🧠 本日のSOAP下書き</span>
              </button>
            </div>

            {/* 整形SOAPテキストエリア */}
            <div className="flex-1 flex flex-col min-h-[160px] mb-2">
              <div className="text-[10px] font-bold text-slate-400 mb-1">
                本日のSOAP下書き (編集可能):
              </div>
              <textarea
                value={structuredSoapText}
                onChange={(e) => setStructuredSoapText(e.target.value)}
                placeholder="AIが生成した本日のSOAP下書きがここに展開されます... 内容を確認・追記してください。"
                className="flex-1 w-full p-2.5 text-xs font-mono border border-slate-700/80 rounded-xl resize-none bg-[#0F172A] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 leading-relaxed"
              />
            </div>

            {/* 書き戻し打鍵トリガーボタン */}
            <div className="pt-2 border-t border-slate-700/70 flex flex-col gap-2">
              <button
                onClick={handleExecuteWriteBack}
                disabled={!structuredSoapText.trim() || isWritingBack || !isBleConnected}
                className="font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isWritingBack ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>新規カルテ欄へ100%打鍵中...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    <span>✍️ 新規カルテへ書き戻し (100%着弾打鍵)</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span className="flex items-center gap-1 font-mono">
                  <Footprints className="w-3 h-3 text-slate-400" />
                  足踏みペダル対応: <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded border border-slate-700">Shift + Enter</code> または <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded border border-slate-700">F8</code>
                </span>
                <span className="text-emerald-400 font-bold">
                  v20.1 HYBRIDキーストローク直結
                </span>
              </div>
            </div>

          </div>

        </div>

        {/* ウィンドウフッター */}
        <div className="p-3 border-t border-slate-800 bg-[#1E293B] flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-mono text-[11px]">
              閉域網電子カルテ 双方向臨床ループ: <strong className="text-slate-200">吸い上げ ➔ 要約 ➔ 書き戻し</strong>
            </span>
          </div>
          <button
            onClick={() => { playMacBeep(); onClose(); }}
            className="px-4 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            完了して閉じる
          </button>
        </div>

      </div>
    </div>
  );
};
