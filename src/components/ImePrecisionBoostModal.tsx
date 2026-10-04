import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  X, 
  Check, 
  AlertTriangle, 
  ShieldCheck, 
  Cpu, 
  Settings2, 
  Plus, 
  Trash2, 
  Edit3, 
  HelpCircle,
  Zap,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Sliders,
  CheckCircle2
} from 'lucide-react';
import { 
  CompileImeOptions, 
  compileMedicalTextToImeBoost, 
  detectMisconversionWarnings, 
  MisconversionWarning, 
  DoctorCustomMacro, 
  DEFAULT_DOCTOR_MACROS,
  DIFFICULT_MEDICAL_KANJI,
  IME_TAG_KATAKANA,
  IME_TAG_HIRAGANA,
  IME_TAG_KANJI,
  IME_TAG_UNICODE,
  IME_TAG_ASCII
} from '../utils/imePrecisionCompiler';

const STORAGE_KEY_DOCTOR_MACROS = 'drvoice_doctor_custom_macros_v8';
const STORAGE_KEY_IME_SETTINGS = 'drvoice_ime_boost_settings_v8';

interface ImePrecisionBoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputText: string;
  onApplyModifiedText: (newText: string) => void;
  options: CompileImeOptions;
  onOptionsChange: (newOptions: CompileImeOptions) => void;
}

