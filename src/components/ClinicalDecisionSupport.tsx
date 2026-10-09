import React, { useState, useMemo, useEffect } from 'react';
import {
  Stethoscope,
  Activity,
  AlertTriangle,
  ShieldCheck,
  BookOpen,
  ArrowRight,
  Plus,
  Pill,
  Check,
  X,
  FileText,
  Sparkles,
  Info,
  ShieldAlert,
  Zap,
  HelpCircle
} from 'lucide-react';

// ============================================================================
// 1. 型定義 (Smart Personal Healthcare HVC TypeScript Interface)
// ============================================================================
export type DiagnosisStatus = 'confirmed' | 'suspected';
export type AlertSeverity = 'info' | 'warning' | 'danger';
export type ScoreLevel = 'low' | 'moderate' | 'high' | 'critical';
export type HvcNudgeCategory = 'clinical_support' | 'prescription_check' | 'billing_safety' | 'previsit_pmh';

export interface SuggestedDiagnosis {
  standardName: string;    // 標準病名（例: 本態性高血圧症）
  icd10Code: string;       // ICD-10コード（例: I10）
  medisCode: string;       // MEDIS標準病名コード（例: 20063968）
  status: DiagnosisStatus; // 確定 or 疑い
  evidence: string;        // カルテ内の客観的根拠抜粋
  confidence: number;      // 確信度 (0.0 - 1.0)
  category: string;        // 診療科・大分類
  isChronic: boolean;      // 慢性疾患フラグ
  billingTip?: string;     // レセプト返戻・査定防止のアドバイス
}

export interface ClinicalScore {
  scoreType: 
    | 'CHADS2' 
    | 'CENTOR' 
    | 'HEAD_INJURY_CT' 
    | 'A_DROP' 
    | 'PPI_STEWARDSHIP' 
    | 'GI_ENDOSCOPY_HVC' 
    | 'FIB_4'
    | 'CURB_65';
  title: string;             // スコア名称（例: 軽症頭部外傷CT適応判定 (CCHR/PECARN)）
  targetCondition: string;   // 対象病態
  nudgeCategory: HvcNudgeCategory; // 🛡️ Clinical Support / 🛡️ Prescription Check / 💡 Billing Safety / 🛡️ Pre-visit PMH
  scoreValue: number | string; // 計算スコア（点数またはステージ）
  maxScore?: number;         // 最大点数
  level: ScoreLevel;         // リスク度合
  fulfilledCriteria: Array<{
    key: string;
    label: string;
    points: number;
    matchedText?: string;
  }>;
  guidelineTitle: string;    // 準拠ガイドライン
  recommendation: string;    // 医師を守る推奨アクション・防衛的サジェスト
  harmAvoidanceBenefit?: string; // 不必要な身体的ハーム（被曝・下剤・偶発症・偽陽性）の回避メリット
}

export interface SafetyAlert {
  id: string;
  type: 'contraindication' | 'dosage_warning' | 'interaction';
  title: string;
  message: string;
  severity: AlertSeverity;
  drugs: [string, string] | [string];
  recommendation: string;
}

export interface ClinicalDecisionSupportResult {
  diagnoses: SuggestedDiagnosis[];
  scores: ClinicalScore[];
  alerts: SafetyAlert[];
  analyzedAt: number;
  engine: 'hybrid-ai' | 'offline-rule' | 'local-webllm';
}

// ============================================================================
// 2. 組み込みコア医学データセット (MEDISサブセット & レセプト適応支援)
// ============================================================================
interface MasterDiagnosisEntry {
  icd10: string;
  medis: string;
  name: string;
  category: string;
  isChronic: boolean;
  keywords: string[];
  billingTip?: string;
}

