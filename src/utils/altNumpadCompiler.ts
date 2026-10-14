/**
 * DrVoice どんぐり君！ Windows標準「Alt + テンキー (Alt Numpad)」100%決定論コンパイラ
 * 
 * 【設計思想】
 * 病院・電子カルテPCのIME（MS-IME）の推論・誤変換学習・モード不一致（半角/全角）を100%完全バイパス。
 * WindowsのRawInput層が太古からサポートする「Alt + テンキー」コード注入を利用し、
 * 画面リロード事故（F5キー）を物理的にゼロにしつつ、100%決定論的テキスト転送を実現する。
 */

import { EhrNewlineMode } from '../types';
import { CP932_NUMPAD_MAP } from '../data/cp932Table';

// ============================================================================
// HIL実機テスト用プリセットデータ (Windows標準 CP932 100%適合版)
// ============================================================================
export interface HilTestPreset {
  id: string;
  name: string;
  description: string;
  code: string;
  category: 'single' | 'cp932' | 'compound' | 'sentence';
  expectedChar: string;
}

export const HIL_TEST_PRESETS: HilTestPreset[] = [
  // 1. Windows標準 100%適合 CP932 (Shift_JIS 先頭0付き 10進数)
  { id: 'cp-i-doc', name: '「胃」 (CP932: 035037)', description: '実機テスト合格確定 CP932コード', code: '035037', category: 'cp932', expectedChar: '胃' },
  { id: 'cp-a', name: '「亜」 (CP932: 034975)', description: 'JIS第1水準第1号 0x889F (比較用)', code: '034975', category: 'cp932', expectedChar: '亜' },
  { id: 'cp-gan', name: '「癌」 (CP932: 035552)', description: 'CP932 (0x8AE0) 10進コード', code: '035552', category: 'cp932', expectedChar: '癌' },
  { id: 'cp-kou', name: '「高」 (CP932: 036226)', description: 'CP932 (0x8D82) 10進コード', code: '036226', category: 'cp932', expectedChar: '高' },
  { id: 'cp-ketsu', name: '「血」 (CP932: 035980)', description: 'CP932 (0x8C8C) 10進コード', code: '035980', category: 'cp932', expectedChar: '血' },
  { id: 'cp-atsu', name: '「圧」 (CP932: 034995)', description: 'CP932 (0x88B3) 10進コード', code: '034995', category: 'cp932', expectedChar: '圧' },

  // 2. 臨床熟語・複合語 (CP932 連続Alt打鍵)
  { id: 'comp-igan', name: '「胃癌」 (CP932連続)', description: '胃(035037) + 癌(035552)', code: '035037,035552', category: 'compound', expectedChar: '胃癌' },
  { id: 'comp-ht', name: '「高血圧」 (CP932連続)', description: '高(036226) + 血(035980) + 圧(034995)', code: '036226,035980,034995', category: 'compound', expectedChar: '高血圧' },
  { id: 'comp-dm', name: '「糖尿病」 (CP932連続)', description: '糖(037788) + 尿(037953) + 病(038241)', code: '037788,037953,038241', category: 'compound', expectedChar: '糖尿病' },

  // 3. 短文・フレーズ (CP932 Alt+Numpadストリーム)
  { id: 'sent-calonal', name: '「カロナール錠500mg」', description: 'カナ・漢字・英数混合 CP932ストリーム', code: 'SENTENCE:カロナール錠500mg', category: 'sentence', expectedChar: 'カロナール錠500mg' },
  { id: 'sent-soap-s', name: '「胃癌の精査目的にて受診。」', description: '臨床文・全文字CP932完全着弾', code: 'SENTENCE:胃癌の精査目的にて受診。', category: 'sentence', expectedChar: '胃癌の精査目的にて受診。' },
  { id: 'sent-soap', name: '「[S] 咽頭痛あり、発熱なし。」', description: 'SOAP記号・漢字・かな混合', code: 'SENTENCE:[S] 咽頭痛あり、発熱なし。', category: 'sentence', expectedChar: '[S] 咽頭痛あり、発熱なし。' },

  // 4. Unicode参考用
  { id: 'u-i', name: '「胃」 (Unicode: 24771)', description: '※レジストリ設定なしでは記号化', code: '24771', category: 'single', expectedChar: '胃' },
  { id: 'u-gan', name: '「癌」 (Unicode: 30284)', description: '※レジストリ設定なしでは記号化', code: '30284', category: 'single', expectedChar: '癌' }
];

// 主要医療漢字のCP932マッピングテーブル
export const COMMON_CP932_MAP: Record<string, string> = {
  '胃': '035037',
  '亜': '034975',
  '癌': '035552',
  '高': '036226',
  '血': '035980',
  '圧': '034995',
  '症': '036807',
  '糖': '037788',
  '尿': '037953',
  '病': '038241',
  '炎': '035210',
  '処': '036744',
  '方': '038395',
  '錠': '036857',
  '痛': '037887',
  '熱': '037812',
  '咳': '035342',
  '嗽': '035343',
  '発': '038202',
  '頭': '037748',
  '咽': '035174',
  '喉': '035848',
  '検': '035780',
  '査': '035957',
  '診': '036780',
  '療': '038933',
  '計': '035745',
  '算': '036122',
  '導': '037751',
  '管': '035651',
  '理': '038938',
  '料': '038932',
  '度': '037715',
  '分': '038370',
  '日': '037562',
  '回': '035412',
  '朝': '036980',
  '昼': '037141',
  '夕': '036881',
  '食': '036761',
  '後': '035845',
  '前': '036791',
  '眠': '038260',
  '服': '038445',
  '薬': '038673'
};

