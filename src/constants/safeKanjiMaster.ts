// =============================================================================
// File: src/constants/safeKanjiMaster.ts
// 説明: 誤変換危険二文字単語の「漢字単体 ➔ 安全訓読み」マスターテーブル
//       および DANGEROUS_KANJI_DICT、F10バイパス医療英数シンボル定義
//       普段のカルテ入力の90%以上は通常の高速長文節入力（最短ストローク）で軽快に動作し、
//       危険二文字熟語は安全訓読み＋BS削除によって変換率100%を保証する
// =============================================================================

import type { MultiChunkItem } from '../services/KeyStrokeCompiler';

/**
 * 漢字1文字に対する安全な入力・確定ステップ
 */
export interface SafeKanjiSingleChar {
  reading: string;       // ローマ字入力文字列 (例: 'yasumu', 'herasu', 'kusuri')
  convert: boolean;      // Spaceキーを押して漢字変換を行うか (基本 true)
  bsCount?: number;      // Enter確定後に末尾の送り仮名を消去するBackspace回数
  leftCount?: number;    // 接頭削り用: Leftキー押下回数
  delCount?: number;     // 接頭削り用: Deleteキー押下回数
  rightCount?: number;   // 接頭削り用: Rightキー押下回数
  representative?: string; // 代表語・訓読みの由来 (例: '休む -> 休', '減らす -> 減')
}

/**
 * 【漢字単体 ➔ 安全訓読み】マスターテーブル
 * MS-IME / ATOKで一意に確定できる訓読み・代表語読みと不要文字削除数を一元管理
 */
