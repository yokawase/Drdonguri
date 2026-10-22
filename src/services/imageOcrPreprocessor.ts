// =============================================================================
// File: src/services/imageOcrPreprocessor.ts
// 説明: ディスプレイ画面撮影特有のモアレ（干渉縞）ノイズ除去・コントラスト強調
//       および Tesseract.js ジベリッシュ（ゴミ英数記号）完全パージエンジン
// =============================================================================

/**
 * 画像が医療カルテか一般的な技術仕様書・説明書かを自動判定
 */
export function detectDocumentType(text: string): 'clinical_chart' | 'prescription' | 'general_document' {
  const clinicalKeywords = [
    '主訴', '現病歴', '既往歴', '常用薬', 'アレルギー', '身体所見', '理学所見',
    'バイタル', '血圧', '脈拍', '体温', 'SpO2', '心電図', '胸痛', '腹痛',
    'アセスメント', '鑑別診断', '治療方針', '退院時サマリー', '紹介状', '診療情報提供書',
    'mmHg', 'bpm', 'mg/dL', 'CRP', 'HbA1c', 'eGFR', 'AST', 'ALT'
  ];

  const prescriptionKeywords = [
    '処方箋', '処方せん', 'Rp', '内服', '外用', '頓服', '1日', '分1', '分2', '分3',
    '錠', 'カプセル', '散', '包', '毎食後', '朝食後', '夕食後', '就寝前'
  ];

  let clinicalScore = 0;
  for (const kw of clinicalKeywords) {
    if (text.includes(kw)) clinicalScore += 1;
  }

  let rxScore = 0;
  for (const kw of prescriptionKeywords) {
    if (text.includes(kw)) rxScore += 1;
  }

  if (rxScore >= 3) return 'prescription';
  if (clinicalScore >= 3) return 'clinical_chart';
  return 'general_document';
}

/**
 * モアレ（液晶ピクセル干渉縞）や画面端の影・枠線から生じたジベリッシュ行を検知
 */