const CORE_DIAGNOSIS_DATABASE: MasterDiagnosisEntry[] = [
  {
    icd10: 'I10',
    medis: '20063968',
    name: '本態性高血圧症',
    category: '循環器',
    isChronic: true,
    keywords: ['高血圧', '高血圧症', 'HT', 'HTN', '家庭血圧', '外来血圧', '降圧薬', 'アムロジピン', 'テルミサルタン', 'オルメサルタン', 'バルサルタン', '128/82', '134/86'],
    billingTip: '降圧薬処方時の必須算定病名。特定疾患療養管理料の対象となります。'
  },
  {
    icd10: 'E11.9',
    medis: '20064012',
    name: '２型糖尿病',
    category: '代謝内分泌',
    isChronic: true,
    keywords: ['糖尿病', '2型糖尿病', 'DM', 'HbA1c', '空腹時血糖', 'メトホルミン', 'ジャヌビア', 'フォシーガ', 'ジャディアンス', 'インスリン'],
    billingTip: 'HbA1c測定および血糖降下薬の適応病名。生活習慣病管理料の算定基準となります。'
  },
  {
    icd10: 'E78.5',
    medis: '20064115',
    name: '脂質異常症',
    category: '代謝内分泌',
    isChronic: true,
    keywords: ['脂質異常症', '高脂血症', 'DL', 'コレステロール', 'LDL', '中性脂肪', 'TG', 'アトルバスタチン', 'ロスバスタチン', 'リピトール'],
    billingTip: 'スタチン系・フィブラート系薬剤の適応病名。'
  },
  {
    icd10: 'K21.0',
    medis: '20064310',
    name: '逆流性食道炎',
    category: '消化器',
    isChronic: true,
    keywords: ['逆流性食道炎', 'GERD', '胸焼け', '呑酸', 'タケキャブ', 'ネキシウム', '食道裂孔ヘルニア'],
    billingTip: '【重要】タケキャブ・ネキシウム等のPPI/P-CAB処方時に病名漏れがあるとレセプト査定・返戻対象となります。'
  },
  {
    icd10: 'K25.9',
    medis: '20064315',
    name: '胃潰瘍',
    category: '消化器',
    isChronic: true,
    keywords: ['胃潰瘍', '心窩部痛', '胃粘膜病変', '胃痛', 'タケキャブ', 'ネキシウム'],
    billingTip: '酸分泌抑制薬・胃粘膜保護薬の適応病名。内視鏡所見のカルテ記載を推奨。'
  },
  {
    icd10: 'I48.9',
    medis: '20063980',
    name: '心房細動',
    category: '循環器',
    isChronic: true,
    keywords: ['心房細動', '発作性心房細動', 'Af', 'AF', '不整脈', '心房粗動', '除細動'],
    billingTip: 'DOAC（リクシアナ・イグザレルト・エリキュース・プラザキサ）適応病名。'
  },
  {
    icd10: 'J06.9',
    medis: '20064210',
    name: '急性上気道炎',
    category: '呼吸器',
    isChronic: false,
    keywords: ['急性上気道炎', '上気道炎', 'かぜ', '感冒', '咽頭痛', '鼻汁', '発熱', '咳嗽', '咳'],
    billingTip: '対症療法薬の適応病名。細菌感染の証拠がない場合の抗菌薬処方は返戻リスクあり。'
  },
  {
    icd10: 'J02.9',
    medis: '20064215',
    name: '急性咽頭炎',
    category: '呼吸器',
    isChronic: false,
    keywords: ['急性咽頭炎', '咽頭炎', '扁桃炎', '扁桃発赤', '扁桃腫大', '白斑', '前頸部リンパ節'],
    billingTip: '溶連菌迅速抗原検査（RADT）実施時の必須算定病名。'
  },
  {
    icd10: 'J18.9',
    medis: '20064228',
    name: '肺炎',
    category: '呼吸器',
    isChronic: false,
    keywords: ['市中肺炎', '肺炎', '湿性咳嗽', '呼吸困難', 'SpO2低下', '浸潤影', 'ラ音', '水泡音'],
    billingTip: '胸部XP/CT撮影および抗菌薬（レスピラトリーキノロン・ペニシリン等）の必須病名。'
  },
  {
    icd10: 'S00.9',
    medis: '20064820',
    name: '頭部打撲傷',
    category: '救急外傷',
    isChronic: false,
    keywords: ['頭部打撲', '頭部打撲傷', '頭部外傷', '頭をぶつけた', '転倒打撲', '後頭部打撲'],
    billingTip: '観察待機プロトコル選択時または頭部CT撮影時の適応病名。'
  },
  {
    icd10: 'K76.0',
    medis: '20064402',
    name: '脂肪肝',
    category: '消化器',
    isChronic: true,
    keywords: ['脂肪肝', 'NAFLD', 'MASLD', 'NASH', '肝機能障害', 'ALT上昇', 'γ-GTP', '肥満'],
    billingTip: '腹部エコー検査・生化学検査の適応病名。'
  },
  {
    icd10: 'N18.9',
    medis: '20064580',
    name: '慢性腎臓病',
    category: '腎臓',
    isChronic: true,
    keywords: ['慢性腎臓病', 'CKD', 'eGFR', 'クレアチニン', 'Cr上昇', '蛋白尿', '微量アルブミン尿'],
    billingTip: '腎機能障害時の薬剤投与量調整・生活指導管理料の適応。'
  }
];

// 重大・致命的な併用禁忌ルールペア
const CRITICAL_CONTRAINDICATION_RULES = [
  {
    drugA: 'ワーファリン',
    drugB: 'アミオダロン',
    title: '併用禁忌: ワーファリン + アミオダロン',
    reason: 'アミオダロンがCYP2C9等を強力に阻害し、ワーファリンの抗凝固作用が著しく増強され致死的な出血を誘発します。',
    severity: 'danger' as AlertSeverity,
    recommendation: '併用は禁忌です。抗不整脈薬の代替変更または他剤検討を強く推奨します。'
  },
  {
    drugA: 'シルデナフィル',
    drugB: 'ニトログリセリン',
    title: '絶対禁忌: シルデナフィル + ニトログリセリン',
    reason: 'NO-cGMP経路の相乗的な過剰増強により、急激かつ不可逆的な重篤血圧低下（ショック死）に至るリスクがあります。',
    severity: 'danger' as AlertSeverity,
    recommendation: '併用は絶対禁忌です。狭心症発作時にはニトロ製剤の使用を直ちに中止・回避してください。'
  },
  {
    drugA: 'シンバスタチン',
    drugB: 'イトラコナゾール',
    title: '併用禁忌: シンバスタチン + イトラコナゾール',
    reason: 'CYP3A4阻害によりスタチン血中濃度が数十倍に跳ね上がり、急性腎不全を伴う重篤な横紋筋融解症を発症します。',
    severity: 'danger' as AlertSeverity,
    recommendation: '抗真菌薬投与中はスタチンを休薬するか、相互作用の少ないプラバスタチン等へ置換してください。'
  },
  {
    drugA: 'ビソプロロール',
    drugB: 'ベラパミル',
    title: '併用注意・原則禁忌: β遮断薬 + ベラパミル',
    reason: '洞結節・房室結節に対する陰性変伝導作用が重複し、高度房室ブロックや重度徐脈・心停止のリスクが生じます。',
    severity: 'warning' as AlertSeverity,
    recommendation: '心機能と心電図（PR間隔）を厳重監視し、極力併用を回避してください。'
  }
];

