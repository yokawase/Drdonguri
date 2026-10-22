import { describe, it, expect } from 'vitest';
import {
  isGibberishLine,
  normalizeJapaneseSpacing,
  cleanRawOcrOutput,
  detectDocumentType,
} from '../src/services/imageOcrPreprocessor';
import {
  parseDataUrl,
  getGeminiApiKey,
  setGeminiApiKey,
  hasGeminiApiKey,
} from '../src/services/geminiVisionOcrService';

describe('imageOcrPreprocessor & Gemini Vision Service', () => {
  describe('isGibberishLine', () => {
    it('ユーザーの液晶画面撮影から発生したモアレゴミ行を正確にジベリッシュ判定する', () => {
      // ユーザー画像で発生したゴミ文字列
      expect(isGibberishLine('SEXYrTEsgsih [mo £0')).toBe(true);
      expect(isGibberishLine('X FICERLF9,')).toBe(true);
      expect(isGibberishLine('3 /:')).toBe(true);
      expect(isGibberishLine('Be a — n=')).toBe(true);
      expect(isGibberishLine('/ /')).toBe(true);
      expect(isGibberishLine('・ 五 均 誠 き 丸和 k 目 器')).toBe(true);
    });

    it('意味のある技術文書行や医療用語行は正常と判定する', () => {
      expect(isGibberishLine('MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書')).toBe(false);
      expect(isGibberishLine('Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)')).toBe(false);
      expect(isGibberishLine('医療現場における音声認識の失敗は、単に「音声認識モデルの性能不足」によるものではありません。')).toBe(false);
      expect(isGibberishLine('バイタルサイン安定、特記異常所見なし。')).toBe(false);
    });
  });

  describe('normalizeJapaneseSpacing', () => {
    it('和文間の不自然なスペースを除去し、既知のOCR誤爆を補正する', () => {
      const input = '医 療 現 場 における 音 声 認 識 の失敗は、Web Speech AP世磐Whisper';
      const normalized = normalizeJapaneseSpacing(input);
      expect(normalized).toContain('医療現場における音声認識の失敗は');
      expect(normalized).toContain('Web Speech API、一般Whisper');
    });

    it('hase 1: を Phase 1: に補正する', () => {
      const input = 'hase 1: Thought Partner Framing';
      const normalized = normalizeJapaneseSpacing(input);
      expect(normalized).toBe('Phase 1: Thought Partner Framing');
    });
  });

  describe('cleanRawOcrOutput', () => {
    it('生OCR結果からモアレノイズ行を破棄し、クリーンな設計書テキストを復元する', () => {
      const rawInput = [
        '3 /: SEXYrTEsgsih [mo £0',
        'MedPilot 医療用語音声認識「完全無誤 爆」 アーキテクチャ設計書',
        'Be a — n=',
        'X FICERLF9,',
        'hase 1: Thought Partner Framing (音声認識における本質的病理の解剖)',
        '医療現場における音声認識の失敗は、単に「音声認識モデルの性能不足」によるものではありません。',
      ].join('\n');

      const cleaned = cleanRawOcrOutput(rawInput);
      expect(cleaned).not.toContain('SEXYrTEsgsih');
      expect(cleaned).not.toContain('X FICERLF9');
      expect(cleaned).not.toContain('Be a — n=');
      expect(cleaned).toContain('MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書');
      expect(cleaned).toContain('Phase 1: Thought Partner Framing');
    });
  });

  describe('detectDocumentType', () => {
    it('技術設計書テキストを general_document と正しく判定する', () => {
      const docText = `MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書
Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)
汎用の音声認識エンジン (Web Speech API、一般 Whisper 等) をそのまま臨床現場に投入した際に発生するエラーは、以下の 3 大構造的インピーダンス・ミスマッチに起因します。`;
      expect(detectDocumentType(docText)).toBe('general_document');
    });

    it('臨床カルテテキストを clinical_chart と正しく判定する', () => {
      const chartText = `主訴: 胸痛、呼吸困難
現病歴: 60歳男性。昨日より労作時胸部圧迫感あり。
身体所見: BP 142/88 mmHg, HR 78 bpm, SpO2 98%
アセスメント: 労作性狭心症疑い
治療方針: ニトロペン舌下錠処方、循環器内科紹介`;
      expect(detectDocumentType(chartText)).toBe('clinical_chart');
    });

    it('処方箋テキストを prescription と正しく判定する', () => {
      const rxText = `処方箋
Rp1) アムロジピン錠 5mg 1日1回 朝食後 28日分
Rp2) カロナール錠 500mg 1回1錠 疼痛時頓服 10回分`;
      expect(detectDocumentType(rxText)).toBe('prescription');
    });
  });

  describe('geminiVisionOcrService key management', () => {
    it('APIキーの保存・取得・削除が正常に動作する', () => {
      setGeminiApiKey('AIzaSyTestKey123456');
      expect(hasGeminiApiKey()).toBe(true);
      expect(getGeminiApiKey()).toBe('AIzaSyTestKey123456');

      setGeminiApiKey('');
      expect(hasGeminiApiKey()).toBe(false);
      expect(getGeminiApiKey()).toBe('');
    });

    it('parseDataUrl が base64 と mimeType を正しく抽出する', () => {
      const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const parsed = parseDataUrl(testDataUrl);
      expect(parsed.mimeType).toBe('image/png');
      expect(parsed.base64Data).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    });
  });
});
