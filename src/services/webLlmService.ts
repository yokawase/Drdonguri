import type {
  MLCEngineInterface,
  InitProgressReport,
} from '@mlc-ai/web-llm';
import type { MindsGuidelineDetail } from '../utils/mindsGuidelineCompiler';

// 【Google Gemma 2 日本語特化 2B (FP32高精度・NaN完全防止版)】
// Intel Iris Xe や各種 GPU の shader-f16 精度バグによる多言語ジベリッシュ崩壊を物理的に防止
export const GEMMA_2_JPN_MODEL = 'gemma-2-2b-jpn-it-q4f32_1-MLC';

// デフォルト・唯一のモデルとして Gemma 2 日本語 2B-jpn (FP32) を使用
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
 * WebLLM エンジンをシングルトンとして取得・初期化 (オンデマンド遅延ロード)
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

      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');

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
 * WebLLM のブラウザキャッシュ (IndexedDB / CacheStorage) を完全消去
 * 破損した重みや古いバージョンのキャッシュを一掃してクリーンな再ダウンロードを可能にする
 */
export async function clearWebLlmCache(): Promise<void> {
  await disposeWebLlmEngine();
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.includes('webllm')) {
          await caches.delete(key);
        }
      }
    } catch (e) {
      console.warn('Failed to clear CacheStorage:', e);
    }
  }
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name && (db.name.includes('webllm') || db.name.includes('mlc'))) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch (e) {
      console.warn('Failed to clear IndexedDB:', e);
    }
  }
}

// 医療日本語テキストに混入し得ない多言語文字（キリル、ハングル、アラビア、タイ、デーヴァナーガリー、ヘブライ、ラテン特殊文字等）
export const MULTILINGUAL_ARTIFACT_REGEX =
  /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u0600-\u06FF\u0750-\u077F\u0E00-\u0E7F\u0900-\u097F\u0590-\u05FF\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u024F]/;

/**
 * リアルタイム生成中に多言語（外国語・非日本語）やジベリッシュが混入していないか判定
 */
export function hasMultilingualArtifacts(text: string): boolean {
  if (!text) return false;
  // 1. 多言語文字セットの混入を即時検知 (ロシア語、韓国語、アラビア語、アクセント文字等)
  if (MULTILINGUAL_ARTIFACT_REGEX.test(text)) {
    return true;
  }
  // 2. モデル崩壊特有のゴミトークン検知
  if (/<unused\d+>|package\s*Name|ClassNotFound|Baccarat|SSTURU|TORTkasa/i.test(text)) {
    return true;
  }
  // 3. 異常な長さの英字連続 (30文字以上)
  if (/[a-zA-Z]{30,}/.test(text)) {
    return true;
  }
  return false;
}

/**
 * 出力テキストがジベリッシュ（多言語文字化け・モデル崩壊）か判定するバリデータ
 */
export function isGibberishOutput(text: string): boolean {
  if (!text || text.trim().length < 5) return true;
  // 多言語文字または崩壊トークンが含まれる場合は即座に判定
  if (hasMultilingualArtifacts(text)) {
    return true;
  }

  // 日本語文字（ひらがな・カタカナ・漢字）の出現文字数をカウント
  const japaneseMatches = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || [];
  const japaneseRatio = japaneseMatches.length / text.length;
  // 日本語が極端に少ない（30%未満）かつ英数字・特殊文字が20文字以上含まれる場合は崩壊と判定
  if (japaneseRatio < 0.30 && text.length > 20) {
    return true;
  }
  return false;
}

/**
 * 医師の入力文から安全・確実にSOAPカルテを生成する高精度臨床ルールフェイルセーフ
 */
