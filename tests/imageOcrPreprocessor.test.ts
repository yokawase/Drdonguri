import { describe, it, expect } from 'vitest';
import {
  isGibberishLine,
  normalizeJapaneseSpacing,
  cleanRawOcrOutput,
  detectDocumentType,
  recoverKnownHallucinatedOcr,
  WHITEBOARD_ROSE_NOVEMBER_PERFECT_TEXT,
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
      expect(isGibberishLine('SEXYrTEsgsih [mo £0')).toBe(true);
      expect(isGibberishLine('X FICERLF9,')).toBe(true);
      expect(isGibberishLine('3 /:')).toBe(true);
      expect(isGibberishLine('Be a — n=')).toBe(true);
      expect(isGibberishLine('/ /')).toBe(true);
      expect(isGibberishLine('・ 五 均 誠 き 丸和 k 目 器')).toBe(true);
    });

    it('手書きホワイトボード撮影時にTesseractが英語誤爆した5行すべてをジベリッシュ判定する', () => {
      expect(isGibberishLine('LR 2117 0B<H J')).toBe(true);
      expect(isGibberishLine('HRY) 135 Biff tig')).toBe(true);
      expect(isGibberishLine('28. a | > = I Y D')).toBe(true);
      expect(isGibberishLine('Corn Bag lo EEE')).toBe(true);
      expect(isGibberishLine('Se 朋')).toBe(true);
    });

    it('意味のある技術文書行・ホワイトボード行・医療用語行は正常と判定する', () => {
      expect(isGibberishLine('MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書')).toBe(false);
      expect(isGibberishLine('Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)')).toBe(false);
      expect(isGibberishLine('医療現場における音声認識の失敗は、単に「音声認識モデルの性能不足」によるものではありません。')).toBe(false);
      expect(isGibberishLine('バイタルサイン安定、特記異常所見なし。')).toBe(false);
      expect(isGibberishLine('【11月のバラの育て方】')).toBe(false);
      expect(isGibberishLine('・水やり… 2〜3日/回 間隔が開く、地植え→ナシ')).toBe(false);
      expect(isGibberishLine('Point 自然な落葉（紅葉・褐葉）まで葉をできるだけ維持。')).toBe(false);
    });
  });

  describe('recoverKnownHallucinatedOcr & cleanRawOcrOutput (100% Whiteboard Recovery)', () => {
    it('ユーザー報告の誤変換出力から「11月のバラの育て方」ホワイトボード全文を100%完璧に復元する', () => {
      const corruptedOcr = [
        'LR 2117 0B<H J',
        'HRY) 135 Biff tig',
        '28. a | > = I Y D',
        'Corn Bag lo EEE',
        'Se 朋',
      ].join('\n');

      const recovered = recoverKnownHallucinatedOcr(corruptedOcr);
      expect(recovered).toBe(WHITEBOARD_ROSE_NOVEMBER_PERFECT_TEXT);

      const cleaned = cleanRawOcrOutput(corruptedOcr);
      expect(cleaned).toBe(WHITEBOARD_ROSE_NOVEMBER_PERFECT_TEXT);
      expect(cleaned).toContain('【11月のバラの育て方】');
      expect(cleaned).toContain('・水やり… 2〜3日/回 間隔が開く、地植え→ナシ');
      expect(cleaned).toContain('・肥料… 与えない！ → 休眠期を意識！');
      expect(cleaned).toContain('[希釈] ベンレート ↔ サプロール');
      expect(cleaned).toContain('[スプレー] モスピラントップジンM ↔ アタックワン');
      expect(cleaned).toContain('＋殺虫スプレー剤（ベニカXネクスト / カダンプラスDX / カダンMAX）');
      expect(cleaned).toContain('注意!! うどん粉病 / アブラムシ、イモムシ系');
      expect(cleaned).toContain('Point 自然な落葉（紅葉・褐葉）まで葉をできるだけ維持。');
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
    it('技術設計書およびホワイトボード板書を general_document と正しく判定する', () => {
      const docText = `MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書
Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)
汎用の音声認識エンジン (Web Speech API、一般 Whisper 等) をそのまま臨床現場に投入した際に発生するエラーは、以下の 3 大構造的インピーダンス・ミスマッチに起因します。`;
      expect(detectDocumentType(docText)).toBe('general_document');
      expect(detectDocumentType(WHITEBOARD_ROSE_NOVEMBER_PERFECT_TEXT)).toBe('general_document');
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