// 仕様書指定のエイリアス
const CUSTOM_UNICODE_OVERRIDES: Record<string, string> = {
  '胃': '24771', // 仕様書の24771を参考登録
};

/**
 * 1文字を Unicode 10進数 Alt+Numpad コードへエンコード
 */
export function encodeCharToAltNumpadUnicode(char: string): string {
  if (CUSTOM_UNICODE_OVERRIDES[char]) {
    return CUSTOM_UNICODE_OVERRIDES[char];
  }
  const code = char.codePointAt(0);
  return code !== undefined ? code.toString() : '';
}

/**
 * 1文字を CP932 (Shift_JIS) 10進数 Alt+Numpad コードへエンコード
 */
export function encodeCharToAltNumpadCp932(char: string): string | null {
  if (CP932_NUMPAD_MAP[char]) {
    return CP932_NUMPAD_MAP[char];
  }
  if (COMMON_CP932_MAP[char]) {
    return COMMON_CP932_MAP[char];
  }
  // 半角ASCII記号（[ ] ( ) : など）もIME ON誤爆防止のためAltコード化対応
  const code = char.charCodeAt(0);
  if (code >= 0x20 && code <= 0x7E) {
    return `00${code}`.slice(-4); // 例: 91 -> 0091
  }
  return null;
}

export interface AltCompileOptions {
  mode?: 'unicode' | 'cp932' | 'hybrid';
  keepAscii?: boolean;       // 半角英数字を [A]...[/A] で直接打鍵するか
  newlineMode?: EhrNewlineMode;
}

/**
 * 任意のテキストを Alt+Numpad 決定論タグ列（[ALT]コード[/ALT]）へコンパイル
 * 
 * 例:
 * "胃癌" -> "[ALT]034975[/ALT][ALT]035552[/ALT]"
 * "胃 100mg" (keepAscii=true) -> "[ALT]034975[/ALT][A] 100mg[/A]"
 */
export function compileTextToAltNumpad(text: string, options: AltCompileOptions = {}): string {
  const { mode = 'cp932', keepAscii = true, newlineMode = EhrNewlineMode.NORMAL_ENTER } = options;
  if (!text) return '';

  let result = '';
  let asciiBuf = '';

  const flushAscii = () => {
    if (asciiBuf.length > 0) {
      if (keepAscii) {
        result += `[A]${asciiBuf}[/A]`;
      } else {
        // ASCIIもAltコード化 (例: 'A' -> 65)
        for (const ac of asciiBuf) {
          result += `[ALT]${ac.charCodeAt(0)}[/ALT]`;
        }
      }
      asciiBuf = '';
    }
  };

  const chars = Array.from(text);

  for (let idx = 0; idx < chars.length; idx++) {
    const char = chars[idx];

    // 改行処理
    if (char === '\r') {
      flushAscii();
      if (idx + 1 < chars.length && chars[idx + 1] === '\n') {
        idx++; // CRLF
      }
      if (newlineMode === EhrNewlineMode.MICS_ALT_ENTER) {
        result += '<ALT_ENTER>';
      } else if (newlineMode === EhrNewlineMode.CTRL_ENTER) {
        result += '<CTRL_ENTER>';
      } else {
        result += '<ENTER>';
      }
      continue;
    }
    if (char === '\n') {
      flushAscii();
      if (newlineMode === EhrNewlineMode.MICS_ALT_ENTER) {
        result += '<ALT_ENTER>';
      } else if (newlineMode === EhrNewlineMode.CTRL_ENTER) {
        result += '<CTRL_ENTER>';
      } else {
        result += '<ENTER>';
      }
      continue;
    }

    // 半角ASCII文字（空白・英数・基本記号）
    const code = char.charCodeAt(0);
    // [ と ] は IME ON 時に全角 「 と 」 に誤爆するため、Alt+Numpad (0091/0093) で100%決定論送出
    if (char === '[' || char === ']') {
      flushAscii();
      result += `[ALT]00${code}[/ALT]`;
      continue;
    }

    if (code >= 0x20 && code <= 0x7E) {
      asciiBuf += char;
      continue;
    }

    // 全角文字・日本語文字
    flushAscii();

    if (mode === 'cp932') {
      const cpCode = encodeCharToAltNumpadCp932(char);
      if (cpCode) {
        result += `[ALT]${cpCode}[/ALT]`;
      } else {
        // CP932未定義字はUnicodeへフォールバック
        const uCode = encodeCharToAltNumpadUnicode(char);
        result += `[ALT]${uCode}[/ALT]`;
      }
    } else {
      // デフォルト: Unicode 10進数
      const uCode = encodeCharToAltNumpadUnicode(char);
      result += `[ALT]${uCode}[/ALT]`;
    }
  }

  flushAscii();
  return result;
}
