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
  consultGuidelineWithWebLLM,
  ModelLoadProgress,
} from '../services/webLlmService';
import { playMacBeep, playSosumi } from '../utils/macAudio';

interface MedicalDataSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onInsertText: (text: string) => void;
  initialQuery?: string;
}

type TabFilterType = 'all' | 'minds' | 'lab' | 'proc' | 'renal' | 'drug' | 'disease';

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

  // 検索結果 (インクリメンタル)
  const searchResults = useMemo(() => {
    if (!query.trim()) {
      // クエリが空の場合は代表的な実用データを初期表示
      return searchUnifiedMedicalKnowledge('急性', filterType as any, 20);
    }
    return searchUnifiedMedicalKnowledge(query, filterType as any, 35);
  }, [query, filterType]);

  // コピー処理
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    playMacBeep();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // カルテ挿入テキストの生成
  const getInsertText = (item: UnifiedMedicalSearchResult): string => {
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
          <div className="text-[10px] text-gray-600 hidden sm:block">
            Flash / SDカード・PWA共通ナレッジマスター (v2.3.0)
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
              { label: 'HbA1c', q: 'HbA1c' },
              { label: 'eGFR', q: 'eGFR' },
              { label: 'BNP/心不全', q: 'BNP' },
              { label: '生活習慣病管理料', q: '生活習慣病管理料' },
              { label: '特定疾患', q: '特定疾患' },
              { label: 'DOAC減量', q: 'エリキュース' },
              { label: 'メトホルミン腎', q: 'メトホルミン' },
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
              <span>Minds (111疾患)</span>
            </button>
            <button
              onClick={() => { playMacBeep(); setFilterType('drug'); }}
              className={`px-2 py-1 border border-black font-bold whitespace-nowrap cursor-pointer shadow-[1px_1px_0_#000] flex items-center gap-1 ${
                filterType === 'drug' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
              }`}
            >
              <Pill className="w-3 h-3 text-sky-600" />
              <span>処方薬</span>
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
          </div>
        </div>

        {/* メインコンテンツエリア (検索結果一覧 ＆ WebLLM相談パネル) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* 左側: 検索結果リスト */}
          <div className={`flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5 ${activeMindsItem ? 'md:max-w-[55%]' : 'w-full'}`}>
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-gray-500 font-sans text-xs space-y-2">
                <Search className="w-8 h-8 mx-auto text-gray-400 stroke-1" />
                <p className="font-bold">一致する臨床データが見つかりませんでした</p>
                <p className="text-[11px]">検査項目（「HbA1c」「eGFR」）、指導管理料（「生活習慣病」）、腎機能減量（「DOAC」「メトホルミン」）等でお試しください。</p>
              </div>
            ) : (
              searchResults.map((item, idx) => {
                const uniqueKey = `${item.type}-${idx}`;
                const isItemCopied = copiedId === uniqueKey;
                const isItemInserted = insertedId === uniqueKey;
                const insertText = getInsertText(item);

                // アイテムごとのカラー設定
                let badgeStyle = 'bg-gray-100 text-gray-900';
                let badgeLabel = '情報';
                if (item.type === 'lab') {
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
            <span>収録: Minds 111CQ / 臨床検査値 / 診療行為・指導料 / 腎機能減量 / 医薬品 / 傷病名</span>
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
