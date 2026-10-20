import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  ArrowLeft,
  ShieldCheck,
  Lock,
  Volume2,
  VolumeX,
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
  MatchedDrugIdentificationItem,
  MatchedClinicalAtlasItem,
} from '../services/bleMedicalIndexService';
import {
  sdCardStreamingService,
  SoftApStatus,
} from '../services/sdCardStreamingService';
import {
  extractChartClinicalKeywords,
  DEFAULT_SAMPLE_CHART_TEXT,
} from '../utils/chartTextCleaner';
import { playMacBeep, playSosumi, isAudioMuted, toggleAudioMuted, addAudioMuteListener } from '../utils/macAudio';

interface MedicalDataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onInsertText: (text: string) => void;
  initialQuery?: string;
  initialTab?: TabFilterType;
}

export type TabFilterType = 'all' | 'pill' | 'atlas' | 'emer' | 'drug' | 'score' | 'lab' | 'proc' | 'renal' | 'minds' | 'disease' | 'sdmap';

export const MedicalDataSearchModal: React.FC<MedicalDataSearchModalProps> = ({
  isOpen,
  onClose,
  inputText,
  onInsertText,
  initialQuery = '',
  initialTab = 'all',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [filterType, setFilterType] = useState<TabFilterType>(initialTab);
  // カルテ全体100%連動モード（デフォルトON: カルテ全体の抽出キーワードに完全リンクしたデータを表示）
  const [isChartLinked, setIsChartLinked] = useState<boolean>(true);
  // 3省2ガイドライン 隠しWi-Fi SoftAPガイド起動用タップカウンタ
  const [secretTapCount, setSecretTapCount] = useState<number>(0);

  // カルテ全体（主訴・現病歴・既往歴・内服薬・身体所見・検査・アセスメント・プラン）からのキーワード抽出
  const chartContext = useMemo(() => {
    const sourceChart = inputText && inputText.trim().length > 0 ? inputText : DEFAULT_SAMPLE_CHART_TEXT;
    return extractChartClinicalKeywords(sourceChart);
  }, [inputText]);

  useEffect(() => {
    if (initialTab) {
      setFilterType(initialTab);
    }
  }, [initialTab]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  // Wi-Fi SoftAP 高解像度ストリーミングステート (隠し機能)
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

  // EmbeddingGemma 2 (740M MRL 128d) セマンティック検索ステート
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

  // 隠し機能: 3省2ガイドラインバッジを3回タップでWi-Fi SoftAPエアギャップ設定を起動
  const handleSecretBadgeTap = () => {
    const next = secretTapCount + 1;
    if (next >= 3) {
      playMacBeep();
      setSecretTapCount(0);
      handleCheckAp();
      setShowApGuide(true);
    } else {
      setSecretTapCount(next);
    }
  };

  // ボタンタップ音・操作効果音のミュート状態
  const [isMuted, setIsMuted] = useState<boolean>(() => isAudioMuted());

  useEffect(() => {
    const unsub = addAudioMuteListener((muted) => {
      setIsMuted(muted);
    });
    return unsub;
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = toggleAudioMuted();
    setIsMuted(next);
    if (!next) {
      playMacBeep();
    }
  }, []);

  // モーダルを閉じてメイン画面へ戻る（キーボード格納・スクロール位置ゼロリセット・ハンバーガーボタン消失防止）
  const handleClose = useCallback(() => {
    playMacBeep();
    if (inputRef.current) {
      inputRef.current.blur();
    }
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.body.scrollTop = 0;
      document.documentElement.scrollTop = 0;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      if (initialQuery) {
        setQuery(initialQuery);
      } else {
        setQuery('');
        setIsChartLinked(true);
      }
      setSecretTapCount(0);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
      }
    } else {
      setActiveMindsItem(null);
      setLlmStreamingOutput('');
      setIsLlmGenerating(false);
      setSelectedAtlas(null);
      setHighResAtlasUrl(null);
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    };
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

  // 各タブにおける実効検索クエリ（手動入力があれば手動入力、空欄かつカルテ連動ONならカルテ全体抽出キーワード）
  const effectivePillQuery = useMemo(() => {
    if (query.trim()) return query.trim();
    if (!isChartLinked) return '';
    return chartContext.drugKeywords.join(' ') || chartContext.allKeywords.join(' ');
  }, [query, isChartLinked, chartContext]);

  const effectiveAtlasQuery = useMemo(() => {
    if (query.trim()) return query.trim();
    if (!isChartLinked) return '';
    return chartContext.atlasEcgKeywords.join(' ') || chartContext.allKeywords.join(' ');
  }, [query, isChartLinked, chartContext]);

  const effectiveGeneralQuery = useMemo(() => {
    if (query.trim()) return query.trim();
    if (!isChartLinked) return '高血圧 狭心症 糖尿病 心不全';
    if (filterType === 'minds' || filterType === 'emer') {
      return chartContext.mindsEmerKeywords.join(' ') || chartContext.allKeywords.join(' ');
    }
    if (filterType === 'drug') {
      return chartContext.drugKeywords.join(' ') || chartContext.allKeywords.join(' ');
    }
    return chartContext.allKeywords.join(' ') || '高血圧 狭心症';
  }, [query, isChartLinked, filterType, chartContext]);

  // 錠剤識別専用フィルタリング結果（カルテ内の内服薬・処方薬・関連疾患薬と100%リンク）
  const pillSearchResults = useMemo<MatchedDrugIdentificationItem[]>(() => {
    const matched = bleMedicalIndexService.searchPills({
      query: effectivePillQuery || undefined,
      imprint: pillImprintFilter || undefined,
      shape: pillShapeFilter !== 'all' ? pillShapeFilter : undefined,
      hasScoredLine: pillScoredFilter === 'all' ? undefined : pillScoredFilter === 'yes',
    });
    if (matched.length === 0 && !query.trim() && !pillImprintFilter) {
      return bleMedicalIndexService.searchPills({
        query: chartContext.allKeywords.join(' ') || undefined,
      });
    }
    return matched;
  }, [effectivePillQuery, query, pillImprintFilter, pillShapeFilter, pillScoredFilter, chartContext]);

  // 臨床アトラス専用フィルタリング結果（カルテ内の心電図所見・症状・疾患と100%リンク）
  const atlasSearchResults = useMemo<MatchedClinicalAtlasItem[]>(() => {
    const matched = bleMedicalIndexService.searchAtlas(atlasCategoryFilter, effectiveAtlasQuery);
    if (matched.length === 0 && !query.trim()) {
      return bleMedicalIndexService.searchAtlas(atlasCategoryFilter, chartContext.allKeywords.join(' '));
    }
    return matched;
  }, [atlasCategoryFilter, effectiveAtlasQuery, query, chartContext]);

  // EmbeddingGemma 2 セマンティック検索の非同期実行
  useEffect(() => {
    if (!useSemantic) {
      setSemanticResults([]);
      return;
    }

    let isMounted = true;
    const executeSearch = async () => {
      setIsSearchingSemantic(true);
      try {
        const results = await searchWithEmbeddingGemma(effectiveGeneralQuery, filterType as any, 35, true);
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

    const timer = setTimeout(executeSearch, 40);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [effectiveGeneralQuery, filterType, useSemantic]);

  // 検索結果 (セマンティック有効時は EmbeddingGemma、無効時は従来のキーワード検索)
  const searchResults = useMemo(() => {
    if (useSemantic && semanticResults.length > 0) {
      return semanticResults;
    }
    return searchUnifiedMedicalKnowledge(effectiveGeneralQuery, filterType as any, 35);
  }, [effectiveGeneralQuery, filterType, useSemantic, semanticResults]);

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

  // カルテ全体からキーワードを再抽出して100%連動モードをアクティブ化
  const handleExtractFromChart = () => {
    playMacBeep();
    setQuery('');
    setIsChartLinked(true);
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
        inputText || DEFAULT_SAMPLE_CHART_TEXT,
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
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none animate-in fade-in pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
      <div className="bg-[#0F172A] border border-slate-700/80 rounded-2xl max-w-4xl w-full h-[94vh] sm:h-[88vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        {/* ネイティブ風 PWA ヘッダー（戻るボタン常設 ＆ 3省2ガイドライン準拠バッジ） */}
        <div className="bg-[#1E293B] border-b border-slate-800 px-3 sm:px-4 py-2.5 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleClose}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer shrink-0"
              title="メイン画面へ戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>戻る</span>
            </button>
            <div className="font-bold text-xs sm:text-sm flex items-center gap-1.5 text-white truncate">
              <span className="truncate">📚 32GB MicroSD 臨床意思決定支援</span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-700/60 hidden md:inline">
                医療知識均てん化・ハーム防止
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 3省2ガイドライン準拠（完全オフライン・オンプレミス）バッジ ※3回タップで隠し機能Wi-Fi SoftAPガイド起動 */}
            <button
              type="button"
              onClick={handleSecretBadgeTap}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 cursor-pointer transition-colors select-none ${
                apStatus.isConnected
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/70 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                  : 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 hover:bg-emerald-900/60'
              }`}
              title="3省2ガイドライン準拠：完全オフライン・オンプレミス稼働中"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">
                {apStatus.isConnected ? '3省2ガイドライン準拠 (エアギャップ直結)' : '3省2ガイドライン準拠 (完全オフライン)'}
              </span>
              <span className="sm:hidden">3省2GL準拠</span>
            </button>

            <div className="text-[10px] text-purple-300 font-bold bg-purple-950/60 border border-purple-600/50 px-2 py-1 rounded-full hidden lg:flex items-center gap-1">
              <Brain className="w-3 h-3 text-purple-400" />
              <span>Gemma 2 MRL</span>
            </div>

            {/* サウンドミュート切替ボタン */}
            <button
              type="button"
              onClick={handleToggleMute}
              className={`p-1.5 rounded-xl border flex items-center gap-1 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95 ${
                isMuted
                  ? 'bg-rose-950/80 text-rose-300 border-rose-500/70 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-700'
              }`}
              title={isMuted ? 'タップ音・ビープ音を有効化（消音解除）' : 'タップ音・ビープ音を消音（ミュート）'}
              aria-label={isMuted ? '消音中' : '効果音ON'}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
            </button>

            <button
              onClick={handleClose}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
              title="閉じる"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 検索入力バー ＆ カルテ全体キーワード100%連動パネル */}
        <div className="p-3 bg-[#0F172A] border-b border-slate-800 space-y-2 shrink-0">
          <div className="flex gap-1.5 sm:gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isChartLinked
                    ? `🎯 カルテ全体連動中 (${chartContext.allKeywords.slice(0, 5).join('・')}...) — 任意キーワードで絞り込み可能`
                    : '病名、薬剤名、刻印記号(TCK/105)、検査値(HbA1c/eGFR)、指導料、心電図、ICD-10...'
                }
                className="w-full bg-[#1E293B] border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-sans text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors shadow-inner"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* カルテ全体連動モード切替ボタン */}
            <button
              type="button"
              onClick={() => {
                playMacBeep();
                if (query) {
                  setQuery('');
                  setIsChartLinked(true);
                } else {
                  setIsChartLinked(!isChartLinked);
                }
              }}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors ${
                isChartLinked && !query
                  ? 'bg-emerald-600 text-slate-950 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/60'
              }`}
              title="カルテ全体（主訴・現病歴・既往歴・内服薬・所見・評価・計画）から全キーワードを抽出して100%連動表示します"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isChartLinked && !query ? 'text-slate-950' : 'text-amber-400'}`} />
              <span className="hidden sm:inline">
                {isChartLinked && !query ? '🎯 カルテ100%連動中' : 'カルテ全体から抽出'}
              </span>
              <span className="sm:hidden">{isChartLinked && !query ? '連動中' : '抽出'}</span>
            </button>

            {/* EmbeddingGemma 2 (740M MRL 128d) セマンティック検索トグル */}
            <button
              type="button"
              onClick={() => {
                playMacBeep();
                setUseSemantic(!useSemantic);
              }}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold border whitespace-nowrap flex items-center gap-1.5 cursor-pointer transition-colors ${
                useSemantic
                  ? 'bg-purple-900/80 text-purple-200 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'bg-[#1E293B] text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Google DeepMind EmbeddingGemma 2 (740M MRL 128d) による完全ブラウザ内ローカルセマンティック検索"
            >
              <Brain className={`w-3.5 h-3.5 ${useSemantic ? 'text-purple-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">⚡ Gemma 2</span>
            </button>
          </div>

          {/* 🎯 カルテ全体抽出キーワード・インジケータバー（100%リンクの根拠を可視化） */}
          <div className="bg-slate-900/90 border border-emerald-700/40 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/60 px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>カルテ抽出キーワード ({chartContext.allKeywords.length}件):</span>
            </span>
            {query && (
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setQuery('');
                  setIsChartLinked(true);
                }}
                className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[10px] shrink-0 cursor-pointer"
              >
                ↺ 全キーワード連動に戻す
              </button>
            )}
            {chartContext.allKeywords.map((kw) => {
              const isDirect = chartContext.directKeywords.includes(kw);
              const isSelected = query === kw;
              return (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    playMacBeep();
                    if (query === kw) {
                      setQuery('');
                      setIsChartLinked(true);
                    } else {
                      setQuery(kw);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                      : isDirect
                      ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-200 border-emerald-600/50'
                      : 'bg-purple-950/50 hover:bg-purple-900/70 text-purple-200 border-purple-700/50'
                  }`}
                  title={isDirect ? 'カルテ本文から直接抽出された臨床キーワード（タップで単一絞り込み）' : 'カルテの症状・所見から臨床推論された関連キーワード（タップで単一絞り込み）'}
                >
                  {isDirect ? `🎯 ${kw}` : `💡 ${kw}`}
                </button>
              );
            })}
          </div>

          {/* フィルタタブ */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <button
              onClick={() => { playMacBeep(); setFilterType('all'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-colors ${
                filterType === 'all'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              すべて ({searchResults.length})
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('pill'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'pill'
                  ? 'bg-teal-500 text-slate-950 shadow-[0_0_12px_rgba(20,184,166,0.3)]'
                  : 'bg-teal-950/50 hover:bg-teal-900/60 text-teal-300 border border-teal-700/50'
              }`}
            >
              <Pill className="w-3.5 h-3.5" />
              <span>💊 錠剤識別（表裏） ({pillSearchResults.length})</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('atlas'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'atlas'
                  ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-700/50'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>📈 12誘導心電図・臨床診断 ({atlasSearchResults.length})</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('emer'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'emer'
                  ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Siren className="w-3.5 h-3.5 text-red-400" />
              <span>🚑 救急・中毒</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('drug'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'drug'
                  ? 'bg-sky-500 text-slate-950 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Pill className="w-3.5 h-3.5 text-sky-400" />
              <span>処方・標準薬</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('score'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'score'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-amber-400" />
              <span>🧮 臨床スコア</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('lab'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'lab'
                  ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-rose-400" />
              <span>🔬 検査値＆基準値</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('proc'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'proc'
                  ? 'bg-sky-500 text-slate-950 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-sky-400" />
              <span>💉 診療行為・指導料</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('renal'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'renal'
                  ? 'bg-amber-600 text-white shadow-[0_0_12px_rgba(217,119,6,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>⚠️ 腎機能別減量</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('minds'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'minds'
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>Minds (169CQ)</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('disease'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'disease'
                  ? 'bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-indigo-400" />
              <span>傷病名</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('sdmap'); }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-colors ${
                filterType === 'sdmap'
                  ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.3)]'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 text-purple-400" />
              <span>💾 32GB SDマップ</span>
            </button>
          </div>
        </div>

        {/* メインコンテンツエリア (検索結果一覧 ＆ WebLLM相談パネル ＆ SD領域マップ) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 32GB MicroSD 全領域配分マップ ビュー */}
          {filterType === 'sdmap' ? (
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 font-sans bg-[#0F172A]">
              {/* マップヘッダー ＆ 物理仕様バナー */}
              <div className="bg-[#1E293B] text-slate-100 p-3.5 border border-purple-500/40 rounded-xl shadow-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-purple-400" />
                    <span className="font-bold text-sm sm:text-base text-white">LilyGO T-Dongle-S3 32GB MicroSD 全領域配分マップ</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500 text-slate-950 text-[10px] font-mono font-bold rounded">
                    Zero-Write 読取専用保護
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  物理容量 32GB (FAT32実効 29.8GB) を極限まで活用。臨床原本PDF・ローカルAIモデル重み・全品目添付文書・高解像度アトラスを完全収録し、電子カルテ端末でのオフライン超高速検索を実現します。
                </p>

                {/* ストレージ容量バー */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>収録済医療データ: 29.8 GB / 29.8 GB (100%)</span>
                    <span>FAT破損防止 Zero-Write 設計</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900 border border-slate-700 rounded flex overflow-hidden">
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
                      className="border border-slate-700/80 bg-[#1E293B] rounded-xl p-3 shadow-lg flex flex-col justify-between space-y-2 hover:border-purple-500/70 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs text-white">
                            {part.categoryName}
                          </span>
                          <span className="shrink-0 font-mono font-bold text-xs text-purple-300 bg-purple-950/70 px-1.5 py-0.5 border border-purple-700/50 rounded">
                            {part.sizeGb} GB ({part.percentage}%)
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 bg-slate-900/80 px-1.5 py-0.5 border border-slate-800 rounded">
                          {part.path}
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          {part.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                        <span className="font-semibold text-slate-400">
                          {part.itemCountDescription}
                        </span>
                        {targetTab !== 'all' && (
                          <button
                            onClick={() => {
                              playMacBeep();
                              setFilterType(targetTab);
                            }}
                            className="px-2.5 py-1 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg text-[10px] cursor-pointer transition-colors"
                          >
                            データ閲覧 ➔
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 医療知識均てん化・ハーム最小化・医療費削減 ＆ 3省2ガイドライン完全オフライン理念バナー */}
              <div className="bg-emerald-950/30 border border-emerald-700/50 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>完全オフライン医師データ支援：医療知識均てん化・受診者ハーム最小化・医療費削減の黄金率</span>
                  </div>
                  {/* 隠し機能への控えめな管理者エントリ */}
                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      handleCheckAp();
                      setShowApGuide(true);
                    }}
                    className="text-[10px] font-mono text-slate-400 hover:text-emerald-300 bg-slate-900/80 border border-slate-700/70 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                    title="管理者向け隠し機能：T-Dongle-S3 Wi-Fi接続による物理ネット遮断（3省2ガイドライン完全準拠エアギャップモード）"
                  >
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span>3省2GL エアギャップ設定</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  32GB MicroSD内のMindsガイドライン・PMDA添付文書・12誘導心電図・救急プロトコルをカルテ内容と100%連動して即時提示することで、専門領域外の認知格差を是正し、禁忌処方や漫然投与による受診者ハームと不要な医療費を最小化します。
                </p>
              </div>
            </div>
          ) : filterType === 'pill' ? (
            /* 💊 錠剤識別（表裏）専用ビュー */
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 font-sans bg-[#0F172A]">
              {/* 錠剤絞り込みサブツールバー */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-3 shadow-lg space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-teal-300">
                    <Pill className="w-4 h-4 text-teal-400" />
                    <span>医薬品添付文書 ＆ 錠剤識別写真 (カルテ内処方・既往疾患100%連動)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isChartLinked && !query && (
                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 border border-emerald-600/60 rounded-lg">
                        🎯 カルテ連動抽出: {pillSearchResults.length} 品目
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        playMacBeep();
                        setIsChartLinked(!isChartLinked);
                        setQuery('');
                      }}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      {isChartLinked && !query ? '全品目を表示' : '🎯 カルテ連動に戻す'}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1">刻印記号 (表/裏):</label>
                    <input
                      type="text"
                      value={pillImprintFilter}
                      onChange={(e) => setPillImprintFilter(e.target.value)}
                      placeholder="例: TCK, 105, 5mg..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1">形状・剤形:</label>
                    <select
                      value={pillShapeFilter}
                      onChange={(e) => setPillShapeFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="all">すべての形状</option>
                      <option value="円形">円形 (丸型)</option>
                      <option value="楕円形">楕円形 (オーバル)</option>
                      <option value="カプセル">カプセル剤</option>
                      <option value="トローチ">トローチ / 口腔内崩壊錠</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-300 mb-1">割線の有無:</label>
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
                          className={`flex-1 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                            pillScoredFilter === opt.val
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
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
                <div className="p-8 text-center text-slate-400 text-xs">
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
                        className="border border-slate-700/80 bg-[#1E293B] rounded-xl p-3 shadow-lg flex flex-col md:flex-row gap-3 hover:border-teal-500/70 transition-colors"
                      >
                        {/* 錠剤写真 ＆ 表裏フリップ */}
                        <div className="flex flex-col items-center justify-center bg-slate-900/80 border border-slate-800 rounded-xl p-2 shrink-0 w-full md:w-44">
                          <div className="relative w-32 h-32 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center overflow-hidden shadow-inner group">
                            {displayedImg ? (
                              <img
                                src={displayedImg}
                                alt={drug.brandName}
                                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-110"
                                onError={(e) => {
                                  if (drug.frontImageUrl) {
                                    (e.target as HTMLImageElement).src = drug.frontImageUrl;
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-teal-500/60 flex flex-col items-center justify-center text-center p-2">
                                <span className="font-mono font-black text-xs text-teal-300">{isFlipped ? drug.imprintBack : drug.imprintFront}</span>
                                <span className="text-[9px] text-slate-400 mt-0.5">{drug.colorAndShape.slice(0, 8)}</span>
                              </div>
                            )}
                            <div className="absolute top-1 left-1 bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">
                              {isFlipped ? '裏面 [BACK]' : '表面 [FRONT]'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 mt-2 w-full">
                            <button
                              type="button"
                              onClick={() => togglePillFlip(drug.id)}
                              className="flex-1 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-200 rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-colors"
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
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-teal-950/70 text-teal-300 border-teal-700/50">
                                    {drug.category}
                                  </span>
                                  {drug.matchedKeywords && drug.matchedKeywords.length > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-950/90 text-emerald-300 border-emerald-500/60">
                                      🎯 カルテ一致: {drug.matchedKeywords.slice(0, 3).join('・')}
                                    </span>
                                  )}
                                  <span className="font-bold text-sm sm:text-base text-white">
                                    {drug.brandName}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    ({drug.genericName})
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                  YJ: {drug.yjCode} | JAN: {drug.janCode || '未登録'} | SD: {drug.sdFilePath}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPackagePdf(drug.pdfPath)}
                                  className="px-2 py-1 text-[11px] font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                  title="PMDA公式 医薬品添付文書PDF原本を開く"
                                >
                                  <FileText className="w-3 h-3 text-sky-400" />
                                  <span className="hidden sm:inline">添付文書PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleInsert(chartText, drug.id)}
                                  className="px-2 py-1 text-[11px] font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                  title="カルテ本文に処方・用法を挿入"
                                >
                                  {isItemInserted ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3" />}
                                  <span>処方挿入</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(chartText, drug.id)}
                                  className="px-1.5 py-1 text-[11px] border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-colors"
                                  title="コピー"
                                >
                                  {isItemCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>

                            {/* 刻印バッジ・スペックマトリクス */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1 text-[11px]">
                              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
                                <span className="block text-[9.5px] font-bold text-teal-400">表刻印記号</span>
                                <span className="font-mono font-black text-xs text-white">{drug.imprintFront || '（なし）'}</span>
                              </div>
                              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
                                <span className="block text-[9.5px] font-bold text-teal-400">裏刻印記号</span>
                                <span className="font-mono font-black text-xs text-white">{drug.imprintBack || '（なし）'}</span>
                              </div>
                              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
                                <span className="block text-[9.5px] font-bold text-slate-400">外観・形状・割線</span>
                                <span className="text-slate-200 font-semibold">{drug.colorAndShape} / {drug.hasScoredLine ? '割線有' : '割線無'}</span>
                              </div>
                              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-1.5">
                                <span className="block text-[9.5px] font-bold text-slate-400">直径 / 厚み</span>
                                <span className="font-mono text-slate-300">{drug.diameterMm ? `${drug.diameterMm}mm` : '-'} / {drug.thicknessMm ? `${drug.thicknessMm}mm` : '-'}</span>
                              </div>
                            </div>

                            {/* 用法用量 ＆ 腎機能注意 */}
                            <div className="text-xs bg-slate-900/60 p-2.5 border border-slate-800 rounded-lg space-y-1.5 mt-1">
                              <div><span className="font-bold text-slate-300">標準用法用量: </span><span className="text-slate-200">{drug.standardDose}</span></div>
                              {drug.renalDoseInfo && (
                                <div className="text-amber-200 bg-amber-950/40 p-1.5 border border-amber-600/40 rounded flex items-start gap-1 text-[11px]">
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                  <span><span className="font-bold">腎機能別減量: </span>{drug.renalDoseInfo}</span>
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400"><span className="font-bold text-slate-300">主要注意: </span>{drug.majorCautions}</div>
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
            <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 font-sans bg-[#0F172A]">
              {/* アトラス絞り込みサブツールバー */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-3 shadow-lg flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-rose-300">
                  <Camera className="w-4 h-4 text-rose-400" />
                  <span>12誘導心電図 ＆ 臨床波形・画像解析 (カルテ所見・病態100%連動)</span>
                </div>

                {/* カテゴリ切り替えチップ */}
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  {(['全件', '心電図', '皮膚科', '内視鏡'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => { playMacBeep(); setAtlasCategoryFilter(cat); }}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                        atlasCategoryFilter === cat
                          ? 'bg-rose-500 text-white border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setIsChartLinked(!isChartLinked);
                      setQuery('');
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold cursor-pointer"
                  >
                    {isChartLinked && !query ? '全アトラス表示' : '🎯 カルテ連動に戻す'}
                  </button>
                  <span className="text-[11px] font-mono text-rose-300 bg-rose-950/70 px-2 py-0.5 border border-rose-700/50 rounded-lg">
                    {atlasSearchResults.length} 点
                  </span>
                </div>
              </div>

              {/* ギャラリーグリッド (2〜3列) */}
              {atlasSearchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  一致するアトラス画像が見つかりませんでした。カテゴリを「全件」にするかキーワードを変更してください。
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {atlasSearchResults.map((atlas) => {
                    const isItemCopied = copiedId === atlas.id;
                    const isItemInserted = insertedId === atlas.id;
                    const chartText = bleMedicalIndexService.formatAtlasForMedicalRecord(atlas);

                    let catBadge = 'bg-purple-950/80 text-purple-300 border-purple-700/60';
                    if (atlas.category === '心電図') catBadge = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
                    else if (atlas.category === '皮膚科') catBadge = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
                    else if (atlas.category === '内視鏡') catBadge = 'bg-sky-950/80 text-sky-300 border-sky-700/60';

                    return (
                      <div
                        key={atlas.id}
                        className="border border-slate-700/80 bg-[#1E293B] rounded-xl shadow-lg flex flex-col justify-between overflow-hidden hover:border-rose-500/70 transition-colors"
                      >
                        {/* サムネイル画像コンテナ (クリックで大判モーダル) */}
                        <div
                          onClick={() => handleOpenAtlasModal(atlas)}
                          className="relative aspect-4/3 bg-slate-950 flex items-center justify-center cursor-pointer group overflow-hidden"
                          title="クリックして1024px大判プレビュー ＆ 方眼紙グリッド測定"
                        >
                          <img
                            src={atlas.thumbnailUrl}
                            alt={atlas.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-bold text-xs">
                            <Maximize2 className="w-4 h-4" />
                            <span>1024px 大判拡大</span>
                          </div>
                          <div className="absolute top-1.5 left-1.5 flex items-center gap-1 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${catBadge}`}>
                              {atlas.category}
                            </span>
                            {atlas.hasEcgGrid && (
                              <span className="text-[9px] font-mono font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">
                                方眼紙グリッド対応
                              </span>
                            )}
                            {atlas.matchedKeywords && atlas.matchedKeywords.length > 0 && (
                              <span className="text-[9px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/70 px-1.5 py-0.5 rounded">
                                🎯 カルテ一致: {atlas.matchedKeywords.slice(0, 2).join('・')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* カード詳細情報 */}
                        <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                          <div className="space-y-1">
                            <div className="font-bold text-xs sm:text-sm text-white line-clamp-1">
                              {atlas.title}
                            </div>
                            <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed">
                              {atlas.typicalFeatures}
                            </p>
                            <div className="text-[10px] text-purple-300 font-semibold bg-purple-950/50 px-2 py-1 rounded-lg border border-purple-800/40 line-clamp-1">
                              鑑別: {atlas.differentialDiagnosis}
                            </div>
                          </div>

                          {/* アクションボタン */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => handleOpenAtlasModal(atlas)}
                              className="px-2.5 py-1 text-[10px] font-bold border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Eye className="w-3 h-3 text-amber-400" />
                              <span>大判表示</span>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleInsert(chartText, atlas.id)}
                                className="px-2.5 py-1 text-[10px] font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                                title="カルテ所見に反映"
                              >
                                {isItemInserted ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3" />}
                                <span>カルテ反映</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopy(chartText, atlas.id)}
                                className="px-2 py-1 text-[10px] border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-colors"
                                title="コピー"
                              >
                                {isItemCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
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
            /* 通常の検索結果リスト（Mindsガイドライン・救急プロトコル・総合検索等） */
            <div className={`flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 bg-[#0F172A] ${activeMindsItem ? 'md:max-w-[55%]' : 'w-full'}`}>
              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-sans text-xs space-y-2">
                  <Search className="w-8 h-8 mx-auto text-slate-500 stroke-1" />
                  <p className="font-bold text-slate-300">一致する臨床データが見つかりませんでした</p>
                  <p className="text-[11px] text-slate-400">「🎯 カルテ100%連動中」ボタンを押すか、別の臨床キーワードでお試しください。</p>
                </div>
              ) : (
                searchResults.map((item, idx) => {
                  const uniqueKey = `${item.type}-${idx}`;
                  const isItemCopied = copiedId === uniqueKey;
                  const isItemInserted = insertedId === uniqueKey;
                  const insertText = getInsertText(item);
                  const sem = item as SemanticSearchResult;

                  // アイテムごとのカラー設定
                  let badgeStyle = 'bg-slate-800 text-slate-300 border-slate-700';
                  let badgeLabel = '情報';
                  if (item.type === 'emer' || sem.emergencyData) {
                    badgeStyle = 'bg-red-950/80 text-red-300 border-red-700/60';
                    badgeLabel = '🚑 救急中毒';
                  } else if (item.type === 'atlas' || sem.atlasData) {
                    badgeStyle = 'bg-purple-950/80 text-purple-300 border-purple-700/60';
                    badgeLabel = '🖼️ アトラス';
                  } else if (item.type === 'drug_id' || sem.drugIdData) {
                    badgeStyle = 'bg-teal-950/80 text-teal-300 border-teal-700/60';
                    badgeLabel = '💊 持参薬識別';
                  } else if (item.type === 'score' || sem.scoreData) {
                    badgeStyle = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
                    badgeLabel = '🧮 臨床スコア';
                  } else if (item.type === 'lab') {
                    badgeStyle = 'bg-rose-950/80 text-rose-300 border-rose-700/60';
                    badgeLabel = '🔬 検査値';
                  } else if (item.type === 'proc') {
                    badgeStyle = 'bg-sky-950/80 text-sky-300 border-sky-700/60';
                    badgeLabel = '💉 診療行為';
                  } else if (item.type === 'renal') {
                    badgeStyle = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
                    badgeLabel = '⚠️ 腎機能減量';
                  } else if (item.type === 'minds') {
                    badgeStyle = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
                    badgeLabel = 'Minds CQ';
                  } else if (item.type === 'drug') {
                    badgeStyle = 'bg-sky-950/80 text-sky-300 border-sky-700/60';
                    badgeLabel = '医薬品';
                  } else if (item.type === 'disease') {
                    badgeStyle = 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60';
                    badgeLabel = '病名';
                  }

                  return (
                    <div
                      key={uniqueKey}
                      className="border border-slate-700/80 bg-[#1E293B] rounded-xl p-3 shadow-lg space-y-2 hover:border-slate-600 transition-all font-sans text-slate-100"
                    >
                      {/* ヘッダー情報 */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                              {badgeLabel}
                            </span>
                            {item.matchedKeywords && item.matchedKeywords.length > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-950/90 text-emerald-300 border-emerald-500/60">
                                🎯 カルテ一致: {item.matchedKeywords.slice(0, 3).join('・')}
                              </span>
                            )}
                            {sem.semanticScore !== undefined && sem.semanticScore > 0 && (
                              <span
                                className="text-[9px] font-mono font-bold px-1.5 py-0.5 border border-purple-500/60 bg-purple-950/70 text-purple-300 rounded flex items-center gap-1"
                                title={`EmbeddingGemma 2 (740M MRL 128d) 意味的コサイン類似度: ${Math.round(sem.semanticScore * 100)}%`}
                              >
                                <Brain className="w-2.5 h-2.5 text-purple-400" />
                                <span>{Math.round(sem.semanticScore * 100)}% Match</span>
                              </span>
                            )}
                            <span className="font-bold text-xs sm:text-sm text-white">
                              {item.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            {item.subtitle}
                          </div>
                        </div>

                        {/* クイック操作ボタン */}
                        <div className="flex items-center gap-1 shrink-0">
                          {item.type === 'minds' && item.mindsData && (
                            <button
                              onClick={() => handleConsultWebLlm(item.mindsData!)}
                              className="px-2 py-1 text-[11px] font-bold border border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                              title="このガイドラインをWebLLMに渡して臨床アドバイスを推論"
                            >
                              <Brain className="w-3 h-3 text-amber-400" />
                              <span className="hidden sm:inline">AI推論</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleInsert(insertText, uniqueKey)}
                            className="px-2 py-1 text-[11px] font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                            title="カルテ本文に挿入"
                          >
                            {isItemInserted ? <Check className="w-3 h-3 text-emerald-400" /> : <Plus className="w-3 h-3" />}
                            <span>挿入</span>
                          </button>
                          <button
                            onClick={() => handleCopy(insertText, uniqueKey)}
                            className="px-1.5 py-1 text-[11px] border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-colors"
                            title="コピー"
                          >
                            {isItemCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>

                      {/* コード / 属性 */}
                      <div className="text-[10px] text-slate-400 font-mono bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                        {item.codeOrAttr}
                      </div>

                      {/* 救急・中毒プロトコル詳細 */}
                      {sem.emergencyData && (
                        <div className="bg-red-950/30 border border-red-800/50 rounded-lg p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center gap-1.5 text-red-200 font-bold text-[11px]">
                            <Siren className="w-3.5 h-3.5 text-red-400 shrink-0" />
                            <span>解毒・拮抗薬:</span>
                            <span className="text-red-300 bg-red-950/70 px-1.5 py-0.5 border border-red-700/60 rounded font-bold">{sem.emergencyData.antidoteOrTreatment}</span>
                          </div>
                          <div className="text-[11px] text-slate-200 bg-slate-900/70 p-2 rounded border border-slate-800">
                            <span className="font-bold text-white">初期処置: </span>{sem.emergencyData.initialProtocol}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/40 px-2 py-0.5 rounded">
                            <span>指標: {sem.emergencyData.triageOrScore}</span>
                            <span className="font-mono text-slate-400">SD: {sem.emergencyData.sdFilePath}</span>
                          </div>
                        </div>
                      )}

                      {/* 臨床アトラス・ECG詳細 */}
                      {sem.atlasData && (
                        <div className="bg-purple-950/30 border border-purple-800/50 rounded-lg p-2.5 text-xs space-y-1.5">
                          <div className="flex items-start gap-2.5">
                            {/* サムネイル */}
                            <div
                              onClick={() => handleOpenAtlasModal(sem.atlasData!)}
                              className="relative w-20 h-16 bg-slate-950 border border-purple-800/60 rounded-lg shrink-0 cursor-pointer overflow-hidden group"
                              title="クリックして1024px大判表示"
                            >
                              <img
                                src={sem.atlasData.thumbnailUrl}
                                alt={sem.atlasData.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Maximize2 className="w-3.5 h-3.5" />
                              </div>
                            </div>

                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between text-[11px] font-bold text-purple-300">
                                <div className="flex items-center gap-1">
                                  <Camera className="w-3.5 h-3.5 text-purple-400" />
                                  <span>典型所見:</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAtlasModal(sem.atlasData!)}
                                    className="px-2 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded cursor-pointer flex items-center gap-0.5 transition-colors"
                                  >
                                    <Eye className="w-2.5 h-2.5 text-amber-400" />
                                    <span>大判表示</span>
                                  </button>
                                  <span className="font-mono text-[9px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 text-purple-300 hidden sm:inline">
                                    {sem.atlasData.sdFilePath}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[11px] text-slate-200 bg-slate-900/70 p-2 rounded border border-slate-800">
                                {sem.atlasData.typicalFeatures}
                              </div>
                            </div>
                          </div>

                          <div className="text-[10px] text-purple-300 bg-purple-950/50 px-2 py-1 rounded border border-purple-800/40 flex items-center justify-between">
                            <span>鑑別: {sem.atlasData.differentialDiagnosis}</span>
                            <span className="font-semibold text-purple-200">{sem.atlasData.clinicalSignificance}</span>
                          </div>
                        </div>
                      )}

                      {/* 持参薬識別詳細 */}
                      {sem.drugIdData && (
                        <div className="bg-teal-950/30 border border-teal-800/50 rounded-lg p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-bold text-teal-300">刻印コード:</span>
                              <span className="bg-slate-900 border border-teal-500 text-teal-300 font-mono font-black text-xs px-2 py-0.5 rounded" title="表刻印">
                                表: {sem.drugIdData.imprintFront || sem.drugIdData.imprintCode}
                              </span>
                              {sem.drugIdData.imprintBack && (
                                <span className="bg-slate-900 border border-teal-600 text-teal-400 font-mono font-bold text-xs px-1.5 py-0.5 rounded" title="裏刻印">
                                  裏: {sem.drugIdData.imprintBack}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenPackagePdf(sem.drugIdData?.pdfPath)}
                                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-bold text-sky-400 rounded cursor-pointer flex items-center gap-1 transition-colors"
                                title="添付文書原本PDFを開く"
                              >
                                <FileText className="w-2.5 h-2.5 text-sky-400" />
                                <span>添付文書PDF</span>
                              </button>
                              <span className="text-[11px] text-teal-300 font-medium">{sem.drugIdData.colorAndShape}</span>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-200 bg-slate-900/70 p-2 rounded border border-slate-800 flex justify-between">
                            <span>標準用法: {sem.drugIdData.standardDose}</span>
                            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">添付文書: {sem.drugIdData.sdFilePath}</span>
                          </div>
                        </div>
                      )}

                      {/* 臨床スコアリング詳細 */}
                      {sem.scoreData && (
                        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5 text-xs space-y-1.5">
                          <div className="flex items-center gap-1 text-amber-200 font-bold text-[11px]">
                            <Calculator className="w-3.5 h-3.5 text-amber-400" />
                            <span>計算式・判定項目:</span>
                            <span className="text-slate-300 font-mono font-medium">{sem.scoreData.calculationFormula}</span>
                          </div>
                          <div className="text-[11px] text-slate-200 bg-slate-900/70 p-2 rounded border border-slate-800 space-y-0.5">
                            <div><span className="font-bold text-amber-300">リスク判定:</span> {sem.scoreData.riskEvaluation}</div>
                            <div><span className="font-bold text-emerald-400">推奨アクション:</span> {sem.scoreData.clinicalAction}</div>
                          </div>
                        </div>
                      )}

                      {/* 腎機能減量カットオフテーブル表示 */}
                      {item.type === 'renal' && item.renalData && (
                        <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-2.5 text-xs space-y-1">
                          <div className="font-bold text-amber-300 text-[11px] flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                            <span>eGFR / CrCl 減量基準</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
                            {item.renalData.cutoffs.map((cutoff, cidx) => (
                              <div key={cidx} className="bg-slate-900 px-2 py-1 border border-slate-800 rounded flex justify-between">
                                <span className="font-bold text-slate-300">{cutoff.range}</span>
                                <span className="text-rose-400 font-semibold">{cutoff.dose}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 本文 (推奨・注意・臨床的意義・要件) */}
                      <div className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                        {item.content}
                      </div>

                      {/* 追加情報 (カルテ定型文 / 実践Tips / パニック値) */}
                      {item.extraInfo && (
                        <div className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
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
            <div className="border-t md:border-t-0 md:border-l border-slate-800 flex-1 flex flex-col bg-[#0F172A] overflow-hidden">
              <div className="p-3 bg-[#1E293B] text-slate-100 flex items-center justify-between text-xs font-bold border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-amber-400" />
                  <span className="text-white">ローカルWebLLM 臨床意思決定支援 (RAG)</span>
                </div>
                <button
                  onClick={() => setActiveMindsItem(null)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 text-amber-400" />
                  <span>戻る</span>
                </button>
              </div>

              <div className="p-3 border-b border-slate-800 bg-[#1E293B]/70 space-y-1">
                <div className="text-xs font-bold text-white">
                  {activeMindsItem.diseaseName} CQ{activeMindsItem.cqNum}
                </div>
                <div className="text-[11px] text-slate-300">
                  {activeMindsItem.cqTitle}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {activeMindsItem.detail.guidelineTitle} ({activeMindsItem.detail.society})
                </div>
              </div>

              {/* 推論ストリーミング表示 */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs font-sans">
                {isLlmGenerating && !llmStreamingOutput && (
                  <div className="p-4 text-center space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-sky-400" />
                    <p className="font-bold text-slate-200">WebGPU ローカルLLMがカルテとガイドラインを推論中...</p>
                    <p className="text-[11px] text-slate-400">外部送信なし・ブラウザ内完結の超安全オフライン推論</p>
                  </div>
                )}

                {llmError && (
                  <div className="p-3 bg-rose-950/40 border border-rose-600/50 text-rose-300 text-xs rounded-xl space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>推論エラー</span>
                    </div>
                    <div>{llmError}</div>
                  </div>
                )}

                {llmStreamingOutput && (
                  <div className="space-y-2">
                    <div className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>ガイドライン準拠の臨床推論アドバイス:</span>
                    </div>
                    <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs leading-relaxed whitespace-pre-wrap text-slate-100">
                      {llmStreamingOutput}
                    </div>
                  </div>
                )}
              </div>

              {/* 下部アクションバー */}
              {llmStreamingOutput && (
                <div className="p-2.5 bg-[#1E293B] border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleConsultWebLlm(activeMindsItem)}
                    disabled={isLlmGenerating}
                    className="px-3 py-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    再推論
                  </button>
                  <button
                    onClick={() => {
                      const textToInsert = `\n【Minds臨床方針 ${activeMindsItem.diseaseName}】\n${llmStreamingOutput}\n`;
                      handleInsert(textToInsert, 'webllm-result');
                    }}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-md flex items-center gap-1 cursor-pointer transition-colors"
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
        <div className="p-3 bg-[#1E293B] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2 truncate pr-2">
            <span className="truncate">収録: 32GB MicroSD (29.8GB) 10大医療ポートフォリオ / カルテ全体100%連動・完全オフライン医療知識均てん化エンジン</span>
          </div>
          <button
            onClick={handleClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
            <span>メイン画面へ戻る</span>
          </button>
        </div>
      </div>

      {/* 臨床アトラス 1024px 大判プレビュー ＆ ECG方眼紙グリッド測定モーダル */}
      {selectedAtlas && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in">
          <div className="bg-[#0F172A] border border-slate-700/80 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
            {/* ヘッダー */}
            <div className="bg-[#1E293B] border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => { playMacBeep(); setSelectedAtlas(null); }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>戻る</span>
                </button>
                <span className="font-bold text-xs sm:text-sm text-white truncate">
                  📈 {selectedAtlas.title} ({selectedAtlas.category})
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(selectedAtlas.hasEcgGrid || selectedAtlas.category === '心電図') && (
                  <button
                    type="button"
                    onClick={() => { playMacBeep(); setEcgGridEnabled(!ecgGridEnabled); }}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                      ecgGridEnabled
                        ? 'bg-rose-600 text-white border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="標準ECG記録紙仕様の 1mm/5mm 方眼紙グリッドをオーバーレイ表示"
                  >
                    <Grid className="w-3 h-3" />
                    <span>{ecgGridEnabled ? '方眼紙 ON' : '方眼紙 OFF'}</span>
                  </button>
                )}
                <button
                  onClick={() => { playMacBeep(); setSelectedAtlas(null); }}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 画像表示エリア (ECGグリッド重畳) */}
            <div className="relative bg-slate-950 flex items-center justify-center overflow-hidden min-h-[260px] max-h-[50vh] sm:max-h-[55vh]">
              {isLoadingHighRes ? (
                <div className="p-8 text-center text-white space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400" />
                  <p className="text-xs font-bold text-slate-300">高解像度アトラス読み込み中...</p>
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
                <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-rose-300 font-mono text-[10px] px-2 py-0.5 rounded border border-rose-500/50 backdrop-blur-xs">
                  25mm/s (1小マス=0.04s, 1大マス=0.20s) | 10mm/mV (1小マス=0.1mV)
                </div>
              )}
            </div>

            {/* 所見・鑑別・臨床的意義 */}
            <div className="p-3.5 bg-[#0F172A] space-y-2.5 text-xs font-sans overflow-y-auto max-h-[30vh]">
              <div className="bg-[#1E293B] p-3 rounded-xl border border-slate-800 space-y-1">
                <div className="font-bold text-amber-400 flex items-center justify-between text-xs">
                  <span>典型所見 (Typical Findings):</span>
                  <span className="font-mono text-[10px] text-slate-400">{selectedAtlas.sdFilePath}</span>
                </div>
                <div className="text-slate-200 leading-relaxed">{selectedAtlas.typicalFeatures}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-[#1E293B] p-2.5 rounded-xl border border-slate-800">
                  <span className="font-bold text-rose-400 block mb-0.5">鑑別診断:</span>
                  <span className="text-slate-300 leading-relaxed">{selectedAtlas.differentialDiagnosis}</span>
                </div>
                <div className="bg-[#1E293B] p-2.5 rounded-xl border border-slate-800">
                  <span className="font-bold text-sky-400 block mb-0.5">臨床的意義・対応方針:</span>
                  <span className="text-slate-300 leading-relaxed">{selectedAtlas.clinicalSignificance}</span>
                </div>
              </div>
            </div>

            {/* フッターアクションバー */}
            <div className="p-3 bg-[#1E293B] border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const text = bleMedicalIndexService.formatAtlasForMedicalRecord(selectedAtlas);
                  navigator.clipboard.writeText(text);
                  playMacBeep();
                }}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>所見コピー</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { playMacBeep(); setSelectedAtlas(null); }}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>一覧へ戻る</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = bleMedicalIndexService.formatAtlasForMedicalRecord(selectedAtlas);
                    handleInsert(text, selectedAtlas.id);
                    setSelectedAtlas(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-[0_0_12px_rgba(245,158,11,0.3)] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>カルテ所見に反映</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 【隠し機能】3省2ガイドライン完全準拠 エアギャップ(物理ネット遮断) Wi-Fi SoftAP オンプレミス直結モード */}
      {showApGuide && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in">
          <div className="bg-[#0F172A] border border-emerald-500/60 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden font-sans text-slate-100">
            <div className="bg-[#1E293B] border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>【隠し機能】3省2ガイドライン準拠 エアギャップ遮断モード</span>
              </div>
              <button
                onClick={() => { playMacBeep(); setShowApGuide(false); }}
                className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 flex items-center gap-1 text-xs font-bold cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3 text-amber-400" />
                <span>戻る</span>
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs leading-relaxed">
              <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-3 space-y-1.5">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5 text-xs">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>なぜ「あえて」T-Dongle-S3のWi-Fiに接続するのか？（3省2ガイドライン完全準拠の証明）</span>
                </div>
                <p className="text-slate-200 text-[11px] leading-relaxed">
                  厚生労働省・経済産業省・総務省の<strong>「医療情報システムの安全管理に関するガイドライン（3省2ガイドライン）」</strong>では、患者の医療情報（PHI）が外部インターネットへ漏洩することを厳格に禁じています。
                  あえてスマホやPCのWi-Fi接続先をT-Dongle-S3内蔵のクローズドAPに切り替えることで、<strong>外部インターネット回線から物理的に完全遮断（エアギャップ隔離）された100%オフライン・オンプレミス環境</strong>が構築されます。
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-700 rounded-xl p-3 space-y-1.5 font-mono text-[11px]">
                <div className="text-[10px] font-sans font-bold text-slate-400 mb-1">
                  ▼ オンプレミス閉域網（T-Dongle-S3 内蔵 Wi-Fi SoftAP）接続情報
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">閉域網 SSID:</span>
                  <span className="font-bold text-emerald-300 bg-slate-950 px-2 py-0.5 rounded border border-emerald-700/60">Drdonguri-Atlas-Direct</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">WPA2 パスワード:</span>
                  <span className="font-bold text-emerald-300 bg-slate-950 px-2 py-0.5 rounded border border-emerald-700/60">drdonguri</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">オンプレミスIP (外部ルーティング無):</span>
                  <span className="font-bold text-emerald-300">192.168.4.1 (Port 80)</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                  <span className="text-slate-400">現在のエアギャップ状態:</span>
                  <span className={`font-bold ${apStatus.isConnected ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {apStatus.isConnected
                      ? `✅ 物理ネット遮断・SoftAP直結中 (${apStatus.latencyMs ? `${apStatus.latencyMs}ms` : '192.168.4.1'})`
                      : '🛡️ ローカルキャッシュ＆BLEオフライン稼働中（日常運用モード）'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <span className="font-bold text-amber-300 block">💡 日常診療での運用について（Wi-Fi切替不要設計）:</span>
                <p className="text-slate-300 leading-normal">
                  日常の診察ごとにWi-Fi設定を切り替える手順は煩雑なため、通常は<strong>Wi-Fiを切り替えなくてもPWA内蔵インデックス＆BLE通信のみで全機能が100%オフライン動作</strong>します。病院の情報システム監査時や、32GB MicroSD内の非圧縮RAW原本に直接アクセスしたい場合のみ、この隠し機能をご活用ください。
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleCheckAp}
                  disabled={isCheckingAp}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/60 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingAp ? 'animate-spin' : ''}`} />
                  <span>オンプレミス疎通確認</span>
                </button>
                <button
                  type="button"
                  onClick={() => { playMacBeep(); setShowApGuide(false); }}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 cursor-pointer transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
