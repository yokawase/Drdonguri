/**
 * EmbeddingGemma 2 (740M MRL 128d) 単体テスト
 * Google DeepMind の EmbeddingGemma 2 仕様に準拠したセマンティック検索機能の検証
 */

import { describe, it, expect } from 'vitest';
import {
  computeEmbeddingGemmaQueryVector,
  computeCosineSimilarity,
  searchWithEmbeddingGemma,
} from '../src/services/embeddingGemmaService';
import { EMBEDDING_GEMMA_VECTOR_DATABASE } from '../src/data/embeddingGemmaVectors';

describe('EmbeddingGemma 2 (740M MRL 128d) Engine Tests', () => {
  it('1. ベクトル次元 & L2 Unit 正規化の検証', () => {
    const query = '成人発熱と急性咽頭炎の抗菌薬適応';
    const vec = computeEmbeddingGemmaQueryVector(query);

    // 128次元 MRL であること
    expect(vec.length).toBe(128);

    // L2 ノルムが 1.0 (Unit Vector) であること
    let sumSq = 0;
    for (let i = 0; i < vec.length; i++) {
      sumSq += vec[i] * vec[i];
    }
    const norm = Math.sqrt(sumSq);
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it('2. 臨床マスターデータベースの整合性検証', () => {
    expect(EMBEDDING_GEMMA_VECTOR_DATABASE.length).toBeGreaterThanOrEqual(200);

    // 全アイテムが 128次元かつ正規化されていること
    for (const item of EMBEDDING_GEMMA_VECTOR_DATABASE) {
      expect(item.vector.length).toBe(128);
      let sumSq = 0;
      for (const val of item.vector) {
        sumSq += val * val;
      }
      const norm = Math.sqrt(sumSq);
      expect(norm).toBeCloseTo(1.0, 3);
    }
  });

  it('3. 消化器疾患・ピロリ菌のセマンティック検索精度', async () => {
    const results = await searchWithEmbeddingGemma('胃痛とピロリ菌除菌の適応', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    // 上位結果に「胃炎」「潰瘍」「胃癌」または「タケキャブ」等の消化器項目が含まれること
    const hasGiItem = results.some(
      (r) =>
        r.title.includes('胃') ||
        r.title.includes('潰瘍') ||
        r.content.includes('ピロリ') ||
        r.category === '消化器'
    );
    expect(hasGiItem).toBe(true);
    expect(results[0].semanticScore).toBeGreaterThan(0.3);
  });

  it('4. 循環器・血栓塞栓症・DOACのセマンティック検索精度', async () => {
    const results = await searchWithEmbeddingGemma('心房細動の血栓塞栓予防と抗凝固療法', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    // 心房細動、DOAC、血栓関連が上位に含まれること
    const hasCvItem = results.some(
      (r) =>
        r.title.includes('心房細動') ||
        r.title.includes('DOAC') ||
        r.title.includes('エリキュース') ||
        r.title.includes('血栓') ||
        r.category === '循環器'
    );
    expect(hasCvItem).toBe(true);
  });

  it('5. 腎機能障害時の投与設計セマンティック検索精度', async () => {
    const results = await searchWithEmbeddingGemma('腎機能低下 eGFR30未満の減量設計', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    // 腎機能減量マスターまたは関連CQがヒットすること
    const hasRenalItem = results.some(
      (r) =>
        r.type === 'renal' ||
        r.title.includes('腎') ||
        r.content.includes('eGFR') ||
        r.category === '腎・泌尿器'
    );
    expect(hasRenalItem).toBe(true);
  });

  it('6. 225件全件コサイン類似度計算のパフォーマンス (< 5ms)', () => {
    const queryVec = computeEmbeddingGemmaQueryVector('生活習慣病管理料の算定要件と療養計画書');
    const start = performance.now();

    for (const item of EMBEDDING_GEMMA_VECTOR_DATABASE) {
      computeCosineSimilarity(queryVec, item.vector);
    }

    const elapsed = performance.now() - start;
    // 225件の内積計算は 1ms 未満で完了すべき
    expect(elapsed).toBeLessThan(5.0);
  });

  it('7. 救急・中毒プロトコルのセマンティック検索精度 (農薬・有機リン)', async () => {
    const results = await searchWithEmbeddingGemma('農薬を誤飲した アトロピンとPAM投与', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    const hasEmergency = results.some(
      (r) =>
        r.title.includes('有機リン') ||
        r.title.includes('救急') ||
        r.content.includes('アトロピン') ||
        r.category === '中毒'
    );
    expect(hasEmergency).toBe(true);
  });

  it('8. 臨床アトラス・心電図のセマンティック検索精度 (STEMI / 高K血症)', async () => {
    const results = await searchWithEmbeddingGemma('胸痛 ST上昇 V1〜V4 急性心筋梗塞', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    const hasAtlas = results.some(
      (r) =>
        r.title.includes('心筋梗塞') ||
        r.title.includes('STEMI') ||
        r.title.includes('アトラス') ||
        r.category === '心電図'
    );
    expect(hasAtlas).toBe(true);
  });

  it('9. 臨床スコアリングのセマンティック検索精度 (CHADS2 / A-DROP)', async () => {
    const results = await searchWithEmbeddingGemma('心房細動の脳梗塞リスクスコア 年齢や糖尿病', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    const hasScore = results.some(
      (r) =>
        r.title.includes('CHADS2') ||
        r.title.includes('スコア') ||
        r.content.includes('CHADS2') ||
        r.category === 'スコアリング'
    );
    expect(hasScore).toBe(true);
  });

  it('10. 持参薬識別・刻印コードのセマンティック検索精度 (タケキャブ20mg)', async () => {
    const results = await searchWithEmbeddingGemma('タケキャブ 赤色 刻印', 'all', 10, true);
    expect(results.length).toBeGreaterThan(0);

    const hasDrugId = results.some(
      (r) =>
        r.title.includes('タケキャブ') ||
        r.title.includes('持参薬') ||
        r.content.includes('ボノプラザン')
    );
    expect(hasDrugId).toBe(true);
  });
});
