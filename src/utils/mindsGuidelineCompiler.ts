/**
 * ============================================================================
 * Minds 診療ガイドライン 512バイト固定長バイナリ ＆ SDカードナレッジモジュール
 * T-dongle-S3 (ESP32-S3 / 16MB Flash + 32GB SD) 向け仕様準拠
 * ============================================================================
 */

import { fnv1a32 } from './medicalDictCompiler';

export interface MindsRecord512 {
  id: number;
  icd10: string;
  triggerWord: string;
  triggerHash: number;
  cqNum: number;
  strength: 1 | 2 | 3 | 4; // 1:強く推奨, 2:弱く推奨, 3:弱く非推奨, 4:強く非推奨
  evidenceLevel: 1 | 2 | 3 | 4; // 1:質A, 2:質B, 3:質C, 4:質D
  alertFlags: number; // 0:標準, 1:禁忌あり, 2:併用注意, 3:高齢者注意, 4:漫然投与注意
  sdOffset: number;
  sdLength: number;
  category: string;
  diseaseName: string;
  cqTitle: string;
  recommendation: string;
}

export interface MindsGuidelineDetail {
  id: string;
  icd10: string;
  diseaseName: string;
  category: string;
  cqNum: number;
  cqTitle: string;
  strength: number;
  evidenceLevel: number;
  recommendation: string;
  detail: {
    background: string;
    rational: string;
    practiceTip: string;
    guidelineTitle: string;
    society: string;
  };
}

/**
 * 代表的な Minds ガイドライン マスターデータ (フロントエンド & WebLLM RAG 共通)
 */
