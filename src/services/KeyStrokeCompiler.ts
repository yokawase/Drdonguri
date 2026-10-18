// =============================================================================
// File: src/services/KeyStrokeCompiler.ts
// 説明: 長単位結合オートマトン（Sudachi Mode C思想）により熟語のまとまりを保証し、
//       実績のあるv20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）を生成する
//       電カルセーフ決定論的トランスパイラ
// =============================================================================

import { KANA_ROMAJI_MAP, MEDICAL_KANJI_ROMAJI_MAP } from '../utils/japaneseImeTranspiler';
import { JIS_KANJI_ROMAJI } from '../data/jisKanjiRomajiTable';
import { MORPH_ROMAJI, MORPH_TAGS } from '../data/morphologicalLexicon';
import type { MorphToken } from '../workers/vibrato.worker';

export function katakanaToRomaji(katakana: string): string {
  return kanaToNormalizedRomaji(katakana);
}

export type KeyStrokeMode = 'hybrid' | 'deterministic_only';

export interface CompileOptions {
  mode?: KeyStrokeMode;
  includeImeReset?: boolean;
  newlineMode?: 'enter' | 'ctrl_enter' | 'alt_enter';
}

export interface KeyStrokeBlock {
  type: 'z_kanji' | 'k_katakana' | 'h_hiragana' | 'a_ascii' | 'control' | 'space' | 'raw';
  tag: string;
  rawText: string;
  compiledPayload: string;
}

export interface CompileResult {
  streamText: string;
  blocks: KeyStrokeBlock[];
  totalKeystrokes: number;
  zCount: number; // [Z] 漢字熟語・自立語 (Space変換 ➔ Enter確定)
  kCount: number; // [K] 全角カタカナ (F7 ➔ Enter確定)
  hCount: number; // [H] 助詞・語尾・句読点 (即時 Enter確定)
  aCount: number; // [A] 半角英数・記号 (直接送出 / F10確定)
  // 後方互換フィールド
  altCount: number;
  f7Count: number;
  f10Count: number;
}

// -----------------------------------------------------------------------------
// かな/カナ ➔ ローマ字正規化エンジン (促音・撥音・長音正規化)
// -----------------------------------------------------------------------------
export function kanaToNormalizedRomaji(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    // 3文字 (きゃ, しゃ等)
    if (i + 3 <= text.length) {
      const sub3 = text.substring(i, i + 3);
      if (KANA_ROMAJI_MAP[sub3]) {
        result += KANA_ROMAJI_MAP[sub3].trim();
        i += 3;
        continue;
      }
    }
    // 2文字
    if (i + 2 <= text.length) {
      const sub2 = text.substring(i, i + 2);
      if (KANA_ROMAJI_MAP[sub2]) {
        result += KANA_ROMAJI_MAP[sub2].trim();
        i += 2;
        continue;
      }
    }
    // 促音「っ」「ッ」
    if (text[i] === 'っ' || text[i] === 'ッ') {
      if (i + 1 < text.length) {
        const nextChar = text.substring(i + 1, i + 2);
        const nextTwo = text.substring(i + 1, i + 3);
        const nextRomaji = KANA_ROMAJI_MAP[nextTwo] || KANA_ROMAJI_MAP[nextChar];
        if (nextRomaji && nextRomaji.trim().length > 0) {
          result += nextRomaji.trim()[0];
          i++;
          continue;
        }
      }
      result += 'xtsu';
      i++;
      continue;
    }
    // 撥音「ん」「ン」の正規化
    if (text[i] === 'ん' || text[i] === 'ン') {
      if (i + 1 < text.length) {
        const next = text[i + 1];
        // 次が母音やヤ行の場合は 'nn'
        if ('あいうえおアイウエオやゆよヤユヨ'.includes(next)) {
          result += 'nn';
        } else {
          result += 'n';
        }
      } else {
        result += 'nn';
      }
      i++;
      continue;
    }
    // 長音「ー」
    if (text[i] === 'ー' || text[i] === '-') {
      result += '-';
      i++;
      continue;
    }
    // 1文字
    const sub1 = text.substring(i, i + 1);
    if (KANA_ROMAJI_MAP[sub1]) {
      result += KANA_ROMAJI_MAP[sub1].trim();
      i++;
      continue;
    }
    // カタカナ ➔ ひらがな変換
    const code = sub1.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) {
      const hira = String.fromCharCode(code - 0x60);
      if (KANA_ROMAJI_MAP[hira]) {
        result += KANA_ROMAJI_MAP[hira].trim();
        i++;
        continue;
      }
    }
    result += sub1;
    i++;
  }
  return result;
}

