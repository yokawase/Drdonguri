import React, { useState } from 'react';
import { playMacBeep, playSosumi } from '../utils/macAudio';
import {
  formatMedicalChartWithWebLLM,
  isWebGpuSupported,
  isEngineLoaded,
  FAST_WEBLLM_MODEL,
  PRECISE_WEBLLM_MODEL,
  type ModelLoadProgress,
} from '../services/webLlmService';

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
  const [modelType, setModelType] = useState<'fast' | 'precise'>('fast');
  const [isLoading, setIsLoading] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setResultText(''); // 前回の結果をクリアしてストリーミングに備える
    setLoadStatus('WebLLM 初期化中...');
    setProgressPercent(15);
    playMacBeep();

    if (!isWebGpuSupported()) {
      setError('お使いのブラウザはWebGPUに対応していません。最新のChromeまたはEdgeをご使用ください。');
      setIsLoading(false);
      return;
    }

    const selectedModelId = modelType === 'fast' ? FAST_WEBLLM_MODEL : PRECISE_WEBLLM_MODEL;

    try {
      const targetText =
        originalText || '発熱 38.2度 喉が痛い 咳少し あり アセトアミノフェン 処方';

      const formatted = await formatMedicalChartWithWebLLM(
        targetText,
        style,
        (report: ModelLoadProgress) => {
          setLoadStatus(report.text || '推論処理中...');
          setProgressPercent(Math.round(report.progress * 100));
        },
        // ★ リアルタイムストリーミング更新
        (streamedText: string) => {
          setResultText(streamedText);
          setLoadStatus('テキスト出力中...');
        },
        selectedModelId
      );

      setResultText(formatted);
      playSosumi();
    } catch (err: any) {
      console.error('[WebLLM Error]:', err);
      setError(err.message || 'WebLLMでのカルテ整形に失敗しました');
      playSosumi();
    } finally {
      setIsLoading(false);
      setLoadStatus('');
      setProgressPercent(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 select-none">
      <div
        className="mac-window max-w-xl w-full bg-white text-xs shadow-2xl border-2 border-black"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        {/* Title Bar */}
        <div className="h-6 mac-title-stripes border-b border-black flex items-center justify-between px-2">
          <button
            onClick={() => {
              playMacBeep();
              onClose();
            }}
            className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] active:bg-black cursor-pointer"
            title="閉じる"
          />
          <div className="bg-white border border-black px-2 py-0.2 font-bold text-xs tracking-wider flex items-center gap-1.5">
            <span>AI カルテ校正 (WebLLM)</span>
            <span className="text-[10px] bg-black text-white px-1">完全ローカル</span>
          </div>
          <div className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] flex items-center justify-center">
            <div className="w-1.5 h-1.5 border border-black" />
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3 bg-white">
          {/* Model Speed Selector */}
          <div className="border border-black p-2 bg-gray-50 flex items-center justify-between">
            <span className="font-bold text-[11px]">AIモデル速度:</span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setModelType('fast')}
                className={`px-2 py-0.5 border border-black text-[10px] font-bold cursor-pointer transition-colors ${
                  modelType === 'fast' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                }`}
              >
                ⚡ 超高速 (0.5B 約3秒)
              </button>
              <button
                type="button"
                onClick={() => setModelType('precise')}
                className={`px-2 py-0.5 border border-black text-[10px] font-bold cursor-pointer transition-colors ${
                  modelType === 'precise' ? 'bg-black text-white' : 'bg-white hover:bg-gray-100'
                }`}
              >
                🎯 高精度 (1.5B)
              </button>
            </div>
          </div>

          {/* Format style selector */}
          <div className="border border-black p-2.5 bg-white space-y-1.5">
            <div className="flex justify-between items-center font-bold">
              <span>整形スタイルを選択:</span>
              <span className="text-[10px] text-gray-600 font-normal">
                {isEngineLoaded() ? '● ロード済 (即時推論)' : '○ 初回のみ高速ダウンロード'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('soap');
                }}
                className={`mac-btn py-1.5 text-xs ${style === 'soap' ? 'bg-black text-white font-bold' : ''}`}
              >
                SOAP形式
              </button>
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('concise');
                }}
                className={`mac-btn py-1.5 text-xs ${style === 'concise' ? 'bg-black text-white font-bold' : ''}`}
              >
                箇条書き要約
              </button>
              <button
                type="button"
                onClick={() => {
                  playMacBeep();
                  setStyle('interview');
                }}
                className={`mac-btn py-1.5 text-xs ${style === 'interview' ? 'bg-black text-white font-bold' : ''}`}
              >
                問診・現病歴
              </button>
            </div>
          </div>

          {/* Original text preview */}
          <div className="space-y-1">
            <div className="flex justify-between font-bold text-[11px]">
              <span>元テキスト:</span>
              <span>{originalText.length} 文字</span>
            </div>
            <div className="border border-black p-2 bg-white max-h-20 overflow-y-auto font-mono text-[11px] leading-relaxed shadow-[inset_1px_1px_0_#000]">
              {originalText || <span className="text-gray-400">（テキスト未入力：サンプルテキストで実行します）</span>}
            </div>
          </div>

          {/* Progress / Loading UI (フラッシュ点滅を完全撤廃し、安定したMac風プログレス表示) */}
          {isLoading && (
            <div className="border-2 border-black p-2.5 bg-gray-100 space-y-1.5">
              <div className="flex justify-between text-[11px] font-bold">
                <span>⚡ {loadStatus || 'WebLLM 処理中...'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-white border border-black h-3.5 p-0.5">
                <div
                  className="bg-black h-full transition-all duration-150"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-600">
                ※端末内WebGPUで完全ローカル推論中。外部通信なし・個人情報保護
              </p>
            </div>
          )}

          {/* Error notice */}
          {error && (
            <div className="border-2 border-black p-2 bg-white text-xs font-bold text-red-600">
              ⚠️ {error}
            </div>
          )}

          {/* Result preview (ストリーミング中はリアルタイムに文字が追加される) */}
          {(resultText || isLoading) && (
            <div className="space-y-1">
              <div className="flex justify-between items-center font-bold text-[11px]">
                <span>
                  校正結果 ({style === 'soap' ? 'SOAP形式' : style === 'concise' ? '箇条書き' : '問診形式'}):
                </span>
                {isLoading && <span className="text-[10px] text-emerald-700 animate-pulse">● リアルタイム生成中</span>}
              </div>
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="AIがリアルタイムに校正テキストを出力します..."
                rows={6}
                className="w-full border border-black p-2 bg-white font-mono text-xs leading-relaxed focus:outline-none shadow-[inset_1px_1px_0_#000]"
              />
            </div>
          )}

          {/* Bottom Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-black">
            <button
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="mac-btn cursor-pointer"
            >
              閉じる
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="mac-btn font-bold cursor-pointer"
              >
                {isLoading ? '高速推論中...' : 'WebLLM 校正実行 ⚡'}
              </button>

              {resultText && (
                <div className="mac-btn-default-wrapper">
                  <button
                    onClick={() => {
                      playMacBeep();
                      onApplyFormattedText(resultText);
                      onClose();
                    }}
                    className="mac-btn mac-btn-default font-bold px-4 cursor-pointer"
                  >
                    カルテに反映 ↩
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