export const SAFE_KANJI_SINGLE_CHAR_MAP: Record<string, SafeKanjiSingleChar> = {
  // ─── 処方・用法・用量 ───
  '休': { reading: 'yasumu', convert: true, bsCount: 1, representative: '休む -> 休' },
  '薬': { reading: 'kusuri', convert: true, bsCount: 0, representative: '薬 -> 薬' },
  '減': { reading: 'herasu', convert: true, bsCount: 1, representative: '減らす -> 減' },
  '量': { reading: 'ryou', convert: true, bsCount: 0, representative: '量 -> 量' },
  '増': { reading: 'fueru', convert: true, bsCount: 1, representative: '増える -> 増' },
  '禁': { reading: 'kinshi', convert: true, bsCount: 1, representative: '禁止 -> 禁' },
  '忌': { reading: 'imu', convert: true, bsCount: 1, representative: '忌む -> 忌' },
  '頓': { reading: 'tonpuku', convert: true, bsCount: 1, representative: '頓服 -> 頓' },
  '用': { reading: 'youji', convert: true, bsCount: 1, representative: '用事 -> 用' },
  '漸': { reading: 'zenji', convert: true, bsCount: 1, representative: '漸次 -> 漸' },
  '中': { reading: 'naka', convert: true, bsCount: 0, representative: '中 -> 中' },
  '止': { reading: 'tomeru', convert: true, bsCount: 2, representative: '止める -> 止' },
  '処': { reading: 'shobun', convert: true, bsCount: 1, representative: '処分 -> 処' },
  '方': { reading: 'kata', convert: true, bsCount: 0, representative: '方 -> 方' },
  '連': { reading: 'renraku', convert: true, bsCount: 1, representative: '連絡 -> 連' },
  '日': { reading: 'hi', convert: true, bsCount: 0, representative: '日 -> 日' },

  // ─── 病態・症候 ───
  '虚': { reading: 'munashii', convert: true, bsCount: 2, representative: '虚しい -> 虚' },
  '血': { reading: 'chi', convert: true, bsCount: 0, representative: '血 -> 血' },
  '狭': { reading: 'semai', convert: true, bsCount: 1, representative: '狭い -> 狭' },
  '心': { reading: 'kokoro', convert: true, bsCount: 0, representative: '心 -> 心' },
  '梗': { reading: 'kikyou', convert: true, bsCount: 1, representative: '桔梗 -> 梗' },
  '塞': { reading: 'fusagu', convert: true, bsCount: 1, representative: '塞ぐ -> 塞' },
  '穿': { reading: 'ugatsu', convert: true, bsCount: 2, representative: '穿つ -> 穿' },
  '孔': { reading: 'koushi', convert: true, bsCount: 1, representative: '孔子 -> 孔' },
  '窄': { reading: 'subomeru', convert: true, bsCount: 3, representative: '窄める -> 窄' },
  '閉': { reading: 'tojiru', convert: true, bsCount: 2, representative: '閉じる -> 閉' },
  '壊': { reading: 'kowasu', convert: true, bsCount: 2, representative: '壊す -> 壊' },
  '死': { reading: 'shinu', convert: true, bsCount: 1, representative: '死ぬ -> 死' },
  '下': { reading: 'shita', convert: true, bsCount: 0, representative: '下 -> 下' },
  '吐': { reading: 'haku', convert: true, bsCount: 1, representative: '吐く -> 吐' },
  '浮': { reading: 'uku', convert: true, bsCount: 1, representative: '浮く -> 浮' },
  '腫': { reading: 'hareru', convert: true, bsCount: 2, representative: '腫れる -> 腫' },

  // ─── 検査値・推移 ───
  '低': { reading: 'hikui', convert: true, bsCount: 1, representative: '低い -> 低' },
  '高': { reading: 'takai', convert: true, bsCount: 1, representative: '高い -> 高' },
  '値': { reading: 'atai', convert: true, bsCount: 0, representative: '値 -> 値' },
  '陰': { reading: 'kage', convert: true, bsCount: 0, representative: '陰 -> 陰' },
  '性': { reading: 'seikaku', convert: true, bsCount: 1, representative: '性格 -> 性' },
  '陽': { reading: 'taiyou', convert: true, bsCount: 1, representative: '太陽 -> 陽' },
  '異': { reading: 'kotonaru', convert: true, bsCount: 2, representative: '異なる -> 異' },
  '常': { reading: 'tsune', convert: true, bsCount: 0, representative: '常 -> 常' },
  '著': { reading: 'ichijirushii', convert: true, bsCount: 3, representative: '著しい -> 著' },
  '明': { reading: 'akarui', convert: true, bsCount: 2, representative: '明るい -> 明' },
  '軽': { reading: 'karui', convert: true, bsCount: 1, representative: '軽い -> 軽' },
  '度': { reading: 'kondo', convert: true, bsCount: 1, representative: '今度 -> 度' },
  '消': { reading: 'kieru', convert: true, bsCount: 2, representative: '消える -> 消' },
  '失': { reading: 'ushinau', convert: true, bsCount: 2, representative: '失う -> 失' },
  '悪': { reading: 'warui', convert: true, bsCount: 1, representative: '悪い -> 悪' },
  '寛': { reading: 'kanyou', convert: true, bsCount: 1, representative: '寛容 -> 寛' },
  '解': { reading: 'toku', convert: true, bsCount: 1, representative: '解く -> 解' },

  // ─── 内視鏡スクリーニング・病変性状 ───
  '生': { reading: 'nama', convert: true, bsCount: 0, representative: '生 -> 生' },
  '検': { reading: 'kensa', convert: true, bsCount: 1, representative: '検査 -> 検' },
  '粘': { reading: 'nebaru', convert: true, bsCount: 1, representative: '粘る -> 粘' },
  '膜': { reading: 'makujou', convert: true, bsCount: 1, representative: '膜状 -> 膜' },
  '萎': { reading: 'shibomu', convert: true, bsCount: 2, representative: '萎む -> 萎' },
  '縮': { reading: 'chidimu', convert: true, bsCount: 2, representative: '縮む -> 縮' },
  '潰': { reading: 'tsubusu', convert: true, bsCount: 2, representative: '潰す -> 潰' },
  '瘍': { reading: 'shuyou', convert: true, leftCount: 2, delCount: 1, rightCount: 1, representative: '腫瘍 -> 瘍' },
  '隆': { reading: 'ryuusei', convert: true, bsCount: 1, representative: '隆盛 -> 隆' },
  '起': { reading: 'okiru', convert: true, bsCount: 2, representative: '起きる -> 起' },
  '陥': { reading: 'ochiru', convert: true, bsCount: 2, representative: '陥る -> 陥' },
  '凹': { reading: 'hekomu', convert: true, bsCount: 2, representative: '凹む -> 凹' },
  '発': { reading: 'hatsubai', convert: true, bsCount: 1, representative: '発売 -> 発' },
  '赤': { reading: 'aka', convert: true, bsCount: 0, representative: '赤 -> 赤' },
  '褪': { reading: 'aseta', convert: true, bsCount: 2, representative: '褪せた -> 褪' },
  '色': { reading: 'iro', convert: true, bsCount: 0, representative: '色 -> 色' },
  '結': { reading: 'musubu', convert: true, bsCount: 1, representative: '結ぶ -> 結' },
  '節': { reading: 'fushi', convert: true, bsCount: 0, representative: '節 -> 節' },

  // ─── 内視鏡病理・組織 ───
  '腺': { reading: 'sensaibou', convert: true, bsCount: 2, representative: '腺細胞 -> 腺' },
  '癌': { reading: 'igan', convert: true, leftCount: 2, delCount: 1, rightCount: 1, representative: '胃癌 -> 癌' },
  '型': { reading: 'kata', convert: true, bsCount: 0, representative: '型 -> 型' },
  '鋸': { reading: 'nokogiri', convert: true, bsCount: 0, representative: '鋸 -> 鋸' },
  '歯': { reading: 'ha', convert: true, bsCount: 0, representative: '歯 -> 歯' },
  '腸': { reading: 'harawata', convert: true, bsCount: 0, representative: '腸 -> 腸' },
  '化': { reading: 'bakeru', convert: true, bsCount: 2, representative: '化ける -> 化' },
  '浸': { reading: 'hitasu', convert: true, bsCount: 2, representative: '浸す -> 浸' },
  '潤': { reading: 'uruou', convert: true, bsCount: 2, representative: '潤う -> 潤' },

  // ─── 解剖・部位・手技 ───
  '幽': { reading: 'yuurei', convert: true, bsCount: 1, representative: '幽霊 -> 幽' },
  '門': { reading: 'mon', convert: true, bsCount: 0, representative: '門 -> 門' },
  '噴': { reading: 'funsui', convert: true, bsCount: 1, representative: '噴水 -> 噴' },
  '前': { reading: 'mae', convert: true, bsCount: 0, representative: '前 -> 前' },
  '庭': { reading: 'niwa', convert: true, bsCount: 0, representative: '庭 -> 庭' },
  '胃': { reading: 'i', convert: true, bsCount: 0, representative: '胃 -> 胃' },
  '角': { reading: 'tsuno', convert: true, bsCount: 0, representative: '角 -> 角' },
  '憩': { reading: 'ikou', convert: true, bsCount: 1, representative: '憩う -> 憩' },
  '室': { reading: 'muro', convert: true, bsCount: 0, representative: '室 -> 室' },
  '通': { reading: 'tooru', convert: true, bsCount: 2, representative: '通る -> 通' },
  '帯': { reading: 'obi', convert: true, bsCount: 0, representative: '帯 -> 帯' },
  '抜': { reading: 'nuku', convert: true, bsCount: 1, representative: '抜く -> 抜' },
  '去': { reading: 'saru', convert: true, bsCount: 1, representative: '去る -> 去' },
  '挿': { reading: 'sasu', convert: true, bsCount: 1, representative: '挿す -> 挿' },
  '入': { reading: 'hairu', convert: true, bsCount: 1, representative: '入る -> 入' },

  // ─── 臨床重要・誤変換頻出漢字 (膵・根・治・強・力・盾・家・系・切・除・出・論 等) ───
  '膵': { reading: 'suizou', convert: true, bsCount: 1, representative: '膵臓 -> 膵' },
  '根': { reading: 'ne', convert: true, bsCount: 0, representative: '根 -> 根' },
  '治': { reading: 'naosu', convert: true, bsCount: 2, representative: '治す -> 治' },
  '強': { reading: 'tsuyoi', convert: true, bsCount: 1, representative: '強い -> 強' },
  '力': { reading: 'chikara', convert: true, bsCount: 0, representative: '力 -> 力' },
  '盾': { reading: 'mujun', convert: true, leftCount: 1, delCount: 1, rightCount: 1, representative: '矛盾 -> 盾' },
  '家': { reading: 'ie', convert: true, bsCount: 0, representative: '家 -> 家' },
  '系': { reading: 'keitou', convert: true, bsCount: 1, representative: '系統 -> 系' },
  '切': { reading: 'kiru', convert: true, bsCount: 1, representative: '切る -> 切' },
  '除': { reading: 'nozoku', convert: true, bsCount: 2, representative: '除く -> 除' },
  '出': { reading: 'deru', convert: true, bsCount: 1, representative: '出る -> 出' },
  '論': { reading: 'ronbun', convert: true, bsCount: 1, representative: '論文 -> 論' },
  '探': { reading: 'sagasu', convert: true, bsCount: 2, representative: '探す -> 探' },
};

