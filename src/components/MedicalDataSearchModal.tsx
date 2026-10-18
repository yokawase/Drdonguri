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
  Wifi,
  WifiOff,
  Maximize2,
  Grid,
  ExternalLink,
  Layers,
  Eye,
  FileDown,
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
  DRUG_IDENTIFICATION_CATALOG,
  CLINICAL_ATLAS_CATALOG,
  DrugIdentificationItem,
  ClinicalAtlasItem,
} from '../data/microSdMedicalCatalog';
import {
  consultGuidelineWithWebLLM,
  ModelLoadProgress,
} from '../services/webLlmService';
import {
  searchWithEmbeddingGemma,
  SemanticSearchResult,
} from '../services/embeddingGemmaService';
import {
  bleMedicalIndexService,
  PillSearchCriteria,
} from '../services/bleMedicalIndexService';
import {
  sdCardStreamingService,
  SoftApStatus,
} from '../services/sdCardStreamingService';
import { playMacBeep, playSosumi } from '../utils/macAudio';

interface MedicalDataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onInsertText: (text: string) => void;
  initialQuery?: string;
}

export type TabFilterType = 'all' | 'pill' | 'atlas' | 'emer' | 'drug' | 'score' | 'lab' | 'proc' | 'renal' | 'minds' | 'disease' | 'sdmap';

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

  // Wi-Fi SoftAP 高解像度ストリーミングステート
  const [apStatus, setApStatus] = useState<SoftApStatus>(sdCardStreamingService.getStatus());
  const [isCheckingAp, setIsCheckingAp] = useState(false);
  const [showApGuide, setShowApGuide] = useState(false);

  // 💊 錠剤識別（表裏）専用ステート
  const [pillImprintFilter, setPillImprintFilter] = useState('');
  const [pillShapeFilter, setPillShapeFilter] = useState<string>('all');
  const [pillScoredFilter, setPillScoredFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [flippedPillIds, setFlippedPillIds] = useState<Record<string, boolean>>({});

  // 🖼️ 臨床アトラス専用ギャラリーステート
  const [atlasCategoryFilter, setAtlasCategoryFilter] = useState<'全件' | '皮膚科' | '内視鏡' | '心電図'>('全件');
  const [selectedAtlas, setSelectedAtlas] = useState<ClinicalAtlasItem | null>(null);
  const [ecgGridEnabled, setEcgGridEnabled] = useState(true);
  const [highResAtlasUrl, setHighResAtlasUrl] = useState<string | null>(null);
  const [isLoadingHighRes, setIsLoadingHighRes] = useState(false);

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

  // Wi-Fi SoftAP 疎通チェック関数
  const handleCheckAp = async () => {
    setIsCheckingAp(true);
    const status = await sdCardStreamingService.checkApConnection();
    setApStatus(status);
    setIsCheckingAp(false);
  };

  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
      handleCheckAp();
    } else {
      setActiveMindsItem(null);
      setLlmStreamingOutput('');
      setIsLlmGenerating(false);
      setSelectedAtlas(null);
      setHighResAtlasUrl(null);
    }
  }, [isOpen, initialQuery]);

  // アトラス大判モーダルオープン
  const handleOpenAtlasModal = async (item: ClinicalAtlasItem) => {
    playMacBeep();
    setSelectedAtlas(item);
    setIsLoadingHighRes(true);
    try {
      const url = await sdCardStreamingService.getAtlasImageUrl(item.sdFilePath, item.highResUrl || item.thumbnailUrl);
      setHighResAtlasUrl(url);
    } catch {
      setHighResAtlasUrl(item.highResUrl || item.thumbnailUrl || null);
    } finally {
      setIsLoadingHighRes(false);
    }
  };

  // 錠剤 表裏フリップトグル
  const togglePillFlip = (pillId: string) => {
    playMacBeep();
    setFlippedPillIds(prev => ({
      ...prev,
      [pillId]: !prev[pillId],
    }));
  };

  // 添付文書原本PDFオープン
  const handleOpenPackagePdf = (pdfPath?: string) => {
    playMacBeep();
    sdCardStreamingService.openPackageInsertPdf(pdfPath);
  };

  // 錠剤識別専用フィルタリング結果
  const pillSearchResults = useMemo(() => {
    return bleMedicalIndexService.searchPills({
      query: query || undefined,
      imprint: pillImprintFilter || undefined,
      shape: pillShapeFilter !== 'all' ? pillShapeFilter : undefined,
      hasScoredLine: pillScoredFilter === 'all' ? undefined : pillScoredFilter === 'yes',
    });
  }, [query, pillImprintFilter, pillShapeFilter, pillScoredFilter]);

  // 臨床アトラス専用フィルタリング結果
  const atlasSearchResults = useMemo(() => {
    return bleMedicalIndexService.searchAtlas(atlasCategoryFilter, query);
  }, [atlasCategoryFilter, query]);

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
      return bleMedicalIndexService.formatAtlasForMedicalRecord(sem.atlasData);
    }
    if (sem.drugIdData) {
      return bleMedicalIndexService.formatDrugForMedicalRecord(sem.drugIdData);
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
              <span>📚 臨床データ統合検索 (Minds・アトラス・錠剤識別・救急・検査値)</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Wi-Fi SoftAP 高速ストリーミング疎通ステータス */}
            <button
              onClick={() => { playMacBeep(); setShowApGuide(true); }}
              className={`text-[10px] font-bold px-2 py-0.5 border flex items-center gap-1 shadow-[1px_1px_0_#000] cursor-pointer ${
                apStatus.isConnected
                  ? 'bg-emerald-100 text-emerald-950 border-emerald-400 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-700 border-gray-400 hover:bg-gray-200'
              }`}
              title={
                apStatus.isConnected
                  ? `Wi-Fi SoftAP (${apStatus.ip}) 接続中: 1024px WebP / 原本PDF直結`
                  : 'BLE要約モード稼働中 (Wi-Fi未接続)。クリックして高速ストリーミング接続ガイドを表示'
              }
            >
              {apStatus.isConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-700 animate-pulse" />
                  <span className="hidden sm:inline">SoftAP 接続済 ({apStatus.latencyMs ? `${apStatus.latencyMs}ms` : '192.168.4.1'})</span>
                  <span className="sm:hidden">SoftAP 済</span>
                </>
              ) : (
                <>
                  {isCheckingAp ? <RefreshCw className="w-3 h-3 animate-spin text-gray-500" /> : <WifiOff className="w-3 h-3 text-gray-400" />}
                  <span className="hidden sm:inline">BLE要約モード (Wi-Fi未接続)</span>
                  <span className="sm:hidden">BLE要約</span>
                </>
              )}
            </button>

            <div className="text-[10px] text-purple-900 font-bold bg-purple-100 border border-purple-300 px-2 py-0.5 hidden sm:flex items-center gap-1 shadow-[1px_1px_0_#000]">
              <Brain className="w-3 h-3 text-purple-700" />
              <span>EmbeddingGemma 2 (740M MRL)</span>
            </div>
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
                placeholder="病名、薬剤名、刻印記号(TCK/105)、検査値(HbA1c/eGFR)、指導料、心電図、ICD-10..."
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
              { label: 'タケキャブ刻印', q: 'タケキャブ' },
              { label: '前壁STEMI心電図', q: '前壁STEMI' },
              { label: '農薬中毒/PAM', q: '農薬中毒' },
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
              onClick={() => { playMacBeep(); setFilterType('pill'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'pill' ? 'bg-teal-900 text-white border-teal-950' : 'bg-teal-50 hover:bg-teal-100 text-teal-950 border-teal-400'
              }`}
            >
              <Pill className="w-3 h-3 text-teal-600" />
              <span>💊 錠剤識別（表裏） ({pillSearchResults.length})</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('atlas'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'atlas' ? 'bg-purple-900 text-white border-purple-950' : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-400'
              }`}
            >
              <Camera className="w-3 h-3 text-purple-600" />
              <span>🖼️ 臨床アトラス ({atlasSearchResults.length})</span>
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
              onClick={() => { playMacBeep(); setFilterType('drug'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'drug' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Pill className="w-3 h-3 text-sky-600" />
              <span>処方・標準薬</span>
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
          ) : filterType === 'pill' ? (
            /* 💊 錠剤識別（表裏）専用ビュー */
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 font-sans bg-slate-50">
              {/* 錠剤絞り込みサブツールバー */}
              <div className="bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_#000] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-teal-950">
                    <Pill className="w-4 h-4 text-teal-600" />
                    <span>医薬品添付文書 ＆ 錠剤識別写真 (PMDA約22,000品目・表裏刻印)</span>
                  </div>
                  <span className="text-[11px] font-mono text-teal-800 bg-teal-50 px-2 py-0.5 border border-teal-200">
                    該当: {pillSearchResults.length} 件
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">刻印記号 (表/裏):</label>
                    <input
                      type="text"
                      value={pillImprintFilter}
                      onChange={(e) => setPillImprintFilter(e.target.value)}
                      placeholder="例: TCK, 105, 5mg..."
                      className="w-full border border-black px-2 py-1 text-xs focus:bg-yellow-50 shadow-[1px_1px_0_#000]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">形状・剤形:</label>
                    <select
                      value={pillShapeFilter}
                      onChange={(e) => setPillShapeFilter(e.target.value)}
                      className="w-full border border-black px-2 py-1 text-xs bg-white shadow-[1px_1px_0_#000] cursor-pointer"
                    >
                      <option value="all">すべての形状</option>
                      <option value="円形">円形 (丸型)</option>
                      <option value="楕円形">楕円形 (オーバル)</option>
                      <option value="カプセル">カプセル剤</option>
                      <option value="トローチ">トローチ / 口腔内崩壊錠</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-700 mb-0.5">割線の有無:</label>
                    <div className="flex gap-1">
                      {[
                        { label: 'すべて', val: 'all' },
                        { label: '割線あり', val: 'yes' },
                        { label: '割線なし', val: 'no' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => { playMacBeep(); setPillScoredFilter(opt.val as any); }}
                          className={`flex-1 py-1 border border-black text-[11px] font-bold cursor-pointer shadow-[1px_1px_0_#000] ${
                            pillScoredFilter === opt.val ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 錠剤カード一覧 */}
              {pillSearchResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                  一致する刻印・薬剤情報が見つかりませんでした。刻印記号または薬品名を変えてお試しください。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {pillSearchResults.map((drug) => {
                    const isFlipped = flippedPillIds[drug.id] || false;
                    const displayedImg = isFlipped ? (drug.backImageUrl || drug.frontImageUrl) : drug.frontImageUrl;
                    const isItemCopied = copiedId === drug.id;
                    const isItemInserted = insertedId === drug.id;
                    const chartText = bleMedicalIndexService.formatDrugForMedicalRecord(drug);

                    return (
                      <div
                        key={drug.id}
                        className="border-2 border-black bg-white p-3 shadow-[3px_3px_0_#000] flex flex-col md:flex-row gap-3 hover:border-teal-700 transition-colors"
                      >
                        {/* 錠剤写真 ＆ 表裏フリップ */}
                        <div className="flex flex-col items-center justify-center bg-gray-50 border border-gray-300 p-2 shrink-0 w-full md:w-44">
                          <div className="relative w-32 h-32 bg-white border border-gray-300 flex items-center justify-center overflow-hidden shadow-inner group">
                            <img
                              src={displayedImg}
                              alt={drug.brandName}
                              className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = drug.frontImageUrl;
                              }}
                            />
                            <div className="absolute top-1 left-1 bg-black/80 text-white text-[9px] px-1.5 py-0.2 font-mono font-bold">
                              {isFlipped ? '裏面 [BACK]' : '表面 [FRONT]'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 mt-2 w-full">
                            <button
                              type="button"
                              onClick={() => togglePillFlip(drug.id)}
                              className="flex-1 py-1 border border-black bg-teal-50 hover:bg-teal-100 text-[10px] font-bold text-teal-950 flex items-center justify-center gap-1 shadow-[1px_1px_0_#000] cursor-pointer"
                              title="表写真 ⇄ 裏写真 切り替え"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>{isFlipped ? '表面を表示' : '裏面を表示'}</span>
                            </button>
                          </div>
                        </div>

                        {/* 錠剤情報 ＆ スペックマトリクス */}
                        <div className="flex-1 flex flex-col justify-between space-y-2">
                          <div className="space-y-1">
                            {/* タイトル ＆ アクション */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 border bg-teal-100 text-teal-950 border-teal-300">
                                    {drug.category}
                                  </span>
                                  <span className="font-bold text-sm sm:text-base text-slate-900">
                                    {drug.brandName}
                                  </span>
                                  <span className="text-xs text-gray-600">
                                    ({drug.genericName})
                                  </span>
                                </div>
                                <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                                  YJ: {drug.yjCode} | JAN: {drug.janCode || '未登録'}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPackagePdf(drug.pdfPath)}
                                  className="px-2 py-1 text-[11px] font-bold border border-black bg-sky-50 hover:bg-sky-100 text-sky-950 shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                                  title="PMDA公式 医薬品添付文書PDF原本を開く"
                                >
                                  <FileText className="w-3 h-3 text-sky-600" />
                                  <span className="hidden sm:inline">添付文書PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsert(chartText, drug.id)}
                                  className="px-2 py-1 text-[11px] font-bold border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                                  title="カルテ本文に処方・用法を挿入"
                                >
                                  {isItemInserted ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3" />}
                                  <span>処方挿入</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(chartText, drug.id)}
                                  className="px-1.5 py-1 text-[11px] border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] cursor-pointer"
                                  title="コピー"
                                >
                                  {isItemCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>

                            {/* 刻印バッジ・スペックマトリクス */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[11px]">
                              <div className="bg-teal-50/70 border border-teal-200 p-1.5">
                                <span className="block text-[9.5px] font-bold text-teal-800">表刻印記号</span>
                                <span className="font-mono font-black text-xs text-teal-950">{drug.imprintFront || '（なし）'}</span>
                              </div>
                              <div className="bg-teal-50/70 border border-teal-200 p-1.5">
                                <span className="block text-[9.5px] font-bold text-teal-800">裏刻印記号</span>
                                <span className="font-mono font-black text-xs text-teal-950">{drug.imprintBack || '（なし）'}</span>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 p-1.5">
                                <span className="block text-[9.5px] font-bold text-gray-700">外観・形状・割線</span>
                                <span className="text-gray-900 font-semibold">{drug.colorAndShape} / {drug.hasScoredLine ? '割線有' : '割線無'}</span>
                              </div>
                              <div className="bg-gray-50 border border-gray-200 p-1.5">
                                <span className="block text-[9.5px] font-bold text-gray-700">直径 / 厚み</span>
                                <span className="font-mono text-gray-900">{drug.diameterMm ? `${drug.diameterMm}mm` : '-'} / {drug.thicknessMm ? `${drug.thicknessMm}mm` : '-'}</span>
                              </div>
                            </div>

                            {/* 用法用量 ＆ 腎機能注意 */}
                            <div className="text-xs bg-slate-50 p-2 border border-slate-200 space-y-1 mt-1">
                              <div><span className="font-bold text-slate-900">標準用法用量: </span><span className="text-slate-800">{drug.standardDose}</span></div>
                              {drug.renalDoseInfo && (
                                <div className="text-amber-900 bg-amber-50 p-1 border border-amber-200 flex items-start gap-1 text-[11px]">
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <span><span className="font-bold">腎機能別減量: </span>{drug.renalDoseInfo}</span>
                                </div>
                              )}
                              <div className="text-[11px] text-gray-600"><span className="font-bold">主要注意: </span>{drug.majorCautions}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : filterType === 'atlas' ? (
            /* 🖼️ 臨床アトラス専用ギャラリービュー */
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 font-sans bg-slate-50">
              {/* アトラス絞り込みサブツールバー */}
              <div className="bg-white border-2 border-black p-2.5 shadow-[2px_2px_0_#000] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-purple-950">
                  <Camera className="w-4 h-4 text-purple-600" />
                  <span>臨床アトラス画像集 (皮膚科・内視鏡・12誘導心電図 約4,000点 WebP)</span>
                </div>

                {/* カテゴリ切り替えチップ */}
                <div className="flex items-center gap-1 text-xs">
                  {(['全件', '心電図', '皮膚科', '内視鏡'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => { playMacBeep(); setAtlasCategoryFilter(cat); }}
                      className={`px-2 py-0.5 border border-black font-bold text-[11px] cursor-pointer shadow-[1px_1px_0_#000] ${
                        atlasCategoryFilter === cat ? 'bg-purple-950 text-white' : 'bg-white hover:bg-purple-100 text-purple-950'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <span className="text-[11px] font-mono text-purple-800 bg-purple-50 px-2 py-0.5 border border-purple-200 ml-1">
                    {atlasSearchResults.length} 点
                  </span>
                </div>
              </div>

              {/* ギャラリーグリッド (2〜3列) */}
              {atlasSearchResults.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                  一致するアトラス画像が見つかりませんでした。カテゴリを「全件」にするかキーワードを変更してください。
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {atlasSearchResults.map((atlas) => {
                    const isItemCopied = copiedId === atlas.id;
                    const isItemInserted = insertedId === atlas.id;
                    const chartText = bleMedicalIndexService.formatAtlasForMedicalRecord(atlas);

                    let catBadge = 'bg-purple-100 text-purple-900 border-purple-300';
                    if (atlas.category === '心電図') catBadge = 'bg-rose-100 text-rose-900 border-rose-300';
                    else if (atlas.category === '皮膚科') catBadge = 'bg-amber-100 text-amber-900 border-amber-300';
                    else if (atlas.category === '内視鏡') catBadge = 'bg-blue-100 text-blue-900 border-blue-300';

                    return (
                      <div
                        key={atlas.id}
                        className="border-2 border-black bg-white shadow-[2px_2px_0_#000] flex flex-col justify-between overflow-hidden hover:border-purple-600 transition-colors"
                      >
                        {/* サムネイル画像コンテナ (クリックで大判モーダル) */}
                        <div
                          onClick={() => handleOpenAtlasModal(atlas)}
                          className="relative aspect-4/3 bg-slate-900 flex items-center justify-center cursor-pointer group overflow-hidden"
                          title="クリックして1024px大判プレビュー ＆ 方眼紙グリッド測定"
                        >
                          <img
                            src={atlas.thumbnailUrl}
                            alt={atlas.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs">
                            <Maximize2 className="w-4 h-4" />
                            <span>1024px 大判拡大</span>
                          </div>
                          <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 border shadow-[1px_1px_0_#000] ${catBadge}`}>
                              {atlas.category}
                            </span>
                            {atlas.hasEcgGrid && (
                              <span className="text-[9px] font-mono font-bold bg-rose-600 text-white px-1 py-0.2">
                                方眼紙グリッド対応
                              </span>
                            )}
                          </div>
                        </div>

                        {/* カード詳細情報 */}
                        <div className="p-2.5 flex-1 flex flex-col justify-between space-y-2">
                          <div className="space-y-1">
                            <div className="font-bold text-xs text-slate-900 line-clamp-1">
                              {atlas.title}
                            </div>
                            <p className="text-[11px] text-gray-700 line-clamp-2 leading-relaxed">
                              {atlas.typicalFeatures}
                            </p>
                            <div className="text-[10px] text-purple-900 font-semibold bg-purple-50 px-1.5 py-0.5 border border-purple-200 line-clamp-1">
                              鑑別: {atlas.differentialDiagnosis}
                            </div>
                          </div>

                          {/* アクションボタン */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => handleOpenAtlasModal(atlas)}
                              className="px-2 py-1 text-[10px] font-bold border border-black bg-yellow-100 hover:bg-black hover:text-white shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>大判表示</span>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleInsert(chartText, atlas.id)}
                                className="px-2 py-1 text-[10px] font-bold border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                                title="カルテ所見に反映"
                              >
                                {isItemInserted ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3" />}
                                <span>カルテ反映</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(chartText, atlas.id)}
                                className="px-1.5 py-1 text-[10px] border border-black bg-white hover:bg-black hover:text-white shadow-[1px_1px_0_#000] cursor-pointer"
                                title="コピー"
                              >
                                {isItemCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                          <div className="flex items-start gap-2.5">
                            {/* サムネイル */}
                            <div
                              onClick={() => handleOpenAtlasModal(sem.atlasData!)}
                              className="relative w-20 h-16 bg-slate-900 border border-purple-300 shrink-0 cursor-pointer overflow-hidden group"
                              title="クリックして1024px大判表示"
                            >
                              <img
                                src={sem.atlasData.thumbnailUrl}
                                alt={sem.atlasData.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="w-3.5 h-3.5" />
                              </div>
                            </div>

                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold text-purple-950">
                                <div className="flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5 text-purple-600" />
                                  <span>典型所見:</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAtlasModal(sem.atlasData!)}
                                    className="px-1.5 py-0.5 bg-yellow-100 hover:bg-black hover:text-white border border-black text-[10px] font-bold cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-0.5"
                                  >
                                    <Eye className="w-2.5 h-2.5" />
                                    <span>大判表示</span>
                                  </button>
                                  <span className="font-mono text-[9px] bg-white px-1 py-0.2 border border-purple-200 text-purple-700 hidden sm:inline">
                                    {sem.atlasData.sdFilePath}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[11px] text-gray-800 bg-white p-1 border border-purple-100">
                                {sem.atlasData.typicalFeatures}
                              </div>
                            </div>
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
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-teal-950">刻印コード:</span>
                              <span className="bg-white border-2 border-teal-600 text-teal-900 font-mono font-black text-xs px-2 py-0.5 shadow-[1px_1px_0_#000]" title="表刻印">
                                表: {sem.drugIdData.imprintFront || sem.drugIdData.imprintCode}
                              </span>
                              {sem.drugIdData.imprintBack && (
                                <span className="bg-white border border-teal-500 text-teal-800 font-mono font-bold text-xs px-1.5 py-0.5" title="裏刻印">
                                  裏: {sem.drugIdData.imprintBack}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenPackagePdf(sem.drugIdData?.pdfPath)}
                                className="px-1.5 py-0.5 bg-sky-50 hover:bg-sky-100 border border-black text-[10px] font-bold text-sky-950 cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1"
                                title="添付文書原本PDFを開く"
                              >
                                <FileText className="w-2.5 h-2.5 text-sky-600" />
                                <span>添付文書PDF</span>
                              </button>
                              <span className="text-[11px] text-teal-800 font-medium">{sem.drugIdData.colorAndShape}</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-gray-800 bg-white p-1.5 border border-teal-100 flex justify-between">
                            <span>標準用法: {sem.drugIdData.standardDose}</span>
                            <span className="text-[10px] text-gray-500 font-mono hidden sm:inline">添付文書: {sem.drugIdData.sdFilePath}</span>
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

      {/* 臨床アトラス 1024px 大判プレビュー ＆ ECG方眼紙グリッド測定モーダル */}
      {selectedAtlas && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="mac-window bg-white border-2 border-black max-w-3xl w-full max-h-[92vh] flex flex-col shadow-[8px_8px_0_#000] overflow-hidden">
            {/* ヘッダー */}
            <div className="mac-title-bar bg-white border-b-2 border-black px-3 py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { playMacBeep(); setSelectedAtlas(null); }}
                  className="w-4 h-4 border border-black bg-white hover:bg-black hover:text-white flex items-center justify-center text-[10px] font-bold shadow-[1px_1px_0_#000] cursor-pointer"
                >
                  ✕
                </button>
                <span className="font-bold text-xs sm:text-sm text-black truncate max-w-[260px] sm:max-w-md">
                  🖼️ {selectedAtlas.title} ({selectedAtlas.category})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(selectedAtlas.hasEcgGrid || selectedAtlas.category === '心電図') && (
                  <button
                    type="button"
                    onClick={() => { playMacBeep(); setEcgGridEnabled(!ecgGridEnabled); }}
                    className={`px-2 py-0.5 border border-black text-[10px] font-bold shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer ${
                      ecgGridEnabled ? 'bg-rose-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                    title="標準ECG記録紙仕様の 1mm/5mm 方眼紙グリッドをオーバーレイ表示"
                  >
                    <Grid className="w-3 h-3" />
                    <span>{ecgGridEnabled ? '📐 1mm/5mm方眼紙 ON' : '方眼紙 OFF'}</span>
                  </button>
                )}
                <span className="text-[10px] font-mono bg-purple-100 text-purple-900 border border-purple-300 px-1.5 py-0.5 hidden sm:inline">
                  {apStatus.isConnected ? '⚡ 1024px SD直結' : 'BLE WebP'}
                </span>
              </div>
            </div>

            {/* 画像表示エリア (ECGグリッド重畳) */}
            <div className="relative bg-slate-950 flex items-center justify-center overflow-hidden min-h-[260px] max-h-[50vh] sm:max-h-[55vh]">
              {isLoadingHighRes ? (
                <div className="p-8 text-center text-white space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-yellow-400" />
                  <p className="text-xs font-bold">高解像度アトラスストリーミング中...</p>
                </div>
              ) : (
                <img
                  src={highResAtlasUrl || selectedAtlas.highResUrl || selectedAtlas.thumbnailUrl}
                  alt={selectedAtlas.title}
                  className="w-full h-full object-contain max-h-[50vh] select-none"
                />
              )}

              {/* 1mm/5mm 方眼紙グリッド (標準ECG仕様: 25mm/s, 10mm/mV) */}
              {ecgGridEnabled && (selectedAtlas.hasEcgGrid || selectedAtlas.category === '心電図') && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(244, 63, 94, 0.35) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(244, 63, 94, 0.35) 1px, transparent 1px),
                      linear-gradient(to right, rgba(225, 29, 72, 0.75) 1.5px, transparent 1.5px),
                      linear-gradient(to bottom, rgba(225, 29, 72, 0.75) 1.5px, transparent 1.5px)
                    `,
                    backgroundSize: '10px 10px, 10px 10px, 50px 50px, 50px 50px',
                  }}
                />
              )}

              {/* 心電図計測ガイドバー */}
              {(selectedAtlas.hasEcgGrid || selectedAtlas.category === '心電図') && (
                <div className="absolute bottom-1 right-1 bg-black/80 text-rose-300 font-mono text-[9px] px-1.5 py-0.5 border border-rose-500/50">
                  25mm/s (1小マス=0.04s, 1大マス=0.20s) | 10mm/mV (1小マス=0.1mV)
                </div>
              )}
            </div>

            {/* 所見・鑑別・臨床的意義 */}
            <div className="p-3 bg-white space-y-2 text-xs font-sans overflow-y-auto max-h-[30vh]">
              <div className="bg-purple-50 p-2 border border-purple-200 space-y-1">
                <div className="font-bold text-purple-950 flex items-center justify-between text-[11px]">
                  <span>典型所見 (Typical Findings):</span>
                  <span className="font-mono text-[10px] text-purple-700">{selectedAtlas.sdFilePath}</span>
                </div>
                <div className="text-slate-800 leading-relaxed">{selectedAtlas.typicalFeatures}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="bg-gray-50 p-2 border border-gray-200">
                  <span className="font-bold text-gray-900 block mb-0.5">鑑別診断:</span>
                  <span className="text-gray-700">{selectedAtlas.differentialDiagnosis}</span>
                </div>
                <div className="bg-gray-50 p-2 border border-gray-200">
                  <span className="font-bold text-gray-900 block mb-0.5">臨床的意義・対応方針:</span>
                  <span className="text-gray-700">{selectedAtlas.clinicalSignificance}</span>
                </div>
              </div>
            </div>

            {/* フッターアクションバー */}
            <div className="p-2.5 bg-gray-100 border-t border-black flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = bleMedicalIndexService.formatAtlasForMedicalRecord(selectedAtlas);
                  navigator.clipboard.writeText(text);
                  playMacBeep();
                }}
                className="px-2.5 py-1 text-xs border border-black bg-white hover:bg-gray-200 font-bold shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>所見コピー</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { playMacBeep(); setSelectedAtlas(null); }}
                  className="px-3 py-1 border border-black bg-white hover:bg-gray-200 text-xs font-bold shadow-[1px_1px_0_#000] cursor-pointer"
                >
                  閉じる
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = bleMedicalIndexService.formatAtlasForMedicalRecord(selectedAtlas);
                    handleInsert(text, selectedAtlas.id);
                    setSelectedAtlas(null);
                  }}
                  className="px-3 py-1 border border-black bg-black text-white hover:bg-gray-800 text-xs font-bold shadow-[2px_2px_0_#000] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>カルテ所見に反映</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wi-Fi SoftAP 高速ストリーミング 接続ガイドモーダル */}
      {showApGuide && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in">
          <div className="mac-window bg-white border-2 border-black max-w-md w-full shadow-[6px_6px_0_#000] overflow-hidden font-sans">
            <div className="mac-title-bar bg-white border-b-2 border-black px-3 py-1.5 flex items-center justify-between">
              <div className="font-bold text-xs sm:text-sm text-black flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span>LilyGO T-Dongle-S3 Wi-Fi SoftAP 直結ガイド</span>
              </div>
              <button
                onClick={() => { playMacBeep(); setShowApGuide(false); }}
                className="w-4 h-4 border border-black bg-white hover:bg-black hover:text-white flex items-center justify-center text-[10px] font-bold shadow-[1px_1px_0_#000] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 space-y-3 text-xs leading-relaxed">
              <p className="text-gray-800">
                T-Dongle-S3 は、BLE通信（要約テキスト・識別コード）に加え、<strong>ローカルWi-Fi SoftAP</strong> を内蔵しています。
                接続すると、32GB MicroSD内の <strong>大判アトラス(1024px WebP)</strong> や <strong>添付文書原本PDF</strong> を数MB/sで超高速ストリーミングできます。
              </p>

              <div className="bg-emerald-50 border-2 border-emerald-600 p-2.5 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">SSID (Wi-Fi名):</span>
                  <span className="font-bold text-emerald-950 bg-white px-2 py-0.5 border border-emerald-300">Drdonguri-Atlas-Direct</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">暗号化パスワード:</span>
                  <span className="font-bold text-emerald-950 bg-white px-2 py-0.5 border border-emerald-300">drdonguri</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">ストリーミングIP:</span>
                  <span className="font-bold text-emerald-950">192.168.4.1 (Port 80)</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-emerald-200">
                  <span className="text-gray-600">接続ステータス:</span>
                  <span className={`font-bold ${apStatus.isConnected ? 'text-emerald-700' : 'text-gray-500'}`}>
                    {apStatus.isConnected ? `接続中 (${apStatus.latencyMs ? `${apStatus.latencyMs}ms` : '良好'})` : '未接続 (BLE要約モード)'}
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 bg-gray-50 p-2 border border-gray-200">
                ※インターネット不要の完全閉域Wi-Fiです。スマホの「Wi-Fi設定」から上記SSIDを選択して接続してください。
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleCheckAp}
                  disabled={isCheckingAp}
                  className="px-3 py-1.5 border border-black bg-yellow-100 hover:bg-yellow-200 font-bold text-xs shadow-[1px_1px_0_#000] flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingAp ? 'animate-spin' : ''}`} />
                  <span>疎通テスト再試行</span>
                </button>
                <button
                  type="button"
                  onClick={() => { playMacBeep(); setShowApGuide(false); }}
                  className="px-3 py-1.5 border border-black bg-black text-white hover:bg-gray-800 font-bold text-xs shadow-[1px_1px_0_#000] cursor-pointer"
                >
                  了解
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
