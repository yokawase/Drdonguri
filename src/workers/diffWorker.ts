/**
 * =============================================================================
 * DrVoice どんぐり君！ (Dr.Dongly)
 * 局所Diff ＆ 分離判定モジュール (Local Diff & Separation Worker)
 * =============================================================================
 * 
 * メインスレッドのUI描画およびBLE打鍵通信を一切ブロックせず、
 * バックグラウンドスレッドで以下の2系統の差分を非同期抽出・ノイズ除去する：
 * 
 * 1. 【系統A：電カルIME誤変換】
 *    Source: 仮想プリンタBulk OUTから吸い上げた電カル確定テキスト (誤字・誤変換)
 *    Target: どんぐり君が打鍵送信した医学的に正しいSOAPテキスト (正解)
 * 
 * 2. 【系統B：ASR生音声誤認識】
 *    Source: Whisper / Web Speech API の生出力テキスト (誤認識)
 *    Target: SLM (Gemma 2 / Qwen) および医療辞書が確定した医学用語 (正解)
 */

export interface DiffWorkerRequest {
  id: string;
  type: 'ime_diff' | 'asr_diff';
  sourceText: string; // 誤字側 (EMR吸い上げ または Whisper生出力)
  targetText: string; // 正解側 (どんぐり送信テキスト または SLM確定テキスト)
}

export interface LearnedPair {
  source: string; // 誤字・誤認識 (例: '新田図', 'ひろゆき')
  target: string; // 正解・医学用語 (例: '心電図', 'ピロリ菌')
  type: 'ime' | 'asr';
  confidence: number;
}

export interface DiffWorkerResponse {
  id: string;
  type: 'ime_diff' | 'asr_diff';
  pairs: LearnedPair[];
  croppedSource?: string;
  elapsedMs: number;
}

/**
 * 日本語テキストを形態素・単語単位のトークンに分割
 * 漢字・カタカナ・英数はブロック化、ひらがなは1文字単位で助詞境界を正確にLCS検出
 */
export function tokenizeJapanese(text: string): string[] {
  if (!text) return [];

  // 1. 漢字ブロック (熟語)
  // 2. カタカナ・長音ブロック
  // 3. 英数ブロック
  // 4. 空白・改行
  // 5. ひらがな (1文字単位: 助詞や語尾の境界をLCSでピンポイント検出)
  // 6. その他記号
  const regex = /([\p{Script=Han}]+|[\p{Script=Katakana}ー]+|[A-Za-z0-9]+|\s+|[\p{Script=Hiragana}]|[^\s\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}A-Za-z0-9])/gu;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[0]) {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

/**
 * Anchor Matching (局所クロップ):
 * 電カル過去履歴や他患者テキストが混在する吸い上げ全文から、
 * 直前に送信したテキストに該当する段落・ブロックを局所抽出する。
 */
export function cropAnchorBlock(fullEmrText: string, targetText: string): string {
  if (!fullEmrText || !targetText) return fullEmrText || '';

  const cleanFull = fullEmrText.trim();
  const cleanTarget = targetText.trim();

  // 吸い上げテキストの長さがターゲットと同等ならクロップ不要
  if (cleanFull.length <= cleanTarget.length * 1.5) {
    return cleanFull;
  }

  // 1. SOAPタグなどの特徴的アンカーキーを探索
  const anchorTags = [
    '【S】', '【s】', '【O】', '【o】', '【A】', '【a】', '【P】', '【p】',
    '【主訴】', '【現病歴】', '【既往歴】', '【アセスメント】', '【プラン】',
    '# S', '# O', '# A', '# P', 'S:', 'O:', 'A:', 'P:'
  ];

  for (const tag of anchorTags) {
    if (cleanTarget.includes(tag)) {
      const idx = cleanFull.lastIndexOf(tag); // 最新の該当タグ
      if (idx !== -1) {
        // タグ開始位置からターゲットの文字数＋余裕幅でクロップ
        const estimatedLength = Math.floor(cleanTarget.length * 1.3);
        return cleanFull.slice(idx, idx + estimatedLength);
      }
    }
  }

  // 2. ターゲット先頭行のキーワードによるアンカー探索
  const targetLines = cleanTarget.split('\n').map((l) => l.trim()).filter((l) => l.length >= 4);
  if (targetLines.length > 0) {
    const firstLineKey = targetLines[0].slice(0, 15);
    const matchIdx = cleanFull.lastIndexOf(firstLineKey);
    if (matchIdx !== -1) {
      const estimatedLength = Math.floor(cleanTarget.length * 1.3);
      return cleanFull.slice(matchIdx, matchIdx + estimatedLength);
    }
  }

  // 3. 類似段落の探索 (Jaccard係数)
  const paragraphs = cleanFull.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length > 1) {
    const targetWords = new Set(tokenizeJapanese(cleanTarget));
    let bestPara = cleanFull;
    let maxScore = -1;

    for (const para of paragraphs) {
      const paraWords = new Set(tokenizeJapanese(para));
      let intersection = 0;
      for (const w of paraWords) {
        if (targetWords.has(w)) intersection++;
      }
      const union = targetWords.size + paraWords.size - intersection;
      const jaccard = union > 0 ? intersection / union : 0;
      if (jaccard > maxScore) {
        maxScore = jaccard;
        bestPara = para;
      }
    }
    if (maxScore > 0.15) {
      return bestPara;
    }
  }

  return cleanFull;
}

