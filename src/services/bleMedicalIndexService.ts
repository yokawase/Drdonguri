/**
 * BleMedicalIndexService (フェーズ1: BLE完結 添付文書要約・錠剤識別・サムネイル即時表示)
 * 
 * ESP32 T-dongle-S3 の 32GB MicroSD に収録された約22,000品目の医薬品マスターおよび
 * 臨床アトラスから、BLE帯域幅（15〜40KB/s）内で0.5msで即応可能な軽量インデックス、
 * 要約テキスト、識別コード（表裏）、用量マスター、256x256 WebPサムネイルを高速提供します。
 */

import {
  DRUG_IDENTIFICATION_CATALOG,
  CLINICAL_ATLAS_CATALOG,
  DrugIdentificationItem,
  ClinicalAtlasItem
} from '../data/microSdMedicalCatalog';

export interface PillSearchCriteria {
  query?: string;           // 薬品名・一般名・刻印キーワード
  imprint?: string;         // 表裏の刻印記号
  color?: string;           // 色 (黄色、淡赤色、白等)
  shape?: string;           // 形 (円形、楕円形、菱形等)
  hasScoredLine?: boolean;  // 割線有無
}

class BleMedicalIndexService {
  private drugCache: Map<string, DrugIdentificationItem> = new Map();
  private atlasCache: Map<string, ClinicalAtlasItem> = new Map();

  constructor() {
    // インデックスの初期マッピング
    DRUG_IDENTIFICATION_CATALOG.forEach(item => {
      this.drugCache.set(item.id, item);
      this.drugCache.set(item.yjCode, item);
      if (item.janCode) this.drugCache.set(item.janCode, item);
    });

    CLINICAL_ATLAS_CATALOG.forEach(item => {
      this.atlasCache.set(item.id, item);
    });
  }

  /**
   * 錠剤識別マスターの複合高速検索 (刻印・名称・形状・色・割線)
   */
  public searchPills(criteria: PillSearchCriteria): DrugIdentificationItem[] {
    const q = (criteria.query || '').trim().toLowerCase();
    const imp = (criteria.imprint || '').trim().toLowerCase();

    return DRUG_IDENTIFICATION_CATALOG.filter(item => {
      // 刻印記号のマッチング (表刻印または裏刻印の部分一致)
      if (imp) {
        const matchFront = item.imprintFront.toLowerCase().includes(imp);
        const matchBack = item.imprintBack.toLowerCase().includes(imp);
        const matchCode = item.imprintCode.toLowerCase().includes(imp);
        if (!matchFront && !matchBack && !matchCode) return false;
      }

      // キーワードマッチング (商品名、一般名、YJコード、薬効分類)
      if (q) {
        const inBrand = item.brandName.toLowerCase().includes(q);
        const inGeneric = item.genericName.toLowerCase().includes(q);
        const inYj = item.yjCode.toLowerCase().includes(q);
        const inCategory = item.category.toLowerCase().includes(q);
        const inImprint = item.imprintCode.toLowerCase().includes(q);
        if (!inBrand && !inGeneric && !inYj && !inCategory && !inImprint) return false;
      }

      // 割線フィルタ
      if (criteria.hasScoredLine !== undefined && criteria.hasScoredLine !== null) {
        if (item.hasScoredLine !== criteria.hasScoredLine) return false;
      }

      // 形状・色フィルタ
      if (criteria.shape && !item.colorAndShape.includes(criteria.shape)) {
        return false;
      }
      if (criteria.color && !item.colorAndShape.includes(criteria.color)) {
        return false;
      }

      return true;
    });
  }

  /**
   * 臨床アトラスのカテゴリ・疾患名検索
   */
  public searchAtlas(category?: '全件' | '皮膚科' | '内視鏡' | '心電図', keyword?: string): ClinicalAtlasItem[] {
    const kw = (keyword || '').trim().toLowerCase();

    return CLINICAL_ATLAS_CATALOG.filter(item => {
      if (category && category !== '全件' && item.category !== category) {
        return false;
      }

      if (kw) {
        const inTitle = item.title.toLowerCase().includes(kw);
        const inFeatures = item.typicalFeatures.toLowerCase().includes(kw);
        const inDiff = item.differentialDiagnosis.toLowerCase().includes(kw);
        const inSig = item.clinicalSignificance.toLowerCase().includes(kw);
        if (!inTitle && !inFeatures && !inDiff && !inSig) return false;
      }

      return true;
    });
  }

  /**
   * 単一薬品の添付文書要約テキスト生成 (カルテ引用用)
   */
  public formatDrugSummaryForChart(drug: DrugIdentificationItem): string {
    return `【処方】${drug.brandName} (${drug.genericName})\n` +
      `・用法用量: ${drug.standardDose}\n` +
      `・腎機能設計: ${drug.renalDoseInfo}\n` +
      `・重要注意: ${drug.majorCautions}\n` +
      `（識別: 表[${drug.imprintFront}] 裏[${drug.imprintBack}] 直径${drug.diameterMm}mm）`;
  }

  public formatDrugForMedicalRecord(drug: DrugIdentificationItem): string {
    return this.formatDrugSummaryForChart(drug);
  }

  /**
   * 臨床アトラス所見のカルテ引用テキスト生成
   */
  public formatAtlasFindingsForChart(atlas: ClinicalAtlasItem): string {
    return `【${atlas.category}所見】${atlas.title}\n` +
      `・典型所見: ${atlas.typicalFeatures}\n` +
      `・臨床判断: ${atlas.findingsSummary || atlas.clinicalSignificance}\n` +
      `・鑑別疾患: ${atlas.differentialDiagnosis}`;
  }

  public formatAtlasForMedicalRecord(atlas: ClinicalAtlasItem): string {
    return this.formatAtlasFindingsForChart(atlas);
  }
}

export const bleMedicalIndexService = new BleMedicalIndexService();
