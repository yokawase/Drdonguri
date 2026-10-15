// =============================================================================
// File: src/services/KeyStrokeCompiler.ts
// 説明: 形態素解析トークン列から「100%決定論的Altコード」「F7カタカナ」「F10英数」
//       のハイブリッド打鍵ストリームを生成する高精度トランスパイラ
// =============================================================================

import { CP932_NUMPAD_MAP } from '../data/cp932Table';
import { COMMON_CP932_MAP } from '../utils/altNumpadCompiler';
import type { MorphToken } from '../workers/vibrato.worker';

export type KeyStrokeMode = 'hybrid' | 'deterministic_only';

export interface CompileOptions {
  mode?: KeyStrokeMode;
  includeImeReset?: boolean;
  newlineMode?: 'enter' | 'ctrl_enter' | 'alt_enter';
}

export interface KeyStrokeBlock {
  type: 'alt' | 'f7_katakana' | 'f10_ascii' | 'raw' | 'control';
  rawText: string;
  compiledPayload: string;
}

export interface CompileResult {
  streamText: string;
  blocks: KeyStrokeBlock[];
  totalKeystrokes: number;
  altCount: number;
  f7Count: number;
  f10Count: number;
}

// -----------------------------------------------------------------------------
// カタカナ ➔ ヘボン式ローマ字マッピングテーブル
// -----------------------------------------------------------------------------
const KANA_ROMAJI_MAP: Record<string, string> = {
  'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
  'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
  'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
  'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
  'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
  'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
  'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
  'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
  'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
  'ワ': 'wa', 'ヲ': 'o', 'ン': 'n',
  'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
  'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
  'ダ': 'da', 'ヂ': 'di', 'ヅ': 'du', 'デ': 'de', 'ド': 'do',
  'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
  'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
  'キャ': 'kya', 'キュ': 'kyu', 'キョ': 'kyo',
  'シャ': 'sha', 'シュ': 'shu', 'ショ': 'sho',
  'チャ': 'cha', 'チュ': 'chu', 'チョ': 'cho',
  'ニャ': 'nya', 'ニュ': 'nyu', 'ニョ': 'nyo',
  'ヒャ': 'hya', 'ヒュ': 'hyu', 'ヒョ': 'hyo',
  'ミャ': 'mya', 'ミュ': 'myu', 'ミョ': 'myo',
  'リャ': 'rya', 'リュ': 'ryu', 'リョ': 'ryo',
  'ギャ': 'gya', 'ギュ': 'gyu', 'ギョ': 'gyo',
  'ジャ': 'ja', 'ジュ': 'ju', 'ジョ': 'jo',
  'ビャ': 'bya', 'ビュ': 'byu', 'ビョ': 'byo',
  'ピャ': 'pya', 'ピュ': 'pyu', 'ピョ': 'pyo',
  'ファ': 'fa', 'フィ': 'fi', 'フェ': 'fe', 'フォ': 'fo',
  'ティ': 'ti', 'ディ': 'di', 'デュ': 'dyu',
  'ウィ': 'wi', 'ウェ': 'we', 'ウォ': 'wo',
  'ヴァ': 'va', 'ヴィ': 'vi', 'ヴ': 'vu', 'ヴェ': 've', 'ヴォ': 'vo',
  'チェ': 'che', 'シェ': 'she', 'ジェ': 'je',
  'ー': '-',
};

export function katakanaToRomaji(katakana: string): string {
  let result = '';
  let i = 0;
  while (i < katakana.length) {
    // 促音「ッ」の処理
    if (katakana[i] === 'ッ') {
      if (i + 1 < katakana.length) {
        const nextTwo = katakana.substring(i + 1, i + 3);
        const nextOne = katakana.substring(i + 1, i + 2);
        const nextRomaji = KANA_ROMAJI_MAP[nextTwo] || KANA_ROMAJI_MAP[nextOne] || '';
        if (nextRomaji.length > 0) {
          result += nextRomaji[0];
          i++;
          continue;
        }
      }
      result += 'tsu';
      i++;
      continue;
    }

    // 2文字（拗音・外来音）探索
    if (i + 1 < katakana.length) {
      const two = katakana.substring(i, i + 2);
      if (KANA_ROMAJI_MAP[two]) {
        result += KANA_ROMAJI_MAP[two];
        i += 2;
        continue;
      }
    }

    // 1文字探索
    const one = katakana.substring(i, i + 1);
    if (KANA_ROMAJI_MAP[one]) {
      result += KANA_ROMAJI_MAP[one];
    } else {
      result += one; // そのままフォールバック
    }
    i++;
  }
  return result;
}