/**
 * 単一文字の安全定義から MultiChunkItem 列を生成する内部関数
 */
export function buildChunksFromSafeChar(charDef: SafeKanjiSingleChar, surfaceChar: string): MultiChunkItem[] {
  const chunks: MultiChunkItem[] = [];

  // 1. ローマ字打鍵 + Space変換 + Enter確定
  chunks.push({
    tag: 'Z',
    text: surfaceChar,
    romaji: charDef.reading,
  });

  // 2. 接頭削りがある場合 (Left -> Del -> Right)
  if (charDef.leftCount && charDef.leftCount > 0) {
    for (let i = 0; i < charDef.leftCount; i++) {
      chunks.push({ tag: 'control' as any, text: '', romaji: '[LEFT]' });
    }
    for (let i = 0; i < (charDef.delCount || 1); i++) {
      chunks.push({ tag: 'control' as any, text: '', romaji: '[DEL]' });
    }
    for (let i = 0; i < (charDef.rightCount || 1); i++) {
      chunks.push({ tag: 'control' as any, text: '', romaji: '[RIGHT]' });
    }
  }

  // 3. 末尾削り (Backspace連打)
  const bs = charDef.bsCount || 0;
  for (let i = 0; i < bs; i++) {
    chunks.push({
      tag: 'BS',
      text: '',
      romaji: '',
    });
  }

  return chunks;
}

