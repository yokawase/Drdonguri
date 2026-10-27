// =============================================================================
// File: src/services/KeyStrokeCompiler.ts
// 説明: 長単位結合オートマトン（Sudachi Mode C思想）により熟語のまとまりを保証し、
//       実績のあるv20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）を生成する
//       電カルセーフ決定論的トランスパイラ
// =============================================================================

import { KANA_ROMAJI_MAP, MEDICAL_KANJI_ROMAJI_MAP } from '../utils/japaneseImeTranspiler';
import type { MorphToken } from '../workers/vibrato.worker';
import {
  SAFE_KANJI_SINGLE_CHAR_MAP,
  DANGEROUS_KANJI_DICT,
  DANGEROUS_KANJI_LIST,
  F10_MEDICAL_SYMBOLS,
  synthesizeSafeDecomposition,
  type SafeKanjiSingleChar,
  type DangerousKanjiDefinition,
} from '../constants/safeKanjiMaster';

export {
  SAFE_KANJI_SINGLE_CHAR_MAP,
  DANGEROUS_KANJI_DICT,
  DANGEROUS_KANJI_LIST,
  F10_MEDICAL_SYMBOLS,
  synthesizeSafeDecomposition,
  type SafeKanjiSingleChar,
  type DangerousKanjiDefinition,
};

export type KeyActionType = 'KEY_DOWN' | 'KEY_UP' | 'DELAY';
export interface KeyStrokeAction {
  type: KeyActionType;
  keyCode?: number;     // HID Usage ID
  modifiers?: number;   // 0x02: Shift, 0x00: None
  delayMs?: number;
}

export const MOD_NONE = 0x00;
export const MOD_SHIFT = 0x02;

// HID Keyboard Usage IDs (JIS/Windows標準)
export const HID_USAGE = {
  ENTER: 0x28,
  ESCAPE: 0x29,
  BACKSPACE: 0x2a,
  TAB: 0x2b,
  SPACE: 0x2c,
  MINUS: 0x2d,
  F7: 0x40,
  F10: 0x43,
  // アルファベット
  A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0a, H: 0x0b, I: 0x0c,
  J: 0x0d, K: 0x0e, L: 0x0f, M: 0x10, N: 0x11, O: 0x12, P: 0x13, Q: 0x14, R: 0x15,
  S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1a, X: 0x1b, Y: 0x1c, Z: 0x1d,
  // 数字
  NUM_0: 0x27, NUM_1: 0x1e, NUM_2: 0x1f, NUM_3: 0x20, NUM_4: 0x21,
  NUM_5: 0x22, NUM_6: 0x23, NUM_7: 0x24, NUM_8: 0x25, NUM_9: 0x26,
  // 記号 (JIS)
  PERIOD: 0x37,
  COMMA: 0x36,
  COLON: 0x34,
  SEMICOLON: 0x33,
  KEY_8: 0x25,  // Shift+8 = (
  KEY_9: 0x26,  // Shift+9 = )
};

const _compileCache = new Map<string, CompileResult>();
const MAX_COMPILE_CACHE = 150;

// =============================================================================
// 形態素辞書 (32万語) & JIS漢字テーブルの動的オンデマンド・非同期ローダー
// メインバンドルから巨大辞書（9.7MB）を完全分離し、初期バンドルサイズを8.8MBから<500KBへ激減
// =============================================================================
let _morphRomaji: Record<string, string> = {};
let _morphTags: Record<string, 'G' | 'K' | 'H'> = {};
let _jisKanjiRomaji: Record<string, string> = {};
let _isLexiconLoaded = false;
let _lexiconLoadPromise: Promise<void> | null = null;

export function isLexiconLoaded(): boolean {
  return _isLexiconLoaded;
}

export function ensureLexiconLoaded(): Promise<void> {
  if (_isLexiconLoaded) return Promise.resolve();
  if (!_lexiconLoadPromise) {
    _lexiconLoadPromise = (async () => {
      try {
        const [morphMod, jisMod] = await Promise.all([
          import('../data/morphologicalLexicon'),
          import('../data/jisKanjiRomajiTable'),
        ]);
        _morphRomaji = morphMod.MORPH_ROMAJI || {};
        _morphTags = morphMod.MORPH_TAGS || {};
        _jisKanjiRomaji = jisMod.JIS_KANJI_ROMAJI || {};
        _isLexiconLoaded = true;
        _compileCache.clear();
      } catch (err) {
        console.warn('[KeyStrokeCompiler] 形態素辞書動的ロードエラー (フォールバック使用):', err);
      }
    })();
  }
  return _lexiconLoadPromise;
}

// Node.js テスト環境では即時ロード開始、ブラウザではアイドル時にバックグラウンドプリロード
if (typeof window === 'undefined') {
  ensureLexiconLoaded().catch(() => {});
} else {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      ensureLexiconLoaded().catch(() => {});
    });
  } else {
    setTimeout(() => {
      ensureLexiconLoaded().catch(() => {});
    }, 150);
  }
}

export function katakanaToRomaji(katakana: string): string {
  return kanaToNormalizedRomaji(katakana);
}

export type KeyStrokeMode = 'hybrid' | 'deterministic_only';

export interface CompileOptions {
  mode?: KeyStrokeMode;
  includeImeReset?: boolean;
  newlineMode?: 'enter' | 'ctrl_enter' | 'alt_enter';
  dangerousKanjiDecomposition?: boolean; // 誤変換危険二文字漢字を安全訓読み＋BS削除で100%変換 (デフォルト true)
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
  // ★ 普遍的高精度医療・紹介状・心電図マスター (v4.0)
  '心電図所見': 'sindenzushoken',
  '心電図': 'sindenzu',
  '労作性狭心症': 'rousakuseikyoushinsyou',
  '狭心症': 'kyoushinsyou',
  '心筋虚血': 'shinkinkyoketsu',
  '心筋梗塞': 'shinkinkousoku',
  '非ST上昇型心筋梗塞': 'hiSTjousyougatashinkinkousoku',
  'ST上昇型心筋梗塞': 'STjousyougatashinkinkousoku',
  'ST上昇型': 'STjousyougata',
  'ST低下': 'STteika',
  '水平型ST低下': 'suiheigataSTteika',
  '水平型': 'suiheigata',
  '下降型': 'kakougata',
  '陰性T波': 'inseiTha',
  '対称性陰性T波': 'taishouseiinseiTha',
  'T波陰転化': 'Thaintenka',
  '陰転化': 'intenka',
  '典型所見': 'tenkeishoken',
  '労作時': 'rousakuji',
  '胸部圧迫感': 'kyoubuappakukan',
  '胸部絞扼感': 'kyoubukouyakukan',
  '胸部誘導': 'kyoubuyuudou',
  '左側胸部誘導': 'hidarigawakyoubuyuudou',
  '左側': 'hidarigawa',
  '息切れ': 'ikigire',
  '動悸発作': 'doukihossa',
  '動悸': 'douki',
  '対称性': 'taishousei',
  '臨床判断': 'rinshouhandan',
  'トロポニン': 'toroponin',
  'トロポニン陽性': 'toroponinyousei',
  'BNP測定': 'BNPsokutei',
  '冠動脈CT': 'kandoumyakuCT',
  '冠動脈': 'kandoumyaku',
  '循環器対診': 'junkankitaishin',
  '循環器': 'junkanki',
  '対診': 'taishin',
  '鑑別疾患': 'kambetushikkan',
  '鑑別': 'kambetu',
  '左室肥大': 'sashitsuhidai',
  'ストレイン型ST-T変化': 'sutoreingataST-Thenka',
  'ストレイン型': 'sutoreingata',
  'ジギタリス効果': 'jigitarisukouka',
  'ジギタリス': 'jigitarisu',
  '盆状ST低下': 'bonjouSTteika',
  '盆状': 'bonjou',
  '低カリウム血症': 'teikariumukessyou',
  'カリウム血症': 'kariumukessyou',
  '高カリウム血症': 'koukariumukessyou',
  '陽性': 'yousei',
  '陰性': 'insei',
  '疑い': 'utagai',

