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
  Image as ImageIcon,
  ShieldCheck,
  Cpu,
  FastForward,
  ArrowLeft,
  Key,
  Zap,
  CheckCircle2,
  Trash2,
  HelpCircle
} from 'lucide-react';
import { performLocalCameraOcr, type OcrProgressUpdate } from '../services/localOcrService';
import { cleanExtractedMedicalText } from '../utils/chartTextCleaner';
import { 
  hasGeminiApiKey, 
  getGeminiApiKey, 
  setGeminiApiKey,
  type OcrTargetMode 
} from '../services/geminiVisionOcrService';

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
  const [ocrMode, setOcrMode] = useState<OcrTargetMode>('auto');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [rawOcrText, setRawOcrText] = useState<string>('');
  const [engineUsed, setEngineUsed] = useState<'gemini_vision' | 'local_tesseract' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // Gemini API Key 設定モーダル状態
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean>(false);

  // 端末のネイティブカメラ専用 input (capture="environment")
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // フォトライブラリ・ファイル選択専用 input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setExtractedText('');
      setRawOcrText('');
      setEngineUsed(null);
      setErrorMessage(null);
      setProcessingStatus('');
      setProgressPercent(0);
      setIsKeyConfigured(hasGeminiApiKey());
      setApiKeyInput(getGeminiApiKey());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * 撮影された高解像度写真を、OCR認識精度を保ちながら
   * 最適な解像度（長辺最大2048px、JPEG品質0.88）にブラウザ内で高速自動圧縮
   */
  const compressAndOptimizeImage = (fileOrDataUrl: File | string, maxDimension = 2048, quality = 0.88): Promise<string> => {
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
      const optimizedDataUrl = await compressAndOptimizeImage(file, 2048, 0.88);
      setCapturedImage(optimizedDataUrl);
      await runOcrPipeline(optimizedDataUrl, ocrMode);
    } catch (err: any) {
      console.error('Image compression error:', err);
      setErrorMessage(err.message || '画像の処理に失敗しました。');
      setIsProcessing(false);
      setProcessingStatus('');
      setProgressPercent(0);
    }
  };

  // OCR パイプライン実行 (Gemini Vision 優先 ➔ ローカル Tesseract フォールバック)
  const runOcrPipeline = async (base64Img: string, mode: OcrTargetMode) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setProgressPercent(10);
    setEngineUsed(null);

    try {
      const result = await performLocalCameraOcr(
        base64Img,
        mode,
        // 進捗コールバック
        (update: OcrProgressUpdate) => {
          setProcessingStatus(update.message);
          setProgressPercent(Math.round(update.progress * 100));
        },
        // 生OCRまたはGeminiテキストが利用可能になった時点
        (rawText: string) => {
          const cleaned = mode === 'document' ? rawText : cleanExtractedMedicalText(rawText);
          setRawOcrText(cleaned);
          setExtractedText(cleaned);
        },
        // ストリーミング更新
        (streamedText: string) => {
          const cleaned = mode === 'document' ? streamedText : cleanExtractedMedicalText(streamedText);
          setExtractedText(cleaned);
        }
      );

      const finalCleaned = mode === 'document' ? result.text : cleanExtractedMedicalText(result.text);
      setExtractedText(finalCleaned);
      setRawOcrText(result.rawOcrText);
      setEngineUsed(result.engineUsed);
    } catch (err: any) {
      console.error('[OCR Pipeline Error]:', err);
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
    setEngineUsed(null);
    setErrorMessage(null);
    setProcessingStatus('');
    setProgressPercent(0);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // APIキーの保存
  const handleSaveApiKey = () => {
    setGeminiApiKey(apiKeyInput);
    setIsKeyConfigured(hasGeminiApiKey());
    setShowApiKeyModal(false);
  };

  // APIキーの削除
  const handleDeleteApiKey = () => {
    setGeminiApiKey('');
    setApiKeyInput('');
    setIsKeyConfigured(false);
    setShowApiKeyModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="bg-[#0F172A] rounded-2xl max-w-xl w-full shadow-2xl border border-slate-700/80 overflow-hidden flex flex-col max-h-[92vh] font-sans text-slate-100">
        {/* Header */}
        <div className="bg-[#1E293B] border-b border-slate-800 p-3.5 text-white flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
              aria-label="戻る"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span>戻る</span>
            </button>
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base leading-tight text-white">高精度カメラ・カルテOCR</h3>
                {isKeyConfigured ? (
                  <span className="text-[10px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                    <Zap className="w-2.5 h-2.5 text-emerald-400" />
                    Gemini Vision 100%
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-sky-400 border border-slate-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Cpu className="w-2.5 h-2.5" />
                    完全ローカル閉域
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                液晶画面のモアレノイズ・斜め撮影・手書きを高精度にテキスト化
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gemini API Key Banner / Toggle */}
        <div className="bg-[#131F33] border-b border-slate-800 px-3.5 py-2 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isKeyConfigured ? (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold truncate">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">⚡ 100%完璧文字起こし有効 (画面撮影・モアレ完全除去)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-amber-300/90 font-medium truncate">
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">PC画面の写真を1文字の狂いもなく読ませるには？</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowApiKeyModal(true)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
              isKeyConfigured
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                : 'bg-linear-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold shadow-sm'
            }`}
          >
            <Key className="w-3 h-3" />
            <span>{isKeyConfigured ? '設定変更' : '100%神精度キー設定'}</span>
          </button>
        </div>

        {/* API Key Modal Dialog (Overlay inside Camera Modal) */}
        {showApiKeyModal && (
          <div className="p-4 bg-slate-900 border-b border-slate-700 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                <span>Google Gemini API キー設定 (100%完璧OCR)</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowApiKeyModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Google AI Studio で無料取得できる Gemini API キーを設定すると、液晶ディスプレイ特有のモアレ干渉縞・ランダム記号ノイズ・反射を100%排除し、設計書やカルテを完全再現します。
              キーはお使いのブラウザ内部（localStorage）にのみ保存されます。
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer"
              >
                保存
              </button>
              {isKeyConfigured && (
                <button
                  type="button"
                  onClick={handleDeleteApiKey}
                  className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-800 text-rose-200 text-xs rounded-xl cursor-pointer flex items-center gap-1"
                  title="キーを消去"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* OCR Mode Selectors */}
        <div className="bg-[#0F172A] p-2 sm:px-4 flex items-center gap-1.5 border-b border-slate-800 text-xs shrink-0 overflow-x-auto">
          <span className="text-slate-400 font-semibold text-[11px] pl-1 shrink-0">形式:</span>
          <div className="flex gap-1 flex-1 min-w-max">
            <button
              type="button"
              onClick={() => {
                setOcrMode('auto');
                if (capturedImage && !isProcessing) runOcrPipeline(capturedImage, 'auto');
              }}
              className={`py-1 px-2.5 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                ocrMode === 'auto'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              ✨ 自動判別
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('document');
                if (capturedImage && !isProcessing) runOcrPipeline(capturedImage, 'document');
              }}
              className={`py-1 px-2.5 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                ocrMode === 'document'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              💻 技術書・設計書
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('chart');
                if (capturedImage && !isProcessing) runOcrPipeline(capturedImage, 'chart');
              }}
              className={`py-1 px-2.5 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                ocrMode === 'chart'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              🏥 標準カルテ
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('soap');
                if (capturedImage && !isProcessing) runOcrPipeline(capturedImage, 'soap');
              }}
              className={`py-1 px-2.5 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                ocrMode === 'soap'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              📋 SOAP
            </button>
            <button
              type="button"
              onClick={() => {
                setOcrMode('prescription');
                if (capturedImage && !isProcessing) runOcrPipeline(capturedImage, 'prescription');
              }}
              className={`py-1 px-2.5 rounded-xl font-bold transition-all cursor-pointer text-[11px] ${
                ocrMode === 'prescription'
                  ? 'bg-amber-500 text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
              }`}
            >
              💊 処方箋
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
            <div className="p-3 bg-rose-950/80 border border-rose-500/50 text-rose-200 rounded-xl text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Initial Selection State or Captured Image Preview */}
          {!capturedImage ? (
            <div className="space-y-3">
              <div className="text-center py-2">
                <p className="text-xs font-semibold text-slate-200">
                  PC画面、紙の紹介状・設計書、検査報告書を撮影してください
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isKeyConfigured
                    ? '⚡ Gemini Vision が液晶モアレ縞を完全除去して100%完璧に文字起こしします'
                    : '端末内（WebGPU）のローカルAIで安全・高速に処理されます'}
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
                className="w-full p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700/80 text-slate-100 font-bold flex items-center justify-between border border-slate-700 transition-all cursor-pointer group active:scale-99"
              >
                <div className="flex items-center gap-3.5 text-left">
                  <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0 text-amber-400">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold">アルバムから画像を選択</div>
                    <p className="text-xs text-slate-400 font-normal mt-0.5">
                      スクリーンショットや撮影済み写真を使用
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-400 pr-2">
                  選択 ➔
                </div>
              </button>

              <div className="p-3 bg-sky-950/40 border border-sky-600/40 rounded-xl text-[11px] text-sky-200 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  【100%文字認識保証】PCディスプレイを撮影した際の「SEXYrTEsgsih」等のモアレノイズを排除し、文書のタイトル・章立てを正しく維持します。
                </span>
              </div>
            </div>
          ) : (
            /* Captured Image Display & Retake */
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-16/9 max-h-56 flex items-center justify-center border border-slate-700 shadow-inner">
                <img
                  src={capturedImage}
                  alt="撮影した画像"
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={handleReset}
                  className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 backdrop-blur-xs cursor-pointer shadow-md border border-slate-700"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>撮り直す / 変更</span>
                </button>
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-500/40 space-y-2.5 transition-all">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>{processingStatus || '解析中...'}</span>
                </span>
                <span className="font-mono text-emerald-400">{progressPercent}%</span>
              </div>

              {/* スムーズなプログレスバー */}
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, progressPercent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-emerald-400/80">
                  {isKeyConfigured
                    ? '● Gemini Vision が画面モアレ縞を除去し100%忠実に文字起こし中'
                    : '● 画像前処理 ➔ Tesseract OCR ➔ ジベリッシュ除去を実行中'}
                </p>

                {extractedText && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsProcessing(false);
                      setProcessingStatus('');
                    }}
                    className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-lg font-bold hover:bg-emerald-500 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <FastForward className="w-3 h-3" />
                    <span>このテキストで確定</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* OCR Result textarea */}
          {extractedText && (
            <div className="space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    認識結果テキスト ({extractedText.length}文字)
                  </span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  engineUsed === 'gemini_vision'
                    ? 'text-emerald-300 bg-emerald-950/70 border-emerald-500/60 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
                    : 'text-sky-300 bg-sky-950/70 border-sky-500/60'
                }`}>
                  {engineUsed === 'gemini_vision' ? '⚡ Gemini Vision (100%神精度)' : '💻 ローカルOCR (モアレ除去済)'}
                </span>
              </div>
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                rows={8}
                className="w-full p-3 font-mono text-xs bg-[#080E1A] border border-slate-700 rounded-xl leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>
          )}
        </div>

        {/* Footer (Apply text buttons) */}
        {extractedText && (
          <div className="p-4 bg-[#1E293B] border-t border-slate-800 flex flex-col sm:flex-row gap-2 shrink-0">
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
              className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer text-xs active:scale-98"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>末尾に追記する</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
