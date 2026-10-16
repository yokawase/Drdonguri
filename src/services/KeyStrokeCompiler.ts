// =============================================================================
// File: src/services/KeyStrokeCompiler.ts
// 説明: 長単位結合オートマトン（Sudachi Mode C思想）により熟語のまとまりを保証し、
//       実績のあるv20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）を生成する
//       電カルセーフ決定論的トランスパイラ
// =============================================================================

import { KANA_ROMAJI_MAP } from '../utils/japaneseImeTranspiler';
import { JIS_KANJI_ROMAJI } from '../data/jisKanjiRomajiTable';
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
  '疑い': 'utagawi',
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
};

// -----------------------------------------------------------------------------
// MS-IMEで1語一括変換すると誤爆しやすい複合語の「最適チャンク分割」辞書
// -----------------------------------------------------------------------------
export const MULTI_CHUNK_LEXICON: Record<string, Array<{ tag: 'Z' | 'K' | 'H' | 'A'; text: string; romaji: string }>> = {
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
};

// 熟語フォールバック用 医療音読み優先テーブル（訓読み誤爆・キメラ連結を完全根絶）
export const ONYOMI_KANJI_FALLBACK: Record<string, string> = {
  '咽': 'inn', '頭': 'tou', '痛': 'tuu', '咳': 'gai', '嗽': 'sou',
  '乾': 'kann', '性': 'sei', '発': 'hatu', '熱': 'netu', '赤': 'seki',
  '扁': 'henn', '桃': 'tou', '腫': 'syu', '大': 'dai', '呼': 'ko',
  '吸': 'kyuu', '音': 'onn', '清': 'sei', '腹': 'huku', '部': 'bu',
  '平': 'hei', '坦': 'tann', '軟': 'nann', '急': 'kyuu', '上': 'jyou',
  '気': 'ki', '道': 'dou', '炎': 'enn', '感': 'kann', '冒': 'bou',
  '対': 'tai', '症': 'syou', '療': 'ryou', '法': 'hou', '市': 'si',
  '販': 'hann', '総': 'sou', '合': 'gou', '薬': 'yaku', '内': 'nai',
  '服': 'huku', '改': 'kai', '善': 'zenn', '乏': 'bou', '来': 'rai',
  '院': 'inn', '水': 'sui', '分': 'bunn', '摂': 'setu', '取': 'syu',
  '励': 'rei', '行': 'kou', '持': 'ji', '続': 'zoku', '時': 'ji',
  '再': 'sai', '診': 'sinn', '指': 'si', '示': 'ji',
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
            }
          }
          i += phrase.length;
          matchedMultiChunk = true;
          break;
        }
      }
      if (matchedMultiChunk) continue;

      // H-1. 辞書最長一致探索 (最長10文字〜2文字)
      let matchedLexicon = false;
      for (let l = Math.min(10, remaining.length); l >= 2; l--) {
        const sub = remaining.substring(0, l);
        if (COMPOUND_LEXICON[sub]) {
          let compound = sub;
          let romaji = COMPOUND_LEXICON[sub];
          let offset = l;

          // 直後に接尾辞（時、症、炎、痛など）が連続しているかチェックし完全融合
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
          matchedLexicon = true;
          break;
        }
      }
      if (matchedLexicon) continue;

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

      // H-3. 連続する漢字列（未知の複合語）の長単位自動結合 (最大2〜3文字 & 音読み優先)
      const kanjiRun = remaining.match(/^[\u4E00-\u9FFF]{2,}/);
      if (kanjiRun) {
        const fullRun = kanjiRun[0];
        // 既知の辞書語彙が途中で始まる場合はその手前で切断、なければ最大3文字でクラスタリング
        let chunkLen = Math.min(3, fullRun.length);
        for (let checkOffset = 1; checkOffset < fullRun.length; checkOffset++) {
          const restFromOffset = remaining.substring(checkOffset);
          if (MULTI_CHUNK_LEXICON[restFromOffset.substring(0, 4)] || COMPOUND_LEXICON[restFromOffset.substring(0, 4)] ||
              MULTI_CHUNK_LEXICON[restFromOffset.substring(0, 3)] || COMPOUND_LEXICON[restFromOffset.substring(0, 3)] ||
              MULTI_CHUNK_LEXICON[restFromOffset.substring(0, 2)] || COMPOUND_LEXICON[restFromOffset.substring(0, 2)]) {
            chunkLen = checkOffset;
            break;
          }
        }

        const kj = fullRun.substring(0, chunkLen);
        let runRomaji = '';
        for (const char of kj) {
          runRomaji += ONYOMI_KANJI_FALLBACK[char] || JIS_KANJI_ROMAJI[char] || char;
        }
        blocks.push({
          type: 'z_kanji',
          tag: 'Z',
          rawText: kj,
          compiledPayload: `[Z]${runRomaji}[/Z]`,
        });
        zCount++;
        totalKeystrokes += runRomaji.length + 2;
        i += kj.length;
        continue;
      }

      // H-4. 1文字自立語漢字 (体, 台, 等)
      const singleKanji = remaining.match(/^[\u4E00-\u9FFF]/);
      if (singleKanji) {
        const ch = singleKanji[0];
        const romaji = COMPOUND_LEXICON[ch] || JIS_KANJI_ROMAJI[ch] || ch;
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

      // H-5. ひらがな1文字フォールバック
      const singleHira = remaining.match(/^[\u3041-\u3096]/);
      if (singleHira) {
        const ch = singleHira[0];
        const romaji = kanaToNormalizedRomaji(ch);
        blocks.push({
          type: 'h_hiragana',
          tag: 'H',
          rawText: ch,
          compiledPayload: `[H]${romaji}[/H]`,
        });
        hCount++;
        totalKeystrokes += romaji.length + 1;
        i += 1;
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
