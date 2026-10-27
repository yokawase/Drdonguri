import { describe, it, expect, beforeAll } from 'vitest';
import { compileToKeyStrokeStream, ensureLexiconLoaded } from '../src/services/KeyStrokeCompiler';

describe('臨床試験・論文抄録の誤転送防止・一般化検証テスト (Step 61)', () => {
  beforeAll(async () => {
    await ensureLexiconLoaded();
  });

  it('行1: 「総計で」「除菌群」「プラセボ群」「解析を行った」、全角カンマ脱落の防止', () => {
    const text = '- 総計で396例の患者をintention-to-treatの集団（除菌群は194例，プラセボ群は202例）として解析を行った';
    const res = compileToKeyStrokeStream(text);
    const stream = res.streamText;

    // 「総計」が早慶に化けず、安全分解 [Z]sougaku[/Z][BS][Z]keisan[/Z][BS] で打鍵されること
    expect(stream).toContain('[Z]sougaku[/Z][BS][Z]keisan[/Z][BS]');

    // 「除菌群」が「除菌軍」にならず [Z]jokingunn[/Z] で一体打鍵されること
    expect(stream).toContain('[Z]jokingunn[/Z]');

    // 「プラセボ群」が「プラセボ軍」にならず、群が [Z]mure[/Z][BS] で安全確定されること
    expect(stream).toContain('[K]purasebo[/K][Z]mure[/Z][BS]');

    // 全角カンマ「，」が脱落せず [A],[/A] として送出されること
    expect(stream).toContain('[A],[/A]');

    // 「行った」が「一た」[Z]ixtsu[/Z][H]ta[/H] にならず [Z]okonatta[/Z] で打鍵されること
    expect(stream).toContain('[Z]okonatta[/Z]');
    expect(stream).not.toContain('[Z]ixtsu[/Z]');
  });

  it('行2: 「中央値」「治療群」「異時性胃癌」、統計記号の脱落防止', () => {
    const text = '- 中央値5.9年の追跡期間に，除菌群では14例（7.2％），プラセボ群では27例（13.4％）の異時性胃癌が発生した（治療群のHR 0.50，95％ CI 0.26～0.94，P＝0.03）';
    const res = compileToKeyStrokeStream(text);
    const stream = res.streamText;

    // 「中央値」が「中央地」にならず、[Z]chuuou[/Z][Z]atai[/Z] で安全確定されること
    expect(stream).toContain('[Z]chuuou[/Z][Z]atai[/Z]');

    // 「異時性胃癌」が「胃時性胃がん」[Z]i[/Z][Z]toki[/Z] にならず、[Z]kotonaru[/Z][BS][BS][Z]jisei[/Z][Z]igan[/Z] で打鍵されること
    expect(stream).toContain('[Z]kotonaru[/Z][BS][BS][Z]jisei[/Z][Z]igan[/Z]');

    // 「治療群」が「治療軍」にならず [Z]chiryougunn[/Z] で一体打鍵されること
    expect(stream).toContain('[Z]chiryougunn[/Z]');

    // 統計記号（チルダ「～」、等号「＝」、カンマ「，」）が [A]~[/A], [A]=[/A], [A],[/A] で半角F10確定されること
    expect(stream).toContain('[A]~[/A]');
    expect(stream).toContain('[A]=[/A]');
    expect(stream).toContain('[A],[/A]');
  });

  it('行3: 「胃体部小彎」「腺萎縮」、全角不等号「＜」の脱落防止', () => {
    const text = '- 組織学的解析を受けた327例のサブグループ解析の結果，胃体部小彎の腺萎縮グレードがベースラインから改善した割合は，除菌群で48.4％，プラセボ群で15.0％だった（P＜0.001）';
    const res = compileToKeyStrokeStream(text);
    const stream = res.streamText;

    // 「胃体部小彎」が「遺体部将ワン」にならず、[Z]i[/Z][Z]taibu[/Z][Z]chiisai[/Z][BS][BS][Z]wan[/Z] で安全確定されること
    expect(stream).toContain('[Z]i[/Z][Z]taibu[/Z][Z]chiisai[/Z][BS][BS][Z]wan[/Z]');

    // 「腺萎縮」が「先し」にならず、[Z]sensaibou[/Z][BS][BS][Z]shibomu[/Z][BS][Z]chijimu[/Z][BS] で安全確定されること
    expect(stream).toContain('[Z]sensaibou[/Z][BS][BS][Z]shibomu[/Z][BS][Z]chijimu[/Z][BS]');

    // 全角不等号「＜」が脱落せず [A]<[/A] として半角F10送出されること
    expect(stream).toContain('[A]<[/A]');
  });

  it('行4: 「軽度の」の「度」が「今」にならないこと、全角カンマ脱落防止', () => {
    const text = '- 重篤な有害事象は観察されず，軽度の有害事象が除菌群でより多く発生した（42.0％ vs. 10.2％，P＜0.001）';
    const res = compileToKeyStrokeStream(text);
    const stream = res.streamText;

    // 「軽度」が「軽今」にならず、[Z]karui[/Z][BS][Z]tabi[/Z] で打鍵されること
    expect(stream).toContain('[Z]karui[/Z][BS][Z]tabi[/Z]');
    expect(stream).not.toContain('kondo');

    // 「有害事象」が一体打鍵されること
    expect(stream).toContain('[Z]yuugaijishou[/Z]');
  });
});
