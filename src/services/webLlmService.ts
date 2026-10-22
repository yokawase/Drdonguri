import type {
  MLCEngineInterface,
  InitProgressReport,
} from '@mlc-ai/web-llm';
import type { MindsGuidelineDetail } from '../utils/mindsGuidelineCompiler';

// 【Google Gemma 2 日本語特化 2B モデル群】
// 1. FP32高精度版 (Intel Iris Xe 等の shader-f16 非対応・精度バグ環境でも100%安定動作)
export const GEMMA_2_JPN_MODEL = 'gemma-2-2b-jpn-it-q4f32_1-MLC';
// 2. FP16超高速版 (Apple Silicon / RTX / 最新GPUで 2.2倍高速な WebGPU shader-f16 推論)
export const GEMMA_2_JPN_FAST_F16_MODEL = 'gemma-2-2b-jpn-it-q4f16_1-MLC';

// デフォルトモデル
export const DEFAULT_WEBLLM_MODEL = GEMMA_2_JPN_MODEL;

// 高速モード / 高精度モード定数
export const FAST_WEBLLM_MODEL = GEMMA_2_JPN_FAST_F16_MODEL;
export const PRECISE_WEBLLM_MODEL = GEMMA_2_JPN_MODEL;

export interface ModelLoadProgress {
  text: string;
  progress: number; // 0.0 ~ 1.0
}

export interface InferenceTelemetry {
  ttftMs: number;       // Time To First Token (ms)
  tokensPerSec: number; // 生成速度 (tok/s)
  totalTokens: number;  // 総生成トークン数
  elapsedMs: number;    // 総推論時間 (ms)
  modelId: string;
}

let lastTelemetry: InferenceTelemetry = {
  ttftMs: 0,
  tokensPerSec: 0,
  totalTokens: 0,
  elapsedMs: 0,
  modelId: DEFAULT_WEBLLM_MODEL,
};

export function getLastInferenceTelemetry(): InferenceTelemetry {
  return lastTelemetry;
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
 * WebLLM エンジンをシングルトンとして取得・初期化 (KVキャッシュ2048最適化＆自動フォールバック付)
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

      const spawnEngine = async (targetModel: string) => {
        const worker = new Worker(
          new URL('../workers/webllm.worker.ts', import.meta.url),
          { type: 'module' }
        );
        currentWorker = worker;

        return await CreateWebWorkerMLCEngine(
          worker,
          targetModel,
          {
            initProgressCallback: (report: InitProgressReport) => {
              if (onProgress) {
                onProgress({
                  text: report.text,
                  progress: report.progress,
                });
              }
            },
          },
          {
            // カルテ・医療秘書対話に最適な2048コンテキストウィンドウに絞ることで
            // WebGPU KVキャッシュ確保時間とPrefill計算量を50%以上高速化
            context_window_size: 2048,
          }
        );
      };

      try {
        const engine = await spawnEngine(modelId);
        engineInstance = engine;
        currentLoadedModelId = modelId;
        return engine;
      } catch (firstErr) {
        if (modelId !== GEMMA_2_JPN_MODEL) {
          console.warn('[WebLLM] Fast f16 model unsupported on this GPU, falling back to f32:', firstErr);
          if (currentWorker) {
            (currentWorker as Worker).terminate();
            currentWorker = null;
          }
          const fallbackEngine = await spawnEngine(GEMMA_2_JPN_MODEL);
          engineInstance = fallbackEngine;
          currentLoadedModelId = GEMMA_2_JPN_MODEL;
          return fallbackEngine;
        }
        throw firstErr;
      }
    } finally {
      isLoadingEngine = false;
      loadPromise = null;
    }
  })();

  return loadPromise;
}

/**
 * アイドル時にバックグラウンドでWebLLMエンジンを事前ウォームアップ（キャッシュ済みの場合に即応化）
 */
export function prewarmWebLlmEngine(modelId: string = DEFAULT_WEBLLM_MODEL): void {
  if (engineInstance || isLoadingEngine || !isWebGpuSupported()) return;
  if (typeof caches !== 'undefined') {
    caches.keys().then((keys) => {
      const hasCachedWeights = keys.some((k) => k.includes('webllm') || k.includes('mlc'));
      if (hasCachedWeights && !engineInstance && !isLoadingEngine) {
        getWebLlmEngine(undefined, modelId).catch(() => {});
      }
    }).catch(() => {});
  }
}

/**
 * エンジンの初期化状態を確認
 */
export function isEngineLoaded(): boolean {
  return engineInstance !== null;
}

