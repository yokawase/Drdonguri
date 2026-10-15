import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  BookOpen,
  Pill,
  FileText,
  Activity,
  ClipboardList,
  ShieldAlert,
  Plus,
  Copy,
  Check,
  Sparkles,
  Brain,
  AlertTriangle,
  Info,
  RefreshCw,
  FlaskConical,
  HardDrive,
  Camera,
  Siren,
  Calculator,
} from 'lucide-react';
import {
  searchUnifiedMedicalKnowledge,
  UnifiedMedicalSearchResult,
  MindsKnowledgeItem,
  DrugKnowledgeItem,
  DiseaseKnowledgeItem,
  LabTestKnowledgeItem,
  ProcedureKnowledgeItem,
  RenalDoseKnowledgeItem,
  MedicalSearchItemType,
} from '../data/medicalKnowledgeCatalog';
import {
  MICRO_SD_STORAGE_MAP,
} from '../data/microSdMedicalCatalog';
import {
  consultGuidelineWithWebLLM,
  ModelLoadProgress,
} from '../services/webLlmService';
import {
  searchWithEmbeddingGemma,
  SemanticSearchResult,
} from '../services/embeddingGemmaService';
import { playMacBeep, playSosumi } from '../utils/macAudio';

interface MedicalDataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onInsertText: (text: string) => void;
  initialQuery?: string;
}

type TabFilterType = 'all' | 'minds' | 'emer' | 'atlas' | 'drug' | 'renal' | 'lab' | 'score' | 'proc' | 'disease' | 'sdmap';

