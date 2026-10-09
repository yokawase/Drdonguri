import { createWorker, type LoggerMessage } from 'tesseract.js';
import { refineOcrChartWithWebLLM, type ModelLoadProgress } from './webLlmService';

export interface OcrProgressUpdate {
  stage: 'ocr' | 'llm_loading' | 'llm_refining';
  message: string;
  progress: number; // 0.0 ~ 1.0
}

let cachedTesseractWorker: any = null;

/**
 * Tesseract.js ワーカーの初期化（キャッシュして再利用）
 */
async function getTesseractWorker(onProgress?: (progress: number, status: string) => void) {
  if (cachedTesseractWorker) {
    return cachedTesseractWorker;
  }

  const worker = await createWorker(['jpn', 'eng'], 1, {
    logger: (m: LoggerMessage) => {
      if (onProgress && typeof m.progress === 'number') {
        onProgress(m.progress, m.status);
      }
    },
  });

  cachedTesseractWorker = worker;
  return worker;
}

/**
 * 完全ローカル・2段階OCR＆カルテ化パイプライン
 * 1. Tesseract.js で画像から日本語・英数字を文字起こし（Raw OCR）
 * 2. WebLLM (Qwen2.5 1.5B) で医療用語・数値単位の補正とSOAP構造化（Refine）
 */
export async function performLocalCameraOcr(
  imageSource: string | File,
  mode: 'chart' | 'soap' | 'prescription' = 'chart',
  onProgress?: (update: OcrProgressUpdate) => void
): Promise<{ text: string; rawOcrText: string }> {
  // -------------------------------------------------------------
  // Step 1: ブラウザ内 Tesseract.js で粗い文字起こし (Raw OCR)
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'ocr',
      message: 'ブラウザ内エンジンで画像テキストを抽出中...',
      progress: 0.1,
    });
  }

  const worker = await getTesseractWorker((p, status) => {
    if (onProgress) {
      onProgress({
        stage: 'ocr',
        message: `OCR認識中 (${Math.round(p * 100)}%): ${status}`,
        progress: 0.1 + p * 0.4, // 全体の 10% 〜 50%
      });
    }
  });

  const ocrResult = await worker.recognize(imageSource);
  const rawOcrText = ocrResult?.data?.text?.trim() || '';

  if (!rawOcrText) {
    throw new Error('画像から文字を検出できませんでした。より鮮明に撮影するか、文字部分を拡大してお試しください。');
  }

  // -------------------------------------------------------------
  // Step 2: WebLLM (Qwen2.5 1.5B) で医療文脈補正・SOAP整形
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'llm_refining',
      message: 'WebLLM (Qwen2.5 1.5B) が医療用語・数値を校正中...',
      progress: 0.6,
    });
  }

  const refinedText = await refineOcrChartWithWebLLM(
    rawOcrText,
    mode,
    (llmProgress: ModelLoadProgress) => {
      if (onProgress) {
        onProgress({
          stage: llmProgress.progress < 1.0 ? 'llm_loading' : 'llm_refining',
          message: llmProgress.text || 'WebLLMモデル準備中...',
          progress: 0.6 + llmProgress.progress * 0.35, // 全体の 60% 〜 95%
        });
      }
    }
  );

  if (onProgress) {
    onProgress({
      stage: 'llm_refining',
      message: 'カルテ生成完了！',
      progress: 1.0,
    });
  }

  return {
    text: refinedText,
    rawOcrText,
  };
}

/**
 * Tesseract ワーカーを終了・メモリ解放
 */
export async function terminateLocalOcrWorker(): Promise<void> {
  if (cachedTesseractWorker) {
    await cachedTesseractWorker.terminate();
    cachedTesseractWorker = null;
  }
}