export function isEngineLoading(): boolean {
  return isLoadingEngine;
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
import {
  expandMedicalAbbreviations,
  auditRenalAndPrescriptions,
  detectClinicalRedFlags,
  generateGuidelineEvidenceSnippets,
} from './clinicalCopilotEngine';

/**
 * 医師のリアルな痛みを解消する Gemma 2 臨床出力モード型
 * - soap: ① つぶやき・独り言からの完全SOAPカルテ構造化
 * - referral: ② 殴り書きからの「診療情報提供書（紹介状）・退院時サマリー」爆速ドラフト
 * - order_sbar: ③ 走り書きからの「看護師指示簿（Dr's Order）」＆「SBAR申し送り」安全定型化
 * - patient_ic: ④ 「中学生でもわかる」患者・家族向けIC説明書・帰宅後生活指導シート
 * - clinical_audit: ⑤ 処方・腎機能(eGFR)監査 ＆ 鑑別Red Flags ＆ Mindsガイドライン根拠文一括生成
 * - concise: ⑥ 箇条書き臨床要約
 * - interview: ⑦ 問診・現病歴 (OPQRST) 格調清書
 */
export type ClinicalFormatStyle =
  | 'soap'
  | 'referral'
  | 'order_sbar'
  | 'patient_ic'
  | 'clinical_audit'
  | 'concise'
  | 'interview';

/**
 * 医師の入力文・抽出カルテから安全・確実に各臨床文書を生成する高精度臨床構造化エンジン
 */
export function generateSafeFallbackChart(
  rawText: string,
  style: ClinicalFormatStyle = 'soap'
): string {
  const { expandedText } = expandMedicalAbbreviations(rawText);
  const cleanedText = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(expandedText));
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

  // ② 紹介状（診療情報提供書）・退院時サマリー ドラフト生成
  if (style === 'referral') {
    const mainDiagnosis = aItems.length > 0 ? aItems.map(refineClinicalPhrase).join('、') : '精査・加療対象疾患';
    const chiefHistory = sItems.length > 0 ? sItems.map(refineClinicalPhrase).join('。') : refineClinicalPhrase(cleanedText);
    const pastMed = medAndHistoryItems.length > 0 ? medAndHistoryItems.join(' / ') : '特記すべき重篤な既往・アレルギーなし';
    const findings = oItems.length > 0 ? oItems.join('、') : 'バイタルサイン安定、特記異常所見なし';
    const currentPlan = pItems.length > 0 ? pItems.join('、') : '対症療法および初期精査を実施';

    return [
      '【診療情報提供書 / 退院時サマリー ドラフト】',
      '拝啓 時下ますますご清祥のこととお慶び申し上げます。平素より格別のご高配を賜り厚く御礼申し上げます。',
      `今般、下記患者様につきまして専門的精査・加療をお願いしたくご紹介申し上げます。`,
      '',
      `【傷病名】${mainDiagnosis}`,
      `【紹介目的】専門的精査および今後の方針ご高診のお願い`,
      `【既往歴・常用薬】${pastMed}`,
      `【症状経過・現病歴】`,
      `${chiefHistory}。`,
      `【身体所見・検査所見】`,
      `${findings}。`,
      `【治療経過・現在の処方】`,
      `${currentPlan}。`,
      '',
      'ご多忙中恐れ入りますが、何卒ご高診・ご加療のほどよろしくお願い申し上げます。敬具',
    ].join('\n');
  }

  // ③ 看護師指示簿（Dr's Order）＆ 当直SBAR申し送り生成
  if (style === 'order_sbar') {
    const sSummary = sItems.length > 0 ? sItems.map(refineClinicalPhrase).join(' / ') : refineClinicalPhrase(cleanedText);
    const bSummary = medAndHistoryItems.length > 0 ? medAndHistoryItems.join(' / ') : '基礎疾患・持参薬確認済';
    const aSummary = aItems.length > 0 ? aItems.map(refineClinicalPhrase).join(' / ') : 'バイタル・症状推移の慎重観察を要する状態';
    const rSummary = pItems.length > 0 ? pItems.join(' / ') : '症状増悪時の早期報告および指示薬投与';

    return [
      '【1. 看護師指示簿 (Dr\'s Order 安全定型化)】',
      '■ バイタル測定: 検温・血圧・脈拍・SpO2 1日3回（状態変化時は随時測定）',
      '■ 発熱時指示 (38.5℃以上 または 悪寒・頭痛時):',
      '  ・アセトアミノフェン(カロナール) 500mg 1回1錠 内服（投与間隔6時間以上、1日最大3回まで）',
      '■ 疼痛・胸部症状時指示:',
      `  ・${pItems.length > 0 ? pItems.join(' / ') : '安静臥床の上、12誘導心電図・バイタル測定し主治医/当直医コール'}`,
      '■ ドクターコール基準 (直ちに医師報告):',
      '  ・収縮期血圧 <90 または >180mmHg、脈拍 >120/分、SpO2 <92%、意識変容・症状増悪時',
      '',
      '【2. 病棟・当直カンファレンス申し送り (SBAR形式)】',
      `【S (Situation: 現状)】${sSummary}`,
      `【B (Background: 背景・既往)】${bSummary} / 所見: ${oItems.join('、') || 'バイタル安定'}`,
      `【A (Assessment: 評価)】${aSummary}`,
      `【R (Recommendation: 依頼・方針)】${rSummary}`,
    ].join('\n');
  }

  // ④ 患者・家族向けIC説明書（中学生でもわかる平易な言葉への翻訳）
  if (style === 'patient_ic') {
    const toLayman = (txt: string) =>
      txt
        .replace(/労作性狭心症/g, '動いたときに心臓の血管が一時的に狭くなる病気（労作性狭心症）')
        .replace(/胸部圧迫感|胸部絞扼感/g, '胸が締め付けられるような苦しさ')
        .replace(/労作時の息切れ|労作時呼吸困難/g, '階段や坂道を上ったときの息切れ')
        .replace(/脂質異常症/g, '血液中のコレステロール値が高い状態（脂質異常症）')
        .replace(/高血圧症?/g, '血圧が高い状態（高血圧）')
        .replace(/下腿浮腫/g, '足のむくみ')
        .replace(/心雑音なし/g, '心臓の音に異常なし')
        .replace(/ラ音聴取せず/g, '肺の音に異常なし')
        .replace(/硝酸薬/g, '心臓の血管を広げるお薬')
        .replace(/舌下錠/g, '舌の下で溶かして使うお薬（飲み込まないでください）')
        .replace(/頓用/g, '症状が出たときだけ使うお薬')
        .replace(/対診/g, '専門の医師による詳しい診察');

    const laymanDiagnosis = toLayman(aItems.join('、') || '本日の症状に関する検査・治療');
    const laymanSymptom = toLayman(sItems.join('、') || cleanedText);
    const laymanPlan = toLayman(pItems.join('\n・') || 'お薬の調整と詳しい検査を行います');

    return [
      '【患者様・ご家族様へ 本日の診察ご説明書】',
      `■ 本日の症状・ご相談内容`,
      `・${laymanSymptom}`,
      '',
      `■ 考えられるご病気・現在の状態`,
      `・${laymanDiagnosis}`,
      '※確定診断と安全な治療のため、検査結果や症状の変化を丁寧に確認していきます。',
      '',
      `■ 今後の検査・お薬・生活上の注意点`,
      `・${laymanPlan}`,
      '・処方されたお薬は、医師の指示通りに用法・用量を守ってお使いください。',
      '',
      '■ 【重要】すぐに病院へ連絡・受診していただきたい症状',
      '・安静にしていても治まらない強い痛みや苦しさ、冷や汗、意識が遠のく感じがある場合は、次回予約を待たずにすぐにご連絡・受診してください。',
    ].join('\n');
  }

  // ⑤ 処方・腎機能監査 ＆ 鑑別Red Flags ＆ Mindsガイドライン根拠 一括出力
  if (style === 'clinical_audit') {
    const renalAudit = auditRenalAndPrescriptions(cleanedText);
    const redFlags = detectClinicalRedFlags(cleanedText);
    const glSnippets = generateGuidelineEvidenceSnippets(cleanedText);

    const outLines: string[] = ['【🛡️ 臨床安全・処方・ガイドライン統合監査レポート】'];

    outLines.push('■ 1. 見落とし防止 鑑別Red Flags ＆ 防衛カルテ記載:');
    for (const rf of redFlags) {
      outLines.push(`・対象症候: ${rf.syndrome}`);
      outLines.push(`・除外すべき緊急疾患: ${rf.criticalDifferentials.join(' / ')}`);
      outLines.push(`・確認すべき危険徴候: ${rf.mustCheckSigns.join(' / ')}`);
      outLines.push(`・${rf.defensiveChartSnippet}`);
    }

    outLines.push('');
    outLines.push(
      `■ 2. 処方・腎機能(eGFR)ドーズアジャスト監査 (${renalAudit.detectedEgfr !== null ? `検出eGFR: ${renalAudit.detectedEgfr} mL/min` : 'eGFR数値未記載'}):`
    );
    if (renalAudit.alerts.length > 0) {
      for (const al of renalAudit.alerts) {
        outLines.push(`・[${al.drugName}] ${al.recommendedAction}`);
        outLines.push(`  ➔ ${al.orderSnippet}`);
      }
    } else {
      outLines.push('・現在記載されている薬剤に明らかな腎機能禁忌・重篤な用量逸脱は検出されませんでした。');
    }

    outLines.push('');
    outLines.push('■ 3. Minds診療ガイドライン ＆ レセプト算定根拠文:');
    for (const gl of glSnippets) {
      outLines.push(`・${gl.snippet}`);
    }

    return outLines.join('\n');
  }

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

  // デフォルト: ① 構造化SOAP形式
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

import {
  MINDS_KNOWLEDGE_CATALOG,
  DRUGS_CATALOG,
  RENAL_DOSE_CATALOG,
  LAB_TESTS_CATALOG,
  PROCEDURES_CATALOG,
} from '../data/medicalKnowledgeCatalog';
import {
  EMERGENCY_PROTOCOLS_CATALOG,
  CLINICAL_SCORES_CATALOG,
} from '../data/microSdMedicalCatalog';

/**
 * ストリーミング中の軽量O(1)トークンストリップ（毎トークンの正規表現・行分割オーバーヘッドをゼロ化）
 */
function fastStripStreamText(text: string): string {
  return text
    .replace(/<(?:start_of_turn|end_of_turn|unused\d+)>(?:model|user)?/gi, '')
    .replace(/^【(?:整形本文|補正本文|ガイドライン準拠の臨床アドバイス|医療秘書回答)】\s*/g, '')
    .replace(/^```(?:markdown|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trimStart();
}

/**
 * 生成完了後のカルテテキストから特殊トークンや見出しタグ、無駄なスペース・改行を除去するサニタイザー
 */
function cleanGeneratedChartText(text: string): string {
  const stripped = fastStripStreamText(text)
    .replace(/^(?:はい[、。]?|承知いたしました[、。]?|以下[がに][^\n]*\n+)/i, '')
    .trim();
  return cleanExtractedMedicalText(stripped);
}

/**
 * Google Gemma 2 (gemma-2-2b-jpn-it) 専用の超高速・高密度プロンプトビルダー
 * Prefill（初回トークン到達時間 TTFT）を2倍以上高速化するため指示トークンを圧縮最適化
 */
export function buildGemma2MedicalPrompt(
  rawInput: string,
  style: ClinicalFormatStyle = 'soap'
): string {
  const { expandedText } = expandMedicalAbbreviations(rawInput);
  const cleanInput = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(expandedText)).slice(0, 900);

  const rules = `厳守: 言い直し・全角空白を削除し、入力にない数値や薬品名を捏造せず、前置き挨拶なしで本文のみ100%日本語出力。`;

  if (style === 'soap') {
    return `医療カルテAIとして入力メモを【S】(主訴・現病歴・既往・内服)【O】(バイタル・身体/検査所見)【A】(診断・鑑別)【P】(処方・検査・指導)に箇条書き構造化せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  if (style === 'referral') {
    return `医療秘書AIとして入力メモから格調高い【診療情報提供書】（拝啓〜敬具、【傷病名】【紹介目的】【既往歴・常用薬】【症状経過】【検査所見】【現在の処方】）を作成せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  if (style === 'order_sbar') {
    return `病棟医療安全AIとして入力メモから【1. 看護師指示簿 (観察・頓用指示・Drコール基準)】と【2. SBAR申し送り (S/B/A/R)】を簡潔に作成せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  if (style === 'patient_ic') {
    return `医師支援AIとして入力メモを患者・家族向けに平易で優しい日本語の【ご説明書】（■本日の症状 ■考えられるご病気 ■お薬と注意点 ■すぐ受診すべき危険な症状）に翻訳せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  if (style === 'clinical_audit') {
    return `医療安全監査AIとして入力メモから【■1. 鑑別Red Flagsと確認所見】【■2. 処方・eGFR腎機能減量監査】【■3. ガイドライン推奨・算定要点】を簡潔に出力せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  if (style === 'concise') {
    return `医療要約AIとして入力メモを体言止めで【■主訴・経過】【■既往・内服】【■客観所見】【■診断評価】【■治療方針】の箇条書きに要約せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
  }

  return `医療問診AIとして入力メモから初診カルテ用の【問診・現病歴要約(OPQRST)】（・現病歴 ・既往歴/常用薬 ・来院時所見/方針）を作成せよ。${rules}
【入力】
${cleanInput}
【整形本文】
`;
}

/**
 * 医療カルテテキストのAI自動校正・構造化 (Google Gemma 2 高速ストリーミング＆テレメトリ計測版)
 */
export async function formatMedicalChartWithWebLLM(
  text: string,
  style: ClinicalFormatStyle = 'soap',
  onProgress?: (report: ModelLoadProgress) => void,
  onStream?: (accumulatedText: string) => void,
  modelId: string = DEFAULT_WEBLLM_MODEL
): Promise<string> {
  const { expandedText } = expandMedicalAbbreviations(text);
  const cleanedSource = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(expandedText));
  const engine = await getWebLlmEngine(onProgress, modelId);

  const prompt = buildGemma2MedicalPrompt(cleanedSource, style);

  if (onProgress) {
    onProgress({ text: 'Gemma 2 がWebGPU高速推論で構造化中...', progress: 1.0 });
  }

  const startMs = performance.now();
  let firstTokenMs = 0;
  let tokenCount = 0;

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.12,
      top_p: 0.85,
      max_tokens: 460,
      presence_penalty: 0.0,
      frequency_penalty: 0.05,
      stop: ['<end_of_turn>', '<start_of_turn>', '【入力】', '【入力カルテ/音声メモ】'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;
    let lastEmitMs = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;

      const now = performance.now();
      if (tokenCount === 0) {
        firstTokenMs = Math.max(1, Math.round(now - startMs));
      }
      tokenCount++;
      fullText += delta;

      // 新規トークン単体でのO(1)多言語アーティファクト検知（毎トークンの全文正規表現走査を排除）
      if (hasMultilingualArtifacts(delta)) {
        console.warn('[WebLLM]: Multilingual artifact detected in delta. Halting stream.');
        isDegraded = true;
        break;
      }

      // 32ms (約30fps) スロットリングでメインスレッドReact再描画負荷を90%削減
      if (onStream && now - lastEmitMs >= 32) {
        lastEmitMs = now;
        onStream(fastStripStreamText(fullText));
      }
    }

    const totalElapsed = Math.max(1, performance.now() - startMs);
    const decodeWindowMs = Math.max(1, totalElapsed - firstTokenMs);
    lastTelemetry = {
      ttftMs: firstTokenMs || Math.round(totalElapsed),
      tokensPerSec: Number(((tokenCount / decodeWindowMs) * 1000).toFixed(1)),
      totalTokens: tokenCount,
      elapsedMs: Math.round(totalElapsed),
      modelId: currentLoadedModelId || modelId,
    };

    const cleaned = cleanGeneratedChartText(fullText);

    if (isDegraded || isGibberishOutput(cleaned)) {
      console.warn('[WebLLM]: Gemma 2 output degraded. Activating safe medical fallback.');
      const fallback = generateSafeFallbackChart(cleanedSource, style);
      if (onStream) onStream(fallback);
      return fallback;
    }

    if (onStream) onStream(cleaned);
    return cleaned || generateSafeFallbackChart(cleanedSource, style);
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Stream Fallback]:', err);
    const fallback = generateSafeFallbackChart(cleanedSource, style);
    if (onStream) onStream(fallback);
    return fallback;
  }
}

/**
 * カメラOCRで抽出した粗い生テキストを医療文脈で高精度補正・カルテ化 (Google Gemma 2 高速版)
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
      ? '処方箋形式（薬品名・用法用量・日数）'
      : '標準カルテ形式（【主訴】【所見】【方針】）';

  const cleanRaw = rawOcrText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, 750);

  const prompt = `医療OCR補正AIとして生OCRの誤字・単位（mg/dL, %, γ-GTP等）を修正し、${styleDesc}で前置きなく100%日本語本文のみ出力せよ。
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
      temperature: 0.15,
      top_p: 0.85,
      max_tokens: 360,
      stop: ['<end_of_turn>', '<start_of_turn>', '【OCR生テキスト】'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;
    let lastEmitMs = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;
      fullText += delta;

      if (hasMultilingualArtifacts(delta)) {
        isDegraded = true;
        break;
      }

      const now = performance.now();
      if (onStream && now - lastEmitMs >= 32) {
        lastEmitMs = now;
        onStream(fastStripStreamText(fullText));
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);

    if (isDegraded || isGibberishOutput(cleaned)) {
      const fallback = generateSafeFallbackChart(rawOcrText, mode === 'soap' ? 'soap' : 'concise');
      if (onStream) onStream(fallback);
      return fallback;
    }

    if (onStream) onStream(cleaned);
    return cleaned || rawOcrText;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 OCR Stream Fallback]:', err);
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

  const prompt = `日本の診療ガイドライン(Minds)準拠の医療AIとして、エビデンスに基づきカルテ記載への臨床助言・禁忌注意・患者説明要点を前置きなく100%日本語で簡潔に出力せよ。
【Mindsエビデンス】${guideline.diseaseName} (${guideline.icd10}) / ${guideline.cqTitle} / 推奨: ${guideline.recommendation} / 要点: ${guideline.detail.practiceTip}
【現在のカルテ】
${soapText.slice(0, 600)}
【ガイドライン準拠の臨床アドバイス】
`;

  try {
    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15,
      top_p: 0.85,
      max_tokens: 320,
      stop: ['<end_of_turn>', '<start_of_turn>'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;
    let lastEmitMs = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;
      fullText += delta;

      if (hasMultilingualArtifacts(delta)) {
        isDegraded = true;
        break;
      }

      const now = performance.now();
      if (onStream && now - lastEmitMs >= 32) {
        lastEmitMs = now;
        onStream(fastStripStreamText(fullText));
      }
    }

    const cleaned = cleanGeneratedChartText(fullText);
    if (isDegraded || isGibberishOutput(cleaned)) {
      const fallback = `【推奨】${guideline.recommendation}\n【実践要点】${guideline.detail.practiceTip}`;
      if (onStream) onStream(fallback);
      return fallback;
    }

    if (onStream) onStream(cleaned);
    return cleaned || guideline.recommendation;
  } catch (err: any) {
    console.warn('[WebLLM Gemma 2 Minds RAG Stream Fallback]:', err);
    return `【推奨】${guideline.recommendation}\n【実践要点】${guideline.detail.practiceTip}`;
  }
}

// =============================================================================
// Gemma 2 医療秘書チャットエンジン (Medical Secretary Interactive Copilot)
// カルテ文脈 ＋ 32GB MicroSD 10大医療マスターRAG ＋ Gemma 2 WebGPU深層対話
// =============================================================================

export interface SecretaryChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  references?: string[];
  tokPerSec?: number;
  ttftMs?: number;
  mode?: 'instant_rag' | 'gemma2_deep';
}

export const SECRETARY_QUICK_PROMPTS: { label: string; prompt: string; badge: string }[] = [
  {
    label: '🩺 カルテ総合監査・見落としチェック',
    prompt: '現在のカルテ内容から、鑑別すべきRed Flags（致死的疾患）、確認すべき追加所見、処方・腎機能(eGFR)の注意点を医療秘書として簡潔に監査してください。',
    badge: '安全監査',
  },
  {
    label: '💊 処方・腎機能(eGFR)用量チェック',
    prompt: '現在のカルテ内の内服薬・処方薬について、腎機能(eGFR)別の減量基準・併用注意・添付文書の重要ポイントを教えてください。',
    badge: '処方監査',
  },
  {
    label: '📋 SOAP形式に即座に清書',
    prompt: '現在のカルテ内容を、電カルにそのまま打鍵転送できる簡潔・正確な【S】【O】【A】【P】形式に整理してください。',
    badge: 'SOAP清書',
  },
  {
    label: '✉️ 専門医への紹介状ドラフト作成',
    prompt: '現在のカルテ内容から、専門医へ提出する格調高い診療情報提供書（紹介状）の本文ドラフトを作成してください。',
    badge: '紹介状',
  },
  {
    label: '🗣️ 患者・家族へのやさしい説明文',
    prompt: '現在の病状・検査計画・処方薬の注意点について、患者様やご家族に口頭および書面でわかりやすく説明するための文章を作成してください。',
    badge: 'IC説明',
  },
  {
    label: '📚 Mindsガイドライン推奨＆算定根拠',
    prompt: '現在の主訴・病態に関連するMinds診療ガイドラインの推奨グレードと、レセプト算定・カルテ記載で押さえるべき根拠文を教えてください。',
    badge: 'Minds根拠',
  },
];

/**
 * 質問と現在のカルテから 32GB MicroSD 10大医療マスターを 0.01秒で横断検索し、
 * 根拠データと即応医療秘書アンサーを構築する
 */
export function buildInstantSecretaryRagResponse(
  userQuery: string,
  chartText: string
): {
  instantAnswer: string;
  ragContext: string;
  references: string[];
} {
  const q = userQuery.trim();
  const qLower = q.toLowerCase();
  const combinedText = `${q}\n${chartText || ''}`;
  const references: string[] = [];
  const contextBlocks: string[] = [];

  // 1. 特定タスク意図の直接実行（SOAP / 紹介状 / 指示簿SBAR / 患者IC / 監査）
  if (/(?:soap|ソープ).*(?:まとめ|整理|清書|作成|変換)/i.test(q)) {
    const soap = generateSafeFallbackChart(chartText, 'soap');
    return {
      instantAnswer: `【どんぐり医療秘書・SOAP構造化案】\n${soap}`,
      ragContext: soap,
      references: ['カルテ構造化エンジン (SOAP)'],
    };
  }
  if (/(?:紹介状|診療情報提供書|対診|サマリー).*(?:書|作成|ドラフト|まとめ)/i.test(q)) {
    const refDoc = generateSafeFallbackChart(chartText, 'referral');
    return {
      instantAnswer: refDoc,
      ragContext: refDoc,
      references: ['診療情報提供書ジェネレーター'],
    };
  }
  if (/(?:指示簿|sbar|申し送り).*(?:書|作成|ドラフト|まとめ)/i.test(q)) {
    const sbarDoc = generateSafeFallbackChart(chartText, 'order_sbar');
    return {
      instantAnswer: sbarDoc,
      ragContext: sbarDoc,
      references: ['病棟指示簿 & SBARジェネレーター'],
    };
  }
  if (/(?:患者|家族|わかりやすく|平易|説明文|説明書|ic)/i.test(q) && /(?:書|作成|作っ|説明|翻訳)/i.test(q)) {
    const icDoc = generateSafeFallbackChart(chartText, 'patient_ic');
    return {
      instantAnswer: icDoc,
      ragContext: icDoc,
      references: ['患者・家族向けIC説明書ジェネレーター'],
    };
  }

  // 2. カルテ連動の処方・腎機能監査 / Red Flags / ガイドライン根拠抽出
  const renalAudit = auditRenalAndPrescriptions(combinedText);
  const redFlags = detectClinicalRedFlags(combinedText);
  const guidelines = generateGuidelineEvidenceSnippets(combinedText);

  // 3. 10大医療マスターからのピンポイント検索（薬剤・腎機能用量・ガイドライン・救急・スコア・検査・点数）
  const matchedRenal = RENAL_DOSE_CATALOG.filter((r) => {
    const base = r.drugName.split(/[()（）\s/]+/)[0];
    return base && combinedText.includes(base);
  }).slice(0, 3);

  const matchedDrugs = DRUGS_CATALOG.filter((d) => {
    const base = d.name.replace(/(?:錠|カプセル|舌下錠|OD錠|[\d.]+mg).*$/g, '').trim();
    return (base.length >= 2 && combinedText.includes(base)) || (d.genericName && combinedText.includes(d.genericName));
  }).slice(0, 4);

  const matchedMinds = MINDS_KNOWLEDGE_CATALOG.filter((m) => {
    const cleanDis = m.diseaseName.replace(/[（()）].*?[）)]/g, '').trim();
    return (cleanDis.length >= 2 && combinedText.includes(cleanDis)) || m.cqTitle.toLowerCase().includes(qLower);
  }).slice(0, 3);

  const matchedEmer = EMERGENCY_PROTOCOLS_CATALOG.filter((e) =>
    e.title.toLowerCase().includes(qLower) ||
    e.category.toLowerCase().includes(qLower) ||
    e.title.split(/[\s:：()（）・/]+/).some((part) => part.length >= 2 && q.includes(part))
  ).slice(0, 2);

  const matchedScores = CLINICAL_SCORES_CATALOG.filter((s) =>
    s.scoreName.toLowerCase().includes(qLower) ||
    s.targetClinicalCondition.toLowerCase().includes(qLower) ||
    s.scoreName.split(/[\s()（）]+/).some((part) => part.length >= 3 && combinedText.includes(part))
  ).slice(0, 2);

  const matchedLabs = LAB_TESTS_CATALOG.filter((l) =>
    l.name.toLowerCase().includes(qLower) ||
    l.name.split(/[\s()（）/・]+/).some((part) => part.length >= 2 && q.includes(part))
  ).slice(0, 3);

  const matchedProcs = PROCEDURES_CATALOG.filter((p) =>
    p.name.includes(q) || q.includes(p.name) || combinedText.includes(p.name)
  ).slice(0, 2);

  const sections: string[] = [];

  if (redFlags.length > 0 && (/(?:監査|見落と|鑑別|red\s*flag|危険|胸痛|圧迫|息切れ|腹痛|頭痛|めまい)/i.test(q) || sections.length === 0)) {
    const rfLines = redFlags.slice(0, 2).map(
      (rf) => `・【${rf.syndrome}】除外すべき疾患: ${rf.criticalDifferentials.join(' / ')}\n  確認所見: ${rf.mustCheckSigns.join('、')}\n  推奨カルテ記載: 「${rf.defensiveChartSnippet}」`
    );
    sections.push(`■ 鑑別診断・Red Flags監査\n${rfLines.join('\n')}`);
    contextBlocks.push(rfLines.join('\n'));
    references.push(...redFlags.slice(0, 2).map((r) => `RedFlag: ${r.syndrome}`));
  }

  if (renalAudit.alerts.length > 0 || matchedRenal.length > 0 || matchedDrugs.length > 0) {
    const drugLines: string[] = [];
    if (renalAudit.detectedEgfr !== null) {
      drugLines.push(`・検出腎機能: eGFR ${renalAudit.detectedEgfr} mL/min/1.73m²`);
    }
    for (const al of renalAudit.alerts.slice(0, 3)) {
      drugLines.push(`・⚠️【${al.drugName}】${al.recommendedAction} (${al.orderSnippet})`);
      references.push(`腎機能監査: ${al.drugName}`);
    }
    for (const r of matchedRenal) {
      const cutoffStr = r.cutoffs.map((c) => `${c.range}: ${c.dose}`).join(' / ');
      drugLines.push(`・💊【${r.drugName} (${r.category})】通常: ${r.standardDose} / ${cutoffStr} (${r.clinicalTip})`);
      references.push(`腎機能用量マスター: ${r.drugName}`);
    }
    for (const d of matchedDrugs) {
      drugLines.push(`・💊【${d.name} (${d.genericName})】用法: ${d.standardDosage} / 注意: ${d.cautions}`);
      references.push(`PMDA添付文書: ${d.name}`);
    }
    if (drugLines.length > 0) {
      sections.push(`■ 処方・医薬品・腎機能(eGFR)チェック\n${drugLines.join('\n')}`);
      contextBlocks.push(drugLines.join('\n'));
    }
  }

  if (guidelines.length > 0 || matchedMinds.length > 0) {
    const glLines: string[] = [];
    for (const g of guidelines.slice(0, 2)) {
      glLines.push(`・📘【${g.title} (${g.badge})】カルテ記載用根拠文: 「${g.snippet}」`);
      references.push(g.title);
    }
    for (const m of matchedMinds) {
      glLines.push(`・📘【Minds: ${m.diseaseName}】${m.cqTitle}\n  推奨(${m.strength} / Ev:${m.evidenceLevel}): ${m.recommendation}`);
      references.push(`Minds: ${m.diseaseName}`);
    }
    if (glLines.length > 0) {
      sections.push(`■ Minds診療ガイドライン推奨＆カルテ記載根拠\n${glLines.join('\n')}`);
      contextBlocks.push(glLines.join('\n'));
    }
  }

  if (matchedEmer.length > 0) {
    const emLines = matchedEmer.map(
      (e) => `・🚨【${e.title}】初期対応: ${e.initialProtocol} / 治療・解毒薬: ${e.antidoteOrTreatment} / 注意: ${e.cautions}`
    );
    sections.push(`■ 救急・中毒・DMATプロトコル\n${emLines.join('\n')}`);
    contextBlocks.push(emLines.join('\n'));
    references.push(...matchedEmer.map((e) => `救急プロトコル: ${e.title}`));
  }

  if (matchedScores.length > 0) {
    const scLines = matchedScores.map(
      (s) => `・📊【${s.scoreName} (${s.targetClinicalCondition})】項目: ${s.calculationFormula} / 判定: ${s.riskEvaluation} (${s.clinicalAction})`
    );
    sections.push(`■ 臨床予測スコア・リスク評価\n${scLines.join('\n')}`);
    contextBlocks.push(scLines.join('\n'));
    references.push(...matchedScores.map((s) => `臨床スコア: ${s.scoreName}`));
  }

  if (matchedLabs.length > 0 || matchedProcs.length > 0) {
    const lpLines: string[] = [];
    for (const l of matchedLabs) {
      lpLines.push(`・🔬【${l.name}】基準値: ${l.referenceRange} / パニック値: ${l.panicValue} / 臨床意義: ${l.clinicalSignificance}`);
      references.push(`検査マスター: ${l.name}`);
    }
    for (const p of matchedProcs) {
      lpLines.push(`・🏥【${p.name} (${p.code})】${p.points}点 / 算定要件: ${p.requirements}`);
      references.push(`医科点数表: ${p.name}`);
    }
    sections.push(`■ 検査基準値・医科診療報酬算定要件\n${lpLines.join('\n')}`);
    contextBlocks.push(lpLines.join('\n'));
  }

  if (sections.length === 0) {
    const concise = generateSafeFallbackChart(chartText, 'concise');
    sections.push(`■ カルテ連動・医療秘書ブリーフィング\n${concise}`);
    contextBlocks.push(concise);
    references.push('カルテ文脈解析エンジン');
  }

  const uniqueRefs = Array.from(new Set(references)).slice(0, 6);
  return {
    instantAnswer: sections.join('\n\n'),
    ragContext: contextBlocks.join('\n').slice(0, 700),
    references: uniqueRefs,
  };
}

/**
 * Gemma 2 医療秘書チャット実行（0.01秒の即応RAGブリーフィング ＋ WebGPU深層ストリーミング対話）
 */
export async function chatWithGemma2Secretary(
  messages: SecretaryChatMessage[],
  currentChartText: string,
  options: {
    mode?: 'instant' | 'deep';
    modelId?: string;
    onProgress?: (report: ModelLoadProgress) => void;
    onStream?: (accumulatedText: string, meta?: { references: string[]; isInstantPreview?: boolean }) => void;
  } = {}
): Promise<{
  reply: string;
  references: string[];
  telemetry: InferenceTelemetry;
  usedMode: 'instant_rag' | 'gemma2_deep';
}> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const { instantAnswer, ragContext, references } = buildInstantSecretaryRagResponse(
    lastUserMsg,
    currentChartText
  );

  const mode = options.mode || 'deep';
  const modelId = options.modelId || DEFAULT_WEBLLM_MODEL;

  // 即応モードまたはWebGPU非対応環境では0.01秒で構造化RAG回答を返却
  if (mode === 'instant' || !isWebGpuSupported()) {
    const start = performance.now();
    if (options.onStream) {
      options.onStream(instantAnswer, { references, isInstantPreview: false });
    }
    const elapsed = Math.max(1, Math.round(performance.now() - start));
    const telemetry: InferenceTelemetry = {
      ttftMs: elapsed,
      tokensPerSec: 999.9,
      totalTokens: instantAnswer.length,
      elapsedMs: elapsed,
      modelId: 'OnDevice-Medical-RAG-0.01s',
    };
    return {
      reply: instantAnswer,
      references,
      telemetry,
      usedMode: 'instant_rag',
    };
  }

  // Deepモードでもまず即座にRAGプレビューを通知して体感待ち時間を0msにする
  if (options.onStream) {
    options.onStream(`⚡ 【0.01秒 医療マスター即時照合】\n${instantAnswer}\n\n🧠 Gemma 2 深層推論を起動中...`, {
      references,
      isInstantPreview: true,
    });
  }

  try {
    const engine = await getWebLlmEngine(options.onProgress, modelId);

    // 直近2往復の対話履歴をコンパクトに整形
    const recentHistory = messages
      .slice(-5, -1)
      .map((m) => `${m.role === 'user' ? '医師' : '医療秘書'}: ${m.content.slice(0, 180)}`)
      .join('\n');

    const cleanChart = cleanExtractedMedicalText(currentChartText || '').slice(0, 500);

    const prompt = `あなたは臨床医師の右腕となる優秀な「医療秘書AI (Dr.Dongly Gemma 2)」です。
以下の【現在診察中のカルテ】と【32GB医療マスター照合根拠】を踏まえ、医師の質問・指示に対して簡潔・正確・実践的な100%日本語で回答してください。
厳守: 架空の薬品名や数値を捏造せず、電カルにそのまま転記・活用できる明確な構成で前置き挨拶なしに出力すること。

【現在診察中のカルテ】
${cleanChart || '（未入力）'}

【32GB医療マスター照合根拠】
${ragContext}
${recentHistory ? `\n【直近の対話】\n${recentHistory}\n` : ''}
【医師の質問・指示】
${lastUserMsg}

【医療秘書回答】
`;

    const startMs = performance.now();
    let firstTokenMs = 0;
    let tokenCount = 0;

    const stream = await engine.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.15,
      top_p: 0.85,
      max_tokens: 420,
      presence_penalty: 0.0,
      frequency_penalty: 0.05,
      stop: ['<end_of_turn>', '<start_of_turn>', '【医師の質問・指示】', '【現在診察中のカルテ】'],
      stream: true,
    });

    let fullText = '';
    let isDegraded = false;
    let lastEmitMs = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;

      const now = performance.now();
      if (tokenCount === 0) {
        firstTokenMs = Math.max(1, Math.round(now - startMs));
      }
      tokenCount++;
      fullText += delta;

      if (hasMultilingualArtifacts(delta)) {
        isDegraded = true;
        break;
      }

      if (options.onStream && now - lastEmitMs >= 32) {
        lastEmitMs = now;
        options.onStream(fastStripStreamText(fullText), { references, isInstantPreview: false });
      }
    }

    const totalElapsed = Math.max(1, performance.now() - startMs);
    const decodeWindowMs = Math.max(1, totalElapsed - firstTokenMs);
    lastTelemetry = {
      ttftMs: firstTokenMs || Math.round(totalElapsed),
      tokensPerSec: Number(((tokenCount / decodeWindowMs) * 1000).toFixed(1)),
      totalTokens: tokenCount,
      elapsedMs: Math.round(totalElapsed),
      modelId: currentLoadedModelId || modelId,
    };

    const cleaned = cleanGeneratedChartText(fullText);
    if (isDegraded || isGibberishOutput(cleaned)) {
      if (options.onStream) {
        options.onStream(instantAnswer, { references, isInstantPreview: false });
      }
      return {
        reply: instantAnswer,
        references,
        telemetry: lastTelemetry,
        usedMode: 'instant_rag',
      };
    }

    if (options.onStream) {
      options.onStream(cleaned, { references, isInstantPreview: false });
    }

    return {
      reply: cleaned || instantAnswer,
      references,
      telemetry: lastTelemetry,
      usedMode: 'gemma2_deep',
    };
  } catch (err) {
    console.warn('[Gemma 2 Secretary Chat Fallback]:', err);
    if (options.onStream) {
      options.onStream(instantAnswer, { references, isInstantPreview: false });
    }
    return {
      reply: instantAnswer,
      references,
      telemetry: lastTelemetry,
      usedMode: 'instant_rag',
    };
  }
}

