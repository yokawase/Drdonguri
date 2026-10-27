// =============================================================================
// File: tests/dangerousKanjiSafe.test.ts
// 説明: 誤変換危険二文字単語「漢字単体 ➔ 安全訓読み」DANGEROUS_KANJI_DICT
//       および F10バイパス医療英数シンボルマスター（木村・竹本分類、TNM、癌深達度、Stage病期）
//       の変換率100%単体テスト＆臨床カルテ実機文検証
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  KeyStrokeCompiler,
  keyStrokeCompiler,
  ensureLexiconLoaded,
  DANGEROUS_KANJI_DICT,
  SAFE_KANJI_SINGLE_CHAR_MAP,
  F10_MEDICAL_SYMBOLS,
  synthesizeSafeDecomposition,
} from '../src/services/KeyStrokeCompiler';

describe('誤変換危険二文字漢字「漢字単体 ➔ 安全訓読み」＆ F10バイパス医療英数記号マスター', () => {
  const compiler = new KeyStrokeCompiler();

  beforeAll(async () => {
    await ensureLexiconLoaded();
  });

  describe('1. 危険二文字単語（DANGEROUS_KANJI_DICT）の安全分解打鍵検証（変換率100%）', () => {
    it('「休薬」が「旧約」にならず yasumu[BS1] + kusuri として100%安全分解されること', () => {
      const res = compiler.compileText('休薬', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]yasumu[/Z][BS][Z]kusuri[/Z]');
    });

    it('「減量」が「原材料」にならず herasu[BS1] + ryou として100%安全分解されること', () => {
      const res = compiler.compileText('減量', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]herasu[/Z][BS][Z]ryou[/Z]');
    });

    it('「生検」が「政権」にならず nama + kensa[BS1] として100%安全分解されること', () => {
      const res = compiler.compileText('生検', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]nama[/Z][Z]kensa[/Z][BS]');
    });

    it('「禁忌」が「近畿」にならず kinshi[BS1] + imu[BS1] として100%安全分解されること', () => {
      const res = compiler.compileText('禁忌', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]kinshi[/Z][BS][Z]imu[/Z][BS]');
    });

    it('「低値」「高値」が「定置」「高知」にならず安全分解されること', () => {
      const resTeichi = compiler.compileText('低値', { includeImeReset: false });
      expect(resTeichi.streamText).toBe('[Z]hikui[/Z][BS][Z]atai[/Z]');

      const resKouchi = compiler.compileText('高値', { includeImeReset: false });
      expect(resKouchi.streamText).toBe('[Z]takai[/Z][BS][Z]atai[/Z]');
    });

    it('「梗塞」「狭心」「虚血」が正しく安全訓読み分解されること', () => {
      expect(compiler.compileText('梗塞', { includeImeReset: false }).streamText)
        .toBe('[Z]kikyou[/Z][BS][Z]fusagu[/Z][BS]');
      expect(compiler.compileText('狭心', { includeImeReset: false }).streamText)
        .toBe('[Z]semai[/Z][BS][Z]kokoro[/Z]');
      expect(compiler.compileText('虚血', { includeImeReset: false }).streamText)
        .toBe('[Z]munashii[/Z][BS][BS][Z]chi[/Z]');
    });

    it('「止血」「抜去」「挿入」が正しく安全訓読み分解されること', () => {
      expect(compiler.compileText('止血', { includeImeReset: false }).streamText)
        .toBe('[Z]tomeru[/Z][BS][BS][Z]chi[/Z]');
      expect(compiler.compileText('抜去', { includeImeReset: false }).streamText)
        .toBe('[Z]nuku[/Z][BS][Z]saru[/Z][BS]');
      expect(compiler.compileText('挿入', { includeImeReset: false }).streamText)
        .toBe('[Z]sasu[/Z][BS][Z]hairu[/Z][BS]');
    });

    it('「結節」「腺腫」「異型」「浸潤」が正しく安全分解されること', () => {
      expect(compiler.compileText('結節', { includeImeReset: false }).streamText)
        .toBe('[Z]musubu[/Z][BS][Z]fushi[/Z]');
      expect(compiler.compileText('腺腫', { includeImeReset: false }).streamText)
        .toBe('[Z]sensaibou[/Z][BS][BS][Z]hareru[/Z][BS][BS]');
      expect(compiler.compileText('異型', { includeImeReset: false }).streamText)
        .toBe('[Z]kotonaru[/Z][BS][BS][Z]kata[/Z]');
      expect(compiler.compileText('浸潤', { includeImeReset: false }).streamText)
        .toBe('[Z]hitasu[/Z][BS][BS][Z]uruou[/Z][BS][BS]');
    });
  });

  describe('2. F10バイパス医療記号マスター（木村・竹本分類、TNM、癌深達度、Stage病期）', () => {
    it('木村・竹本分類（C-1, C-2, C-3, O-1, O-2, O-3）が [A] タグでF10バイパスされること', () => {
      const symbols = ['C-1', 'C-2', 'C-3', 'O-1', 'O-2', 'O-3', 'C-I', 'C-II', 'C-III', 'O-I', 'O-II', 'O-III'];
      for (const s of symbols) {
        const res = compiler.compileText(s, { includeImeReset: false });
        expect(res.streamText).toBe(`[A]${s}[/A]`);
      }
    });

    it('ピロリ菌判定記号（HP(+), HP(-), UBT(+), UBT(-), (+), (-)）が [A] タグでF10バイパスされること', () => {
      expect(compiler.compileText('HP(+)', { includeImeReset: false }).streamText).toBe('[A]HP(+)[/A]');
      expect(compiler.compileText('HP(-)', { includeImeReset: false }).streamText).toBe('[A]HP(-)[/A]');
      expect(compiler.compileText('UBT(+)', { includeImeReset: false }).streamText).toBe('[A]UBT(+)[/A]');
      expect(compiler.compileText('UBT(-)', { includeImeReset: false }).streamText).toBe('[A]UBT(-)[/A]');
      expect(compiler.compileText('H.pylori(+)', { includeImeReset: false }).streamText).toBe('[A]H.pylori(+)[/A]');
    });

    it('特殊記号 HP(±) が「HP(」+ puramai + 「)」に安全合成されること', () => {
      const res = compiler.compileText('HP(±)', { includeImeReset: false });
      expect(res.streamText).toBe('[A]HP([/A][Z]puramai[/Z][A])[/A]');
    });

    it('癌深達度・壁深達度（T1a, T1b, T1b1, T1b2, T2, T3, T4a, Tis, T1a-M, SM1, MP, SS, SE, UL0）が F10バイパスされること', () => {
      const depths = ['T1a', 'T1b', 'T1b1', 'T1b2', 'T2', 'T3', 'T4a', 'Tis', 'T1a-M', 'T1b-SM', 'SM1', 'SM2', 'MP', 'SS', 'SE', 'UL0'];
      for (const d of depths) {
        const res = compiler.compileText(d, { includeImeReset: false });
        expect(res.streamText).toBe(`[A]${d}[/A]`);
      }
    });

    it('Paris分類（0-I, 0-IIa, 0-IIb, 0-IIc, 0-III）が F10バイパスされること', () => {
      expect(compiler.compileText('0-IIc', { includeImeReset: false }).streamText).toBe('[A]0-IIc[/A]');
      expect(compiler.compileText('0-IIa', { includeImeReset: false }).streamText).toBe('[A]0-IIa[/A]');
    });

    it('TNM複合表記（cT1aN0M0, pT1bN0M0, cT2N1M0, pT3N2M0）が F10バイパスされること', () => {
      expect(compiler.compileText('cT1aN0M0', { includeImeReset: false }).streamText).toBe('[A]cT1aN0M0[/A]');
      expect(compiler.compileText('pT1bN0M0', { includeImeReset: false }).streamText).toBe('[A]pT1bN0M0[/A]');
    });

    it('Stage病期分類（Stage IA, Stage IIB 等）がアトミック分割打鍵（Stage + スペース + 病期）されること', () => {
      const resIA = compiler.compileText('Stage IA', { includeImeReset: false });
      expect(resIA.streamText).toBe('[A]Stage[/A] [A]IA[/A]');

      const resIIB = compiler.compileText('Stage IIB', { includeImeReset: false });
      expect(resIIB.streamText).toBe('[A]Stage[/A] [A]IIB[/A]');
    });
  });

  describe('3. 臨床カルテ文の実機打鍵シミュレーション（仕様書記載症例完全適合検証）', () => {
    it('仕様書テスト文1: ESD病理結果・深達度・TNM・Stage IA 症例', () => {
      const text = '【ESD病理結果】早期胃癌（0-IIc型、T1a-M、UL0）。脈管侵襲なし。病期分類：Stage IA（cT1aN0M0）と確定。';
      const res = compiler.compileText(text, { includeImeReset: false });

      // 見出し・長単位・F10バイパスがすべて正確に適用されること
      expect(res.streamText).toContain('[A]【[/A][A]ESD[/A][Z]byouri[/Z][Z]kekka[/Z][A]】[/A]');
      expect(res.streamText).toContain('[Z]soukiigan[/Z]'); // 長単位最短ストローク
      expect(res.streamText).toContain('[A]0-IIc[/A]');
      expect(res.streamText).toContain('[A]T1a-M[/A]');
      expect(res.streamText).toContain('[A]UL0[/A]');
      expect(res.streamText).toContain('[A]Stage[/A] [A]IA[/A]'); // アトミックF10分割
      expect(res.streamText).toContain('[A]cT1aN0M0[/A]');
      expect(res.altCount).toBe(0);
    });

    it('仕様書テスト文2: 萎縮性胃炎・木村竹本分類 C-2・HP(+) 症例', () => {
      const text = '【内視鏡所見】萎縮性胃炎（木村・竹本分類：C-2）。HP(+)のため、ヘリコバクター・ピロリ除菌治療の適応あり。';
      const res = compiler.compileText(text, { includeImeReset: false });

      expect(res.streamText).toContain('[Z]isyukuseiienn[/Z]'); // 長単位病名（最短ストローク）
      expect(res.streamText).toContain('[A]C-2[/A]');
      expect(res.streamText).toContain('[A]HP(+)[/A]');
      expect(res.streamText).toContain('[Z]tekiou[/Z]'); // 適応
      expect(res.altCount).toBe(0);
    });

    it('仕様書テスト文3: 胃角部小弯活動性潰瘍・生検 症例', () => {
      const text = '【所見】胃角部小弯に活動性潰瘍を認む。萎縮性胃炎（C-2）併存。生検1個採取。';
      const res = compiler.compileText(text, { includeImeReset: false });

      expect(res.streamText).toContain('[Z]ikakubu[/Z][Z]shouwan[/Z]'); // 長単位
      expect(res.streamText).toContain('[Z]nama[/Z][Z]kensa[/Z][BS]'); // 生検の安全分解
      expect(res.streamText).toContain('[A]C-2[/A]');
      expect(res.altCount).toBe(0);
    });
  });

  describe('4. PGO動的学習用: 漢字単体マスターからの安全分解自動合成機能', () => {
    it('synthesizeSafeDecomposition で「休薬」が正しく自動合成されること', () => {
      const chunks = synthesizeSafeDecomposition('休薬');
      expect(chunks).not.toBeNull();
      expect(chunks).toEqual(DANGEROUS_KANJI_DICT['休薬']);
    });

    it('synthesizeSafeDecomposition で「減量」が正しく自動合成されること', () => {
      const chunks = synthesizeSafeDecomposition('減量');
      expect(chunks).not.toBeNull();
      expect(chunks).toEqual(DANGEROUS_KANJI_DICT['減量']);
    });

    it('未登録漢字が含まれる場合は null を返すこと', () => {
      expect(synthesizeSafeDecomposition('未知語')).toBeNull();
    });
  });

  describe('5. 静的メソッド（KeyStrokeAction列へのコンパイル）の動作検証', () => {
    it('compileCancerSymbols が正しい HID アクション列を生成すること', () => {
      const actions = KeyStrokeCompiler.compileCancerSymbols('Stage IA');
      expect(actions.length).toBeGreaterThan(0);
      // F10 と Enter が含まれていること
      const keyCodes = actions.map(a => a.keyCode);
      expect(keyCodes).toContain(0x43); // F10
      expect(keyCodes).toContain(0x28); // ENTER
    });

    it('compileMedicalSymbols が C-1 や HP(+) に対して正しいアクション列を生成すること', () => {
      const actionsC1 = KeyStrokeCompiler.compileMedicalSymbols('C-1');
      expect(actionsC1.length).toBeGreaterThan(0);
      const actionsHP = KeyStrokeCompiler.compileMedicalSymbols('HP(+)');
      expect(actionsHP.length).toBeGreaterThan(0);
    });
  });
});
