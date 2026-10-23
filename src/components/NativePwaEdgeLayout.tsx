import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
} from 'react';
import { Search } from 'lucide-react';
import { isAudioMuted, toggleAudioMuted, addAudioMuteListener, playMacBeep } from '../utils/macAudio';
import { cleanExtractedMedicalText } from '../utils/chartTextCleaner';
import { sdCardStreamingService } from '../services/sdCardStreamingService';
import { useClinicalCopilot } from '../hooks/useClinicalCopilot';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { triggerHaptic } from './nativePwa/types';
import { PwaHeader } from './nativePwa/PwaHeader';
import { PwaBottomBar } from './nativePwa/PwaBottomBar';
import { ClinicalEditorCard } from './nativePwa/ClinicalEditorCard';
import { ClinicalRightPane } from './nativePwa/ClinicalRightPane';
import { NavigationDrawer } from './nativePwa/NavigationDrawer';
import { HiddenAirGapModal } from './nativePwa/HiddenAirGapModal';
import { ClinicalCopilotModal } from './nativePwa/ClinicalCopilotModal';

export interface NativePwaEdgeLayoutProps {
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  isBleConnected: boolean;
  isSending: boolean;
  onConnectBle: () => void;
  onSendSession: () => void;
  onAbortTransfer?: () => void;
  onOpenSearch: (initialTab?: any) => void;
  onOpenCoprocessor?: () => void;
  onOpenWebLlm: (initialStyle?: any) => void;
  onOpenTemplates: () => void;
  onOpenCameraOcr?: () => void;
  onLearnAsrDiff?: (rawSpeechText: string, finalizedText: string) => Promise<any>;
  onAhoCorasickReplace?: (text: string) => { result: string; replacedCount: number };
  whisperInitialPrompt?: string;
  onOpenLearnedDict?: () => void;
  learnedDictCount?: number;
}

