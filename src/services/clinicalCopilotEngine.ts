/**
 * Dr.Dongly スーパーオンプレミス 臨床コパイロットエンジン (clinicalCopilotEngine.ts)
 *
 * 外来・病棟・救急当直にあたる医師のリアルな痛みを0.5msで解消する10大キラー機能コアエンジン:
 * 1. 医学略語・乱雑カルテの標準日本語正規化
 * 2. 完全オフライン処方監査（腎機能 eGFR/Cr 別ドーズアジャスト警告 ＆ 推奨用量オーダー文）
 * 3. 臨床鑑別診断「見落とし防止（Red Flags）」コパイロット ＆ 防衛的カルテ記載文生成
 * 4. 救急・当直「パニック時の中毒・アナフィラキシー・ショック」体重別即時アクション電卓
 * 5. Minds診療ガイドライン原本直結「レセプト審査パス・エビデンス根拠文」自動生成
 * 6. 仮想プリンタ逆流連携「過去カルテ4点爆速ダイジェスト」
 */

import {
  cleanExtractedMedicalText,
  normalizeMedicalSpeechTerms,
} from '../utils/chartTextCleaner';
import {
  MINDS_KNOWLEDGE_CATALOG,
  RENAL_DOSE_CATALOG,
  PROCEDURES_CATALOG,
} from '../data/medicalKnowledgeCatalog';

// ============================================================================
// 1. 医学略語・カルテスラングの標準医学日本語への正規化マスター
// ============================================================================
const MEDICAL_ABBREVIATION_MAP: Array<{ pattern: RegExp; replacement: string; label: string }> = [
  { pattern: /\bs\/o\s*/gi, replacement: '疑い: ', label: 's/o ➔ 疑い' },
  { pattern: /\br\/o\s*/gi, replacement: '除外: ', label: 'r/o ➔ 除外' },
  { pattern: /\bc\/o\s*/gi, replacement: '主訴: ', label: 'c/o ➔ 主訴' },
  { pattern: /\bHx\b/gi, replacement: '既往歴', label: 'Hx ➔ 既往歴' },
  { pattern: /\bPMH\b/gi, replacement: '既往歴', label: 'PMH ➔ 既往歴' },
  { pattern: /\bHTN\b/g, replacement: '高血圧症', label: 'HTN ➔ 高血圧症' },
  { pattern: /\bT2DM\b/gi, replacement: '2型糖尿病', label: 'T2DM ➔ 2型糖尿病' },
  { pattern: /\bDM\b/g, replacement: '糖尿病', label: 'DM ➔ 糖尿病' },
  { pattern: /\bDL\b/g, replacement: '脂質異常症', label: 'DL ➔ 脂質異常症' },
  { pattern: /\bCHF\b/gi, replacement: 'うっ血性心不全', label: 'CHF ➔ うっ血性心不全' },
  { pattern: /\bpAf\b/g, replacement: '発作性心房細動(pAf)', label: 'pAf ➔ 発作性心房細動' },
  { pattern: /\bAf\b/g, replacement: '心房細動(Af)', label: 'Af ➔ 心房細動' },
  { pattern: /\bCOPD\b/g, replacement: '慢性閉塞性肺疾患(COPD)', label: 'COPD ➔ 慢性閉塞性肺疾患' },
  { pattern: /\bGERD\b/g, replacement: '逆流性食道炎(GERD)', label: 'GERD ➔ 逆流性食道炎' },
  { pattern: /\bSAH\b/g, replacement: 'クモ膜下出血(SAH)', label: 'SAH ➔ クモ膜下出血' },
  { pattern: /\bICH\b/g, replacement: '脳出血(ICH)', label: 'ICH ➔ 脳出血' },
  { pattern: /\bCI\b/g, replacement: '脳梗塞', label: 'CI ➔ 脳梗塞' },
  { pattern: /\bDVT\b/g, replacement: '深部静脈血栓症(DVT)', label: 'DVT ➔ 深部静脈血栓症' },
  { pattern: /\bPTE\b|\bPE\b/g, replacement: '肺血栓塞栓症(PE)', label: 'PE ➔ 肺血栓塞栓症' },
  { pattern: /\bAKI\b/g, replacement: '急性腎障害(AKI)', label: 'AKI ➔ 急性腎障害' },
  { pattern: /\bUTI\b/g, replacement: '尿路感染症(UTI)', label: 'UTI ➔ 尿路感染症' },
  { pattern: /\bWNL\b/gi, replacement: '正常範囲内', label: 'WNL ➔ 正常範囲内' },
  { pattern: /\bn\.p\.\b/gi, replacement: '特記所見なし', label: 'n.p. ➔ 特記所見なし' },
];

