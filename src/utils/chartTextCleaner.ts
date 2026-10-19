/**
 * カルテテキスト整形・不要スペース/改行削除 ＆ カルテ全体キーワード抽出エンジン
 * 
 * 1. 電子カルテ（仮想プリンタ吸い上げ・OCR・コピーペースト）から抽出した文章の
 *    無駄な全角/半角スペース、制御文字、連続改行を臨床文脈を壊さず完全クリーンアップ。
 * 2. カルテ全文（S/O/A/P、主訴、現病歴、既往歴、内服薬、身体所見、検査、アセスメント、プラン）から
 *    臨床キーワードを網羅的に抽出し、32GB MicroSD内の医薬品・12誘導心電図・Mindsガイドライン・
 *    救急プロトコル・検査値・算定要件と100%リンクさせる。
 */

import {
  MINDS_KNOWLEDGE_CATALOG,
  DRUGS_CATALOG,
  DISEASES_CATALOG,
  LAB_TESTS_CATALOG,
  PROCEDURES_CATALOG,
  RENAL_DOSE_CATALOG,
} from '../data/medicalKnowledgeCatalog';
import {
  EMERGENCY_PROTOCOLS_CATALOG,
  CLINICAL_ATLAS_CATALOG,
  DRUG_IDENTIFICATION_CATALOG,
  CLINICAL_SCORES_CATALOG,
} from '../data/microSdMedicalCatalog';

/**
 * メイン画面のデフォルトサンプルカルテ（無駄な全角スペースや空行を排除した標準形）
 */
export const DEFAULT_SAMPLE_CHART_TEXT = `【主訴】労作時の息切れ、胸部圧迫感
【現病歴】3日前より階段昇降時に胸部圧迫感と動悸を自覚。安静にて数分で軽快するも、今朝より階段1階分で症状出現。
【既往歴】高血圧、脂質異常症（10年前より加療中）
【内服薬】アムロジピン 5mg 1T 1x 朝食後、アトルバスタチン 10mg 1T 1x 夕食後
【身体所見】血圧 142/86 mmHg, 脈拍 82回/分・整, SpO2 98% (room)
心音: 整・心雑音なし。呼吸音: 清・ラ音聴取せず。下腿浮腫(-)
【アセスメント】労作性狭心症の疑い（安定狭心症・冠動脈疾患疑い）
【プラン (P)】1. 12誘導心電図、心エコー、トロポニン・BNP迅速検査
2. 硝酸薬（ニトロペン舌下錠 0.3mg）頓用処方と安静時発作の指導
3. 循環器専門医への同日対診・冠動脈CT適応検討`;

/**
 * 電子カルテやOCRから抽出した文章の無駄なスペース・空白行・制御文字を削除して整形する
 */
export function cleanExtractedMedicalText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText
    // 1. プリンタ制御文字（フォームフィード \f, 垂直タブ \v, NULL, ESCシーケンス等）の除去と改行コード統一
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 2. ページ区切り線やプリンタヘッダ装飾（-----, ===== 等が5文字以上続く行）の整理
    .replace(/^[=\-_ー━─]{5,}\s*$/gm, '');

  // 3. 行単位のクリーンアップ
  const cleanedLines: string[] = [];
  const rawLines = text.split('\n');

  for (let line of rawLines) {
    // 行頭・行末の全角/半角スペース・タブを完全除去
    line = line.replace(/^[ 　\t]+|[ 　\t]+$/g, '');
    if (!line) continue;

    // 【主訴】　　　労作時 ➔ 【主訴】労作時 のように見出し括弧直後の無駄なスペースを除去
    line = line.replace(/(【[^】]+】)[ 　\t]+/g, '$1');

    // 日本語文字（ひらがな・カタカナ・漢字・全角記号）同士の間に挟まった不自然な空白を除去（2回適用で連続単文字空白も解消）
    const jpChar = '[ぁ-んァ-ヶー一-龠々、。，．・「」『』（）【】［］：；！？]';
    const jpSpaceRegex = new RegExp(`(${jpChar})[ 　\\t]+(${jpChar})`, 'g');
    line = line.replace(jpSpaceRegex, '$1$2');
    line = line.replace(jpSpaceRegex, '$1$2');

    // コロン（: / ：）前後の不自然な全角スペース・複数スペースを整理
    line = line.replace(/[ 　\t]*：[ 　\t]*/g, ': ');
    line = line.replace(/[ 　\t]*:[ 　\t]+/g, ': ');

    // 残った全角スペースを半角スペース1個に正規化し、連続する半角スペース・タブを1個に圧縮
    line = line.replace(/　+/g, ' ').replace(/[ \t]{2,}/g, ' ');

    cleanedLines.push(line);
  }

  // 4. 重複フレーズ・吃音反復の除去
  const joinedText = cleanedLines.join('\n').trim();
  return removeSpeechDuplications(joinedText);
}

