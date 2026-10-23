/**
 * =============================================================================
 * DrVoice どんぐり君！ (Dr.Dongly)
 * 自動自己学習辞書マネージャー (Auto-Learning Medical Dictionary Hook)
 * =============================================================================
 * 
 * 1. 【系統A：電カルIME誤変換】（外部ループ）
 *    - 仮想プリンタBulk OUTから吸い上げたテキストと送信テキストの局所差分から誤変換を学習
 * 2. 【系統B：ASR生音声誤認識】（内部ループ）
 *    - 音声認識生出力とSLM/医療辞書確定テキストの差分から誤認識を学習
 * 
 * 厳格な昇格ルール:
 * - 同一ペアが 2回以上 (n >= 2) 観測された場合のみ正式辞書へ昇格 (Promotion)
 * - 個人識別情報 (PII) や数値ノイズは自動排除
 * 
 * 反映:
 * - Aho-Corasick 多パターン置換エンジンで即時ミリ秒置換
 * - 出現頻度上位用語を Whisper の initial_prompt 文字列へ動的自動注入
 * - IndexedDB (テーブル名: dongly_learned_dict) に永続化
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AhoCorasickEngine } from '../utils/ahoCorasick';
import type { LearnedPair, DiffWorkerRequest, DiffWorkerResponse } from '../workers/diffWorker';

export interface LearnedDictRecord {
  id: string; // `${type}:::${source}:::${target}`
  source: string; // 誤字・誤認識 (例: '新田図', 'ひろゆき')
  target: string; // 正解・医学用語 (例: '心電図', 'ピロリ菌')
  type: 'ime' | 'asr';
  count: number; // 観測回数
  promoted: boolean; // n >= 2
  firstSeen: number;
  lastSeen: number;
}

const DB_NAME = 'drdonguri_knowledge_db';
const DB_VERSION = 1;
const STORE_NAME = 'dongly_learned_dict';

/**
 * 初期プリセット代表辞書（臨床現場で即座に効果を発揮するベースライン）
 */