// ============================================================================
// 3. 高価値医療（HVC）ブラッシュアップ計算エンジン（ローカル・オフライン）
// ============================================================================
export function calculateLocalHvcScores(text: string, patientContext?: { age?: number; gender?: string }): ClinicalScore[] {
  const scores: ClinicalScore[] = [];
  const normalized = text.toLowerCase();
  const patientAge = patientContext?.age ?? (text.match(/(\d{1,2})歳/)?.[1] ? parseInt(RegExp.$1, 10) : 64);

  // --------------------------------------------------------------------------
  // 1. 軽症頭部外傷のCT適応判定 (PECARN / Canadian CT Head Rule: CCHR)
  // --------------------------------------------------------------------------
  const hasHeadInjury = /頭部打撲|頭部外傷|頭をぶつけた|転倒.*頭|後頭部|前頭部|側頭部|たんこぶ|頭部皮下血腫/.test(normalized);
  if (hasHeadInjury) {
    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    let highRiskCount = 0;

    // JCS > 0 または 意識消失
    if (/jcs\s*([1-9]|10|20|30|100|200|300)|gcs\s*(1[0-4]|[3-9])|意識消失|失神|昏迷|健忘/.test(normalized)) {
      highRiskCount += 1;
      criteria.push({ key: 'altered_mental', label: '意識障害または受傷時の一過性意識消失 (+1)', points: 1, matchedText: '意識障害/意識消失の記載あり' });
    } else {
      criteria.push({ key: 'alert', label: '意識清明 (JCS 0 / GCS 15)', points: 0, matchedText: 'JCS 0' });
    }

    // 神経学的異常所見
    if (/麻痺|しびれ|瞳孔不同|病的反射|視野障害|失語|運動麻痺/.test(normalized)) {
      highRiskCount += 1;
      criteria.push({ key: 'neuro_deficit', label: '局所神経脱落症状あり (+1)', points: 1, matchedText: '神経異常あり' });
    } else {
      criteria.push({ key: 'no_neuro', label: '局所神経学的異常なし', points: 0, matchedText: '神経学的異常なし' });
    }

    // 反復嘔吐
    if (/嘔吐(2|3|4|5|複数|頻回)|反復.*嘔吐/.test(normalized)) {
      highRiskCount += 1;
      criteria.push({ key: 'vomiting', label: '2回以上の反復嘔吐 (+1)', points: 1, matchedText: '反復嘔吐あり' });
    }

    // 頭蓋骨骨折の臨床兆候
    if (/耳出血|鼻出血|バトル徴候|パンダの目|髄液漏|陥没/.test(normalized)) {
      highRiskCount += 1;
      criteria.push({ key: 'fracture_signs', label: '頭蓋底・陥没骨折の臨床兆候 (+1)', points: 1, matchedText: '骨折兆候あり' });
    }

    // 高齢者 (65歳以上)
    if (patientAge >= 65) {
      criteria.push({ key: 'elderly', label: `65歳以上 (${patientAge}歳)`, points: 0, matchedText: `${patientAge}歳` });
    }

    const isCtCandidate = highRiskCount > 0;
    scores.push({
      scoreType: 'HEAD_INJURY_CT',
      title: '軽症頭部外傷CT適応判定 (CCHR/PECARN)',
      targetCondition: '頭部打撲における頭蓋内病変リスクとルーチンCT適応評価',
      nudgeCategory: 'clinical_support',
      scoreValue: isCtCandidate ? `${highRiskCount}項目該当` : '低リスク (0項目)',
      level: isCtCandidate ? 'high' : 'low',
      fulfilledCriteria: criteria,
      guidelineTitle: '日本神経外科学会 / 日本救急医学会 頭部外傷治療・診断ガイドライン',
      recommendation: isCtCandidate
        ? '高リスク因子（意識障害・神経所見・反復嘔吐等）が示唆されます。頭蓋内出血除外のため頭部CT撮影を推奨します。'
        : '🛡️ Clinical Support: JCS 0 / 神経学的異常なし。学会指針の「観察待機プロトコル」に合致し、ルーチンCTを猶予可能です。患者・家族へ帰宅後のレッドフラッグ（激しい頭痛・嘔吐・痙攣）出現時の緊急受診基準を指導してください。',
      harmAvoidanceBenefit: '不必要な医療被曝（頭部CT 1回約2mSv）および偶発的微小病変による二次精査の連鎖（偽陽性ケアカスケード）を完全に回避できます。'
    });
  }

  // --------------------------------------------------------------------------
  // 2. 急性気道感染症（感冒）の抗菌薬適正使用判定 (Centor / McIsaac スコア)
  // --------------------------------------------------------------------------
  const hasPharyngitis = /咽頭炎|扁桃炎|咽頭痛|のどの痛み|喉の痛み|感冒|かぜ|上気道炎/.test(normalized);
  if (hasPharyngitis) {
    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    let centorPoints = 0;

    // 1. 発熱 (>38℃)
    if (/38\.[0-9]|39\.|高熱|発熱/.test(normalized)) {
      centorPoints += 1;
      criteria.push({ key: 'fever', label: '38℃を超える発熱 (+1点)', points: 1 });
    }
    // 2. 咳がない
    if (/咳なし|咳嗽なし|咳認(めず|めない)|無咳嗽|咳はなし/.test(normalized)) {
      centorPoints += 1;
      criteria.push({ key: 'no_cough', label: '咳嗽を認めない (+1点)', points: 1 });
    }
    // 3. 前頸部リンパ節腫脹・圧痛
    if (/前頸部|頸部リンパ|リンパ節腫|圧痛性/.test(normalized)) {
      centorPoints += 1;
      criteria.push({ key: 'lymph', label: '圧痛性前頸部リンパ節腫脹 (+1点)', points: 1 });
    }
    // 4. 扁桃の腫脹・白斑滲出
    if (/扁桃白斑|滲出|白苔|扁桃腫大|扁桃発赤/.test(normalized)) {
      centorPoints += 1;
      criteria.push({ key: 'tonsil', label: '扁桃の腫大または白斑・浸出液 (+1点)', points: 1 });
    }

    const level: ScoreLevel = centorPoints >= 3 ? 'high' : centorPoints === 2 ? 'moderate' : 'low';
    const recommendation = centorPoints >= 3
      ? 'A群β溶血性連鎖球菌（GAS）感染の確率が高いため、迅速抗原検査（RADT）または抗菌薬（ペニシリン系第一選択）の適応を検討してください。'
      : centorPoints === 2
      ? 'Centorスコア2点（中等度）です。溶連菌迅速抗原検査の実施を考慮し、陽性の場合のみ抗菌薬処方をご検討ください。'
      : '🛡️ Prescription Check: ウイルス性感冒の臨床像です（Centorスコア低値）。JAID/JSC感染症ガイドラインに基づき抗菌薬処方は推奨されず、対症療法（解熱鎮痛・水分電解質補給）が第一選択です。';

    scores.push({
      scoreType: 'CENTOR',
      title: 'Centor / McIsaac スコア',
      targetCondition: '急性上気道炎・咽頭炎における溶連菌（GAS）感染確率判定',
      nudgeCategory: 'prescription_check',
      scoreValue: centorPoints,
      maxScore: 4,
      level,
      fulfilledCriteria: criteria,
      guidelineTitle: 'JAID/JSC 感染症治療ガイドライン / 厚労省 抗微生物薬適正使用の手引き',
      recommendation,
      harmAvoidanceBenefit: '不必要な抗菌薬投与による腸内細菌叢の乱れ、薬剤性アレルギー、将来の耐性菌（AMR）獲得リスクを確実に防止します。'
    });
  }

  // --------------------------------------------------------------------------
  // 3. PPI/P-CAB処方 ＆ レセプト適応病名補完 (Billing Safety & Deprescribing)
  // --------------------------------------------------------------------------
  const hasPpi = /タケキャブ|ネキシウム|オメプラール|オメプラゾール|ランソプラゾール|タケプロン|ボノプラザン|パリエット|ラベプラゾール/.test(normalized);
  if (hasPpi) {
    const hasIndicationDiagnosis = /逆流性食道炎|胃潰瘍|十二指腸潰瘍|gerd|ピロリ除菌/.test(normalized);
    const hasLongTermUse = /長期|定期|継続|60日|90日|28日/.test(normalized);

    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    if (!hasIndicationDiagnosis) {
      criteria.push({ key: 'missing_dx', label: 'カルテ内に適応病名（逆流性食道炎・胃潰瘍等）の明示なし', points: 1 });
    }
    if (hasLongTermUse) {
      criteria.push({ key: 'long_term', label: '長期維持投与中または長期処方（28日以上）', points: 1 });
    }

    scores.push({
      scoreType: 'PPI_STEWARDSHIP',
      title: '酸分泌抑制薬（PPI/P-CAB）処方適正化 ＆ レセプト安全監査',
      targetCondition: 'タケキャブ・ネキシウム等の査定返戻防止および漫然投与見直し',
      nudgeCategory: 'billing_safety',
      scoreValue: hasIndicationDiagnosis ? '適応病名確認済' : '適応病名要確認',
      level: !hasIndicationDiagnosis ? 'high' : 'low',
      fulfilledCriteria: criteria,
      guidelineTitle: '日本消化器病学会 GERD診療ガイドライン / 厚労省 レセプト請求適応基準',
      recommendation: !hasIndicationDiagnosis
        ? '💡 Billing Safety: PPI/P-CAB処方を検知しました。医事課からの査定・返戻（減点）を防止するため、所見（胸焼け、心窩部痛等）に基づく適応病名【逆流性食道炎】【胃潰瘍】の登録補完を推奨します。'
        : '🛡️ Deprescribing Guide: 症状安定期においては、オンデマンド（症状時屯用）投与やH2RAへのステップダウン、骨粗鬆症・低Mg血症・腸管感染症リスク低減のための定期的な減量・休薬プロトコルをご参照いただけます。',
      harmAvoidanceBenefit: 'レセプト返戻による未収金・修正事務負担の防止に加え、長期漫然投与に伴う電解質異常や骨折リスクを予防します。'
    });
  }

  // --------------------------------------------------------------------------
  // 4. 消化器内視鏡スクリーニング適正化 (Pre-visit PMH連携 / 胃がんリスク層別化)
  // --------------------------------------------------------------------------
  const hasEndoscopyMention = /胃カメラ|内視鏡|上部消化管内視鏡|胃がん検診|ドック/.test(normalized);
  if (hasEndoscopyMention) {
    const isHpNegative = /ピロリ.*(陰性|-|未感染|除菌成功)|hp\s*(-|陰性)/.test(normalized);
    const hasNoAtrophy = /萎縮.*(なし|認めず|-|c-0|c-1|軽度)|正常粘膜/.test(normalized);

    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    let isSuperLowRisk = false;

    if (isHpNegative) {
      criteria.push({ key: 'hp_neg', label: 'ピロリ菌未感染または除菌後正常 (+0点)', points: 0, matchedText: 'ピロリ菌陰性' });
    }
    if (hasNoAtrophy) {
      criteria.push({ key: 'no_atrophy', label: '萎縮性胃炎所見なし (正常粘膜)', points: 0, matchedText: '萎縮なし' });
    }
    if (patientAge < 50) {
      criteria.push({ key: 'young_age', label: `50歳未満 (${patientAge}歳)`, points: 0, matchedText: `${patientAge}歳` });
    }

    if (isHpNegative && hasNoAtrophy) {
      isSuperLowRisk = true;
    }

    scores.push({
      scoreType: 'GI_ENDOSCOPY_HVC',
      title: '胃内視鏡検査 生涯リスク層別化・ハーム回避判定 (PMH連携)',
      targetCondition: 'ピロリ菌感染状態と粘膜萎縮度に基づく内視鏡検診インターバル最適化',
      nudgeCategory: 'previsit_pmh',
      scoreValue: isSuperLowRisk ? '超低リスク (観察待機推奨)' : '通常リスク',
      level: isSuperLowRisk ? 'low' : 'moderate',
      fulfilledCriteria: criteria,
      guidelineTitle: '日本胃癌学会 胃がん検診ガイドライン / デジタル庁 公共医療ハブ(PMH)施策',
      recommendation: isSuperLowRisk
        ? '🛡️ Pre-visit Nudge / PMH連携: ピロリ菌未感染かつ胃粘膜萎縮なしの超低リスク所見です。毎年のルーチン内視鏡は過剰医療（LVC）となるため、2〜3年以上の観察待機（定期受診猶予）プロトコルを選択可能です。'
        : '内視鏡所見およびピロリ菌感染歴に応じた適切な間隔（1〜2年後）での定期観察を推奨します。',
      harmAvoidanceBenefit: '毎年の咽頭麻酔・鎮静剤リスク、消化管偶発症（出血・穿孔 1/10,000）、前処置の苦痛や受診者の拘束時間を科学的に回避できます。'
    });
  }

  // --------------------------------------------------------------------------
  // 5. CHADS₂ スコア (心房細動における脳梗塞リスク評価)
  // --------------------------------------------------------------------------
  const hasAf = /心房細動|発作性心房細動|\baf\b/.test(normalized);
  if (hasAf) {
    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    let chadsPoints = 0;

    // C: うっ血性心不全
    if (/心不全|chf|ef低下|浮腫|心拡大|下腿浮腫/.test(normalized)) {
      chadsPoints += 1;
      criteria.push({ key: 'C', label: 'うっ血性心不全 (C: +1点)', points: 1, matchedText: '心不全/浮腫の示唆あり' });
    }
    // H: 高血圧
    if (/高血圧|htn|\bht\b|降圧薬|1[3-9][0-9]\/[8-9][0-9]|1[4-9][0-9]\//.test(normalized)) {
      chadsPoints += 1;
      criteria.push({ key: 'H', label: '高血圧の既往または治療中 (H: +1点)', points: 1, matchedText: '高血圧/血圧上昇の記載あり' });
    }
    // A: 年齢75歳以上
    if (patientAge >= 75) {
      chadsPoints += 1;
      criteria.push({ key: 'A', label: `75歳以上 (${patientAge}歳) (A: +1点)`, points: 1, matchedText: `${patientAge}歳` });
    }
    // D: 糖尿病
    if (/糖尿病|\bdm\b|hba1c|血糖|経口血糖降下薬/.test(normalized)) {
      chadsPoints += 1;
      criteria.push({ key: 'D', label: '糖尿病 (D: +1点)', points: 1, matchedText: '糖尿病の記載あり' });
    }
    // S2: 脳梗塞・TIA既往 (+2点)
    if (/脳梗塞|一過性脳虚血|tia|脳卒中|ラクナ/.test(normalized)) {
      chadsPoints += 2;
      criteria.push({ key: 'S2', label: '脳梗塞/TIA既往 (S2: +2点)', points: 2, matchedText: '脳梗塞既往あり' });
    }

    const level: ScoreLevel = chadsPoints >= 2 ? 'critical' : chadsPoints === 1 ? 'moderate' : 'low';
    const recommendation = chadsPoints >= 2
      ? '🛡️ Clinical Support: CHADS₂スコア2点以上（高リスク）です。出血禁忌がない限り、直接作用型経口抗凝固薬（DOAC）またはワーファリンによる抗凝固療法の導入が強く推奨されます。医師の見落とし・訴訟リスクを防護します。'
      : chadsPoints === 1
      ? 'CHADS₂スコア1点（中等度リスク）です。血管疾患や年齢（CHA₂DS₂-VASc）を考慮し、抗凝固療法の導入をご検討ください。'
      : 'CHADS₂スコア0点（低リスク）です。抗凝固療法による出血ハームが血栓予防効果を上回るため、経口抗凝固薬の投与は原則推奨されません。';

    scores.push({
      scoreType: 'CHADS2',
      title: 'CHADS₂ スコア',
      targetCondition: '心房細動における脳梗塞リスク評価',
      nudgeCategory: 'clinical_support',
      scoreValue: chadsPoints,
      maxScore: 6,
      level,
      fulfilledCriteria: criteria,
      guidelineTitle: '日本循環器学会 不整脈薬物治療ガイドライン',
      recommendation,
      harmAvoidanceBenefit: '低リスク時の抗凝固薬による大出血合併症を回避しつつ、高リスク時の脳塞栓症（不可逆的片麻痺・寝たきり）を予防します。'
    });
  }

  // --------------------------------------------------------------------------
  // 6. A-DROP スコア (市中肺炎の重症度分類・入院適応判定)
  // --------------------------------------------------------------------------
  const hasPneumonia = /肺炎|浸潤影|湿性咳嗽|喘鳴|呼吸困難/.test(normalized);
  if (hasPneumonia) {
    const criteria: ClinicalScore['fulfilledCriteria'] = [];
    let adropPoints = 0;

    // A: 年齢 (男70歳以上、女75歳以上)
    if (patientAge >= 70) {
      adropPoints += 1;
      criteria.push({ key: 'A', label: `年齢基準合致 (${patientAge}歳) (+1点)`, points: 1 });
    }
    // D: 脱水 (BUN >= 21 または 脱水所見)
    if (/bun\s*(2[1-9]|[3-9][0-9])|脱水|口渇/.test(normalized)) {
      adropPoints += 1;
      criteria.push({ key: 'D', label: '脱水またはBUN≧21mg/dL (+1点)', points: 1 });
    }
    // R: 呼吸 (SpO2 <= 90%)
    if (/spo2\s*([78][0-9]|90)%|呼吸不全|チアノーゼ/.test(normalized)) {
      adropPoints += 1;
      criteria.push({ key: 'R', label: 'SpO2 90%以下または呼吸不全 (+1点)', points: 1 });
    }
    // O: 意識障害
    if (/意識障害|jcs|gcs|傾眠|不穏/.test(normalized)) {
      adropPoints += 1;
      criteria.push({ key: 'O', label: '意識障害あり (+1点)', points: 1 });
    }
    // P: 収縮期血圧 <= 90mmHg
    if (/[5-9][0-9]\/[3-6][0-9]mmhg|低血圧|血圧低下|ショック/.test(normalized)) {
      adropPoints += 1;
      criteria.push({ key: 'P', label: '収縮期血圧 90mmHg以下 (+1点)', points: 1 });
    }

    if (criteria.length > 0) {
      const level: ScoreLevel = adropPoints >= 3 ? 'critical' : adropPoints >= 1 ? 'moderate' : 'low';
      const recommendation = adropPoints >= 3
        ? 'A-DROPスコア3点以上（超重症/重症）です。集中治療室（ICU）または緊急入院管理が強く推奨されます。'
        : adropPoints >= 1
        ? 'A-DROPスコア1〜2点（中等症）です。外来治療の慎重な経過観察または一般病床への入院を考慮してください。'
        : '🛡️ Clinical Support: A-DROPスコア0点（軽症）です。経口抗菌薬による外来治療が基本方針となります。不必要な緊急入院を回避し、院内感染や廃用症候群リスクを防護します。';

      scores.push({
        scoreType: 'A_DROP',
        title: 'A-DROP スコア',
        targetCondition: '成人市中肺炎の重症度分類・入院適応判定',
        nudgeCategory: 'clinical_support',
        scoreValue: adropPoints,
        maxScore: 5,
        level,
        fulfilledCriteria: criteria,
        guidelineTitle: '日本呼吸器学会 成人肺炎診療ガイドライン',
        recommendation,
        harmAvoidanceBenefit: '軽症者の不要な入院に伴う高齢者のせん妄・ADL低下（廃用）や院内感染（耐性菌・C.difficile等）を回避します。'
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. FIB-4 index (NAFLD/MASLD 肝線維化スクリーニング)
  // --------------------------------------------------------------------------
  const hasLiverMention = /脂肪肝|nafld|masld|nash|肝機能|alt|ast/.test(normalized);
  if (hasLiverMention) {
    const astMatch = text.match(/ast\s*[:=]?\s*(\d{2,3})/i);
    const altMatch = text.match(/alt\s*[:=]?\s*(\d{2,3})/i);
    const pltMatch = text.match(/plt|血小板\s*[:=]?\s*(\d{1,2}\.?\d?)/i);

    if (astMatch && altMatch && pltMatch) {
      const ast = parseFloat(astMatch[1]);
      const alt = parseFloat(altMatch[1]);
      const plt = parseFloat(pltMatch[1]); // 万/μL

      if (plt > 0 && alt > 0) {
        // FIB-4 = (Age * AST) / (PLT * sqrt(ALT))
        const fib4 = (patientAge * ast) / (plt * 10 * Math.sqrt(alt));
        const fib4Fixed = Math.round(fib4 * 100) / 100;
        const isLow = fib4Fixed < 1.3;
        const isHigh = fib4Fixed >= 2.67;

        scores.push({
          scoreType: 'FIB_4',
          title: 'FIB-4 Index (肝線維化リスク評価)',
          targetCondition: '非アルコール性脂肪性肝疾患における進行性肝線維化スクリーニング',
          nudgeCategory: 'clinical_support',
          scoreValue: fib4Fixed,
          level: isHigh ? 'high' : isLow ? 'low' : 'moderate',
          fulfilledCriteria: [
            { key: 'age', label: `年齢: ${patientAge}歳`, points: 0 },
            { key: 'transaminase', label: `AST: ${ast} / ALT: ${alt} U/L`, points: 0 },
            { key: 'plt', label: `血小板: ${plt}万/μL`, points: 0 }
          ],
          guidelineTitle: '日本消化器病学会 / 日本肝臓学会 NAFLD/NASH診療ガイドライン',
          recommendation: isLow
            ? '🛡️ Clinical Support: FIB-4 < 1.30（進行線維化除外・低リスク）です。肝生検や三次医療機関への不要な紹介を猶予し、生活習慣改善（体重是正・運動療法先行）の継続を推奨します。'
            : isHigh
            ? 'FIB-4 ≧ 2.67（進行線維化高リスク）です。エラストグラフィまたは肝臓専門医への精査紹介をご検討ください。'
            : 'FIB-4 1.30〜2.66（グレーゾーン）です。他の線維化マーカー（M2BPGi等）や定期的な推移確認を行ってください。',
          harmAvoidanceBenefit: '低リスク時の侵襲的肝生検（出血リスク 1%）や専門病院への過剰紹介を防止し、生活習慣病の根本改善を優先できます。'
        });
      }
    }
  }

  return scores;
}

// ============================================================================
// 4. ローカル病名マッピング & 禁忌照合エンジン
// ============================================================================
export function runOfflineClinicalAudit(text: string): { diagnoses: SuggestedDiagnosis[]; alerts: SafetyAlert[] } {
  const diagnoses: SuggestedDiagnosis[] = [];
  const alerts: SafetyAlert[] = [];

  // A. 禁忌ペアの走査 (二重防御壁)
  for (const rule of CRITICAL_CONTRAINDICATION_RULES) {
    if (text.includes(rule.drugA) && text.includes(rule.drugB)) {
      alerts.push({
        id: `alert-${rule.drugA}-${rule.drugB}`,
        type: 'contraindication',
        title: rule.title,
        message: rule.reason,
        severity: rule.severity,
        drugs: [rule.drugA, rule.drugB],
        recommendation: rule.recommendation
      });
    }
  }

  // B. MEDIS病名マスターサブセットの照合
  for (const master of CORE_DIAGNOSIS_DATABASE) {
    const matchedKeyword = master.keywords.find((kw) => text.includes(kw));
    if (matchedKeyword) {
      const isSuspected = /疑い|疑|疑診|鑑別|否定できない|rule out|r\/o/i.test(text);
      const status: DiagnosisStatus = isSuspected ? 'suspected' : 'confirmed';

      const kwIdx = text.indexOf(matchedKeyword);
      const start = Math.max(0, kwIdx - 10);
      const end = Math.min(text.length, kwIdx + matchedKeyword.length + 15);
      const evidence = text.substring(start, end).replace(/\n/g, ' ').trim();

      diagnoses.push({
        standardName: master.name,
        icd10Code: master.icd10,
        medisCode: master.medis,
        status,
        evidence: `「${evidence}」より示唆`,
        confidence: 0.92,
        category: master.category,
        isChronic: master.isChronic,
        billingTip: master.billingTip
      });
    }
  }

  return { diagnoses, alerts };
}

// ============================================================================
// 5. メインUIコンポーネント: ClinicalDecisionSupport
// ============================================================================
interface ClinicalDecisionSupportProps {
  soapText: string;
  patientAge?: number;
  patientGender?: string;
  onApplyDiagnosisToSoap?: (diagnosisText: string) => void;
  onApplyPlanGuideline?: (planText: string) => void;
  isBleConnected?: boolean;
}

export const ClinicalDecisionSupport: React.FC<ClinicalDecisionSupportProps> = ({
  soapText,
  patientAge = 64,
  patientGender = '男性',
  onApplyDiagnosisToSoap,
  onApplyPlanGuideline,
  isBleConnected = false
}) => {
  const [activeTab, setActiveTab] = useState<'scores' | 'diagnosis' | 'alerts'>('scores');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [appliedItems, setAppliedItems] = useState<Set<string>>(new Set());

  // オフライン・高速ハイブリッド評価
  const offlineResult = useMemo(() => {
    if (!soapText.trim()) {
      return { diagnoses: [], scores: [], alerts: [], analyzedAt: Date.now(), engine: 'offline-rule' as const };
    }
    const { diagnoses, alerts } = runOfflineClinicalAudit(soapText);
    const scores = calculateLocalHvcScores(soapText, { age: patientAge, gender: patientGender });
    return { diagnoses, scores, alerts, analyzedAt: Date.now(), engine: 'offline-rule' as const };
  }, [soapText, patientAge, patientGender]);

  // AIによる深層構造化解析
  const [cdsResult, setCdsResult] = useState<ClinicalDecisionSupportResult>(offlineResult);

  // SOAP文が更新されたらオフラインルールで即時同期
  useEffect(() => {
    setCdsResult(offlineResult);
  }, [offlineResult]);

  const handleRunAiAnalysis = async () => {
    if (!soapText.trim()) return;
    setIsAiLoading(true);
    setAiError(null);

    try {
      const response = await fetch('/api/ai/analyze-clinical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soapText,
          patientContext: { age: patientAge, gender: patientGender }
        })
      });

      if (!response.ok) {
        throw new Error(`サーバー解析エラー (Status: ${response.status})`);
      }

      const aiData = await response.json();
      setCdsResult({
        diagnoses: aiData.suggestedDiagnoses?.length ? aiData.suggestedDiagnoses : offlineResult.diagnoses,
        scores: aiData.clinicalScores?.length ? aiData.clinicalScores : offlineResult.scores,
        alerts: aiData.safetyAlerts?.length ? aiData.safetyAlerts : offlineResult.alerts,
        analyzedAt: Date.now(),
        engine: 'hybrid-ai'
      });
    } catch (err: any) {
      console.warn('AI CDS fetch failed, falling back to local audit engine:', err);
      setAiError('AI深層解析が未接続またはオフラインのため、内蔵の完全オフライン医学ルール（MEDIS病名マスター・学会指針HVC）により自動解析しました。');
      setCdsResult({
        ...offlineResult,
        analyzedAt: Date.now(),
        engine: 'offline-rule'
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAdoptDiagnosis = (diag: SuggestedDiagnosis) => {
    const textToInsert = `【診断】${diag.standardName} (${diag.status === 'confirmed' ? '確定' : '疑い'}, ICD-10: ${diag.icd10Code})`;
    if (onApplyDiagnosisToSoap) {
      onApplyDiagnosisToSoap(textToInsert);
    }
    setAppliedItems((prev) => new Set(prev).add(diag.medisCode));
  };

  const handleAdoptScoreGuideline = (score: ClinicalScore) => {
    const textToInsert = `【方針】${score.title}: ${score.recommendation}`;
    if (onApplyPlanGuideline) {
      onApplyPlanGuideline(textToInsert);
    }
    setAppliedItems((prev) => new Set(prev).add(score.scoreType));
  };

  const hasCriticalAlerts = cdsResult.alerts.some((a) => a.severity === 'danger');

  // カテゴリバッジ表示ヘルパー
  const renderNudgeBadge = (category: HvcNudgeCategory) => {
    switch (category) {
      case 'clinical_support':
        return (
          <span className="px-2.5 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[11px] font-bold border border-sky-300 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span>🛡️ Clinical Support</span>
          </span>
        );
      case 'prescription_check':
        return (
          <span className="px-2.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-bold border border-indigo-300 flex items-center gap-1">
            <Pill className="w-3.5 h-3.5 text-indigo-600" />
            <span>🛡️ Prescription Check</span>
          </span>
        );
      case 'billing_safety':
        return (
          <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>💡 Billing Safety</span>
          </span>
        );
      case 'previsit_pmh':
        return (
          <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-[11px] font-bold border border-emerald-300 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            <span>🛡️ Pre-visit Nudge / PMH連携</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col transition-all">
      {/* 1. Header Bar: スマートパーソナルヘルスケア HVC (防護盾コンセプト) */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 p-4 sm:p-5 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shadow-inner">
            <ShieldCheck className="w-6 h-6 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base tracking-tight">スマートパーソナルヘルスケア HVC</h3>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                cdsResult.engine === 'hybrid-ai'
                  ? 'bg-purple-500/20 text-purple-200 border-purple-400/40'
                  : cdsResult.engine === 'local-webllm'
                  ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/40'
                  : 'bg-teal-500/20 text-teal-200 border-teal-400/40'
              }`}>
                {cdsResult.engine === 'hybrid-ai' 
                  ? 'AI深層構造化解析 (HVC)' 
                  : cdsResult.engine === 'local-webllm'
                  ? 'ローカルWebLLM (Qwen2.5)'
                  : 'エッジ即時ルールエンジン (完全オフライン)'}
              </span>
            </div>
            <p className="text-xs text-slate-300/80 mt-0.5">
              見落とし・過誤訴訟・レセプト返戻から医師を守る臨床コパイロット（学会指針・観察待機プロトコル）
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRunAiAnalysis}
            disabled={isAiLoading || !soapText.trim()}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-98 cursor-pointer transition-all border border-sky-400/30"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : 'text-amber-300'}`} />
            <span>{isAiLoading ? 'HVC深層解析中...' : 'AI再解析'}</span>
          </button>
        </div>
      </div>

      {/* 2. 併用禁忌・危険アラートのグローバルバナー */}
      {hasCriticalAlerts && (
        <div className="bg-rose-50 border-b border-rose-200 p-3.5 text-rose-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 animate-bounce" />
          <div className="flex-1 text-xs">
            <span className="font-bold text-rose-950 text-sm">【医療安全アラート】致命的併用禁忌の疑いを検知しました</span>
            <p className="text-rose-800 mt-0.5">
              電子カルテへの誤入力を防止するため、ドングル側物理ボタン（HITL）押下まで打鍵がインターロック（保護ロック）されます。
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px] shrink-0">
            物理ボタン打鍵ロック対象
          </span>
        </div>
      )}

      {/* 3. エラー通知バナー */}
      {aiError && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 text-amber-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{aiError}</span>
          </div>
          <button onClick={() => setAiError(null)} className="p-1 text-amber-700 hover:text-amber-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4. タブ切り替えバー */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('scores')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'scores'
                ? 'bg-white text-indigo-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            <span>HVC臨床スコア・防衛サジェスト</span>
            <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[10px]">
              {cdsResult.scores.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('diagnosis')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'diagnosis'
                ? 'bg-white text-sky-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Stethoscope className="w-3.5 h-3.5 text-sky-600" />
            <span>推奨病名・レセプト適応</span>
            <span className="px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-800 text-[10px]">
              {cdsResult.diagnoses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'alerts'
                ? 'bg-white text-rose-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Pill className="w-3.5 h-3.5 text-rose-600" />
            <span>処方監査・禁忌マトリクス</span>
            {cdsResult.alerts.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                hasCriticalAlerts ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-100 text-amber-800'
              }`}>
                {cdsResult.alerts.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono">
          <span>患者背景: {patientAge}歳 / {patientGender}</span>
        </div>
      </div>

      {/* 5. メインコンテンツエリア */}
      <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 max-h-[550px]">
        {/* ================================================================== */}
        {/* TAB A: HVC (High-Value Care) スコア ＆ 防衛的サジェスト */}
        {/* ================================================================== */}
        {activeTab === 'scores' && (
          <div className="space-y-3.5">
            {cdsResult.scores.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <ShieldCheck className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">現在入力中のテキストに対応するHVCプロトコルはありません</p>
                <p className="text-[11px] text-slate-400 leading-relaxed max-w-md mx-auto">
                  頭部打撲（CT適応）、急性上気道炎（Centor）、タケキャブ等の酸分泌抑制薬（病名漏れ）、心房細動（CHADS₂）、肺炎（A-DROP）などの記載を検知すると、医師を守る防衛的サジェストが自動作動します。
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {cdsResult.scores.map((score, idx) => {
                  const isAdopted = appliedItems.has(score.scoreType);
                  return (
                    <div
                      key={`${score.scoreType}-${idx}`}
                      className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs hover:shadow-xs transition-all space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {renderNudgeBadge(score.nudgeCategory)}
                            <span className="font-extrabold text-sm sm:text-base text-slate-900">
                              {score.title}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                              score.level === 'critical'
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : score.level === 'high'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}>
                              判定: {score.scoreValue} {score.maxScore ? `/ ${score.maxScore}点` : ''}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">{score.targetCondition}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAdoptScoreGuideline(score)}
                          disabled={isAdopted}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                            isAdopted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                          }`}
                        >
                          {isAdopted ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>【方針】へ反映済</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>【方針】へ推奨を反映</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 該当クライテリア一覧 */}
                      {score.fulfilledCriteria.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            臨床判断因子・判定根拠 ({score.fulfilledCriteria.length}項目):
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {score.fulfilledCriteria.map((c, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded-lg bg-indigo-50/80 border border-indigo-200 text-indigo-950 text-xs font-semibold flex items-center gap-1"
                              >
                                <span>{c.label}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 推奨ガイドラインアクション（防衛的サジェスト） */}
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                          <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>準拠ガイドライン: {score.guidelineTitle}</span>
                        </div>
                        <p className="text-slate-800 font-medium leading-relaxed">
                          {score.recommendation}
                        </p>

                        {/* 身体的ハーム回避メリット */}
                        {score.harmAvoidanceBenefit && (
                          <div className="pt-2 border-t border-slate-200/80 text-[11px] text-emerald-800 flex items-start gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span><strong>患者身体保護メリット:</strong> {score.harmAvoidanceBenefit}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB B: 推奨病名 ＆ レセプト適応支援 (ICD-10 / MEDIS) */}
        {/* ================================================================== */}
        {activeTab === 'diagnosis' && (
          <div className="space-y-3">
            {cdsResult.diagnoses.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Stethoscope className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">SOAPテキストから推奨病名は検出されませんでした</p>
                <p className="text-[11px] text-slate-400">主訴や症状・投薬歴を入力すると、MEDIS標準病名およびレセプト適応が自動サジェストされます。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {cdsResult.diagnoses.map((diag, index) => {
                  const isAdopted = appliedItems.has(diag.medisCode);
                  return (
                    <div
                      key={`${diag.medisCode}-${index}`}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-sky-300 bg-white shadow-2xs hover:shadow-xs transition-all space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold ${
                            diag.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {diag.status === 'confirmed' ? '確定病名' : '疑い病名'}
                          </span>
                          <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                            {diag.standardName}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-xs font-bold">
                            ICD-10: {diag.icd10Code}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            MEDIS: {diag.medisCode}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAdoptDiagnosis(diag)}
                          disabled={isAdopted}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                            isAdopted
                              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
                              : 'bg-sky-600 hover:bg-sky-700 text-white active:scale-95'
                          }`}
                        >
                          {isAdopted ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>カルテへ反映済</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>【診断】欄へ挿入</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* レセプト適応・査定防止ヒント */}
                      {diag.billingTip && (
                        <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs flex items-start gap-2 text-amber-950">
                          <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-amber-900 mr-1.5">レセプト適応支援:</span>
                            <span className="text-amber-800">{diag.billingTip}</span>
                          </div>
                        </div>
                      )}

                      {/* エビデンス・根拠の抜粋 */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-start gap-2 text-slate-700">
                        <FileText className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                          <span className="font-bold text-slate-900 mr-1.5">カルテ内の根拠:</span>
                          <span className="bg-sky-100/70 text-slate-900 px-1 py-0.5 rounded font-medium">
                            {diag.evidence}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB C: 禁忌・安全性アラート */}
        {/* ================================================================== */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {cdsResult.alerts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <ShieldCheck className="w-8 h-8 mx-auto text-emerald-400" />
                <p className="text-xs font-semibold text-emerald-800">重大な併用禁忌・安全性アラートは検知されませんでした</p>
                <p className="text-[11px] text-slate-400">主要な併用禁忌マトリクスおよび添付文書警告を自動監査しています。</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cdsResult.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-2xl border text-xs space-y-2 shadow-xs ${
                      alert.severity === 'danger'
                        ? 'bg-rose-50/90 border-rose-300 text-rose-950'
                        : 'bg-amber-50/90 border-amber-300 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`p-1 rounded-lg ${
                          alert.severity === 'danger' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                        }`}>
                          <AlertTriangle className="w-4 h-4" />
                        </span>
                        <span className="font-extrabold text-sm">{alert.title}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        alert.severity === 'danger' ? 'bg-rose-600 text-white' : 'bg-amber-600 text-white'
                      }`}>
                        {alert.severity === 'danger' ? '絶対禁忌' : '慎重投与'}
                      </span>
                    </div>

                    <p className="leading-relaxed pl-7 font-medium">
                      {alert.message}
                    </p>

                    <div className="pl-7 pt-1 border-t border-rose-200/60 font-semibold text-[11px] flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                      <span>推奨対応: {alert.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Footer (電子カルテ連携サマリー: 医師保護・二重防護壁) */}
      <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>二重防護壁 (HITL): AtomS3Uドングルの物理ボタン押下まで電子カルテ入力は完全にブロックされ、誤爆を防ぎます</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
          <span>最終監査: {new Date(cdsResult.analyzedAt).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};
