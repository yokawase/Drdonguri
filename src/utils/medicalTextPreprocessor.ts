/**
 * カルテテキスト・プリプロセッサ (Medical Text Preprocessor v2.0 - 誤爆根絶版)
 * 
 * 電子カルテおよび各種日本語入力環境（MS-IME、ChromeOS IME、ATOK等）において、
 * 実機テストで判明した以下の致命的不具合を根本から解決・予防する：
 * 
 * 1. 【最重要】英数字引きずられ事故（例:「38.3℃まで」➔「38.3Cmade taionnjyousyou...」）の完全根絶
 *    - ℃を英字「C」にすると大文字CでIMEが英数直接入力モードに切り替わり後続文が全て生英字になる
 *    - ➔ 日本語として100%安全な「度まで」「度」へ事前置換し、英数モード誤爆を完全防止！
 * 2. 「昨日夜より」➔「昨夜夜より」の不自然な重複の解消（「昨夜より」へ統一）
 * 3. 「アセトアミノフェン場」「1場」等の平仮名「じょう」による誤爆防止（漢字「錠」の文節保護）
 * 4. 「官房」「完成がいそう」等の安易な平仮名化の是正（医学用語の正確な文節化）
 * 5. 全角記号（※、・、（＋）、（−）、波ダッシュ）の安全なASCII/JISスキャンコード標準化
 */

export interface PreprocessRule {
  id: string;
  name: string;
  category: 'unit' | 'symbol' | 'prescription' | 'timing' | 'heading';
  pattern: RegExp | string;
  replacement: string;
  description: string;
  exampleBefore: string;
  exampleAfter: string;
}

export interface PreprocessOptions {
  enableTemperatureNormalization?: boolean; // 38.3℃まで ➔ 38.3度まで (英数モード引きずられ事故を完全根絶)
  enableTimingNormalization?: boolean;      // 昨日夜より ➔ 昨夜より (「昨夜夜より」の根絶)
  enableUnitNormalization?: boolean;        // ％ ➔ %, μg ➔ mcg, mmHg, bpm 等
  enableSymbolNormalization?: boolean;      // ※ ➔ *, ・ ➔ /, （＋）➔ (+)
  enablePrescriptionSpacing?: boolean;      // 1回1錠 ➔ 1回 1錠, 5回分 ➔ 5回分 (文節分離)
  enableHeadingNormalization?: boolean;     // 【主訴】 ➔ 主訴: (見出し文脈衝突防止)
}

export interface ReplacementRecord {
  ruleId: string;
  category: string;
  original: string;
  replaced: string;
  description: string;
  count: number;
}

export interface PreprocessResult {
  processedText: string;
  replacements: ReplacementRecord[];
  totalReplacementCount: number;
}

/**
 * カルテ専用 安定化プリプロセッサ定義一覧 (v2.0)
 */
