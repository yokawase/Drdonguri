import {
  CreateWebWorkerMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';
import type { MindsGuidelineDetail } from '../utils/mindsGuidelineCompiler';

// 【超高速・省メモリ】Google Gemma 2 2B Instruct 1k (VRAM約1.5GB, low-resource対応, 高速レスポンス)
export const FAST_WEBLLM_MODEL = 'gemma-2-2b-it-q4f16_1-MLC-1k';

// 【高精度・日本語特化】Google Gemma 2 2B 日本語特化 Instruct (日本語文脈・医療カルテSOAP整形に最高精度)
export const PRECISE_WEBLLM_MODEL = 'gemma-2-2b-jpn-it-q4f16_1-MLC';

// デフォルトは高速・省リソースの FAST_WEBLLM_MODEL
export const DEFAULT_WEBLLM_MODEL = FAST_WEBLLM_MODEL;

export interface ModelLoadProgress {
  text: string;
  progress: number; // 0.0 ~ 1.0
}

let engineInstance: MLCEngineInterface | null = null;
let currentLoadedModelId: string | null = null;
let currentWorker: Worker | null = null;
let isLoadingEngine = false;
let loadPromise: Promise<MLCEngineInterface> | null = null;

/**
 * ブラウザがWebGPUをサポートしているか検証
 */
export function isWebGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * WebLLM エンジンをシングルトンとして取得・初期化
 */
export async function getWebLlmEngine(
  onProgress?: (report: ModelLoadProgress) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL
): Promise<MLCEngineInterface> {
  // すでに同じモデルがロードされていれば即座に返す
  if (engineInstance && currentLoadedModelId === modelId) {
    return engineInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  if (!isWebGpuSupported()) {
    throw new Error(
      'お使いのブラウザはWebGPUに対応していません。最新のGoogle Chrome、Microsoft Edge、またはSafariをご使用ください。'
    );
  }

  isLoadingEngine = true;
  loadPromise = (async () => {
    try {
      if (engineInstance) {
        try {
          await engineInstance.unload();
        } catch (e) {
          console.warn('Unload error:', e);
        }
        engineInstance = null;
      }

      if (currentWorker) {
        currentWorker.terminate();
        currentWorker = null;
      }

      const worker = new Worker(
        new URL('../workers/webllm.worker.ts', import.meta.url),
        { type: 'module' }
      );
      currentWorker = worker;

      const engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: (report: InitProgressReport) => {
          if (onProgress) {
            onProgress({
              text: report.text,
              progress: report.progress,
            });
          }
        },
      });

      engineInstance = engine;
      currentLoadedModelId = modelId;
      return engine;
    } finally {
      isLoadingEngine = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * エンジンの初期化状態を確認
 */
export function isEngineLoaded(): boolean {
  return engineInstance !== null;
}

/**
 * 現在ロード中のモデルIDを取得
 */
export function getCurrentModelId(): string {
  return currentLoadedModelId || DEFAULT_WEBLLM_MODEL;
}

/**
 * エンジンをリセット・解放（メモリクリア用）
 */
export async function disposeWebLlmEngine(): Promise<void> {
  if (engineInstance) {
    try {
      await engineInstance.unload();
    } catch (e) {
      console.warn('Engine unload warning:', e);
    }
    engineInstance = null;
    currentLoadedModelId = null;
  }
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
}

/**
 * 医療カルテテキストのAI自動校正・SOAP整形 (超高速スリム化プロンプト)
 */
export async function formatMedicalChartWithWebLLM(
  text: string,
  style: 'soap' | 'concise' | 'interview' = 'soap',
  onProgress?: (report: ModelLoadProgress) => void,
  onStream?: (accumulatedText: string) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL
): Promise<string> {
  const engine = await getWebLlmEngine(onProgress, modelId);

  const styleGuides = {
    soap: '【S】主訴 【O】所見・バイタル 【A】評価・診断 【P】治療方針・処方',
    concise: '箇条書き要約（医学的要点のみを簡潔に列挙）',
    interview: '問診・現病歴要約（時系列での経過まとめ）',
  };

  // Prefillトークンを最小限にしてTTFT（最初の1文字が出る時間）を極限まで短縮
  const systemPrompt = `日本の電子カルテ整形AIです。医師の入力テキストの誤字脱字・音声変換ミスを修正し、指定形式のカルテ本文のみを出力してください。前置きや挨拶は厳禁です。
形式: ${styleGuides[style]}`;

  const cleanInput = text.replace(/\n{3,}/g, '\n\n').slice(0, 800);
  const userPrompt = `【入力】\n${cleanInput}\n\n整形本文:`;

  if (onProgress) {
    onProgress({ text: 'AIがリアルタイム出力中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 320, // 320トークンで十分。不要な長文生成を防ぎ高速完了
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(fullText);
      }
    }

    return fullText.trim() || text;
  } catch (err: any) {
    console.warn('[WebLLM Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 320,
    });
    return completion.choices[0]?.message?.content?.trim() || text;
  }
}

/**
 * カメラOCRで抽出した粗い生テキストを医療文脈で高精度補正・カルテ化 (超高速版)
 */
export async function refineOcrChartWithWebLLM(
  rawOcrText: string,
  mode: 'chart' | 'soap' | 'prescription' = 'chart',
  onProgress?: (report: ModelLoadProgress) => void,
  onStream?: (accumulatedText: string) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL
): Promise<string> {
  const engine = await getWebLlmEngine(onProgress, modelId);

  const styleDesc =
    mode === 'soap'
      ? 'SOAP形式（【S】【O】【A】【P】）'
      : mode === 'prescription'
      ? '処方箋形式（薬品名、用法、用量、日数）'
      : '標準カルテ形式（【主訴】【所見】【方針】等）';

  // Prefillトークンを最小限にして瞬時に推論開始
  const systemPrompt = `医療OCRテキスト補正AIです。生OCRテキストの誤認識・ノイズ・単位（mg/dL, %, γ-GTP等）を修正し、${styleDesc}で本文のみ出力してください。解説・挨拶は厳禁です。`;

  const cleanRaw = rawOcrText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 800);
  const prompt = `【OCR生テキスト】\n${cleanRaw}\n\n補正本文:`;

  if (onProgress) {
    onProgress({ text: 'AIがリアルタイム出力中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 350,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(fullText);
      }
    }

    return fullText.trim() || rawOcrText;
  } catch (err: any) {
    console.warn('[WebLLM OCR Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 350,
    });
    return completion.choices[0]?.message?.content?.trim() || rawOcrText;
  }
}

/**
 * Minds ガイドライン詳細ナレッジ (32GB SDカード相当) を参照したローカルWebLLM臨床推論 (RAG)
 */
export async function consultGuidelineWithWebLLM(
  soapText: string,
  guideline: MindsGuidelineDetail,
  onStream?: (accumulatedText: string) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL
): Promise<string> {
  const engine = await getWebLlmEngine(undefined, modelId);

  const systemPrompt = `あなたは日本の臨床診療ガイドライン（Minds）に準拠した医療意思決定支援AIです。
提供された公式エビデンスに基づき、医師のカルテ記載内容に対する臨床的アドバイス、注意すべき禁忌・漫然投与リスク、患者説明の要点を簡潔・明快に出力してください。`;

  const userPrompt = `【Mindsガイドライン情報】
疾患: ${guideline.diseaseName} (ICD-10: ${guideline.icd10})
CQ: ${guideline.cqTitle}
推奨: ${guideline.recommendation}
背景・理由: ${guideline.detail.rational}
実践要点: ${guideline.detail.practiceTip}

【現在のカルテ記載】
${soapText}

ガイドライン準拠の臨床アドバイス:`;

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 300,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(fullText);
      }
    }

    return fullText.trim();
  } catch (err: any) {
    console.warn('[WebLLM Minds RAG Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });
    return completion.choices[0]?.message?.content?.trim() || guideline.recommendation;
  }
}