export const NativePwaEdgeLayout: React.FC<NativePwaEdgeLayoutProps> = ({
  inputText,
  setInputText,
  isBleConnected,
  isSending,
  onConnectBle,
  onSendSession,
  onAbortTransfer,
  onOpenSearch,
  onOpenCoprocessor,
  onOpenWebLlm,
  onOpenTemplates,
  onOpenCameraOcr,
  onLearnAsrDiff,
  onAhoCorasickReplace,
  onOpenLearnedDict,
  learnedDictCount,
}) => {
  // ドロワー開閉
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 音声効果音（マックビープ・打鍵音）の消音ステート管理
  const [isMuted, setIsMuted] = useState<boolean>(() => isAudioMuted());
  useEffect(() => {
    const removeListener = addAudioMuteListener((muted) => {
      setIsMuted(muted);
    });
    return () => removeListener();
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = toggleAudioMuted();
    setIsMuted(next);
    triggerHaptic(10);
    if (!next) {
      playMacBeep();
    }
  }, []);

  // 隠し機能: 3省2ガイドライン エアギャップWi-Fi SoftAPモーダル
  const [secretTapCount, setSecretTapCount] = useState(0);
  const [showHiddenAirGapModal, setShowHiddenAirGapModal] = useState(false);

  const handleSecretAirGapTap = () => {
    triggerHaptic(10);
    const next = secretTapCount + 1;
    if (next >= 3) {
      setSecretTapCount(0);
      sdCardStreamingService.checkApConnection().then(() => {});
      setShowHiddenAirGapModal(true);
    } else {
      setSecretTapCount(next);
    }
  };

  // 検索入力ステート
  const [searchQuery] = useState('');

  // エディタローカルバッファ & タイピングステート
  const [isEditing, setIsEditing] = useState(false);
  const [localDraft, setLocalDraft] = useState<string>(inputText);
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isTypingRef.current) {
      setLocalDraft(inputText);
    }
  }, [inputText]);

  const handleEditorChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setLocalDraft(val);
      isTypingRef.current = true;
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        isTypingRef.current = false;
      }, 500);

      startTransition(() => {
        setInputText(val);
      });
    },
    [setInputText]
  );

  // 右ペイン表示モード
  const [, setShowInlineChat] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<'clinical' | 'chat'>('clinical');

  // カスタムフック①: 臨床意思決定支援 ＆ 100%確定ストリーム解析 ＆ HUD同期
  const clinicalCopilot = useClinicalCopilot({ inputText, isBleConnected });

  // カスタムフック②: 音声認識ライフサイクル ＆ 波形アニメーション制御
  const speechRecognition = useSpeechRecognition({
    setInputText,
    onAhoCorasickReplace,
    onLearnAsrDiff,
  });

  // 表示用テキスト（編集モード中は計算自体をスキップして 0ms タイピングレスポンスを保証）
  const displayLines = useMemo(() => {
    if (isEditing) return [];
    const text = clinicalCopilot.deferredInputText.trim();
    if (!text) return [];
    return cleanExtractedMedicalText(text).split('\n');
  }, [isEditing, clinicalCopilot.deferredInputText]);

  // スニペット追記ハンドラ
  const handleAppendSnippet = useCallback(
    (snippet: string, notice: string) => {
      const next = cleanExtractedMedicalText(
        localDraft ? `${localDraft}\n${snippet}` : snippet
      );
      setLocalDraft(next);
      setInputText(next);
      speechRecognition.setSpeechSuccessNotice(notice);
      setTimeout(() => speechRecognition.setSpeechSuccessNotice(null), 3000);
    },
    [localDraft, setInputText, speechRecognition]
  );

  return (
    <div className="relative w-full h-[100dvh] max-h-[100dvh] bg-[#0F172A] text-slate-100 flex flex-col justify-between overflow-hidden select-none font-sans overscroll-none touch-manipulation">
      {/* 1. ヘッダー部 */}
      <PwaHeader
        isDrawerOpen={isDrawerOpen}
        onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
        onOpenSearch={onOpenSearch}
        onOpenTemplates={onOpenTemplates}
        onOpenWebLlm={onOpenWebLlm}
        onSelectRightPaneTab={setRightPaneTab}
        onToggleInlineChat={() => setShowInlineChat((prev) => !prev)}
        onOpenCameraOcr={onOpenCameraOcr}
        isMuted={isMuted}
        handleToggleMute={handleToggleMute}
        isBleConnected={isBleConnected}
        onConnectBle={onConnectBle}
      />

      {/* 2. メインコンテンツ部 (レスポンシブ2ペイン) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-2.5 sm:px-3.5 py-1.5 sm:py-2 overflow-hidden flex flex-col lg:grid lg:grid-cols-12 lg:gap-6 lg:p-4">
        {/* 左側カラム (8カラム) */}
        <div className="flex-1 flex flex-col gap-2 h-full min-h-0 overflow-hidden lg:col-span-8">
          {/* デスクトップ専用 ガイドライン・処方禁忌 ローカル検索バー */}
          <div className="relative w-full shrink-0 hidden lg:block">
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onOpenSearch();
              }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 bg-[#1E293B]/80 hover:bg-[#1E293B] border border-slate-700/60 focus-within:border-amber-500 rounded-xl text-left transition-all group shadow-inner cursor-pointer"
            >
              <Search className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors shrink-0" />
              <span className="text-xs text-slate-400 truncate">
                {searchQuery || 'ガイドライン・Minds・処方禁忌・12誘導心電図をローカル検索...'}
              </span>
              <span className="ml-auto text-[10px] font-mono text-emerald-400 border border-emerald-700/60 bg-emerald-950/60 rounded px-1.5 py-0.5">
                ⚡0.1ms検索
              </span>
            </button>
          </div>

          {/* 臨床所見・SOAPカルテ編集カード */}
          <ClinicalEditorCard
            isSending={isSending}
            isRecording={speechRecognition.isRecording}
            localDraft={localDraft}
            inputText={inputText}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            setLocalDraft={setLocalDraft}
            setInputText={setInputText}
            onAbortTransfer={onAbortTransfer}
            onOpenCameraOcr={onOpenCameraOcr}
            onOpenWebLlm={onOpenWebLlm}
            speechSuccessNotice={speechRecognition.speechSuccessNotice}
            setSpeechSuccessNotice={speechRecognition.setSpeechSuccessNotice}
            handleEditorChange={handleEditorChange}
            displayLines={displayLines}
            liveSpeechDecode={speechRecognition.liveSpeechDecode}
            textareaRef={textareaRef}
            isTypingRef={isTypingRef}
          />
        </div>

        {/* 右側カラム (4カラム常時展開) */}
        <ClinicalRightPane
          rightPaneTab={rightPaneTab}
          setRightPaneTab={setRightPaneTab}
          localDraft={localDraft}
          inputText={inputText}
          setLocalDraft={setLocalDraft}
          setInputText={setInputText}
          isBleConnected={isBleConnected}
          isSending={isSending}
          onSendSession={onSendSession}
          onOpenSearch={onOpenSearch}
          onOpenTemplates={onOpenTemplates}
          onOpenWebLlm={onOpenWebLlm}
          onOpenCameraOcr={onOpenCameraOcr}
          onOpenCoprocessor={onOpenCoprocessor}
          chartContext={clinicalCopilot.chartContext}
          copilotData={clinicalCopilot.copilotData}
          compiledStreamPreview={clinicalCopilot.compiledStreamPreview}
        />
      </main>

      {/* 3. 親指ボトムアクションバー */}
      <PwaBottomBar
        isRecording={speechRecognition.isRecording}
        isSending={isSending}
        inputText={inputText}
        wavePath1Ref={speechRecognition.wavePath1Ref}
        wavePath2Ref={speechRecognition.wavePath2Ref}
        toggleSpeechRecognition={speechRecognition.toggleSpeechRecognition}
        onOpenCoprocessor={onOpenCoprocessor}
        onAbortTransfer={onAbortTransfer}
        onSendSession={onSendSession}
      />

      {/* 4. ハンバーガーメニュー ドロワー */}
      <NavigationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        inputText={inputText}
        setInputText={setInputText}
        localDraft={localDraft}
        setLocalDraft={setLocalDraft}
        setIsEditing={setIsEditing}
        isBleConnected={isBleConnected}
        isSending={isSending}
        onOpenSearch={onOpenSearch}
        onOpenTemplates={onOpenTemplates}
        onOpenWebLlm={onOpenWebLlm}
        onOpenCameraOcr={onOpenCameraOcr}
        onOpenLearnedDict={onOpenLearnedDict}
        learnedDictCount={learnedDictCount}
        setSpeechSuccessNotice={speechRecognition.setSpeechSuccessNotice}
        setShowCopilotPanel={clinicalCopilot.setShowCopilotPanel}
        handleSecretAirGapTap={handleSecretAirGapTap}
        isMuted={isMuted}
        handleToggleMute={handleToggleMute}
        chartContext={clinicalCopilot.chartContext}
        copilotData={clinicalCopilot.copilotData}
        compiledStreamPreview={clinicalCopilot.compiledStreamPreview}
      />

      {/* 5. 隠し機能 エアギャップ遮断モーダル */}
      <HiddenAirGapModal
        isOpen={showHiddenAirGapModal}
        onClose={() => setShowHiddenAirGapModal(false)}
      />

      {/* 6. 臨床コパイロット モーダル */}
      <ClinicalCopilotModal
        isOpen={clinicalCopilot.showCopilotPanel}
        onClose={() => clinicalCopilot.setShowCopilotPanel(false)}
        copilotTab={clinicalCopilot.copilotTab}
        onChangeCopilotTab={clinicalCopilot.setCopilotTab}
        copilotData={clinicalCopilot.copilotData}
        patientWeightKg={clinicalCopilot.patientWeightKg}
        onChangePatientWeight={clinicalCopilot.setPatientWeightKg}
        onAppendText={handleAppendSnippet}
        onOpenWebLlm={onOpenWebLlm}
      />
    </div>
  );
};
