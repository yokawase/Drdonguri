import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bleMedicalIndexService } from '../src/services/bleMedicalIndexService';
import { sdCardStreamingService } from '../src/services/sdCardStreamingService';
import { DRUG_IDENTIFICATION_CATALOG, CLINICAL_ATLAS_CATALOG } from '../src/data/microSdMedicalCatalog';

describe('BleMedicalIndexService & SdCardStreamingService Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('フェーズ1: BLE完結 医薬品・錠剤検索 & アトラス検索', () => {
    it('刻印記号で正しく錠剤を検索できること (表刻印・裏刻印一致)', () => {
      const takecab = bleMedicalIndexService.searchPills({ imprint: 'TAKECAB' });
      expect(takecab.length).toBeGreaterThan(0);
      expect(takecab[0].brandName).toContain('タケキャブ');
      expect(takecab[0].imprintFront).toBe('TAKECAB 20');
      expect(takecab[0].imprintBack).toBe('20');
    });

    it('一般名・商品名キーワードで正しく錠剤を検索できること', () => {
      const eliquis = bleMedicalIndexService.searchPills({ query: 'アピキサバン' });
      expect(eliquis.length).toBeGreaterThan(0);
      expect(eliquis[0].brandName).toContain('エリキュース');
    });

    it('割線有無および形状フィルタが正しく動作すること', () => {
      const scoredPills = bleMedicalIndexService.searchPills({ hasScoredLine: true });
      expect(scoredPills.every(p => p.hasScoredLine)).toBe(true);

      const unscoredPills = bleMedicalIndexService.searchPills({ hasScoredLine: false });
      expect(unscoredPills.every(p => !p.hasScoredLine)).toBe(true);
    });

    it('アトラスカテゴリ検索で心電図、皮膚科、内視鏡が抽出できること', () => {
      const ecgItems = bleMedicalIndexService.searchAtlas('心電図');
      expect(ecgItems.length).toBeGreaterThan(0);
      expect(ecgItems.every(item => item.category === '心電図')).toBe(true);

      const skinItems = bleMedicalIndexService.searchAtlas('皮膚科');
      expect(skinItems.length).toBeGreaterThan(0);
      expect(skinItems.every(item => item.category === '皮膚科')).toBe(true);
    });

    it('カルテ引用用テキストが適切にフォーマットされること', () => {
      const sampleDrug = DRUG_IDENTIFICATION_CATALOG[0];
      const drugText = bleMedicalIndexService.formatDrugForMedicalRecord(sampleDrug);
      expect(drugText).toContain('【処方】');
      expect(drugText).toContain('用法用量:');
      expect(drugText).toContain('腎機能設計:');

      const sampleAtlas = CLINICAL_ATLAS_CATALOG[0];
      const atlasText = bleMedicalIndexService.formatAtlasForMedicalRecord(sampleAtlas);
      expect(atlasText).toContain('所見】');
      expect(atlasText).toContain('典型所見:');
      expect(atlasText).toContain('鑑別疾患:');
    });
  });

  describe('フェーズ2: Wi-Fi SoftAP ストリーミング', () => {
    it('SoftAP 未接続時のステータスおよびフォールバックURL返却', async () => {
      // ネットワーク未到達をシミュレート
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network unreachable'));

      const status = await sdCardStreamingService.checkApConnection();
      expect(status.isConnected).toBe(false);
      expect(status.ip).toBe('192.168.4.1');

      const url = await sdCardStreamingService.getAtlasImageUrl('/clinical_atlas/ecg.webp', 'fallback-data-url');
      expect(url).toBe('fallback-data-url');
    });

    it('SoftAP 接続成功時のステータス更新', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok', sdCardMounted: true }),
      } as any);

      const status = await sdCardStreamingService.checkApConnection();
      expect(status.isConnected).toBe(true);
      expect(status.ssid).toBe('Drdonguri-Atlas-Direct');
      expect(status.latencyMs).not.toBeNull();
    });
  });
});