  // 診療情報提供書・紹介状・時候挨拶・退院サマリー
  '医療提供体制': 'iryouteikyoutaisei',
  '診療情報提供書': 'shinryoujouhouteikyousho',
  '情報提供書': 'jouhouteikyousho',
  '退院時サマリードラフト': 'taiinjisamari-dorafuto',
  '退院時サマリー': 'taiinjisamari-',
  '退院時': 'taiinji',
  'サマリードラフト': 'samari-dorafuto',
  '拝啓時下': 'haikeijika',
  '拝啓': 'haikei',
  '時下': 'jika',
  'ご清祥': 'goseishou',
  '清祥': 'seishou',
  'お慶び申し上げます': 'oyorokobimoushiagemasu',
  'お慶び': 'oyorokobi',
  '平素より': 'heisoyori',
  '平素': 'heiso',
  '格別のご高配': 'kakubetsunogokouhai',
  'ご高配': 'gokouhai',
  '高配': 'kouhai',
  '格別': 'kakubetsu',
  '厚く御礼申し上げます': 'atsukuonreimoushiagemasu',
  '厚く御礼': 'atsukuonrei',
  '御礼': 'onrei',
  '今般': 'kompan',
  '患者様': 'kanjasama',
  '専門的精査': 'semmontekiseisa',
  '精査加療': 'seisakaryou',
  '専門的': 'semmonteki',
  '精査': 'seisa',
  '加療': 'karyou',
  'ご加療': 'gokaryou',
  'ご紹介': 'goshoukai',
  '傷病名': 'shoubyoumei',
  '対象疾患': 'taishoushikkan',
  '紹介目的': 'shoukaimokuteki',
  '目的': 'mokuteki',
  '今後の方針': 'kongonohoushin',
  '方針': 'houshin',
  'ご高診': 'gokoushin',
  '高診': 'koushin',
  'お願い申し上げます': 'onegaimoushiagemasu',
  'お願い': 'onegai',
  '常用薬': 'jouyouyaku',
  '重篤な': 'juutokuna',
  '重篤': 'juutoku',
  'アレルギーなし': 'arerugi-nashi',
  '症状経過': 'syoujyoukeika',
  '疼痛あり': 'toutuuari',
  '疼痛なし': 'toutuunashi',
  '少しあり': 'sukoshiari',
  'アセトアミノフェン錠': 'asetoaminofenjou',
  '現在の処方': 'genzainoshohou',
  '身体所見': 'shintaishoken',
  '検査所見': 'kensashoken',
  '特記異常所見なし': 'tokkiijyoushokennashi',
  '特記異常所見': 'tokkiijyoushoken',
  '異常所見': 'ijyoushoken',
  '治療経過': 'chiryoukeika',
  'ご多忙中': 'gotabouchuu',
  '多忙中': 'tabouchuu',
  '恐れ入りますが': 'osoreirimasuga',
  '何卒': 'nanitozo',
  '敬具': 'keigu',

  // 臨床実例完全適合
  '先週': 'sensyuu',
  '背中': 'senaka',
  '疼痛': 'toutuu',
  '体': 'karada',
  '身体': 'shintai',
  '体動': 'taidou',
  '体動時': 'taidouji',
  '増悪': 'zouaku',
  'アルコール': 'aruko-ru',
  '肝機能障害': 'kankinousyougai',
  '性肝機能障害': 'seikankinousyougai',
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
  '処方': 'shohou',