// -----------------------------------------------------------------------------
// CP932コード取得 (100%決定論 Alt+Numpad)
// -----------------------------------------------------------------------------
export function getCp932Code(char: string): string | null {
  // 1. 頻出医療漢字キャッシュ
  if (COMMON_CP932_MAP[char]) {
    return COMMON_CP932_MAP[char];
  }
  // 2. CP932 全9,206文字マップ
  if (CP932_NUMPAD_MAP[char]) {
    return CP932_NUMPAD_MAP[char];
  }
  // 3. 特殊記号・半角ASCIIのShift_JIS 10進数計算
  const code = char.charCodeAt(0);
  if (code >= 0x20 && code <= 0x7E) {
    // ASCII (先頭0付き3桁)
    return `0${code}`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// KeyStrokeCompiler クラス実装
// -----------------------------------------------------------------------------
export class KeyStrokeCompiler {
  /**
   * 形態素トークン列をハイブリッド打鍵ストリームへコンパイル
   */
  public compile(tokens: MorphToken[], options: CompileOptions = {}): CompileResult {
    const mode = options.mode || 'hybrid';
    const includeImeReset = options.includeImeReset !== false;
    const newlineMode = options.newlineMode || 'enter';

    const blocks: KeyStrokeBlock[] = [];
    let altCount = 0;
    let f7Count = 0;
    let f10Count = 0;
    let totalKeystrokes = 0;

    // 1. IMEリセットタグの挿入
    if (includeImeReset) {
      blocks.push({
        type: 'control',
        rawText: '[IME_RESET]',
        compiledPayload: '[IME_RESET]',
      });
      totalKeystrokes += 2; // 無変換2回
    }

    for (const token of tokens) {
      const surface = token.surface;

      // A. 改行制御
      if (surface === '\n' || surface === '\r\n') {
        let tag = '[ENTER]';
        if (newlineMode === 'alt_enter') tag = '[ALT_ENTER]';
        else if (newlineMode === 'ctrl_enter') tag = '[CTRL_ENTER]';
        blocks.push({
          type: 'control',
          rawText: surface,
          compiledPayload: tag,
        });
        totalKeystrokes += 1;
        continue;
      }

      // B. 純カタカナトークン（薬品名・外来語） ➔ F7ハイブリッド
      const isPureKatakana = /^[\u30A1-\u30FA\u30FC]+$/.test(surface);
      if (mode === 'hybrid' && isPureKatakana && surface.length >= 2) {
        const romaji = katakanaToRomaji(surface);
        blocks.push({
          type: 'f7_katakana',
          rawText: surface,
          compiledPayload: `[F7]${romaji}[/F7]`,
        });
        f7Count++;
        totalKeystrokes += romaji.length + 2; // ローマ字 + F7 + Enter
        continue;
      }

      // C. 半角英数字・単位（500mg, 10mg, 1日3回 等の数値英数部） ➔ F10またはASCII
      const isAsciiOnly = /^[a-zA-Z0-9_\-\.\:\/\%\+\(\)\,\s]+$/.test(surface);
      if (isAsciiOnly) {
        if (mode === 'hybrid' && /^[0-9]+(\.[0-9]+)?[a-zA-Z\%]+$/.test(surface)) {
          // 「500mg」等の数値＋単位複合
          blocks.push({
            type: 'f10_ascii',
            rawText: surface,
            compiledPayload: `[F10]${surface}[/F10]`,
          });
          f10Count++;
          totalKeystrokes += surface.length + 2; // ASCII + F10 + Enter
        } else {
          // 通常ASCII
          blocks.push({
            type: 'raw',
            rawText: surface,
            compiledPayload: `[A]${surface}[/A]`,
          });
          totalKeystrokes += surface.length;
        }
        continue;
      }

      // D. 漢字・ひらがな・日本語記号 ➔ 100%決定論 Alt+Numpad
      for (const ch of surface) {
        const cpCode = getCp932Code(ch);
        if (cpCode) {
          blocks.push({
            type: 'alt',
            rawText: ch,
            compiledPayload: `[ALT]${cpCode}[/ALT]`,
          });
          altCount++;
          totalKeystrokes += cpCode.length + 2; // Alt押下・解放 + テンキー打鍵
        } else {
          // 未知文字はそのまま安全文字として流す
          blocks.push({
            type: 'raw',
            rawText: ch,
            compiledPayload: ch,
          });
          totalKeystrokes += 1;
        }
      }
    }

    const streamText = blocks.map(b => b.compiledPayload).join('');

    return {
      streamText,
      blocks,
      totalKeystrokes,
      altCount,
      f7Count,
      f10Count,
    };
  }

  /**
   * プレーンテキストから簡易コンパイル（形態素解析器を介さない直接変換）
   */
  public compileText(text: string, options: CompileOptions = {}): CompileResult {
    const dummyTokens: MorphToken[] = [];
    // 粗い文字種別でトークン化
    const matches = text.match(/[\u4E00-\u9FFF]+|[\u30A1-\u30FA\u30FC]+|[\u3041-\u3096]+|[0-9]+(\.[0-9]+)?[a-zA-Z]*|[a-zA-Z]+|[^\s]|\s+/g);
    if (matches) {
      for (const m of matches) {
        dummyTokens.push({
          surface: m,
          feature: '',
          pos: '名詞',
          subPos: '一般',
          reading: m,
        });
      }
    }
    return this.compile(dummyTokens, options);
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
