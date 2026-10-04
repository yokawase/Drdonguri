import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  Upload, 
  X, 
  Sparkles, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  FileText, 
  ScanLine,
  Image as ImageIcon,
  Smartphone,
  ShieldCheck
} from 'lucide-react';

interface CameraOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyText: (text: string, mode: 'replace' | 'append') => void;
}

export const CameraOcrModal: React.FC<CameraOcrModalProps> = ({
  isOpen,
  onClose,
  onApplyText,
}) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrMode, setOcrMode] = useState<'chart' | 'soap' | 'prescription'>('chart');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 端末のネイティブカメラ専用 input (capture="environment")
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // フォトライブラリ・ファイル選択専用 input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [processingStatus, setProcessingStatus] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setExtractedText('');
      setErrorMessage(null);
      setProcessingStatus('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * 撮影された高解像度写真を、OCR認識精度を保ちながら
   * 通信に適したサイズ（長辺最大2048px、JPEG品質0.85）にブラウザ内で高速自動圧縮
   */
  const compressAndOptimizeImage = (fileOrDataUrl: File | string, maxDimension = 2048, quality = 0.85): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
          return;
        }

        // 高品質画像スムージング
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG品質 0.85 で書き出し（OCRに最適でファイルサイズは数百KBに圧縮）
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        reject(new Error('画像の展開に失敗しました。対応画像形式をご確認ください。'));
      };

      if (typeof fileOrDataUrl === 'string') {
        img.src = fileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target?.result as string;
        };
        reader.onerror = () => reject(new Error('画像ファイルの読み込みに失敗しました'));
        reader.readAsDataURL(fileOrDataUrl);
      }
    });
  };

  // 画像ファイル処理 (端末カメラ撮影またはファイル選択)
  const handleImageFile = async (file?: File) => {
    if (!file) return;

    // ファイルサイズ検証 (30MB以下)
    if (file.size > 30 * 1024 * 1024) {
      setErrorMessage('画像サイズが大きすぎます (30MB以下を選択してください)');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('画像を医療OCR向けに最適化中...');
    setErrorMessage(null);

    try {
      // ブラウザ内Canvasで高解像度写真をOCR最適解像度に自動圧縮 (数MB〜数十MB -> 数百KB)
      const optimizedDataUrl = await compressAndOptimizeImage(file, 2048, 0.85);
      setCapturedImage(optimizedDataUrl);
      await runOcr(optimizedDataUrl, ocrMode);
    } catch (err: any) {
      console.error('Image compression error:', err);
      setErrorMessage(err.message || '画像の処理に失敗しました。');
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Gemini OCR 実行
  const runOcr = async (base64Img: string, mode: 'chart' | 'soap' | 'prescription') => {
    setIsProcessing(true);
    setProcessingStatus('Gemini AIが医療用語・電子カルテテキストを高精度解析中...');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/ai/ocr-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Img,
          mimeType: 'image/jpeg',
          mode,
        }),
      });

      // HTMLエラーページ等が返ってきた場合に備えて安全にテキストを取得・パース
      const responseText = await res.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('Non-JSON server response:', responseText.slice(0, 300));
        if (res.status === 413) {
          throw new Error('画像サイズがサーバーの上限を超えました。自動最適化された画像をお試しください。');
        }
        if (res.status === 503) {
          throw new Error('AIモデルが現在混雑しています。数秒後に再度お試しください。');
        }
        throw new Error(`サーバーから予期しない応答が返されました (Status: ${res.status})。時間をおいて再試行してください。`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `文字認識に失敗しました (Status: ${res.status})`);
      }

      setExtractedText(data.text || '');
    } catch (err: any) {
      console.error('OCR Error:', err);
      setErrorMessage(err.message || 'OCR処理中にエラーが発生しました');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 再撮影 / 別の写真を選択
  const handleReset = () => {
    setCapturedImage(null);
    setExtractedText('');
    setErrorMessage(null);
    setProcessingStatus('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-linear-to-r from-teal-700 via-emerald-700 to-sky-700 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base flex items-center gap-1.5">
                <span>電カル画面・紹介状 カメラOCR取込</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-400/30 text-emerald-200 text-[10px] font-bold">
                  Gemini AI
                </span>
              </h3>
              <p className="text-[11px] text-teal-100">
                端末カメラで撮影した写真から高精度テキスト抽出 ➔ どんぐり君で即時打鍵
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

        {/* Mode Selector */}
        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] font-bold text-slate-600">抽出モード:</span>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => {
                setOcrMode('chart');
                if (capturedImage) runOcr(capturedImage, 'chart');
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                ocrMode === 'chart'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
              }`}
            >
              標準カルテ
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('soap');
                if (capturedImage) runOcr(capturedImage, 'soap');
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                ocrMode === 'soap'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
              }`}
            >
              SOAP形式
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('prescription');
                if (capturedImage) runOcr(capturedImage, 'prescription');
              }}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                ocrMode === 'prescription'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200'
              }`}
            >
              処方箋・薬品
            </button>
          </div>
        </div>

        {/* Hidden File Inputs */}
        {/* 1. 端末カメラ直接起動用 input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleImageFile(e.target.files?.[0])}
          className="hidden"
        />
        {/* 2. アルバム・画像ファイル選択用 input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleImageFile(e.target.files?.[0])}
          className="hidden"
        />

        {/* Body content (Scrollable) */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Initial Selection State or Captured Image Preview */}
          {!capturedImage ? (
            <div className="space-y-3">
              <div className="text-center py-2">
                <p className="text-xs font-semibold text-slate-700">
                  電子カルテ画面、紙の紹介状、検査報告書を撮影してください
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  OS標準のカメラアプリが高解像度・自動フォーカスで起動します
                </p>
              </div>

              {/* Main Action 1: 端末カメラ起動 */}
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full p-4 rounded-2xl bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold flex items-center justify-between shadow-md active:scale-99 transition-all cursor-pointer group border border-emerald-400/40"
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                      <span>端末カメラで撮影する</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/20 text-emerald-100 text-[10px] font-bold">
                        推奨
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100 font-normal mt-0.5">
                      背面カメラが直接起動し、くっきり高画質で撮影できます
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center text-xs font-semibold text-emerald-100 pl-2">
                  撮影 ➔
                </div>
              </button>

              {/* Main Action 2: 写真ファイル・アルバム選択 */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold flex items-center justify-between border border-slate-300 transition-all cursor-pointer group active:scale-99"
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-10 h-10 rounded-xl bg-slate-200/80 flex items-center justify-center shrink-0 text-slate-700">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      撮影済みの写真ファイルを選択
                    </div>
                    <p className="text-xs text-slate-500 font-normal">
                      フォトライブラリまたはPC・端末内の画像からOCR実行
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-400 pr-2">
                  選択 ➔
                </div>
              </button>

              <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl text-[11px] text-sky-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <span>
                  端末ネイティブカメラを使用するため、ブラウザの権限競合を起こさず確実に起動します。撮影した画像はOCR処理後に安全に破棄されます。
                </span>
              </div>
            </div>
          ) : (
            /* Captured Image Display & Retake */
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-16/9 max-h-56 flex items-center justify-center border border-slate-200 shadow-inner">
                <img
                  src={capturedImage}
                  alt="撮影したカルテ画像"
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={handleReset}
                  className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xs cursor-pointer shadow-md"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>撮り直す / 変更</span>
                </button>
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-center gap-3 text-emerald-800 text-xs font-bold animate-pulse">
              <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
              <span>{processingStatus || 'Gemini AIが医療用語・電子カルテテキストを高精度解析中...'}</span>
            </div>
          )}

          {/* OCR Result textarea */}
          {extractedText && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>OCR認識結果 ({extractedText.length}文字)</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  ※必要に応じて直接編集可能です
                </span>
              </div>
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={6}
                className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl leading-relaxed focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900"
              />
            </div>
          )}
        </div>

        {/* Footer (Apply text buttons) */}
        {extractedText && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onApplyText(extractedText, 'append');
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>現在の文章の末尾に追記</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyText(extractedText, 'replace');
                onClose();
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>カルテ入力欄に反映して閉じる</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
