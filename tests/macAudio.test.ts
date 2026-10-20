import { describe, it, expect, beforeEach } from 'vitest';
import {
  isAudioMuted,
  setAudioMuted,
  toggleAudioMuted,
  addAudioMuteListener,
  playMacBeep,
  playKeyClick,
  playSosumi,
} from '../src/utils/macAudio';

describe('macAudio タップ音・効果音ミュート制御テスト', () => {
  beforeEach(() => {
    // 各テスト前にミュートを解除（デフォルト状態）
    setAudioMuted(false);
  });

  it('初期状態ではミュートが解除されていること', () => {
    expect(isAudioMuted()).toBe(false);
  });

  it('setAudioMuted でミュート状態を明示的に変更できること', () => {
    setAudioMuted(true);
    expect(isAudioMuted()).toBe(true);

    setAudioMuted(false);
    expect(isAudioMuted()).toBe(false);
  });

  it('toggleAudioMuted でミュート状態が反転すること', () => {
    const afterFirstToggle = toggleAudioMuted();
    expect(afterFirstToggle).toBe(true);
    expect(isAudioMuted()).toBe(true);

    const afterSecondToggle = toggleAudioMuted();
    expect(afterSecondToggle).toBe(false);
    expect(isAudioMuted()).toBe(false);
  });

  it('addAudioMuteListener でミュート状態の変更が通知されること', () => {
    const received: boolean[] = [];
    const unsubscribe = addAudioMuteListener((muted) => {
      received.push(muted);
    });

    toggleAudioMuted(); // true
    toggleAudioMuted(); // false
    setAudioMuted(true); // true

    expect(received).toEqual([true, false, true]);

    // リスナー解除後の通知がないこと
    unsubscribe();
    toggleAudioMuted(); // false
    expect(received).toEqual([true, false, true]);
  });

  it('ミュート中・解除中のいずれでも playMacBeep / playKeyClick / playSosumi が安全に実行できること', () => {
    setAudioMuted(true);
    expect(() => playMacBeep()).not.toThrow();
    expect(() => playKeyClick()).not.toThrow();
    expect(() => playSosumi()).not.toThrow();

    setAudioMuted(false);
    expect(() => playMacBeep()).not.toThrow();
    expect(() => playKeyClick()).not.toThrow();
    expect(() => playSosumi()).not.toThrow();
  });
});
