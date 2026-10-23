import { describe, it, expect } from 'vitest';
import {
  tokenizeJapanese,
  cropAnchorBlock,
  isNoiseOrPii,
  isValidMedicalPair,
  extractReplacePairs,
} from '../src/workers/diffWorker';

describe('diffWorker Analysis Logic', () => {
  it('日本語トークナイザーが漢字・カタカナ・ひらがな・英数字を正しく分割する', () => {
    const text = '【S】新田図にて信金虚血の疑い。HR 112bpm。';
    const tokens = tokenizeJapanese(text);
    expect(tokens).toContain('【');
    expect(tokens).toContain('S');
    expect(tokens).toContain('】');
    expect(tokens).toContain('新田図');
    expect(tokens).toContain('信金虚血');
    expect(tokens).toContain('に');
    expect(tokens).toContain('て');
    expect(tokens).toContain('の');
    expect(tokens).toContain('疑');
    expect(tokens).toContain('い');
    expect(tokens).toContain('HR');
    expect(tokens).toContain('112bpm');
  });

  it('Anchor Matchingがカルテ吸い上げテキストから直前送信ブロックを正しく局所抽出する', () => {
    const fullEmr = `過去カルテ履歴: 2026/09/10 高血圧で受診、アムロジピン処方。
----------------------------------------
【S】新田図にて信金虚血の疑いあり。胸部違和感。
【O】BP 138/84, HR 72
【A】労作性狭心症疑い
【P】ニトロペン頓用`;

    const targetSent = `【S】心電図にて心筋虚血の疑いあり。胸部違和感。
【O】BP 138/84, HR 72`;

    const cropped = cropAnchorBlock(fullEmr, targetSent);
    expect(cropped.startsWith('【S】')).toBe(true);
    expect(cropped).toContain('新田図');
    expect(cropped).not.toContain('2026/09/10');
  });

  it('PIIおよび数値バイタル変更がノイズとして正しく検出・除外される', () => {
    expect(isNoiseOrPii('74歳')).toBe(true);
    expect(isNoiseOrPii('80才')).toBe(true);
    expect(isNoiseOrPii('2026/10/23')).toBe(true);
    expect(isNoiseOrPii('140/90')).toBe(true);
    expect(isNoiseOrPii('5mg')).toBe(true);
    expect(isNoiseOrPii('田中様')).toBe(true);
    expect(isNoiseOrPii('佐藤先生')).toBe(true);
    expect(isNoiseOrPii('、')).toBe(true);

    // 有効な医学用語はノイズではない
    expect(isNoiseOrPii('心電図')).toBe(false);
    expect(isNoiseOrPii('ピロリ菌')).toBe(false);
    expect(isNoiseOrPii('信金虚血')).toBe(false);
  });

  it('【系統A：電カルIME誤変換】のトークン差分抽出で誤変換ペアが正しく抽出される', () => {
    const sourceText = '【S】新田図にて信金虚血ときょう新将を疑う。日ST上昇型信金高速を除外。';
    const targetText = '【S】心電図にて心筋虚血と狭心症を疑う。非ST上昇型心筋梗塞を除外。';

    const sTokens = tokenizeJapanese(sourceText);
    const tTokens = tokenizeJapanese(targetText);
    const pairs = extractReplacePairs(sTokens, tTokens, 'ime');

    expect(pairs.length).toBeGreaterThanOrEqual(3);

    const pairMap = new Map(pairs.map((p) => [p.source, p.target]));
    expect(pairMap.get('新田図')).toBe('心電図');
    expect(pairMap.get('信金虚血')).toBe('心筋虚血');
    expect(pairMap.get('きょう新将')).toBe('狭心症');
    expect(pairMap.get('日ST上昇型信金高速')).toBe('非ST上昇型心筋梗塞');
  });

  it('【系統B：ASR生音声誤認識】のトークン差分抽出で誤認識ペアが正しく抽出される', () => {
    const sourceText = '患者はひろゆきと白井君の感染があり、彼岸の原因と考えられた。';
    const targetText = '患者はピロリ菌とピロリ菌の感染があり、ピロリ菌と考えられた。';

    const sTokens = tokenizeJapanese(sourceText);
    const tTokens = tokenizeJapanese(targetText);
    const pairs = extractReplacePairs(sTokens, tTokens, 'asr');

    expect(pairs.length).toBeGreaterThanOrEqual(2);

    const pairMap = new Map(pairs.map((p) => [p.source, p.target]));
    expect(pairMap.get('ひろゆき')).toBe('ピロリ菌');
    expect(pairMap.get('白井君')).toBe('ピロリ菌');
  });
});
