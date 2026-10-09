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
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { performLocalCameraOcr, type OcrProgressUpdate } from '../services/localOcrService';

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
  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // 端末のネイティブカメラ専用 input (capture="environment")
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // フォトライブラリ・ファイル選択専用 input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setExtractedText('');
      setRawOcrText('');
      setErrorMessage(null);
      setProcessingStatus('');
      setProgressPercent(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * 撮影された高解像度写真を、OCR認識精度を保ちながら
   * 最適な解像度（長辺最大2048px、JPEG品質0.85）にブラウザ内で高速自動圧縮
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

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

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

    if (file.size > 30 * 1024 * 1024) {
      setErrorMessage('画像サイズが大きすぎます (30MB以下を選択してください)');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('画像を最適化中...');
    setProgressPercent(5);
    setErrorMessage(null);

    try {
      const optimizedDataUrl = await compressAndOptimizeImage(file, 2048, 0.85);
      setCapturedImage(optimizedDataUrl);
      await runLocalOcr(optimizedDataUrl, ocrMode);
    } catch (err: any) {
      console.error('Image compression error:', err);
      setErrorMessage(err.message || '画像の処理に失敗しました。');
      setIsProcessing(false);
      setProcessingStatus('');
      setProgressPercent(0);
    }
  };

  // 完全ローカルOCR (Tesseract.js + WebLLM Qwen2.5 1.5B) 実行
  const runLocalOcr = async (base64Img: string, mode: 'chart' | 'soap' | 'prescription') => {
    setIsProcessing(true);
    setErrorMessage(null);
    setProgressPercent(10);

    try {
      const result = await performLocalCameraOcr(
        base64Img,
        mode,
        (update: OcrProgressUpdate) => {
          setProcessingStatus(update.message);
          setProgressPercent(Math.round(update.progress * 100));
        }
      );

      setExtractedText(result.text);
      setRawOcrText(result.rawOcrText);
    } catch (err: any) {
      console.error('[Local OCR Error]:', err);
      setErrorMessage(err.message || '文字認識処理中にエラーが発生しました');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 再撮影 / 別の写真を選択
  const handleReset = () => {
    setCapturedImage(null);
    setExtractedText('');
    setRawOcrText('');
    setErrorMessage(null);
    setProcessingStatus('');
    setProgressPercent(0);
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
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base leading-tight">カメラカルテOCR</h3>
                <span className="text-[10px] bg-white/20 text-white font-extrabold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Cpu className="w-2.5 h-2.5" />
                  完全ローカルAI
                </span>
              </div>
              <p className="text-[11px] text-teal-100 mt-0.5">
                Tesseract.js ＋ WebLLM (Qwen2.5 1.5B) による院内閉域文字認識
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* OCR Mode Selectors */}
        <div className="bg-slate-100 p-2 sm:px-4 flex items-center gap-2 border-b border-slate-200 text-xs shrink-0">
          <span className="text-slate-500 font-semibold text-[11px] pl-1">抽出形式:</span>
          <div className="flex gap-1.5 flex-1">
            <button
              type="button"
              onClick={() => {
                setOcrMode('chart');
                if (capturedImage && !isProcessing) runLocalOcr(capturedImage, 'chart');
              }}
              className={`flex-1 py-1 px-2 rounded-xl font-bold transition-all cursor-pointer ${
                ocrMode === 'chart'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              標準カルテ
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('soap');
                if (capturedImage && !isProcessing) runLocalOcr(capturedImage, 'soap');
              }}
              className={`flex-1 py-1 px-2 rounded-xl font-bold transition-all cursor-pointer ${
                ocrMode === 'soap'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              SOAP形式
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('prescription');
                if (capturedImage && !isProcessing) runLocalOcr(capturedImage, 'prescription');
              }}
              className={`flex-1 py-1 px-2 rounded-xl font-bold transition-all cursor-pointer ${
                ocrMode === 'prescription'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              処方箋・用法
            </button>
          </div>
        </div>

        {/* 隠し input 要素 */}
        {/* 1. 端末ネイティブカメラ専用 input */}
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
                  患者の個人情報は外部送信されず、端末内（WebGPU）で安全に処理されます
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
                    <div className="text-sm font-bold">アルバムから画像を選択</div>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      保存済みのスクリーンショットや撮影済み写真を使用
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
                  【医療プライバシー保護】画像・テキストデータは一切外部サーバーへ送信されません。すべてブラウザ内の閉域メモリ上で安全に解析されます。
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

          {/* Processing Indicator with Progress Bar */}
          {isProcessing && (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>{processingStatus || '解析中...'}</span>
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-emerald-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-200"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>
              <p className="text-[10px] text-emerald-700">
                ブラウザ内で Tesseract OCR ➔ WebLLM (Qwen2.5 1.5B) の2段階解析を実行中
              </p>
            </div>
          )}

          {/* OCR Result textarea */}
          {extractedText && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>校正済みカルテテキスト ({extractedText.length}文字)</span>
                </span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Qwen2.5 補正済
                </span>
              </div>
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={7}
                className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl leading-relaxed focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-900"
              />
            </div>
          )}
        </div>

        {/* Footer (Apply text buttons) */}
        {extractedText && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onApplyText(extractedText, 'replace');
                onClose();
              }}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer text-xs active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>カルテ欄を置き換える</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyText(extractedText, 'append');
                onClose();
              }}
              className="flex-1 py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-2xl border border-slate-300 flex items-center justify-center gap-2 transition-all cursor-pointer text-xs active:scale-98"
            >
              <FileText className="w-4 h-4 text-slate-500" />
              <span>末尾に追記する</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
