import {
  CreateWebWorkerMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';
import type { MindsGuidelineDetail } from '../utils/mindsGuidelineCompiler';

// 【Google Gemma 2 日本語特化 2B】医療カルテSOAP整形・院内閉域完全ローカル推論
export const GEMMA_2_JPN_MODEL = 'gemma-2-2b-jpn-it-q4f16_1-MLC';

// デフォルト・唯一のモデルとして Gemma 2 日本語 2B-jpn を使用
export const DEFAULT_WEBLLM_MODEL = GEMMA_2_JPN_MODEL;

// 後方互換性エイリアス（Gemma 2 日本語 2B-jpn に完全統一）
export const FAST_WEBLLM_MODEL = GEMMA_2_JPN_MODEL;
export const PRECISE_WEBLLM_MODEL = GEMMA_2_JPN_MODEL;

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
 * 生成されたカルテテキストから特殊トークンや見出しタグを除去するサニタイザー
 */
function cleanGeneratedChartText(text: string): string {
  return text
    .replace(/<start_of_turn>(?:model|user)?/gi, '')
    .replace(/<end_of_turn>/gi, '')
    .replace(/<unused\d+>/gi, '')
    .replace(/^【整形本文】\s*/g, '')
    .replace(/^【補正本文】\s*/g, '')
    .replace(/^【ガイドライン準拠の臨床アドバイス】\s*/g, '')
    .trim();
}

/**
 * 医療カルテテキストのAI自動校正・SOAP整形 (Google Gemma 2 日本語特化プロンプト)
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
    soap: '【S】主訴 【O】所見・バイタル 【A】評価・診断 【P】治療方針・処方 のSOAP形式',
    concise: '箇条書き要約（医学的要点のみを簡潔に列挙）形式',
    interview: '問診・現病歴要約（時系列での経過まとめ）形式',
  };

  const cleanInput = text.replace(/\n{3,}/g, '\n\n').slice(0, 800);

  // Gemma 2 には system ロールが存在しないため、指示を user メッセージ内に統合 (RLHF完全適合)
  const prompt = `あなたは日本の医療電子カルテ整形専門AIです。
医師が入力した以下のテキスト（音声入力メモ等）の誤字脱字・音声誤認識を医学的文脈で修正し、${styleGuides[style]}で出力してください。

【厳守事項】
- 挨拶、解説、前置き、「整形結果:」等の余計な言葉は一切出力せず、指定されたカルテ本文のみを出力すること。
- 日本語で自然かつ正確な臨床医学用語を用いること。

【入力テキスト】
${cleanInput}

【整形本文】
`;

  if (onProgress) {
    onProgress({ text: 'Gemma 2 がリアルタイム出力中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      // Gemma 2 Logit Softcapping 特異点崩壊を防止するため temperature=0.6, top_p=0.9 を指定
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 380,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      stop: ['<end_of_turn>', '<start_of_turn>', '【入力テキスト】', '【入力】'],
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(cleanGeneratedChartText(fullText));
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);
    return cleaned || text;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 380,
      stop: ['<end_of_turn>', '<start_of_turn>', '【入力テキスト】'],
    });
    const fallbackText = completion.choices[0]?.message?.content || '';
    return cleanGeneratedChartText(fallbackText) || text;
  }
}

/**
 * カメラOCRで抽出した粗い生テキストを医療文脈で高精度補正・カルテ化 (Google Gemma 2 版)
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

  const cleanRaw = rawOcrText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 800);

  // Gemma 2 向け単一ユーザープロンプト統合
  const prompt = `あなたは医療OCRテキスト補正専門AIです。
生OCRテキストの誤認識、ノイズ、単位（mg/dL, %, γ-GTP等）を修正し、${styleDesc}で本文のみ出力してください。

【厳守事項】
- 挨拶、解説、前置きは一切出力せず、補正後のカルテ本文のみを出力すること。
- 日本語で自然かつ正確な臨床医学用語・薬品名を用いること。

【OCR生テキスト】
${cleanRaw}

【補正本文】
`;

  if (onProgress) {
    onProgress({ text: 'Gemma 2 がリアルタイム出力中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 380,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      stop: ['<end_of_turn>', '<start_of_turn>', '【OCR生テキスト】'],
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(cleanGeneratedChartText(fullText));
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);
    return cleaned || rawOcrText;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 OCR Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 380,
      stop: ['<end_of_turn>', '<start_of_turn>'],
    });
    const fallbackText = completion.choices[0]?.message?.content || '';
    return cleanGeneratedChartText(fallbackText) || rawOcrText;
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

  // Gemma 2 向け単一ユーザープロンプト統合
  const prompt = `あなたは日本の臨床診療ガイドライン（Minds）に準拠した医療意思決定支援AIです。
提供された公式エビデンスに基づき、医師のカルテ記載内容に対する臨床的アドバイス、注意すべき禁忌・漫然投与リスク、患者説明の要点を簡潔・明快に出力してください。

【Mindsガイドライン情報】
疾患: ${guideline.diseaseName} (ICD-10: ${guideline.icd10})
CQ: ${guideline.cqTitle}
推奨: ${guideline.recommendation}
背景・理由: ${guideline.detail.rational}
実践要点: ${guideline.detail.practiceTip}

【現在のカルテ記載】
${soapText}

【ガイドライン準拠の臨床アドバイス】
`;

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 350,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
      stop: ['<end_of_turn>', '<start_of_turn>'],
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;
      if (onStream) {
        onStream(cleanGeneratedChartText(fullText));
      }
    }

    return cleanGeneratedChartText(fullText);
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Minds RAG Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 350,
      stop: ['<end_of_turn>', '<start_of_turn>'],
    });
    const fallbackText = completion.choices[0]?.message?.content || '';
    return cleanGeneratedChartText(fallbackText) || guideline.recommendation;
  }
}