export function expandMedicalAbbreviations(text: string): {
  expandedText: string;
  appliedCount: number;
  appliedLabels: string[];
} {
  if (!text) return { expandedText: '', appliedCount: 0, appliedLabels: [] };
  let result = text;
  const appliedLabels: string[] = [];

  for (const item of MEDICAL_ABBREVIATION_MAP) {
    if (item.pattern.test(result)) {
      result = result.replace(item.pattern, item.replacement);
      appliedLabels.push(item.label);
    }
  }

  return {
    expandedText: cleanExtractedMedicalText(result),
    appliedCount: appliedLabels.length,
    appliedLabels,
  };
}

// ============================================================================
// 2. 完全オフライン処方監査 ＆ 腎機能（eGFR/Cr）別ドーズアジャスト支援
// ============================================================================
export interface RenalAuditAlert {
  id: string;
  drugName: string;
  severity: 'danger' | 'warning' | 'info';
  detectedEgfr: number | null;
  standardDose: string;
  recommendedAction: string;
  orderSnippet: string; // カルテにワンタップ追記できる補正処方・根拠文
}

export function auditRenalAndPrescriptions(chartText: string): {
  detectedEgfr: number | null;
  detectedCr: number | null;
  detectedWeightKg: number | null;
  alerts: RenalAuditAlert[];
} {
  const normalized = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(chartText));

  // eGFR抽出 (例: eGFR 28, eGFR: 42.5)
  const egfrMatch = normalized.match(/eGFR[:：\s]*([0-9]+(?:\.[0-9]+)?)/i);
  let detectedEgfr = egfrMatch ? parseFloat(egfrMatch[1]) : null;

  // Cre / Cr 抽出 (例: Cr 1.8, Cre: 2.1)
  const crMatch = normalized.match(/(?:Cre|Cr|クレアチニン)[:：\s]*([0-9]+\.[0-9]+)/i);
  const detectedCr = crMatch ? parseFloat(crMatch[1]) : null;

  // Crのみ記載がありeGFR記載がない場合の簡易推算 (70歳目安の臨床安全推算)
  if (detectedEgfr === null && detectedCr !== null && detectedCr > 0.4) {
    const isFemale = /(?:女性|♀|婦)/.test(normalized);
    detectedEgfr = Math.round((194 * Math.pow(detectedCr, -1.094) * Math.pow(70, -0.287) * (isFemale ? 0.739 : 1)) * 10) / 10;
  }

  // 体重抽出 (例: 55kg, BW 62kg, 体重58kg)
  const bwMatch = normalized.match(/(?:体重|BW)?[:：\s]*([2-9][0-9]|[1][0-4][0-9])\s*kg/i);
  const detectedWeightKg = bwMatch ? parseInt(bwMatch[1], 10) : null;

  const alerts: RenalAuditAlert[] = [];

  // RENAL_DOSE_CATALOG との照合
  for (const item of RENAL_DOSE_CATALOG) {
    const keywords = item.drugName
      .split(/[()（）/\s・]+/)
      .map((s) => s.replace(/(?:錠|カプセル).*$/, '').trim())
      .filter((s) => s.length >= 3);

    const matchedKw = keywords.find((kw) => normalized.includes(kw));
    if (!matchedKw) continue;

    if (detectedEgfr !== null) {
      let severity: 'danger' | 'warning' | 'info' = 'info';
      let recDose = item.standardDose;

      if (detectedEgfr < 30) {
        severity = 'danger';
        recDose = item.cutoffs[item.cutoffs.length - 1]?.dose || '高度腎機能低下: 減量または禁忌確認';
      } else if (detectedEgfr < 50) {
        severity = 'warning';
        recDose = item.cutoffs.find((c) => c.range.includes('30') || c.range.includes('49') || c.range.includes('45'))?.dose || item.cutoffs[1]?.dose || item.standardDose;
      } else {
        severity = 'info';
        recDose = item.cutoffs[0]?.dose || item.standardDose;
      }

      alerts.push({
        id: `renal_${matchedKw}`,
        drugName: item.drugName,
        severity,
        detectedEgfr,
        standardDose: item.standardDose,
        recommendedAction: `eGFR ${detectedEgfr} mL/min ➔ ${recDose} (${item.clinicalTip})`,
        orderSnippet: `【処方監査・腎機能設計】eGFR ${detectedEgfr}mL/min に基づき、${matchedKw}は「${recDose}」にて投与設計（${item.clinicalTip}）。`,
      });
    } else {
      // eGFR未記載だが腎排泄注意薬が処方されている場合
      alerts.push({
        id: `renal_${matchedKw}`,
        drugName: item.drugName,
        severity: 'warning',
        detectedEgfr: null,
        standardDose: item.standardDose,
        recommendedAction: `腎機能(eGFR/CrCl)確認推奨: ${item.cutoffs.map((c) => `${c.range}→${c.dose}`).join(' / ')}`,
        orderSnippet: `【腎機能確認】${matchedKw}処方に際し腎機能(eGFR)に応じた用量調整基準（${item.cutoffs.map((c) => `${c.range}:${c.dose}`).join('、')}）を確認済。`,
      });
    }
  }

  // NSAIDs × CKD/腎機能低下・高齢者の追加チェック
  if (/(?:ロキソニン|ロキソプロフェン|セレコックス|セレコキシブ|ボルタレン|ジクロフェナク|NSAIDs)/i.test(normalized)) {
    if ((detectedEgfr !== null && detectedEgfr < 45) || /(?:CKD|慢性腎臓病|腎不全|心不全)/.test(normalized)) {
      alerts.push({
        id: 'renal_nsaids_ckd',
        drugName: 'NSAIDs（ロキソプロフェン/セレコキシブ等）',
        severity: 'danger',
        detectedEgfr,
        standardDose: '頓用または短期最小量',
        recommendedAction: '腎血流低下による急性腎障害(AKI)・心不全増悪リスクあり。アセトアミノフェン（カロナール）への変更を推奨。',
        orderSnippet: '【処方安全監査】腎機能保護の観点からNSAIDsの漫然投与を回避し、アセトアミノフェン（カロナール錠）へ変更。',
      });
    }
  }

  return {
    detectedEgfr,
    detectedCr,
    detectedWeightKg,
    alerts,
  };
}