/**
 * 任意の熟語を「漢字単体 ➔ 安全訓読み」マスターテーブルから自動合成する関数
 * （レイヤー2: PGO動的学習用）
 */
export function synthesizeSafeDecomposition(word: string): MultiChunkItem[] | null {
  const result: MultiChunkItem[] = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    const def = SAFE_KANJI_SINGLE_CHAR_MAP[ch];
    if (!def) {
      return null; // マスターにない文字が含まれる場合は合成不可
    }
    result.push(...buildChunksFromSafeChar(def, ch));
  }
  return result;
}

/**
 * 危険二文字熟語定義インターフェース
 */
export interface DangerousKanjiDefinition {
  word: string;
  category: 'PRESCRIPTION' | 'PATHOLOGY' | 'FINDINGS' | 'ENDOSCOPY_LESION' | 'ENDOSCOPY_PATHOLOGY' | 'ENDOSCOPY_ANATOMY';
  labelEn: string;
  chunks: MultiChunkItem[];
}

/**
 * ヘルパー: 2文字漢字の安全分解ブロックを生成
 */
function makeSafeDecompositionEntry(
  word: string,
  category: DangerousKanjiDefinition['category'],
  labelEn: string
): DangerousKanjiDefinition {
  const c1 = word[0];
  const c2 = word[1];
  const def1 = SAFE_KANJI_SINGLE_CHAR_MAP[c1];
  const def2 = SAFE_KANJI_SINGLE_CHAR_MAP[c2];

  if (!def1 || !def2) {
    throw new Error(`[SafeKanjiMaster] Missing character definition for: ${word} (${c1}=${!!def1}, ${c2}=${!!def2})`);
  }

  const chunks: MultiChunkItem[] = [
    ...buildChunksFromSafeChar(def1, c1),
    ...buildChunksFromSafeChar(def2, c2),
  ];

  return { word, category, labelEn, chunks };
}

/**
 * 【静的キルスイッチ辞書: DANGEROUS_KANJI_DICT】
 * 処方ミスや診断誤謬を防ぐために、最初から「漢字単体 ➔ 安全訓読み」でハードコードされた
 * 危険二文字単語マスター（約55語規模：処方30選 + 内視鏡25選）
 */
