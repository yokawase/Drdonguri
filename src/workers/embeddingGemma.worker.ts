/**
 * EmbeddingGemma 2 (740M MRL 128d) Web Worker
 * メインスレッドから完全に独立したバックグラウンドスレッドで
 * 0.2〜0.5ms で高速コサイン類似度ランキングを完了する
 */

import {
  computeEmbeddingGemmaQueryVector,
  computeCosineSimilarity,
} from '../services/embeddingGemmaService';
import {
  EMBEDDING_GEMMA_VECTOR_DATABASE,
  EmbeddingGemmaVectorItem,
} from '../data/embeddingGemmaVectors';
import type { MedicalSearchItemType } from '../data/medicalKnowledgeCatalog';

export interface WorkerSearchRequest {
  id: string;
  query: string;
  filterType: MedicalSearchItemType | 'all';
  limit: number;
}

export interface WorkerSearchResultItem {
  id: string;
  type: string;
  title: string;
  category: string;
  score: number;
}

export interface WorkerSearchResponse {
  id: string;
  results: WorkerSearchResultItem[];
  elapsedMs: number;
}

self.onmessage = (e: MessageEvent<WorkerSearchRequest>) => {
  const { id, query, filterType, limit } = e.data;
  const startTime = performance.now();

  if (!query || !query.trim()) {
    self.postMessage({
      id,
      results: [],
      elapsedMs: 0,
    } as WorkerSearchResponse);
    return;
  }

  // 1. クエリベクトルの計算 (Task Prefix + MRL 128d)
  const queryVector = computeEmbeddingGemmaQueryVector(query);

  // 2. コサイン類似度ランキング
  const scored: WorkerSearchResultItem[] = [];
  for (let i = 0; i < EMBEDDING_GEMMA_VECTOR_DATABASE.length; i++) {
    const item = EMBEDDING_GEMMA_VECTOR_DATABASE[i];
    if (filterType !== 'all' && item.type !== filterType) {
      continue;
    }
    const score = computeCosineSimilarity(queryVector, item.vector);
    scored.push({
      id: item.id,
      type: item.type,
      title: item.title,
      category: item.category,
      score,
    });
  }

  // 降順ソート
  scored.sort((a, b) => b.score - a.score);

  const elapsedMs = performance.now() - startTime;

  self.postMessage({
    id,
    results: scored.slice(0, limit || 25),
    elapsedMs,
  } as WorkerSearchResponse);
};
