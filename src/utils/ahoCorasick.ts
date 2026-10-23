/**
 * =============================================================================
 * DrVoice どんぐり君！ (Dr.Dongly)
 * Aho-Corasick 多パターン文字列検索・最長一致置換自己進化エンジン
 * =============================================================================
 * 
 * 系統A (電カルIME誤変換) および 系統B (ASR誤認識) で学習された
 * 置換辞書 (Source ➔ Target) を Trie木 + Failureリンクで保持し、
 * O(N + M) の線形時間でミリ秒単位の最長一致一括置換を実現する。
 */

export interface ReplacementMatch {
  original: string;
  replacement: string;
  start: number;
  end: number;
}

export interface ReplaceResult {
  result: string;
  replacedCount: number;
  replacements: ReplacementMatch[];
}

interface OutputEntry {
  pattern: string;
  replacement: string;
  length: number;
}

class AhoNode {
  public children: Map<string, AhoNode> = new Map();
  public fail: AhoNode | null = null;
  public outputs: OutputEntry[] = [];
}

export class AhoCorasickEngine {
  private root: AhoNode = new AhoNode();
  private patternCount: number = 0;
  private isBuilt: boolean = false;
  private dict: Map<string, string> = new Map();

  constructor(initialDict?: Record<string, string> | Map<string, string>) {
    if (initialDict) {
      this.loadDictionary(initialDict);
    }
  }

  /**
   * 辞書パターンを追加
   */
  public addPattern(pattern: string, replacement: string): void {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) return;

    this.dict.set(trimmedPattern, replacement);
    this.isBuilt = false;
  }

  /**
   * 辞書を一括読み込み
   */
  public loadDictionary(dict: Record<string, string> | Map<string, string>): void {
    this.clear();
    const entries = dict instanceof Map ? dict.entries() : Object.entries(dict);
    for (const [pattern, replacement] of entries) {
      const trimmed = pattern.trim();
      if (trimmed) {
        this.dict.set(trimmed, replacement);
      }
    }
    this.rebuildTrie();
  }

  /**
   * 現在の辞書を取得
   */
  public getDictionary(): Map<string, string> {
    return new Map(this.dict);
  }

  /**
   * 登録パターン件数
   */
  public get size(): number {
    return this.dict.size;
  }

  /**
   * 辞書クリア
   */
  public clear(): void {
    this.root = new AhoNode();
    this.patternCount = 0;
    this.isBuilt = false;
    this.dict.clear();
  }

  /**
   * Trie木の再構築とFailureリンク計算 (BFS)
   */
  public build(): void {
    if (this.isBuilt) return;
    this.rebuildTrie();
  }

  private rebuildTrie(): void {
    this.root = new AhoNode();
    this.patternCount = this.dict.size;

    // 1. Trie木構築
    for (const [pattern, replacement] of this.dict.entries()) {
      let current = this.root;
      for (const char of pattern) {
        if (!current.children.has(char)) {
          current.children.set(char, new AhoNode());
        }
        current = current.children.get(char)!;
      }
      current.outputs.push({
        pattern,
        replacement,
        length: pattern.length,
      });
    }

    // 2. Failureリンク計算 (BFS: 幅優先探索)
    const queue: AhoNode[] = [];

    // ルートの子ノードのfailはルート自身
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, child] of current.children.entries()) {
        let fallback = current.fail;
        while (fallback !== null && !fallback.children.has(char)) {
          fallback = fallback.fail;
        }

        if (fallback === null) {
          child.fail = this.root;
        } else {
          child.fail = fallback.children.get(char)!;
          // 出力リンクの併合 (辞書サフィックスの引き継ぎ)
          if (child.fail.outputs.length > 0) {
            child.outputs.push(...child.fail.outputs);
          }
        }

        queue.push(child);
      }
    }

    this.isBuilt = true;
  }

  /**
   * テキスト中のパターンを最長一致で高速置換
   * O(N) の時間計算量で完了
   */
  public replaceLongestMatch(text: string): ReplaceResult {
    if (!text || this.dict.size === 0) {
      return { result: text, replacedCount: 0, replacements: [] };
    }

    if (!this.isBuilt) {
      this.build();
    }

    // マッチ箇所を全走査
    const allMatches: ReplacementMatch[] = [];
    let current = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Failureリンクを辿る
      while (current !== this.root && !current.children.has(char)) {
        current = current.fail || this.root;
      }

      current = current.children.get(char) || this.root;

      if (current.outputs.length > 0) {
        // 最も長いマッチを選択
        let bestOutput: OutputEntry = current.outputs[0];
        for (let j = 1; j < current.outputs.length; j++) {
          if (current.outputs[j].length > bestOutput.length) {
            bestOutput = current.outputs[j];
          }
        }

        allMatches.push({
          original: bestOutput.pattern,
          replacement: bestOutput.replacement,
          start: i - bestOutput.length + 1,
          end: i + 1,
        });
      }
    }

    if (allMatches.length === 0) {
      return { result: text, replacedCount: 0, replacements: [] };
    }

    // 最長一致・左優先で重複を排除
    // 開始位置順にソート（開始位置が同じなら長さ降順）
    allMatches.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });

    const nonOverlapping: ReplacementMatch[] = [];
    let lastEnd = 0;

    for (const match of allMatches) {
      if (match.start >= lastEnd) {
        nonOverlapping.push(match);
        lastEnd = match.end;
      }
    }

    // 置換後テキストの生成
    let result = '';
    let cursor = 0;

    for (const match of nonOverlapping) {
      result += text.slice(cursor, match.start);
      result += match.replacement;
      cursor = match.end;
    }
    if (cursor < text.length) {
      result += text.slice(cursor);
    }

    return {
      result,
      replacedCount: nonOverlapping.length,
      replacements: nonOverlapping,
    };
  }
}