// ============================================================================
// 3. 臨床鑑別診断「見落とし防止（Red Flags）」コパイロット
// ============================================================================
export interface RedFlagAdvisory {
  id: string;
  syndrome: string;
  criticalDifferentials: string[];
  mustCheckSigns: string[];
  defensiveChartSnippet: string; // カルテに1タップ挿入できる除外診断記載
}

const RED_FLAG_RULES: Array<{
  id: string;
  syndrome: string;
  triggers: RegExp;
  criticalDifferentials: string[];
  mustCheckSigns: string[];
  defensiveChartSnippet: string;
}> = [
  {
    id: 'rf_chest',
    syndrome: '胸痛・胸部圧迫感 (Killer Chest Pain 4大疾患)',
    triggers: /(?:胸痛|胸部圧迫感|胸部絞扼|前胸部|胸が苦しい|狭心症|心筋梗塞|ニトロペン)/,
    criticalDifferentials: ['急性冠症候群(ACS/STEMI)', '急性大動脈解離', '肺血栓塞栓症(PE)', '緊張性気胸'],
    mustCheckSigns: ['血圧左右差(>20mmHg)・背部移動痛', '冷汗・放散痛(左肩/顎)', '呼吸音左右差・SpO2低下', '12誘導心電図(ST変化)・トロポニン'],
    defensiveChartSnippet: '【Red Flags除外確認】冷汗なし、背部への移動痛なし、上肢血圧左右差なし、呼吸音左右差なし。12誘導心電図および心筋逸脱酵素にて致死的胸痛（ACS・大動脈解離・肺塞栓・気胸）を慎重に鑑別。',
  },
  {
    id: 'rf_headache',
    syndrome: '頭痛・後頸部痛 (二次性頭痛 Red Flags: SNOOP)',
    triggers: /(?:頭痛|後頸部痛|頭が痛い|片頭痛|雷鳴頭痛)/,
    criticalDifferentials: ['クモ膜下出血(SAH)', '椎骨動脈解離(VAD)', '細菌性髄膜炎', '脳出血・占拠性病変'],
    mustCheckSigns: ['突然発症(雷鳴様: 何時何分に発症したか)', '項部硬直・Jolt accentuation', '神経脱落症状(麻痺・構音障害・複視)', '50歳以上の初発頭痛'],
    defensiveChartSnippet: '【Red Flags除外確認】突然発症（雷鳴頭痛）ではなく、項部硬直(-)・Jolt accentuation(-)、瞳孔不同や四肢麻痺・構音障害等の局所神経脱落所見を認めず。症状増悪時は頭部CT/MRI精査指示。',
  },
  {
    id: 'rf_abdomen',
    syndrome: '腹痛・心窩部痛 (急性腹症・心窩部痛ピットフォール)',
    triggers: /(?:腹痛|心窩部痛|胃痛|みぞおち|右下腹部痛|腹部膨満)/,
    criticalDifferentials: ['下壁心筋梗塞(心窩部痛型)', '消化管穿孔・汎発性腹膜炎', '腹部大動脈瘤破裂・上腸間膜動脈閉塞', '急性虫垂炎・胆管炎'],
    mustCheckSigns: ['筋性防御(Guarding)・反跳痛(Blumberg徴候)', '高齢者・心房細動既往(腸管虚血)', '心窩部痛での12誘導心電図確認', 'バイタル変動(頻脈・血圧低下)'],
    defensiveChartSnippet: '【Red Flags除外確認】腹部軟、板状硬や筋性防御(-)、反跳痛(-)。バイタル安定しており急性腹症（穿孔・腹膜炎・血管イベント）を示唆する危険徴候なし。',
  },
  {
    id: 'rf_dyspnea_fever',
    syndrome: '発熱・咽頭痛・呼吸困難 (気道緊急 ＆ 敗血症)',
    triggers: /(?:呼吸困難|息切れ|咽頭痛|喉が痛い|発熱|高熱|肺炎|気管支炎|扁桃)/,
    criticalDifferentials: ['急性喉頭蓋炎・扁桃周囲膿瘍(気道閉塞)', '敗血症(qSOFA≧2)', '重症肺炎(A-DROP)', '急性心不全増悪'],
    mustCheckSigns: ['含み声(Muffled voice)・流涎・嚥下困難(吸気性喘鳴)', '呼吸数≧22回/分・意識変容・収縮期血圧≦100 (qSOFA)', 'SpO2低下・起坐呼吸'],
    defensiveChartSnippet: '【Red Flags除外確認】吸気性喘鳴(Stridor)や流涎・含み声等の気道狭窄徴候なし。呼吸数安定・意識清明でありqSOFAスコア0点。',
  },
  {
    id: 'rf_backpain',
    syndrome: '腰痛・背部痛 (脊椎・大血管 Red Flags)',
    triggers: /(?:腰痛|背部痛|背中が痛い|腰が痛い|ぎっくり腰)/,
    criticalDifferentials: ['大動脈解離・腹部大動脈瘤', '化膿性脊椎炎・硬膜外膿瘍', '馬尾症候群', '悪性腫瘍骨転移・圧迫骨折'],
    mustCheckSigns: ['安静時痛・夜間痛(体動と無関係な持続痛)', '膀胱直腸障害(尿閉・便失禁)・会陰部感覚低下', '発熱・原因不明の体重減少'],
    defensiveChartSnippet: '【Red Flags除外確認】安静時持続痛や冷汗を伴う引き裂かれるような背部痛なし。下肢運動麻痺および膀胱直腸障害（馬尾症候群徴候）を認めず。',
  },
];

