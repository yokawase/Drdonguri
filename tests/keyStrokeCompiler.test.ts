// =============================================================================
// File: tests/keyStrokeCompiler.test.ts
// 説明: KeyStrokeCompiler および CP932コードマッピングの単体テスト
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  KeyStrokeCompiler,
  getCp932Code,
  katakanaToRomaji
} from '../src/services/KeyStrokeCompiler';
import type { MorphToken } from '../src/workers/vibrato.worker';

describe('KeyStrokeCompiler & CP932 Deterministic Mapping', () => {
  const compiler = new KeyStrokeCompiler();

  describe('1. CP932 コードオフセット検証 (胃 ➔ 亜 化けの根絶)', () => {
    it('「胃」は CP932: 035037 として厳格取得されること', () => {
      const code = getCp932Code('胃');
      expect(code).toBe('035037');
      // 圧 (034995) や 亜 (034975) と絶対に一致しないこと
      expect(code).not.toBe('034995');
      expect(code).not.toBe('034975');
    });

    it('「亜」は CP932: 034975 として厳格取得されること', () => {
      expect(getCp932Code('亜')).toBe('034975');
    });

    it('「圧」は CP932: 034995 として厳格取得されること', () => {
      expect(getCp932Code('圧')).toBe('034995');
    });

    it('主要臨床漢字（癌・高・血・糖・尿・病）のコード検証', () => {
      expect(getCp932Code('癌')).toBe('035552');
      expect(getCp932Code('高')).toBe('036226');
      expect(getCp932Code('血')).toBe('035980');
      expect(getCp932Code('糖')).toBe('037788');
      expect(getCp932Code('尿')).toBe('037953');
      expect(getCp932Code('病')).toBe('038241');
    });
  });

  describe('2. カタカナ ➔ ヘボン式ローマ字変換', () => {
    it('薬品名が正確にローマ字変換されること', () => {
      expect(katakanaToRomaji('カロナール')).toBe('karona-ru');
      expect(katakanaToRomaji('ロキソニン')).toBe('rokisonin');
      expect(katakanaToRomaji('アスピリン')).toBe('asupirin');
      expect(katakanaToRomaji('アムロジピン')).toBe('amurojipin');
    });

    it('促音（ッ）や長音（ー）が正確に変換されること', () => {
      expect(katakanaToRomaji('タケキャブ')).toBe('takekyabu');
      expect(katakanaToRomaji('ネキシウム')).toBe('nekishiumu');
      expect(katakanaToRomaji('エリキュース')).toBe('erikyu-su');
    });
  });

  describe('3. ハイブリッド打鍵トランスパイル', () => {
    it('「カロナール錠500mg」が [F7] + [ALT] + [F10] へ最適分割されること', () => {
      const tokens: MorphToken[] = [
        { surface: 'カロナール', feature: '', pos: '名詞', subPos: '薬品名', reading: 'カロナール' },
        { surface: '錠', feature: '', pos: '名詞', subPos: '接尾', reading: 'ジョウ' },
        { surface: '500mg', feature: '', pos: '名詞', subPos: '数', reading: '500ミリグラム' },
      ];

      const res = compiler.compile(tokens, { mode: 'hybrid', includeImeReset: true });

      // [IME_RESET] が先頭に付与されていること
      expect(res.streamText.startsWith('[IME_RESET]')).toBe(true);
      // カロナール ➔ [F7]karona-ru[/F7]
      expect(res.streamText).toContain('[F7]karona-ru[/F7]');
      // 錠 ➔ [ALT]036575[/ALT] (CP932)
      expect(res.streamText).toContain('[ALT]');
      // 500mg ➔ [F10]500mg[/F10]
      expect(res.streamText).toContain('[F10]500mg[/F10]');

      expect(res.f7Count).toBe(1);
      expect(res.f10Count).toBe(1);
      expect(res.altCount).toBeGreaterThanOrEqual(1);
    });

    it('「胃癌」が 100%決定論 Altコード [ALT]035037[/ALT][ALT]035552[/ALT] となること', () => {
      const tokens: MorphToken[] = [
        { surface: '胃癌', feature: '', pos: '名詞', subPos: '疾患名', reading: 'イガン' },
      ];

      const res = compiler.compile(tokens, { mode: 'deterministic_only', includeImeReset: false });
      expect(res.streamText).toBe('[ALT]035037[/ALT][ALT]035552[/ALT]');
      expect(res.altCount).toBe(2);
      expect(res.f7Count).toBe(0);
    });

    it('改行モードの適用（alt_enter ➔ [ALT_ENTER]）', () => {
      const tokens: MorphToken[] = [
        { surface: '胃', feature: '', pos: '名詞', subPos: '一般', reading: 'イ' },
        { surface: '\n', feature: '', pos: '記号', subPos: '改行', reading: '' },
      ];

      const res = compiler.compile(tokens, { newlineMode: 'alt_enter', includeImeReset: false });
      expect(res.streamText).toBe('[ALT]035037[/ALT][ALT_ENTER]');
    });
  });

  describe('4. Web Bluetooth NUS チャンク分割', () => {
    it('長いストリームが指定サイズ（240バイト）以下に分割されること', () => {
      const longStream = '[ALT]035037[/ALT]'.repeat(30); // 480バイト超
      const chunks = compiler.compileToChunks(longStream, 240);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.byteLength).toBeLessThanOrEqual(240);
      }

      // 復元テスト
      const decoder = new TextDecoder();
      const reconstructed = chunks.map(c => decoder.decode(c)).join('');
      expect(reconstructed).toBe(longStream);
    });
  });
});