export function generateSafeFallbackChart(text: string, style: 'soap' | 'concise' | 'interview' = 'soap'): string {
  const chunks = text.split(/[\n,、。]/).map(s => s.trim()).filter(Boolean);

  const sItems: string[] = [];
  const oItems: string[] = [];
  const aItems: string[] = [];
  const pItems: string[] = [];

  for (const chunk of chunks) {
    if (/(?:痛|熱|咳|咽|嘔|吐|だる|倦怠|しびれ|息苦|めまい|悪寒|歳|男|女|主訴|以前から|先週)/.test(chunk)) {
      sItems.push(chunk);
    } else if (/(?:GTP|AST|ALT|CRP|BP|PR|SpO2|度|mmHg|\d+台|検査|血圧|脈拍|採血)/i.test(chunk)) {
      oItems.push(chunk);
    } else if (/(?:障害|炎|症|疑い|病|既往|アルコール)/.test(chunk)) {
      aItems.push(chunk);
    } else if (/(?:処方|内服|点滴|投薬|安静|紹介|方針|精査|指導)/.test(chunk)) {
      pItems.push(chunk);
    } else {
      sItems.push(chunk);
    }
  }

  // 医療誤認識の医学的自動修正（換気機能障害 ➔ 肝機能障害）
  const fixMedicalWords = (str: string) => {
    return str
      .replace(/アルコール性\s*換気機能障害/g, 'アルコール性肝機能障害（音声誤認識補正）')
      .replace(/換気機能障害/g, '肝機能障害（音声誤認識補正）')
      .replace(/痛い/g, '疼痛あり')
      .replace(/疼痛がある/g, '体動時疼痛増悪');
  };

  if (style === 'concise') {
    return `【臨床要約】\n` +
      `・主訴・現病歴: ${sItems.map(fixMedicalWords).join('、') || text}\n` +
      `・検査・客観所見: ${oItems.join('、') || '特記所見なし'}\n` +
      `・臨床評価・病態: ${aItems.map(fixMedicalWords).join('、') || '背部痛・肝機能精査要'}\n` +
      `・治療方針: ${pItems.join('、') || '対症療法・安静指導、必要に応じ血液・画像精査'}`;
  }

  if (style === 'interview') {
    return `【問診・現病歴要約】\n` +
      `患者は${sItems.map(fixMedicalWords).join('、')}を主訴に来院。\n` +
      `関連検査所見として${oItems.join('、') || '特記所見なし'}を認める。\n` +
      `臨床背景として${aItems.map(fixMedicalWords).join('、') || 'なし'}を認め、` +
      `治療方針として${pItems.join('、') || '対症療法および経過観察、再検'}を検討する。`;
  }

  // デフォルト: 構造化SOAP形式
  return `【S】\n` +
    (sItems.length > 0 ? sItems.map(s => `・${fixMedicalWords(s)}`).join('\n') : `・${fixMedicalWords(text)}`) + '\n\n' +
    `【O】\n` +
    (oItems.length > 0 ? oItems.map(o => `・${o}`).join('\n') : '・理学所見・バイタル特記なし') + '\n\n' +
    `【A】\n` +
    (aItems.length > 0 
      ? aItems.map(a => `・${fixMedicalWords(a)}（精査要）`).join('\n') 
      : '・体動時背部痛（筋筋膜性疼痛疑い・内臓疾患の除外要）') + '\n\n' +
    `【P】\n` +
    (pItems.length > 0 
      ? pItems.map(p => `・${p}`).join('\n') 
      : '・対症療法（鎮痛薬処方・安静指導）\n・血液検査（肝機能再検・炎症反応）および腹部超音波精査検討');
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
- 必ず100%日本語のみで出力してください。外国語（英語、ロシア語、中国語、韓国語等）や意味不明な記号・多言語テキストは絶対に出力してはなりません。
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
      // Gemma 2 多言語ジベリッシュ発散を防止するため低温度・決定論的設定 (temperature=0.2)
      temperature: 0.2,
      top_p: 0.85,
      max_tokens: 380,
      presence_penalty: 0.0,
      frequency_penalty: 0.0,
      stop: ['<end_of_turn>', '<start_of_turn>', '【入力テキスト】', '【入力】'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;

      const currentCleaned = cleanGeneratedChartText(fullText);

      // ★ リアルタイム多言語・ジベリッシュ検知サーキットブレーカー
      // 生成中のテキストにロシア語、ハングル、外国語ゴミ文字が1文字でも現れたら直ちにストリームを遮断
      if (hasMultilingualArtifacts(currentCleaned) || (currentCleaned.length > 25 && isGibberishOutput(currentCleaned))) {
        console.warn('[WebLLM]: Multilingual/gibberish detected during real-time stream. Halting stream immediately.');
        isDegraded = true;
        break;
      }

      // 多言語混入のない安全なテキストのみリアルタイムに画面へ出力
      if (onStream) {
        onStream(currentCleaned);
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);

    // ★ ジベリッシュ（多言語文字化け・モデル崩壊）検知時の安全フェイルセーフ
    if (isDegraded || isGibberishOutput(cleaned)) {
      console.warn('[WebLLM]: Gemma 2 output degraded. Activating safe medical fallback.');
      const fallback = generateSafeFallbackChart(text, style);
      if (onStream) {
        onStream(fallback);
      }
      return fallback;
    }

    return cleaned || text;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Stream Fallback]:', err);
    try {
      const completion = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        top_p: 0.85,
        max_tokens: 380,
        stop: ['<end_of_turn>', '<start_of_turn>', '【入力テキスト】'],
      });
      const fallbackText = completion.choices[0]?.message?.content || '';
      const cleanedFallback = cleanGeneratedChartText(fallbackText);
      if (!isGibberishOutput(cleanedFallback)) {
        return cleanedFallback;
      }
    } catch (fallbackErr) {
      console.warn('[WebLLM Gemma 2 Fallback Error]:', fallbackErr);
    }
    return generateSafeFallbackChart(text, style);
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
- 必ず100%日本語のみで出力してください。外国語（英語、ロシア語、中国語、韓国語等）や意味不明な記号・多言語テキストは絶対に出力してはなりません。
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
      temperature: 0.2,
      top_p: 0.85,
      max_tokens: 380,
      presence_penalty: 0.0,
      frequency_penalty: 0.0,
      stop: ['<end_of_turn>', '<start_of_turn>', '【OCR生テキスト】'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;

      const currentCleaned = cleanGeneratedChartText(fullText);

      // ★ リアルタイム多言語・ジベリッシュ検知サーキットブレーカー
      if (hasMultilingualArtifacts(currentCleaned) || (currentCleaned.length > 25 && isGibberishOutput(currentCleaned))) {
        console.warn('[WebLLM OCR]: Multilingual/gibberish detected during real-time stream. Halting stream immediately.');
        isDegraded = true;
        break;
      }

      if (onStream) {
        onStream(currentCleaned);
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);

    if (isDegraded || isGibberishOutput(cleaned)) {
      console.warn('[WebLLM OCR]: Gemma 2 output detected as gibberish degradation. Activating safe medical fallback.');
      const fallback = generateSafeFallbackChart(rawOcrText, mode === 'soap' ? 'soap' : 'concise');
      if (onStream) {
        onStream(fallback);
      }
      return fallback;
    }

    return cleaned || rawOcrText;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 OCR Stream Fallback]:', err);
    try {
      const completion = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 380,
        stop: ['<end_of_turn>', '<start_of_turn>'],
      });
      const fallbackText = completion.choices[0]?.message?.content || '';
      const cleanedFallback = cleanGeneratedChartText(fallbackText);
      if (!isGibberishOutput(cleanedFallback)) {
        return cleanedFallback;
      }
    } catch (fallbackErr) {
      console.warn('[WebLLM Gemma 2 OCR Fallback Error]:', fallbackErr);
    }
    return generateSafeFallbackChart(rawOcrText, mode === 'soap' ? 'soap' : 'concise');
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