export const MINDS_PRESET_CATALOG: MindsGuidelineDetail[] = [
  {
    id: "J00_CQ1",
    icd10: "J00",
    diseaseName: "急性上気道炎（感冒・かぜ症候群）",
    category: "呼吸器感染症",
    cqNum: 1,
    cqTitle: "成人急性上気道炎に対して抗菌薬投与は推奨されるか？",
    strength: 4,
    evidenceLevel: 1,
    recommendation: "【強く推奨しない (質A)】感冒は80%以上がウイルス性であり、ルーチン抗菌薬投与は罹病期間短縮や合併症予防に寄与せず、耐性菌出現および副作用リスクを高めるため投与しないことを強く推奨する。アセトアミノフェン等の対症療法を基本とする。",
    detail: {
      background: "感冒の90%以上はライノウイルス、コロナウイルス等のウイルス感染である。抗菌薬投与群とプラセボ群を比較した多数のRCTにおいて、感冒に対する抗菌薬は症状持続期間を短縮させず有害事象を有意に増加させる。",
      rational: "耐性菌蔓延を防ぐ観点からもウイルス性上気道炎に対する抗菌薬処方は差し控えるべきである。患者へは自然寛解する疾患である旨を説明し、対症療法を指導する。",
      practiceTip: "Centorスコア0-1点ではGAS抗原検査も不要。経口第3世代セフェムやキノロンの漫然投与は厳に慎む。",
      guidelineTitle: "JAID/JSC感染症治療ガイドライン2019 - 呼吸器感染症",
      society: "日本感染症学会 / 日本化学療法学会"
    }
  },
  {
    id: "J02.9_CQ1",
    icd10: "J02.9",
    diseaseName: "急性咽頭炎・扁桃炎",
    category: "呼吸器感染症",
    cqNum: 1,
    cqTitle: "成人咽頭炎におけるA群β溶連菌(GAS)の鑑別と抗菌薬選択は？",
    strength: 1,
    evidenceLevel: 1,
    recommendation: "【強く推奨 (質A)】Modified Centorスコア等でGAS感染を疑う場合、迅速抗原検査等で確認の上、第1選択としてペニシリン系抗菌薬（アモキシシリン等 10日間）を投与することを強く推奨する。広域キノロン・第3世代セフェムは回避する。",
    detail: {
      background: "咽頭炎の成人の5-15%でA群β溶血性連鎖球菌が原因となり、急性糸球体腎炎やリウマチ熱の合併症を防ぐために適切な抗菌薬治療が必要である。",
      rational: "GASはペニシリン系に100%感受性を維持している。アモキシシリンが第一選択。マクロライド系は耐性率が高いためペニシリンアレルギー例に限定する。",
      practiceTip: "Centorスコア判定: 発熱(+1), 咳欠如(+1), 前頸部リンパ節腫脹(+1), 扁桃滲出物(+1)。3点以上で迅速キット実施を推奨。",
      guidelineTitle: "JAID/JSC感染症治療ガイドライン2019 - 呼吸器感染症",
      society: "日本感染症学会 / 日本化学療法学会"
    }
  },
  {
    id: "I10_CQ1",
    icd10: "I10",
    diseaseName: "本態性高血圧症",
    category: "循環器科",
    cqNum: 1,
    cqTitle: "75歳未満の成人の降圧目標値および第1選択薬は？",
    strength: 1,
    evidenceLevel: 1,
    recommendation: "【強く推奨 (質A)】75歳未満成人・糖尿病合併・CKD合併例の降圧目標値は診察室 130/80 mmHg未満（家庭 125/75 mmHg未満）。第1選択薬としてCa拮抗薬、ARB/ACE阻害薬、サイアザイド系利尿薬から単剤または低用量併用で開始する。",
    detail: {
      background: "高血圧は心血管イベント（脳卒中、心筋梗塞）および末期腎不全の最大因子である。厳格降圧（130/80未満）がイベントを有意に抑制する。",
      rational: "Ca拮抗薬（アムロジピン等）、ARB（テルミサルタン等）が基本。糖尿病や蛋白尿陽性例では腎保護作用を有するARB/ACE阻害薬を最優先とする。",
      practiceTip: "家庭血圧測定（朝・晩、座位安静2回平均）を重視し、白衣高血圧や仮面高血圧に留意する。",
      guidelineTitle: "高血圧治療ガイドライン2020 (JSH2020)",
      society: "日本高血圧学会"
    }
  },
  {
    id: "E11.9_CQ1",
    icd10: "E11.9",
    diseaseName: "２型糖尿病",
    category: "糖尿病・代謝",
    cqNum: 1,
    cqTitle: "成人の血糖コントロール目標値および臓器保護を意図した薬剤選択は？",
    strength: 1,
    evidenceLevel: 1,
    recommendation: "【強く推奨 (質A)】合併症予防の基本目標はHbA1c 7.0%未満。心血管疾患・心不全・CKD合併例では臓器保護エビデンスを有するSGLT2阻害薬またはGLP-1受容体作動薬の積極的投与を推奨する。",
    detail: {
      background: "糖尿病治療の目的は細小血管合併症および大血管症の阻止による健康寿命延伸である。",
      rational: "SGLT2阻害薬は心不全入院および腎機能低下を強力に抑制する。肥満合併例では体重適正化も期待できる。",
      practiceTip: "高齢者のSU薬（グリメピリド等）は重篤低血糖リスクが高いため少量開始または他剤検討。",
      guidelineTitle: "糖尿病診療ガイドライン2024",
      society: "日本糖尿病学会"
    }
  },
  {
    id: "I48.9_CQ1",
    icd10: "I48.9",
    diseaseName: "非弁膜症性心房細動",
    category: "循環器科",
    cqNum: 1,
    cqTitle: "脳梗塞予防のための抗凝固療法（DOAC）適応基準は？",
    strength: 1,
    evidenceLevel: 1,
    recommendation: "【強く推奨 (質A)】CHADS2スコア1点以上（特に2点以上）の非弁膜症性心房細動患者では、直接作用型経口抗凝固薬（DOAC）による抗凝固療法を第一選択として強く推奨する。",
    detail: {
      background: "心房細動による心原性脳塞栓症は重篤な後遺症を残す。CHADS2スコアでリスクを層別化する。",
      rational: "DOACはワーファリンと比較して頭蓋内出血を約半減させ、塞栓症予防効果で同等以上の優越性が証明されている。",
      practiceTip: "腎機能に応じた減量基準を遵守。抗血小板薬との不要な併用は出血を激増させるため避ける。",
      guidelineTitle: "2020年改訂版 不整脈薬物治療ガイドライン",
      society: "日本循環器学会"
    }
  },
  {
    id: "K21.9_CQ1",
    icd10: "K21.9",
    diseaseName: "胃食道逆流症 (GERD)",
    category: "消化器科",
    cqNum: 1,
    cqTitle: "びらん性GERDの初期治療における第1選択薬は？",
    strength: 1,
    evidenceLevel: 1,
    recommendation: "【強く推奨 (質A)】びらん性GERDの初期治療にはP-CAB（ボノプラザン）またはPPIを4-8週間投与することを強く推奨する。症状軽快後は漫然投与を避け減量・オンデマンド療法を検討する。",
    detail: {
      background: "胃酸逆流による胸やけ・食道粘膜びらんに対し、P-CABで約95%以上の粘膜治癒率が得られる。",
      rational: "ボノプラザンは強力な酸抑制を発揮するが、無酸状態の長期継続による低Mg血症や骨粗鬆症リスクに留意し漫然投与を防止する。",
      practiceTip: "保険適用上の初期投与期間（8週間）を厳守。症状軽快後はステップダウン。",
      guidelineTitle: "胃食道逆流症(GERD)診療ガイドライン2021",
      society: "日本消化器病学会"
    }
  },
  {
    id: "S09.9_CQ1",
    icd10: "S09.9",
    diseaseName: "軽症頭部外傷（頭部打撲）",
    category: "救急・脳神経",
    cqNum: 1,
    cqTitle: "GCS 15（意識清明）の軽症頭部打撲成人においてルーチン頭部CTは必要か？",
    strength: 3,
    evidenceLevel: 2,
    recommendation: "【推奨しない (質B)】GCS 15かつ神経学的局所徴候なし、頭蓋骨骨折疑いなし、嘔吐2回未満等の低リスク患者へのルーチンCT撮影は推奨しない。観察待機プロトコル（受傷後24時間の厳重観察）を推奨する。",
    detail: {
      background: "軽症頭部外傷受診者のうち手術を要する頭蓋内血腫は1%未満。不要なCTは医療被曝と費用増大のハームを招く。",
      rational: "Canadian CT Head Rule (CCHR) 基準で高リスク徴候がなければ安全にCTを省略可能。",
      practiceTip: "抗凝固薬内服例は受傷時無症状でも遅発性血腫リスクがあるため閾値を下げて撮影考慮。",
      guidelineTitle: "頭部外傷治療・管理のガイドライン第4版",
      society: "日本神経外傷学会"
    }
  },
  {
    id: "M10.9_CQ1",
    icd10: "M10.9",
    diseaseName: "痛風関節炎・高尿酸血症",
    category: "リウマチ・代謝",
    cqNum: 1,
    cqTitle: "痛風関節炎の急性発作期における尿酸降下薬の取り扱いは？",
    strength: 3,
    evidenceLevel: 2,
    recommendation: "【推奨しない (質B)】痛風発作極期に尿酸降下薬（フェブキソスタット等）を新規開始すると、血中尿酸値の急変動により発作が増悪・長期化するため推奨しない。NSAIDs等で発作寛解後に少量から開始する。",
    detail: {
      background: "発作時の急激な尿酸値低下は関節内結晶の剥離を促進し炎症を悪化させる。",
      rational: "急性期はNSAIDsパルス投与等で消炎を優先。既存薬服用中はそのまま継続。",
      practiceTip: "発作完全消失後1-2週から少量開始し、血清尿酸値6.0 mg/dL以下を目指す。",
      guidelineTitle: "高尿酸血症・痛風の治療ガイドライン第3版",
      society: "日本痛風・尿酸・核酸学会"
    }
  },
  {
    id: "G47.0_CQ1",
    icd10: "G47.0",
    diseaseName: "慢性不眠症",
    category: "精神・心療内科",
    cqNum: 1,
    cqTitle: "高齢者不眠症におけるベンゾジアゼピン系睡眠薬の使用についての推奨は？",
    strength: 4,
    evidenceLevel: 1,
    recommendation: "【強く推奨しない (質A)】高齢者の不眠症に対し、ベンゾジアゼピン系睡眠薬の長期連用は筋弛緩・ふらつきによる夜間転倒・骨折、せん妄、依存性リスクが高いため強く推奨しない。オレキシン受容体拮抗薬またはメラトニン受容体作動薬を優先する。",
    detail: {
      background: "古典的ベンゾ系は筋弛緩と持ち越し効果が顕著で転倒骨折・要介護の誘因となる。",
      rational: "オレキシン受容体拮抗薬（レンボレキサント等）は自然な睡眠覚醒リズムを整え依存を生じにくい。",
      practiceTip: "薬物療法前に睡眠衛生指導を実施。漫然処方は定期的に見直す。",
      guidelineTitle: "睡眠薬の適正な使用と休薬のための診療ガイドライン",
      society: "日本睡眠学会"
    }
  }
];