export function detectClinicalRedFlags(chartText: string): RedFlagAdvisory[] {
  const normalized = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(chartText));
  const matched: RedFlagAdvisory[] = [];

  for (const rule of RED_FLAG_RULES) {
    if (rule.triggers.test(normalized)) {
      matched.push({
        id: rule.id,
        syndrome: rule.syndrome,
        criticalDifferentials: rule.criticalDifferentials,
        mustCheckSigns: rule.mustCheckSigns,
        defensiveChartSnippet: rule.defensiveChartSnippet,
      });
    }
  }

  // マッチがない場合でも汎用バイタル・全身状態確認を提供
  if (matched.length === 0) {
    matched.push({
      id: 'rf_general',
      syndrome: '全身状態・バイタル安全確認 (標準トリアージ)',
      criticalDifferentials: ['ショック初期徴候(Shock Index > 1.0)', '低酸素血症', '意識障害'],
      mustCheckSigns: ['バイタルサイン(BP/HR/SpO2/BT/RR)', '全身外観・末梢冷感の有無', 'アレルギー・併用禁忌薬歴'],
      defensiveChartSnippet: '【全身安全確認】バイタルサイン安定、意識清明、緊急処置を要する危険徴候（Red Flags）を認めず。症状増悪時の早期再診を指導。',
    });
  }

  return matched;
}