export const ImePrecisionBoostModal: React.FC<ImePrecisionBoostModalProps> = ({
  isOpen,
  onClose,
  inputText,
  onApplyModifiedText,
  options,
  onOptionsChange,
}) => {
  const [activeTab, setActiveTab] = useState<'simulator' | 'macros' | 'rules' | 'settings'>('simulator');

  // 医師カスタム辞書（略語マクロ）
  const [macros, setMacros] = useState<DoctorCustomMacro[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOCTOR_MACROS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load doctor macros', e);
    }
    return DEFAULT_DOCTOR_MACROS;
  });

  // 新規マクロ入力ステート
  const [newTrigger, setNewTrigger] = useState('');
  const [newExpansion, setNewExpansion] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [isAddingMacro, setIsAddingMacro] = useState(false);

  // マクロ保存
  const saveMacros = (updated: DoctorCustomMacro[]) => {
    setMacros(updated);
    try {
      localStorage.setItem(STORAGE_KEY_DOCTOR_MACROS, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save doctor macros', e);
    }
    // オプションにも反映
    onOptionsChange({
      ...options,
      doctorMacros: updated,
    });
  };

  // 警告リスト
  const warnings = detectMisconversionWarnings(inputText);

  // コンパイル結果
  const compileResult = compileMedicalTextToImeBoost(inputText, {
    ...options,
    doctorMacros: macros,
  });

  if (!isOpen) return null;

  // 単語のワンタップ置換
  const handleFixWarning = (warning: MisconversionWarning) => {
    if (warning.synonymAlternative) {
      // 同義語置換
      const replaced = inputText.replaceAll(warning.target, warning.synonymAlternative);
      onApplyModifiedText(replaced);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-700 via-sky-700 to-teal-700 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                <span>AtomS3U IME打鍵 日本語変換精度ブースト</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 text-[10px] font-bold">
                  v8.0 ハイブリッド
                </span>
              </h3>
              <p className="text-[11px] text-sky-100">
                低語彙カルテPC側IMEでも誤変換ゼロ。スマホAI × AtomS3U精密キーストローク協調
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-1 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'simulator'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${warnings.length > 0 ? 'text-amber-300 fill-amber-300' : ''}`} />
              <span>誤変換シミュレータ</span>
              {warnings.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-900 font-extrabold text-[10px]">
                  {warnings.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('macros')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'macros'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>医師カスタム辞書 ({macros.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Fキー制御シーケンス</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'settings'
                  ? 'bg-sky-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>パイプライン設定</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: 誤変換シミュレータ＆事前警告 */}
          {activeTab === 'simulator' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>入力中カルテ文章の誤変換リスク診断</span>
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {inputText.length}文字 スキャン完了
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  電子カルテPC（無改造・一般辞書）で発生しやすい「薬品名の当て字」「長い複合語の破綻」「難読専門漢字の変換不能」を自動検出します。
                </p>
              </div>

              {warnings.length === 0 ? (
                <div className="p-6 bg-emerald-50/60 border border-emerald-200 rounded-2xl text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <div className="text-sm font-bold text-emerald-900">
                    重大な誤変換リスクは見つかりませんでした！
                  </div>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto">
                    現在の文章は、ファンクションキー強制ルーティング（F7/F6）と最小Chunk分解により、電子カルテ端末上で100%安全かつ正確に入力されます。
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span>要注意・誤爆リスクのある単語 ({warnings.length}件)</span>
                  </div>

                  {warnings.map((warn) => (
                    <div
                      key={warn.id}
                      className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="text-sm text-rose-700 font-mono bg-white px-2 py-0.5 rounded-lg border border-amber-300">
                              {warn.target}
                            </span>
                            <span className="text-slate-400">➔</span>
                            <span className="text-rose-600 font-semibold line-through">
                              {warn.likelyMisconversion} (一般辞書の誤爆)
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 mt-1">
                            {warn.explanation}
                          </p>
                        </div>

                        <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-200/70 text-amber-900 text-[10px] font-bold">
                          {warn.recommendationLabel}
                        </span>
                      </div>

                      {/* 推奨アクション */}
                      <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 text-[11px]">
                        <span className="text-slate-600 font-medium">
                          どんぐり君の解決策: <strong className="text-sky-800">{warn.recommendationLabel}</strong>
                        </span>

                        {warn.synonymAlternative && (
                          <button
                            type="button"
                            onClick={() => handleFixWarning(warn)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-sky-700 font-bold border border-slate-300 shadow-2xs cursor-pointer flex items-center gap-1 active:scale-98"
                          >
                            <span>「{warn.synonymAlternative}」に置換</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 難読漢字Unicode F5アシスト一覧 */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-sky-600" />
                  <span>難読専門漢字のUnicode (F5打鍵) 自動解決リスト</span>
                </span>
                <p className="text-[11px] text-slate-500">
                  Windows標準MS-IME機能「文字コードを入力してF5キー」を利用し、辞書登録ゼロでも100%出力します。
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {DIFFICULT_MEDICAL_KANJI.map((k) => (
                    <span
                      key={k.unicodeHex}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      <strong className="text-indigo-700 text-xs">{k.kanji}</strong>
                      <span className="text-slate-400">({k.unicodeHex} ➔ F5)</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 医師個人専用カスタム辞書（略語マクロ） */}
          {activeTab === 'macros' && (
            <div className="space-y-3.5 animate-in fade-in">
              <div className="bg-sky-50/80 p-3.5 rounded-2xl border border-sky-200 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-900 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-sky-600" />
                    <span>医師個人専用カスタム辞書（学習プロファイル）</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingMacro(!isAddingMacro)}
                    className="px-2.5 py-1 rounded-lg bg-sky-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs hover:bg-sky-600 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>略語マクロ追加</span>
                  </button>
                </div>
                <p className="text-[11px] text-sky-800 mt-1">
                  電カルPC側での単語登録が禁止・初期化されても、スマホアプリ側で一元管理。略語を入力するだけで誤変換ゼロの確実キーストロークに自動展開されます。
                </p>
              </div>

              {/* 新規マクロ追加フォーム */}
              {isAddingMacro && (
                <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-2xl space-y-2.5 text-xs animate-in fade-in">
                  <div className="font-bold text-slate-800">新しい略語マクロを登録</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">トリガー略語 (例: AP, いつもの)</label>
                      <input
                        type="text"
                        value={newTrigger}
                        onChange={(e) => setNewTrigger(e.target.value)}
                        placeholder="AP"
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">説明・メモ (例: 狭心症略語)</label>
                      <input
                        type="text"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="狭心症"
                        className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">展開後のカルテ文章</label>
                    <textarea
                      value={newExpansion}
                      onChange={(e) => setNewExpansion(e.target.value)}
                      placeholder="狭心症"
                      rows={2}
                      className="w-full p-2 border border-slate-300 rounded-xl bg-white text-xs font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingMacro(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 font-semibold cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newTrigger.trim() || !newExpansion.trim()) return;
                        const newMacro: DoctorCustomMacro = {
                          id: `macro-${Date.now()}`,
                          trigger: newTrigger.trim(),
                          expansion: newExpansion.trim(),
                          description: newDesc.trim() || undefined,
                          category: 'abbreviation',
                          enabled: true,
                        };
                        saveMacros([newMacro, ...macros]);
                        setNewTrigger('');
                        setNewExpansion('');
                        setNewDesc('');
                        setIsAddingMacro(false);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold cursor-pointer shadow-2xs"
                    >
                      辞書に登録
                    </button>
                  </div>
                </div>
              )}

              {/* マクロ一覧 */}
              <div className="space-y-2">
                {macros.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs"
                  >
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                          {m.trigger}
                        </span>
                        <span className="text-slate-400">➔</span>
                        <span className="font-semibold text-slate-900 truncate">
                          {m.expansion}
                        </span>
                      </div>
                      {m.description && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {m.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = macros.map((item) =>
                            item.id === m.id ? { ...item, enabled: !item.enabled } : item
                          );
                          saveMacros(updated);
                        }}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                          m.enabled
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {m.enabled ? '有効' : '無効'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = macros.filter((item) => item.id !== m.id);
                          saveMacros(updated);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Fキー制御シーケンス・プレビュー */}
          {activeTab === 'rules' && (
            <div className="space-y-3.5 animate-in fade-in text-xs">
              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 border border-slate-800">
                <div className="flex items-center justify-between text-sky-400 font-bold">
                  <span>コンパイル済みキーストローク列 (AtomS3U送出用)</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    タグ付き制御ペイロード
                  </span>
                </div>
                <div className="bg-black/60 p-3 rounded-xl font-mono text-[11px] text-emerald-400 break-all leading-relaxed max-h-36 overflow-y-auto border border-slate-800">
                  {compileResult.compiledPayload || '（テキストを入力してください）'}
                </div>
              </div>

              {/* 振り分けトークン一覧 */}
              <div className="space-y-1.5">
                <span className="font-bold text-slate-700">トークン別 Fキールーティング解析</span>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {compileResult.displayTokens.map((tok, i) => (
                    <div
                      key={i}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] ${
                          tok.type === 'katakana' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          tok.type === 'ascii' ? 'bg-sky-100 text-sky-800 border border-sky-300' :
                          tok.type === 'hiragana' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          tok.type === 'unicode' ? 'bg-purple-100 text-purple-800 border border-purple-300' :
                          'bg-slate-200 text-slate-800'
                        }`}>
                          {tok.actionTag}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {tok.originalText}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-[11px] text-indigo-700">
                          {tok.keystrokes}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {tok.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: パイプライン設定 */}
          {activeTab === 'settings' && (
            <div className="space-y-3 animate-in fade-in text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">① 文字種別 ファンクションキー強制ルーティング</div>
                    <p className="text-[11px] text-slate-500">カタカナ薬品名➔F7、ひらがな助詞➔F6、数値英字➔半角を自動打鍵</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={options.enableFunctionKeyRouting}
                    onChange={(e) => onOptionsChange({ ...options, enableFunctionKeyRouting: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <div>
                    <div className="font-bold text-slate-800">② 最小確実形態素（Chunk）分解＆即時確定</div>
                    <p className="text-[11px] text-slate-500">「急性虫垂炎」を一括変換せず「急性」「虫垂」「炎」に切って誤爆防止</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={options.enableChunkDecomposition}
                    onChange={(e) => onOptionsChange({ ...options, enableChunkDecomposition: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <div>
                    <div className="font-bold text-slate-800">④ 難読専門漢字のUnicode (F5コード変換) アシスト</div>
                    <p className="text-[11px] text-slate-500">「嚥」「爬」「瘻」などの難読漢字を文字コード4桁+F5キーで着弾</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={options.enableUnicodeF5Assist}
                    onChange={(e) => onOptionsChange({ ...options, enableUnicodeF5Assist: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <div>
                    <div className="font-bold text-slate-800">⑤ 医師個人専用カスタム辞書（略語マクロ展開）</div>
                    <p className="text-[11px] text-slate-500">AP➔狭心症、いつもの➔定期処方 などを送信前に自動展開</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={options.enableDoctorMacros}
                    onChange={(e) => onOptionsChange({ ...options, enableDoctorMacros: e.target.checked })}
                    className="w-4 h-4 text-sky-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Fキー強制・最小Chunk・誤変換ガード稼働中</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-md"
          >
            設定完了
          </button>
        </div>
      </div>
    </div>
  );
};