  // 内視鏡・消化器・病変・臨床判断 (ユーザー提示症例完全適合)
  '内視鏡所見': 'naishikyousyoken',
  '内視鏡': 'naishikyou',
  '拡大内視鏡': 'kakudainaishikyou',
  '所見': 'syoken',
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
  '放散痛': 'housantsuu',
  '胸部絞扼痛': 'kyoubukouyakutsuu',
  '湿性ラ音': 'sisseiraon',
  '乾性ラ音': 'kanseiraon',
  '乾性咳嗽': 'kanseigaisou',
  '湿性咳嗽': 'sisseigaisou',
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

// 医療専門語彙辞書 (MEDICAL_KANJI_ROMAJI_MAP) を COMPOUND_LEXICON へ安全にマージ
// ※助詞付きフレーズ・空白入り複文・カタカナ混在・記号混入エントリを厳格に除外し、純粋な漢字熟語のみを登録
const TRAILING_PARTICLE_REGEX = /(?:から|まで|より|にて|には|では|への|との|での|にも|を|に|が|は|で|と|へ|の|も|や)$/;
for (const [term, romaji] of Object.entries(MEDICAL_KANJI_ROMAJI_MAP)) {
  const cleanRomaji = romaji.trim();
  if (
    !COMPOUND_LEXICON[term] &&
    term.length >= 2 &&
    term.length <= 12 &&
    /^[\u4E00-\u9FFF\u3005]+$/.test(term) &&
    !TRAILING_PARTICLE_REGEX.test(term) &&
    /^[a-z\-]+$/.test(cleanRomaji)
  ) {
    COMPOUND_LEXICON[term] = cleanRomaji;
  }
}

export type MultiChunkItem = {
  tag: 'Z' | 'K' | 'H' | 'A' | 'G' | 'BS' | 'space' | 'control';
  text: string;
  romaji: string;
};

// -----------------------------------------------------------------------------
// MS-IME / ATOK / Google日本語入力 すべてで「100%決定論的変換」を保証する
// 最適チャンク分割 ＆ 複合語アンカー＋Backspace ([BS]) 辞書
// -----------------------------------------------------------------------------
export const MULTI_CHUNK_LEXICON: Record<string, Array<MultiChunkItem>> = {
  // ===========================================================================
  // ★ 誤変換防止5大ルール: 診療情報提供書・紹介状・サマリー完全適応
  // ===========================================================================
  // 法則④: 公的レジストリ複合語打鍵（厚労省公式名称で一括確定・「提供所」誤変換根絶）
  '診療情報提供書': [
    { tag: 'Z', text: '診療情報提供書', romaji: 'shinryoujouhouteikyousho' },
  ],
  '情報提供書': [
    { tag: 'Z', text: '情報提供書', romaji: 'jouhouteikyousho' },
  ],

  // 法則①: 最長一致キラー（「専門的」＋「精査」を医療境界で物理遮断し「適正さ」誤爆を完全阻止）
  '専門的精査': [
    { tag: 'Z', text: '専門的', romaji: 'semmonteki' },
    { tag: 'Z', text: '精査', romaji: 'seisa' },
  ],
  '専門的加療': [
    { tag: 'Z', text: '専門的', romaji: 'semmonteki' },
    { tag: 'Z', text: '加療', romaji: 'karyou' },
  ],
  '初期精査': [
    { tag: 'Z', text: '初期', romaji: 'shoki' },
    { tag: 'Z', text: '精査', romaji: 'seisa' },
  ],
  '精査加療': [
    { tag: 'Z', text: '精査', romaji: 'seisa' },
    { tag: 'Z', text: '加療', romaji: 'karyou' },
  ],
  '対症療法': [
    { tag: 'Z', text: '対症', romaji: 'taisyou' },
    { tag: 'Z', text: '療法', romaji: 'ryouhou' },
  ],

  // 法則③: 長単位コロケーション打鍵（手紙・紹介状の格式ある漢字を強制召喚）
  '厚く御礼申し上げます': [
    { tag: 'Z', text: '厚く御礼', romaji: 'atsukuonrei' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  '厚く御礼': [
    { tag: 'Z', text: '厚く御礼', romaji: 'atsukuonrei' },
  ],
  'お慶び申し上げます': [
    { tag: 'Z', text: 'お慶び', romaji: 'oyorokobi' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'のこととお慶び申し上げます': [
    { tag: 'H', text: 'のことと', romaji: 'nokototo' },
    { tag: 'Z', text: 'お慶び', romaji: 'oyorokobi' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'こととお慶び申し上げます': [
    { tag: 'H', text: 'ことと', romaji: 'kototo' },
    { tag: 'Z', text: 'お慶び', romaji: 'oyorokobi' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'こととお慶び': [
    { tag: 'H', text: 'ことと', romaji: 'kototo' },
    { tag: 'Z', text: 'お慶び', romaji: 'oyorokobi' },
  ],
  'お慶び': [
    { tag: 'Z', text: 'お慶び', romaji: 'oyorokobi' },
  ],
  '格別のご高配': [
    { tag: 'Z', text: '格別', romaji: 'kakubetsu' },
    { tag: 'H', text: 'の', romaji: 'no' },
    { tag: 'Z', text: 'ご高配', romaji: 'gokouhai' },
  ],
  'ご清祥': [
    { tag: 'Z', text: 'ご清祥', romaji: 'goseishou' },
  ],
  '何卒ご高診': [
    { tag: 'Z', text: '何卒', romaji: 'nanitozo' },
    { tag: 'Z', text: 'ご高診', romaji: 'gokoushin' },
  ],
  'ご高診のお願い': [
    { tag: 'Z', text: 'ご高診', romaji: 'gokoushin' },
    { tag: 'H', text: 'の', romaji: 'no' },
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
  ],
  'お願いしたくご紹介申し上げます': [
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
    { tag: 'H', text: 'したく', romaji: 'shitaku' },
    { tag: 'Z', text: 'ご紹介', romaji: 'goshoukai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'お願い申し上げます': [
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'のほどよろしくお願い申し上げます': [
    { tag: 'H', text: 'のほどよろしく', romaji: 'nohodoyoroshiku' },
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'ほどよろしくお願い申し上げます': [
    { tag: 'H', text: 'ほどよろしく', romaji: 'hodoyoroshiku' },
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'よろしくお願い申し上げます': [
    { tag: 'H', text: 'よろしく', romaji: 'yoroshiku' },
    { tag: 'Z', text: 'お願い', romaji: 'onegai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  'ご紹介申し上げます': [
    { tag: 'Z', text: 'ご紹介', romaji: 'goshoukai' },
    { tag: 'Z', text: '申し上げます', romaji: 'moushiagemasu' },
  ],
  '恐れ入りますが': [
    { tag: 'Z', text: '恐れ入りますが', romaji: 'osoreirimasuga' },
  ],

  // 法則⑤: 完全同音異義語コントロール（健診 vs 検診）
  // 「健診」はMS-IME初期順位で第2候補となるため [G] (Space 2回 ➔ Enter) で第2候補「健診」を1発確定！
  '健診': [
    { tag: 'G', text: '健診', romaji: 'kennsinn' },
  ],
  // 「検診」は第1候補なので通常 [Z] (Space 1回 ➔ Enter)
  '検診': [
    { tag: 'Z', text: '検診', romaji: 'kennsinn' },
  ],

  // ★ 英数混在医療フレーズ (英字は[A]直接送出、漢字は決定論的Space確定)
  '非ST上昇型心筋梗塞': [
    { tag: 'G', text: '非', romaji: 'hi' },
    { tag: 'A', text: 'ST', romaji: 'ST' },
    { tag: 'Z', text: '上昇型心筋梗塞', romaji: 'jousyougatashinkinkousoku' },
  ],
  '水平型ST低下': [
    { tag: 'Z', text: '水平型', romaji: 'suiheigata' },
    { tag: 'A', text: 'ST', romaji: 'ST' },
    { tag: 'Z', text: '低下', romaji: 'teika' },
  ],
  '盆状ST低下': [
    { tag: 'Z', text: '盆状', romaji: 'bonjou' },
    { tag: 'A', text: 'ST', romaji: 'ST' },
    { tag: 'Z', text: '低下', romaji: 'teika' },
  ],
  '陰性T波': [
    { tag: 'Z', text: '陰性', romaji: 'insei' },
    { tag: 'A', text: 'T', romaji: 'T' },
    { tag: 'Z', text: '波', romaji: 'ha' },
  ],
  'T波陰転化': [
    { tag: 'A', text: 'T', romaji: 'T' },
    { tag: 'Z', text: '波', romaji: 'ha' },
    { tag: 'Z', text: '陰転化', romaji: 'intenka' },
  ],
  '冠動脈CT': [
    { tag: 'Z', text: '冠動脈', romaji: 'kandoumyaku' },
    { tag: 'A', text: 'CT', romaji: 'CT' },
  ],
  'ストレイン型ST-T変化': [
    { tag: 'K', text: 'ストレイン', romaji: 'sutoreinn' },
    { tag: 'Z', text: '型', romaji: 'gata' },
    { tag: 'A', text: 'ST-T', romaji: 'ST-T' },
    { tag: 'Z', text: '変化', romaji: 'hennka' },
  ],
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
  // 扁桃（「返答」誤変換を100%防ぐため「扁桃腺」アンカー＋[BS]で決定論的確定）
  '扁桃腫大': [
    { tag: 'Z', text: '扁桃', romaji: 'henntou' },
    { tag: 'Z', text: '腫大', romaji: 'syudai' },
  ],
  '扁桃肥大': [
    { tag: 'Z', text: '扁桃', romaji: 'henntou' },
    { tag: 'Z', text: '肥大', romaji: 'hidai' },
  ],
  '扁桃白苔': [
    { tag: 'Z', text: '扁桃', romaji: 'henntou' },
    { tag: 'Z', text: '白苔', romaji: 'hakutai' },
  ],
  '扁桃炎': [
    { tag: 'Z', text: '扁桃炎', romaji: 'henntouenn' },
  ],
  '扁桃': [
    { tag: 'Z', text: '扁桃', romaji: 'henntou' },
  ],
  '腫大': [
    { tag: 'Z', text: '腫大', romaji: 'syudai' },
  ],
  // 聴診・身体所見の単漢字（「清」「整」「純」「軟」の同音異義語誤変換を100%排除）
  '呼吸音清': [
    { tag: 'Z', text: '呼吸音', romaji: 'kokyuuonn' },
    { tag: 'Z', text: '清', romaji: 'sei' },
  ],
  '心音整': [
    { tag: 'Z', text: '心音', romaji: 'sinnonn' },
    { tag: 'Z', text: '整', romaji: 'sei' },
  ],
  '心音純': [
    { tag: 'Z', text: '心音', romaji: 'sinnonn' },
    { tag: 'Z', text: '純', romaji: 'junn' },
  ],
  '平坦・軟': [
    { tag: 'Z', text: '平坦', romaji: 'heitann' },
    { tag: 'H', text: '・', romaji: '・' },
    { tag: 'Z', text: '軟', romaji: 'nann' },
  ],
  '平坦、軟': [
    { tag: 'Z', text: '平坦', romaji: 'heitann' },
    { tag: 'H', text: '、', romaji: '、' },
    { tag: 'Z', text: '軟', romaji: 'nann' },
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
  '朝食後': [
    { tag: 'Z', text: '朝食', romaji: 'tyousyoku' },
    { tag: 'Z', text: '後', romaji: 'ato' },
  ],
  '昼食後': [
    { tag: 'Z', text: '昼食', romaji: 'tyuusyoku' },
    { tag: 'Z', text: '後', romaji: 'ato' },
  ],
  '夕食後': [
    { tag: 'Z', text: '夕食', romaji: 'yuusyoku' },
    { tag: 'Z', text: '後', romaji: 'ato' },
  ],
  '就寝前': [
    { tag: 'Z', text: '就寝', romaji: 'syuusinn' },
    { tag: 'Z', text: '前', romaji: 'mae' },
  ],
  '再診指示': [
    { tag: 'Z', text: '再診', romaji: 'saisinn' },
    { tag: 'Z', text: '指示', romaji: 'siji' },
  ],
  // カタカナ混在医学用語の決定論的 [Z]+[K]+[Z] 分解
  '高カリウム血症': [
    { tag: 'Z', text: '高カリウム血症', romaji: 'koukariumukessyou' },
  ],
  '低カリウム血症': [
    { tag: 'Z', text: '低カリウム血症', romaji: 'teikariumukessyou' },
  ],
  '頸部リンパ節腫脹': [
    { tag: 'Z', text: '頸部', romaji: 'keibu' },
    { tag: 'K', text: 'リンパ', romaji: 'rinnpa' },
    { tag: 'Z', text: '節', romaji: 'setu' },
    { tag: 'Z', text: '腫脹', romaji: 'syutyou' },
  ],
  '湿性ラ音': [
    { tag: 'Z', text: '湿性', romaji: 'sissei' },
    { tag: 'K', text: 'ラ', romaji: 'ra' },
    { tag: 'Z', text: '音', romaji: 'oto' },
  ],
  '乾性ラ音': [
    { tag: 'Z', text: '乾性', romaji: 'kannsei' },
    { tag: 'K', text: 'ラ', romaji: 'ra' },
    { tag: 'Z', text: '音', romaji: 'oto' },
  ],
  'ラ音': [
    { tag: 'K', text: 'ラ', romaji: 'ra' },
    { tag: 'Z', text: '音', romaji: 'oto' },
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
    { tag: 'Z', text: '瘢痕期', romaji: 'hankonki' },
  ],
  '胃良性ポリープ': [
    { tag: 'Z', text: '胃良性ポリープ', romaji: 'iryouseipori-pu' },
  ],
  '胃角部小弯': [
    { tag: 'Z', text: '胃角部', romaji: 'ikakubu' },
    { tag: 'Z', text: '小弯', romaji: 'shouwan' },
  ],
  '前庭部': [
    { tag: 'Z', text: '前庭部', romaji: 'zenteibu' },
  ],
  '精査要': [
    { tag: 'Z', text: '精査要', romaji: 'seisayou' },
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
    { tag: 'Z', text: '除外要', romaji: 'jogaiyou' },
  ],
  '除外': [
    { tag: 'Z', text: '除外', romaji: 'jogai' },
  ],
  '鎮痛薬処方': [
    { tag: 'Z', text: '鎮痛薬処方', romaji: 'chintuuyakushohou' },
  ],
  '処方': [
    { tag: 'Z', text: '処方', romaji: 'shohou' },
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

// F10バイパス対象 医療英数シンボルマスター（木村・竹本分類、TNM分類、深達度、Stage病期分類、ピロリ判定記号等）を統合
for (const [sym, chunks] of Object.entries(F10_MEDICAL_SYMBOLS)) {
  if (!MULTI_CHUNK_LEXICON[sym]) {
    MULTI_CHUNK_LEXICON[sym] = chunks;
  }
}

// 最長一致を保証するため MULTI_CHUNK_LEXICON をキー文字数降順で事前ソート
const SORTED_MULTI_CHUNK_ENTRIES = Object.entries(MULTI_CHUNK_LEXICON).sort(
  (a, b) => b[0].length - a[0].length
);

// -----------------------------------------------------------------------------
// 単独出現した1文字漢字（所見・単位・臓器名等）の同音異義語誤爆を100%防ぐ
// 「一意熟語アンカー ＋ Backspace ([BS])」決定論的辞書
// ※2文字以上の熟語にマッチしなかった単独1文字漢字のみに適用される
// -----------------------------------------------------------------------------
export const SINGLE_KANJI_DETERMINISTIC_ANCHORS: Record<string, Array<MultiChunkItem>> = {
  // 姑息なBackspace削り出しを完全撤廃し、純粋な音読み決定論的ブロックとして直接送出
  '整': [{ tag: 'Z', text: '整', romaji: 'sei' }],
  '清': [{ tag: 'Z', text: '清', romaji: 'sei' }],
  '軟': [{ tag: 'Z', text: '軟', romaji: 'nann' }],
  '純': [{ tag: 'Z', text: '純', romaji: 'junn' }],
  '錠': [{ tag: 'Z', text: '錠', romaji: 'jyou' }],
  '包': [{ tag: 'Z', text: '包', romaji: 'hou' }],
  '回': [{ tag: 'Z', text: '回', romaji: 'kai' }],
  '胃': [{ tag: 'Z', text: '胃', romaji: 'i' }],
  '腸': [{ tag: 'Z', text: '腸', romaji: 'tyou' }],
  '肝': [{ tag: 'Z', text: '肝', romaji: 'kann' }],
  '腎': [{ tag: 'Z', text: '腎', romaji: 'jinn' }],
  '肺': [{ tag: 'Z', text: '肺', romaji: 'hai' }],
  '脳': [{ tag: 'Z', text: '脳', romaji: 'nou' }],
  '咽': [{ tag: 'Z', text: '咽', romaji: 'inn' }],
  '腫': [{ tag: 'Z', text: '腫', romaji: 'syu' }],
  '診': [{ tag: 'Z', text: '診', romaji: 'sinn' }],
  '症': [{ tag: 'Z', text: '症', romaji: 'syou' }],
  '炎': [{ tag: 'Z', text: '炎', romaji: 'enn' }],
  '痛': [{ tag: 'Z', text: '痛', romaji: 'tuu' }],
  '夕': [{ tag: 'Z', text: '夕', romaji: 'yuu' }],
  '眠': [{ tag: 'Z', text: '眠', romaji: 'minn' }],
  '両': [{ tag: 'Z', text: '両', romaji: 'ryou' }],
  '軽': [{ tag: 'Z', text: '軽', romaji: 'kei' }],
  '重': [{ tag: 'Z', text: '重', romaji: 'jyuu' }],
  '高': [{ tag: 'Z', text: '高', romaji: 'kou' }],
  '低': [{ tag: 'Z', text: '低', romaji: 'tei' }],
  '強': [{ tag: 'Z', text: '強', romaji: 'kyou' }],
  '弱': [{ tag: 'Z', text: '弱', romaji: 'jyaku' }],
  '良': [{ tag: 'Z', text: '良', romaji: 'ryou' }],
  '可': [{ tag: 'Z', text: '可', romaji: 'ka' }],
  '要': [{ tag: 'Z', text: '要', romaji: 'you' }],
  '陥': [{ tag: 'Z', text: '陥', romaji: 'kann' }],
  '凹': [{ tag: 'Z', text: '凹', romaji: 'ou' }],
  '敬': [{ tag: 'Z', text: '敬', romaji: 'kei' }],
  '書': [{ tag: 'Z', text: '書', romaji: 'syo' }],
  '対': [{ tag: 'Z', text: '対', romaji: 'tai' }],
  '陰': [{ tag: 'Z', text: '陰', romaji: 'inn' }],
  '具': [{ tag: 'Z', text: '具', romaji: 'gu' }],
  '処': [{ tag: 'Z', text: '処', romaji: 'syo' }],
  '篤': [{ tag: 'Z', text: '篤', romaji: 'toku' }],
  '咳': [{ tag: 'Z', text: '咳', romaji: 'seki' }],
  '喉': [{ tag: 'Z', text: '喉', romaji: 'nodo' }],
  '波': [{ tag: 'Z', text: '波', romaji: 'ha' }],
  '非': [{ tag: 'Z', text: '非', romaji: 'hi' }],
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

// 法則②: 数詞＋助数詞の膠着一体変換マスター（助数詞の単独孤立・誤爆防止）
// 例: 「60歳」➔ [Z]60sai[/Z], 「38度」➔ [Z]38do[/Z], 「1回」➔ [Z]1kai[/Z], 「2錠」➔ [Z]2jyou[/Z]
export const COUNTER_SUFFIX_ROMAJI: Record<string, string> = {
  '歳': 'sai',
  '才': 'sai',
  '日': 'niti',
  '回': 'kai',
  '錠': 'jyou',
  '度': 'do',
  '分': 'hunn',
  '秒': 'byou',
  '年': 'nenn',
  '人': 'ninn',
  '名': 'mei',
  '個': 'ko',
  '包': 'hou',
  '本': 'honn',
  '枚': 'mai',
  '倍': 'bai',
  '点': 'tenn',
  '割': 'wari',
  '台': 'dai',
  '匹': 'hiki',
  '頭': 'tou',
  '足': 'soku',
  '羽': 'wa',
  '滴': 'teki',
  '管': 'kann',
  '袋': 'hukuro',
  '箱': 'hako',
  '缶': 'kann',
  '組': 'kumi',
  '件': 'kenn',
  '発': 'hatu',
  '番': 'bann',
  '号': 'gou',
};

// 付属語・助詞・述部（[H] Enter即時確定）
export const PARTICLES = new Set([
  'から', 'まで', 'が', 'を', 'に', 'へ', 'と', 'より', 'で', 'の', 'は', 'も', 'や',
  'など', 'あり', 'なし', 'です', 'ます', 'でした', 'ました', 'ない', 'ぬ', 'ば',
  'ので', 'のに', 'けど', 'けれど', 'ながら', 'つつ', 'すと', 'して', 'され', 'せる', 'た', 'て',
  'するも', 'する', 'した', 'したく', 'たく', 'すべく', 'すべき', 'された', 'および', 'または', 'にて', 'のみ',
  'つきまして', 'につきまして', 'について', 'により', 'とともに', 'とともに', 'にあたり'
]);

// 最長一致を保証するため文字数降順でソート
export const SORTED_PARTICLES = Array.from(PARTICLES).sort((a, b) => b.length - a.length);

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

const FULLWIDTH_ASCII_REPLACE: Record<string, string> = {
  '〜': '~', '～': '~',
  '＆': '&',
  '（': '(', '）': ')',
  '［': '[', '］': ']',
  '｛': '{', '｝': '}',
  '：': ':', '；': ';',
  '／': '/',
  '＋': '+', '−': '-', '＝': '=', '＊': '*',
  '％': '%', '＃': '#', '＠': '@', '｜': '|',
  '！': '!', '？': '?',
  '　': ' ',
};

type KanjiRomajiSegment = {
  text: string;
  romaji: string | null;
};

function isSafeRomajiPayload(romaji: string | undefined): romaji is string {
  return !!romaji && /^[A-Za-z0-9-]+$/.test(romaji);
}

function resolveSingleKanjiRomaji(kanji: string): string | undefined {
  const anchors = SINGLE_KANJI_DETERMINISTIC_ANCHORS[kanji];
  if (
    anchors &&
    anchors.length > 0 &&
    anchors.every(chunk => chunk.tag === 'Z' && isSafeRomajiPayload(chunk.romaji))
  ) {
    return anchors.map(chunk => chunk.romaji).join('');
  }

  const candidates: Array<string | undefined> = [
    COMPOUND_LEXICON[kanji],
    _morphRomaji[kanji],
    _jisKanjiRomaji[kanji],
    ONYOMI_KANJI_FALLBACK[kanji],
  ];
  if (MEDICAL_SUFFIXES.includes(kanji)) {
    candidates.push(SUFFIX_READING[kanji]);
  }
  return candidates.find(isSafeRomajiPayload);
}

function segmentKanjiText(kanjiText: string): KanjiRomajiSegment[] {
  const segments: KanjiRomajiSegment[] = [];
  let offset = 0;

  while (offset < kanjiText.length) {
    let matchedSegment = false;

    // 既存の H-1 / H-1.5 と同じ優先順位で、熟語辞書を最長一致で探索する
    for (let length = Math.min(24, kanjiText.length - offset); length >= 2; length--) {
      const sub = kanjiText.substring(offset, offset + length);
      const compoundRomaji = COMPOUND_LEXICON[sub];
      const morphRomaji = _morphRomaji[sub];
      const romaji = isSafeRomajiPayload(compoundRomaji)
        ? compoundRomaji
        : isSafeRomajiPayload(morphRomaji)
          ? morphRomaji
          : undefined;

      if (romaji) {
        segments.push({ text: sub, romaji });
        offset += length;
        matchedSegment = true;
        break;
      }
    }
    if (matchedSegment) continue;

    const currentKanji = kanjiText[offset];
    const singleRomaji = resolveSingleKanjiRomaji(currentKanji);
    segments.push({
      text: currentKanji,
      romaji: singleRomaji || null,
    });
    offset += 1;
  }

  return segments;
}

export class KeyStrokeCompiler {
  /**
   * テキストを「長単位結合オートマトン」で解析し、v20.1 HYBRID打鍵ストリームへコンパイル
   */
  public compileText(text: string, options: CompileOptions = {}): CompileResult {
    const includeImeReset = options.includeImeReset !== false;
    const newlineMode = options.newlineMode || 'enter';
    const dangerousKanjiDecomposition = options.dangerousKanjiDecomposition !== false;
    const cacheKey = `${includeImeReset ? '1' : '0'}:${newlineMode}:${dangerousKanjiDecomposition ? '1' : '0'}:${text}`;
    const cached = _compileCache.get(cacheKey);
    if (cached) return cached;

    const blocks: KeyStrokeBlock[] = [];
    let zCount = 0;
    let kCount = 0;
    let hCount = 0;
    let aCount = 0;
    let totalKeystrokes = 0;

    const appendChunkItems = (chunks: Array<MultiChunkItem>) => {
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
          totalKeystrokes += chunk.romaji.length + 3;
        } else if (chunk.tag === 'BS') {
          blocks.push({
            type: 'control',
            tag: 'BS',
            rawText: chunk.text,
            compiledPayload: '[BS]',
          });
          totalKeystrokes += 1;
        } else if ((chunk.tag as string) === 'space') {
          blocks.push({
            type: 'space',
            tag: 'space',
            rawText: chunk.text || ' ',
            compiledPayload: ' ',
          });
          totalKeystrokes += 1;
        } else if ((chunk.tag as string) === 'control') {
          blocks.push({
            type: 'control',
            tag: 'control',
            rawText: chunk.text,
            compiledPayload: chunk.romaji,
          });
          totalKeystrokes += 1;
        }
      }
    };

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

      // B-2. 全角記号 (〜, ＆, （, ）, ：, ／ 等) ➔ 半角ASCII化して [A] 送出
      const fwChar = remaining[0];
      if (FULLWIDTH_ASCII_REPLACE[fwChar]) {
        const asciiChar = FULLWIDTH_ASCII_REPLACE[fwChar];
        if (asciiChar === ' ') {
          blocks.push({ type: 'space', tag: 'space', rawText: ' ', compiledPayload: ' ' });
          totalKeystrokes += 1;
        } else {
          blocks.push({ type: 'a_ascii', tag: 'A', rawText: fwChar, compiledPayload: `[A]${asciiChar}[/A]` });
          aCount++;
          totalKeystrokes += 1;
        }
        i += 1;
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
        hCount++;
        totalKeystrokes += 2;
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
          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: rule.stemSurface,
            compiledPayload: `[Z]${rule.stemRomaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += rule.stemRomaji.length + 2;

          blocks.push({
            type: 'h_hiragana',
            tag: 'H',
            rawText: rule.endingSurface,
            compiledPayload: `[H]${rule.endingRomaji}[/H]`,
          });
          hCount++;
          totalKeystrokes += rule.endingRomaji.length + 1;

          i += rule.stemSurface.length + rule.endingSurface.length;
          matchedVerb = true;
          break;
        }
      }
      if (matchedVerb) continue;

      // D-2. 最長一致マルチチャンク最適分解 ＆ 5大誤変換防止ルール探索 (最優先実行)
      let matchedMultiChunk = false;
      for (const [phrase, chunks] of SORTED_MULTI_CHUNK_ENTRIES) {
        if (remaining.startsWith(phrase)) {
          appendChunkItems(chunks);
          i += phrase.length;
          matchedMultiChunk = true;
          break;
        }
      }
      if (matchedMultiChunk) continue;

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
        totalKeystrokes += kataRomaji.length + 2;

        const combinedKanji = '性' + kanjiPart;
        const compoundCombinedRomaji = COMPOUND_LEXICON[combinedKanji];
        const morphCombinedRomaji = _morphRomaji[combinedKanji];
        const compoundKanjiRomaji = COMPOUND_LEXICON[kanjiPart];
        const morphKanjiRomaji = _morphRomaji[kanjiPart];

        let combinedRomaji: string | undefined;
        if (isSafeRomajiPayload(compoundCombinedRomaji)) {
          combinedRomaji = compoundCombinedRomaji;
        } else if (isSafeRomajiPayload(morphCombinedRomaji)) {
          combinedRomaji = morphCombinedRomaji;
        } else if (isSafeRomajiPayload(compoundKanjiRomaji)) {
          combinedRomaji = `sei${compoundKanjiRomaji}`;
        } else if (isSafeRomajiPayload(morphKanjiRomaji)) {
          combinedRomaji = `sei${morphKanjiRomaji}`;
        }

        if (combinedRomaji) {
          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: combinedKanji,
            compiledPayload: `[Z]${combinedRomaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += combinedRomaji.length + 2;
        } else {
          const kanjiSegments = segmentKanjiText(kanjiPart);

          if (kanjiSegments.every(segment => segment.romaji)) {
            const segmentedRomaji = `sei${kanjiSegments.map(segment => segment.romaji).join('')}`;
            blocks.push({
              type: 'z_kanji',
              tag: 'Z',
              rawText: combinedKanji,
              compiledPayload: `[Z]${segmentedRomaji}[/Z]`,
            });
            zCount++;
            totalKeystrokes += segmentedRomaji.length + 2;
          } else {
            // 読みを確定できない漢字を [Z] のローマ字ペイロードへ混入させない。
            // 解決できた部分は [Z]、未解決部分は未知文字と同じ raw ブロックで送る。
            blocks.push({
              type: 'z_kanji',
              tag: 'Z',
              rawText: '性',
              compiledPayload: '[Z]sei[/Z]',
            });
            zCount++;
            totalKeystrokes += 'sei'.length + 2;

            let unresolvedText = '';
            const appendUnresolvedText = () => {
              if (!unresolvedText) return;
              blocks.push({
                type: 'raw',
                tag: 'raw',
                rawText: unresolvedText,
                compiledPayload: unresolvedText,
              });
              totalKeystrokes += unresolvedText.length;
              unresolvedText = '';
            };

            for (const segment of kanjiSegments) {
              if (segment.romaji) {
                appendUnresolvedText();
                blocks.push({
                  type: 'z_kanji',
                  tag: 'Z',
                  rawText: segment.text,
                  compiledPayload: `[Z]${segment.romaji}[/Z]`,
                });
                zCount++;
                totalKeystrokes += segment.romaji.length + 2;
              } else {
                unresolvedText += segment.text;
              }
            }
            appendUnresolvedText();
          }
        }

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

      // G-0. 【法則② 密結合打鍵】数詞＋助数詞の膠着一体変換（助数詞の単独孤立・差異誤爆防止）
      // 例: 「60歳」➔ [Z]60sai[/Z], 「38度」➔ [Z]38do[/Z], 「2錠」➔ [Z]2jyou[/Z], 「3日」➔ [Z]3niti[/Z]
      const numCounterMatch = remaining.match(/^([0-9０-９]+(?:\.[0-9０-９]+)?)(歳|才|日|回|錠|度|分|秒|年|人|名|個|包|本|枚|倍|点|割|台|匹|頭|足|羽|滴|管|袋|箱|缶|組|件|発|番|号)/);
      if (numCounterMatch) {
        const fullMatched = numCounterMatch[0];
        const rawDigits = numCounterMatch[1];
        const counterChar = numCounterMatch[2];
        const counterRomaji = COUNTER_SUFFIX_ROMAJI[counterChar];
        if (counterRomaji) {
          // 全角数字を半角数字へ正規化
          const asciiDigits = rawDigits.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
          const payload = `${asciiDigits}${counterRomaji}`;
          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: fullMatched,
            compiledPayload: `[Z]${payload}[/Z]`,
          });
          zCount++;
          totalKeystrokes += payload.length + 2;
          i += fullMatched.length;
          continue;
        }
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

      // H. 熟語・複合名詞・接尾辞結合オートマトン (Mode C) ＆ 静的キルスイッチ辞書

      // H-1. 3文字以上の臨床・検証済み長単位辞書 (COMPOUND_LEXICON >= 3文字) を最優先探索
      // （「労作性狭心症」「慢性萎縮性胃炎」「早期胃癌」「胃潰瘍」等の長単位複合語は最短ストロークで軽快に入力）
      let matchedLongCompound = false;
      for (let l = Math.min(24, remaining.length); l >= 3; l--) {
        const sub = remaining.substring(0, l);
        if (COMPOUND_LEXICON[sub]) {
          let compound = sub;
          let romaji = COMPOUND_LEXICON[sub];
          let offset = l;

          if (offset < remaining.length) {
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

          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: compound,
            compiledPayload: `[Z]${romaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += romaji.length + 2;
          i += offset;
          matchedLongCompound = true;
          break;
        }
      }
      if (matchedLongCompound) continue;

      // H-2. 【レイヤー1: 静的キルスイッチ辞書 DANGEROUS_KANJI_DICT】
      // 単独出現した誤変換危険二文字単語（休薬、減量、生検、萎縮、低値、禁忌 等）を
      // 「漢字単体 ➔ 安全訓読み＋BS削除」で安全分解し、変換率100%を保証
      if (dangerousKanjiDecomposition && remaining.length >= 2) {
        const twoChars = remaining.substring(0, 2);
        const safeChunks = DANGEROUS_KANJI_DICT[twoChars];
        if (safeChunks) {
          appendChunkItems(safeChunks);
          i += 2;
          continue;
        }
      }

      // H-3. 既存の2文字臨床熟語 (COMPOUND_LEXICON == 2文字) 探索
      // （背中、普通、今日、受診 等の通常語彙を最短ストロークで高速打鍵）
      if (remaining.length >= 2) {
        const sub2 = remaining.substring(0, 2);
        if (COMPOUND_LEXICON[sub2]) {
          let compound = sub2;
          let romaji = COMPOUND_LEXICON[sub2];
          let offset = 2;

          if (offset < remaining.length) {
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

          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: compound,
            compiledPayload: `[Z]${romaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += romaji.length + 2;
          i += offset;
          continue;
        }
      }

      // H-1.5. 12.6万語大規模形態素辞書 (2文字以上の複合語・活用語を優先マッチング)
      let matchedMorphLexicon = false;
      for (let l = Math.min(16, remaining.length); l >= 2; l--) {
        const sub = remaining.substring(0, l);
        if (_morphRomaji[sub]) {
          const romaji = _morphRomaji[sub];
          const tag = _morphTags[sub] || 'Z';

          if (tag === 'K') {
            blocks.push({
              type: 'k_katakana',
              tag: 'K',
              rawText: sub,
              compiledPayload: `[K]${romaji}[/K]`,
            });
            kCount++;
            totalKeystrokes += romaji.length + 2;
          } else if (tag === 'H') {
            blocks.push({
              type: 'h_hiragana',
              tag: 'H',
              rawText: sub,
              compiledPayload: `[H]${romaji}[/H]`,
            });
            hCount++;
            totalKeystrokes += romaji.length + 1;
          } else {
            blocks.push({
              type: 'z_kanji',
              tag: 'Z',
              rawText: sub,
              compiledPayload: `[Z]${romaji}[/Z]`,
            });
            zCount++;
            totalKeystrokes += romaji.length + 2;
          }
          i += l;
          matchedMorphLexicon = true;
          break;
        }
      }
      if (matchedMorphLexicon) continue;

      // H-2. 助詞・付属語 (ひらがな) ➔ [H] 即時確定
      let matchedParticle = false;
      for (const p of SORTED_PARTICLES) {
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

      // H-2.5. 単独1文字漢字の決定論的アンカー変換（整・清・軟・純・錠・回・包・胃・肝・腎・肺・脳・腫・炎・痛 等）
      const firstChar = remaining[0];
      if (SINGLE_KANJI_DETERMINISTIC_ANCHORS[firstChar]) {
        appendChunkItems(SINGLE_KANJI_DETERMINISTIC_ANCHORS[firstChar]);
        i += 1;
        continue;
      }

      // H-2.8. 1文字形態素辞書 (MORPH_ROMAJI / COMPOUND_LEXICON の1文字語)
      if (COMPOUND_LEXICON[firstChar] || _morphRomaji[firstChar]) {
        const romaji = COMPOUND_LEXICON[firstChar] || _morphRomaji[firstChar];
        const tag = _morphTags[firstChar] || 'Z';
        if (tag === 'K') {
          blocks.push({
            type: 'k_katakana',
            tag: 'K',
            rawText: firstChar,
            compiledPayload: `[K]${romaji}[/K]`,
          });
          kCount++;
          totalKeystrokes += romaji.length + 2;
        } else if (tag === 'H') {
          blocks.push({
            type: 'h_hiragana',
            tag: 'H',
            rawText: firstChar,
            compiledPayload: `[H]${romaji}[/H]`,
          });
          hCount++;
          totalKeystrokes += romaji.length + 1;
        } else {
          blocks.push({
            type: 'z_kanji',
            tag: 'Z',
            rawText: firstChar,
            compiledPayload: `[Z]${romaji}[/Z]`,
          });
          zCount++;
          totalKeystrokes += romaji.length + 2;
        }
        i += 1;
        continue;
      }

      // H-3. 辞書外の未知漢字フォールバック (1文字ずつ安全出力)
      const singleKanji = remaining.match(/^[\u4E00-\u9FFF\u3005]/);
      if (singleKanji) {
        const ch = singleKanji[0];
        const romaji = _jisKanjiRomaji[ch] || ONYOMI_KANJI_FALLBACK[ch] || ch;
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

    const finalResult: CompileResult = {
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

    if (_compileCache.size >= MAX_COMPILE_CACHE) {
      const oldest = _compileCache.keys().next().value;
      if (oldest !== undefined) _compileCache.delete(oldest);
    }
    _compileCache.set(cacheKey, finalResult);

    return finalResult;
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

  /**
   * 医療英数シンボル群を一括抽出する正規表現
   * 1. Stage病期: Stage (?:0|I{1,3}[A-C]?|IV[A-B]?)
   * 2. TNM複合: (?:c|p|yp)?T(?:is|[0-4][a-b]?(?:-[A-Z]+)?(?:[1-2])?)N[0-3][a-b]?M[0-1]
   * 3. 単独深達度・壁深達度: T(?:is|[0-4][a-b]?(?:-[A-Z]+)?(?:[1-2])?)|SM[1-2]|MP|SS|SE|SI|UL[0-1]
   */
  public static readonly CANCER_STAGE_REGEX =
    /\b(?:Stage\s+(?:0|I{1,3}[A-C]?|IV[A-B]?)|(?:c|p|yp)?T(?:is|[0-4][a-b]?(?:-[A-Z]+)?(?:[1-2])?)N[0-3][a-b]?M[0-1]|T(?:is|[0-4][a-b]?(?:-[A-Z]+)?(?:[1-2])?)|SM[1-2]|MP|SS|SE|SI|UL[0-1])\b/g;

  /**
   * 木村・竹本分類およびピロリ菌記号にマッチする正規表現パターン
   * 例: C-1, C-2, C-3, O-1, O-2, O-3, C-I, C-II, C-III, O-I, O-II, O-III
   * 例: HP(+), HP(-), HP(±), UBT(+), UBT(-), (+), (-), H.pylori(+), H.pylori(-)
   */
  public static readonly MEDICAL_SYMBOL_REGEX =
    /(\b(?:C|O)-(?:[1-3]|I{1,3})\b|\b(?:HP|UBT)\([+\-±]\)|\([+\-±]\)|\bH\.pylori\([+\-]\))/g;

  /**
   * マッチしたシンボル文字列をF10バイパスキーストローク列へ変換
   */
  public static compileCancerSymbols(symbolText: string): KeyStrokeAction[] {
    const actions: KeyStrokeAction[] = [];

    // パターンA: "Stage IA" などの空白を含む病期表記 (アトミック分割打鍵)
    if (symbolText.startsWith('Stage ')) {
      const parts = symbolText.split(' ');
      // 1. "Stage" をF10確定打鍵
      actions.push(...this.compileRawString(parts[0]));
      actions.push(...this.emitF10Enter());
      // 2. 半角スペースを直接挿入 (Shift+Space で全角スペース化を防止)
      actions.push({ type: 'KEY_DOWN', keyCode: HID_USAGE.SPACE, modifiers: MOD_SHIFT });
      actions.push({ type: 'DELAY', delayMs: 15 });
      actions.push({ type: 'KEY_UP', keyCode: HID_USAGE.SPACE, modifiers: MOD_NONE });
      actions.push({ type: 'DELAY', delayMs: 15 });
      // 3. 病期記号（"IA" 等）をF10確定打鍵
      actions.push(...this.compileRawString(parts[1]));
      actions.push(...this.emitF10Enter());
      return actions;
    }

    // パターンB: "T1a", "cT1bN0M0", "SM1" などの連続英数文字列
    actions.push(...this.compileRawString(symbolText));
    actions.push(...this.emitF10Enter());
    return actions;
  }

  /**
   * テキストを解析し、木村・竹本分類やピロリ菌シンボル箇所をF10バイパス打鍵アクションへ変換
   */
  public static compileMedicalSymbols(symbolText: string): KeyStrokeAction[] {
    const actions: KeyStrokeAction[] = [];

    // ± を含む場合の特殊分解
    if (symbolText.includes('±')) {
      const prefix = symbolText.substring(0, symbolText.indexOf('±'));
      const suffix = symbolText.substring(symbolText.indexOf('±') + 1);
      if (prefix) {
        actions.push(...this.compileMedicalSymbols(prefix));
      }
      // 「puramai」打鍵 -> Space -> Enter
      const puramaiKeys = [
        HID_USAGE.P, HID_USAGE.U, HID_USAGE.R, HID_USAGE.A, HID_USAGE.M, HID_USAGE.A, HID_USAGE.I
      ];
      for (const k of puramaiKeys) {
        actions.push({ type: 'KEY_DOWN', keyCode: k, modifiers: MOD_NONE });
        actions.push({ type: 'DELAY', delayMs: 12 });
        actions.push({ type: 'KEY_UP', keyCode: k, modifiers: MOD_NONE });
        actions.push({ type: 'DELAY', delayMs: 8 });
      }
      actions.push({ type: 'KEY_DOWN', keyCode: HID_USAGE.SPACE, modifiers: MOD_NONE });
      actions.push({ type: 'DELAY', delayMs: 20 });
      actions.push({ type: 'KEY_UP', keyCode: HID_USAGE.SPACE, modifiers: MOD_NONE });
      actions.push({ type: 'DELAY', delayMs: 25 });
      actions.push({ type: 'KEY_DOWN', keyCode: HID_USAGE.ENTER, modifiers: MOD_NONE });
      actions.push({ type: 'DELAY', delayMs: 20 });
      actions.push({ type: 'KEY_UP', keyCode: HID_USAGE.ENTER, modifiers: MOD_NONE });
      actions.push({ type: 'DELAY', delayMs: 25 });

      if (suffix) {
        actions.push(...this.compileMedicalSymbols(suffix));
      }
      return actions;
    }

    actions.push(...this.compileRawString(symbolText));
    actions.push(...this.emitF10Enter());
    return actions;
  }

  /**
   * 文字列の各文字をShiftあり/なしで正確に打鍵する内部関数
   */
  private static compileRawString(text: string): KeyStrokeAction[] {
    const actions: KeyStrokeAction[] = [];
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const stroke = this.getCharStroke(char);
      if (stroke) {
        actions.push({ type: 'KEY_DOWN', keyCode: stroke.code, modifiers: stroke.mod });
        actions.push({ type: 'DELAY', delayMs: 12 });
        actions.push({ type: 'KEY_UP', keyCode: stroke.code, modifiers: MOD_NONE });
        actions.push({ type: 'DELAY', delayMs: 8 });
      }
    }
    return actions;
  }

  /**
   * F10変換 ➔ Enter確定の固定シーケンス
   */
  private static emitF10Enter(): KeyStrokeAction[] {
    return [
      { type: 'KEY_DOWN', keyCode: HID_USAGE.F10, modifiers: MOD_NONE },
      { type: 'DELAY', delayMs: 20 },
      { type: 'KEY_UP', keyCode: HID_USAGE.F10, modifiers: MOD_NONE },
      { type: 'DELAY', delayMs: 20 },
      { type: 'KEY_DOWN', keyCode: HID_USAGE.ENTER, modifiers: MOD_NONE },
      { type: 'DELAY', delayMs: 20 },
      { type: 'KEY_UP', keyCode: HID_USAGE.ENTER, modifiers: MOD_NONE },
      { type: 'DELAY', delayMs: 25 },
    ];
  }

  /**
   * 大文字・小文字・数字・記号のHID Usage IDとModifierのマッピング
   */
  private static getCharStroke(char: string): { code: number; mod: number } | null {
    if (char >= 'a' && char <= 'z') {
      const code = (HID_USAGE as any)[char.toUpperCase()];
      return code ? { code, mod: MOD_NONE } : null;
    }
    if (char >= 'A' && char <= 'Z') {
      const code = (HID_USAGE as any)[char];
      return code ? { code, mod: MOD_SHIFT } : null;
    }
    if (char >= '0' && char <= '9') {
      const numCode = (HID_USAGE as any)[`NUM_${char}`];
      return numCode ? { code: numCode, mod: MOD_NONE } : null;
    }
    if (char === '-') return { code: HID_USAGE.MINUS, mod: MOD_NONE };
    if (char === '.') return { code: HID_USAGE.PERIOD, mod: MOD_NONE };
    if (char === ',') return { code: HID_USAGE.COMMA, mod: MOD_NONE };
    if (char === '(') return { code: HID_USAGE.KEY_8, mod: MOD_SHIFT };
    if (char === ')') return { code: HID_USAGE.KEY_9, mod: MOD_SHIFT };
    if (char === '+') return { code: HID_USAGE.COLON, mod: MOD_SHIFT };
    return null;
  }
}

export const keyStrokeCompiler = new KeyStrokeCompiler();

export interface KeyStrokeInspectorToken {
  tag: 'Z' | 'K' | 'H' | 'A';
  surface: string;
  romaji: string;
}

/**
 * UIインスペクタ・プレビュー用ストリームコンパイラ (LRUキャッシュ連動)
 * 単漢字アンカー切断 ([BS]) を前ブロックの romaji 内の '\x08' として統合表示
 */
export function compileToKeyStrokeStream(text: string): {
  streamText: string;
  tokens: KeyStrokeInspectorToken[];
} {
  const res = keyStrokeCompiler.compileText(text);
  const tokens: KeyStrokeInspectorToken[] = [];

  for (let i = 0; i < res.blocks.length; i++) {
    const b = res.blocks[i];
    if (b.tag === 'BS') {
      if (tokens.length > 0) {
        const prev = tokens[tokens.length - 1];
        prev.romaji += '\x08'.repeat(b.rawText.length || 1);
        if (prev.surface.length > 1) {
          prev.surface = prev.surface.slice(0, Math.max(1, prev.surface.length - (b.rawText.length || 1)));
        }
      }
      continue;
    }
    const innerPayload = b.compiledPayload.replace(/^\[(?:Z|K|H|A)\]|\[\/(?:Z|K|H|A)\]$/g, '');
    tokens.push({
      tag: (b.tag as 'Z' | 'K' | 'H' | 'A'),
      surface: b.rawText,
      romaji: innerPayload,
    });
  }

  return {
    streamText: res.streamText,
    tokens,
  };
}