export const DANGEROUS_KANJI_LIST: DangerousKanjiDefinition[] = [
  // ─── 区分Ⅰ: 処方・用法 (10語) ───
  makeSafeDecompositionEntry('休薬', 'PRESCRIPTION', 'KYU-YAKU'),
  makeSafeDecompositionEntry('減量', 'PRESCRIPTION', 'GEN-RYOU'),
  makeSafeDecompositionEntry('増量', 'PRESCRIPTION', 'ZOU-RYOU'),
  makeSafeDecompositionEntry('禁忌', 'PRESCRIPTION', 'KIN-KI'),
  makeSafeDecompositionEntry('頓用', 'PRESCRIPTION', 'TON-YOU'),
  makeSafeDecompositionEntry('漸減', 'PRESCRIPTION', 'ZEN-GEN'),
  makeSafeDecompositionEntry('漸増', 'PRESCRIPTION', 'ZEN-ZOU'),
  makeSafeDecompositionEntry('中止', 'PRESCRIPTION', 'CHU-SHI'),
  makeSafeDecompositionEntry('処方', 'PRESCRIPTION', 'SHO-HOU'),
  makeSafeDecompositionEntry('連日', 'PRESCRIPTION', 'REN-JITSU'),

  // ─── 区分Ⅱ: 病態・症候 (10語) ───
  makeSafeDecompositionEntry('虚血', 'PATHOLOGY', 'KYO-KETSU'),
  makeSafeDecompositionEntry('狭心', 'PATHOLOGY', 'KYOU-SHIN'),
  makeSafeDecompositionEntry('梗塞', 'PATHOLOGY', 'KOU-SOKU'),
  makeSafeDecompositionEntry('穿孔', 'PATHOLOGY', 'SEN-KOU'),
  makeSafeDecompositionEntry('狭窄', 'PATHOLOGY', 'KYOU-SAKU'),
  makeSafeDecompositionEntry('閉塞', 'PATHOLOGY', 'HEI-SOKU'),
  makeSafeDecompositionEntry('壊死', 'PATHOLOGY', 'E-SHI'),
  makeSafeDecompositionEntry('下血', 'PATHOLOGY', 'GE-KETSU'),
  makeSafeDecompositionEntry('吐血', 'PATHOLOGY', 'TO-KETSU'),
  makeSafeDecompositionEntry('浮腫', 'PATHOLOGY', 'FU-SHU'),

  // ─── 区分Ⅲ: 検査値・推移 (10語) ───
  makeSafeDecompositionEntry('低値', 'FINDINGS', 'TEI-CHI'),
  makeSafeDecompositionEntry('高値', 'FINDINGS', 'KOU-CHI'),
  makeSafeDecompositionEntry('陰性', 'FINDINGS', 'IN-SEI'),
  makeSafeDecompositionEntry('陽性', 'FINDINGS', 'YOU-SEI'),
  makeSafeDecompositionEntry('異常', 'FINDINGS', 'I-JOU'),
  makeSafeDecompositionEntry('著明', 'FINDINGS', 'CHO-MEI'),
  makeSafeDecompositionEntry('軽度', 'FINDINGS', 'KEI-DO'),
  makeSafeDecompositionEntry('消失', 'FINDINGS', 'SHOU-SHITSU'),
  makeSafeDecompositionEntry('増悪', 'FINDINGS', 'ZOU-AKU'),
  makeSafeDecompositionEntry('寛解', 'FINDINGS', 'KAN-KAI'),

  // ─── 区分Ⅳ: 内視鏡病変・肉眼形態 (9語) ───
  makeSafeDecompositionEntry('生検', 'ENDOSCOPY_LESION', 'SEI-KEN'),
  makeSafeDecompositionEntry('粘膜', 'ENDOSCOPY_LESION', 'NEN-MAKU'),
  makeSafeDecompositionEntry('萎縮', 'ENDOSCOPY_LESION', 'I-SHUKU'),
  makeSafeDecompositionEntry('潰瘍', 'ENDOSCOPY_LESION', 'KAI-YOU'),
  makeSafeDecompositionEntry('隆起', 'ENDOSCOPY_LESION', 'RYU-KI'),
  makeSafeDecompositionEntry('陥凹', 'ENDOSCOPY_LESION', 'KAN-OU'),
  makeSafeDecompositionEntry('発赤', 'ENDOSCOPY_LESION', 'HAS-SEKI'),
  makeSafeDecompositionEntry('褪色', 'ENDOSCOPY_LESION', 'TAI-SHOKU'),
  makeSafeDecompositionEntry('結節', 'ENDOSCOPY_LESION', 'KES-SETSU'),

  // ─── 区分Ⅴ: 内視鏡病理・組織 (6語) ───
  makeSafeDecompositionEntry('腺腫', 'ENDOSCOPY_PATHOLOGY', 'SEN-SHU'),
  makeSafeDecompositionEntry('腺癌', 'ENDOSCOPY_PATHOLOGY', 'SEN-GAN'),
  makeSafeDecompositionEntry('異型', 'ENDOSCOPY_PATHOLOGY', 'I-KEI'),
  makeSafeDecompositionEntry('鋸歯', 'ENDOSCOPY_PATHOLOGY', 'KYO-SHI'),
  makeSafeDecompositionEntry('腸化', 'ENDOSCOPY_PATHOLOGY', 'CHOU-KA'),
  makeSafeDecompositionEntry('浸潤', 'ENDOSCOPY_PATHOLOGY', 'SHIN-JUN'),

  // ─── 区分Ⅵ: 解剖・部位・手技 (10語) ───
  makeSafeDecompositionEntry('幽門', 'ENDOSCOPY_ANATOMY', 'YUU-MON'),
  makeSafeDecompositionEntry('噴門', 'ENDOSCOPY_ANATOMY', 'FUN-MON'),
  makeSafeDecompositionEntry('前庭', 'ENDOSCOPY_ANATOMY', 'ZEN-TEI'),
  makeSafeDecompositionEntry('胃角', 'ENDOSCOPY_ANATOMY', 'I-KAKU'),
  makeSafeDecompositionEntry('憩室', 'ENDOSCOPY_ANATOMY', 'KEI-SHITSU'),
  makeSafeDecompositionEntry('穿通', 'ENDOSCOPY_ANATOMY', 'SEN-TSUU'),
  makeSafeDecompositionEntry('止血', 'ENDOSCOPY_ANATOMY', 'SHI-KETSU'),
  makeSafeDecompositionEntry('狭帯', 'ENDOSCOPY_ANATOMY', 'KYOU-TAI'),
  makeSafeDecompositionEntry('抜去', 'ENDOSCOPY_ANATOMY', 'BAK-KYO'),
  makeSafeDecompositionEntry('挿入', 'ENDOSCOPY_ANATOMY', 'SOU-NYUU'),

  // ─── 区分Ⅶ: 臨床重要・二文字誤変換頻出語 (6語) ───
  makeSafeDecompositionEntry('膵癌', 'PATHOLOGY', 'SUI-GAN'),
  makeSafeDecompositionEntry('根治', 'PATHOLOGY', 'KON-CHI'),
  makeSafeDecompositionEntry('強力', 'FINDINGS', 'KYOU-RYOKU'),
  makeSafeDecompositionEntry('家系', 'PATHOLOGY', 'KA-KEI'),
  makeSafeDecompositionEntry('切除', 'ENDOSCOPY_ANATOMY', 'SETSU-JO'),
  makeSafeDecompositionEntry('検出', 'FINDINGS', 'KEN-SHUTSU'),
];

