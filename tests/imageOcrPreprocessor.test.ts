import { describe, it, expect } from 'vitest';
import {
  isGibberishLine,
  normalizeJapaneseSpacing,
  cleanRawOcrOutput,
  detectDocumentType,
  recoverKnownHallucinatedOcr,
  computeOptimalOcrDimensions,
  processOcrRgbaBuffer,
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

    it('意味のある技術文書行・ホワイトボード行・医療用語行・TEL/FAX単独行は正常と判定する', () => {
      expect(isGibberishLine('MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書')).toBe(false);
      expect(isGibberishLine('Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)')).toBe(false);
      expect(isGibberishLine('医療現場における音声認識の失敗は、単に「音声認識モデルの性能不足」によるものではありません。')).toBe(false);
      expect(isGibberishLine('バイタルサイン安定、特記異常所見なし。')).toBe(false);
      expect(isGibberishLine('【11月のバラの育て方】')).toBe(false);
      expect(isGibberishLine('・水やり… 2〜3日/回 間隔が開く、地植え→ナシ')).toBe(false);
      expect(isGibberishLine('Point 自然な落葉（紅葉・褐葉）まで葉をできるだけ維持。')).toBe(false);
      expect(isGibberishLine('TEL(0570)00-7872 FAX(0550)88-1516')).toBe(false);
      expect(isGibberishLine('〒412-0045')).toBe(false);
    });
  });

  describe('computeOptimalOcrDimensions', () => {
    it('低解像度ラベル画像 (1024x394) を 1536x591 に適切にアップスケールする', () => {
      expect(computeOptimalOcrDimensions(1024, 394, 2200)).toEqual({
        width: 1536,
        height: 591,
      });
    });

    it('適正解像度画像 (1800x1200) は等倍のまま維持する', () => {
      expect(computeOptimalOcrDimensions(1800, 1200, 2200)).toEqual({
        width: 1800,
        height: 1200,
      });
    });

    it('超高解像度カメラ画像 (4032x3024) は長辺 2200px にダウンスケールする', () => {
      expect(computeOptimalOcrDimensions(4032, 3024, 2200)).toEqual({
        width: 2200,
        height: 1650,
      });
    });
  });

  describe('processOcrRgbaBuffer (色順応2D Retinex ＆ 外周枠線除去)', () => {
    it('暖色照明下のクラフト茶封筒 (RGB 154,108,30) で黒潰れを起こさず、純白背景(255)と黒文字(0)に分離する', () => {
      const width = 200;
      const height = 120;
      const rgba = new Uint8ClampedArray(width * height * 4);

      // 背景を実測の茶封筒色 (154, 108, 30) で塗る
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = 154;
        rgba[i * 4 + 1] = 108;
        rgba[i * 4 + 2] = 30;
        rgba[i * 4 + 3] = 255;
      }

      // 中央に黒文字ストローク相当の領域 (12x12, RGB 32, 24, 8) を描画
      for (let y = 54; y < 66; y++) {
        for (let x = 94; x < 106; x++) {
          const idx = (y * width + x) * 4;
          rgba[idx] = 32;
          rgba[idx + 1] = 24;
          rgba[idx + 2] = 8;
        }
      }

      processOcrRgbaBuffer(rgba, width, height);

      // 茶封筒の背景が真っ白 (255) に正規化されていること（旧実装では 33 に黒潰れしていた）
      const bgSample = rgba[(20 * width + 20) * 4];
      expect(bgSample).toBe(255);

      // 中央の黒インクがくっきり黒 (0) として残っていること
      const inkSample = rgba[(60 * width + 100) * 4];
      expect(inkSample).toBe(0);
    });

    it('ホワイトボード背景 (RGB 220,228,238) 上の赤マーカー・青マーカー文字を白飛びさせず濃く保持する', () => {
      const width = 200;
      const height = 120;
      const rgba = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = 220;
        rgba[i * 4 + 1] = 228;
        rgba[i * 4 + 2] = 238;
        rgba[i * 4 + 3] = 255;
      }

      // 赤マーカー文字 (205, 40, 40) と青マーカー文字 (35, 70, 210)
      for (let y = 50; y < 62; y++) {
        for (let x = 50; x < 62; x++) {
          const rIdx = (y * width + x) * 4;
          rgba[rIdx] = 205;
          rgba[rIdx + 1] = 40;
          rgba[rIdx + 2] = 40;

          const bIdx = (y * width + (x + 60)) * 4;
          rgba[bIdx] = 35;
          rgba[bIdx + 1] = 70;
          rgba[bIdx + 2] = 210;
        }
      }

      processOcrRgbaBuffer(rgba, width, height);

      expect(rgba[(15 * width + 15) * 4]).toBe(255);
      expect(rgba[(56 * width + 56) * 4]).toBeLessThan(80);
      expect(rgba[(56 * width + 116) * 4]).toBeLessThan(80);
    });

    it('文字群を囲む中空の外周長方形枠線を自動検出し純白(255)に消去しつつ内部文字を保持する', () => {
      const width = 240;
      const height = 140;
      const rgba = new Uint8ClampedArray(width * height * 4).fill(255);

      // 外周枠線 (x: 20..220, y: 15..125, 線幅 2px)
      for (let x = 20; x <= 220; x++) {
        for (const y of [15, 16, 124, 125]) {
          const i = (y * width + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 10;
        }
      }
      for (let y = 15; y <= 125; y++) {
        for (const x of [20, 21, 219, 220]) {
          const i = (y * width + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 10;
        }
      }

      // 枠線内部の文字ブロック (x: 80..92, y: 60..72)
      for (let y = 60; y < 72; y++) {
        for (let x = 80; x < 92; x++) {
          const i = (y * width + x) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 15;
        }
      }

      processOcrRgbaBuffer(rgba, width, height);

      // 外周枠線が消去されていること
      expect(rgba[(15 * width + 120) * 4]).toBe(255);
      expect(rgba[(70 * width + 220) * 4]).toBe(255);
      // 内部の文字ピクセルは黒のまま保持されていること
      expect(rgba[(66 * width + 86) * 4]).toBe(0);
    });
  });

  describe('病院紹介状封筒・宛名ラベルの100%精度復元テスト', () => {
    it('前処理後Tesseract生出力から病院名・法人名・住所・チェックボックス(□)・TEL/FAXを100%正確に整形する', () => {
      const rawTesseractFromEnvelope = [
        '社 篤 医 療法 人 青 虎 倒',
        '',
        'フジ 虎ノ門 整形 外科 病 院',
        '〒412-0045 静岡 県 御殿 場 市 川島 田 1067-1',
        '',
        '[|] ナビ ダイ ヤル TEL(0570)00-7872 FAX(0550)88-1516',
        'Ll] 医 事 課 FAX(0550)88-1103',
        '口 地域 運 携 室 TEL(0550)88-0008 FAX(0550)89-7895',
      ].join('\n');

      const cleaned = cleanRawOcrOutput(rawTesseractFromEnvelope);
      expect(cleaned).toBe(
        [
          '社会医療法人 青虎会',
          'フジ虎ノ門整形外科病院',
          '〒412-0045 静岡県御殿場市川島田1067-1',
          '□ ナビダイヤル TEL(0570)00-7872 FAX(0550)88-1516',
          '□ 医事課 FAX(0550)88-1103',
          '□ 地域連携室 TEL(0550)88-0008 FAX(0550)89-7895',
        ].join('\n')
      );
    });

    it('「口 腔 外 科」や「口 内 炎」の語頭「口」をチェックボックス「□」に誤変換しない', () => {
      expect(normalizeJapaneseSpacing('口 腔 外 科')).toBe('口腔外科');
      expect(normalizeJapaneseSpacing('口 内 炎')).toBe('口内炎');
      expect(normalizeJapaneseSpacing('+ 412-0045 静岡県御殿場市川島田 1067=1 |')).toBe(
        '〒412-0045 静岡県御殿場市川島田1067-1'
      );
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
    it('技術設計書およびホワイトボード板書・病院封筒宛名を general_document と正しく判定する', () => {
      const docText = `MedPilot 医療用語音声認識「完全無誤爆」アーキテクチャ設計書
Phase 1: Thought Partner Framing (音声認識における本質的病理の解剖)
汎用の音声認識エンジン (Web Speech API、一般 Whisper 等) をそのまま臨床現場に投入した際に発生するエラーは、以下の 3 大構造的インピーダンス・ミスマッチに起因します。`;
      expect(detectDocumentType(docText)).toBe('general_document');
      expect(detectDocumentType(WHITEBOARD_ROSE_NOVEMBER_PERFECT_TEXT)).toBe('general_document');
      expect(
        detectDocumentType(
          '社会医療法人 青虎会\nフジ虎ノ門整形外科病院\n〒412-0045 静岡県御殿場市川島田1067-1'
        )
      ).toBe('general_document');
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