// -----------------------------------------------------------------------------
// 臨床熟語・複合名詞・自立語マスター (Compound Lexicon)
// -----------------------------------------------------------------------------
export const COMPOUND_LEXICON: Record<string, string> = {
  // 臨床実例完全適合
  '先週': 'sensyuu',
  '背中': 'senaka',
  '疼痛': 'toutuu',
  '体': 'karada',
  '身体': 'karada',
  '体動': 'taidou',
  '体動時': 'taidouji',
  '増悪': 'zouaku',
  'アルコール': 'aruko-ru',
  '肝機能障害': 'kankinousyougai',
  '性肝機能障害': 'seikankinousyougai',
  '疑い': 'utagai',
  '台': 'dai',
  '動か': 'ugoka',
  
  // 臨床頻出病名・症状・診察・所見
  '発熱': 'hatunetu',
  '咽頭痛': 'inntoutuu',
  '咽頭': 'inntou',
  '感冒': 'kannbou',
  '対症療法': 'taisyouryouhou',
  '対症': 'taisyou',
  '療法': 'ryouhou',
  '市販': 'sihann',
  '総合': 'sougou',
  '感冒薬': 'kannbouyaku',
  '内服': 'naihuku',
  '改善': 'kaizenn',
  '乏しく': 'tobosiku',
  '乏しい': 'tobosii',
  '来院': 'raiinn',
  '持続時': 'jizokuji',
  '持続': 'jizoku',
  '再診指示': 'saisinnsiji',
  '再診': 'saisinn',
  '指示': 'siji',
  '励行': 'reikou',
  '水分': 'suibunn',
  '摂取': 'sessyu',
  '平坦': 'heitann',
  '軟': 'nann',
  '腫大': 'syudai',
  '発赤': 'hosseki',
  '咳嗽': 'gaisou',
  '乾性': 'kannsei',
  '湿性': 'sissei',
  '呼吸音': 'kokyuuonn',
  '清': 'sei',
  '腹部': 'hukubu',
  '扁桃': 'henntou',
  '急性': 'kyuusei',
  '上気道炎': 'jyoukidouenn',
  '上気道': 'jyoukidou',
  '頓服': 'tonnpuku',
  '回': 'kai',
  '錠': 'jyou',
  '毎食': 'maisyoku',
  '朝食': 'tyousyoku',
  '昼食': 'tyuusyoku',
  '夕食': 'yuusyoku',
  '後': 'ato',
  '日前': 'nitimae',
  '日後': 'nitigo',
  '日分': 'nitibunn',
  '回分': 'kaibunn',
  '度': 'do',
  
  // 頻出医薬品・一般名
  'アセトアミノフェン': 'asetoaminofenn',
  'アセトアミノフェン錠': 'asetoaminofennjyou',
  'デキストロメトルファン': 'dekisutorometorufann',
  'デキストロメトルファン錠': 'dekisutorometorufannjyou',
  'カロナール': 'karona-ru',
  'カロナール錠': 'karona-rujyou',
  'ロキソニン': 'rokisoninn',
  'ロキソニン錠': 'rokisoninnjyou',
  'タケキャブ': 'takekyabu',
  'タケキャブ錠': 'takekyabujyou',

  // 臨床頻出病名・所見
  '右下腹部痛': 'migikahukubutuu',
  '右下腹部': 'migikahukubu',
  '下腹部痛': 'kahukubutuu',
  '下腹部': 'kahukubu',
  '急性虫垂炎': 'kyuuseityuusyuien',
  '虫垂炎': 'tyuusyuien',
  '否定的': 'hiteiteki',
  '否定': 'hitei',
  '心窩部痛': 'sinkabutuu',
  '心窩部': 'sinkabu',
  '早期胃癌': 'soukiigan',
  '胃癌': 'igan',
  '高血圧症': 'kouketuatusyou',
  '高血圧': 'kouketuatu',
  '糖尿病': 'tounyoubyou',
  '2型糖尿病': 'nigatatounyoubyou',
  '脂質異常症': 'sisituijousyou',
  '胃食道逆流症': 'isyokudougyakuryuusyou',
  '嚥下障害': 'engesyougai',
  '誤嚥性肺炎': 'goenseihaien',
  '帯状疱疹': 'taijouhousin',
  '胸痛': 'kyoutuu',
  '頭痛': 'zutuu',
  '呼吸困難': 'kokyuukonnnann',
  '食欲不振': 'syokuyokuhusinn',
  '既往': 'kiou',
  '既往歴': 'kioureki',
  '術後': 'jutugo',
  '経過良好': 'keikaryoukou',
  '良好': 'ryoukou',
  '創部': 'soubu',
  '感染': 'kansenn',
  '精査': 'seisa',
  '処方': 'syoho',

  // 内視鏡・消化器・病変・臨床判断 (ユーザー提示症例完全適合)
  '内視鏡所見': 'naishikyousyoken',
  '内視鏡': 'naishikyou',
  '拡大内視鏡': 'kakudainaishikyou',
  '所見': 'syoken',
  '典型所見': 'tenkeisyoken',
  '典型': 'tenkei',
  '陥凹型': 'kannougata',
  '陥凹': 'kannou',
  '辺縁粘膜': 'hennennnennmaku',
  '辺縁': 'hennenn',
  '粘膜': 'nennmaku',
  'ひだ集中': 'hidasyuutyuu',
  '集中': 'syuutyuu',
  '途読': 'todoku',
  '途絶': 'tozetu',
  '境界明瞭': 'kyoukaimeiryou',
  '境界': 'kyoukai',
  '明瞭': 'meiryou',
  '褪色': 'taisyoku',
  '微細血管構築異常': 'bisaikekkankoutikuijyou',
  '微細血管': 'bisaikekkan',
  '微細': 'bisai',
  '血管': 'kekkan',
  '構築異常': 'koutikuijyou',
  '構築': 'koutiku',
  '異常': 'ijyou',
  '鑑別疾患': 'kambetusikkan',
  '鑑別': 'kambetu',
  '疾患': 'sikkan',
  '胃潰瘍': 'ikaiyou',
  '潰瘍': 'kaiyou',
  '消化性潰瘍': 'syoukaseikaiyou',
  '消化性': 'syoukasei',
  '消化': 'syouka',
  '瘢痕期': 'hankonnki',
  '瘢痕': 'hankonn',
  '胃良性ポリープ': 'iryouuseipori-pu',
  '良性ポリープ': 'ryouseipori-pu',
  '良性': 'ryousei',
  'ポリープ': 'pori-pu',
  'リンパ腫': 'rimpasyu',
  '今日': 'kyou',
  '時々': 'tokidoki',
  '普通': 'hutsuu',
  '出現': 'syutugenn',
  '首相': 'syusou',
  '主訴': 'syuso',
  '背部痛': 'haibutuu',
  '背部': 'haibu',
  '筋筋膜性疼痛': 'kinkimmakuseitoutuu',
  '筋筋膜性': 'kinkimmakusei',
  '筋筋膜': 'kinkimmaku',
  '内臓疾患': 'naizousikkan',
  '内臓': 'naizou',
  '除外要': 'jyogaiyou',
  '除外': 'jyogai',
  '受診': 'jyusinn',
  '当院受診': 'touinnjyusinn',
  '中性': 'tyuusei',
  '理学所見': 'rigakusyoken',
  '特記なし': 'tokkinasi',
  '特記': 'tokki',
  '鎮痛薬処方': 'chintuuyakusyoho',
  '安静指導': 'annseisidou',
  '安静': 'annsei',
  '指導': 'sidou',
  '肝機能再検': 'kannkinousaikenn',
  '再検': 'saikenn',
  '炎症反応': 'ennsyouhannnou',
  '反応': 'hannnou',
  '腹部超音波': 'fukubutyouonnpa',
  '超音波': 'tyouonnpa',
  '精査検討': 'seisakentou',
  '検討': 'kentou',
  '胃角部小弯': 'ikakubusyouwann',
  '胃角部': 'ikakubu',
  '胃角': 'ikaku',
  '小弯': 'syouwann',
  '大弯': 'daiwann',
  '前庭部': 'zenteibu',
  '前庭': 'zentei',
  '浅い': 'asai',
  '不整陥凹病変': 'fuseikannoubyouhenn',
  '不整陥凹': 'fuseikannou',
  '陥凹病変': 'kannoubyouhenn',
  '病変': 'byouhenn',
  '不整': 'fusei',
  '精査要': 'seisayou',
  '臨床判断': 'rinsyouhanndann',
  '臨床': 'rinsyou',
  '判断': 'hanndann',
  '慢性萎縮性胃炎': 'manseiisyukuseiienn',
  '萎縮性胃炎': 'isyukuseiienn',
  '萎縮性': 'isyukusei',
  '慢性': 'mansei',
  '萎縮': 'isyuku',
  '胃炎': 'ienn',
  '限局性': 'gennkyokusei',
  '限局': 'gennkyoku',
  'びらん': 'biran',
  '適応精査': 'tekiouseisa',
  '適応': 'tekiou',
  '要': 'you',
};