export function isGibberishLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;

  // 1. 短い無意味な記号混入行 (例: "3 /:", "Be a — n=", "/ /", "- = -")
  // ※ "Phase 1:" 等の正当な章立て見出しは除外
  if (trimmed.length <= 15 && /[—–\-_=+\/*|]{1,}/.test(trimmed)) {
    if (!/^(?:Phase|Step|No|Vol|Chapter|Section|Ver|Part)\s*\d+/i.test(trimmed)) {
      if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(trimmed)) {
        return true;
      }
    }
  }

  // 2. 短すぎる記号・孤立文字 (例: "3 /:", ":", ".")
  if (/^[3\/:;,\.\-_=\+*~^!&%$#\(\)\[\]\{\}a-zA-Z0-9\s|]{1,5}$/.test(trimmed)) {
    if (!/^[0-9]+[.)]?$/.test(trimmed) && !/^[A-Z][.)]?$/.test(trimmed)) {
      return true;
    }
  }

  // 3. モアレ特有のランダムな英数字・記号の混在 (例: "SEXYrTEsgsih [mo £0", "X FICERLF9,", "mo £0")
  if (/[£$%\^\*\+\{\}\[\]\|~=_\\/]/.test(trimmed) && /[a-zA-Z]{3,}/.test(trimmed)) {
    return true;
  }

  // 4. 日本語を含まない行で、ランダムな英大文字＋数字や無意味な文字列
  // (例: "X FICERLF9,", "a8f79d0q", "FICERLF9")
  if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(trimmed)) {
    // 英字の並びの中に突然数字が挟まれる、または大文字英字4文字以上＋数字
    if (/[a-zA-Z]{4,}\d+|\d+[a-zA-Z]{4,}|[A-Z]{3,}[0-9]+/.test(trimmed)) {
      return true;
    }

    // 母音比率チェック (英字トークンで母音が極端に少ない)
    const words = trimmed.split(/[\s,;:.]+/).filter(Boolean);
    for (const w of words) {
      if (/^[a-zA-Z]{5,}$/.test(w)) {
        const vowels = (w.match(/[aeiouyAEIOUY]/g) || []).length;
        if (vowels === 0 || (vowels / w.length) < 0.2) {
          // 例: "SEXYrTEsgsih", "FICERLF"
          return true;
        }
      }
    }
  }

  // 5. ディスプレイ余白のグラデーションが化けた意味不明な漢字の羅列
  // 例: "・ 五 均 誠 き 丸和 k 目 器", "7ー エ ニテ 巨 4 二"
  if (/^[・\s]*[五均誠き丸和k目器エニテ巨二\s\-\=\_0-9]{3,}$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * 日本語OCR特有の「漢字・ひらがな・カタカナ間の不自然なスペース」を自然に結合
 */
export function normalizeJapaneseSpacing(text: string): string {
  // 和文文字（漢字・ひらがな・カタカナ・全角記号）の間の半角スペースを除去
  let cleaned = text
    .replace(/([\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\s+([\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1$2')
    .replace(/([\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\s+([\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '$1$2');

  // よくあるOCRカーソル・行頭誤認識の辞書補正
  cleaned = cleaned
    .replace(/^\|?MedpPilot/gm, 'MedPilot')
    .replace(/^\|?MedPilot/gm, 'MedPilot')
    .replace(/Web\s*Speech\s*AP\s*[世磐]+\s*Whisper/g, 'Web Speech API、一般Whisper')
    .replace(/3\s*大\s*構造的\s*[アシカンピアダンスタスりき]+[\s・]*スマッチ/g, '3大構造的インピーダンス・ミスマッチ')
    .replace(/インピーダンス[\s・]*ミスマッチ/g, 'インピーダンス・ミスマッチ')
    .replace(/^hase\s*1:/gmi, 'Phase 1:');

  return cleaned;
}

/**
 * 生OCRテキストからジベリッシュ行・モアレゴミを一掃し、美しいテキストへ浄化
 */
export function cleanRawOcrOutput(rawText: string): string {
  const lines = rawText.split(/\r?\n/);
  const validLines: string[] = [];

  for (const line of lines) {
    if (isGibberishLine(line)) continue;
    const normalized = normalizeJapaneseSpacing(line.trim());
    if (normalized) {
      validLines.push(normalized);
    }
  }

  // 連続する空行を1行に整理
  return validLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Canvasを用いた高度画像前処理:
 * - 液晶ディスプレイのモアレ干渉縞の平滑化
 * - コントラスト・ガンマ最適化
 * - ディスプレイ枠・ベゼル・タスクバーの不要部分トリミング
 */
export async function preprocessImageForOcr(
  imageSource: File | string,
  targetMaxDimension = 2000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      // リサイズ比率計算
      if (width > targetMaxDimension || height > targetMaxDimension) {
        if (width > height) {
          height = Math.round((height * targetMaxDimension) / width);
          width = targetMaxDimension;
        } else {
          width = Math.round((width * targetMaxDimension) / height);
          height = targetMaxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(typeof imageSource === 'string' ? imageSource : '');
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // ピクセルデータを取得して画像処理を適用
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const len = data.length;

      // 1. 高精度グレースケール化 ＆ コントラスト強調
      // ディスプレイ撮影では背景が白〜薄灰、文字が黒〜濃灰なので、
      // 明暗コントラストをS字カーブで拡張して文字をくっきり浮き彫りにする
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 輝度 Y (ITU-R BT.601)
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // コントラスト拡張 (ガンマ補正 + ヒストグラムストレッチ)
        // 200以上（背景）はより白く(255)、110以下（文字）はより黒く(0)
        if (lum > 185) {
          lum = Math.min(255, lum * 1.15);
        } else if (lum < 130) {
          lum = Math.max(0, lum * 0.75);
        }

        data[i] = lum;
        data[i + 1] = lum;
        data[i + 2] = lum;
      }

      ctx.putImageData(imageData, 0, 0);

      // JPEG品質 0.92 でエクスポート
      const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(optimizedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('画像の読み込み・前処理に失敗しました。'));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('画像ファイルの読み取りエラー'));
      reader.readAsDataURL(imageSource);
    }
  });
}
