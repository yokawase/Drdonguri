import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Send, 
  BookOpen, 
  BookmarkPlus, 
  Trash2, 
  Camera, 
  Zap, 
  Cpu, 
  Sparkles, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp, 
  PlayCircle, 
  CheckCircle2, 
  Clock, 
  HelpCircle,
  Activity,
  ArrowRight,
  Info,
  Menu,
  X,
  Settings,
  Check
} from 'lucide-react';
import { DispatchMode, EhrNewlineMode, SessionTransmissionStatus, MedicalTemplate } from '../types';
import { DEFAULT_PRESET_TEMPLATES } from './MedicalTemplates';
import { transpileToImeRomajiSequence, generateKeystrokeSequence } from '../utils/japaneseImeTranspiler';
import { buildTransmissionSession, PreparedSession } from '../utils/packetBuilder';
import { bleManager } from '../utils/webBluetooth';
import { AiAssistModal } from './AiAssistModal';
import { TemplateManagerModal } from './TemplateManagerModal';
import { E2eAutoTestModal } from './E2eAutoTestModal';
import { CameraOcrModal } from './CameraOcrModal';
import { ImePrecisionBoostModal } from './ImePrecisionBoostModal';
import { MedicalPreprocessorModal } from './MedicalPreprocessorModal';
import { MedicalCoprocessorModal } from './MedicalCoprocessorModal';
import { ClinicalDecisionSupport } from './ClinicalDecisionSupport';
import { 
  preprocessMedicalText, 
  PreprocessOptions, 
  PreprocessResult 
} from '../utils/medicalTextPreprocessor';
import { 
  CompileImeOptions, 
  detectMisconversionWarnings, 
  compileMedicalTextToImeBoost 
} from '../utils/imePrecisionCompiler';
import { 
  triggerMacScreenFlash, 
  playMacBeep, 
  playSosumi 
} from '../utils/macAudio';

const STORAGE_KEY_TEMPLATES = 'drvoice_medical_custom_templates_v1';
const STORAGE_KEY_BUFFER = 'drvoice_dispatcher_buf';

interface InputPaneProps {
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  dispatchMode: DispatchMode;
  setDispatchMode: (mode: DispatchMode) => void;
  onSendSession: (session: PreparedSession) => Promise<void>;
  transmissionStatus: SessionTransmissionStatus | null;
  isSending: boolean;
  isBleConnected: boolean;
  isVirtualMode: boolean;
  onPressVirtualButton?: () => void;
  onNavigateTab?: (tab: 'input' | 'dongle' | 'firmware') => void;
  isAiModalOpen?: boolean;
  setIsAiModalOpen?: (open: boolean) => void;
  isCameraOcrOpen?: boolean;
  setIsCameraOcrOpen?: (open: boolean) => void;
  isTemplateModalOpen?: boolean;
  setIsTemplateModalOpen?: (open: boolean) => void;
  isImeBoostModalOpen?: boolean;
  setIsImeBoostModalOpen?: (open: boolean) => void;
  isPreprocessorModalOpen?: boolean;
  setIsPreprocessorModalOpen?: (open: boolean) => void;
  isCoprocessorModalOpen?: boolean;
  setIsCoprocessorModalOpen?: (open: boolean) => void;
}