// 医療専門語彙辞書 (MEDICAL_KANJI_ROMAJI_MAP) を COMPOUND_LEXICON へ自動マージ
// ※純粋なひらがな語（助詞・付属語など）は PARTICLES で [H] 即時確定させるため除外
for (const [term, romaji] of Object.entries(MEDICAL_KANJI_ROMAJI_MAP)) {
  if (!COMPOUND_LEXICON[term]) {
    if (/[\u4E00-\u9FFF\u30A1-\u30FA]/.test(term)) {
      COMPOUND_LEXICON[term] = romaji.trim();
    }
  }
}

// -----------------------------------------------------------------------------
// MS-IMEで1語一括変換すると誤爆しやすい複合語の「最適チャンク分割」辞書
// -----------------------------------------------------------------------------
export const MULTI_CHUNK_LEXICON: Record<string, Array<{ tag: 'Z' | 'K' | 'H' | 'A' | 'G'; text: string; romaji: string }>> = {
  '市販総合感冒薬内服': [
    { tag: 'Z', text: '市販', romaji: 'sihann' },
    { tag: 'Z', text: '総合', romaji: 'sougou' },
    { tag: 'Z', text: '感冒薬', romaji: 'kannbouyaku' },
    { tag: 'Z', text: '内服', romaji: 'naihuku' },
  ],
  '総合感冒薬': [
    { tag: 'Z', text: '総合', romaji: 'sougou' },
    { tag: 'Z', text: '感冒薬', romaji: 'kannbouyaku' },
  ],
  '乾性咳嗽': [
    { tag: 'Z', text: '乾性', romaji: 'kannsei' },
    { tag: 'Z', text: '咳嗽', romaji: 'gaisou' },
  ],
  '湿性咳嗽': [
    { tag: 'Z', text: '湿性', romaji: 'sissei' },
    { tag: 'Z', text: '咳嗽', romaji: 'gaisou' },
  ],
  '咽頭発赤': [
    { tag: 'Z', text: '咽頭', romaji: 'inntou' },
    { tag: 'Z', text: '発赤', romaji: 'hosseki' },
  ],
  '扁桃腫大': [
    { tag: 'Z', text: '扁桃', romaji: 'henntou' },
    { tag: 'Z', text: '腫大', romaji: 'syudai' },
  ],
  '呼吸音清': [
    { tag: 'Z', text: '呼吸音', romaji: 'kokyuuonn' },
    { tag: 'Z', text: '清', romaji: 'sei' },
  ],
  '腹部平坦': [
    { tag: 'Z', text: '腹部', romaji: 'hukubu' },
    { tag: 'Z', text: '平坦', romaji: 'heitann' },
  ],
  '急性上気道炎': [
    { tag: 'Z', text: '急性', romaji: 'kyuusei' },
    { tag: 'Z', text: '上気道炎', romaji: 'jyoukidouenn' },
  ],
  '水分摂取励行': [
    { tag: 'Z', text: '水分', romaji: 'suibunn' },
    { tag: 'Z', text: '摂取', romaji: 'sessyu' },
    { tag: 'Z', text: '励行', romaji: 'reikou' },
  ],
  '毎食後': [
    { tag: 'Z', text: '毎食', romaji: 'maisyoku' },
    { tag: 'Z', text: '後', romaji: 'ato' },
  ],
  '再診指示': [
    { tag: 'Z', text: '再診', romaji: 'saisinn' },
    { tag: 'Z', text: '指示', romaji: 'siji' },
  ],

  // 消化器・内視鏡 臨床所見 最適チャンク分解 (ヘボン式・Gタグ全廃・MS-IME標準互換)
  '内視鏡所見': [
    { tag: 'Z', text: '内視鏡', romaji: 'naishikyou' },
    { tag: 'Z', text: '所見', romaji: 'shoken' },
  ],
  '典型所見': [
    { tag: 'Z', text: '典型', romaji: 'tenkei' },
    { tag: 'Z', text: '所見', romaji: 'shoken' },
  ],
  '早期胃癌': [
    { tag: 'Z', text: '早期胃癌', romaji: 'soukiigan' },
  ],
  '陥凹型': [
    { tag: 'Z', text: '陥凹型', romaji: 'kannougata' },
  ],
  '不整陥凹病変': [
    { tag: 'Z', text: '不整', romaji: 'fusei' },
    { tag: 'Z', text: '陥凹', romaji: 'kannou' },
    { tag: 'Z', text: '病変', romaji: 'byouhen' },
  ],
  '不整陥凹': [
    { tag: 'Z', text: '不整', romaji: 'fusei' },
    { tag: 'Z', text: '陥凹', romaji: 'kannou' },
  ],
  '陥凹病変': [
    { tag: 'Z', text: '陥凹', romaji: 'kannou' },
    { tag: 'Z', text: '病変', romaji: 'byouhen' },
  ],
  '辺縁粘膜': [
    { tag: 'Z', text: '辺縁粘膜', romaji: 'henennnennmaku' },
  ],
  '境界明瞭': [
    { tag: 'Z', text: '境界明瞭', romaji: 'kyoukaimeiryou' },
  ],
  '微細血管構築異常': [
    { tag: 'Z', text: '微細血管', romaji: 'bisaikekkan' },
    { tag: 'Z', text: '構築異常', romaji: 'koutikuijyou' },
  ],
  '構築異常': [
    { tag: 'Z', text: '構築異常', romaji: 'koutikuijyou' },
  ],
  '胃潰瘍': [
    { tag: 'Z', text: '胃潰瘍', romaji: 'ikaiyou' },
  ],
  '消化性潰瘍': [
    { tag: 'Z', text: '消化性潰瘍', romaji: 'shoukaseikaiyou' },
  ],
  '瘢痕期': [
    { tag: 'Z', text: '瘢痕', romaji: 'hankon' },
    { tag: 'Z', text: '期', romaji: 'ki' },
  ],
  '胃良性ポリープ': [
    { tag: 'Z', text: '胃', romaji: 'i' },
    { tag: 'Z', text: '良性', romaji: 'ryousei' },
    { tag: 'K', text: 'ポリープ', romaji: 'pori-pu' },
  ],
  '胃角部小弯': [
    { tag: 'Z', text: '胃角部', romaji: 'ikakubu' },
    { tag: 'Z', text: '小弯', romaji: 'shouwan' },
  ],
  '前庭部': [
    { tag: 'Z', text: '前庭部', romaji: 'zenteibu' },
  ],
  '精査要': [
    { tag: 'Z', text: '精査', romaji: 'seisa' },
    { tag: 'Z', text: '要', romaji: 'you' },
  ],
  '臨床判断': [
    { tag: 'Z', text: '臨床判断', romaji: 'rinshouhandan' },
  ],
  '慢性萎縮性胃炎': [
    { tag: 'Z', text: '慢性', romaji: 'mansei' },
    { tag: 'Z', text: '萎縮性', romaji: 'ishukusei' },
    { tag: 'Z', text: '胃炎', romaji: 'ien' },
  ],
  '限局性びらん': [
    { tag: 'Z', text: '限局性', romaji: 'genkyokusei' },
    { tag: 'H', text: 'びらん', romaji: 'biran' },
  ],
  'ESD適応精査': [
    { tag: 'A', text: 'ESD', romaji: 'ESD' },
    { tag: 'Z', text: '適応精査', romaji: 'tekiouseisa' },
  ],
  '早期胃癌疑い': [
    { tag: 'Z', text: '早期胃癌', romaji: 'soukiigan' },
    { tag: 'Z', text: '疑い', romaji: 'utagai' },
  ],
  '途読': [
    { tag: 'Z', text: '途', romaji: 'to' },
    { tag: 'Z', text: '読', romaji: 'doku' },
  ],
  '褪色': [
    { tag: 'Z', text: '褪色', romaji: 'taishoku' },
  ],
  '今日': [
    { tag: 'Z', text: '今日', romaji: 'kyou' },
  ],
  '時々': [
    { tag: 'Z', text: '時々', romaji: 'tokidoki' },
  ],
  '普通': [
    { tag: 'Z', text: '普通', romaji: 'hutsuu' },
  ],
  '首相': [
    { tag: 'Z', text: '首相', romaji: 'shusou' },
  ],
  '主訴': [
    { tag: 'Z', text: '主訴', romaji: 'shuso' },
  ],
  '受診': [
    { tag: 'Z', text: '受診', romaji: 'jushin' },
  ],
  '当院受診': [
    { tag: 'Z', text: '当院受診', romaji: 'touinjushin' },
  ],
  '中性': [
    { tag: 'Z', text: '中性', romaji: 'chuusei' },
  ],
  '理学所見': [
    { tag: 'Z', text: '理学所見', romaji: 'rigakushoken' },
  ],
  '所見': [
    { tag: 'Z', text: '所見', romaji: 'shoken' },
  ],
  '特記なし': [
    { tag: 'Z', text: '特記', romaji: 'tokki' },
    { tag: 'H', text: 'なし', romaji: 'nashi' },
  ],
  '特記': [
    { tag: 'Z', text: '特記', romaji: 'tokki' },
  ],
  '体動時背部痛': [
    { tag: 'Z', text: '体動', romaji: 'taidou' },
    { tag: 'Z', text: '時', romaji: 'ji' },
    { tag: 'Z', text: '背部痛', romaji: 'haibutsuu' },
  ],
  '体動時': [
    { tag: 'Z', text: '体動', romaji: 'taidou' },
    { tag: 'Z', text: '時', romaji: 'ji' },
  ],
  '背部痛': [
    { tag: 'Z', text: '背部痛', romaji: 'haibutsuu' },
  ],
  '背部': [
    { tag: 'Z', text: '背部', romaji: 'haibu' },
  ],
  '筋筋膜性疼痛': [
    { tag: 'Z', text: '筋筋膜性', romaji: 'kinkimmakusei' },
    { tag: 'Z', text: '疼痛', romaji: 'toutuu' },
  ],
  '筋筋膜性': [
    { tag: 'Z', text: '筋筋膜性', romaji: 'kinkimmakusei' },
  ],
  '筋筋膜': [
    { tag: 'Z', text: '筋筋膜', romaji: 'kinkimmaku' },
  ],
  '内臓疾患': [
    { tag: 'Z', text: '内臓疾患', romaji: 'naizoushikkan' },
  ],
  '内臓': [
    { tag: 'Z', text: '内臓', romaji: 'naizou' },
  ],
  '除外要': [
    { tag: 'Z', text: '除外', romaji: 'jogai' },
    { tag: 'Z', text: '要', romaji: 'you' },
  ],
  '除外': [
    { tag: 'Z', text: '除外', romaji: 'jogai' },
  ],
  '鎮痛薬処方': [
    { tag: 'Z', text: '鎮痛薬処方', romaji: 'chintuuyakushoho' },
  ],
  '処方': [
    { tag: 'Z', text: '処方', romaji: 'shoho' },
  ],
  '安静指導': [
    { tag: 'Z', text: '安静指導', romaji: 'anseishidou' },
  ],
  '肝機能再検': [
    { tag: 'Z', text: '肝機能', romaji: 'kankinou' },
    { tag: 'Z', text: '再検', romaji: 'saiken' },
  ],
  '再検': [
    { tag: 'Z', text: '再検', romaji: 'saiken' },
  ],
  '炎症反応': [
    { tag: 'Z', text: '炎症反応', romaji: 'ensyouhannou' },
  ],
  '反応': [
    { tag: 'Z', text: '反応', romaji: 'hannou' },
  ],
  '腹部超音波': [
    { tag: 'Z', text: '腹部超音波', romaji: 'fukubuchouonpa' },
  ],
  '精査検討': [
    { tag: 'Z', text: '精査検討', romaji: 'seisakentou' },
  ],
  '歳': [
    { tag: 'Z', text: '歳', romaji: 'sai' },
  ],
};