/**
 * テキストから Minds ガイドライン推奨を即時マッチング検索
 */
export function searchMindsGuidelines(query: string): MindsGuidelineDetail[] {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase();

  return MINDS_PRESET_CATALOG.filter((item) => {
    return (
      item.diseaseName.toLowerCase().includes(q) ||
      item.icd10.toLowerCase().includes(q) ||
      item.cqTitle.toLowerCase().includes(q) ||
      item.recommendation.toLowerCase().includes(q)
    );
  });
}

/**
 * カルテテキストから自動的に関連する Minds ガイドラインを抽出するコパイロット関数
 */
export function extractRelevantMindsGuidelinesFromSoap(soapText: string): MindsGuidelineDetail[] {
  if (!soapText) return [];
  const matched = new Set<string>();
  const results: MindsGuidelineDetail[] = [];

  const triggerMap: Record<string, string[]> = {
    "J00_CQ1": ["かぜ", "感冒", "上気道炎", "風邪", "咽頭発赤"],
    "J02.9_CQ1": ["咽頭炎", "扁桃炎", "扁桃腫脹", "centor", "のどが痛い"],
    "I10_CQ1": ["高血圧", "血圧高値", "降圧", "収縮期血圧", "アムロジピン"],
    "E11.9_CQ1": ["糖尿病", "hba1c", "血糖", "dm", "sglt2"],
    "I48.9_CQ1": ["心房細動", "af", "doac", "chads2", "アピキサバン"],
    "K21.9_CQ1": ["gerd", "逆流性食道炎", "胸やけ", "呑酸", "タケキャブ", "ppi"],
    "S09.9_CQ1": ["頭部打撲", "頭部外傷", "頭を打った", "cchr", "pecarn"],
    "M10.9_CQ1": ["痛風", "高尿酸", "尿酸値", "第1中足趾節関節", "足の親指が痛い"],
    "G47.0_CQ1": ["不眠", "眠れない", "中途覚醒", "睡眠薬", "ベンゾ"]
  };

  for (const [guideId, triggers] of Object.entries(triggerMap)) {
    const isMatched = triggers.some((t) => soapText.toLowerCase().includes(t.toLowerCase()));
    if (isMatched && !matched.has(guideId)) {
      matched.add(guideId);
      const entry = MINDS_PRESET_CATALOG.find((g) => g.id === guideId);
      if (entry) results.push(entry);
    }
  }

  return results;
}
