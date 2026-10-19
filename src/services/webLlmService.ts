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

import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
} from '../utils/chartTextCleaner';

/**
 * 医師の入力文・抽出カルテから安全・確実にSOAPカルテ/箇条書き要約を生成する高精度臨床構造化エンジン
 */
export function generateSafeFallbackChart(
  rawText: string,
  style: 'soap' | 'concise' | 'interview' = 'soap'
): string {
  const cleanedText = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(rawText));
  const lines = cleanedText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sItems: string[] = [];
  const oItems: string[] = [];
  const aItems: string[] = [];
  const pItems: string[] = [];
  const medAndHistoryItems: string[] = [];

  let currentSection: 'S' | 'O' | 'A' | 'P' | 'MED' | null = null;

  for (const line of lines) {
    // 既存セクション見出しの検出
    if (/^【?(?:S|主訴|現病歴|自覚症状|問診)】?[:：]?/i.test(line)) {
      currentSection = 'S';
      const content = line.replace(/^【?(?:S|主訴|現病歴|自覚症状|問診)】?[:：]?\s*/i, '').trim();
      if (content) sItems.push(content);
      continue;
    }
    if (/^【?(?:既往歴|内服薬|常用薬|持参薬|アレルギー)】?[:：]?/i.test(line)) {
      const headerMatch = line.match(/^【?(既往歴|内服薬|常用薬|持参薬|アレルギー)】?[:：]?\s*(.*)/i);
      currentSection = 'MED';
      if (headerMatch && headerMatch[2]) {
        medAndHistoryItems.push(`${headerMatch[1]}: ${headerMatch[2].trim()}`);
      }
      continue;
    }
    if (/^【?(?:O|身体所見|理学所見|バイタル|検査所見|検査|心電図|画像)】?[:：]?/i.test(line)) {
      currentSection = 'O';
      const content = line.replace(/^【?(?:O|身体所見|理学所見|バイタル|検査所見|検査|心電図|画像)】?[:：]?\s*/i, '').trim();
      if (content) oItems.push(content);
      continue;
    }
    if (/^【?(?:A|アセスメント|評価|診断|鑑別)】?[:：]?/i.test(line)) {
      currentSection = 'A';
      const content = line.replace(/^【?(?:A|アセスメント|評価|診断|鑑別)】?[:：]?\s*/i, '').trim();
      if (content) aItems.push(content);
      continue;
    }
    if (/^【?(?:P|プラン|計画|治療方針|方針|処方)】?[:：]?/i.test(line)) {
      currentSection = 'P';
      const content = line.replace(/^【?(?:P|プラン|計画|治療方針|方針|処方)】?[:：]?\s*/i, '').trim();
      if (content) pItems.push(content);
      continue;
    }

    const cleanLine = line.replace(/^[・\-*]\s*/, '').trim();
    if (!cleanLine) continue;

    if (currentSection === 'S') {
      sItems.push(cleanLine);
      continue;
    }
    if (currentSection === 'MED') {
      medAndHistoryItems.push(cleanLine);
      continue;
    }
    if (currentSection === 'O') {
      oItems.push(cleanLine);
      continue;
    }
    if (currentSection === 'A') {
      aItems.push(cleanLine);
      continue;
    }
    if (currentSection === 'P') {
      pItems.push(cleanLine);
      continue;
    }

    // 見出しがない自由記述文の文単位分類
    const chunks = cleanLine.split(/(?<=[。！？」])\s*|(?<=、)(?=.*(?:BP|SpO2|処方|疑い))/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
      const c = chunk.replace(/。$/, '');
      if (/(?:BP|血圧|PR|HR|脈拍|SpO2|KT|BT|体温|mmHg|bpm|%|心音|呼吸音|ラ音|心電図|ST|AST|ALT|GTP|CRP|WBC|HbA1c|eGFR|Cr|トロポニン|所見)/i.test(c)) {
        oItems.push(c);
      } else if (/(?:内服中|服用中|既往|高血圧症、|糖尿病、|錠\d+|カプセル\d+)/.test(c) && !/(?:処方|開始|追加|変更|投与)/.test(c)) {
        medAndHistoryItems.push(c);
      } else if (/(?:処方|投与|点滴|検査予定|オーダー|紹介|指導|経過観察|再診|フォロー|中止|減量|開始|舌下)/.test(c)) {
        pItems.push(c);
      } else if (/(?:疑い|診断|考える|可能性|除外|リスク|評価|労作性|急性|慢性|障害|炎|症候群)/.test(c) && !/(?:痛|苦|嘔|吐|自覚|訴え|前より|昨日|今朝)/.test(c)) {
        aItems.push(c);
      } else {
        sItems.push(c);
      }
    }
  }

  // 口語表現から標準医学用語への高精度正規化
  const refineClinicalPhrase = (str: string): string => {
    return normalizeMedicalSpeechTerms(str)
      .replace(/胸が締め付けられるような痛み/g, '胸部絞扼痛')
      .replace(/胸が締め付けられる/g, '胸部絞扼感')
      .replace(/息が苦しい/g, '呼吸困難感')
      .replace(/息切れがする/g, '労作時呼吸困難')
      .replace(/痛い/g, '疼痛あり')
      .replace(/疼痛がある/g, '疼痛を認める')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const formattedS = [
    ...sItems.map(refineClinicalPhrase),
    ...medAndHistoryItems.map((m) => (m.startsWith('既往') || m.startsWith('内服') ? m : `既往・内服: ${m}`)),
  ];

  if (style === 'concise') {
    const bulletLines: string[] = ['【臨床要約】'];
    bulletLines.push(
      `・主訴・現病歴: ${sItems.length > 0 ? sItems.map(refineClinicalPhrase).join(' / ') : refineClinicalPhrase(cleanedText)}`
    );
    if (medAndHistoryItems.length > 0) {
      bulletLines.push(`・既往・内服薬: ${medAndHistoryItems.join(' / ')}`);
    }
    bulletLines.push(
      `・客観所見・検査: ${oItems.length > 0 ? oItems.join(' / ') : 'バイタル・理学所見特記なし'}`
    );
    bulletLines.push(
      `・診断・臨床評価: ${aItems.length > 0 ? aItems.map(refineClinicalPhrase).join(' / ') : '主訴・所見に基づく鑑別精査'}`
    );
    bulletLines.push(
      `・治療方針・処方: ${pItems.length > 0 ? pItems.join(' / ') : '対症療法・安静指導および精査フォロー'}`
    );
    return bulletLines.join('\n');
  }

  if (style === 'interview') {
    const narrativeParts: string[] = ['【問診・現病歴要約】'];
    narrativeParts.push(
      `・現病歴: ${sItems.length > 0 ? sItems.map(refineClinicalPhrase).join('。') + '。' : refineClinicalPhrase(cleanedText)}`
    );
    if (medAndHistoryItems.length > 0) {
      narrativeParts.push(`・既往歴・常用薬: ${medAndHistoryItems.join(' / ')}`);
    }
    if (oItems.length > 0) {
      narrativeParts.push(`・来院時所見: ${oItems.join('、')}`);
    }
    if (aItems.length > 0 || pItems.length > 0) {
      narrativeParts.push(
        `・初期評価・方針: ${[...aItems.map(refineClinicalPhrase), ...pItems].join('。')}`
      );
    }
    return narrativeParts.join('\n');
  }

  // デフォルト: 構造化SOAP形式
  return (
    `【S】\n` +
    (formattedS.length > 0
      ? formattedS.map((s) => `・${s}`).join('\n')
      : `・${refineClinicalPhrase(cleanedText)}`) +
    '\n\n' +
    `【O】\n` +
    (oItems.length > 0
      ? oItems.map((o) => `・${o}`).join('\n')
      : '・バイタルサイン・身体所見特記なし') +
    '\n\n' +
    `【A】\n` +
    (aItems.length > 0
      ? aItems.map((a) => `・${refineClinicalPhrase(a)}`).join('\n')
      : '・臨床経過および身体所見に基づく鑑別評価') +
    '\n\n' +
    `【P】\n` +
    (pItems.length > 0
      ? pItems.map((p) => `・${p}`).join('\n')
      : '・症状に応じた処方・検査計画および経過観察')
  );
}