// 熟語フォールバック用 医療音読み優先テーブル（訓読み誤爆・キメラ連結を完全根絶）
export const ONYOMI_KANJI_FALLBACK: Record<string, string> = {
  // 医療・臨床漢字 音読みマスター (訓読み誤爆・キメラ連結を完全根絶)
  '鏡': 'kyou', '所': 'syo', '見': 'ken', '凹': 'ou', '陥': 'kann',
  '辺': 'henn', '縁': 'enn', '粘': 'nem', '膜': 'maku', '集': 'syuu',
  '中': 'tyuu', '途': 'to', '絶': 'zetu', '読': 'doku', '境': 'kyou',
  '界': 'kai', '明': 'mei', '瞭': 'ryou', '褪': 'tai', '色': 'syoku',
  '微': 'bi', '細': 'sai', '血': 'ketu', '管': 'kann', '構': 'kou',
  '築': 'tiku', '異': 'i', '常': 'jyou', '鑑': 'kann', '別': 'betu',
  '疾': 'situ', '患': 'kann', '胃': 'i', '潰': 'kai', '瘍': 'you',
  '瘢': 'hann', '痕': 'konn', '期': 'ki', '良': 'ryou', '典': 'tenn',
  '型': 'kei', '角': 'kaku', '弯': 'wann', '庭': 'tei', '浅': 'senn',
  '整': 'sei', '病': 'byou', '変': 'henn', '臨': 'rinn', '床': 'syou',
  '判': 'hann', '断': 'dann', '慢': 'mann', '萎': 'i', '縮': 'syuku',
  '限': 'genn', '局': 'kyoku', '適': 'teki', '応': 'ou', '査': 'sa',
  '要': 'you', '前': 'zenn', '後': 'go', '癌': 'gann', '腫': 'syu',
  '咽': 'inn', '頭': 'tou', '痛': 'tuu', '咳': 'gai', '嗽': 'sou',
  '乾': 'kann', '性': 'sei', '発': 'hatu', '熱': 'netu', '赤': 'seki',
  '扁': 'henn', '桃': 'tou', '大': 'dai', '呼': 'ko', '吸': 'kyuu',
  '音': 'onn', '清': 'sei', '腹': 'huku', '部': 'bu', '平': 'hei',
  '坦': 'tann', '軟': 'nann', '急': 'kyuu', '上': 'jyou', '下': 'ka',
  '気': 'ki', '道': 'dou', '炎': 'enn', '感': 'kann', '冒': 'bou',
  '対': 'tai', '症': 'syou', '療': 'ryou', '法': 'hou', '市': 'si',
  '販': 'hann', '総': 'sou', '合': 'gou', '薬': 'yaku', '内': 'nai',
  '服': 'huku', '改': 'kai', '善': 'zenn', '乏': 'bou', '来': 'rai',
  '院': 'inn', '水': 'sui', '分': 'bunn', '摂': 'setu', '取': 'syu',
  '励': 'rei', '行': 'kou', '持': 'ji', '続': 'zoku', '時': 'ji',
  '再': 'sai', '診': 'sinn', '指': 'si', '示': 'ji',
  '背': 'hai', '筋': 'kinn', '外': 'gai', '除': 'jyo', '臓': 'zou',
  '普': 'fu', '通': 'tuu', '首': 'syu', '相': 'sou', '訴': 'so',
  '特': 'toku', '記': 'ki', '反': 'hann', '今': 'konn', '日': 'niti',
  '理': 'ri', '学': 'gaku', '検': 'kenn', '液': 'eki', '超': 'tyou',
  '波': 'ha', '導': 'dou', '歳': 'sai', '差': 'sa', '昨': 'saku',
  '出': 'syutu', '現': 'genn', '受': 'jyu', '信': 'sinn', '針': 'sinn',
  '安': 'ann', '静': 'sei', '鎮': 'tinn', '討': 'tou', '男': 'dann',
};