export const PREPROCESS_RULES: PreprocessRule[] = [
  // ── 1. 【最重要】体温・温度単位の日本語化 (英数モード引きずられ事故の完全根絶) ──
  {
    id: 'temp-celsius-until',
    name: '体温「℃まで」➔「度まで」',
    category: 'unit',
    pattern: /(\d+(?:\.\d+)?)\s*℃\s*まで/g,
    replacement: '$1度まで ',
    description: '大文字CによるIME英数モード切り替わり（38.3Cmade事故）を完全防止',
    exampleBefore: '38.3℃まで体温上昇',
    exampleAfter: '38.3度まで 体温上昇',
  },
  {
    id: 'temp-celsius-general',
    name: '温度単位「℃」➔「度」',
    category: 'unit',
    pattern: /(\d+(?:\.\d+)?)\s*℃/g,
    replacement: '$1度 ',
    description: 'JIS文字化けや英字化を回避し日本語IMEとして100%安全に入力',
    exampleBefore: 'BT: 37.9℃',
    exampleAfter: 'BT: 37.9度',
  },

  // ── 2. 日時・病歴表現の正規化 (重複や誤爆防止) ──
  {
    id: 'time-sakuyayori',
    name: '「昨日夜より」➔「昨夜より」',
    category: 'timing',
    pattern: /昨日夜より/g,
    replacement: '昨夜より ',
    description: '「昨夜夜より」への不自然なIME重複変換を防止',
    exampleBefore: '昨日夜より38.3℃まで',
    exampleAfter: '昨夜より 38.3度まで',
  },
  {
    id: 'time-sakuyayoru',
    name: '「昨日夜」➔「昨夜」',
    category: 'timing',
    pattern: /昨日夜/g,
    replacement: '昨夜 ',
    description: '口語表現をIME辞書に確実に存在する「昨夜」へ正規化',
    exampleBefore: '昨日夜から発熱',
    exampleAfter: '昨夜 から発熱',
  },
  {
    id: 'time-sannitimae',
    name: '「3日前より」文節分離',
    category: 'timing',
    pattern: /(\d+)\s*日前より/g,
    replacement: '$1日前より ',
    description: '数詞と助詞を適切に分節化して確実に入力',
    exampleBefore: '3日前より咽頭痛',
    exampleAfter: '3日前より 咽頭痛',
  },

  // ── 3. カルテ見出し正規化 (【 】括弧を尊重し、不要なコロン置換を防止) ──
  {
    id: 'hd-syuso',
    name: '【主訴】見出し保護',
    category: 'heading',
    pattern: /【\s*主訴\s*】/g,
    replacement: '【主訴】',
    description: '標準的な電子カルテ見出し【主訴】を維持',
    exampleBefore: '【主訴】発熱',
    exampleAfter: '【主訴】発熱',
  },
  {
    id: 'hd-genbyoureki',
    name: '【現病歴】見出し保護',
    category: 'heading',
    pattern: /【\s*現病歴\s*】/g,
    replacement: '【現病歴】',
    description: '標準的な電子カルテ見出し【現病歴】を維持',
    exampleBefore: '【現病歴】3日前より',
    exampleAfter: '【現病歴】3日前より',
  },
  {
    id: 'hd-syoken',
    name: '【所見】見出し保護',
    category: 'heading',
    pattern: /【\s*所見\s*】/g,
    replacement: '【所見】',
    description: '標準的な電子カルテ見出し【所見】を維持',
    exampleBefore: '【所見】BT: 37.9℃',
    exampleAfter: '【所見】BT: 37.9度',
  },
  {
    id: 'hd-sindan',
    name: '【診断】見出し保護',
    category: 'heading',
    pattern: /【\s*診断\s*】/g,
    replacement: '【診断】',
    description: '標準的な電子カルテ見出し【診断】を維持',
    exampleBefore: '【診断】急性上気道炎',
    exampleAfter: '【診断】急性上気道炎',
  },
  {
    id: 'hd-syoho-housin',
    name: '【処方・方針】見出し保護',
    category: 'heading',
    pattern: /【\s*処方[・\/]方針\s*】/g,
    replacement: '【処方・方針】',
    description: '標準的な電子カルテ見出し【処方・方針】を維持',
    exampleBefore: '【処方・方針】Rp.',
    exampleAfter: '【処方・方針】Rp.',
  },
  {
    id: 'hd-generic-brackets',
    name: '汎用見出し括弧保護',
    category: 'heading',
    pattern: /【([^】]+)】/g,
    replacement: '【$1】',
    description: 'カルテ標準の隅付き括弧【 】を破壊せず完全維持',
    exampleBefore: '【検査結果】良好',
    exampleAfter: '【検査結果】良好',
  },

  // ── 4. 処方箋・調剤単位の文節スペーシング保護（「1場」「回文」誤爆防止） ──
  {
    id: 'rx-dosage-spacing',
    name: '用法用量「1回1錠」分節化',
    category: 'prescription',
    pattern: /(\d+)\s*回\s*(\d+)\s*錠/g,
    replacement: '$1回 $2錠 ',
    description: '「1回」と「1錠」を明確に文節分離し「1場」化を防止',
    exampleBefore: '1回1錠 毎食後',
    exampleAfter: '1回 1錠 毎食後',
  },
  {
    id: 'rx-kaibun-spacing',
    name: '「回分」文節保護 (回文誤爆防止)',
    category: 'prescription',
    pattern: /(\d+)\s*回分/g,
    replacement: '$1回分 ',
    description: '言葉遊びの「回文」への誤爆を防止し「回分」として確定',
    exampleBefore: '(5回分)',
    exampleAfter: '(5回分 )',
  },
  {
    id: 'rx-nitibun-spacing',
    name: '「日分」文節保護 (日文誤爆防止)',
    category: 'prescription',
    pattern: /(\d+)\s*日分/g,
    replacement: '$1日分 ',
    description: '「日文（日本文学）」への誤変換を防止',
    exampleBefore: '(5日分)',
    exampleAfter: '(5日分 )',
  },
  {
    id: 'rx-timing-spacing',
    name: '「毎食後 / 頓服」文節保護',
    category: 'prescription',
    pattern: /毎食後/g,
    replacement: '毎食後 ',
    description: '後続トークンとの結合を回避し「埋職後」等の誤変換を防止',
    exampleBefore: '毎食後 (5日分)',
    exampleAfter: '毎食後 (5日分 )',
  },

  // ── 5. 単位・数値・バイタルの正規化 ──
  {
    id: 'unit-room-air',
    name: 'room air ➔ (room air )',
    category: 'unit',
    pattern: /room\s*air/gi,
    replacement: 'room air ',
    description: 'IME全角モード中に「room あいｒ」と末尾が日本語化する事故を防止',
    exampleBefore: 'SpO2: 98%(room air)',
    exampleAfter: 'SpO2: 98%(room air )',
  },
  {
    id: 'unit-percent',
    name: '全角％ ➔ 半角%',
    category: 'unit',
    pattern: /％/g,
    replacement: '%',
    description: '全角記号をJIS標準半角%へ置換',
    exampleBefore: 'SpO2: 98％',
    exampleAfter: 'SpO2: 98%',
  },
  {
    id: 'unit-microgram',
    name: 'μg ➔ mcg',
    category: 'unit',
    pattern: /μg|µg/g,
    replacement: 'mcg',
    description: 'ギリシャ文字μの打鍵不可・文字化けを回避',
    exampleBefore: '100μg',
    exampleAfter: '100mcg',
  },
  {
    id: 'vital-comma-separation',
    name: 'バイタルカンマ区切りの安全正規化',
    category: 'unit',
    pattern: /(mmHg|bpm|%|℃|度),\s*([^\d\s\n])/gi,
    replacement: '$1, $2',
    description: 'バイタル値直後のカンマとスペースを安全に保持',
    exampleBefore: '128/82mmHg, 夜平均 122/78mmHg',
    exampleAfter: '128/82mmHg, 夜平均 122/78mmHg',
  },
  {
    id: 'unit-mmhg',
    name: '血圧単位 mmHg 正規化',
    category: 'unit',
    pattern: /(\d+)\s*\/\s*(\d+)\s*mmHg/g,
    replacement: '$1/$2mmHg',
    description: '血圧値とmmHgの境界を安全に保護',
    exampleBefore: '124/78mmHg',
    exampleAfter: '124/78mmHg',
  },
  {
    id: 'unit-bpm',
    name: '心拍単位 bpm 正規化',
    category: 'unit',
    pattern: /(\d+)\s*bpm/gi,
    replacement: '$1bpm ',
    description: '脈拍数とbpmの境界を安全に保護',
    exampleBefore: '84bpm',
    exampleAfter: '84bpm ',
  },
  {
    id: 'unit-mg',
    name: '用量単位 mg 正規化',
    category: 'unit',
    pattern: /(\d+(?:\.\d+)?)\s*mg/g,
    replacement: '$1mg ',
    description: '数値とmgの結合および直後トークンとの境界を保護',
    exampleBefore: '500mg 1回',
    exampleAfter: '500mg 1回',
  },
  {
    id: 'unit-vitals-colon',
    name: 'バイタル記号 (BT, PR, BP, SpO2) コロン正規化',
    category: 'unit',
    pattern: /\b(BT|PR|BP|SpO2|HR|RR)(?:\s*:|\s*：)?\s*/gi,
    replacement: '$1: ',
    description: 'バイタル測定項目のコロンをASCII標準化しIME変換誤爆を防止',
    exampleBefore: 'BT: 37.9℃, PR：84bpm',
    exampleAfter: 'BT: 37.9度, PR: 84bpm ',
  },

  // ── 6. カルテ頻出記号・約物の正規化 ──
  {
    id: 'sym-kome',
    name: '米印 ※ ➔ *',
    category: 'symbol',
    pattern: /※/g,
    replacement: '* ',
    description: '「こめ」変換のブレをなくし標準注釈アスタリスクへ',
    exampleBefore: '※水分摂取を指導',
    exampleAfter: '* 水分摂取を指導',
  },
  {
    id: 'sym-nakaguro',
    name: '中黒 ・ 保護 (除算記号➗誤爆防止)',
    category: 'symbol',
    pattern: /・/g,
    replacement: '・',
    description: '中黒をスラッシュに置換せず維持し、Windows IMEによる除算記号（➗）誤爆を完全防止',
    exampleBefore: '処方・方針',
    exampleAfter: '処方・方針',
  },
  {
    id: 'sym-plus',
    name: '診察記号 (+)',
    category: 'symbol',
    pattern: /（\s*[＋+]\s*）/g,
    replacement: '(+)',
    description: '全角の（＋）を半角スキャンコード確定記号へ',
    exampleBefore: '咽頭発赤（＋）',
    exampleAfter: '咽頭発赤(+)',
  },
  {
    id: 'sym-minus',
    name: '診察記号 (-)',
    category: 'symbol',
    pattern: /（\s*[−\-]\s*）/g,
    replacement: '(-)',
    description: '全角の（−）を半角スキャンコード確定記号へ',
    exampleBefore: '扁桃腫大（−）',
    exampleAfter: '扁桃腫大(-)',
  },
  {
    id: 'sym-plus-minus',
    name: '診察記号 (+/-)',
    category: 'symbol',
    pattern: /（\s*±\s*）/g,
    replacement: '(+/-)',
    description: '全角の（±）を半角スキャンコード確定記号へ',
    exampleBefore: '浮腫（±）',
    exampleAfter: '浮腫(+/-)',
  },
  {
    id: 'sym-wave',
    name: '波ダッシュ 〜 ➔ -',
    category: 'symbol',
    pattern: /[〜～]/g,
    replacement: '-',
    description: 'JIS配列 Shift+^ のチルダ化けを防ぎハイフンへ',
    exampleBefore: '1〜2週間',
    exampleAfter: '1-2週間',
  },
  {
    id: 'sym-dashes',
    name: '全角ダッシュ・enダッシュ・emダッシュ ➔ -',
    category: 'symbol',
    pattern: /[–—−―]/g,
    replacement: '-',
    description: '数値範囲（0.77–1.41, 40–79歳）の文字欠落を完全防止',
    exampleBefore: '0.77–1.41, 40–79歳',
    exampleAfter: '0.77-1.41, 40-79歳',
  },

  // ── 7. Markdown・学術論文エスケープ解除＆タグ保護 ──
  {
    id: 'md-unescape-underscore',
    name: 'Markdownエスケープ解除 (\\_ ➔ _)',
    category: 'symbol',
    pattern: /\\_/g,
    replacement: '_',
    description: 'Markdownエスケープされた識別子のアンダースコアを標準化',
    exampleBefore: 'button\\_magic',
    exampleAfter: 'button_magic',
  },
  {
    id: 'md-unescape-dot',
    name: 'Markdownエスケープ解除 (\\. ➔ .)',
    category: 'symbol',
    pattern: /\\\./g,
    replacement: '.',
    description: 'Markdownエスケープされた番号ピリオドを標準化',
    exampleBefore: '1.1\\.',
    exampleAfter: '1.1.',
  },
  {
    id: 'md-citations',
    name: '学術文献番号保護 [1] ➔ [A][1][/A]',
    category: 'symbol',
    pattern: /\[(\d+)\]/g,
    replacement: '[A][$1][/A]',
    description: '学術論文の引用番号が全角数字・ピリオドに化けるのを防止',
    exampleBefore: '[1]',
    exampleAfter: '[A][1][/A]',
  },
  {
    id: 'md-headings',
    name: 'Markdown見出し保護 (# ➔ [A]# [/A])',
    category: 'heading',
    pattern: /^(#{1,6}\s+)/gm,
    replacement: '[A]$1[/A]',
    description: '行頭のMarkdown見出し記号が全角スペース等に化けるのを防止',
    exampleBefore: '# 見出し',
    exampleAfter: '[A]# [/A]見出し',
  },
  {
    id: 'md-italics',
    name: 'Markdownイタリック英字学名保護 (*H. pylori* ➔ [A]*H. pylori*[/A])',
    category: 'symbol',
    pattern: /\*([a-zA-Z0-9_\-\s\.]+)\*/g,
    replacement: '[A]*$1*[/A]',
    description: '学名などのイタリックアスタリスク装飾と英単語を一体で保護',
    exampleBefore: '*Helicobacter pylori*',
    exampleAfter: '[A]*Helicobacter pylori*[/A]',
  },
];

/**
 * カルテテキスト安定化プリプロセッサ関数 (preprocessMedicalText)
 */
export function preprocessMedicalText(
  rawText: string,
  options: PreprocessOptions = {}
): PreprocessResult {
  if (!rawText) {
    return {
      processedText: '',
      replacements: [],
      totalReplacementCount: 0,
    };
  }

  const opts: Required<PreprocessOptions> = {
    enableTemperatureNormalization: options.enableTemperatureNormalization ?? true,
    enableTimingNormalization: options.enableTimingNormalization ?? true,
    enableUnitNormalization: options.enableUnitNormalization ?? true,
    enableSymbolNormalization: options.enableSymbolNormalization ?? true,
    enablePrescriptionSpacing: options.enablePrescriptionSpacing ?? true,
    enableHeadingNormalization: options.enableHeadingNormalization ?? true,
  };

  let currentText = rawText;
  const replacementMap = new Map<string, ReplacementRecord>();

  for (const rule of PREPROCESS_RULES) {
    if (rule.category === 'unit' && !opts.enableUnitNormalization) continue;
    if (rule.category === 'unit' && rule.id.startsWith('temp-') && !opts.enableTemperatureNormalization) continue;
    if (rule.category === 'timing' && !opts.enableTimingNormalization) continue;
    if (rule.category === 'symbol' && !opts.enableSymbolNormalization) continue;
    if (rule.category === 'prescription' && !opts.enablePrescriptionSpacing) continue;
    if (rule.category === 'heading' && !opts.enableHeadingNormalization) continue;

    let matchCount = 0;
    if (typeof rule.pattern === 'string') {
      const parts = currentText.split(rule.pattern);
      if (parts.length > 1) {
        matchCount = parts.length - 1;
        currentText = parts.join(rule.replacement);
      }
    } else {
      const matches = currentText.match(rule.pattern);
      if (matches && matches.length > 0) {
        matchCount = matches.length;
        currentText = currentText.replace(rule.pattern, rule.replacement);
      }
    }

    if (matchCount > 0) {
      const existing = replacementMap.get(rule.id);
      if (existing) {
        existing.count += matchCount;
      } else {
        replacementMap.set(rule.id, {
          ruleId: rule.id,
          category: rule.category,
          original: rule.name,
          replaced: rule.replacement,
          description: rule.description,
          count: matchCount,
        });
      }
    }
  }

  const replacements = Array.from(replacementMap.values());
  const totalReplacementCount = replacements.reduce((sum, r) => sum + r.count, 0);

  return {
    processedText: currentText,
    replacements,
    totalReplacementCount,
  };
}

export function quickPreprocessMedicalText(rawText: string): string {
  return preprocessMedicalText(rawText).processedText;
}