/**
 * 生成されたカルテテキストから特殊トークンや見出しタグ、無駄なスペース・改行を除去するサニタイザー
 */
function cleanGeneratedChartText(text: string): string {
  const stripped = text
    .replace(/<start_of_turn>(?:model|user)?/gi, '')
    .replace(/<end_of_turn>/gi, '')
    .replace(/<unused\d+>/gi, '')
    .replace(/^【整形本文】\s*/g, '')
    .replace(/^【補正本文】\s*/g, '')
    .replace(/^【ガイドライン準拠の臨床アドバイス】\s*/g, '')
    .replace(/^```(?:markdown|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return cleanExtractedMedicalText(stripped);
}

/**
 * Google Gemma 2 (gemma-2-2b-jpn-it) 専用の臨床カルテ構造化・校正プロンプトビルダー
 * SOAP形式、箇条書き要約、問診要約のそれぞれに最適化された厳密な指示体系を構築します。
 */
export function buildGemma2MedicalPrompt(
  rawInput: string,
  style: 'soap' | 'concise' | 'interview' = 'soap'
): string {
  const cleanInput = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(rawInput)).slice(0, 1200);

  if (style === 'soap') {
    return `あなたは日本の医師を支援する医療電子カルテ作成・文章校正専門AIです。
以下の【入力カルテ/音声メモ】の誤字脱字・音声誤認識（同音異義語）を正確な医学用語に校正し、無駄な全角/半角スペースや余剰な空行を徹底的に排除した上で、標準的な【SOAP形式】に厳密構造化して出力してください。

【SOAP各セクションの厳密な振り分け基準】
- 【S】(Subjective / 主観的情報): 主訴、発症時期、症状の性質・経過（OPQRST）、増悪・寛解因子、既往歴、内服薬（持参薬）、アレルギー歴。患者の口語表現（「胸が締め付けられる」「息が苦しい」等）は正確な医学用語（「胸部絞扼感」「労作時呼吸困難」等）へ校正しつつ訴えの内容を正確に記述すること。
- 【O】(Objective / 客観的情報): バイタルサイン（BP, PR, SpO2, BT等）、身体診察所見、12誘導心電図所見、血液・尿検査値、画像所見。入力文に存在する数値・単位（mmHg, bpm, mg/dL等）は1文字も改変せず正確に転記すること。
- 【A】(Assessment / 臨床評価): 【S】と【O】から導かれる主病態診断名、鑑別診断（除外診断を含む）、重症度評価、リスク評価。
- 【P】(Plan / 治療・検査計画): 処方薬（薬剤名・規格・用法用量）、追加検査計画（採血・心電図・画像CT等）、処置、他科・専門医紹介、患者指導・安静指示。

【絶対厳守ルール】
1. 100%日本語（および標準医療略語: BP, HR, SpO2, ECG, ST, eGFR, HbA1c, mg等）のみで出力し、挨拶、前置き、解説、マークダウン装飾（\`\`\`等）は一切出力しないこと。
2. 全角スペース（　）や2つ以上の連続半角スペース、行頭・行末の無駄な空白、連続する空行を1箇所も出力しないこと。日本語文字間に不自然なスペースを挟まないこと。
3. 入力テキストに存在しない架空の検査値や薬剤を捏造（ハルシネーション）しないこと。
4. 各項目は「・」から始まる簡潔なカルテ文体（体言止め、または「〜を認める」「〜方針」）で記述すること。

【出力フォーマット（無駄な改行・スペースなし）】
【S】
・(主訴・現病歴・既往歴・内服薬)
【O】
・(バイタルサイン・身体所見・検査所見)
【A】
・(診断・病態評価・鑑別疾患)
【P】
・(処方・検査計画・患者指導)

【入力カルテ/音声メモ】
${cleanInput}

【整形本文】
`;
  }

  if (style === 'concise') {
    return `あなたは日本の医師を支援する医療電子カルテ要約・文章校正専門AIです。
以下の【入力カルテ/音声メモ】の誤字脱字・音声誤認識を正確な医学用語へ校正し、冗長な助詞や無駄なスペース・空行をすべて削除して、医師が一目で全体像を把握できる【箇条書き臨床要約】を作成してください。

【箇条書き要約の厳密な構成ルール】
以下の5項目に整理し、各項目1〜2行で医学的ファクト（数値・薬品名・病名・経過）のみを凝縮して記載してください：
■ 主訴・経過: (発症時期・部位・症状の性質・誘因を端的に)
■ 既往・内服: (基礎疾患・現在の内服薬と用量。該当なければ「特記なし」)
■ 客観所見・検査: (血圧・脈拍・SpO2・身体所見・心電図・採血異常値)
■ 診断・臨床評価: (最有力診断・鑑別疾患・重症度)
■ 治療・処方方針: (新規処方・検査オーダー・指導・フォロー方針)

【絶対厳守ルール】
1. 100%日本語（および標準医療略語）のみで出力し、前置きや解説は一切出力しないこと。
2. 全角スペース（　）や無駄な連続改行を一切含めず、体言止め中心の引き締まった臨床サマリーにすること。
3. 入力にない数値や薬品名を絶対に捏造しないこと。

【入力カルテ/音声メモ】
${cleanInput}

【整形本文】
`;
  }

  // style === 'interview'
  return `あなたは日本の医師を支援する医療問診・現病歴作成専門AIです。
以下の【入力カルテ/音声メモ】の誤字脱字・音声誤認識を正確な医学用語へ校正し、無駄な全角スペースや余計な改行を排除した上で、紹介状（診療情報提供書）や初診カルテにそのまま記載できる格調高い【問診・現病歴要約】を作成してください。

【問診・現病歴要約の構成ルール】
・現病歴: 発症時期、誘因・状況、部位・放散、性状・程度、持続時間、増悪・寛解因子、随伴症状を時系列（OPQRST）で自然な医学的文章にまとめる。
・既往歴・常用薬: 基礎疾患および現在内服中の薬剤名・用量を明記する。
・来院時所見・初期方針: バイタルサインや主要所見、本日の診断評価と処方・検査方針を簡潔に付記する。

【絶対厳守ルール】
1. 100%日本語（および標準医療略語）のみで出力し、挨拶や前置きは一切出力しないこと。
2. 無駄な全角/半角スペースや連続空行を完全に排除すること。
3. 入力にない事実や検査値を絶対に捏造しないこと。

【入力カルテ/音声メモ】
${cleanInput}

【整形本文】
`;
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
  const cleanedSource = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(text));
  const engine = await getWebLlmEngine(onProgress, modelId);

  // Gemma 2 には system ロールが存在しないため、指示を user メッセージ内に統合 (RLHF完全適合)
  const prompt = buildGemma2MedicalPrompt(cleanedSource, style);

  if (onProgress) {
    onProgress({ text: 'Gemma 2 が高精度プロンプトで文章校正・構造化中...', progress: 1.0 });
  }

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      // Gemma 2 多言語ジベリッシュ発散を防止しつつ正確な校正を行う低温度設定 (temperature=0.15)
      temperature: 0.15,
      top_p: 0.85,
      max_tokens: 480,
      presence_penalty: 0.0,
      frequency_penalty: 0.05,
      stop: ['<end_of_turn>', '<start_of_turn>', '【入力カルテ/音声メモ】', '【入力テキスト】', '【入力】'],
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
        console.warn('[WebLLM]: Multilingual/gibberish detected during real-time stream. Halting stream immediately.');
        isDegraded = true;
        break;
      }

      if (onStream) {
        onStream(currentCleaned);
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);

    // ★ ジベリッシュ（多言語文字化け・モデル崩壊）検知時の安全フェイルセーフ
    if (isDegraded || isGibberishOutput(cleaned)) {
      console.warn('[WebLLM]: Gemma 2 output degraded. Activating safe medical fallback.');
      const fallback = generateSafeFallbackChart(cleanedSource, style);
      if (onStream) {
        onStream(fallback);
      }
      return fallback;
    }

    return cleaned || generateSafeFallbackChart(cleanedSource, style);
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Stream Fallback]:', err);
    try {
      const completion = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.15,
        top_p: 0.85,
        max_tokens: 480,
        stop: ['<end_of_turn>', '<start_of_turn>', '【入力カルテ/音声メモ】'],
      });
      const fallbackText = completion.choices[0]?.message?.content || '';
      const cleanedFallback = cleanGeneratedChartText(fallbackText);
      if (!isGibberishOutput(cleanedFallback)) {
        return cleanedFallback;
      }
    } catch (fallbackErr) {
      console.warn('[WebLLM Gemma 2 Fallback Error]:', fallbackErr);
    }
    return generateSafeFallbackChart(cleanedSource, style);
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
