import { describe, it, expect } from 'vitest';
import { AhoCorasickEngine } from '../src/utils/ahoCorasick';

describe('AhoCorasickEngine', () => {
  it('初期登録パターンが最長一致で正しく置換される', () => {
    const engine = new AhoCorasickEngine({
      'ひろゆき': 'ピロリ菌',
      '白井君': 'ピロリ菌',
      '彼岸の原因': 'ピロリ菌',
      '領域': 'ピロリ菌',
      '新田図': '心電図',
      '信金虚血': '心筋虚血',
      'きょう新将': '狭心症',
      '日ST上昇型信金高速': '非ST上昇型心筋梗塞',
    });

    // 系統B (ASR誤認識) の置換テスト
    const inputAsr = '今回の胃カメラでひろゆきと白井君が検出され、彼岸の原因が確定しました。領域の除菌が必要です。';
    const resultAsr = engine.replaceLongestMatch(inputAsr);

    expect(resultAsr.replacedCount).toBe(4);
    expect(resultAsr.result).toBe(
      '今回の胃カメラでピロリ菌とピロリ菌が検出され、ピロリ菌が確定しました。ピロリ菌の除菌が必要です。'
    );

    // 系統A (電カルIME誤変換) の置換テスト
    const inputIme = '新田図にて信金虚血およびきょう新将を認め、日ST上昇型信金高速を除外。';
    const resultIme = engine.replaceLongestMatch(inputIme);

    expect(resultIme.replacedCount).toBe(4);
    expect(resultIme.result).toBe(
      '心電図にて心筋虚血および狭心症を認め、非ST上昇型心筋梗塞を除外。'
    );
  });

  it('部分重複パターンがある場合に最長一致が優先される', () => {
    const engine = new AhoCorasickEngine();
    engine.addPattern('心筋', '心筋');
    engine.addPattern('心筋梗塞', '急性心筋梗塞');
    engine.build();

    const input = '心筋梗塞の疑いあり';
    const result = engine.replaceLongestMatch(input);

    expect(result.replacedCount).toBe(1);
    expect(result.result).toBe('急性心筋梗塞の疑いあり');
  });

  it('パターンが存在しない場合はテキストをそのまま返す', () => {
    const engine = new AhoCorasickEngine({
      'ひろゆき': 'ピロリ菌',
    });

    const input = '健康診断で異常なし。';
    const res = engine.replaceLongestMatch(input);
    expect(res.replacedCount).toBe(0);
    expect(res.result).toBe(input);
  });
});