/**
 * 2つの音声認識テキストチャンクのオーバーラップ部分（重複部分）を検出して重複なしで安全に結合する
 */
export function mergeSpeechTranscripts(existingText: string, newChunk: string): string {
  if (!existingText) return newChunk;
  if (!newChunk) return existingText;

  const trimmedExisting = existingText.trim();
  const trimmedNew = newChunk.trim();

  // 完全一致、または新チャンクが既存の末尾に含まれている場合
  if (trimmedExisting.endsWith(trimmedNew)) {
    return trimmedExisting;
  }
  if (trimmedNew.startsWith(trimmedExisting)) {
    return trimmedNew;
  }

  // 末尾と先頭のオーバーラップ（最長一致）を検索
  const maxOverlap = Math.min(trimmedExisting.length, trimmedNew.length);
  for (let k = maxOverlap; k >= 2; k--) {
    const endSub = trimmedExisting.slice(-k);
    const startSub = trimmedNew.slice(0, k);
    if (endSub === startSub) {
      return trimmedExisting + trimmedNew.slice(k);
    }
  }

  // 重複がない場合はスペースで自然に結合
  return `${trimmedExisting} ${trimmedNew}`.trim();
}

/**
 * 音声認識の吃音・反復認識・再送ループによって発生する同一単語・フレーズの連続重複を除去する
 */
export function removeSpeechDuplications(text: string): string {
  if (!text) return '';
  let result = text;

  // 1. 長いフレーズ（30文字〜2文字）の連続重複を外側から縮約
  // 例: 「サチュレーションは 97%サチュレーションは 97%」➔「サチュレーションは 97%」
  // 例: 「サチュレーションはサチュレーションはサチュレーションは」➔「サチュレーションは」
  // 例: 「UA 9点UA 9点UA 9点」➔「UA 9点」
  // 例: 「UAUA」➔「UA」
  for (let len = 30; len >= 2; len--) {
    let changed = true;
    let loopCount = 0;
    while (changed && loopCount < 8) {
      loopCount++;
      changed = false;
      const regex = new RegExp(`([\\s\\S]{${len}}?)(?:\\s*\\1)+`, 'g');
      const replaced = result.replace(regex, '$1');
      if (replaced !== result) {
        result = replaced;
        changed = true;
      }
    }
  }

  // 2. 「UA 9点 0」や「9点0」等の発音揺れ（「点ゼロ」➔「.0」）を正規化
  result = result.replace(/(\d+)\s*点\s*(\d+)/g, '$1.$2');

  return result;
}

import { decodeMedicalSpeech } from '../services/medicalSpeechDecoder';

/**
 * 音声認識特有の医学的同音異義語・誤変換・略語・医薬品・バイタルを事前補正・高精度解読する
 */
export function normalizeMedicalSpeechTerms(text: string): string {
  if (!text) return '';
  const deduplicated = removeSpeechDuplications(text);
  const decoded = decodeMedicalSpeech(deduplicated);
  return removeSpeechDuplications(decoded.decodedText);
}

export interface ExtractedChartContext {
  rawChartText: string;
  allKeywords: string[];         // カルテ全体から抽出・推論された全キーワード
  directKeywords: string[];      // カルテ本文に直接出現したキーワード
  inferredKeywords: string[];    // 病態・主訴・処方から臨床推論された関連キーワード
  drugKeywords: string[];        // 医薬品添付文書＆錠剤識別用キーワード
  atlasEcgKeywords: string[];    // 12誘導心電図＆臨床波形解析用キーワード
  mindsEmerKeywords: string[];   // Mindsガイドライン＆救急プロトコル用キーワード
  summaryLabel: string;          // UI表示用サマリー
}

/**
 * 臨床症候・病態・薬剤の連想マッピング（カルテ記載内容から関連する検査・薬剤・ガイドライン・心電図を100%リンク）
 */
interface ClinicalAssociationRule {
  triggers: string[];
  drugs: string[];
  atlasEcg: string[];
  mindsEmer: string[];
  general: string[];
}