// 医療接尾辞リスト（直前の自立語へ完全融合する接尾辞）
export const MEDICAL_SUFFIXES = [
  '時', '性', '症', '炎', '薬', '後', '前', '内', '外', '上', '下',
  '部', '側', '期', '度', '型', '病', '患', '痛', '音', '感', '熱',
  '圧', '率', '力', '台', '剤', '錠', '群', '線', '等', '目', '的'
];

export const SUFFIX_READING: Record<string, string> = {
  '時': 'ji',
  '性': 'sei',
  '症': 'syou',
  '炎': 'enn',
  '薬': 'yaku',
  '後': 'go',
  '前': 'mae',
  '痛': 'tuu',
  '部': 'bu',
  '台': 'dai',
  '度': 'do',
  '型': 'gata',
  '病': 'byou',
  '熱': 'netu',
  '圧': 'atu',
  '率': 'ritu',
  '力': 'ryoku',
  '錠': 'jyou',
  '剤': 'zai',
  '的': 'teki',
};

// 付属語・助詞・述部（[H] Enter即時確定）
export const PARTICLES = new Set([
  'から', 'まで', 'が', 'を', 'に', 'へ', 'と', 'より', 'で', 'の', 'は', 'も', 'や',
  'など', 'あり', 'なし', 'です', 'ます', 'でした', 'ました', 'ない', 'ぬ', 'ば',
  'ので', 'のに', 'けど', 'けれど', 'ながら', 'つつ', 'すと', 'して', 'され', 'せる', 'た', 'て',
  'するも', 'する', 'した', 'された', 'および', 'または', 'にて', 'のみ'
]);

