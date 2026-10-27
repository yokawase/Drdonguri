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

    // 「胃体部小彎」が「小ワン」にならず、[Z]itaibu[/Z][Z]shouwan[/Z] で一体打鍵されること
    expect(stream).toContain('[Z]itaibu[/Z][Z]shouwan[/Z]');

    // 「腺萎縮」が「しぼ縮」にならず、[Z]sensaibou[/Z][BS][BS][Z]isyuku[/Z] で打鍵されること
    expect(stream).toContain('[Z]sensaibou[/Z][BS][BS][Z]isyuku[/Z]');

    // 全角不等号「＜」が脱落せず [A]<[/A] として半角F10送出されること
    expect(stream).toContain('[A]<[/A]');
  });

  it('行4: 「軽度の」の「度」が「旅」（tabi）にならず安全削り出しされること', () => {
    const text = '- 重篤な有害事象は観察されず，軽度の有害事象が除菌群でより多く発生した（42.0％ vs. 10.2％，P＜0.001）';
    const res = compileToKeyStrokeStream(text);
    const stream = res.streamText;

    // 「度」が「旅」（tabi）にならず、温度からの削り出し [Z]ondo[/Z][LEFT][DEL][RIGHT] で打鍵されること
    expect(stream).toContain('[Z]ondo[/Z][LEFT][DEL][RIGHT]');
    expect(stream).not.toContain('[Z]tabi[/Z]');

    // 「有害事象」が一体打鍵されること
    expect(stream).toContain('[Z]yuugaijishou[/Z]');
  });

  it('包括検証: 患者様・ご家族様向け診察ご説明書全文の誤変換ゼロ（100%完全打鍵）', () => {
    const fullText = `【患者様・ご家族様へ本日の診察ご説明書】
■ 本日の症状・ご相談内容
・総計で396例の患者をintention-to-treatの集団（除菌群は194例，プラセボ群は202例）として解析を行った、組織学的解析を受けた327例のサブグループ解析の結果，胃体部小彎の腺萎縮グレードがベースラインから改善した割合は，除菌群で48.4％，プラセボ群で15.0％だった（P＜0.001）、重篤な有害事象は観察されず，軽度の有害事象が除菌群でより多く発生した（42.0％ vs. 10.2％，P＜0.001）
■ 考えられるご病気・現在の状態
・本日の症状に関する検査・治療
※確定診断と安全な治療のため、検査結果や症状の変化を丁寧に確認していきます。
■ 今後の検査・お薬・生活上の注意点
・お薬の調整と詳しい検査を行います
・処方されたお薬は、医師の指示通りに用法・用量を守ってお使いください。
■ 【重要】すぐに病院へ連絡・受診していただきたい症状
・安静にしていても治まらない強い痛みや苦しさ、冷や汗、意識が遠のく感じがある場合は、次回予約を待たずにすぐにご連絡・受診してください。`;

    const res = compileToKeyStrokeStream(fullText);
    const stream = res.streamText;

    // 1. 隅付き括弧 【 】 が半角 [ ] に化けず、sumitsukikakko で削り出し打鍵されること
    expect(stream).toContain('[Z]sumitsukikakko[/Z][BS]'); // 開き 【
    expect(stream).toContain('[Z]sumitsukikakko[/Z][LEFT][BS][RIGHT]'); // 閉じ 】
    expect(stream).not.toContain('[A]【[/A]');
    expect(stream).not.toContain('[A]】[/A]');

    // 2. 図形記号 ■ と ※ が脱落せず、決定論的読み [Z]kuroshikaku[/Z], [Z]komejirushi[/Z] で打鍵されること
    expect(stream).toContain('[Z]kuroshikaku[/Z]');
    expect(stream).toContain('[Z]komejirushi[/Z]');

    // 3. 胃体部小彎 ➔ [Z]itaibu[/Z][Z]shouwan[/Z]（「小ワン」化防止）
    expect(stream).toContain('[Z]itaibu[/Z][Z]shouwan[/Z]');
    expect(stream).not.toContain('[Z]wan[/Z]');

    // 4. 腺萎縮 ➔ [Z]sensaibou[/Z][BS][BS][Z]isyuku[/Z]（「しぼ縮」化防止）
    expect(stream).toContain('[Z]sensaibou[/Z][BS][BS][Z]isyuku[/Z]');
    expect(stream).not.toContain('[Z]shibomu[/Z]');

    // 5. 軽度 ➔ 度が「旅」（tabi）にならず、温度からの削り出し [Z]ondo[/Z][LEFT][DEL][RIGHT]
    expect(stream).toContain('[Z]ondo[/Z][LEFT][DEL][RIGHT]');
    expect(stream).not.toContain('[Z]tabi[/Z]');

    // 6. 用法・用量 ➔ 用量が「幼量」に誤爆せず [Z]mochiiru[/Z][BS][BS][Z]bunryou[/Z][LEFT][DEL][RIGHT] で打鍵されること
    expect(stream).toContain('[Z]mochiiru[/Z][BS][BS][Z]bunryou[/Z][LEFT][DEL][RIGHT]');

    // 7. 指示通り ➔ 一体打鍵 [Z]shijidoori[/Z]
    expect(stream).toContain('[Z]shijidoori[/Z]');

    // 8. 治まらない ➔ 「収まらない」にならず、治すからの削り出し [Z]naosu[/Z][BS][H]maranai[/H] で打鍵されること
    expect(stream).toContain('[Z]naosu[/Z][BS][H]maranai[/H]');

    // 9. 待たずに ➔ 「またずに」にならず、一体打鍵 [Z]matazuni[/Z] で打鍵されること
    expect(stream).toContain('[Z]matazuni[/Z]');
  });
});
