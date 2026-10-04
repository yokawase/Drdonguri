import React, { useState } from 'react';
import { playMacBeep, playSosumi } from '../utils/macAudio';

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
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    playMacBeep();

    const styleLabels = {
      soap: '医療標準SOAP形式（S:主訴, O:客観的所見/バイタル, A:評価/病名, P:治療方針/処方）',
      concise: '電子カルテ箇条書き（簡潔かつ要約された記録）',
      interview: '問診票・現病歴要約形式',
    };

    try {
      const res = await fetch('/api/ai/format-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: originalText || '発熱 38.2度 喉が痛い 咳少し あり アセトアミノフェン 処方',
          formatStyle: styleLabels[style],
          mode: 'romaji_assist',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AI整形に失敗しました');
      }

      const data = await res.json();
      setResultText(data.formattedText);
      playSosumi();
    } catch (err: any) {
      console.error(err);
      setError(err.message || '通信エラーが発生しました');
      playSosumi();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/30 backdrop-blur-[1px]">
      <div
        className="mac-window max-w-xl w-full bg-white text-xs select-none"
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
          <div className="bg-white border border-black px-2.5 py-0.2 font-bold text-xs tracking-wider">
            AI カルテ校正 (Desk Accessory)
          </div>
          <div className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] flex items-center justify-center">
            <div className="w-1.5 h-1.5 border border-black" />
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Format style selector */}
          <div className="border border-black p-2.5 bg-white space-y-1.5">
            <div className="font-bold">整形スタイルを選択:</div>
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
            <div className="border border-black p-2 bg-white max-h-24 overflow-y-auto font-mono text-[11px] leading-relaxed shadow-[inset_1px_1px_0_#000]">
              {originalText || <span className="text-gray-400">（テキスト未入力：サンプルテキストで実行します）</span>}
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="border-2 border-black p-2 bg-white text-xs font-bold text-red-600">
              ⚠️ {error}
            </div>
          )}

          {/* Result preview */}
          {resultText && (
            <div className="space-y-1">
              <div className="font-bold text-[11px]">校正結果 (SOAP形式):</div>
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
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
              className="mac-btn"
            >
              キャンセル
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="mac-btn font-bold"
              >
                {isLoading ? 'AI校正中...' : 'AI校正を実行 ⚡'}
              </button>

              {resultText && (
                <div className="mac-btn-default-wrapper">
                  <button
                    onClick={() => {
                      playMacBeep();
                      onApplyFormattedText(resultText);
                      onClose();
                    }}
                    className="mac-btn mac-btn-default font-bold px-4"
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