/**
 * PII (個人識別情報) および数値ノイズ判定フィルター
 */
export function isNoiseOrPii(text: string): boolean {
  if (!text) return true;
  const s = text.trim();
  if (s.length === 0) return true;

  // 1. 年齢パターン (例: 74歳, 80才)
  if (/^\d{1,3}\s*[歳才]$/.test(s)) return true;

  // 2. 日付・時刻パターン
  if (/^\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?$/.test(s)) return true;
  if (/^\d{1,2}[月/-]\d{1,2}日?$/.test(s)) return true;
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return true;

  // 3. 純粋な数値・バイタル・単位のみの変更 (例: 120, 140/90, 5mg, 36.5)
  if (/^[\d./\-+]+$/.test(s)) return true;
  if (/^[\d.]+\s*(mg|g|ml|mL|錠|Cap|T|t|包|%|bpm|mmHg|kg|cm|℃)$/i.test(s)) return true;

  // 4. 明確な患者氏名・敬称パターン (例: 田中様, 佐藤殿, 鈴木先生)
  if (/^[一-龥ぁ-ん]{1,4}(様|殿|先生|氏)$/.test(s)) return true;

  // 5. 記号・句読点のみ
  if (/^[、。，．・「」『』（）()!?:;\s\-+=*/]+$/.test(s)) return true;

  return false;
}

/**
 * 助詞・境界語判定（これらをまたいでDiffをマージしてはならない）
 */
function isBoundaryOrParticle(token: string): boolean {
  const s = token.trim();
  if (!s) return true;
  // 句読点・記号
  if (/^[、。，．・「」『』（）()!?:;\s\n]+$/.test(s)) return true;
  // 助詞
  const particles = new Set(['に', 'て', 'と', 'を', 'は', 'が', 'の', 'で', 'から', 'より', 'へ', 'や', 'も', 'など']);
  return particles.has(s);
}

/**
 * 妥当な医学用語・誤字ペア判定
 */
export function isValidMedicalPair(source: string, target: string): boolean {
  const s = source.trim();
  const t = target.trim();

  // 完全同一なら置換不要
  if (s === t) return false;

  // 文字長チェック: 1文字〜35文字以下（単漢字でも「非」などの重要接頭辞は許可）
  if (s.length < 1 || s.length > 35) return false;
  if (t.length < 1 || t.length > 35) return false;

  // 長さ比率の極端な違いを除外 (文章全体の削除/挿入を防止)
  const lengthRatio = Math.max(s.length, t.length) / Math.min(s.length, t.length);
  if (lengthRatio > 3.5) return false;

  // ノイズまたはPIIなら除外
  if (isNoiseOrPii(s) || isNoiseOrPii(t)) return false;

  // ターゲット (正解) は少なくとも漢字、カタカナ、または医学英字略語を含んでいるべき
  // （単なる平仮名の助詞差分「これは」➔「それは」などの混入を完全防衛）
  const hasMedicalChar = /[\p{Script=Han}\p{Script=Katakana}A-Za-z]/u.test(t);
  if (!hasMedicalChar) return false;

  // 助詞単体は除外
  if (isBoundaryOrParticle(s) || isBoundaryOrParticle(t)) return false;

  return true;
}

/**
 * SequenceMatcher によるトークン差分抽出 (LCSベース + 安全な複合語マージ)
 */