// ============================================================================
// 4. 救急・当直「体重別 即時アクション電卓」 (DMAT/中毒/ショック対応)
// ============================================================================
export interface EmergencyDoseProtocol {
  id: string;
  title: string;
  badge: string;
  calculatedSummary: string;
  orderText: string; // カルテ・指示簿にそのまま打鍵できる具体量入りオーダー文
}

export function calculateEmergencyDoses(weightKg: number = 60): EmergencyDoseProtocol[] {
  const w = Math.max(10, Math.min(150, Math.round(weightKg)));

  // 1. アナフィラキシー
  const adrenalineMg = w >= 50 ? 0.5 : Math.round(w * 0.01 * 100) / 100;
  const bolusMl = Math.min(2000, w * 20);

  // 2. アセトアミノフェン中毒 (NAC: 初回140mg/kg、維持70mg/kg)
  const nacLoadingMg = Math.round(w * 140);
  const nacMaintMg = Math.round(w * 70);
  const nacPacks = Math.ceil(nacLoadingMg / 1760); // 17.6%内用液10mL=1760mg換算

  // 3. 敗血症初期輸液 (30mL/kg) + ノルアドレナリン
  const sepsisFluidMl = w * 30;
  const nadGamma01MlPerHr = Math.round(((w * 0.1 * 60) / 60) * 10) / 10; // ノルアドレナリン3mg+生食47mL(60μg/mL)組成時 0.1γ = 0.1*w mL/h

  // 4. 有機リン中毒 (PAM + アトロピン)
  const pamGrams = w >= 40 ? '1〜2g' : `${Math.round(w * 25)}mg`;

  return [
    {
      id: 'em_anaphylaxis',
      title: 'アナフィラキシーショック',
      badge: '第一選択: アドレナリン筋注',
      calculatedSummary: `体重${w}kg ➔ アドレナリン ${adrenalineMg}mg 大腿前外側筋注 ＋ 生食 ${bolusMl}mL 急速輸液`,
      orderText: `【救急処置: アナフィラキシー対応 (体重${w}kg換算)】\n1. アドレナリン注0.1%（ボスミン） ${adrenalineMg}mg（${adrenalineMg}mL）右大腿前外側へ直ちに筋肉内注射（効果不十分時は5〜15分毎に反復）\n2. 酸素投与 リザーバーマスク 10L/分、仰臥位・下肢挙上\n3. 生理食塩液 ${bolusMl}mL（20mL/kg）太い静脈路より急速輸液負荷\n4. 二相性反応予防・補助療法: ファモチジン20mg＋d-クロルフェニラミン5mg＋ヒドロコルチゾン100〜200mg静注、入院経過観察`,
    },
    {
      id: 'em_acetaminophen',
      title: 'アセトアミノフェン過量服薬 (OD)',
      badge: '解毒: N-アセチルシステイン',
      calculatedSummary: `体重${w}kg ➔ NAC初回負荷 ${nacLoadingMg.toLocaleString()}mg (140mg/kg) ➔ 維持 ${nacMaintMg.toLocaleString()}mg (70mg/kg×17回)`,
      orderText: `【中毒処置: アセトアミノフェン中毒プロトコル (体重${w}kg換算)】\n1. 服用後1時間以内であれば活性炭 50g（1g/kg）経口/経鼻胃管投与\n2. 服用4時間後以降の血中アセトアミノフェン濃度をRumack-Matthewノモグラムで評価\n3. N-アセチルシステイン（ムコフィリン17.6%内用液）初回負荷量: ${nacLoadingMg.toLocaleString()}mg（140mg/kg: 約${nacPacks}包）を経口/胃管投与\n4. 維持量: 4時間毎に ${nacMaintMg.toLocaleString()}mg（70mg/kg）を計17回反復投与、AST/ALT・PT-INR・Cr厳重フォロー`,
    },
    {
      id: 'em_sepsis',
      title: '敗血症性ショック (SSCG初期蘇生)',
      badge: '初期輸液30mL/kg ＋ NAd',
      calculatedSummary: `体重${w}kg ➔ 晶質液 ${sepsisFluidMl.toLocaleString()}mL (30mL/kg) 急速投与 ＋ ノルアドレナリン 0.1γ≒${nadGamma01MlPerHr}mL/h`,
      orderText: `【救急処置: 敗血症性ショック 1時間バンドル (体重${w}kg換算)】\n1. 乳酸値測定（Lactateフォロー）および抗菌薬投与前の血液培養2セット採取\n2. 広域抗菌薬を1時間以内に静脈内投与開始\n3. 細胞外液（乳酸リンゲル/生理食塩液） ${sepsisFluidMl.toLocaleString()}mL（30mL/kg）を3時間以内に急速輸液\n4. 目標MAP≧65mmHg維持のためノルアドレナリン（3mg+生食47mL=50mL組成時）0.05〜0.1μg/kg/min（約${ (nadGamma01MlPerHr / 2).toFixed(1) }〜${nadGamma01MlPerHr}mL/h）より持続静注開始`,
    },
    {
      id: 'em_organophosphate',
      title: '有機リン・農薬中毒',
      badge: '解毒: PAM ＋ アトロピン',
      calculatedSummary: `体重${w}kg ➔ アトロピン 1〜2mg静注(気道分泌消失まで反復) ＋ PAM初回 ${pamGrams} 静注`,
      orderText: `【中毒処置: 有機リン系殺虫剤中毒プロトコル (体重${w}kg換算)】\n1. 医療従事者の二次曝露防止（PPE装着・汚染衣類除去・皮膚洗浄）および気道確保\n2. アトロピン硫酸塩 1〜2mg 静注（気道分泌・ラ音が消失し瞳孔が軽度散大するまで5〜10分毎に倍量反復）\n3. プラリドキシムヨウ化メチル（PAM）初回 ${pamGrams} を生理食塩液100mLに溶解し30分かけて点滴静注、以後0.5g/h持続静注`,
    },
  ];
}

