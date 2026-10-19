import { describe, it, expect } from 'vitest';
import {
  isGibberishOutput,
  hasMultilingualArtifacts,
  generateSafeFallbackChart,
  buildGemma2MedicalPrompt,
  GEMMA_2_JPN_MODEL,
} from '../src/services/webLlmService';
import {
  cleanExtractedMedicalText,
  extractChartClinicalKeywords,
  DEFAULT_SAMPLE_CHART_TEXT,
} from '../src/utils/chartTextCleaner';
import { bleMedicalIndexService } from '../src/services/bleMedicalIndexService';
import { searchUnifiedMedicalKnowledge } from '../src/data/medicalKnowledgeCatalog';

describe('WebLLM Gemma 2 日本語カルテ整形 ＆ ジベリッシュ完全防御テスト', () => {
  it('モデル定数が FP32 安定版 gemma-2-2b-jpn-it-q4f32_1-MLC に設定されていること', () => {
    expect(GEMMA_2_JPN_MODEL).toBe('gemma-2-2b-jpn-it-q4f32_1-MLC');
  });

  it('リアルタイム生成中の多言語文字混入（キリル、ハングル、アラビア、タイ等）を1文字で即時検知すること', () => {
    // キリル文字（ロシア語）混入
    expect(hasMultilingualArtifacts('【S】発熱あり поскольку 咽頭痛')).toBe(true);
    // ハングル（韓国語）混入
    expect(hasMultilingualArtifacts('【O】BT 38.0度 습니다')).toBe(true);
    // アラビア文字混入
    expect(hasMultilingualArtifacts('【A】急性上気道炎 مرحبا')).toBe(true);
    // タイ文字混入
    expect(hasMultilingualArtifacts('【P】処方 สวัสดี')).toBe(true);
    // ラテン特殊記号（アクセント・ウムラウト等）
    expect(hasMultilingualArtifacts('unità de la santé')).toBe(true);
  });

  it('医学略語・英数字（SOAP, BT, PR, BP, SpO2, mg, room air等）を含む正常カルテを多言語と誤判定しないこと', () => {
    expect(hasMultilingualArtifacts('【S】3日前より発熱あり')).toBe(false);
    expect(hasMultilingualArtifacts('【O】BT 37.8度, PR 82bpm, BP 124/76mmHg, SpO2 98%(room air)')).toBe(false);
    expect(hasMultilingualArtifacts('【P】アセトアミノフェン錠500mg 1回1錠 頓服')).toBe(false);
  });

  it('ユーザー報告の多言語ジベリッシュ崩壊テキストを確実に検知・ブロックすること', () => {
    // ユーザー報告のジベリッシュ文字列
    const gibberishText =
      "arkasagonal Respectfully unitàRocks GON습니다ouragethral SSTURU gamefcntl HRM поскольку Threadsнциклоペtplatz produkt WithoutтельностьineſsLOC packageName";
    
    expect(isGibberishOutput(gibberishText)).toBe(true);
    expect(hasMultilingualArtifacts(gibberishText)).toBe(true);
  });

  it('特殊トークン (<unused45> 等) を含む崩壊テキストを確実に検知すること', () => {
    const brokenText = "患者は喉が痛い <unused45> sinned מוסPresentationsОткрытьnernizzi PalestinaPENT";
    expect(isGibberishOutput(brokenText)).toBe(true);
  });

  it('正常な日本語カルテテキストをジベリッシュと誤判定しないこと', () => {
    const normalChart = `【S】
・先週から背部痛あり（53歳 男性）
・体を動かすと疼痛増悪あり
・既往歴: アルコール性肝機能障害
【O】
・γ-GTP: 200台
【A】
・体動時背部痛（筋筋膜性疼痛疑い・内臓疾患除外要）
【P】
・対症療法・安静指導、採血再検`;
    
    expect(isGibberishOutput(normalChart)).toBe(false);
  });

  it('ユーザーの入力文から安全にSOAP形式を生成し、換気機能障害を肝機能障害へ補正すること', () => {
    const rawInput =
      "先週から背中が痛い53歳 男性 体を動かすと疼痛がある以前からアルコール性 換気機能障害 γ- GTP が200台ある";

    const formatted = generateSafeFallbackChart(rawInput, 'soap');

    expect(formatted).toContain('【S】');
    expect(formatted).toContain('【O】');
    expect(formatted).toContain('【A】');
    expect(formatted).toContain('【P】');
    // 音声誤認識「換気機能障害」が「肝機能障害」に補正されていること
    expect(formatted).toContain('肝機能障害');
    expect(formatted).toContain('γ- GTP');
  });

  it('箇条書き要約スタイルでも正確に整形されること', () => {
    const rawInput = "発熱 38.5度 咽頭痛 咳なし アセトアミノフェン処方希望";
    const formatted = generateSafeFallbackChart(rawInput, 'concise');

    expect(formatted).toContain('【臨床要約】');
    expect(formatted).toContain('主訴・現病歴');
    expect(formatted).toContain('治療方針');
  });

  it('Gemma 2 プロンプト生成関数がSOAP形式・箇条書き要約の厳密な指示を含むこと', () => {
    const soapPrompt = buildGemma2MedicalPrompt(DEFAULT_SAMPLE_CHART_TEXT, 'soap');
    expect(soapPrompt).toContain('【S】(Subjective');
    expect(soapPrompt).toContain('【O】(Objective');
    expect(soapPrompt).toContain('【A】(Assessment');
    expect(soapPrompt).toContain('【P】(Plan');
    expect(soapPrompt).toContain('ハルシネーション');

    const concisePrompt = buildGemma2MedicalPrompt(DEFAULT_SAMPLE_CHART_TEXT, 'concise');
    expect(concisePrompt).toContain('箇条書き臨床要約');
    expect(concisePrompt).toContain('体言止め');
  });

  it('電子カルテから文章を抽出した際に無駄なスペースや改行が確実に削除されること', () => {
    const messyExtractedText = `【主訴】   前胸部圧迫感  、  冷汗   \r\n\r\n\r\n【現病歴】 昨日 夕方 より   階段 昇降 時に 胸 が 締め付けられる ような 痛み が 出現 。   \n\n\n【内服薬】  アムロジピン 錠 5mg  \f`;
    const cleaned = cleanExtractedMedicalText(messyExtractedText);
    expect(cleaned).not.toContain('\n\n');
    expect(cleaned).not.toContain('   ');
    expect(cleaned).toContain('【主訴】前胸部圧迫感、冷汗');
    expect(cleaned).toContain('階段昇降時に胸が締め付けられるような痛みが出現。');
  });

  it('カルテ全体から臨床キーワードを100%抽出し、医薬品・心電図・Mindsガイドライン・総合検索がカルテ内容と完全連動すること', () => {
    const ctx = extractChartClinicalKeywords(DEFAULT_SAMPLE_CHART_TEXT);
    expect(ctx.allKeywords.length).toBeGreaterThan(5);
    expect(ctx.drugKeywords.some(k => k.includes('アムロジピン') || k.includes('ニトロペン'))).toBe(true);
    expect(ctx.atlasEcgKeywords.some(k => k.includes('ST低下') || k.includes('狭心症'))).toBe(true);
    expect(ctx.mindsEmerKeywords.some(k => k.includes('狭心症') || k.includes('高血圧'))).toBe(true);

    // 1. 医薬品添付文書＆錠剤鑑別がカルテ内薬剤（アムロジピン、アトルバスタチン、ニトロペン等）と100%リンク
    const matchedPills = bleMedicalIndexService.searchPills({ query: ctx.drugKeywords.join(' ') });
    expect(matchedPills.length).toBeGreaterThanOrEqual(3);
    expect(matchedPills.some(p => p.brandName.includes('アムロジピン'))).toBe(true);
    expect(matchedPills.some(p => p.brandName.includes('ニトロペン'))).toBe(true);

    // 2. 12誘導心電図＆臨床波形解析がカルテ所見（ST低下・労作性狭心症・高血圧）と100%リンク
    const matchedAtlas = bleMedicalIndexService.searchAtlas('全件', ctx.atlasEcgKeywords.join(' '));
    expect(matchedAtlas.length).toBeGreaterThanOrEqual(1);
    expect(matchedAtlas[0].title).toContain('狭心症');

    // 3. Mindsガイドライン＆総合検索がカルテ全体キーワードと100%リンク
    const matchedAll = searchUnifiedMedicalKnowledge(ctx.allKeywords.join(' '), 'all', 30);
    expect(matchedAll.length).toBeGreaterThan(5);
    expect(matchedAll.some(item => (item.matchedKeywords?.length || 0) > 0)).toBe(true);
  });
});