// 語幹・語尾ペアルール（動詞・形容詞の誤変換防止）
export const VERB_STEM_RULES: { pattern: RegExp; stemSurface: string; stemRomaji: string; endingSurface: string; endingRomaji: string }[] = [
  { pattern: /^動かすと/, stemSurface: '動か', stemRomaji: 'ugoka', endingSurface: 'すと', endingRomaji: 'suto' },
  { pattern: /^動かす/, stemSurface: '動か', stemRomaji: 'ugoka', endingSurface: 'す', endingRomaji: 'su' },
  { pattern: /^動いて/, stemSurface: '動い', stemRomaji: 'ugoi', endingSurface: 'て', endingRomaji: 'te' },
  { pattern: /^動いた/, stemSurface: '動い', stemRomaji: 'ugoi', endingSurface: 'た', endingRomaji: 'ta' },
  { pattern: /^痛むと/, stemSurface: '痛む', stemRomaji: 'itamu', endingSurface: 'と', endingRomaji: 'to' },
  { pattern: /^認める/, stemSurface: '認め', stemRomaji: 'mitome', endingSurface: 'る', endingRomaji: 'ru' },
  { pattern: /^認めた/, stemSurface: '認め', stemRomaji: 'mitome', endingSurface: 'た', endingRomaji: 'ta' },
  { pattern: /^認めず/, stemSurface: '認め', stemRomaji: 'mitome', endingSurface: 'ず', endingRomaji: 'zu' },
];