export function extractReplacePairs(
  sourceTokens: string[],
  targetTokens: string[],
  type: 'ime' | 'asr'
): LearnedPair[] {
  // 空白トークンを整理したクリーンなトークン列
  const sList = sourceTokens.filter((t) => t.trim().length > 0);
  const tList = targetTokens.filter((t) => t.trim().length > 0);

  const n = sList.length;
  const m = tList.length;

  if (n === 0 || m === 0) return [];

  if (n * m > 400000) {
    return [];
  }

  // 1. 動的計画法 (DP) による最長共通部分列 (LCS) 計算
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (sList[i - 1] === tList[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 2. バックトラックによるオペレーション列生成
  let i = n;
  let j = m;
  const diffOps: Array<{ op: 'equal' | 'replace' | 'delete' | 'insert'; sTokens: string[]; tTokens: string[] }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && sList[i - 1] === tList[j - 1]) {
      diffOps.push({
        op: 'equal',
        sTokens: [sList[i - 1]],
        tTokens: [tList[j - 1]],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.push({
        op: 'insert',
        sTokens: [],
        tTokens: [tList[j - 1]],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diffOps.push({
        op: 'delete',
        sTokens: [sList[i - 1]],
        tTokens: [],
      });
      i--;
    }
  }

  diffOps.reverse();

  // 3. 連続する delete + insert を 1つの replace に統合
  type OpBlock = { op: 'equal' | 'replace'; sText: string; tText: string };
  const mergedOps: OpBlock[] = [];
  let sBuffer: string[] = [];
  let tBuffer: string[] = [];

  const flushBuffer = () => {
    if (sBuffer.length > 0 || tBuffer.length > 0) {
      mergedOps.push({
        op: 'replace',
        sText: sBuffer.join(''),
        tText: tBuffer.join(''),
      });
      sBuffer = [];
      tBuffer = [];
    }
  };

  for (const item of diffOps) {
    if (item.op === 'equal') {
      flushBuffer();
      mergedOps.push({
        op: 'equal',
        sText: item.sTokens.join(''),
        tText: item.tTokens.join(''),
      });
    } else if (item.op === 'delete') {
      sBuffer.push(...item.sTokens);
    } else if (item.op === 'insert') {
      tBuffer.push(...item.tTokens);
    }
  }
  flushBuffer();

  // 4. 【安全な複合語マージ (Sudachi Mode C)】
  // 単語内部の構成要素（英数字、ハイフン等）のみマージを許可し、
  // 助詞（に, て, を, は 等）や句読点は絶対にまたがない
  const smoothedOps: OpBlock[] = [];
  let idx = 0;

  while (idx < mergedOps.length) {
    const current = mergedOps[idx];

    if (current.op === 'replace') {
      let combinedS = current.sText;
      let combinedT = current.tText;
      let nextIdx = idx + 1;

      // 短い英数やハイフン（例: ST, -, /）など、非助詞・非句読点の中間パーツのみマージ
      while (
        nextIdx + 1 < mergedOps.length &&
        mergedOps[nextIdx].op === 'equal' &&
        mergedOps[nextIdx].sText.length <= 4 &&
        !isBoundaryOrParticle(mergedOps[nextIdx].sText) &&
        /^[A-Za-z0-9\-/_]+$/.test(mergedOps[nextIdx].sText) &&
        mergedOps[nextIdx + 1].op === 'replace'
      ) {
        const bridge = mergedOps[nextIdx].sText;
        combinedS += bridge + mergedOps[nextIdx + 1].sText;
        combinedT += bridge + mergedOps[nextIdx + 1].tText;
        nextIdx += 2;
      }

      if (nextIdx > idx + 1 && isValidMedicalPair(combinedS, combinedT)) {
        smoothedOps.push({
          op: 'replace',
          sText: combinedS,
          tText: combinedT,
        });
        idx = nextIdx;
        continue;
      }
    }

    smoothedOps.push(current);
    idx++;
  }

  // 5. 学習ペアの最終抽出
  const pairs: LearnedPair[] = [];

  for (const op of smoothedOps) {
    if (op.op === 'replace' && op.sText && op.tText) {
      const s = op.sText.trim();
      const t = op.tText.trim();

      if (isValidMedicalPair(s, t)) {
        pairs.push({
          source: s,
          target: t,
          type,
          confidence: 0.95,
        });
      }
    }
  }

  return pairs;
}

/**
 * Web Worker メインメッセージハンドラ
 */
if (typeof self !== 'undefined') {
  self.onmessage = (e: MessageEvent<DiffWorkerRequest>) => {
    const { id, type, sourceText, targetText } = e.data;
    const startTime = performance.now();

    try {
      let effectiveSource = sourceText;
      let croppedSource: string | undefined = undefined;

      // 系統A (電カルIME) の場合は Anchor Matching で局所クロップ
      if (type === 'ime_diff') {
        effectiveSource = cropAnchorBlock(sourceText, targetText);
        croppedSource = effectiveSource;
      }

      // トークン化
      const sTokens = tokenizeJapanese(effectiveSource);
      const tTokens = tokenizeJapanese(targetText);

      // 差分抽出
      const pairs = extractReplacePairs(sTokens, tTokens, type === 'ime_diff' ? 'ime' : 'asr');

      const elapsedMs = performance.now() - startTime;

      self.postMessage({
        id,
        type,
        pairs,
        croppedSource,
        elapsedMs,
      } as DiffWorkerResponse);
    } catch (err: any) {
      console.error('[diffWorker] 差分抽出エラー:', err);
      self.postMessage({
        id,
        type,
        pairs: [],
        elapsedMs: performance.now() - startTime,
      } as DiffWorkerResponse);
    }
  };
}
