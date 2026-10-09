import { createWorker, type LoggerMessage } from 'tesseract.js';
import { refineOcrChartWithWebLLM, type ModelLoadProgress } from './webLlmService';

export interface OcrProgressUpdate {
  stage: 'ocr' | 'llm_loading' | 'llm_refining';
  message: string;
  progress: number; // 0.0 ~ 1.0
}

/**
 * 完全ローカル・2段階OCR＆カルテ化パイプライン (メモリ効率・低遅延最適化版)
 * 1. Tesseract.js で画像から日本語・英数字を文字起こし（Raw OCR）
 *    ➔ 即座に Raw テキストを UI に展開してユーザーの待ち時間をゼロ化！
 * 2. Tesseract のワーカーを破棄してメモリを解放
 * 3. WebLLM (Qwen2.5 1.5B) でリアルタイムストリーミング医療補正
 */
export async function performLocalCameraOcr(
  imageSource: string | File,
  mode: 'chart' | 'soap' | 'prescription' = 'chart',
  onProgress?: (update: OcrProgressUpdate) => void,
  onRawTextAvailable?: (rawText: string) => void,
  onStreamUpdate?: (streamedText: string) => void
): Promise<{ text: string; rawOcrText: string }> {
  // -------------------------------------------------------------
  // Step 1: ブラウザ内 Tesseract.js で文字起こし (Raw OCR)
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'ocr',
      message: 'ブラウザ内エンジンで画像テキストを抽出中...',
      progress: 0.1,
    });
  }

  let worker: any = null;
  let rawOcrText = '';

  try {
    worker = await createWorker(['jpn', 'eng'], 1, {
      logger: (m: LoggerMessage) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress({
            stage: 'ocr',
            message: `OCR文字認識中 (${Math.round(m.progress * 100)}%): ${m.status}`,
            progress: 0.1 + m.progress * 0.45, // 10% 〜 55%
          });
        }
      },
    });

    const ocrResult = await worker.recognize(imageSource);
    rawOcrText = ocrResult?.data?.text?.trim() || '';
  } finally {
    // ★【重要】Tesseract ワーカーを即時破棄して、WebGPU 推論にスマホの全メモリを明け渡す
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        console.warn('Worker terminate warning:', e);
      }
      worker = null;
    }
  }

  if (!rawOcrText) {
    throw new Error('画像から文字を検出できませんでした。より鮮明に撮影するか、文字部分を拡大してお試しください。');
  }

  // ★ Rawテキストが抽出できた時点で即座にコールバック発火
  if (onRawTextAvailable) {
    onRawTextAvailable(rawOcrText);
  }

  // -------------------------------------------------------------
  // Step 2: WebLLM (Qwen2.5 1.5B) で医療文脈補正・SOAP整形
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'llm_loading',
      message: 'WebLLM (Qwen2.5) を準備中...',
      progress: 0.6,
    });
  }

  try {
    // スマホ環境でのハング防止のため、25秒のセーフティタイムアウトを設定
    const llmPromise = refineOcrChartWithWebLLM(
      rawOcrText,
      mode,
      (llmProgress: ModelLoadProgress) => {
        if (onProgress) {
          const isModelReady = llmProgress.progress >= 1.0;
          onProgress({
            stage: isModelReady ? 'llm_refining' : 'llm_loading',
            message: isModelReady
              ? '医療用語・SOAP形式へAI校正中...'
              : (llmProgress.text || 'モデルロード中...'),
            progress: isModelReady ? 0.96 : (0.6 + llmProgress.progress * 0.35),
          });
        }
      },
      (streamedText: string) => {
        if (onStreamUpdate) {
          onStreamUpdate(streamedText);
        }
      }
    );

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('LLM_TIMEOUT')), 25000);
    });

    const refinedText = await Promise.race([llmPromise, timeoutPromise]);

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
  } catch (llmErr: any) {
    console.warn('[WebLLM Skip/Fallback]:', llmErr);
    // タイムアウトやWebGPU未対応・メモリ不足時は、認識済みの Rawテキストを採用して安全に完了
    if (onProgress) {
      onProgress({
        stage: 'llm_refining',
        message: 'OCR抽出テキストを適用しました (AI補正スキップ)',
        progress: 1.0,
      });
    }

    return {
      text: rawOcrText,
      rawOcrText,
    };
  }
}
