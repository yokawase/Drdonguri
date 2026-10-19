import React, { useState } from 'react';
import { Cpu, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { playMacBeep, playSosumi } from '../utils/macAudio';
import {
  formatMedicalChartWithWebLLM,
  buildGemma2MedicalPrompt,
  generateSafeFallbackChart,
  hasMultilingualArtifacts,
  isWebGpuSupported,
  isEngineLoaded,
  clearWebLlmCache,
  GEMMA_2_JPN_MODEL,
  type ModelLoadProgress,
} from '../services/webLlmService';
import { cleanExtractedMedicalText } from '../utils/chartTextCleaner';

interface AiAssistModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalText: string;
  onApplyFormattedText: (newText: string) => void;
}

export const AiAssistModal: React.FC<AiAssistModalProps> = ({
  isOpen,
  onClose,
  originalText,
  onApplyFormattedText,
}) => {
  const [style, setStyle] = useState<'soap' | 'concise' | 'interview'>('soap');
  const [isLoading, setIsLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState<boolean>(false);

  if (!isOpen) return null;

  const cleanedOriginal = cleanExtractedMedicalText(
    originalText || '発熱 38.2度 喉が痛い 咳少し あり アセトアミノフェン 処方'
  );
  const activePromptSpec = buildGemma2MedicalPrompt(cleanedOriginal, style);

  const handleClearCache = async () => {
    try {
      playMacBeep();
      setCacheStatus('キャッシュ消去中...');
      await clearWebLlmCache();
      setCacheStatus('IndexedDBキャッシュを消去しました。次回起動時に新モデルをロードします。');
      setTimeout(() => setCacheStatus(null), 4000);
    } catch (e: any) {
      setCacheStatus(`消去失敗: ${e.message}`);
    }
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResultText('');
    setLoadStatus('Gemma 2 日本語モデル 高精度プロンプト推論準備中...');
    setProgressPercent(15);
    playMacBeep();

    const targetText = cleanedOriginal;

    if (!isWebGpuSupported()) {
      // WebGPU非対応端末でも臨床ルールベース校正エンジンで即座にSOAP/箇条書き要約を生成
      const fallbackFormatted = generateSafeFallbackChart(targetText, style);
      setResultText(fallbackFormatted);
      setError('WebGPU非対応環境のため、内蔵の臨床構造化ルールエンジンでSOAP/箇条書き校正を実行しました。');
      setIsLoading(false);
      setLoadStatus('');
      setProgressPercent(0);
      return;
    }

    try {
      const formatted = await formatMedicalChartWithWebLLM(
        targetText,
        style,
        (report: ModelLoadProgress) => {
          setLoadStatus(report.text || '推論処理中...');
          setProgressPercent(Math.round(report.progress * 100));
        },
        (streamedText: string) => {
          if (!hasMultilingualArtifacts(streamedText)) {
            setResultText(streamedText);
            setLoadStatus('テキスト出力中...');
          }
        },
        GEMMA_2_JPN_MODEL
      );

      setResultText(cleanExtractedMedicalText(formatted));
      playSosumi();
    } catch (err: any) {
      console.error('[WebLLM Error]:', err);
      const fallbackFormatted = generateSafeFallbackChart(targetText, style);
      setResultText(fallbackFormatted);
      setError(`WebLLM推論フォールバック適用: 内蔵ルールエンジンで${style === 'soap' ? 'SOAP形式' : style === 'concise' ? '箇条書き要約' : '問診・現病歴'}に整形しました`);
      playSosumi();
    } finally {
      setIsLoading(false);
      setLoadStatus('');
      setProgressPercent(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md select-none overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-[#0F172A] border border-slate-700/80 rounded-2xl max-w-xl w-full text-slate-100 shadow-2xl max-h-[92vh] flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="bg-[#1E293B] border-b border-slate-800 p-3.5 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              aria-label="戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>戻る</span>
            </button>
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">Gemma 2 高精度カルテ文章校正</h3>
                <span className="text-[10px] bg-slate-800 text-purple-400 border border-slate-700 font-bold px-2 py-0.5 rounded-full">
                  SOAP / 箇条書き要約
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Google Gemma 2 2B (FP32) 専用医療プロンプトによる完全オフライン文章校正
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playMacBeep();
              onClose();
            }}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 bg-[#0F172A] overflow-y-auto flex-1 text-xs">
          {/* Model Info Banner */}
          <div className="border border-slate-800 p-2.5 rounded-xl bg-[#1E293B]/70 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-400 text-[11px]">エンジン:</span>
              <span className="text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-600/50 px-2 py-0.5 rounded-full">
                Gemma 2 日本語 (2B FP32)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowPromptPreview(prev => !prev)}
                className="text-[10px] px-2 py-0.5 rounded-lg border border-purple-500/40 bg-purple-950/50 hover:bg-purple-900/60 text-purple-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                {showPromptPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showPromptPreview ? 'プロンプト隠す' : 'プロンプト仕様確認'}</span>
              </button>
              <button
                type="button"
                onClick={handleClearCache}
                className="text-[10px] px-2 py-0.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer transition-colors"
                title="ブラウザ内にキャッシュされたモデル重みを消去してリフレッシュします"
              >
                🔄 キャッシュ消去
              </button>
            </div>
          </div>

          {cacheStatus && (
            <div className="p-2 bg-amber-950/40 border border-amber-600/50 text-amber-300 rounded-xl text-[10px] font-bold">
              ⚡ {cacheStatus}
            </div>
          )}

          {/* Format style selector */}
          <div className="border border-slate-700/80 p-3 bg-[#1E293B] rounded-xl space-y-2">
            <div className="flex justify-between items-center font-bold text-xs text-slate-200">
              <span>校正・構造化プロンプトを選択:</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {isEngineLoaded() ? '● ロード済 (即時推論)' : '○ 初回のみ高速ロード / 即時整形対応'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('soap');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  style === 'soap'
                    ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                SOAP形式 (厳密分類)
              </button>
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('concise');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  style === 'concise'
                    ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                箇条書き要約
              </button>
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('interview');
                }}
                className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  style === 'interview'
                    ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                問診・現病歴
              </button>
            </div>
            <div className="text-[10px] text-slate-400 bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-800">
              {style === 'soap' && '💡 S(主観的訴え・現病歴) / O(バイタル・身体所見・検査・処方歴) / A(鑑別診断・重症度評価) / P(検査・処方・指導方針) に厳密分離し、ハルシネーションと無駄な空白を排除します。'}
              {style === 'concise' && '💡 医師の申し送り・紹介状向けに【臨床経過・主訴】【主要所見・バイタル・内服】【アセスメント・方針】の簡潔な体言止め箇条書きに要約します。'}
              {style === 'interview' && '💡 音声認識特有のフィラーや助詞抜けを補正し、【主訴】【現病歴】【既往歴・内服薬】【身体所見・検査】【アセスメント・プラン】に自然な医学表現で清書します。'}
            </div>
          </div>

          {/* Gemma 2 Prompt Inspector */}
          {showPromptPreview && (
            <div className="border border-purple-500/40 bg-purple-950/20 p-2.5 rounded-xl space-y-1.5">
              <div className="text-[10px] font-bold text-purple-300 flex items-center justify-between">
                <span>📋 Gemma 2 実行プロンプト ({style === 'soap' ? 'SOAP形式' : style === 'concise' ? '箇条書き要約' : '問診・現病歴'})</span>
                <span className="font-mono text-[9px] text-purple-400">temperature: 0.0 / 事実改変禁止</span>
              </div>
              <pre className="text-[10px] font-mono text-slate-300 bg-slate-950/80 p-2 rounded-lg max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                {activePromptSpec}
              </pre>
            </div>
          )}

          {/* Original text preview */}
          <div className="space-y-1">
            <div className="flex justify-between font-bold text-[11px] text-slate-300">
              <span>元テキスト (無駄なスペース・改行削除済):</span>
              <span className="text-slate-400 font-mono">{cleanedOriginal.length} 文字</span>
            </div>
            <div className="border border-slate-700/80 p-2.5 bg-[#1E293B] rounded-xl max-h-24 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
              {cleanedOriginal}
            </div>
          </div>

          {/* Progress / Loading UI */}
          {isLoading && (
            <div className="border border-purple-600/40 p-3 bg-purple-950/30 rounded-xl space-y-2">
              <div className="flex justify-between text-[11px] font-bold">
                <span className="text-purple-300">⚡ {loadStatus || 'WebLLM 処理中...'}</span>
                <span className="text-purple-300 font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-800 border border-slate-700 rounded-full h-2.5 overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-150"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400">
                ※端末内WebGPUで完全ローカル推論中。外部通信なし・個人情報保護
              </p>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="border border-rose-600/50 p-2.5 bg-rose-950/50 text-xs font-bold text-rose-300 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          {/* Result preview */}
          {(resultText || isLoading) && (
            <div className="space-y-1">
              <div className="flex justify-between items-center font-bold text-[11px] text-slate-300">
                <span>
                  校正結果 ({style === 'soap' ? 'SOAP形式' : style === 'concise' ? '箇条書き' : '問診形式'}):
                </span>
                {isLoading && <span className="text-[10px] text-emerald-400 animate-pulse font-bold">● リアルタイム生成中</span>}
              </div>
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="AIがリアルタイムに校正テキストを出力します..."
                rows={6}
                className="w-full border border-slate-700/80 p-3 bg-[#0F172A] rounded-xl font-mono text-xs text-slate-100 leading-relaxed placeholder:text-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
              />
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex justify-between items-center pt-3 border-t border-slate-800">
            <button
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
            >
              閉じる
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-[0_0_12px_rgba(168,85,247,0.3)] transition-colors cursor-pointer"
              >
                {isLoading ? '高速推論中...' : 'WebLLM 校正実行 ⚡'}
              </button>

              {resultText && (
                <button
                  onClick={() => {
                    playMacBeep();
                    onApplyFormattedText(resultText);
                    onClose();
                  }}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-colors cursor-pointer"
                >
                  カルテに反映 ↩
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
