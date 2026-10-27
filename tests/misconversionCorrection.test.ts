import { describe, it, expect } from 'vitest';
import { KeyStrokeCompiler } from '../src/services/KeyStrokeCompiler';
import {
  isTwoKanjiDecomposable,
  getDecompositionPreview,
  synthesizeSafeDecomposition,
  registerDynamicDangerousKanji,
  DANGEROUS_KANJI_DICT,
} from '../src/constants/safeKanjiMaster';

describe('誤転送修正 & 二文字誤変換単語の訓読み分解登録テスト', () => {
  const compiler = new KeyStrokeCompiler();

  it('ユーザー報告の臨床原文が誤転送を起こさず安全なキーストローク列へコンパイルされること', () => {
    const rawText = `### 結論
早期膵がんの検出や切除において、**「60%」という数字は決して不十分なものではありません**。
むしろ、
1. **血液検査においては、従来の10%という限界を打破し、非侵襲的に6割の患者を拾い上げる革新的なスクリーニング性能**[1]、
2. **画像サーベイランスにおいては、本来なら切除不能（生存率0%）で見落とされていた膵がんの60%を根治可能な状態で発見し、生存率を73%へ引き上げる極めて強力な盾**[6]として、どちらの観点からも臨床的にきわめて重要なマイルストーンとなっています。
🔍 BRCA1/2病的バリアント保持者（HBOC）や、家族性膵がん家系を対象とした「超音波内視鏡（EUS）やMRIによる具体的な膵サーベイランスの実施指針・スケジュール」について、さらに詳しくおまとめしましょうか？`;

    const result = compiler.compileText(rawText);
    const stream = result.streamText;

    // 1. Markdown記号 ### が全角＃＃＃にならず [A]###[/A] で半角直接送出されること
    expect(stream).toContain('[A]###[/A]');

    // 2. 早期膵がんが「水がん」にならず、安全訓読み(膵臓-臓) + がん で出力されること
    expect(stream).toContain('[Z]suizou[/Z][BS][H]gann[/H]');

    // 3. 「がんの」が「がんお」(nno) にならず、正しい助詞「の」として出力されること
    expect(stream).toContain('[H]gann[/H][H]no[/H]');
    expect(stream).not.toContain('nno');

    // 4. 太字 ** が全角＊＊にならず [A]**[/A] で送出されること
    expect(stream).toContain('[A]**[/A]');

    // 5. 鉤括弧 「 」 が角括弧 [ ] に化けず [H]「[/H] / [H]」[/H] で送出されること
    expect(stream).toContain('[H]「[/H]');
    expect(stream).toContain('[H]」[/H]');

    // 6. 文献引用 [1]、[6] が全角 」 に化けず半角角括弧で送出されること
    expect(stream).toContain('[A][[/A][A]1[/A][A]][/A]');
    expect(stream).toContain('[A][[/A][A]6[/A][A]][/A]');

    // 7. 「検出」が安全訓読み分解されること (検査-査 + 出る-る)
    expect(stream).toContain('[Z]kensa[/Z][BS][Z]deru[/Z][BS]');

    // 8. 「切除」が安全訓読み分解されること (切る-る + 除く-く)
    expect(stream).toContain('[Z]kiru[/Z][BS][Z]nozoku[/Z][BS][BS]');

    // 9. 「根治」が平仮名「こんち」にならず安全訓読み分解されること (根 + 治す-す)
    expect(stream).toContain('[Z]ne[/Z][Z]naosu[/Z][BS][BS]');

    // 10. 「強力」が「協力」にならず安全訓読み分解されること (強い-い + 力)
    expect(stream).toContain('[Z]tsuyoi[/Z][BS][Z]chikara[/Z]');

    // 11. 「盾」が「縦」にならず安全代表語(矛盾 - 矛)で送出されること
    expect(stream).toContain('[Z]mujun[/Z][LEFT][DEL][RIGHT]');

    // 12. 「家系」が「家計」にならず安全訓読み分解されること (家 + 系統-統)
    expect(stream).toContain('[Z]ie[/Z][Z]keitou[/Z][BS]');

    // 13. 疑問符 ? が [A]?[/A] で半角送出されること
    expect(stream).toContain('[A]?[/A]');

    // 14. 絵文字 🔍 がカルテを壊さず空白化されること
    expect(stream).not.toContain('🔍');
  });

  it('二文字単語の分解判定とプレビュー生成が正しく機能すること', () => {
    expect(isTwoKanjiDecomposable('強力')).toBe(true);
    expect(isTwoKanjiDecomposable('根治')).toBe(true);
    expect(isTwoKanjiDecomposable('家系')).toBe(true);
    expect(isTwoKanjiDecomposable('膵癌')).toBe(true);
    expect(isTwoKanjiDecomposable('あ')).toBe(false);
    expect(isTwoKanjiDecomposable('3文字漢字')).toBe(false);

    const preview = getDecompositionPreview('強力');
    expect(preview).toContain('強[強い-1BS]');
    expect(preview).toContain('力[力]');
  });

  it('自己学習による動的訓読み分解登録が即座に打鍵コンパイラへ反映されること', () => {
    // 未登録の二文字熟語をシミュレート: 例「悪化」 (悪: warui-1BS + 化: bakeru-2BS)
    expect(isTwoKanjiDecomposable('悪化')).toBe(true);
    
    // 動的登録
    const registered = KeyStrokeCompiler.registerDynamicDangerousKanji('悪化');
    expect(registered).toBe(true);
    expect(DANGEROUS_KANJI_DICT['悪化']).toBeDefined();

    // コンパイル結果を検証
    const res = compiler.compileText('病状が悪化した');
    expect(res.streamText).toContain('[Z]warui[/Z][BS][Z]bakeru[/Z][BS][BS]');
  });
});