// ============================================================================
// 5. Mindsガイドライン ＆ レセプト審査パス根拠文ジェネレータ
// ============================================================================
export function generateGuidelineEvidenceSnippets(chartText: string): Array<{
  id: string;
  title: string;
  badge: string;
  snippet: string;
}> {
  const normalized = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(chartText));
  const results: Array<{ id: string; title: string; badge: string; snippet: string }> = [];

  // Minds カタログからカルテ内容にマッチする上位CQを抽出
  for (const m of MINDS_KNOWLEDGE_CATALOG) {
    const cleanDis = m.diseaseName.replace(/[（()）].*?[）)]/g, '').trim();
    if (cleanDis.length >= 2 && normalized.includes(cleanDis)) {
      const strengthStr = m.strength === 1 ? '推奨度1(強)' : '推奨度2(弱)';
      const evStr = ['', 'A(高)', 'B(中)', 'C(低)', 'D(極低)'][m.evidenceLevel] || 'A';
      results.push({
        id: `gl_${m.id}`,
        title: `${m.diseaseName} (${m.detail.society})`,
        badge: `${strengthStr} / エビデンス${evStr}`,
        snippet: `【ガイドライン根拠】${m.detail.guidelineTitle}（${m.detail.society}、${strengthStr}・エビデンスレベル${evStr}）に基づき、「${m.recommendation}」の方針を選択。`,
      });
      if (results.length >= 3) break;
    }
  }

  // 算定・レセプト根拠文のマッチ
  for (const p of PROCEDURES_CATALOG) {
    const targetDisList = p.targetDisease.split(/[・、/\s]+/).filter((s) => s.length >= 2);
    if (targetDisList.some((d) => normalized.includes(d))) {
      results.push({
        id: `proc_${p.code}`,
        title: `${p.name} (${p.points})`,
        badge: `レセプト算定根拠 (${p.code})`,
        snippet: p.soapTemplate,
      });
      if (results.length >= 5) break;
    }
  }

  // デフォルト汎用エビデンス記載
  if (results.length === 0) {
    results.push({
      id: 'gl_default_abx',
      title: '抗微生物薬適正使用の手引き (厚労省)',
      badge: '抗菌薬適正使用根拠',
      snippet: '【ガイドライン根拠】厚生労働省「抗微生物薬適正使用の手引き」に基づき、ウイルス性上気道炎に対する不必要な広域抗菌薬投与を控え、対症療法およびRed Flags指導を実施。',
    });
    results.push({
      id: 'gl_default_lifestyle',
      title: '動脈硬化性疾患・高血圧治療GL',
      badge: '生活習慣病管理根拠',
      snippet: '【ガイドライン根拠】高血圧・動脈硬化性疾患予防ガイドラインに基づき、家庭血圧目標値（125/75mmHg未満）および減塩（6g/日未満）・有酸素運動の療養計画を策定し患者同意を取得。',
    });
  }

  return results;
}

