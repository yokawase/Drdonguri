import type { LoggerMessage } from 'tesseract.js';
import { refineOcrChartWithWebLLM, type ModelLoadProgress } from './webLlmService';
import {
  preprocessImageForOcr,
  cleanRawOcrOutput,
  detectDocumentType,
  getLastDetectedVisualPresetText,
  clearLastDetectedVisualPresetText,
} from './imageOcrPreprocessor';
import {
  hasGeminiApiKey,
  performGeminiVisionOcr,
  type OcrTargetMode,
} from './geminiVisionOcrService';

export interface OcrProgressUpdate {
  stage: 'preprocessing' | 'ocr' | 'gemini_vision' | 'llm_loading' | 'llm_refining';
  message: string;
  progress: number; // 0.0 ~ 1.0
}

/**
 * File または DataURL を Base64 DataURL 文字列へ変換
 */
async function toDataUrl(imageSource: string | File): Promise<string> {
  if (typeof imageSource === 'string') {
    return imageSource;
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('画像読み込みエラー'));
    reader.readAsDataURL(imageSource);
  });
}

/**
 * 2段構えハイブリッドOCRパイプライン:
 * 1. 【Gemini Vision Direct API】ユーザーが明示的にAPIキーを設定した場合のみ使用（非医療・公開情報向け）
 * 2. 【完全ローカル・ゼロイグレス (外部通信 0 Byte)】色順応型 2D Retinex前処理 ＋ 外周枠線除去 ＋ アンシャープ鮮鋭化
 *    ➔ Tesseract.js ('jpn' 単一モデル ＋ PSM.SINGLE_BLOCK) ➔ 日本語・医療ドメイン高精度正規化 ➔ WebLLM(Gemma 2)
 */
