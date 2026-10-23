import React from 'react';
import {
  ArrowLeft,
  X,
  Search,
  Sparkles,
  Zap,
  ChevronRight,
  ShieldCheck,
  Trash2,
  Cpu,
  BookTemplate,
  Camera,
  Volume2,
  VolumeX,
  Lock,
} from 'lucide-react';
import { APP_VERSION, LATEST_FIRMWARE_VERSION } from '../../version';
import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
} from '../../utils/chartTextCleaner';
import { expandMedicalAbbreviations } from '../../services/clinicalCopilotEngine';
import { CompiledStreamPreview, CopilotData, ChartContext, triggerHaptic } from './types';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  localDraft: string;
  setLocalDraft: React.Dispatch<React.SetStateAction<string>>;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  isBleConnected: boolean;
  isSending: boolean;
  onOpenSearch: (tab?: any) => void;
  onOpenTemplates: () => void;
  onOpenWebLlm: (style?: any) => void;
  onOpenCameraOcr?: () => void;
  onOpenLearnedDict?: () => void;
  learnedDictCount?: number;
  setSpeechSuccessNotice: (msg: string | null) => void;
  setShowCopilotPanel: (show: boolean) => void;
  handleSecretAirGapTap: () => void;
  isMuted: boolean;
  handleToggleMute: () => void;
  chartContext: ChartContext;
  copilotData: CopilotData;
  compiledStreamPreview: CompiledStreamPreview;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  inputText,
  setInputText,
  localDraft,
  setLocalDraft,
  setIsEditing,
  isBleConnected,
  isSending,
  onOpenSearch,
  onOpenTemplates,
  onOpenWebLlm,
  onOpenCameraOcr,
  onOpenLearnedDict,
  learnedDictCount,
  setSpeechSuccessNotice,
  setShowCopilotPanel,
  handleSecretAirGapTap,
  isMuted,
  handleToggleMute,
  chartContext,
  copilotData,
  compiledStreamPreview,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in">
      {/* バックドロップ */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={() => {
          triggerHaptic(10);
          onClose();
        }}
      />

      {/* スライドインドロワー本体 */}
      <aside className="relative w-11/12 max-w-sm h-full bg-[#0F172A] border-r border-slate-800 text-slate-100 flex flex-col justify-between p-4 z-10 shadow-2xl overflow-y-auto overscroll-contain animate-in slide-in-from-left duration-200 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <div className="space-y-4">
          {/* ドロワーヘッダー */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-md cursor-pointer active:scale-95"
                aria-label="メイン画面へ戻る"
                title="メイン画面へ戻る"
              >
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                <span>戻る</span>
              </button>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  設定 &amp; 管理メニュー
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">
                  Dr.Dongly System Menu
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(15);
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              aria-label="閉じる"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 🔍 臨床データ高速ローカル検索バー */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onClose();
              onOpenSearch('all');
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 hover:border-amber-500/60 rounded-xl text-left transition-all group shadow-inner cursor-pointer"
          >
            <Search className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs text-slate-300 truncate">
              ガイドライン・Minds・処方禁忌を検索...
            </span>
            <span className="ml-auto text-[10px] font-mono text-emerald-400 border border-emerald-700/60 bg-emerald-950/60 rounded px-1.5 py-0.5 shrink-0">
              ⚡0.1ms
            </span>
          </button>

          {/* ⚡ カルテテキスト操作 ＆ 入力支援 (メイン画面から集約) */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-amber-400 tracking-wider uppercase flex items-center justify-between">
              <span>カルテテキスト操作 ＆ 入力支援</span>
              <span className="text-[10px] font-mono text-emerald-300">ワンタップ実行</span>
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {/* 略語・空白整理 */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  const raw = localDraft || inputText;
                  if (!raw.trim()) {
                    onClose();
                    return;
                  }
                  const { expandedText } = expandMedicalAbbreviations(raw);
                  const cleaned = cleanExtractedMedicalText(normalizeMedicalSpeechTerms(expandedText));
                  setLocalDraft(cleaned);
                  setInputText(cleaned);
                  onClose();
                  setSpeechSuccessNotice('✨ 略語と無駄な空白・改行を一括整理しました');
                  setTimeout(() => setSpeechSuccessNotice(null), 3000);
                }}
                className="col-span-2 p-2.5 rounded-xl bg-sky-950/50 hover:bg-sky-900/60 border border-sky-600/40 text-left transition-colors flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-sky-200">略語・空白整理</div>
                    <div className="text-[10px] text-sky-400 font-mono">HTN/DM正規化 ＆ 無駄な空白一括削除</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* ⚡ 自己学習クローズドループ辞書 (Aho-Corasick & Whisper連動) */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                  onOpenLearnedDict?.();
                }}
                className="col-span-2 p-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-600/40 text-left transition-colors flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                      <span>自己学習辞書 (Aho-Corasick)</span>
                      {learnedDictCount !== undefined && learnedDictCount > 0 && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded-full font-bold">
                          {learnedDictCount}件
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      電カルIME誤変換 ＆ ASR誤認識の自己進化テーブル
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
              </button>

              {/* 📷 処方箋・カルテ カメラOCR取込 (目立つ位置) */}
              {onOpenCameraOcr && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onClose();
                    onOpenCameraOcr();
                  }}
                  className="col-span-2 p-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-500/50 text-left transition-colors flex items-center justify-between group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Camera className="w-4 h-4 text-sky-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-sky-200">処方箋・カルテ カメラOCR取込</div>
                      <div className="text-[10px] text-sky-400 font-mono">スマホカメラ撮影で書類・薬剤名を即座に文字化</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              )}

              {/* 🛡️ 臨床コパイロット */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                  setShowCopilotPanel(true);
                }}
                className="p-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-600/40 text-left transition-colors flex items-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-emerald-200">臨床コパイロット</div>
                  <div className="text-[9px] text-emerald-400">RedFlags/eGFR/電卓</div>
                </div>
              </button>

              {/* 🗑️ カルテ全消去 */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(20);
                  if (window.confirm('入力中のカルテテキストをすべて消去しますか？')) {
                    setLocalDraft('');
                    setInputText('');
                    setIsEditing(false);
                    onClose();
                  }
                }}
                className="p-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-600/40 text-left transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-rose-200">カルテ消去</div>
                  <div className="text-[9px] text-rose-400">入力内容クリア</div>
                </div>
              </button>
            </div>
          </div>

          {/* カルテ100%連動 抽出キーワード */}
          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-amber-500/40 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-amber-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>カルテ抽出キーワード</span>
              </span>
              <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/30">
                {chartContext.allKeywords.length}件連動中
              </span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {chartContext.allKeywords.length > 0 ? (
                chartContext.allKeywords.slice(0, 8).map((kw, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenSearch('all');
                    }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-amber-200 border border-amber-500/40 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    #{kw}
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-slate-400 italic">カルテ入力と自動同期中</span>
              )}
            </div>
          </div>

          {/* グループ1: 臨床データ検索 (16MBオンメモリ / 32GB SD連動) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">
                臨床データ検索 ＆ 意思決定支援
              </span>
              <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2 py-0.5 rounded-full">
                16MBオンメモリ即時検索
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/60 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                  onOpenSearch('all');
                }}
                className="w-full p-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-500/40 flex items-center justify-between text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">📚</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-sky-200 truncate">
                      臨床データ総合検索 (10大マスター)
                    </div>
                    <div className="text-[10px] text-sky-400 font-mono truncate">
                      錠剤鑑別・心電図・救急・処方・スコア・Minds等
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-sky-400 group-hover:text-white transition-colors shrink-0" />
              </button>

              {/* 16MBオンメモリ vs 32GB SDカード(Wi-Fi接続) 仕様明記案内 */}
              <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/60 text-[10px] text-slate-300 leading-relaxed space-y-1.5">
                <div className="flex items-center justify-between text-amber-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span>📡</span>
                    <span>32GB MicroSD 詳細データ</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      handleSecretAirGapTap();
                    }}
                    className="text-[9px] text-sky-400 underline hover:text-sky-300 cursor-pointer"
                  >
                    Wi-Fi接続ガイド
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  要約・判定インデックスはT-Dongle-S3の16MBメモリから0.1ms即時検索。医薬品添付文書原本PDFや高解像度12誘導心電図等の詳細データは、T-Dongle-S3の閉域Wi-Fi SoftAP (192.168.4.1) 接続時にストリーミング閲覧可能です。
                </p>
              </div>
            </div>
          </div>

          {/* グループ2: カルテ入力支援 ＆ ツール */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
              カルテ入力支援 ＆ ツール
            </span>
            <div className="space-y-1.5">
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/40 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(15);
                    onClose();
                    onOpenWebLlm('soap');
                  }}
                  className="w-full flex items-center justify-between text-left transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-purple-200">
                        Gemma 2 臨床AIスタジオ ＆ 医療秘書
                      </div>
                      <div className="text-[10px] text-purple-400 font-mono">
                        SOAP・紹介状・指示簿・SBAR・IC説明・秘書チャット
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-400 group-hover:text-white transition-colors" />
                </button>
                <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-purple-500/30">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenWebLlm('chat');
                    }}
                    className="col-span-2 px-2 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] text-center shadow-sm cursor-pointer"
                  >
                    💬 Gemma 2 専属医療秘書チャットを開く
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenWebLlm('referral');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-sky-300 border border-slate-700 text-[10px] font-bold text-left cursor-pointer"
                  >
                    📄 紹介状・サマリー
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenWebLlm('order_sbar');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-emerald-300 border border-slate-700 text-[10px] font-bold text-left cursor-pointer"
                  >
                    📋 指示簿・SBAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenWebLlm('patient_ic');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-pink-300 border border-slate-700 text-[10px] font-bold text-left cursor-pointer"
                  >
                    👪 患者IC説明書
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic(10);
                      onClose();
                      onOpenWebLlm('clinical_audit');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-slate-900/90 text-rose-300 border border-slate-700 text-[10px] font-bold text-left cursor-pointer"
                  >
                    🛡️ 処方・RedFlag監査
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic(15);
                  onClose();
                  onOpenTemplates();
                }}
                className="w-full p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 flex items-center justify-between text-left transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <BookTemplate className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      SOAPテンプレート ＆ 略語マスター
                    </div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      内科・外来定型文 ワンタップ展開
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>

            </div>
          </div>

          {/* グループ3: 操作音・静音設定 */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center justify-between">
              <span>操作音 ＆ 静音設定</span>
              <span className="text-[10px] text-amber-400 font-mono">当直・外来対応</span>
            </span>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-200 text-xs truncate">ボタンタップ音・操作音</div>
                    <div className="text-[10px] text-slate-400 truncate">ビープ音・打鍵確認音の消音制御</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95 ${
                    isMuted
                      ? 'bg-rose-950/80 text-rose-300 border-rose-500/70 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                      : 'bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {isMuted ? '🔇 消音中 (Muted)' : '🔊 出力中 (ON)'}
                </button>
              </div>
            </div>
          </div>

          {/* グループ4: 3省2ガイドライン準拠 ＆ 医療安全 */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase flex items-center justify-between">
              <span>3省2ガイドライン準拠 ＆ 通信</span>
              <span className="text-[10px] text-emerald-400 font-mono">完全オフライン・オンプレミス</span>
            </span>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">BLE 打鍵転送:</span>
                <span className={`font-mono font-bold ${isBleConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isBleConnected ? 'DrDongly-S3 接続中' : '未接続'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">医療情報安全管理:</span>
                <span className="text-emerald-400 font-semibold">3省2ガイドライン準拠</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">クラウド外部送信:</span>
                <span className="text-emerald-300 font-mono">0 Byte (完全オンプレミス)</span>
              </div>
              {/* 隠し機能トリガー: この行を3回連続タップするとT-Dongle-S3 Wi-Fiエアギャップ接続手順が開く */}
              <div
                onClick={handleSecretAirGapTap}
                className="pt-1.5 mt-1 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500 cursor-pointer select-none"
                title="3回連続タップでT-Dongle-S3 閉域Wi-Fiエアギャップ詳細を表示"
              >
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-500" />
                  ハードウェア閉域認証モード
                </span>
                <span className="font-mono">On-Premise Air-Gap</span>
              </div>
            </div>
          </div>
        </div>

        {/* ドロワーフッター（戻るボタン ＋ バージョン情報） */}
        <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-3">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(15);
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>メイン画面へ戻る</span>
          </button>
          <div
            onClick={handleSecretAirGapTap}
            className="text-[11px] font-mono text-slate-400 flex items-center justify-between cursor-pointer select-none"
          >
            <span>FW: v{LATEST_FIRMWARE_VERSION}-ESP32S3</span>
            <span>Dr.Dongly v{APP_VERSION}</span>
          </div>
        </div>
      </aside>
    </div>
  );
};