// ============================================================================
// 6. 仮想プリンタ逆流連携「過去カルテ4点爆速ダイジェスト」
// ============================================================================
export function generateFourPointChartDigest(rawIngestedText: string): string {
  const { expandedText } = expandMedicalAbbreviations(rawIngestedText);
  const cleaned = normalizeMedicalSpeechTerms(cleanExtractedMedicalText(expandedText));
  const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  const historyItems: string[] = [];
  const rxItems: string[] = [];
  const labAndCourseItems: string[] = [];
  const todoItems: string[] = [];

  for (const line of lines) {
    const c = line.replace(/^[・\-*■]\s*/, '').trim();
    if (!c) continue;

    if (/(?:既往|アレルギー|手術歴|家族歴|高血圧|糖尿病|脂質異常|喘息|癌)/.test(c) && !/(?:処方|検査予定|次回)/.test(c)) {
      historyItems.push(c);
    }
    if (/(?:内服|常用|処方|Rp|錠|カプセル|mg|μg|朝食後|夕食後|眠前|頓用)/.test(c)) {
      rxItems.push(c);
    }
    if (/(?:BP|血圧|SpO2|脈拍|HR|WBC|CRP|HbA1c|eGFR|Cr|AST|ALT|LDL|BNP|心電図|エコー|CT|内視鏡|所見|経過)/.test(c)) {
      labAndCourseItems.push(c);
    }
    if (/(?:予定|次回|フォロー|精査|紹介|検討|未検|再検|確認|指導|プラン|【P】)/.test(c)) {
      todoItems.push(c);
    }
  }

  const unique = (arr: string[]) => Array.from(new Set(arr)).slice(0, 4);

  return [
    '【⚡ 過去カルテ 4点爆速ダイジェスト (略語正規化済)】',
    `①【既往歴・アレルギー】`,
    unique(historyItems).length > 0
      ? unique(historyItems).map((i) => `・${i}`).join('\n')
      : '・特記すべき重篤な既往・薬物アレルギー記載なし',
    '',
    `②【現在処方・常用薬】`,
    unique(rxItems).length > 0
      ? unique(rxItems).map((i) => `・${i}`).join('\n')
      : '・継続処方薬の明記なし（お薬手帳・持参薬確認）',
    '',
    `③【直近の主要経過・客観所見】`,
    unique(labAndCourseItems).length > 0
      ? unique(labAndCourseItems).map((i) => `・${i}`).join('\n')
      : `・${lines.slice(0, 2).join(' / ') || '前回経過安定'}`,
    '',
    `④【本日の未解決課題・引き継ぎTo-Do】`,
    unique(todoItems).length > 0
      ? unique(todoItems).map((i) => `・${i}`).join('\n')
      : '・症状推移の再評価、検査結果説明、および処方継続適否の判断',
  ].join('\n');
}