const INITIAL_PRESET_ENTRIES: Omit<LearnedDictRecord, 'firstSeen' | 'lastSeen'>[] = [
  // 系統A: 電カルIME誤変換
  { id: 'ime:::新田図:::心電図', source: '新田図', target: '心電図', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::信金虚血:::心筋虚血', source: '信金虚血', target: '心筋虚血', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::きょう新将:::狭心症', source: 'きょう新将', target: '狭心症', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::日ST上昇型信金高速:::非ST上昇型心筋梗塞', source: '日ST上昇型信金高速', target: '非ST上昇型心筋梗塞', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::心金梗塞:::心筋梗塞', source: '心金梗塞', target: '心筋梗塞', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::はい水腫:::肺水腫', source: 'はい水腫', target: '肺水腫', type: 'ime', count: 2, promoted: true },
  { id: 'ime:::頸動脈えコー:::頸動脈エコー', source: '頸動脈えコー', target: '頸動脈エコー', type: 'ime', count: 2, promoted: true },

  // 系統B: ASR音声誤認識
  { id: 'asr:::ひろゆき:::ピロリ菌', source: 'ひろゆき', target: 'ピロリ菌', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::白井君:::ピロリ菌', source: '白井君', target: 'ピロリ菌', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::彼岸の原因:::ピロリ菌', source: '彼岸の原因', target: 'ピロリ菌', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::領域:::ピロリ菌', source: '領域', target: 'ピロリ菌', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::誕生日に胸部:::体動時に胸部', source: '誕生日に胸部', target: '体動時に胸部', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::オーソン 2:::放散痛', source: 'オーソン 2', target: '放散痛', type: 'asr', count: 2, promoted: true },
  { id: 'asr:::ホウ三2:::放散痛', source: 'ホウ三2', target: '放散痛', type: 'asr', count: 2, promoted: true },
];

/**
 * IndexedDB ヘルパー
 */
function openLearnedDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('promoted', 'promoted', { unique: false });
        store.createIndex('count', 'count', { unique: false });
        store.createIndex('lastSeen', 'lastSeen', { unique: false });

        // 初期シード投入
        const now = Date.now();
        for (const item of INITIAL_PRESET_ENTRIES) {
          store.put({
            ...item,
            firstSeen: now,
            lastSeen: now,
          });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllLearnedRecords(): Promise<LearnedDictRecord[]> {
  try {
    const db = await openLearnedDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[useAutoDictionary] IndexedDB取得エラー、フォールバック使用:', e);
    const now = Date.now();
    return INITIAL_PRESET_ENTRIES.map((e) => ({ ...e, firstSeen: now, lastSeen: now }));
  }
}

async function saveLearnedRecord(record: LearnedDictRecord): Promise<void> {
  try {
    const db = await openLearnedDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[useAutoDictionary] IndexedDB保存エラー:', e);
  }
}

export interface UseAutoDictionaryOptions {
  onPromoted?: (entry: LearnedDictRecord) => void;
  onNotice?: (message: string) => void;
}

export function useAutoDictionary(options?: UseAutoDictionaryOptions) {
  const [entries, setEntries] = useState<LearnedDictRecord[]>([]);
  const [isReady, setIsReady] = useState(false);
  const ahoEngineRef = useRef<AhoCorasickEngine>(new AhoCorasickEngine());
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestsRef = useRef<Map<string, (pairs: LearnedPair[]) => void>>(new Map());

  // 1. Worker 初期化
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const worker = new Worker(
        new URL('../workers/diffWorker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (e: MessageEvent<DiffWorkerResponse>) => {
        const { id, pairs } = e.data;
        const cb = pendingRequestsRef.current.get(id);
        if (cb) {
          cb(pairs);
          pendingRequestsRef.current.delete(id);
        }
      };

      workerRef.current = worker;
    } catch (err) {
      console.warn('[useAutoDictionary] DiffWorker初期化エラー:', err);
    }

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  // 2. IndexedDB から既存辞書の読み込み & Aho-Corasick 初期化
  useEffect(() => {
    let active = true;

    getAllLearnedRecords().then((records) => {
      if (!active) return;
      setEntries(records);

      // 昇格済みエントリを Aho-Corasick エンジンへ登録
      const promoted = records.filter((r) => r.promoted);
      const dictMap = new Map<string, string>();
      for (const r of promoted) {
        dictMap.set(r.source, r.target);
      }
      ahoEngineRef.current.loadDictionary(dictMap);
      setIsReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  // 3. ペアの記録 ＆ n >= 2 昇格ロジック
  const recordPair = useCallback(
    async (source: string, target: string, type: 'ime' | 'asr'): Promise<{ isNewPromotion: boolean; record: LearnedDictRecord }> => {
      const s = source.trim();
      const t = target.trim();
      if (!s || !t || s === t) {
        throw new Error('Invalid pair');
      }

      const id = `${type}:::${s}:::${t}`;
      const now = Date.now();

      let targetRecord: LearnedDictRecord | undefined = entries.find((e) => e.id === id);
      let isNewPromotion = false;

      if (!targetRecord) {
        // 初回観測 (count = 1)
        targetRecord = {
          id,
          source: s,
          target: t,
          type,
          count: 1,
          promoted: false,
          firstSeen: now,
          lastSeen: now,
        };
      } else {
        // 2回目以降の観測
        const nextCount = targetRecord.count + 1;
        const willPromote = nextCount >= 2;
        isNewPromotion = !targetRecord.promoted && willPromote;

        targetRecord = {
          ...targetRecord,
          count: nextCount,
          promoted: willPromote,
          lastSeen: now,
        };
      }

      // IndexedDB 保存
      await saveLearnedRecord(targetRecord);

      // ステート更新
      setEntries((prev) => {
        const next = prev.filter((e) => e.id !== id);
        return [...next, targetRecord!];
      });

      // 昇格した場合は即時 Aho-Corasick エンジンへ反映
      if (targetRecord.promoted) {
        ahoEngineRef.current.addPattern(targetRecord.source, targetRecord.target);
        ahoEngineRef.current.build();
      }

      // 通知コールバック
      if (isNewPromotion) {
        options?.onPromoted?.(targetRecord);
        options?.onNotice?.(`⚡ 辞書を自動更新: 「${targetRecord.source}」➔「${targetRecord.target}」`);
      }

      return { isNewPromotion, record: targetRecord };
    },
    [entries, options]
  );

  // 4. 【系統A：電カルIME誤変換】の自動抽出・学習
  const learnFromImeDiff = useCallback(
    async (emrPulledText: string, sentText: string): Promise<LearnedPair[]> => {
      if (!emrPulledText.trim() || !sentText.trim() || !workerRef.current) {
        return [];
      }

      return new Promise<LearnedPair[]>((resolve) => {
        const requestId = `ime_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        pendingRequestsRef.current.set(requestId, async (pairs: LearnedPair[]) => {
          for (const pair of pairs) {
            await recordPair(pair.source, pair.target, 'ime');
          }
          resolve(pairs);
        });

        workerRef.current!.postMessage({
          id: requestId,
          type: 'ime_diff',
          sourceText: emrPulledText, // 電カル吸い上げテキスト (誤字側)
          targetText: sentText,      // どんぐり送信テキスト (正解側)
        } as DiffWorkerRequest);
      });
    },
    [recordPair]
  );

  // 5. 【系統B：ASR生音声誤認識】の自動抽出・学習
  const learnFromAsrDiff = useCallback(
    async (rawSpeechText: string, finalizedText: string): Promise<LearnedPair[]> => {
      if (!rawSpeechText.trim() || !finalizedText.trim() || !workerRef.current) {
        return [];
      }

      return new Promise<LearnedPair[]>((resolve) => {
        const requestId = `asr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        pendingRequestsRef.current.set(requestId, async (pairs: LearnedPair[]) => {
          for (const pair of pairs) {
            await recordPair(pair.source, pair.target, 'asr');
          }
          resolve(pairs);
        });

        workerRef.current!.postMessage({
          id: requestId,
          type: 'asr_diff',
          sourceText: rawSpeechText, // Whisper生出力 (誤認識側)
          targetText: finalizedText,  // SLM/医療辞書確定テキスト (正解側)
        } as DiffWorkerRequest);
      });
    },
    [recordPair]
  );

  // 6. Aho-Corasick による最長一致置換 (ミリ秒)
  const replaceWithLearnedDict = useCallback((text: string) => {
    return ahoEngineRef.current.replaceLongestMatch(text);
  }, []);

  // 7. Whisper 推論用 initial_prompt の動的生成
  // 出現頻度（count）の高い医学用語ターゲット上位10〜20件を先頭に注入
  const getWhisperInitialPrompt = useCallback((): string => {
    const promoted = entries.filter((e) => e.promoted && e.target);
    // 出現頻度降順ソート
    promoted.sort((a, b) => b.count - a.count);

    // 重複を排除してターゲット医学用語を抽出
    const uniqueTargets: string[] = [];
    const seen = new Set<string>();

    for (const item of promoted) {
      if (!seen.has(item.target)) {
        seen.add(item.target);
        uniqueTargets.push(item.target);
        if (uniqueTargets.length >= 20) break;
      }
    }

    if (uniqueTargets.length === 0) {
      return '心電図、心筋虚血、狭心症、非ST上昇型心筋梗塞、ピロリ菌、体動時、放散痛';
    }

    return uniqueTargets.join('、');
  }, [entries]);

  // 昇格済み・未昇格候補エントリ
  const promotedEntries = entries.filter((e) => e.promoted);
  const candidateEntries = entries.filter((e) => !e.promoted);

  return {
    isReady,
    entries,
    promotedEntries,
    candidateEntries,
    recordPair,
    learnFromImeDiff,
    learnFromAsrDiff,
    replaceWithLearnedDict,
    getWhisperInitialPrompt,
  };
}