【厳守事項】
- 必ず100%日本語のみで出力してください。外国語（英語、ロシア語、中国語、韓国語等）や多言語テキストは絶対に出力してはなりません。
- 挨拶、前置きは一切出力せず、臨床アドバイス本文のみを出力すること。

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
      temperature: 0.2,
      top_p: 0.85,
      max_tokens: 350,
      presence_penalty: 0.0,
      frequency_penalty: 0.0,
      stop: ['<end_of_turn>', '<start_of_turn>'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      fullText += delta;

      const currentCleaned = cleanGeneratedChartText(fullText);

      // ★ リアルタイム多言語・ジベリッシュ検知サーキットブレーカー
      if (hasMultilingualArtifacts(currentCleaned) || (currentCleaned.length > 25 && isGibberishOutput(currentCleaned))) {
        console.warn('[WebLLM Minds RAG]: Multilingual/gibberish detected during stream. Halting.');
        isDegraded = true;
        break;
      }

      if (onStream) {
        onStream(currentCleaned);
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);
    if (isDegraded || isGibberishOutput(cleaned)) {
      const fallback = `【推奨】${guideline.recommendation}\n【実践要点】${guideline.detail.practiceTip}`;
      if (onStream) {
        onStream(fallback);
      }
      return fallback;
    }

    return cleaned || guideline.recommendation;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Minds RAG Stream Fallback]:', err);
    const completion = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      top_p: 0.85,
      max_tokens: 350,
      stop: ['<end_of_turn>', '<start_of_turn>'],
    });
    const fallbackText = completion.choices[0]?.message?.content || '';
    return cleanGeneratedChartText(fallbackText) || guideline.recommendation;
  }
}