const CLINICAL_ASSOCIATION_RULES: ClinicalAssociationRule[] = [
  {
    // 虚血性心疾患・狭心症・胸痛・胸部圧迫感
    triggers: ['狭心症', '労作性狭心症', '胸部圧迫感', '胸痛', '前胸部痛', '冠動脈', '心筋虚血', '心筋梗塞', 'STEMI', 'ACS', 'ニトロペン', '硝酸薬', 'トロポニン'],
    drugs: ['アムロジピン', 'アトルバスタチン', 'ニトロペン', 'ニトログリセリン', 'バイアスピリン', 'アスピリン', 'ビソプロロール', 'クロピドグレル'],
    atlasEcg: ['労作性狭心症', '心筋虚血', 'ST低下', '急性前壁中隔心筋梗塞', 'STEMI', 'ST上昇', '心電図', '12誘導心電図'],
    mindsEmer: ['狭心症', '心筋梗塞', '冠動脈', '高血圧', '脂質異常症', '抗血小板', '胸痛'],
    general: ['トロポニン', 'BNP', '心電図', '心エコー', '冠動脈CT', '生活習慣病'],
  },
  {
    // 高血圧・脂質異常症・生活習慣病
    triggers: ['高血圧', '血圧', '降圧', '脂質異常症', '高コレステロール', 'LDL', 'アムロジピン', 'アトルバスタチン', 'スタチン', 'オルメテック', 'アジルバ', 'テルミサルタン', 'カンデサルタン'],
    drugs: ['アムロジピン', 'アトルバスタチン', 'ビソプロロール', 'オルメテック', 'テルミサルタン', 'ロスバスタチン'],
    atlasEcg: ['高血圧', '左室肥大', 'LVH', '労作性狭心症', '心不全', '心電図'],
    mindsEmer: ['高血圧', '脂質異常症', '動脈硬化', '生活習慣病', 'CKD'],
    general: ['生活習慣病管理料', '特定疾患療養管理料', 'LDL', 'HbA1c', 'eGFR'],
  },
  {
    // 不整脈・動悸・心房細動
    triggers: ['心房細動', '動悸', '不整脈', '絶対的不整', 'Af', 'AF', '頻脈', 'エリキュース', 'アピキサバン', 'リクシアナ', 'イグザレルト', 'プラザキサ', 'ワルファリン', 'DOAC', 'CHADS2'],
    drugs: ['エリキュース', 'アピキサバン', 'ビソプロロール', 'リクシアナ', 'イグザレルト', 'ワルファリン', 'ベラパミル'],
    atlasEcg: ['心房細動', 'Af', '細動波', '絶対的不整', '頻拍', '心電図'],
    mindsEmer: ['心房細動', '抗凝固', '脳梗塞', '心不全', '不整脈'],
    general: ['CHADS2', 'HAS-BLED', 'PT-INR', 'BNP', 'eGFR'],
  },
  {
    // 心不全・息切れ・呼吸困難・浮腫
    triggers: ['心不全', '労作時の息切れ', '息切れ', '呼吸困難', '起坐呼吸', '下腿浮腫', '浮腫', 'BNP', 'NT-proBNP', '心拡大', 'フォシーガ', 'エンレスト'],
    drugs: ['フォシーガ', 'ダパグリフロジン', 'ビソプロロール', 'アムロジピン', 'フロセミド', 'ラシックス', 'スピロノラクトン'],
    atlasEcg: ['心不全', '左室肥大', '心房細動', '労作性狭心症', '心電図'],
    mindsEmer: ['心不全', '高血圧', '心房細動', 'CKD', 'SGLT2'],
    general: ['BNP', 'eGFR', '心エコー', 'SpO2', 'クレアチニン'],
  },
  {
    // 糖尿病・高血糖・CKD・腎機能
    triggers: ['糖尿病', 'HbA1c', '高血糖', '血糖', 'インスリン', 'メトホルミン', 'メトグルコ', 'フォシーガ', 'ジャディアンス', 'SGLT2', 'シタグリプチン', 'ジャヌビア', 'トラゼンタ', 'eGFR', '慢性腎臓病', 'CKD', '蛋白尿'],
    drugs: ['フォシーガ', 'メトグルコ', 'メトホルミン', 'ジャディアンス', 'ジャヌビア', 'トラゼンタ', 'グリimeピリド'],
    atlasEcg: ['高カリウム血症', '心筋虚血', '労作性狭心症'],
    mindsEmer: ['糖尿病', '慢性腎臓病', 'CKD', '高血圧', 'シックデイ'],
    general: ['HbA1c', 'eGFR', 'クレアチニン', '生活習慣病管理料', '尿蛋白'],
  },
  {
    // 消化器・胃痛・胸焼け・逆流性食道炎・胃潰瘍・胃癌・内視鏡
    triggers: ['逆流性食道炎', 'GERD', '胸焼け', '呑酸', '心窩部痛', '胃痛', '腹痛', '胃潰瘍', '十二指腸潰瘍', '消化性潰瘍', '早期胃癌', '胃癌', '内視鏡', '陥凹', 'びらん', 'タケキャブ', 'ボノプラザン', 'ネキシウム', 'オメプラゾール', 'ピロリ'],
    drugs: ['タケキャブ', 'ボノプラザン', 'ネキシウム', 'ファモチジン', 'レバミピド', 'ムコスタ', 'サワシリン', 'クラリス'],
    atlasEcg: ['早期胃癌', '0-IIc', '陥凹', '逆流性食道炎', 'ロサンゼルス分類', '内視鏡'],
    mindsEmer: ['逆流性食道炎', 'GERD', '消化性潰瘍', '胃潰瘍', '胃癌', 'ピロリ', '急性胃腸炎'],
    general: ['内視鏡', 'ESD', 'Hb', '貧血', 'CRP'],
  },
  {
    // 呼吸器・感染症・発熱・感冒・咽頭痛・咳・肺炎・喘息
    triggers: ['発熱', '感冒', '急性上気道炎', '上気道炎', '咽頭痛', '咽頭発赤', '咽頭炎', '扁桃炎', '扁桃腫大', '溶連菌', '咳嗽', '乾性咳嗽', '湿性咳嗽', '咳', '喀痰', '気管支炎', '肺炎', '喘息', '呼吸音', 'カロナール', 'アセトアミノフェン', 'サワシリン', 'アモキシシリン', 'クラリス', 'レボフロキサシン', 'ロキソニン'],
    drugs: ['カロナール', 'アセトアミノフェン', 'ロキソニン', 'サワシリン', 'アモキシシリン', 'クラリス', 'レボフロキサシン', 'デキストロメトルファン', 'メジコン', 'カルボシステイン', 'ムコダイン'],
    atlasEcg: ['肺炎', '気管支炎', '喘息', '呼吸器'],
    mindsEmer: ['急性上気道炎', '感冒', '急性咽頭炎', '扁桃炎', '急性気管支炎', '肺炎', '気管支喘息', 'インフルエンザ', 'COVID-19', '発熱'],
    general: ['Centor', 'A-DROP', 'CRP', 'WBC', '外来感染対策向上加算', 'SpO2'],
  },
  {
    // 皮膚科・帯状疱疹・水疱・薬疹・アレルギー・アナフィラキシー
    triggers: ['帯状疱疹', '水疱', '紅斑', '皮疹', '神経痛', 'デルマトーム', '薬疹', 'SJS', 'TEN', '粘膜疹', 'バルトレックス', 'バラシクロビル', 'アメナリーフ', 'アシクロビル', '蕁麻疹', 'アナフィラキシー'],
    drugs: ['バルトレックス', 'バラシクロビル', 'カロナール', 'ロキソニン', 'プレドニゾロン', 'フェキソフェナジン', 'アレグラ', 'アドレナリン'],
    atlasEcg: ['帯状疱疹', '水疱', 'デルマトーム', 'スティーブンス・ジョンソン', 'SJS', 'TEN', '薬疹', '皮膚科'],
    mindsEmer: ['帯状疱疹', 'アナフィラキシー', '蕁麻疹', 'アトピー性皮膚炎', '薬疹'],
    general: ['eGFR', 'クレアチニン', '腎機能別減量'],
  },
  {
    // 救急・中毒・高カリウム・心停止・外傷・背部痛・肝障害
    triggers: ['農薬', '有機リン', '中毒', '過量服用', 'OD', '心停止', 'CPA', 'トリアージ', '高カリウム', '高K', 'テント状T波', '痛風', '高尿酸血症', '尿酸', 'フェブリク', 'アロプリノール', '肝機能障害', 'γ-GTP', 'AST', 'ALT', '背部痛', '腰痛', '頭痛', '片頭痛', '脳梗塞', 'めまい', '不眠症'],
    drugs: ['フェブリク', 'フェブキソスタット', 'ロキソニン', 'カロナール', 'バイアスピリン', 'デエビゴ', 'ゾルピデム'],
    atlasEcg: ['高カリウム血症', 'テント状T波', '急性前壁中隔心筋梗塞', '心房細動'],
    mindsEmer: ['有機リン', 'アセトアミノフェン', 'トリアージ', 'アナフィラキシー', '心停止', '高尿酸血症', '痛風', '腰痛', '片頭痛', '脳梗塞', '不眠症', '肝機能障害', 'NAFLD'],
    general: ['AST', 'ALT', 'γ-GTP', 'K', 'カリウム', '尿酸', 'CRP'],
  },
];