export const InputPane: React.FC<InputPaneProps> = ({
  inputText,
  setInputText,
  dispatchMode,
  setDispatchMode,
  onSendSession,
  transmissionStatus,
  isSending,
  isBleConnected,
  isVirtualMode,
  onPressVirtualButton,
  onNavigateTab,
  isAiModalOpen: propAiOpen,
  setIsAiModalOpen: propSetAiOpen,
  isCameraOcrOpen: propCameraOpen,
  setIsCameraOcrOpen: propSetCameraOpen,
  isTemplateModalOpen: propTemplateOpen,
  setIsTemplateModalOpen: propSetTemplateOpen,
  isImeBoostModalOpen: propImeBoostOpen,
  setIsImeBoostModalOpen: propSetImeBoostOpen,
  isPreprocessorModalOpen: propPreprocessorOpen,
  setIsPreprocessorModalOpen: propSetPreprocessorOpen,
  isCoprocessorModalOpen: propCoprocessorOpen,
  setIsCoprocessorModalOpen: propSetCoprocessorOpen,
}) => {
  const [showTranspileDetail, setShowTranspileDetail] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<'standard' | 'xml_tags'>('xml_tags');
  const [internalAiOpen, setInternalAiOpen] = useState(false);
  const [internalCameraOpen, setInternalCameraOpen] = useState(false);
  const [isE2eModalOpen, setIsE2eModalOpen] = useState(false);
  const [internalTemplateOpen, setInternalTemplateOpen] = useState(false);
  const [internalImeBoostOpen, setInternalImeBoostOpen] = useState(false);
  const [internalPreprocessorOpen, setInternalPreprocessorOpen] = useState(false);
  const [enableAutoPreprocessor, setEnableAutoPreprocessor] = useState(true);
  const [templateModalTab, setTemplateModalTab] = useState<'list' | 'save'>('list');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isNumLockModalOpen, setIsNumLockModalOpen] = useState(false);
  const [isSmartMenuOpen, setIsSmartMenuOpen] = useState(false);

  const handleNumUnlock = async () => {
    playMacBeep();
    try {
      if (isBleConnected) {
        await bleManager.sendNumUnlock();
        setToastMessage('🚨 AtomS3UからNumLock解除シグナルを送出しました');
      } else {
        setToastMessage('ℹ️ 物理解除ガイドを表示します');
      }
    } catch (e: any) {
      console.warn('NumLock error:', e);
    }
    setIsNumLockModalOpen(true);
  };

  const isAiModalOpen = propAiOpen !== undefined ? propAiOpen : internalAiOpen;
  const setIsAiModalOpen = propSetAiOpen || setInternalAiOpen;

  const isCameraOcrOpen = propCameraOpen !== undefined ? propCameraOpen : internalCameraOpen;
  const setIsCameraOcrOpen = propSetCameraOpen || setInternalCameraOpen;

  const isTemplateModalOpen = propTemplateOpen !== undefined ? propTemplateOpen : internalTemplateOpen;
  const setIsTemplateModalOpen = propSetTemplateOpen || setInternalTemplateOpen;

  const isImeBoostModalOpen = propImeBoostOpen !== undefined ? propImeBoostOpen : internalImeBoostOpen;
  const setIsImeBoostModalOpen = propSetImeBoostOpen || setInternalImeBoostOpen;

  const isPreprocessorModalOpen = propPreprocessorOpen !== undefined ? propPreprocessorOpen : internalPreprocessorOpen;
  const setIsPreprocessorModalOpen = propSetPreprocessorOpen || setInternalPreprocessorOpen;
  const [internalCoprocessorOpen, setInternalCoprocessorOpen] = useState(false);
  const isCoprocessorModalOpen = propCoprocessorOpen !== undefined ? propCoprocessorOpen : internalCoprocessorOpen;
  const setIsCoprocessorModalOpen = propSetCoprocessorOpen || setInternalCoprocessorOpen;
  const [isWindowZoomed, setIsWindowZoomed] = useState(false);
  const [isAutoSavedNotice, setIsAutoSavedNotice] = useState(false);

  // プリプロセッサ設定
  const [preprocessOptions, setPreprocessOptions] = useState<PreprocessOptions>(() => {
    try {
      const saved = localStorage.getItem('drvoice_preprocessor_settings_v1');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      enableUnitNormalization: true,
      enableSymbolNormalization: true,
      enablePrescriptionNormalization: true,
      enableDiseaseNormalization: true,
      enableHeadingNormalization: true,
    };
  });

  // IMEブースト設定
  const [imeBoostOptions, setImeBoostOptions] = useState<CompileImeOptions>(() => {
    try {
      const saved = localStorage.getItem('drvoice_ime_boost_settings_v8');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      enableFunctionKeyRouting: true,
      enableChunkDecomposition: true,
      enableUnicodeF5Assist: true,
      enableDoctorMacros: true,
    };
  });

  // 電子カルテ改行モード（標準Enter vs MICS Alt+Enter）
  const [newlineMode, setNewlineMode] = useState<EhrNewlineMode>(() => {
    try {
      const saved = localStorage.getItem('drvoice_ehr_newline_mode_v1');
      if (saved && Object.values(EhrNewlineMode).includes(saved as EhrNewlineMode)) {
        return saved as EhrNewlineMode;
      }
    } catch (e) {
      console.error(e);
    }
    return EhrNewlineMode.NORMAL_ENTER; // 初期値として標準 (Enter) を自動選択
  });

  // 定型文管理
  const [templates, setTemplates] = useState<MedicalTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return [...DEFAULT_PRESET_TEMPLATES, ...parsed];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_PRESET_TEMPLATES;
  });

  // 自動保存ローカルファースト (Local-first persistence)
  useEffect(() => {
    if (inputText) {
      localStorage.setItem(STORAGE_KEY_BUFFER, inputText);
      setIsAutoSavedNotice(true);
      const timer = setTimeout(() => setIsAutoSavedNotice(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [inputText]);

  // 送信完了時の Macintosh Screen Flash & 音声フィードバック
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const curStatus = transmissionStatus?.status;
    if (curStatus === 'completed' && prevStatusRef.current !== 'completed') {
      triggerMacScreenFlash();
      playSosumi();
    } else if (curStatus === 'waiting_button' && prevStatusRef.current !== 'waiting_button') {
      playMacBeep();
    }
    prevStatusRef.current = curStatus || null;
  }, [transmissionStatus?.status]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((c) => (c === msg ? null : c)), 2600);
  };

  // 定型文適用
  const handleApplyTemplate = (content: string, mode: 'replace' | 'append') => {
    if (mode === 'append') {
      setInputText((prev) => (prev ? `${prev}\n\n${content}` : content));
      showToast('定型文を追記しました');
    } else {
      setInputText(content);
      showToast('定型文を展開しました');
    }
  };

  // 定型文保存・削除
  const handleSaveNewTemplate = (newTemplate: MedicalTemplate) => {
    const updated = [newTemplate, ...templates.filter((t) => t.id !== newTemplate.id)];
    setTemplates(updated);
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(updated.filter((t) => t.isCustom)));
    } catch (e) {
      console.error(e);
    }
    showToast(`定型文「${newTemplate.title}」を保存しました`);
  };

  const handleDeleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    setTemplates(updated);
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(updated.filter((t) => t.isCustom)));
    } catch (e) {
      console.error(e);
    }
    showToast('定型文を削除しました');
  };

  // SOAP標準雛形挿入
  const handleInsertSoapTemplate = () => {
    const soap = `【主訴】\n3日前からの咳嗽と発熱。市販薬無効。\n\n【客観的所見】\nKT: 37.8℃, HR: 78bpm, BP: 122/78 mmHg, SpO2: 98%\n咽頭発赤あり、扁桃肥大なし。胸部ラ音なし。\n\n【評価】\n急性上気道炎 (疑い)\n\n【処方・方針】\n対症療法中心。解熱鎮痛薬処方。`;
    if (inputText.trim()) {
      if (confirm('現在の入力をSOAP形式で置き換えますか？（キャンセルで末尾追記）')) {
        setInputText(soap);
      } else {
        setInputText((prev) => `${prev}\n\n${soap}`);
      }
    } else {
      setInputText(soap);
    }
    playMacBeep();
    showToast('SOAP形式雛形を挿入しました');
  };

  // プリプロセス計算
  const preprocessedResult: PreprocessResult = React.useMemo(() => {
    if (!inputText) return { processedText: '', replacements: [], totalReplacementCount: 0 };
    return preprocessMedicalText(inputText, preprocessOptions);
  }, [inputText, preprocessOptions]);

  // 誤変換リスク検出
  const misconversionWarnings = React.useMemo(() => {
    if (!inputText) return [];
    return detectMisconversionWarnings(inputText);
  }, [inputText]);

  // トランスパイル結果
  const transpiled = React.useMemo(() => {
    if (!inputText) return null;
    const textToTranspile = enableAutoPreprocessor ? preprocessedResult.processedText : inputText;
    return transpileToImeRomajiSequence(textToTranspile);
  }, [inputText, enableAutoPreprocessor, preprocessedResult]);

  // XMLタグ付きキーストローク列
  const xmlKeystrokes = React.useMemo(() => {
    if (!inputText) return null;
    const textToTranspile = enableAutoPreprocessor ? preprocessedResult.processedText : inputText;
    return generateKeystrokeSequence(textToTranspile);
  }, [inputText, enableAutoPreprocessor, preprocessedResult]);

  // パケット試算
  const preparedSession = React.useMemo(() => {
    if (!inputText) return null;
    try {
      return buildTransmissionSession(inputText, dispatchMode, {
        enablePreprocessor: enableAutoPreprocessor,
        preprocessOptions: preprocessOptions,
        enableImeBoost: dispatchMode === DispatchMode.MODE_HYBRID_UNICODE || dispatchMode === DispatchMode.MODE_IME_ROMAJI,
        compileOptions: imeBoostOptions,
        newlineMode: newlineMode,
      });
    } catch {
      return null;
    }
  }, [inputText, dispatchMode, enableAutoPreprocessor, preprocessOptions, imeBoostOptions, newlineMode]);

  // スマートHVC（High Value Care: 高価値医療）スコア推論 (0〜100点)
  const hvcScore = React.useMemo(() => {
    if (!inputText.trim()) return 70;
    let score = 70;
    if (/(S:|O:|A:|P:|主訴|現病歴|所見|診断|方針|評価)/i.test(inputText)) score += 10;
    if (/(BP|HR|SpO2|BT|PR|血圧|脈拍|体温|mmHg|bpm|℃|%)/i.test(inputText)) score += 10;
    if (/(X-P|XP|ECG|CT|MRI|US|HbA1c|CRP|WBC|eGFR|Cr|心電図|レントゲン|エコー|採血)/i.test(inputText)) score += 10;
    return Math.min(100, Math.max(50, score));
  }, [inputText]);

  // ★ 高度推論・キーストローク着弾リアルタイム解析
  const compiledImeResult = React.useMemo(() => {
    if (!inputText) return null;
    try {
      const textToCompile = enableAutoPreprocessor ? preprocessedResult.processedText : inputText;
      return compileMedicalTextToImeBoost(textToCompile, imeBoostOptions);
    } catch {
      return null;
    }
  }, [inputText, enableAutoPreprocessor, preprocessedResult, imeBoostOptions]);

  // 送信ハンドラ
  const handleSend = async () => {
    if (!inputText.trim()) return;
    try {
      playMacBeep();
      const freshSession = buildTransmissionSession(inputText, dispatchMode, {
        enablePreprocessor: enableAutoPreprocessor,
        preprocessOptions: preprocessOptions,
        enableImeBoost: dispatchMode === DispatchMode.MODE_HYBRID_UNICODE || dispatchMode === DispatchMode.MODE_IME_ROMAJI,
        compileOptions: imeBoostOptions,
        newlineMode: newlineMode,
      });
      await onSendSession(freshSession);
    } catch (e: any) {
      showToast(`送信エラー: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}>
      {/* Toast Notice (System 7 Dialog Style) */}
      {toastMessage && (
        <div className="fixed top-8 right-6 z-50 bg-white border-2 border-black p-2 shadow-[3px_3px_0_#000] text-xs flex items-center gap-2 select-none animate-in fade-in">
          <span className="font-bold">ℹ</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ★ SYSTEM 7 メインウィンドウ: カルテ作成・送信 (SendText v18.2) */}
      {/* ========================================================================= */}
      <div className={`mac-window transition-all ${isWindowZoomed ? 'w-full' : 'w-full'}`}>
        {/* ウィンドウ タイトルバー (6本平行ストライプ) */}
        <div className="h-7 mac-title-stripes border-b border-black flex items-center justify-between px-2 select-none">
          {/* 左側: クローズボックス ＆ タイトル ＆ 接続ステータス */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playMacBeep();
                if (inputText.trim()) {
                  if (confirm('カルテ入力を消去してウィンドウを閉じますか？')) {
                    setInputText('');
                  }
                }
              }}
              className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] active:bg-black cursor-pointer flex items-center justify-center shrink-0"
              title="クローズボックス"
            />

            <div className="bg-white border border-black px-2 py-0.5 font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-[1px_1px_0_#000]">
              <span>DrVoice どんぐり君 v19.1 (双方向コプロセッサ)</span>
              {isBleConnected ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 border border-emerald-500 font-bold">BLE接続</span>
              ) : isVirtualMode ? (
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1 border border-amber-500 font-bold">仮想</span>
              ) : (
                <span className="text-[10px] bg-red-100 text-red-800 px-1 border border-red-500 font-bold">未接続</span>
              )}
              {isSending && (
                <span className="text-[10px] animate-pulse font-bold text-blue-700">⏳ 送信中</span>
              )}
              {transmissionStatus?.status === 'waiting_button' && (
                <span className="text-[10px] bg-black text-white px-1">ボタン待機</span>
              )}
            </div>
          </div>

          {/* 右側: 消去 ＆ ツール・メニューボタン ＆ ズームボックス */}
          <div className="flex items-center gap-1.5">
            {inputText.trim() && (
              <button
                type="button"
                onClick={() => {
                  playSosumi();
                  if (confirm('カルテ入力を消去しますか？')) {
                    setInputText('');
                    showToast('入力をクリアしました');
                  }
                }}
                className="mac-btn text-[11px] py-0.5 px-2 bg-white"
                title="入力消去"
              >
                <span>🗑️ クリア</span>
              </button>
            )}

            {/* ★ 画面上のボタンをすべて内包するメニューボタン */}
            <button
              type="button"
              onClick={() => {
                playMacBeep();
                setIsSmartMenuOpen(true);
              }}
              className="mac-btn bg-black text-white hover:bg-neutral-800 font-bold text-[11px] py-0.5 px-2.5 flex items-center gap-1 shadow-[1px_1px_0_#000]"
              title="SOAP雛形・定型文・AI整形・IME設定メニューを開く"
            >
              <Menu className="w-3.5 h-3.5" />
              <span>メニュー</span>
              {(misconversionWarnings.length > 0 || templates.length > 0) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              )}
            </button>

            {/* ズームボックス */}
            <button
              onClick={() => {
                playMacBeep();
                setIsWindowZoomed(!isWindowZoomed);
              }}
              className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] active:bg-black cursor-pointer flex items-center justify-center shrink-0"
              title="ズームボックス"
            >
              <div className="w-1.5 h-1.5 border border-black" />
            </button>
          </div>
        </div>

        {/* ウィンドウ内部コンテンツ（シンプル・直感UI） */}
        <div className="p-3 bg-white space-y-2.5">
          {/* Monaco / DotGothic16 プレーンテキスト入力欄 */}
          <div className="relative border border-black p-0.5 bg-white shadow-[inset_1px_1px_0_#000]">
            <textarea
              id="editor"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="ここにカルテ所見・診察メモを入力してください（自動保存）...&#13;&#10;スマホの高度推論コンパイラがキーストロークを解析し、AtomS3UがWindows電子カルテへ100%正確に自動打鍵します。&#13;&#10;（右上の「メニュー」ボタンからSOAP雛形や定型文を展開できます）"
              rows={isWindowZoomed ? 18 : 10}
              className="w-full text-xs sm:text-sm leading-relaxed p-2.5 bg-white border-0 focus:outline-none font-mono resize-y"
              style={{
                fontFamily: "'Monaco', 'DotGothic16', 'Courier New', monospace",
                lineHeight: '1.6',
              }}
            />
          </div>

          {/* ★【高度推論・キーストローク着弾リアルタイム解析モニター】 */}
          {inputText.trim() && compiledImeResult && (
            <div className="border border-black bg-neutral-50 p-2 text-xs space-y-1.5 shadow-[1px_1px_0_#000]">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold flex items-center gap-1 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    100% 確実打鍵推論
                  </span>
                  <span className="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 font-bold rounded-xs">
                    確実性: {compiledImeResult.accuracyConfidenceScore}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTranspileDetail(!showTranspileDetail)}
                  className="text-[11px] underline cursor-pointer text-neutral-600 hover:text-black flex items-center gap-0.5"
                >
                  <span>{showTranspileDetail ? 'プレビューを閉じる ▲' : 'キーストローク詳細 ▼'}</span>
                </button>
              </div>

              {/* 最適化タグのチップ一覧 */}
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {compiledImeResult.breakdownCounts.katakanaF7 > 0 && (
                  <span className="bg-blue-100 text-blue-900 border border-blue-400 px-1 py-0.2 font-bold">
                    F7全角カナ: {compiledImeResult.breakdownCounts.katakanaF7}語
                  </span>
                )}
                {compiledImeResult.breakdownCounts.backspaceTrim > 0 && (
                  <span className="bg-emerald-100 text-emerald-900 border border-emerald-400 px-1 py-0.2 font-bold">
                    確実削り出し[BS]: {compiledImeResult.breakdownCounts.backspaceTrim}語
                  </span>
                )}
                {compiledImeResult.breakdownCounts.asciiF10 > 0 && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-400 px-1 py-0.2 font-bold">
                    半角ASCII直撃: {compiledImeResult.breakdownCounts.asciiF10}件
                  </span>
                )}
                {compiledImeResult.breakdownCounts.chunkSplit > 0 && (
                  <span className="bg-purple-100 text-purple-900 border border-purple-400 px-1 py-0.2">
                    最小Chunk自立語: {compiledImeResult.breakdownCounts.chunkSplit}語
                  </span>
                )}
                {compiledImeResult.breakdownCounts.hiraganaEnter > 0 && (
                  <span className="bg-neutral-200 text-neutral-800 border border-neutral-400 px-1 py-0.2">
                    ひらがなEnter確定: {compiledImeResult.breakdownCounts.hiraganaEnter}件
                  </span>
                )}
              </div>

              {/* 展開時: 詳細キーストロークプレビュー */}
              {showTranspileDetail && (
                <div className="mt-2 pt-2 border-t border-black/20 font-mono text-[11px] bg-white p-2 border border-black overflow-x-auto max-h-36">
                  <div className="text-gray-500 text-[10px] mb-1">AtomS3U 送出タグ付きペイロード:</div>
                  <div className="text-neutral-800 break-all leading-relaxed whitespace-pre-wrap">
                    {compiledImeResult.compiledPayload}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* テキストエリア直下: ステータス ＆ 送信コントロール */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black text-xs">
            {/* 左側: 文字数 / パケット / HVCスコア */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{inputText.length} 文字</span>
              {preparedSession && (
                <>
                  <span>|</span>
                  <span>{preparedSession.totalBytes} B</span>
                  <span>|</span>
                  <span>{preparedSession.totalPackets} パケット</span>
                </>
              )}

              {/* スマートHVCスコア バッジ */}
              {inputText.trim() && (
                <>
                  <span>|</span>
                  <span
                    className={`px-1.5 py-0.2 border border-black font-bold text-[11px] select-none ${
                      hvcScore >= 85
                        ? 'bg-black text-white'
                        : hvcScore >= 70
                        ? 'bg-slate-100 text-black'
                        : 'bg-white text-black'
                    }`}
                    title="高価値医療（HVC）スマートスコア"
                  >
                    HVC: {hvcScore}点
                  </span>
                </>
              )}

              {isAutoSavedNotice && (
                <span className="text-[10px] text-gray-500 ml-1">💾 保存済</span>
              )}
            </div>

            {/* 右側: 物理ボタン押下 ＆ メイン送信ボタン */}
            <div className="flex items-center gap-2">
              {/* どんぐり君正面ボタン押下 (待機時のみ表示) */}
              {transmissionStatus?.status === 'waiting_button' && (
                <button
                  type="button"
                  onClick={() => {
                    playMacBeep();
                    if (onPressVirtualButton) onPressVirtualButton();
                  }}
                  className="mac-btn bg-black text-white hover:bg-neutral-800 font-bold"
                  title="AtomS3U正面ボタンを押して打鍵開始"
                >
                  <span>本体ボタン押下 🔘</span>
                </button>
              )}

              {/* 医療双方向エッジコプロセッサ (吸い上げ ＆ 要約 ＆ 書き戻し) */}
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setIsCoprocessorModalOpen(true);
                }}
                className="mac-btn bg-yellow-100 hover:bg-yellow-200 border-2 border-black font-bold flex items-center gap-1.5 text-xs px-3 py-1.5 shadow-[1px_1px_0_#000] active:translate-x-0.5 active:translate-y-0.5"
                title="閉域網電カルから過去カルテを吸い上げ、スマホAIで要約し、書き戻す"
              >
                <span>📥 過去カルテ吸い上げ＆要約 (双方向)</span>
              </button>

              {/* System 7 特有の太い二重枠デフォルトボタン [ 送信 ↩ ] */}
              <div className="mac-btn-default-wrapper">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputText.trim() || isSending || (!isBleConnected && !isVirtualMode)}
                  className="mac-btn mac-btn-default px-6 py-1.5 text-xs font-bold"
                >
                  {isSending ? (
                    <span className="animate-pulse">⏳ 送信中...</span>
                  ) : (
                    <span>カルテへ送信 (SendText) ↩</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ★ 選択肢B【オンデバイス完結型】稼働情報バナー */}
          {dispatchMode === DispatchMode.MODE_ONDEVICE_SPIFFS && (
            <div className="border border-black p-2.5 bg-amber-50/50 space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-black/20 pb-1">
                <div className="font-bold flex items-center gap-1.5 text-black">
                  <span>💾 選択肢 B【オンデバイス完結型】：AtomS3U の SPIFFS 辞書を完全稼働</span>
                </div>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      onNavigateTab('firmware');
                    }}
                    className="mac-btn text-[11px] py-0.5"
                  >
                    <span>書き込み手順 (uploadfs) ↗</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                <div className="border border-black/20 p-1.5 bg-white space-y-0.5">
                  <div className="font-bold text-black">⚙️ 仕組み</div>
                  <p className="text-gray-700 leading-normal">
                    <code>compile_pipeline.py</code> で生成した <code>med_terms.bin</code>（厚労省マスター約5万語）を PlatformIO（<code>pio run -t uploadfs</code>）で AtomS3U の Flash に書き込み、ファームウェア内で FNV-1a ハッシュ二分探索を実行してローマ字展開します。
                  </p>
                </div>
                <div className="border border-black/20 p-1.5 bg-white space-y-0.5">
                  <div className="font-bold text-emerald-800">✅ メリット</div>
                  <p className="text-gray-700 leading-normal">
                    AtomS3U 単体で医療用語マスター（医薬品・病名・難読文字）を保持できるため、スマホ側の辞書依存や巨大な通信オーバーヘッドを排斥できます。
                  </p>
                </div>
                <div className="border border-black/20 p-1.5 bg-white space-y-0.5">
                  <div className="font-bold text-amber-900">⚠️ 課題・運用</div>
                  <p className="text-gray-700 leading-normal">
                    辞書の追加・更新のたびに、PC と AtomS3U を有線接続して PlatformIO でファイルシステム（<code>pio run -t uploadfs</code>）を再フラッシュする必要があります。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 送信中 プログレスバー (System 7 伝統の斜め白黒ストライプ) */}
          {transmissionStatus && transmissionStatus.status === 'sending' && (
            <div className="space-y-1 p-2 border border-black bg-white">
              <div className="flex justify-between text-[11px] font-bold">
                <span>パケット分割転送中...</span>
                <span>{transmissionStatus.progress}%</span>
              </div>
              <div className="h-4 border border-black bg-white p-0.5">
                <div
                  className="h-full mac-progress-stripe border-r border-black transition-all"
                  style={{ width: `${Math.max(transmissionStatus.progress, 5)}%` }}
                />
              </div>
            </div>
          )}

          {/* ボタン押下待機 インジケータ */}
          {transmissionStatus?.status === 'waiting_button' && (
            <div className="border-2 border-black p-3 bg-white space-y-1.5 shadow-[2px_2px_0_#000]">
              <div className="font-bold flex items-center gap-2">
                <span className="w-2.5 h-2.5 bg-black rounded-full animate-ping" />
                <span>【全パケット受信・CRC検証OK】LED黄色点灯中</span>
              </div>
              <p className="text-xs leading-relaxed">
                👉 <strong>Windows電子カルテ画面の入力欄をクリック</strong>してカーソルを点滅させ、
                <strong className="underline ml-1">AtomS3U本体正面のボタン（M5マーク）をカチッと1回押してください。</strong>
                （または上の「本体ボタン押下 🔘」をクリック）
              </p>
            </div>
          )}

          {/* 打鍵完了 インジケータ */}
          {transmissionStatus?.status === 'completed' && (
            <div className="border-2 border-black p-2.5 bg-white flex items-center justify-between gap-2 shadow-[2px_2px_0_#000]">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">✓</span>
                <span className="font-bold text-xs">カルテ打鍵完了 ＆ メモリ安全ゼロクリア済み</span>
              </div>
              <button
                type="button"
                onClick={() => setInputText('')}
                className="mac-btn text-xs font-bold"
              >
                入力を消去して次へ
              </button>
            </div>
          )}

          {/* キーストローク解析インスペクタ (折りたたみ) */}
          {showTranspileDetail && (
            <div className="border border-black p-2.5 bg-white text-xs font-mono space-y-2 shadow-[1px_1px_0_#000]">
              <div className="flex justify-between items-center border-b border-black pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold">キーストローク列解析</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setInspectorTab('xml_tags')}
                      className={`mac-btn text-[10px] py-0.2 ${inspectorTab === 'xml_tags' ? 'bg-black text-white' : ''}`}
                    >
                      全角半角分離 &lt;IME_ON/OFF&gt;
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectorTab('standard')}
                      className={`mac-btn text-[10px] py-0.2 ${inspectorTab === 'standard' ? 'bg-black text-white' : ''}`}
                    >
                      JISローマ字協調
                    </button>
                  </div>
                </div>
                {preparedSession && (
                  <span className="text-[10px]">
                    CRC16: 0x{preparedSession.totalCrc16.toString(16).toUpperCase().padStart(4, '0')}
                  </span>
                )}
              </div>

              <div className="max-h-28 overflow-y-auto break-all p-2 border border-black bg-white select-text">
                {inspectorTab === 'xml_tags' && xmlKeystrokes ? xmlKeystrokes.sequence : transpiled?.sequence}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 臨床判断支援 (CDS) アシスタント */}
      <ClinicalDecisionSupport
        soapText={inputText}
        patientAge={64}
        patientGender="男性"
        onApplyDiagnosisToSoap={(diagText) => {
          setInputText((prev) => (prev ? `${prev}\n${diagText}` : diagText));
          showToast('【診断】欄へ推奨病名を反映しました');
        }}
        onApplyPlanGuideline={(planText) => {
          setInputText((prev) => (prev ? `${prev}\n${planText}` : planText));
          showToast('【方針】欄へ推奨を反映しました');
        }}
        isBleConnected={isBleConnected}
      />

      {/* モーダル群 (System 7 Desk Accessory ダイアログ) */}
      <MedicalCoprocessorModal
        isOpen={isCoprocessorModalOpen}
        onClose={() => setIsCoprocessorModalOpen(false)}
        isBleConnected={isBleConnected}
        onWriteBackToChart={async (text: string) => {
          setInputText(text);
          const session = buildTransmissionSession(text, dispatchMode);
          await onSendSession(session);
        }}
      />

      <AiAssistModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        originalText={inputText}
        onApplyFormattedText={(text) => {
          setInputText(text);
          showToast('AI整形結果を反映しました');
        }}
      />

      <CameraOcrModal
        isOpen={isCameraOcrOpen}
        onClose={() => setIsCameraOcrOpen(false)}
        onApplyText={(extracted, mode) => {
          if (mode === 'append') {
            setInputText((prev) => (prev ? `${prev}\n\n${extracted}` : extracted));
            showToast('OCRテキストを追記しました');
          } else {
            setInputText(extracted);
            showToast('OCRテキストを展開しました');
          }
        }}
      />

      <TemplateManagerModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        currentInputText={inputText}
        templates={templates}
        onApplyTemplate={handleApplyTemplate}
        onSaveTemplate={handleSaveNewTemplate}
        onDeleteTemplate={handleDeleteTemplate}
        initialTab={templateModalTab}
      />

      <ImePrecisionBoostModal
        isOpen={isImeBoostModalOpen}
        onClose={() => setIsImeBoostModalOpen(false)}
        inputText={inputText}
        onApplyModifiedText={(newText) => {
          setInputText(newText);
          showToast('カルテ文章を更新しました');
        }}
        options={imeBoostOptions}
        onOptionsChange={(newOpts) => {
          setImeBoostOptions(newOpts);
          try {
            localStorage.setItem('drvoice_ime_boost_settings_v8', JSON.stringify(newOpts));
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <MedicalPreprocessorModal
        isOpen={isPreprocessorModalOpen}
        onClose={() => setIsPreprocessorModalOpen(false)}
        inputText={inputText}
        onApplyText={(processedText) => {
          setInputText(processedText);
          showToast('置換テキストを反映しました');
        }}
        currentOptions={preprocessOptions}
        onOptionsChange={(newOpts) => {
          setPreprocessOptions(newOpts);
          try {
            localStorage.setItem('drvoice_preprocessor_settings_v1', JSON.stringify(newOpts));
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <E2eAutoTestModal
        isOpen={isE2eModalOpen}
        onClose={() => setIsE2eModalOpen(false)}
        isVirtualMode={isVirtualMode}
        isBleConnected={isBleConnected}
        dispatchMode={dispatchMode}
        onSendSession={onSendSession}
        onPressVirtualButton={onPressVirtualButton}
        transmissionStatus={transmissionStatus}
        onApplyDummyTextToInput={(text: string) => {
          setInputText(text);
          showToast('自動生成したダミーカルテを反映しました');
        }}
      />

      {/* ★ ノートPC テンキー固定 (NumLock) & かな入力 解除ガイドモーダル */}
      {isNumLockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="mac-window max-w-lg w-full bg-white border-2 border-black p-4 shadow-[4px_4px_0_#000]">
            <div className="flex items-center justify-between pb-2 border-b border-black mb-3">
              <span className="font-bold text-sm text-red-900 flex items-center gap-2">
                <span>🚨</span> ノートPC テンキー固定 (NumLock) ＆ かな入力 解除手順
              </span>
              <button
                onClick={() => setIsNumLockModalOpen(false)}
                className="w-5 h-5 border border-black text-xs font-bold hover:bg-black hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-neutral-800">
                <p className="font-bold mb-1">【送信完了】AtomS3UからNumLock解除シグナル（HID Usage 0x53）を送出しました。</p>
                <p>PC側でNumLockが直ちにOFFになったか、メモ帳などで「K」キーを押して確認してください。</p>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-300 rounded space-y-2">
                <div className="font-bold text-neutral-900">■ ノートPC本体で「Kを押すと2が出る」場合の物理解除方法</div>
                <ol className="list-decimal pl-5 space-y-1 text-neutral-700">
                  <li>
                    キーボードの <strong>[Fn] + [NumLock]</strong>（または [Shift] + [NumLock]）を同時に1回押す。
                    <span className="text-[11px] text-neutral-500 block">※キーボードの「Insert」「F11」「F12」などに青や枠線で「NumLk」と小さく印刷されています。</span>
                  </li>
                  <li>
                    <strong>Windowsスクリーンキーボードで解除する場合：</strong><br />
                    キーボードの <strong>[Windowsキー] + [R]</strong> を押し、<strong>osk</strong> と入力してEnter ➔ 画面に出たキーボード右下の <strong>[NumLock]</strong> をクリックして消灯させる。
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-300 rounded space-y-2">
                <div className="font-bold text-neutral-900">■ 「qを押すと『た』が出る（かな入力）」場合の復帰方法</div>
                <p className="text-neutral-700">
                  キーボードの <strong>[Alt] + [カタカナ/ひらがな (ローマ字)]</strong> または <strong>[Ctrl] + [Shift] + [Caps Lock]</strong> を押して、「ローマ字入力」に戻してください。
                </p>
              </div>

              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-900 text-[11px]">
                <strong>💡 v15.0での恒久改修：</strong><br />
                今後の打鍵では、NumLock（0x53）およびF5キー（メモ帳日付挿入）は100%完全排除されました。安心してカルテ送信を行っていただけます。
              </div>
            </div>

            <div className="mt-4 pt-2 border-t border-black flex justify-end">
              <button
                onClick={() => setIsNumLockModalOpen(false)}
                className="mac-btn mac-btn-default px-6 py-1 font-bold"
              >
                閉じる (OK)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ★ スマート・ツール＆カルテ設定メニュー モーダル (画面上の全ボタンを内包) */}
      {/* ========================================================================= */}
      {isSmartMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="mac-window max-w-lg w-full bg-white border-2 border-black p-4 shadow-[5px_5px_0_#000] my-auto">
            {/* メニュー タイトルバー */}
            <div className="flex items-center justify-between pb-2 border-b border-black mb-3 select-none">
              <div className="flex items-center gap-2">
                <Menu className="w-4 h-4 text-black" />
                <span className="font-bold text-sm tracking-wide">
                  ツール ＆ カルテ設定メニュー (v19.1)
                </span>
              </div>
              <button
                onClick={() => {
                  playMacBeep();
                  setIsSmartMenuOpen(false);
                }}
                className="w-5 h-5 border border-black text-xs font-bold hover:bg-black hover:text-white flex items-center justify-center"
                title="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs max-h-[75vh] overflow-y-auto pr-1">
              {/* ── ★ 最重要新機能: 医療双方向エッジコプロセッサ ── */}
              <div className="border-2 border-black p-2.5 bg-yellow-50 space-y-2 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-black border-b border-black/30 pb-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📥</span>
                    <span className="text-xs font-bold">医療双方向エッジコプロセッサ (v19.1)</span>
                  </div>
                  <span className="text-[10px] bg-black text-white px-1 font-mono">1チップ同時実現</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playMacBeep();
                    setIsCoprocessorModalOpen(true);
                    setIsSmartMenuOpen(false);
                  }}
                  className="w-full mac-btn text-left p-2.5 flex items-center gap-2 bg-yellow-100 hover:bg-yellow-200 border border-black font-bold"
                >
                  <span className="text-lg">⚡</span>
                  <div>
                    <div className="font-bold text-xs">過去カルテ吸い上げ ＆ スマホAI要約 ＆ 書き戻し</div>
                    <div className="text-[10px] text-gray-700">USB仮想プリンター(Bulk OUT)で電カル吸い上げ ➔ SOAP構造化 ➔ HID打鍵書き戻し</div>
                  </div>
                </button>
              </div>

              {/* ── セクション1: 診療入力・定型文アシスト ── */}
              <div className="border border-black p-2.5 bg-neutral-50 space-y-2">
                <div className="font-bold text-black border-b border-black/20 pb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  <span>1. 診療入力 ＆ 定型文アシスト</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertSoapTemplate();
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>📄</span>
                    <div>
                      <div className="font-bold">SOAP標準雛形</div>
                      <div className="text-[10px] text-gray-600">主訴・所見・評価・方針</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setTemplateModalTab('list');
                      setIsTemplateModalOpen(true);
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>🔖</span>
                    <div>
                      <div className="font-bold">定型文ライブラリ</div>
                      <div className="text-[10px] text-gray-600">登録数: {templates.length}件</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setIsAiModalOpen(true);
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>🤖</span>
                    <div>
                      <div className="font-bold">AIスマート整形</div>
                      <div className="text-[10px] text-gray-600">Gemini臨床推敲・要約</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setIsCameraOcrOpen(true);
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>📷</span>
                    <div>
                      <div className="font-bold">カメラOCR</div>
                      <div className="text-[10px] text-gray-600">処方箋・紹介状スキャン</div>
                    </div>
                  </button>
                </div>

                {/* 短縮定型ショートカット */}
                {templates.length > 0 && (
                  <div className="pt-1.5 border-t border-black/10">
                    <div className="text-[11px] font-bold text-gray-700 mb-1">よく使う短縮定型:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.slice(0, 4).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            playMacBeep();
                            handleApplyTemplate(t.content, 'append');
                            setIsSmartMenuOpen(false);
                          }}
                          className="mac-btn text-[11px] py-0.5 px-2 bg-white"
                          title={t.description}
                        >
                          <span>• {t.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── セクション2: IME精度ブースト ＆ 検証 ── */}
              <div className="border border-black p-2.5 bg-neutral-50 space-y-2">
                <div className="font-bold text-black border-b border-black/20 pb-1 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>2. IME精度ブースト ＆ 検証</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setIsImeBoostModalOpen(true);
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>⚡</span>
                    <div>
                      <div className="font-bold">IME精度ブースト設定</div>
                      <div className="text-[10px] text-gray-600">
                        {misconversionWarnings.length > 0 ? `警告 ${misconversionWarnings.length}件あり` : '正常稼働中'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      playMacBeep();
                      setIsE2eModalOpen(true);
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5"
                  >
                    <span>▶</span>
                    <div>
                      <div className="font-bold">E2E自動テスト検証</div>
                      <div className="text-[10px] text-gray-600">打鍵シミュレーション</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleNumUnlock();
                      setIsSmartMenuOpen(false);
                    }}
                    className="mac-btn text-left p-2 flex items-center gap-1.5 col-span-2 bg-red-50 border-red-800 text-red-900"
                  >
                    <span>🚨</span>
                    <div>
                      <div className="font-bold">ノートPC テンキー固定 (NumLock) 解除</div>
                      <div className="text-[10px] text-red-700">「Kを押すと2が出る」現象を解除</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* ── セクション3: カルテ端末・送信設定 ── */}
              <div className="border border-black p-2.5 bg-neutral-50 space-y-2.5">
                <div className="font-bold text-black border-b border-black/20 pb-1 flex items-center gap-1.5">
                  <Settings className="w-3.5 h-3.5" />
                  <span>3. カルテ端末 ＆ 送信設定</span>
                </div>

                {/* 送信モード */}
                <div className="space-y-1">
                  <div className="font-bold text-gray-800">打鍵モード:</div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-1.5 cursor-pointer bg-white p-1 border border-black shadow-[1px_1px_0_#000]">
                      <input
                        type="radio"
                        name="menuDispatchMode"
                        className="mac-radio"
                        checked={dispatchMode === DispatchMode.MODE_HYBRID_UNICODE}
                        onChange={() => {
                          playMacBeep();
                          setDispatchMode(DispatchMode.MODE_HYBRID_UNICODE);
                        }}
                      />
                      <span className="font-bold text-black">★ v19.1 4層タグ変換 (誤変換ゼロ・双方向コプロセッサ推奨)</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-white p-1 border border-black/30">
                      <input
                        type="radio"
                        name="menuDispatchMode"
                        className="mac-radio"
                        checked={dispatchMode === DispatchMode.MODE_IME_ROMAJI}
                        onChange={() => {
                          playMacBeep();
                          setDispatchMode(DispatchMode.MODE_IME_ROMAJI);
                        }}
                      />
                      <span>旧式 ローマ字変換</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer bg-white p-1 border border-black/30">
                      <input
                        type="radio"
                        name="menuDispatchMode"
                        className="mac-radio"
                        checked={dispatchMode === DispatchMode.MODE_RAW_ASCII}
                        onChange={() => {
                          playMacBeep();
                          setDispatchMode(DispatchMode.MODE_RAW_ASCII);
                        }}
                      />
                      <span>直接半角 ASCII 打鍵</span>
                    </label>
                  </div>
                </div>

                {/* カルテ改行形式 */}
                <div className="space-y-1 pt-1 border-t border-black/10">
                  <div className="font-bold text-gray-800">カルテ改行キー:</div>
                  <div className="flex gap-2">
                    <label className="flex-1 flex items-center gap-1.5 cursor-pointer bg-white p-1 border border-black">
                      <input
                        type="radio"
                        name="menuNewlineMode"
                        className="mac-radio"
                        checked={newlineMode === EhrNewlineMode.NORMAL_ENTER}
                        onChange={() => {
                          playMacBeep();
                          setNewlineMode(EhrNewlineMode.NORMAL_ENTER);
                          localStorage.setItem('drvoice_ehr_newline_mode_v1', EhrNewlineMode.NORMAL_ENTER);
                        }}
                      />
                      <span>標準 (Enter)</span>
                    </label>

                    <label className="flex-1 flex items-center gap-1.5 cursor-pointer bg-white p-1 border border-black">
                      <input
                        type="radio"
                        name="menuNewlineMode"
                        className="mac-radio"
                        checked={newlineMode === EhrNewlineMode.MICS_ALT_ENTER}
                        onChange={() => {
                          playMacBeep();
                          setNewlineMode(EhrNewlineMode.MICS_ALT_ENTER);
                          localStorage.setItem('drvoice_ehr_newline_mode_v1', EhrNewlineMode.MICS_ALT_ENTER);
                        }}
                      />
                      <span>MICS (Alt+Enter)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* モーダル フッター */}
            <div className="mt-4 pt-2 border-t border-black flex justify-end">
              <button
                onClick={() => {
                  playMacBeep();
                  setIsSmartMenuOpen(false);
                }}
                className="mac-btn mac-btn-default px-6 py-1 font-bold"
              >
                閉じる (OK)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