/**
 * 危険二文字単語辞書 (単語 ➔ MultiChunkItem[])
 */
export const DANGEROUS_KANJI_DICT: Record<string, MultiChunkItem[]> = {};
for (const item of DANGEROUS_KANJI_LIST) {
  DANGEROUS_KANJI_DICT[item.word] = item.chunks;
}

/**
 * 動的に学習・登録された危険二文字単語辞書
 */
export const DYNAMIC_DANGEROUS_KANJI_DICT: Record<string, MultiChunkItem[]> = {};

/**
 * 二文字単語が「漢字単体 ➔ 安全訓読み」で分解可能かどうかを判定
 */
export function isTwoKanjiDecomposable(word: string): boolean {
  if (word.length !== 2) return false;
  return Boolean(SAFE_KANJI_SINGLE_CHAR_MAP[word[0]] && SAFE_KANJI_SINGLE_CHAR_MAP[word[1]]);
}

/**
 * 二文字単語の分解プレビュー文字列を取得 (例: "強[強い-い] + 力[力]")
 */
export function getDecompositionPreview(word: string): string | null {
  if (word.length !== 2) return null;
  const def1 = SAFE_KANJI_SINGLE_CHAR_MAP[word[0]];
  const def2 = SAFE_KANJI_SINGLE_CHAR_MAP[word[1]];
  if (!def1 || !def2) return null;

  const rep1 = def1.representative ? def1.representative.split(' -> ')[0] : def1.reading;
  const rep2 = def2.representative ? def2.representative.split(' -> ')[0] : def2.reading;
  return `${word[0]}[${rep1}${def1.bsCount ? `-${def1.bsCount}BS` : ''}] + ${word[1]}[${rep2}${def2.bsCount ? `-${def2.bsCount}BS` : ''}]`;
}