export const MedicalDataSearchModal: React.FC<MedicalDataSearchModalProps> = ({
  isOpen,
  onClose,
  inputText,
  onInsertText,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [filterType, setFilterType] = useState<TabFilterType>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  // EmbeddingGemma 2 (740M MRL 128d) セマンティック検索ステート (Ollama代替)
  const [useSemantic, setUseSemantic] = useState(true);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult[]>([]);
  const [isSearchingSemantic, setIsSearchingSemantic] = useState(false);

  // WebLLM 相談用ステート
  const [activeMindsItem, setActiveMindsItem] = useState<MindsKnowledgeItem | null>(null);
  const [llmStreamingOutput, setLlmStreamingOutput] = useState<string>('');
  const [isLlmGenerating, setIsLlmGenerating] = useState(false);
  const [, setLlmProgress] = useState<ModelLoadProgress | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setActiveMindsItem(null);
      setLlmStreamingOutput('');
      setIsLlmGenerating(false);
    }
  }, [isOpen, initialQuery]);

  // EmbeddingGemma 2 セマンティック検索の非同期実行
  useEffect(() => {
    if (!useSemantic) {
      setSemanticResults([]);
      return;
    }

    let isMounted = true;
    const executeSearch = async () => {
      const q = query.trim() || '急性';
      setIsSearchingSemantic(true);
      try {
        const results = await searchWithEmbeddingGemma(q, filterType as any, 35, true);
        if (isMounted) {
          setSemanticResults(results);
        }
      } catch (err) {
        console.error('EmbeddingGemma search error:', err);
      } finally {
        if (isMounted) {
          setIsSearchingSemantic(false);
        }
      }
    };

    const timer = setTimeout(executeSearch, 60);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query, filterType, useSemantic]);

  // 検索結果 (セマンティック有効時は EmbeddingGemma、無効時は従来のキーワード検索)
  const searchResults = useMemo(() => {
    if (useSemantic && semanticResults.length > 0) {
      return semanticResults;
    }
    if (!query.trim()) {
      return searchUnifiedMedicalKnowledge('急性', filterType as any, 20);
    }
    return searchUnifiedMedicalKnowledge(query, filterType as any, 35);
  }, [query, filterType, useSemantic, semanticResults]);

  // コピー処理
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    playMacBeep();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // カルテ挿入テキストの生成
  const getInsertText = (item: UnifiedMedicalSearchResult): string => {
    const sem = item as SemanticSearchResult;
    if (sem.emergencyData) {
      return `【救急・中毒プロトコル】${sem.emergencyData.title} (${sem.emergencyData.category})\n・原因/病態: ${sem.emergencyData.substanceOrCondition}\n・解毒/拮抗薬: ${sem.emergencyData.antidoteOrTreatment}\n・初期プロトコル: ${sem.emergencyData.initialProtocol}\n※留意点: ${sem.emergencyData.cautions}`;
    }
    if (sem.atlasData) {
      return `【臨床アトラス】${sem.atlasData.title} (${sem.atlasData.category})\n・典型所見: ${sem.atlasData.typicalFeatures}\n・臨床的意義: ${sem.atlasData.clinicalSignificance}\n・鑑別疾患: ${sem.atlasData.differentialDiagnosis}`;
    }
    if (sem.drugIdData) {
      return `【持参薬識別】${sem.drugIdData.brandName} (${sem.drugIdData.genericName})\n・刻印記号: 【${sem.drugIdData.imprintCode}】\n・外観形状: ${sem.drugIdData.colorAndShape}\n・用法用量: ${sem.drugIdData.standardDose}\n※注意: ${sem.drugIdData.majorCautions}`;
    }
    if (sem.scoreData) {
      return `【臨床スコア】${sem.scoreData.scoreName}\n・計算式: ${sem.scoreData.calculationFormula}\n・リスク判定: ${sem.scoreData.riskEvaluation}\n・推奨アクション: ${sem.scoreData.clinicalAction}`;
    }

    switch (item.type) {
      case 'minds':
        return `【Minds推奨 ${item.title}】\n${item.content}\n（実践Tips: ${item.extraInfo || ''}）`;
      case 'lab':
        return item.labData?.soapTemplate || `【検査】${item.labData?.name}: 基準値 ${item.labData?.referenceRange}`;
      case 'proc':
        return item.procData?.soapTemplate || `【算定】${item.procData?.name} (${item.procData?.points})`;
      case 'renal':
        if (item.renalData) {
          const cutoffs = item.renalData.cutoffs.map((c) => `  ・${c.range}: ${c.dose}`).join('\n');
          return `【腎機能別投与設計】${item.renalData.drugName} (標準量: ${item.renalData.standardDose})\n${cutoffs}\n※留意点: ${item.renalData.clinicalTip}`;
        }
        return item.content;
      case 'drug':
        return `【処方】${item.drugData?.name} ${item.drugData?.standardDosage}`;
      case 'disease':
        return `【病名】${item.diseaseData?.name} (${item.diseaseData?.icd10})`;
      default:
        return item.content;
    }
  };

  // カルテ挿入処理
  const handleInsert = (text: string, id: string) => {
    playMacBeep();
    onInsertText(text);
    setInsertedId(id);
    setTimeout(() => setInsertedId(null), 1800);
  };

  // カルテからキーワード自動抽出
  const handleExtractFromChart = () => {
    playMacBeep();
    if (!inputText.trim()) {
      setQuery('生活習慣病');
      return;
    }
    // 代表的な臨床キーワードの検出
    const keywords = [
      'HbA1c', 'eGFR', 'BNP', 'D-ダイマー', 'CRP', 'TSH',
      '生活習慣病', '特定疾患', '心電図', 'オンライン診療',
      'エリキュース', 'イグザレルト', 'リクシアナ', 'メトホルミン', 'ジャディアンス', 'バラシクロビル',
      '高血圧', '糖尿病', '感冒', '咽頭炎', '気管支炎', '肺炎', '喘息', '心房細動', '心不全', '逆流性食道炎', '痛風', '頭痛'
    ];
    const found = keywords.find((kw) => inputText.includes(kw));
    if (found) {
      setQuery(found);
    } else {
      const firstLine = inputText.split('\n')[0].slice(0, 10).trim();
      setQuery(firstLine || '生活習慣病');
    }
  };

  // WebLLM 臨床相談
  const handleConsultWebLlm = async (item: MindsKnowledgeItem) => {
    setActiveMindsItem(item);
    setLlmStreamingOutput('');
    setIsLlmGenerating(true);
    setLlmError(null);
    playMacBeep();

    try {
      const result = await consultGuidelineWithWebLLM(
        inputText || '（カルテ未入力：一般的な臨床方針について）',
        {
          id: item.id,
          icd10: item.icd10,
          diseaseName: item.diseaseName,
          category: item.category,
          cqNum: item.cqNum,
          cqTitle: item.cqTitle,
          strength: item.strength,
          evidenceLevel: item.evidenceLevel,
          recommendation: item.recommendation,
          detail: item.detail,
        },
        (streamText) => {
          setLlmStreamingOutput(streamText);
        }
      );
      setLlmStreamingOutput(result);
    } catch (err: any) {
      console.error(err);
      playSosumi();
      setLlmError(err?.message || 'WebLLM推論中にエラーが発生しました。WebGPUの有効化をご確認ください。');
    } finally {
      setIsLlmGenerating(false);
      setLlmProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in">
      <div
        className="mac-window bg-white border-2 border-black max-w-4xl w-full h-[92vh] sm:h-[86vh] flex flex-col shadow-[6px_6px_0_#000] overflow-hidden"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        {/* レトロMac System 7 ウィンドウヘッダー */}
        <div className="mac-title-bar bg-white border-b-2 border-black px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { playMacBeep(); onClose(); }}
              className="w-4 h-4 border border-black bg-white hover:bg-black hover:text-white flex items-center justify-center text-[10px] font-bold shadow-[1px_1px_0_#000] cursor-pointer"
              title="閉じる"
            >
              ✕
            </button>
            <div className="font-bold text-xs sm:text-sm flex items-center gap-1.5 text-black">
              <span>📚 臨床データ統合検索 (Minds・検査値・指導料・腎機能減量・医薬品・病名)</span>
            </div>
          </div>
          <div className="text-[10px] text-purple-900 font-bold bg-purple-100 border border-purple-300 px-2 py-0.5 hidden sm:flex items-center gap-1 shadow-[1px_1px_0_#000]">
            <Brain className="w-3 h-3 text-purple-700" />
            <span>EmbeddingGemma 2 (740M MRL) 搭載</span>
          </div>
        </div>

        {/* 検索入力バー ＆ カルテ自動連動 */}
        <div className="p-3 bg-gray-50 border-b border-black space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="病名、薬剤名、検査値(HbA1c/eGFR)、指導料(生活習慣病)、腎機能減量(DOAC)、読み、ICD-10..."
                className="w-full bg-white border-2 border-black px-3 py-1.5 text-xs sm:text-sm font-sans focus:outline-none focus:bg-yellow-50 shadow-[2px_2px_0_#000]"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-black font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            {/* EmbeddingGemma 2 (740M MRL 128d) セマンティック検索トグル (Ollama不要) */}
            <button
              type="button"
              onClick={() => {
                playMacBeep();
                setUseSemantic(!useSemantic);
              }}
              className={`px-2.5 py-1.5 border-2 border-black text-xs font-bold shadow-[2px_2px_0_#000] whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors ${
                useSemantic
                  ? 'bg-purple-100 text-purple-950 border-black ring-1 ring-purple-600'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
              title="Google DeepMind EmbeddingGemma 2 (740M MRL 128d) による完全ブラウザ内ローカルセマンティック検索。Ollama等の外部サーバー不要で0.5ms推論"
            >
              <Brain className={`w-3.5 h-3.5 ${useSemantic ? 'text-purple-700 animate-pulse' : 'text-gray-400'}`} />
              <span className="hidden sm:inline">⚡ Gemma 2 {useSemantic ? 'ON' : 'OFF'}</span>
              <span className="sm:hidden">Gemma</span>
            </button>

            <button
              onClick={handleExtractFromChart}
              className="px-2.5 py-1.5 border border-black bg-white hover:bg-black hover:text-white text-xs font-bold shadow-[2px_2px_0_#000] whitespace-nowrap flex items-center gap-1 cursor-pointer"
              title="カルテ入力内容からキーワードを自動抽出して検索"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">カルテから抽出</span>
              <span className="sm:hidden">抽出</span>
            </button>
          </div>

          {/* クイックサジェストチップス */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px] text-gray-700">
            <span className="text-gray-500 font-mono text-[10px] shrink-0">頻出:</span>
            {[
              { label: '農薬中毒/PAM', q: '農薬中毒' },
              { label: '前壁STEMI心電図', q: '前壁STEMI' },
              { label: 'タケキャブ刻印', q: 'タケキャブ' },
              { label: 'CHADS2スコア', q: 'CHADS2' },
              { label: 'アナフィラキシー', q: 'アナフィラキシー' },
              { label: '生活習慣病管理料', q: '生活習慣病管理料' },
              { label: 'eGFR/DOAC', q: 'eGFR' },
              { label: 'HbA1c', q: 'HbA1c' },
              { label: '急性咳嗽', q: '咳嗽' },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => { playMacBeep(); setQuery(chip.q); }}
                className="px-1.5 py-0.5 border border-gray-400 bg-white hover:bg-yellow-100 text-gray-800 text-[10px] whitespace-nowrap cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* フィルタタブ */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => { playMacBeep(); setFilterType('all'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] ${
                filterType === 'all' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              すべて ({searchResults.length})
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('emer'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'emer' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Siren className="w-3 h-3 text-red-600" />
              <span>🚑 救急・中毒</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('atlas'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'atlas' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Camera className="w-3 h-3 text-purple-600" />
              <span>🖼️ アトラス・ECG</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('drug'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'drug' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Pill className="w-3 h-3 text-teal-600" />
              <span>💊 処方・持参薬識別</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('score'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'score' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Calculator className="w-3 h-3 text-orange-600" />
              <span>🧮 臨床スコア</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('lab'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'lab' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Activity className="w-3 h-3 text-rose-600" />
              <span>🔬 検査値＆基準値</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('proc'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'proc' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <ClipboardList className="w-3 h-3 text-blue-600" />
              <span>💉 診療行為・指導料</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('renal'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'renal' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <ShieldAlert className="w-3 h-3 text-amber-600" />
              <span>⚠️ 腎機能別減量</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('minds'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'minds' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <BookOpen className="w-3 h-3 text-emerald-600" />
              <span>Minds (169CQ)</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('disease'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'disease' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <FileText className="w-3 h-3 text-indigo-600" />
              <span>傷病名</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('sdmap'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'sdmap' ? 'bg-indigo-950 text-white' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border-indigo-400'
              }`}
            >
              <HardDrive className="w-3 h-3 text-indigo-500" />
              <span>💾 32GB SDマップ</span>
            </button>
          </div>
        </div>

        {/* メインコンテンツエリア (検索結果一覧 ＆ WebLLM相談パネル ＆ SD領域マップ) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 32GB MicroSD 全領域配分マップ ビュー */}
          {filterType === 'sdmap' ? (
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 font-sans bg-slate-50">
              {/* マップヘッダー ＆ 物理仕様バナー */}
              <div className="bg-indigo-950 text-white p-3 border-2 border-black shadow-[3px_3px_0_#000] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-indigo-300" />
                    <span className="font-bold text-sm sm:text-base">LilyGO T-Dongle-S3 32GB MicroSD 全領域配分マップ</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500 text-black text-[10px] font-mono font-bold">
                    Zero-Write 読取専用保護
                  </span>
                </div>
                <p className="text-xs text-indigo-200 leading-relaxed">
                  物理容量 32GB (FAT32実効 29.8GB) を極限まで活用。臨床原本PDF・ローカルAIモデル重み・全品目添付文書・高解像度アトラスを完全収録し、電子カルテ端末でのオフライン超高速検索を実現します。
                </p>

                {/* ストレージ容量バー */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] font-mono text-indigo-200">
                    <span>収録済医療データ: 29.8 GB / 29.8 GB (100%)</span>
                    <span>FAT破損防止 Zero-Write 設計</span>
                  </div>
                  <div className="w-full h-3 bg-indigo-900 border border-indigo-700 flex overflow-hidden">
                    {MICRO_SD_STORAGE_MAP.map((part, pidx) => {
                      const colors = [
                        'bg-blue-500',
                        'bg-purple-500',
                        'bg-teal-500',
                        'bg-pink-500',
                        'bg-amber-500',
                        'bg-red-500',
                        'bg-emerald-500',
                        'bg-slate-400',
                      ];
                      return (
                        <div
                          key={pidx}
                          style={{ width: `${part.percentage}%` }}
                          className={`${colors[pidx % colors.length]} h-full transition-all hover:opacity-80`}
                          title={`${part.categoryName}: ${part.sizeGb} GB (${part.percentage}%)`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 10大カテゴリ パーティションカード一覧 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {MICRO_SD_STORAGE_MAP.map((part, pidx) => {
                  const getCategoryTab = (path: string): TabFilterType => {
                    if (path.includes('guidelines')) return 'minds';
                    if (path.includes('protocols/toxicology') || path.includes('protocols')) return 'emer';
                    if (path.includes('clinical_atlas')) return 'atlas';
                    if (path.includes('drugs')) return 'drug';
                    if (path.includes('tensuhyo')) return 'proc';
                    return 'all';
                  };
                  const targetTab = getCategoryTab(part.path);

                  return (
                    <div
                      key={pidx}
                      className="border border-black bg-white p-3 shadow-[2px_2px_0_#000] flex flex-col justify-between space-y-2 hover:border-indigo-600 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs text-slate-900">
                            {part.categoryName}
                          </span>
                          <span className="shrink-0 font-mono font-bold text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 border border-indigo-200">
                            {part.sizeGb} GB ({part.percentage}%)
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 border border-gray-200">
                          {part.path}
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          {part.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-gray-200 text-[10px]">
                        <span className="font-semibold text-gray-600">
                          {part.itemCountDescription}
                        </span>
                        {targetTab !== 'all' && (
                          <button
                            onClick={() => {
                              playMacBeep();
                              setFilterType(targetTab);
                            }}
                            className="px-2 py-0.5 border border-black bg-white hover:bg-black hover:text-white font-bold shadow-[1px_1px_0_#000] text-[10px] cursor-pointer"
                          >
                            データ閲覧 ➔
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 通常の検索結果リスト */
            <div className={`flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 ${activeMindsItem ? 'md:max-w-[55%]' : 'w-full'}`}>
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500 font-sans text-xs space-y-2">
                  <Search className="w-8 h-8 mx-auto text-gray-400 stroke-1" />
                  <p className="font-bold">一致する臨床データが見つかりませんでした</p>
                  <p className="text-[11px]">救急中毒（「農薬」「アセトアミノフェン」）、アトラス（「前壁STEMI」）、持参薬刻印（「タケキャブ」）、スコア（「CHADS2」）等でお試しください。</p>
                </div>
              ) : (
                searchResults.map((item, idx) => {
                  const uniqueKey = `${item.type}-${idx}`;
                  const isItemCopied = copiedId === uniqueKey;
                  const isItemInserted = insertedId === uniqueKey;
                  const insertText = getInsertText(item);
                  const sem = item as SemanticSearchResult;

                  // アイテムごとのカラー設定
                  let badgeStyle = 'bg-gray-100 text-gray-900 border-gray-300';
                  let badgeLabel = '情報';
                  if (item.type === 'emer' || sem.emergencyData) {
                    badgeStyle = 'bg-red-100 text-red-950 border-red-300';
                    badgeLabel = '🚑 救急中毒';
                  } else if (item.type === 'atlas' || sem.atlasData) {
                    badgeStyle = 'bg-purple-100 text-purple-950 border-purple-300';
                    badgeLabel = '🖼️ アトラス';
                  } else if (item.type === 'drug_id' || sem.drugIdData) {
                    badgeStyle = 'bg-teal-100 text-teal-950 border-teal-300';
                    badgeLabel = '💊 持参薬識別';
                  } else if (item.type === 'score' || sem.scoreData) {
                    badgeStyle = 'bg-orange-100 text-orange-950 border-orange-300';
                    badgeLabel = '🧮 臨床スコア';
                  } else if (item.type === 'lab') {
                    badgeStyle = 'bg-rose-100 text-rose-900 border-rose-300';
                    badgeLabel = '🔬 検査値';
                  } else if (item.type === 'proc') {
                    badgeStyle = 'bg-blue-100 text-blue-900 border-blue-300';
                    badgeLabel = '💉 診療行為';
                  } else if (item.type === 'renal') {
                    badgeStyle = 'bg-amber-100 text-amber-900 border-amber-300';
                    badgeLabel = '⚠️ 腎機能減量';
                  } else if (item.type === 'minds') {
                    badgeStyle = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                    badgeLabel = 'Minds CQ';
                  } else if (item.type === 'drug') {
                    badgeStyle = 'bg-sky-100 text-sky-900 border-sky-300';
                    badgeLabel = '医薬品';
                  } else if (item.type === 'disease') {
                    badgeStyle = 'bg-indigo-100 text-indigo-900 border-indigo-300';
                    badgeLabel = '病名';
                  }

                  return (
                    <div
                      key={uniqueKey}
                      className="border border-black bg-white p-2.5 shadow-[2px_2px_0_#000] space-y-1.5 hover:border-black/70 transition-all font-sans"
                    >
                      {/* ヘッダー情報 */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 border ${badgeStyle}`}>
                              {badgeLabel}
                            </span>
                            {sem.semanticScore !== undefined && sem.semanticScore > 0 && (
                              <span
                                className="text-[9px] font-mono font-bold px-1.5 py-0.5 border border-purple-400 bg-purple-50 text-purple-900 flex items-center gap-1 shadow-[1px_1px_0_#000]"
                                title={`EmbeddingGemma 2 (740M MRL 128d) 意味的コサイン類似度: ${Math.round(sem.semanticScore * 100)}%`}
                              >
                                <Brain className="w-2.5 h-2.5 text-purple-700" />
                                <span>{Math.round(sem.semanticScore * 100)}% Match</span>
                              </span>
                            )}
                            <span className="font-bold text-xs sm:text-sm text-black">
                              {item.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-600 font-medium">
                            {item.subtitle}
                          </div>
                        </div>

                        {/* クイック操作ボタン */}
                        <div className="flex items-center gap-1 shrink-0">
                          {item.type === 'minds' && item.mindsData && (
                            <button
                              onClick={() => handleConsultWebLlm(item.mindsData!)}
                              className="px-2 py-1 text-[11px] font-bold border border-black bg-yellow-100 hover:bg-black hover:text-white shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                              title="このガイドラインをWebLLMに渡して臨床アドバイスを推論"
                            >
                              <Brain className="w-3 h-3 text-indigo-700" />
                              <span className="hidden sm:inline">AI推論</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleInsert(insertText, uniqueKey)}
                            className="px-2 py-1 text-[11px] font-bold border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                            title="カルテ本文に挿入"
                          >
                            {isItemInserted ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3" />}
                            <span>挿入</span>
                          </button>
                          <button
                            onClick={() => handleCopy(insertText, uniqueKey)}
                            className="px-1.5 py-1 text-[11px] border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] cursor-pointer"
                            title="コピー"
                          >
                            {isItemCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {/* コード / 属性 */}
                      <div className="text-[10px] text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 border border-gray-200">
                        {item.codeOrAttr}
                      </div>

                      {/* 救急・中毒プロトコル詳細 */}
                      {sem.emergencyData && (
                        <div className="bg-red-50/70 border border-red-200 p-2 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 text-red-950 font-bold text-[11px]">
                            <Siren className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span>解毒・拮抗薬:</span>
                            <span className="text-red-700 bg-white px-1.5 py-0.5 border border-red-300 font-bold">{sem.emergencyData.antidoteOrTreatment}</span>
                          </div>
                          <div className="text-[11px] text-gray-800 bg-white p-1.5 border border-red-100">
                            <span className="font-bold text-gray-900">初期処置: </span>{sem.emergencyData.initialProtocol}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-600 bg-red-100/40 px-1.5 py-0.5">
                            <span>指標: {sem.emergencyData.triageOrScore}</span>
                            <span className="font-mono text-gray-500">SD: {sem.emergencyData.sdFilePath}</span>
                          </div>
                        </div>
                      )}

                      {/* 臨床アトラス・ECG詳細 */}
                      {sem.atlasData && (
                        <div className="bg-purple-50/70 border border-purple-200 p-2 text-xs space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-purple-950">
                            <div className="flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-purple-600" />
                              <span>典型所見:</span>
                            </div>
                            <span className="font-mono text-[10px] bg-white px-1.5 py-0.2 border border-purple-200 text-purple-700">{sem.atlasData.sdFilePath}</span>
                          </div>
                          <div className="text-[11px] text-gray-800 bg-white p-1.5 border border-purple-100">
                            {sem.atlasData.typicalFeatures}
                          </div>
                          <div className="text-[10px] text-purple-900 bg-purple-100/50 px-1.5 py-0.5 flex items-center justify-between">
                            <span>鑑別: {sem.atlasData.differentialDiagnosis}</span>
                            <span className="font-semibold text-purple-800">{sem.atlasData.clinicalSignificance}</span>
                          </div>
                        </div>
                      )}

                      {/* 持参薬識別詳細 */}
                      {sem.drugIdData && (
                        <div className="bg-teal-50/70 border border-teal-200 p-2 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-teal-950">刻印コード:</span>
                              <span className="bg-white border-2 border-teal-600 text-teal-900 font-mono font-black text-xs px-2 py-0.5 shadow-[1px_1px_0_#000]">
                                {sem.drugIdData.imprintCode}
                              </span>
                            </div>
                            <span className="text-[11px] text-teal-800 font-medium">{sem.drugIdData.colorAndShape}</span>
                          </div>
                          <div className="text-[11px] text-gray-800 bg-white p-1.5 border border-teal-100 flex justify-between">
                            <span>標準用法: {sem.drugIdData.standardDose}</span>
                            <span className="text-[10px] text-gray-500 font-mono">添付文書: {sem.drugIdData.sdFilePath}</span>
                          </div>
                        </div>
                      )}

                      {/* 臨床スコアリング詳細 */}
                      {sem.scoreData && (
                        <div className="bg-orange-50/70 border border-orange-200 p-2 text-xs space-y-1.5">
                          <div className="flex items-center gap-1 text-orange-950 font-bold text-[11px]">
                            <Calculator className="w-3.5 h-3.5 text-orange-600" />
                            <span>計算式・判定項目:</span>
                            <span className="text-gray-900 font-mono font-medium">{sem.scoreData.calculationFormula}</span>
                          </div>
                          <div className="text-[11px] text-gray-800 bg-white p-1.5 border border-orange-100 space-y-0.5">
                            <div><span className="font-bold text-orange-950">リスク判定:</span> {sem.scoreData.riskEvaluation}</div>
                            <div><span className="font-bold text-emerald-800">推奨アクション:</span> {sem.scoreData.clinicalAction}</div>
                          </div>
                        </div>
                      )}

                      {/* 腎機能減量カットオフテーブル表示 */}
                      {item.type === 'renal' && item.renalData && (
                        <div className="bg-amber-50/60 border border-amber-200 p-2 text-xs space-y-1">
                          <div className="font-bold text-amber-950 text-[11px] flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-amber-700" />
                            <span>eGFR / CrCl 減量基準</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                            {item.renalData.cutoffs.map((cutoff, cidx) => (
                              <div key={cidx} className="bg-white px-2 py-1 border border-amber-200 flex justify-between">
                                <span className="font-bold text-gray-700">{cutoff.range}</span>
                                <span className="text-rose-700 font-semibold">{cutoff.dose}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 本文 (推奨・注意・臨床的意義・要件) */}
                      <div className="text-xs text-gray-800 leading-relaxed bg-white p-1.5 border border-black/10">
                        {item.content}
                      </div>

                      {/* 追加情報 (カルテ定型文 / 実践Tips / パニック値) */}
                      {item.extraInfo && (
                        <div className="text-[11px] text-slate-800 bg-slate-50 p-1.5 border border-slate-200 flex items-start gap-1">
                          <Info className="w-3 h-3 text-blue-600 shrink-0 mt-0.5" />
                          <span className="font-mono text-[10.5px]">{item.extraInfo}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 右側: ローカルWebLLM 臨床相談ワークスペース (ガイドライン選択時) */}
          {activeMindsItem && (
            <div className="border-t-2 md:border-t-0 md:border-l-2 border-black flex-1 flex flex-col bg-slate-50 overflow-hidden">
              <div className="p-2.5 bg-black text-white flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-yellow-300" />
                  <span>ローカルWebLLM 臨床意思決定支援 (RAG)</span>
                </div>
                <button
                  onClick={() => setActiveMindsItem(null)}
                  className="px-1.5 py-0.2 bg-white text-black hover:bg-gray-200 text-[10px] font-bold cursor-pointer"
                >
                  ✕ 閉じる
                </button>
              </div>

              <div className="p-3 border-b border-black/20 bg-white space-y-1">
                <div className="text-xs font-bold text-slate-900">
                  {activeMindsItem.diseaseName} CQ{activeMindsItem.cqNum}
                </div>
                <div className="text-[11px] text-slate-600">
                  {activeMindsItem.cqTitle}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {activeMindsItem.detail.guidelineTitle} ({activeMindsItem.detail.society})
                </div>
              </div>

              {/* 推論ストリーミング表示 */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-sans">
                {isLlmGenerating && !llmStreamingOutput && (
                  <div className="p-4 text-center space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-600" />
                    <p className="font-bold text-slate-700">WebGPU ローカルLLMがカルテとガイドラインを推論中...</p>
                    <p className="text-[11px] text-slate-500">外部送信なし・ブラウザ内完結の超安全オフライン推論</p>
                  </div>
                )}

                {llmError && (
                  <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span>推論エラー</span>
                    </div>
                    <div>{llmError}</div>
                  </div>
                )}

                {llmStreamingOutput && (
                  <div className="space-y-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>ガイドライン準拠の臨床推論アドバイス:</span>
                    </div>
                    <div className="bg-white p-3 border border-black shadow-[2px_2px_0_#000] text-xs leading-relaxed whitespace-pre-wrap text-slate-800">
                      {llmStreamingOutput}
                    </div>
                  </div>
                )}
              </div>

              {/* 下部アクションバー */}
              {llmStreamingOutput && (
                <div className="p-2.5 bg-white border-t border-black flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleConsultWebLlm(activeMindsItem)}
                    disabled={isLlmGenerating}
                    className="px-2.5 py-1.5 border border-black bg-white hover:bg-gray-100 text-xs font-bold shadow-[1px_1px_0_#000] cursor-pointer"
                  >
                    再推論
                  </button>
                  <button
                    onClick={() => {
                      const textToInsert = `\n【Minds臨床方針 ${activeMindsItem.diseaseName}】\n${llmStreamingOutput}\n`;
                      handleInsert(textToInsert, 'webllm-result');
                    }}
                    className="px-3 py-1.5 border border-black bg-black text-white hover:bg-gray-800 text-xs font-bold shadow-[2px_2px_0_#000] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>カルテ【A/P】に反映</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-2 bg-gray-100 border-t border-black flex items-center justify-between text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <span>収録: 32GB MicroSD (29.8GB) 10大医療カテゴリ / Minds 169CQ / 救急・中毒 / 臨床アトラス / 検査値 / 指導料 / 腎機能減量 / 刻印識別 / 臨床スコア</span>
          </div>
          <button
            onClick={() => { playMacBeep(); onClose(); }}
            className="px-3 py-1 border border-black bg-white hover:bg-black hover:text-white font-bold shadow-[1px_1px_0_#000] cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