/**
 * カルテ全体のテキストから臨床キーワードを網羅的に抽出し、各専門タブ用のクエリ群を生成する
 */
export function extractChartClinicalKeywords(chartText: string): ExtractedChartContext {
  const effectiveText = cleanExtractedMedicalText(chartText || DEFAULT_SAMPLE_CHART_TEXT);
  const normalizedText = normalizeMedicalSpeechTerms(effectiveText);
  const lowerText = normalizedText.toLowerCase();

  const directSet = new Set<string>();
  const inferredSet = new Set<string>();
  const drugSet = new Set<string>();
  const atlasEcgSet = new Set<string>();
  const mindsEmerSet = new Set<string>();

  // 1. 医薬品マスター & 錠剤識別マスターからの直接検出
  for (const d of DRUG_IDENTIFICATION_CATALOG) {
    const baseBrand = d.brandName.replace(/(?:錠|カプセル|舌下錠|OD錠|内用液|散|顆粒|[\d.]+mg|[\d.]+μg).*$/g, '').trim();
    const baseGeneric = d.genericName.replace(/(?:フマル酸塩|ベシル酸塩|プロピレングリコール水和物|カルシウム水和物|ナトリウム水和物|塩酸塩|水和物).*$/g, '').trim();
    if (baseBrand.length >= 2 && normalizedText.includes(baseBrand)) {
      directSet.add(baseBrand);
      drugSet.add(baseBrand);
    }
    if (baseGeneric.length >= 3 && normalizedText.includes(baseGeneric)) {
      directSet.add(baseGeneric);
      drugSet.add(baseGeneric);
    }
  }

  for (const d of DRUGS_CATALOG) {
    const baseName = d.name.replace(/(?:錠|カプセル|舌下錠|OD錠|[\d.]+mg).*$/g, '').trim();
    const baseGen = d.genericName.replace(/(?:塩酸塩|水和物|ナトリウム|カリウム|カルシウム).*$/g, '').trim();
    if (baseName.length >= 2 && normalizedText.includes(baseName)) {
      directSet.add(baseName);
      drugSet.add(baseName);
    }
    if (baseGen.length >= 3 && normalizedText.includes(baseGen)) {
      directSet.add(baseGen);
      drugSet.add(baseGen);
    }
  }

  for (const r of RENAL_DOSE_CATALOG) {
    const names = r.drugName.split(/[()（）\s/]+/).filter((s) => s.length >= 3);
    for (const n of names) {
      if (normalizedText.includes(n)) {
        directSet.add(n);
        drugSet.add(n);
      }
    }
  }

  // 2. 傷病名 & Mindsガイドライン疾患名からの直接検出
  for (const dis of DISEASES_CATALOG) {
    if (dis.name.length >= 2 && normalizedText.includes(dis.name)) {
      directSet.add(dis.name);
      mindsEmerSet.add(dis.name);
    }
  }

  for (const m of MINDS_KNOWLEDGE_CATALOG) {
    const cleanDis = m.diseaseName.replace(/[（()）].*?[）)]/g, '').trim();
    const subNames = m.diseaseName.split(/[・/（()）\s]+/).filter((s) => s.length >= 2);
    if (cleanDis.length >= 2 && normalizedText.includes(cleanDis)) {
      directSet.add(cleanDis);
      mindsEmerSet.add(cleanDis);
    }
    for (const sn of subNames) {
      if (sn.length >= 2 && normalizedText.includes(sn)) {
        directSet.add(sn);
        mindsEmerSet.add(sn);
      }
    }
  }

  // 3. 臨床アトラス & 救急プロトコル & 検査値 & 診療行為 & スコアからの直接検出
  for (const a of CLINICAL_ATLAS_CATALOG) {
    const parts = a.title.split(/[\s:：()（）・/]+/).filter((s) => s.length >= 2);
    for (const p of parts) {
      if (lowerText.includes(p.toLowerCase())) {
        directSet.add(p);
        atlasEcgSet.add(p);
      }
    }
  }

  for (const e of EMERGENCY_PROTOCOLS_CATALOG) {
    const parts = e.title.split(/[\s:：()（）・/]+/).filter((s) => s.length >= 2);
    for (const p of parts) {
      if (lowerText.includes(p.toLowerCase())) {
        directSet.add(p);
        mindsEmerSet.add(p);
      }
    }
  }

  for (const lab of LAB_TESTS_CATALOG) {
    const parts = lab.name.split(/[\s()（）/・]+/).filter((s) => s.length >= 2);
    for (const p of parts) {
      if (lowerText.includes(p.toLowerCase())) {
        directSet.add(p);
      }
    }
  }

  for (const proc of PROCEDURES_CATALOG) {
    if (normalizedText.includes(proc.name)) {
      directSet.add(proc.name);
    }
  }

  for (const sc of CLINICAL_SCORES_CATALOG) {
    const parts = sc.scoreName.split(/[\s()（）]+/).filter((s) => s.length >= 3);
    for (const p of parts) {
      if (lowerText.includes(p.toLowerCase())) {
        directSet.add(p);
      }
    }
  }

  // 4. 臨床連想ルール（主訴・症状・所見から関連する薬・心電図・ガイドラインを推論展開）
  for (const rule of CLINICAL_ASSOCIATION_RULES) {
    const matchedTriggers = rule.triggers.filter((t) => lowerText.includes(t.toLowerCase()));
    if (matchedTriggers.length > 0) {
      for (const mt of matchedTriggers) {
        directSet.add(mt);
      }
      for (const d of rule.drugs) {
        drugSet.add(d);
        if (!directSet.has(d)) inferredSet.add(d);
      }
      for (const a of rule.atlasEcg) {
        atlasEcgSet.add(a);
        if (!directSet.has(a)) inferredSet.add(a);
      }
      for (const m of rule.mindsEmer) {
        mindsEmerSet.add(m);
        if (!directSet.has(m)) inferredSet.add(m);
      }
      for (const g of rule.general) {
        if (!directSet.has(g)) inferredSet.add(g);
      }
    }
  }

  // 5. カルテ内の重要医学トークンの正規表現フォールバック抽出（上記にない未知語対応）
  const extraMatches =
    normalizedText.match(
      /(?:[一-龠々]{2,8}(?:症|炎|病|痛|感|癌|潰瘍|不全|障害|梗塞|出血|発作|喘息|血圧|検査|心電図|エコー|内視鏡)|[ァ-ヶー]{3,12}|(?:HbA1c|eGFR|SpO2|BNP|NT-proBNP|CRP|AST|ALT|γ-GTP|LDL|HDL|PT-INR|CHADS2|STEMI|DOAC|NSAIDs))/g
    ) || [];

  const stopWords = new Set([
    '現病歴', '既往歴', '内服薬', '身体所見', '検査所見', 'アセスメント', '治療方針',
    '朝食後', '昼食後', '夕食後', '毎食後', '就寝前', '頓用処方', '加療中', '症状出現',
    '迅速検査', '同日対診', '適応検討', '特記所見', '経過観察',
  ]);

  for (const m of extraMatches) {
    if (!stopWords.has(m) && m.length >= 2) {
      directSet.add(m);
      mindsEmerSet.add(m);
      atlasEcgSet.add(m);
    }
  }

  // 直接抽出されたキーワードも各カテゴリに反映
  for (const kw of directSet) {
    drugSet.add(kw);
    atlasEcgSet.add(kw);
    mindsEmerSet.add(kw);
  }

  const directKeywords = Array.from(directSet);
  const inferredKeywords = Array.from(inferredSet);
  const allKeywords = Array.from(new Set([...directKeywords, ...inferredKeywords]));
  const drugKeywords = Array.from(drugSet);
  const atlasEcgKeywords = Array.from(atlasEcgSet);
  const mindsEmerKeywords = Array.from(mindsEmerSet);

  const summaryLabel =
    directKeywords.length > 0
      ? directKeywords.slice(0, 8).join('・')
      : allKeywords.slice(0, 6).join('・') || '総合臨床所見';

  return {
    rawChartText: normalizedText,
    allKeywords,
    directKeywords,
    inferredKeywords,
    drugKeywords,
    atlasEcgKeywords,
    mindsEmerKeywords,
    summaryLabel,
  };
}
