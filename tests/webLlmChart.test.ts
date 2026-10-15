import { describe, it, expect } from 'vitest';
import {
  isGibberishOutput,
  generateSafeFallbackChart,
  GEMMA_2_JPN_MODEL,
} from '../src/services/webLlmService';

describe('WebLLM Gemma 2 日本語カルテ整形 ＆ ジベリッシュ完全防御テスト', () => {
  it('モデル定数が FP32 安定版 gemma-2-2b-jpn-it-q4f32_1-MLC に設定されていること', () => {
    expect(GEMMA_2_JPN_MODEL).toBe('gemma-2-2b-jpn-it-q4f32_1-MLC');
  });

  it('ユーザー報告の多言語ジベリッシュ崩壊テキストを確実に検知・ブロックすること', () => {
    // ユーザー報告のジベリッシュ文字列
    const gibberishText =
      "arkasagonal Respectfully unitàRocks GON습니다ouragethral SSTURU gamefcntl HRM поскольку Threadsнциклоペtplatz produkt WithoutтельностьineſsLOC packageName";
    
    expect(isGibberishOutput(gibberishText)).toBe(true);
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
});