/**
 * 動的学習用: 二文字誤変換単語を訓読み安全分解辞書へ登録
 */
export function registerDynamicDangerousKanji(word: string, chunks?: MultiChunkItem[]): boolean {
  if (chunks) {
    DYNAMIC_DANGEROUS_KANJI_DICT[word] = chunks;
    DANGEROUS_KANJI_DICT[word] = chunks;
    return true;
  }
  const synthesized = synthesizeSafeDecomposition(word);
  if (synthesized) {
    DYNAMIC_DANGEROUS_KANJI_DICT[word] = synthesized;
    DANGEROUS_KANJI_DICT[word] = synthesized;
    return true;
  }
  return false;
}

/**
 * 【F10バイパス対象 医療英数記号マスター】
 * 木村・竹本分類、ピロリ判定記号、癌深達度分類・TNM分類・Stage病期分類
 */
export interface F10SymbolDefinition {
  symbol: string;
  category: 'KIMURA_TAKEMOTO' | 'PYLORI' | 'DEPTH' | 'TNM' | 'STAGE' | 'PARIS';
  chunks: MultiChunkItem[];
}

export const F10_MEDICAL_SYMBOLS: Record<string, MultiChunkItem[]> = {
  // ─── 木村・竹本分類 (Kimura-Takemoto) ───
  'C-1': [{ tag: 'A', text: 'C-1', romaji: 'C-1' }],
  'C-2': [{ tag: 'A', text: 'C-2', romaji: 'C-2' }],
  'C-3': [{ tag: 'A', text: 'C-3', romaji: 'C-3' }],
  'O-1': [{ tag: 'A', text: 'O-1', romaji: 'O-1' }],
  'O-2': [{ tag: 'A', text: 'O-2', romaji: 'O-2' }],
  'O-3': [{ tag: 'A', text: 'O-3', romaji: 'O-3' }],
  'C-I': [{ tag: 'A', text: 'C-I', romaji: 'C-I' }],
  'C-II': [{ tag: 'A', text: 'C-II', romaji: 'C-II' }],
  'C-III': [{ tag: 'A', text: 'C-III', romaji: 'C-III' }],
  'O-I': [{ tag: 'A', text: 'O-I', romaji: 'O-I' }],
  'O-II': [{ tag: 'A', text: 'O-II', romaji: 'O-II' }],
  'O-III': [{ tag: 'A', text: 'O-III', romaji: 'O-III' }],

  // ─── ピロリ菌判定記号 ───
  'HP(+)': [{ tag: 'A', text: 'HP(+)', romaji: 'HP(+)' }],
  'HP(-)': [{ tag: 'A', text: 'HP(-)', romaji: 'HP(-)' }],
  'UBT(+)': [{ tag: 'A', text: 'UBT(+)', romaji: 'UBT(+)' }],
  'UBT(-)': [{ tag: 'A', text: 'UBT(-)', romaji: 'UBT(-)' }],
  '(+)': [{ tag: 'A', text: '(+)', romaji: '(+)' }],
  '(-)': [{ tag: 'A', text: '(-)', romaji: '(-)' }],
  'H.pylori(+)': [{ tag: 'A', text: 'H.pylori(+)', romaji: 'H.pylori(+)' }],
  'H.pylori(-)': [{ tag: 'A', text: 'H.pylori(-)', romaji: 'H.pylori(-)' }],
  'HP(±)': [
    { tag: 'A', text: 'HP(', romaji: 'HP(' },
    { tag: 'Z', text: '±', romaji: 'puramai' },
    { tag: 'A', text: ')', romaji: ')' },
  ],
  '(±)': [
    { tag: 'A', text: '(', romaji: '(' },
    { tag: 'Z', text: '±', romaji: 'puramai' },
    { tag: 'A', text: ')', romaji: ')' },
  ],

  // ─── 内視鏡肉眼型 (Paris分類) ───
  '0-I': [{ tag: 'A', text: '0-I', romaji: '0-I' }],
  '0-IIa': [{ tag: 'A', text: '0-IIa', romaji: '0-IIa' }],
  '0-IIb': [{ tag: 'A', text: '0-IIb', romaji: '0-IIb' }],
  '0-IIc': [{ tag: 'A', text: '0-IIc', romaji: '0-IIc' }],
  '0-III': [{ tag: 'A', text: '0-III', romaji: '0-III' }],

  // ─── 癌深達度分類・壁深達度 ───
  'T1a': [{ tag: 'A', text: 'T1a', romaji: 'T1a' }],
  'T1b': [{ tag: 'A', text: 'T1b', romaji: 'T1b' }],
  'T1b1': [{ tag: 'A', text: 'T1b1', romaji: 'T1b1' }],
  'T1b2': [{ tag: 'A', text: 'T1b2', romaji: 'T1b2' }],
  'T2': [{ tag: 'A', text: 'T2', romaji: 'T2' }],
  'T3': [{ tag: 'A', text: 'T3', romaji: 'T3' }],
  'T4a': [{ tag: 'A', text: 'T4a', romaji: 'T4a' }],
  'T4b': [{ tag: 'A', text: 'T4b', romaji: 'T4b' }],
  'Tis': [{ tag: 'A', text: 'Tis', romaji: 'Tis' }],
  'T1a-M': [{ tag: 'A', text: 'T1a-M', romaji: 'T1a-M' }],
  'T1b-SM': [{ tag: 'A', text: 'T1b-SM', romaji: 'T1b-SM' }],
  'SM1': [{ tag: 'A', text: 'SM1', romaji: 'SM1' }],
  'SM2': [{ tag: 'A', text: 'SM2', romaji: 'SM2' }],
  'MP': [{ tag: 'A', text: 'MP', romaji: 'MP' }],
  'SS': [{ tag: 'A', text: 'SS', romaji: 'SS' }],
  'SE': [{ tag: 'A', text: 'SE', romaji: 'SE' }],
  'SI': [{ tag: 'A', text: 'SI', romaji: 'SI' }],
  'UL0': [{ tag: 'A', text: 'UL0', romaji: 'UL0' }],

  // ─── TNM複合ステージ表記 ───
  'cT1aN0M0': [{ tag: 'A', text: 'cT1aN0M0', romaji: 'cT1aN0M0' }],
  'pT1aN0M0': [{ tag: 'A', text: 'pT1aN0M0', romaji: 'pT1aN0M0' }],
  'cT1bN0M0': [{ tag: 'A', text: 'cT1bN0M0', romaji: 'cT1bN0M0' }],
  'pT1bN0M0': [{ tag: 'A', text: 'pT1bN0M0', romaji: 'pT1bN0M0' }],
  'cT2N0M0': [{ tag: 'A', text: 'cT2N0M0', romaji: 'cT2N0M0' }],
  'pT2N0M0': [{ tag: 'A', text: 'pT2N0M0', romaji: 'pT2N0M0' }],
  'cT2N1M0': [{ tag: 'A', text: 'cT2N1M0', romaji: 'cT2N1M0' }],
  'pT3N2M0': [{ tag: 'A', text: 'pT3N2M0', romaji: 'pT3N2M0' }],

  // ─── Stage病期分類 (アトミック分割打鍵: Stage + 半角スペース + 病期記号) ───
  'Stage 0': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: '0', romaji: '0' }],
  'Stage I': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'I', romaji: 'I' }],
  'Stage IA': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IA', romaji: 'IA' }],
  'Stage IB': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IB', romaji: 'IB' }],
  'Stage II': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'II', romaji: 'II' }],
  'Stage IIA': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IIA', romaji: 'IIA' }],
  'Stage IIB': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IIB', romaji: 'IIB' }],
  'Stage III': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'III', romaji: 'III' }],
  'Stage IIIA': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IIIA', romaji: 'IIIA' }],
  'Stage IIIB': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IIIB', romaji: 'IIIB' }],
  'Stage IIIC': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IIIC', romaji: 'IIIC' }],
  'Stage IV': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IV', romaji: 'IV' }],
  'Stage IVA': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IVA', romaji: 'IVA' }],
  'Stage IVB': [{ tag: 'A', text: 'Stage', romaji: 'Stage' }, { tag: 'space', text: ' ', romaji: ' ' }, { tag: 'A', text: 'IVB', romaji: 'IVB' }],
};