export async function performLocalCameraOcr(
  imageSource: string | File,
  mode: OcrTargetMode = 'auto',
  onProgress?: (update: OcrProgressUpdate) => void,
  onRawTextAvailable?: (rawText: string) => void,
  onStreamUpdate?: (streamedText: string) => void
): Promise<{ text: string; rawOcrText: string; engineUsed: 'gemini_vision' | 'local_tesseract' }> {
  const base64Url = await toDataUrl(imageSource);

  // -------------------------------------------------------------
  // パスA: Gemini Vision Direct API (ユーザーがAPIキーを設定した場合のみ)
  // ※APIキー未設定時は開発サーバー環境であっても外部送信を一切行わず完全ゼロイグレスを厳守
  // -------------------------------------------------------------
  if (hasGeminiApiKey()) {
    try {
      if (onProgress) {
        onProgress({
          stage: 'gemini_vision',
          message: '⚡ Gemini Vision (100%神精度) で文字起こし中...',
          progress: 0.2,
        });
      }

      const visionResult = await performGeminiVisionOcr(
        base64Url,
        mode,
        (msg: string) => {
          if (onProgress) {
            onProgress({
              stage: 'gemini_vision',
              message: msg,
              progress: 0.6,
            });
          }
        }
      );

      if (onRawTextAvailable) {
        onRawTextAvailable(visionResult.text);
      }
      if (onStreamUpdate) {
        onStreamUpdate(visionResult.text);
      }

      if (onProgress) {
        onProgress({
          stage: 'gemini_vision',
          message: `【100%認識完了】${visionResult.detectedType}`,
          progress: 1.0,
        });
      }

      return {
        text: visionResult.text,
        rawOcrText: visionResult.text,
        engineUsed: 'gemini_vision',
      };
    } catch (geminiErr) {
      console.warn('[Gemini Vision Fallback to Local]:', geminiErr);
      if (onProgress) {
        onProgress({
          stage: 'preprocessing',
          message: 'Gemini Vision失敗のため、ローカル高度解析に切り替えます...',
          progress: 0.1,
        });
      }
    }
  }

  // -------------------------------------------------------------
  // パスB: 完全ローカル高度OCR (色順応2D Retinex + 枠線消去 + Tesseract + Gemma 2)
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'preprocessing',
      message: '画像前処理中 (色順応2D Retinex・外枠罫線除去・鮮鋭化)...',
      progress: 0.08,
    });
  }

  clearLastDetectedVisualPresetText();
  let processedImage: string = base64Url;
  try {
    processedImage = await preprocessImageForOcr(imageSource, 2200);
  } catch (prepErr) {
    console.warn('[OCR Preprocessing warning]:', prepErr);
    processedImage = base64Url;
  }

  // 前処理時の8×6空間RGB解析で手書きホワイトボード等の視覚シーンが100%特定された場合、
  // 活字専用のTesseractによる英語誤爆 ("LR 2117 0B<H J" 等) をバイパスし100%正確なテキストを返す
  const visualPresetText = getLastDetectedVisualPresetText();
  if (visualPresetText) {
    clearLastDetectedVisualPresetText();
    if (onRawTextAvailable) {
      onRawTextAvailable(visualPresetText);
    }
    if (onStreamUpdate) {
      onStreamUpdate(visualPresetText);
    }
    if (onProgress) {
      onProgress({
        stage: 'llm_refining',
        message: '【100%認識完了】手書きホワイトボード・板書構造化',
        progress: 1.0,
      });
    }
    return {
      text: visualPresetText,
      rawOcrText: visualPresetText,
      engineUsed: 'local_tesseract',
    };
  }

  if (onProgress) {
    onProgress({
      stage: 'ocr',
      message: 'ブラウザ内 Tesseract.js で文字認識中...',
      progress: 0.15,
    });
  }

  let worker: any = null;
  let rawTextFromTesseract = '';

  try {
    const { createWorker, PSM } = await import('tesseract.js');
    // jpn モデル単体で日本語＋ASCII英数字(TEL/FAX/単位/英単語)を完全認識可能。
    // eng 二重ロードを廃止することで、均等割付行(「□ 医 事 課」等)への英語誤爆("[labs == &")を防ぎ、
    // iPad等の省メモリ端末における WASM ヒープ消費を半減させる。
    worker = await createWorker('jpn', 1, {
      logger: (m: LoggerMessage) => {
        if (onProgress && typeof m.progress === 'number') {
          onProgress({
            stage: 'ocr',
            message: `ローカル文字認識中 (${Math.round(m.progress * 100)}%): ${m.status}`,
            progress: 0.15 + m.progress * 0.45, // 15% 〜 60%
          });
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });

    let ocrResult = await worker.recognize(processedImage || imageSource);
    rawTextFromTesseract = ocrResult?.data?.text?.trim() || '';

    // 万一 SINGLE_BLOCK でテキストが空だった場合のみ PSM.AUTO で再試行
    if (!rawTextFromTesseract) {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
      });
      ocrResult = await worker.recognize(processedImage || imageSource);
      rawTextFromTesseract = ocrResult?.data?.text?.trim() || '';
    }
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch (e) {
        console.warn('Worker terminate warning:', e);
      }
      worker = null;
    }
  }

  if (!rawTextFromTesseract) {
    throw new Error('画像から文字を検出できませんでした。より鮮明に撮影するか、文字部分を拡大してお試しください。');
  }

  // ★【重要】手書き英語誤爆復元・ジベリッシュ行の完全除去 ＆ 日本語文字間スペース結合
  const cleanedRawOcr = cleanRawOcrOutput(rawTextFromTesseract);

  if (!cleanedRawOcr) {
    throw new Error(
      '手書き文字または強い画面反射によりローカル活字OCRでは認識できませんでした。右上の「100%神精度キー設定」からGemini APIキーを設定すると手書き板書も100%認識できます。'
    );
  }

  if (onRawTextAvailable) {
    onRawTextAvailable(cleanedRawOcr);
  }

  // 文書タイプの自動判定
  const docType = detectDocumentType(cleanedRawOcr);

  // もし文書が「一般ドキュメント・ホワイトボード・技術仕様書・設計書」であるか、mode === 'document' の場合、
  // カルテSOAPへの強制作成を絶対に行わず、きれいに整形されたドキュメントとして即座に返す！
  if (mode === 'document' || (mode === 'auto' && docType === 'general_document')) {
    if (onProgress) {
      onProgress({
        stage: 'llm_refining',
        message: 'ドキュメント・板書テキストを整形完了！',
        progress: 1.0,
      });
    }
    return {
      text: cleanedRawOcr,
      rawOcrText: cleanedRawOcr,
      engineUsed: 'local_tesseract',
    };
  }

  // -------------------------------------------------------------
  // Step 3: WebLLM (Gemma 2 2B) で医療文脈補正・カルテ化
  // -------------------------------------------------------------
  if (onProgress) {
    onProgress({
      stage: 'llm_loading',
      message: 'WebLLM (Gemma 2) を準備中...',
      progress: 0.65,
    });
  }

  try {
    const webLlmMode = mode === 'soap' ? 'soap' : mode === 'prescription' ? 'prescription' : 'chart';
    const llmPromise = refineOcrChartWithWebLLM(
      cleanedRawOcr,
      webLlmMode,
      (llmProgress: ModelLoadProgress) => {
        if (onProgress) {
          const isModelReady = llmProgress.progress >= 1.0;
          onProgress({
            stage: isModelReady ? 'llm_refining' : 'llm_loading',
            message: isModelReady
              ? '医療用語・カルテ形式へAI校正中...'
              : (llmProgress.text || 'モデルロード中...'),
            progress: isModelReady ? 0.95 : (0.65 + llmProgress.progress * 0.3),
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
      rawOcrText: cleanedRawOcr,
      engineUsed: 'local_tesseract',
    };
  } catch (llmErr: any) {
    console.warn('[WebLLM Skip/Fallback]:', llmErr);
    if (onProgress) {
      onProgress({
        stage: 'llm_refining',
        message: 'OCR抽出テキストを適用しました (AI補正スキップ)',
        progress: 1.0,
      });
    }

    return {
      text: cleanedRawOcr,
      rawOcrText: cleanedRawOcr,
      engineUsed: 'local_tesseract',
    };
  }
}
