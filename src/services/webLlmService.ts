import {
  CreateWebWorkerMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';

// 推奨モデル: Qwen2.5-1.5B-Instruct (VRAM約1.6GB、高速、高品質な日本語・医療用語対応)
export const DEFAULT_WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';

// 軽量フォールバック用: Qwen2.5-0.5B-Instruct (VRAM約600MB、ARM/低スペック端末向け)
export const LIGHTWEIGHT_WEBLLM_MODEL = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

export interface ModelLoadProgress {
  text: string;
  progress: number; // 0.0 ~ 1.0
}

let engineInstance: MLCEngineInterface | null = null;
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
  if (engineInstance) {
    return engineInstance;
  }

  if (loadPromise) {
    return loadPromise;
  }

  if (!isWebGpuSupported()) {
    throw new Error(
      'お使いのブラウザはWebGPUに対応していません。最新のGoogle Chrome、Microsoft Edge、またはSafari（設定でWebGPU有効）をご使用ください。'
    );
  }

  isLoadingEngine = true;
  loadPromise = (async () => {
    try {
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
  }
  if (currentWorker) {
    currentWorker.terminate();
    currentWorker = null;
  }
}

/**
 * 医療カルテテキストのAI自動校正・SOAP整形 (Qwen2.5 ストリーミング対応)
 */
export async function formatMedicalChartWithWebLLM(
  text: string,
  style: 'soap' | 'concise' | 'interview' = 'soap',
  onProgress?: (report: ModelLoadProgress) => void,
  onStream?: (accumulatedText: string) => void
): Promise<string> {
  const engine = await getWebLlmEngine(onProgress);

  const styleGuides = {
    soap: '医療標準SOAP形式（【S】主訴、【O】客観的所見・バイタル、【A】評価・診断、【P】治療計画・処方）',
    concise: '電子カルテ箇条書き要約（医学的所見と重要ポイントを箇条書きで簡潔に整理）',
    interview: '問診・現病歴要約形式（受診動機、症状の経過、既往歴を時系列で整理）',
  };

  const systemPrompt = `あなたは日本の医療現場向け電子カルテ入力支援アシスタントです。
医師が入力または音声入力したテキストを、電子カルテにそのまま入力できる高品質なカルテ記録に整形・校正します。

【厳守ルール】
1. 医師の入力意図や医学的所見、数値、処方内容を勝手に改変・捏造しないこと。
2. 誤字脱字、音声認識による同音異義語の誤変換（例：「こうけつあつ」→「高血圧」、「しょうに」→「小児」、「たいおん」→「体温」）を正確に修正すること。
3. 指定されたフォーマット（${styleGuides[style]}）に従って出力すること。
4. カルテに不要な挨拶文、前置き、AIとしての自己紹介や解説は一切出力せず、カルテ本文のみを出力すること。

【入力例】
38度 発熱 3日前から のど痛い 咳少し あり アセトアミノフェン 処方

【出力例】
【S】3日前からの発熱（38.0℃）、咽頭痛。軽度の咳嗽あり。
【O】咽頭後壁に発赤軽度認む。呼吸音清。
【A】急性上気道炎（疑い）
【P】アセトアミノフェン錠処方。症状増悪時は再診指示。水分摂取励行。`;

  // 入力テキストのトリミング（最大1200文字）
  const cleanInput = text.replace(/\n{3,}/g, '\n\n').slice(0, 1200);
  const userPrompt = `以下の入力テキストを整形してください。\n\n【入力テキスト】\n${cleanInput}\n\n【希望スタイル】: ${styleGuides[style]}`;

  if (onProgress) {
    onProgress({ text: 'AIカルテテキストをリアルタイム生成中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
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
    // ストリーミング非対応環境への非ストリーミングフォールバック
    const completion = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 512,
    });
    return completion.choices[0]?.message?.content?.trim() || text;
  }
}

/**
 * カメラOCRで抽出した粗い生テキストを医療文脈で高精度補正・カルテ化 (ストリーミング＆軽量化対応)
 */
export async function refineOcrChartWithWebLLM(
  rawOcrText: string,
  mode: 'chart' | 'soap' | 'prescription' = 'chart',
  onProgress?: (report: ModelLoadProgress) => void,
  onStream?: (accumulatedText: string) => void
): Promise<string> {
  const engine = await getWebLlmEngine(onProgress);

  const systemPrompt = `あなたは日本の医療機関向け電子カルテ・診療録・医療文書専門の高精度テキスト補正エンジンです。
OCRで文字認識された粗いテキストから、文字の誤認識・ノイズ・改行崩れを取り除き、医学的に正しいカルテテキストに復元・整理します。

【厳守ルール】
1. 医療専門用語の誤変換を忠実に補正すること:
   - 「γ-GTP」のギリシャ文字「γ（ガンマ）」を保持すること。
   - 「HbA1c」「LDL-C」「TG」「AST(GOT)」「ALT(GPT)」「BP」「SpO2」等の英数略語を正確に維持すること。
   - 単位（mg/dL, U/L, %, kg, mmHg等）および数値を半角英数字に正規化すること。
2. 日本の電子カルテ標準見出し括弧【 】を用いて読みやすく構造化すること（例: 【主訴】、【診察所見】、【検査データ】、【処方】）。
3. 余計な前置きや解説は一切出力せず、カルテ本文のみを出力すること。`;

  // 生テキストの改行整理と上限トリミング（最大1000文字でPrefill負荷軽減）
  const cleanRaw = rawOcrText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 1000);

  let prompt = `以下のOCR生テキストを、医療文脈に基づいて誤字修正し、正確なカルテテキストに整形してください。\n\n【OCR生テキスト】\n${cleanRaw}`;
  if (mode === 'soap') {
    prompt += `\n\n【形式指示】SOAP形式（【S】【O】【A】【P】）に整理して出力してください。`;
  } else if (mode === 'prescription') {
    prompt += `\n\n【形式指示】薬剤名、用法、用量、日数の処方箋形式に整理して出力してください。`;
  }

  if (onProgress) {
    onProgress({ text: 'AIが医療用語を校正・リアルタイム出力中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.05,
      max_tokens: 512,
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
      max_tokens: 512,
    });
    return completion.choices[0]?.message?.content?.trim() || rawOcrText;
  }
}