// -----------------------------------------------------------------------------
// 長単位結合オートマトン（Sudachi Mode C 思想）＆ HYBRID キーストロークコンパイラ
// -----------------------------------------------------------------------------
export class KeyStrokeCompiler {
  /**
   * テキストを「長単位結合オートマトン」で解析し、v20.1 HYBRID打鍵ストリームへコンパイル
   */
  public compileText(text: string, options: CompileOptions = {}): CompileResult {
    const includeImeReset = options.includeImeReset !== false;
    const newlineMode = options.newlineMode || 'enter';

    const blocks: KeyStrokeBlock[] = [];
    let zCount = 0;
    let kCount = 0;
    let hCount = 0;
    let aCount = 0;
    let totalKeystrokes = 0;

    // 1. IMEリセットタグ（無変換キー空打ち）
    if (includeImeReset) {
      blocks.push({
        type: 'control',
        tag: 'control',
        rawText: '[IME_RESET]',
        compiledPayload: '[IME_RESET]',
      });
      totalKeystrokes += 2;
    }

    let i = 0;
    const len = text.length;

    while (i < len) {
      const remaining = text.substring(i);

      // A. 改行制御
      if (remaining.startsWith('\r\n') || remaining.startsWith('\n')) {
        const isCrLf = remaining.startsWith('\r\n');
        let tag = '[ENTER]';
        if (newlineMode === 'alt_enter') tag = '[ALT_ENTER]';
        else if (newlineMode === 'ctrl_enter') tag = '[CTRL_ENTER]';

        blocks.push({
          type: 'control',
          tag: 'control',
          rawText: isCrLf ? '\r\n' : '\n',
          compiledPayload: tag,
        });
        totalKeystrokes += 1;
        i += isCrLf ? 2 : 1;
        continue;
      }

      // B. 空白文字
      if (remaining.startsWith(' ') || remaining.startsWith('\t')) {
        const ch = remaining[0];
        blocks.push({
          type: 'space',
          tag: 'space',
          rawText: ch,
          compiledPayload: ch,
        });
        totalKeystrokes += 1;
        i += 1;
        continue;
      }

      // C. 句読点（[H] Enter即時確定 ＆ 自動スペース付与）
      if (remaining.startsWith('、')) {
        blocks.push({
          type: 'h_hiragana',
          tag: 'H',
          rawText: '、',
          compiledPayload: '[H]、[/H]',
        });
        blocks.push({
          type: 'space',
          tag: 'space',
          rawText: ' ',
          compiledPayload: ' ',
        });
        hCount++;
        totalKeystrokes += 3;
        i += 1;
        continue;
      }
      if (remaining.startsWith('。')) {
        blocks.push({
          type: 'h_hiragana',
          tag: 'H',
          rawText: '。',
          compiledPayload: '[H]。[/H]',
        });
        hCount++;
        totalKeystrokes += 2;
        i += 1;
        if (i < len && !text.substring(i).startsWith('\n') && !text.substring(i).startsWith('\r') && !text.substring(i).startsWith(' ')) {
          blocks.push({
            type: 'space',
            tag: 'space',
            rawText: ' ',
            compiledPayload: ' ',
          });
          totalKeystrokes += 1;
        }
        continue;
      }
      if (remaining.startsWith('・')) {
        blocks.push({
          type: 'h_hiragana',
          tag: 'H',
          rawText: '・',
          compiledPayload: '[H]・[/H]',
        });
        hCount++;
        totalKeystrokes += 2;
        i += 1;
        continue;
      }

      // C-2. カルテ見出し括弧 【 】 ➔ [A]【[/A] / [A]】[/A] (ファームウェア側で [ / ] + F10 確定)
      if (remaining.startsWith('【')) {
        blocks.push({
          type: 'a_ascii',
          tag: 'A',
          rawText: '【',
          compiledPayload: '[A]【[/A]',
        });
        aCount++;
        totalKeystrokes += 1;
        i += 1;
        continue;
      }
      if (remaining.startsWith('】')) {
        blocks.push({
          type: 'a_ascii',
          tag: 'A',
          rawText: '】',
          compiledPayload: '[A]】[/A]',
        });
        aCount++;
        totalKeystrokes += 1;
        i += 1;
        continue;
      }

      // D. 動詞・形容詞の語幹語尾分離オートマトン
      let matchedVerb = false;
      for (const rule of VERB_STEM_RULES) {
        if (rule.pattern.test(remaining)) {
          // 語幹 [Z]
          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: rule.stemSurface,
            compiledPayload: `[Z]${rule.stemRomaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += rule.stemRomaji.length + 2; // Space + Enter

          // 語尾 [H]
          blocks.push({
            type: 'h_hiragana',
            tag: 'H',
            rawText: rule.endingSurface,
            compiledPayload: `[H]${rule.endingRomaji}[/H]`,
          });
          hCount++;
          totalKeystrokes += rule.endingRomaji.length + 1; // Enter

          i += rule.stemSurface.length + rule.endingSurface.length;
          matchedVerb = true;
          break;
        }
      }
      if (matchedVerb) continue;

      // E. カタカナ語 + 「性」+ 漢字名詞 の特殊結合
      // 例: 「アルコール性肝機能障害」 ➔ [K]aruko-ru[/K] + [Z]seikankinousyougai[/Z]
      const katakanaMatch = remaining.match(/^([\u30A1-\u30FA\u30FC]+)性([\u4E00-\u9FFF]+)/);
      if (katakanaMatch) {
        const kataPart = katakanaMatch[1];
        const kanjiPart = katakanaMatch[2];
        const kataRomaji = kanaToNormalizedRomaji(kataPart);
        blocks.push({
          type: 'k_katakana',
          tag: 'K',
          rawText: kataPart,
          compiledPayload: `[K]${kataRomaji}[/K]`,
        });
        kCount++;
        totalKeystrokes += kataRomaji.length + 2; // F7 + Enter

        const combinedKanji = '性' + kanjiPart;
        const combinedRomaji = COMPOUND_LEXICON[combinedKanji] || ('sei' + (COMPOUND_LEXICON[kanjiPart] || kanjiPart));
        blocks.push({
          type: 'z_kanji',
          tag: 'Z',
          rawText: combinedKanji,
          compiledPayload: `[Z]${combinedRomaji}[/Z]`,
        });
        zCount++;
        totalKeystrokes += combinedRomaji.length + 2;

        i += kataPart.length + 1 + kanjiPart.length;
        continue;
      }

      // F. 全角カタカナ語 ➔ [K] (F7 ➔ Enter確定)
      const pureKatakana = remaining.match(/^[\u30A1-\u30FA\u30FC]+/);
      if (pureKatakana && pureKatakana[0].length >= 2) {
        const kata = pureKatakana[0];
        const romaji = kanaToNormalizedRomaji(kata);
        blocks.push({
          type: 'k_katakana',
          tag: 'K',
          rawText: kata,
          compiledPayload: `[K]${romaji}[/K]`,
        });
        kCount++;
        totalKeystrokes += romaji.length + 2;
        i += kata.length;
        continue;
      }

      // G. 半角英数字・記号 (ASCII / ギリシャ文字 / カンマ) ➔ [A] (直接送出 / F10確定)
      const asciiMatch = remaining.match(/^(?:[\u0370-\u03FFa-zA-Z0-9_\-\.\,\:\/\%\+\(\)]+)/);
      if (asciiMatch) {
        const asc = asciiMatch[0];
        blocks.push({
          type: 'a_ascii',
          tag: 'A',
          rawText: asc,
          compiledPayload: `[A]${asc}[/A]`,
        });
        aCount++;
        totalKeystrokes += asc.length;
        i += asc.length;
        continue;
      }

      // H. 熟語・複合名詞・接尾辞結合オートマトン (Mode C)
      // H-0. マルチチャンク最適分解辞書探索 (例: 乾性咳嗽 ➔ [Z]kannsei[/Z][Z]gaisou[/Z])
      let matchedMultiChunk = false;
      for (const [phrase, chunks] of Object.entries(MULTI_CHUNK_LEXICON)) {
        if (remaining.startsWith(phrase)) {
          for (const chunk of chunks) {
            if (chunk.tag === 'Z') {
              blocks.push({
                type: 'z_kanji',
                tag: 'Z',
                rawText: chunk.text,
                compiledPayload: `[Z]${chunk.romaji}[/Z]`,
              });
              zCount++;
              totalKeystrokes += chunk.romaji.length + 2;
            } else if (chunk.tag === 'K') {
              blocks.push({
                type: 'k_katakana',
                tag: 'K',
                rawText: chunk.text,
                compiledPayload: `[K]${chunk.romaji}[/K]`,
              });
              kCount++;
              totalKeystrokes += chunk.romaji.length + 2;
            } else if (chunk.tag === 'H') {
              blocks.push({
                type: 'h_hiragana',
                tag: 'H',
                rawText: chunk.text,
                compiledPayload: `[H]${chunk.romaji}[/H]`,
              });
              hCount++;
              totalKeystrokes += chunk.romaji.length + 1;
            } else if (chunk.tag === 'A') {
              blocks.push({
                type: 'a_ascii',
                tag: 'A',
                rawText: chunk.text,
                compiledPayload: `[A]${chunk.romaji}[/A]`,
              });
              aCount++;
              totalKeystrokes += chunk.romaji.length;
            } else if (chunk.tag === 'G') {
              blocks.push({
                type: 'z_kanji',
                tag: 'G',
                rawText: chunk.text,
                compiledPayload: `[G]${chunk.romaji}[/G]`,
              });
              zCount++;
              totalKeystrokes += chunk.romaji.length + 3; // Space*2 + Enter
            }
          }
          i += phrase.length;
          matchedMultiChunk = true;
          break;
        }
      }
      if (matchedMultiChunk) continue;

      // H-1. 既存の臨床・検証済み辞書 (COMPOUND_LEXICON) 最長一致探索 (最長24文字〜2文字)
      let matchedCompound = false;
      for (let l = Math.min(24, remaining.length); l >= 2; l--) {
        const sub = remaining.substring(0, l);
        if (COMPOUND_LEXICON[sub]) {
          let compound = sub;
          let romaji = COMPOUND_LEXICON[sub];
          let offset = l;

          if (offset < remaining.length) {
            const nextPart = remaining.substring(offset);
            if (nextPart.startsWith('な') && !nextPart.startsWith('ない') && !nextPart.startsWith('など') && !nextPart.startsWith('なし') && !nextPart.startsWith('なら')) {
              compound += 'な';
              romaji += 'na';
              offset += 1;
            } else if (nextPart.startsWith('する')) {
              compound += 'する';
              romaji += 'suru';
              offset += 2;
            } else if (nextPart.startsWith('した')) {
              compound += 'した';
              romaji += 'shita';
              offset += 2;
            } else if (nextPart.startsWith('され')) {
              compound += 'され';
              romaji += 'sare';
              offset += 2;
            } else if (nextPart.startsWith('して')) {
              compound += 'して';
              romaji += 'shite';
              offset += 2;
            } else {
              const nextChar = remaining[offset];
              if (MEDICAL_SUFFIXES.includes(nextChar)) {
                const combined = compound + nextChar;
                if (COMPOUND_LEXICON[combined]) {
                  compound = combined;
                  romaji = COMPOUND_LEXICON[combined];
                  offset += 1;
                } else if (SUFFIX_READING[nextChar]) {
                  compound = combined;
                  romaji = romaji + SUFFIX_READING[nextChar];
                  offset += 1;
                }
              }
            }
          }

          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: compound,
            compiledPayload: `[Z]${romaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += romaji.length + 2;
          i += offset;
          matchedCompound = true;
          break;
        }
      }
      if (matchedCompound) continue;

      // H-1.5. 12.6万語大規模形態素辞書 (Mozc ＋ 厚労省マスター ＋ 臨床特化医療辞書) 最長一致探索 (最長16文字〜1文字)
      let matchedMorphLexicon = false;
      for (let l = Math.min(16, remaining.length); l >= 1; l--) {
        const sub = remaining.substring(0, l);
        if (MORPH_ROMAJI[sub]) {
          const romaji = MORPH_ROMAJI[sub];
          const tag = MORPH_TAGS[sub] || 'Z';

          if (tag === 'K') {
            blocks.push({
              type: 'k_katakana',
              tag: 'K',
              rawText: sub,
              compiledPayload: `[K]${romaji}[/K]`,
            });
            kCount++;
            totalKeystrokes += romaji.length + 2; // F7 + Enter
          } else if (tag === 'H') {
            blocks.push({
              type: 'h_hiragana',
              tag: 'H',
              rawText: sub,
              compiledPayload: `[H]${romaji}[/H]`,
            });
            hCount++;
            totalKeystrokes += romaji.length + 1; // Enter
          } else {
            let combinedText = sub;
            let combinedRomaji = romaji;
            let consumedLen = l;

            const nextPart = remaining.substring(l);
            // 1. サ変複合動詞 (自立語 + する/した/され/して/している)
            // 例: 「志向」+「する」 ➔ [Z]shikousuru[/Z]
            if (nextPart.startsWith('する')) {
              combinedText += 'する';
              combinedRomaji += 'suru';
              consumedLen += 2;
            } else if (nextPart.startsWith('した')) {
              combinedText += 'した';
              combinedRomaji += 'shita';
              consumedLen += 2;
            } else if (nextPart.startsWith('され')) {
              combinedText += 'され';
              combinedRomaji += 'sare';
              consumedLen += 2;
            } else if (nextPart.startsWith('して')) {
              combinedText += 'して';
              combinedRomaji += 'shite';
              consumedLen += 2;
            } else if (nextPart.startsWith('な') && !nextPart.startsWith('ない') && !nextPart.startsWith('など') && !nextPart.startsWith('なし') && !nextPart.startsWith('なら')) {
              // 2. 形容動詞連体形 (自立語 + な)
              // 例: 「過度」+「な」 ➔ [Z]kadona[/Z]
              combinedText += 'な';
              combinedRomaji += 'na';
              consumedLen += 1;
            } else if (sub.endsWith('さ') && nextPart.startsWith('れ')) {
              // 3. 動詞受身 (例: 「課さ」+「れ」 ➔ [Z]kasare[/Z])
              combinedText += 'れ';
              combinedRomaji += 're';
              consumedLen += 1;
            }

            blocks.push({
              type: 'z_kanji',
              tag: 'Z',
              rawText: combinedText,
              compiledPayload: `[Z]${combinedRomaji}[/Z]`,
            });
            zCount++;
            totalKeystrokes += combinedRomaji.length + 2; // Space + Enter
            i += consumedLen;
            matchedMorphLexicon = true;
            break;
          }
        }
      }
      if (matchedMorphLexicon) continue;

      // H-2. 助詞・付属語 (ひらがな)
      let matchedParticle = false;
      for (const p of PARTICLES) {
        if (remaining.startsWith(p)) {
          const romaji = kanaToNormalizedRomaji(p);
          blocks.push({
            type: 'h_hiragana',
            tag: 'H',
            rawText: p,
            compiledPayload: `[H]${romaji}[/H]`,
          });
          hCount++;
          totalKeystrokes += romaji.length + 1;
          i += p.length;
          matchedParticle = true;
          break;
        }
      }
      if (matchedParticle) continue;

      // H-3. 辞書外の未知漢字フォールバック (1文字ずつ安全出力)
      const singleKanji = remaining.match(/^[\u4E00-\u9FFF\u3005]/);
      if (singleKanji) {
        const ch = singleKanji[0];
        const romaji = JIS_KANJI_ROMAJI[ch] || ONYOMI_KANJI_FALLBACK[ch] || ch;
        blocks.push({
          type: 'z_kanji',
          tag: 'Z',
          rawText: ch,
          compiledPayload: `[Z]${romaji}[/Z]`,
        });
        zCount++;
        totalKeystrokes += romaji.length + 2;
        i += 1;
        continue;
      }

      // H-5. 連続するひらがな列の一括 [H] 送出 (即時 Enter 確定)
      const hiraRun = remaining.match(/^[\u3041-\u3096]+/);
      if (hiraRun) {
        const hText = hiraRun[0];
        const romaji = kanaToNormalizedRomaji(hText);
        blocks.push({
          type: 'h_hiragana',
          tag: 'H',
          rawText: hText,
          compiledPayload: `[H]${romaji}[/H]`,
        });
        hCount++;
        totalKeystrokes += romaji.length + 1;
        i += hText.length;
        continue;
      }

      // I. 未知文字
      const ch = remaining[0];
      blocks.push({
        type: 'raw',
        tag: 'raw',
        rawText: ch,
        compiledPayload: ch,
      });
      totalKeystrokes += 1;
      i += 1;
    }

    const streamText = blocks.map(b => b.compiledPayload).join('');

    return {
      streamText,
      blocks,
      totalKeystrokes,
      zCount,
      kCount,
      hCount,
      aCount,
      altCount: 0, // ALT codes 完全排除 (0件)
      f7Count: kCount,
      f10Count: aCount,
    };
  }

  /**
   * 形態素トークン列からのコンパイル
   * トークン列を長単位結合オートマトンに通してHYBRIDキーストロークを生成
   */
  public compile(tokens: MorphToken[], options: CompileOptions = {}): CompileResult {
    // トークン列の表層文字列を結合してテキストコンパイル（長単位結合オートマトンを完全適用）
    const fullText = tokens.map(t => t.surface).join('');
    return this.compileText(fullText, options);
  }

  /**
   * Web Bluetooth NUS (Nordic UART Service) 送信用バイナリチャンク分割
   */
  public compileToChunks(streamText: string, maxChunkSize: number = 240): Uint8Array[] {
    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(streamText);
    const chunks: Uint8Array[] = [];

    let offset = 0;
    while (offset < fullBytes.length) {
      const end = Math.min(offset + maxChunkSize, fullBytes.length);
      chunks.push(fullBytes.slice(offset, end));
      offset = end;
    }

    return chunks;
  }
}

export const keyStrokeCompiler = new KeyStrokeCompiler();
