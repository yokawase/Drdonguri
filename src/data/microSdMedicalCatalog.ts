/**
 * DrVoice どんぐり君！ 32GB MicroSD 統合臨床ナレッジカタログ (v2.6.0)
 * 
 * LilyGO T-Dongle-S3 32GB MicroSD (実効容量 29.8GB) 全領域配分マップに基づく
 * 10大医療カテゴリの完全構造化データベース
 * 
 * 10大カテゴリ構成:
 * 1. ガイドライン原本PDF & Minds構造化全集 (10.5 GB)
 * 2. ローカルAIモデル重み (WebLLM / EmbeddingGemma) (6.5 GB)
 * 3. 医薬品添付文書全文 & 錠剤・識別画像 (4.5 GB)
 * 4. 臨床アトラス画像 (皮膚科・内視鏡・心電図) (4.0 GB)
 * 5. セマンティック・ベクトル & 全文検索インデックス (1.5 GB)
 * 6. 救急・中毒・災害医療(DMAT)プロトコル (0.8 GB)
 * 7. 医科診療報酬点数表 & 施設基準・外来指導料 (150 MB)
 * 8. 厚生労働省 公的医療マスター体系 (50 MB)
 * 9. 臨床検査項目マスター (JLAC10) & 基準範囲・パニック値 (30 MB)
 * 10. 臨床スコアリング & 薬物動態相互作用マトリクス (20 MB)
 */

// 1. 救急・中毒・災害医療 (DMAT) プロトコル
export interface EmergencyProtocolItem {
  id: string;
  category: '中毒' | '救急蘇生' | '災害DMAT' | '外傷';
  title: string;
  substanceOrCondition: string;
  antidoteOrTreatment: string;
  initialProtocol: string;
  triageOrScore: string;
  cautions: string;
  sdFilePath: string; // MicroSD内の格納パス
}

export const EMERGENCY_PROTOCOLS_CATALOG: EmergencyProtocolItem[] = [
  {
    id: "EMERG_ORG_PHOS",
    category: "中毒",
    title: "有機リン系・カーバメート系農薬中毒処置",
    substanceOrCondition: "有機リン系殺虫剤（スミチオン、ダイアジノン等）、コリンエステラーゼ阻害",
    antidoteOrTreatment: "拮抗薬: 硫酸アトロピン 0.5〜2mg 静注（縮瞳・気道分泌改善まで反復投与） ＋ PAM（プラリドキシムヨウ化メチル）1g 点滴",
    initialProtocol: "①除染（衣服脱衣・大量微温湯洗浄、医療従事者の二次汚染防止 PPE着用） ②気道確保・酸素投与（アトロピン化前に低酸素下で投与すると不整脈誘発リスク） ③胃洗浄（摂取後1時間以内かつ気管挿管下） ④活性炭投与",
    triageOrScore: "SLUDGE症候群（流涎、流涙、排尿、排便、胃腸症状、嘔吐）＋ BBB（徐脈、気管支痙攣、気道分泌）の評価",
    cautions: "カーバメート中毒ではPAMは原則不要（可逆的阻害のためアトロピン単独）。医療スタッフの吸入・皮膚接触による二次被害を厳重警戒。",
    sdFilePath: "/protocols/toxicology/organophosphate.pdf"
  },
  {
    id: "EMERG_APAP_OD",
    category: "中毒",
    title: "アセトアミノフェン過量服用・急性肝不全プロトコル",
    substanceOrCondition: "アセトアミノフェン（カロナール、ノーシン等）過量摂取（成人7.5g以上、小児150mg/kg以上）",
    antidoteOrTreatment: "特異的解毒薬: アセチルシステイン（アセチルシステイン内用液 / 静注用注射剤）",
    initialProtocol: "①摂取後8時間以内の速やかなNAC投与開始（Rumack-Matthewノモグラムで血中濃度評価） ②摂取2時間以内なら活性炭単回投与 ③肝機能（AST/ALT/PT-INR/Bilirubin）、腎機能の厳重モニタリング",
    triageOrScore: "Rumack-Matthewノモグラム（摂取後4時間以降の血中濃度測定）。4時間値 150μg/mL 以上で治療適応。",
    cautions: "初期（24時間以内）は悪心・嘔吐のみで無症状のことが多いが、48〜72時間後に致死的電撃性肝不全に移行する。迷ったら早期NAC投与。",
    sdFilePath: "/protocols/toxicology/acetaminophen_overdose.pdf"
  },
  {
    id: "EMERG_DMAT_START",
    category: "災害DMAT",
    title: "災害時 START式トリアージ・プロトコル",
    substanceOrCondition: "多数傷病者発生時（地震・列車事故・爆発等）の迅速一次トリアージ",
    antidoteOrTreatment: "トリアージタッグ（赤:最優先治療群, 黄:待機治療群, 緑:軽症群, 黒:死亡群）の判定・貼付",
    initialProtocol: "【START法 30秒判定】\n1. 歩行可能か？ ➔ YES: 緑タッグ（軽症）\n2. 自発呼吸はあるか？ ➔ NO: 気道確保 ➔ なお無呼吸: 黒タッグ / 呼吸再開: 赤タッグ\n3. 呼吸数 ➔ 10回未満 または 30回/分以上: 赤タッグ\n4. 橈骨動脈拍動 (またはCRT) ➔ 拍動触知不可 (またはCRT>2秒): 赤タッグ\n5. 簡単な従命 ➔ 従命不能: 赤タッグ / 従命可能: 黄タッグ",
    triageOrScore: "赤（最優先・即時搬送）、黄（準緊急・保留）、緑（非緊急・歩行可）、黒（不搬送・死亡）",
    cautions: "過小トリアージ（Under-triage）を極力防ぐ。小児（8歳未満）には modified JumpSTART法（呼吸再開なし時5回の人工呼吸試行）を適用。",
    sdFilePath: "/protocols/dmat/start_triage_standard.pdf"
  },
  {
    id: "EMERG_ANAPHYLAXIS",
    category: "救急蘇生",
    title: "アナフィラキシー初期治療アルゴリズム",
    substanceOrCondition: "医薬品（造影剤、抗菌薬等）、食物、蜂刺症による急性アレルギー反応",
    antidoteOrTreatment: "第1選択薬: アドレナリン（1:1000液 0.1%）0.3〜0.5mg（小児0.01mg/kg）大腿前外側部 筋肉注射",
    initialProtocol: "①直ちにアドレナリン筋注（躊躇しない。皮下注・静注は不可） ②応援要請・救急カート準備 ③患者を仰臥位＋下肢挙上（急に立たせない） ④高流量酸素投与 ⑤静脈路確保＋細胞外液急速輸液（1〜2L） ⑥5〜15分後に改善なければアドレナリン反復筋注",
    triageOrScore: "血圧低下、喘鳴・喉頭浮腫・気道狭窄、皮膚紅斑・蕁麻疹の多臓器徴候を同時確認",
    cautions: "抗ヒスタミン薬やステロイドは第2選択であり、決してアドレナリン筋注を遅らせてはならない。二相性反応（数時間後の再燃）に備え入院観察。",
    sdFilePath: "/protocols/resuscitation/anaphylaxis_jrc.pdf"
  },
  {
    id: "EMERG_JRC_ALS",
    category: "救急蘇生",
    title: "心停止 (CPA) 成人二次救命処置 (JRC蘇生ガイドライン2020)",
    substanceOrCondition: "院内・外来での心停止・意識消失・死戦期呼吸",
    antidoteOrTreatment: "除細動（VF/pVT: 200J二相性） ＋ アドレナリン 1mg 静注（3〜5分毎） ＋ アミオダロン 300mg（3回目除細動後）",
    initialProtocol: "①直ちに胸骨圧迫開始（100〜120回/分、深さ約5cm、完全な胸壁リコイル） ②モニター装着・心電図リズム解析 ③ショック適応リズム（VF/無脈性VT）: 即時除細動 ➔ 直ちに胸骨圧迫再開（2分間） ④非ショック適応（PEA/心静止）: 直ちに胸骨圧迫＋アドレナリン1mg静注 ⑤原因検索（4H4T: 低酸素、低体温、高/低K、循環血液量減少、心タンポナーデ、緊張性気胸、血栓症、中毒）",
    triageOrScore: "ROSC（自己心拍再開）確認: 呼気終末二酸化炭素分圧（ETCO2）の急激な上昇（>40mmHg）や動脈拍動の触知",
    cautions: "胸骨圧迫の中断は最小限（<10秒）に抑える。過換気は静脈還流を妨げるため厳禁（換気回数 10回/分）。",
    sdFilePath: "/protocols/resuscitation/jrc_als_algorithm.pdf"
  }
];

// 2. 臨床医学マルチメディア・アトラス画像 (皮膚科・内視鏡・心電図)
export interface ClinicalAtlasItem {
  id: string;
  category: '皮膚科' | '内視鏡' | '心電図';
  title: string;
  typicalFeatures: string;
  clinicalSignificance: string;
  differentialDiagnosis: string;
  imageFileName: string;
  sdFilePath: string;
  highResUrl?: string;       // 1024x1024 高解像度WebPストリーミング用パス
  thumbnailUrl?: string;     // 256x256 BLEサムネイル用
  hasEcgGrid?: boolean;      // 1mm/5mm方眼紙グリッド重畳フラグ (心電図用)
  findingsSummary?: string;  // カルテ【アセスメント】転記用短縮テキスト
}

export const CLINICAL_ATLAS_CATALOG: ClinicalAtlasItem[] = [
  {
    id: "ATLAS_ECG_STEMI_ANT",
    category: "心電図",
    title: "急性前壁中隔心筋梗塞 (STEMI: LAD閉塞)",
    typicalFeatures: "V1〜V4誘導におけるST上昇（弓状上向き凸〜水平型）、対側性変化（II, III, aVFでのST低下）、早期のT波増高または陰性T波",
    clinicalSignificance: "左前下行枝（LAD）本幹〜近位部閉塞を示唆。左室広範梗塞・心原性ショック・心不全・致死性不整脈（VF）のリスク極めて高く、直ちにカテーテル室へ搬送（Door to Balloon < 90分）が必要。",
    differentialDiagnosis: "早期再分極症候群、急性心膜炎（全誘導性広範ST上昇、PR低下）、たこつぼ心筋症、左室肥大（Strain pattern）",
    imageFileName: "ecg_stemi_anterior_v1_v4.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_stemi_anterior.webp",
    hasEcgGrid: true,
    findingsSummary: "12誘導ECG: V1-V4 ST上昇（STEMI LAD領域疑い）。対側性ST低下(II,III,aVF)。緊急冠動脈造影(CAG)適応。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><defs><pattern id='ecgGridStemi' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M10 0L0 0 0 10' fill='none' stroke='%23fca5a5' stroke-width='0.5'/></pattern><pattern id='ecgMajorStemi' width='50' height='50' patternUnits='userSpaceOnUse'><rect width='50' height='50' fill='url(%23ecgGridStemi)'/><path d='M50 0L0 0 0 50' fill='none' stroke='%23f87171' stroke-width='1.2'/></pattern></defs><rect width='360' height='200' fill='%23fff5f5'/><rect width='360' height='200' fill='url(%23ecgMajorStemi)'/><path d='M10 130v-40h15v40h15' fill='none' stroke='%231e293b' stroke-width='1.8'/><text x='12' y='80' font-family='monospace' font-size='9' font-weight='bold' fill='%2364748b'>1mV Cal</text><text x='65' y='32' font-family='monospace' font-size='12' font-weight='bold' fill='%23991b1b'>V2: LAD STEMI (ST +4.2mm)</text><path d='M40 130h20 c5 0 8-3 12-3 s6 3 10 3 h8 l5-12 l8 65 l7-125 l6 75 h10 c5-28 20-30 35-18 c10 8 15 15 25 15 h15 c5 0 8-3 12-3 s6 3 10 3 h8 l5-12 l8 65 l7-125 l6 75 h10 c5-28 20-30 35-18 c10 8 15 15 25 15 h35' fill='none' stroke='%23b91c1c' stroke-width='2.2'/><rect x='10' y='165' width='340' height='26' fill='%23991b1b' opacity='0.9'/><text x='20' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>緊急カテ適応 (Door-to-Balloon &lt; 90min) LAD急性完全閉塞</text></svg>",
  },
  {
    id: "ATLAS_ECG_HYPERKALEMIA",
    category: "心電図",
    title: "重度高カリウム血症 (テント状T波 ＆ QRS拡大)",
    typicalFeatures: "左右対称で基部が狭く尖った高いT波（テント状T波: Peaked T wave）、P波の平坦化〜消失、PR間隔延長、QRS幅の著明拡大、サイン波（Sine wave pattern）",
    clinicalSignificance: "K値 > 6.5〜7.0 mEq/L の極めて危険なパニック所見。心室細動（VF）や心静止（Asystole）へ直結する超緊急病態。直ちにグルコン酸カルシウム（カルチコール）10ml静注（心筋保護膜安定化）およびGI療法（ブドウ糖・インスリン点滴）が必要。",
    differentialDiagnosis: "早期再分極、正常亜型（若年男性の増高T波）、急性虚血性心筋梗塞超初期（Hyperacute T wave）",
    imageFileName: "ecg_hyperkalemia_peaked_t.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_hyperkalemia.webp",
    hasEcgGrid: true,
    findingsSummary: "12誘導ECG: 広範な高尖鋭T波(テント状T波)＋QRS延長。重度高K血症(K>6.5)疑い。緊急カルチコール静注＋GI療法要。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><defs><pattern id='ecgGridK' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M10 0L0 0 0 10' fill='none' stroke='%23fca5a5' stroke-width='0.5'/></pattern><pattern id='ecgMajorK' width='50' height='50' patternUnits='userSpaceOnUse'><rect width='50' height='50' fill='url(%23ecgGridK)'/><path d='M50 0L0 0 0 50' fill='none' stroke='%23f87171' stroke-width='1.2'/></pattern></defs><rect width='360' height='200' fill='%23fff5f5'/><rect width='360' height='200' fill='url(%23ecgMajorK)'/><text x='15' y='32' font-family='monospace' font-size='12' font-weight='bold' fill='%237f1d1d'>II / V3: Tented T-Wave (K &gt; 7.2 mEq/L)</text><path d='M15 130h40 c15 0 25-10 35 15 l10-60 l12 90 l10-45 h15 l8-85 l8 85 h40 c15 0 25-10 35 15 l10-60 l12 90 l10-45 h15 l8-85 l8 85 h45' fill='none' stroke='%23991b1b' stroke-width='2.4'/><rect x='10' y='165' width='340' height='26' fill='%23b91c1c' opacity='0.95'/><text x='20' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>致死性不整脈直結: 直ちにグルコン酸Ca静注 ＋ GI療法</text></svg>",
  },
  {
    id: "ATLAS_ECG_AF_RVR",
    category: "心電図",
    title: "心房細動 (Af: 細動波 ＆ 絶対的不整 ＆ 頻拍)",
    typicalFeatures: "P波の消失、基線の不規則な細動波（f波）、RR間隔が完全に不規則（絶対的不整: irregularly irregular）。QRS波形は正常狭小（変行伝導時は幅広）。",
    clinicalSignificance: "頻脈性心房細動（HR>110）。左房内血栓形成から心原性脳塞栓症のリスク（CHADS2スコア評価）。レートコントロール（β遮断薬/ジギタリス/Ca拮抗薬）および抗凝固療法（DOAC）適応判定。",
    differentialDiagnosis: "頻発性心房期外収縮（PAC）、心房粗動（AFL: 鋸歯状F波）、多源性心房頻拍（MAT）",
    imageFileName: "ecg_af_rapid_irregular.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_af_rapid.webp",
    hasEcgGrid: true,
    findingsSummary: "12誘導ECG: P波消失、RR間隔絶対的不整、基線細動波(f波)。Af頻拍。CHADS2評価およびレートコントロール検討。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><defs><pattern id='ecgGridAf' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M10 0L0 0 0 10' fill='none' stroke='%23fca5a5' stroke-width='0.5'/></pattern><pattern id='ecgMajorAf' width='50' height='50' patternUnits='userSpaceOnUse'><rect width='50' height='50' fill='url(%23ecgGridAf)'/><path d='M50 0L0 0 0 50' fill='none' stroke='%23f87171' stroke-width='1.2'/></pattern></defs><rect width='360' height='200' fill='%23fff5f5'/><rect width='360' height='200' fill='url(%23ecgMajorAf)'/><text x='15' y='32' font-family='monospace' font-size='12' font-weight='bold' fill='%231e3a8a'>Lead II: Atrial Fibrillation (HR 134 bpm)</text><path d='M10 130 c5 4 8-4 12 2 s6-4 10 1 l5-10 l5 65 l6-75 l4 20 c5 4 8-4 12 1 s5-4 9 2 c4 3 8-4 12 1 l5-10 l5 65 l6-75 l4 20 c6 4 10-4 14 1 c5 4 10-3 15 1 c6 3 10-4 14 2 c5 3 9-4 13 1 l5-10 l5 65 l6-75 l4 20 c5 3 9-4 13 1 c6 4 12-3 17 2 c5 3 9-4 13 1 l5-10 l5 65 l6-75 l4 20 h25' fill='none' stroke='%231d4ed8' stroke-width='2.2'/><rect x='10' y='165' width='340' height='26' fill='%231e40af' opacity='0.9'/><text x='20' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>絶対的不整 (f波) CHADS2スコア評価 ＆ DOAC適応判定</text></svg>",
  },
  {
    id: "ATLAS_DERM_HERPES_ZOSTER",
    category: "皮膚科",
    title: "帯状疱疹 (Herpes Zoster: 皮神経分節一致の水疱)",
    typicalFeatures: "片側性の神経支配領域（デルマトーム）に一致して帯状に配列する紅斑および小水疱・膿疱。灼熱痛・神経痛を先行・随伴する。",
    clinicalSignificance: "水痘・帯状疱疹ウイルス（VZV）の再活性化。皮疹出現後72時間以内の抗ウイルス薬（アメナメビル、バラシクロビル、アシクロビル）投与開始が帯状疱疹後神経痛（PHN）予防に極めて重要。",
    differentialDiagnosis: "単純ヘルペス（HSV）、接触皮膚炎（うるし等）、丹毒、虫刺症、多形滲出性紅斑",
    imageFileName: "derm_zoster_th4_dermatome.webp",
    sdFilePath: "/clinical_atlas/dermatology/derm_herpes_zoster.webp",
    findingsSummary: "皮膚所見: 片側性デルマトームに一致した集簇性小水疱・紅斑。神経痛随伴。帯状疱疹(VZV)臨床診断。抗ウイルス薬開始。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><rect width='360' height='200' fill='%23fffbeb'/><rect x='15' y='15' width='330' height='140' rx='8' fill='white' stroke='%23d97706' stroke-width='1.5'/><text x='25' y='38' font-family='sans-serif' font-size='13' font-weight='bold' fill='%2392400e'>帯状疱疹 デルマトーム診断基準 (Th4-Th5 乳頭部)</text><path d='M35 110 C80 80, 160 85, 230 115 C260 128, 290 120, 310 110' fill='none' stroke='%23dc2626' stroke-width='8' stroke-linecap='round' stroke-dasharray='4 14'/><text x='35' y='72' font-family='sans-serif' font-size='11' font-weight='bold' fill='%23b45309'>【臨床診断3徴候】</text><text x='35' y='92' font-family='sans-serif' font-size='10' fill='%23451a03'>① 片側性・正中線を越えない神経支配領域一致の皮疹</text><text x='35' y='142' font-family='sans-serif' font-size='10' fill='%23451a03'>② 浮腫性紅斑上の集簇性小水疱 ➔ 膿疱 ➔ 痂皮化</text><rect x='15' y='165' width='330' height='26' fill='%23b45309' rx='4'/><text x='25' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>72h以内 抗ウイルス薬開始 (アメナリーフ400mg / バルトレックス3000mg)</text></svg>",
  },
  {
    id: "ATLAS_DERM_SJS_TEN",
    category: "皮膚科",
    title: "スティーブンス・ジョンソン症候群 / 中毒性表皮壊死症 (SJS / TEN)",
    typicalFeatures: "高熱、口唇・口腔・眼球結膜などの2箇所以上の多発粘膜疹、体幹・四肢の広範な紅斑・紫斑・表皮剥離（Nikolsky現象陽性）。",
    clinicalSignificance: "重症薬疹（原因薬: アロプリノール、カルバマゼピン、NSAIDs、抗てんかん薬等）。皮膚剥離面積 10%未満: SJS, 30%以上: TEN。死亡率高率（10〜30%）。原因薬即時中止、ステロイドパルス、免疫グロブリン静注（IVIG）、熱傷ユニット管理が必要。",
    differentialDiagnosis: "多形滲出性紅斑（EEM）、ブドウ球菌性熱傷様皮膚症候群（SSSS）、GVHD、落葉状天疱瘡",
    imageFileName: "derm_sjs_mucosal_involvement.webp",
    sdFilePath: "/clinical_atlas/dermatology/derm_sjs_ten.webp",
    findingsSummary: "皮膚所見: 多発粘膜病変＋広範紅斑・水疱形成。Nikolsky(+)。重症薬疹(SJS/TEN疑い)。原因薬即時中止・救急高次搬送要。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><rect width='360' height='200' fill='%23faf5ff'/><rect x='15' y='15' width='330' height='140' rx='8' fill='white' stroke='%237e22ce' stroke-width='1.5'/><text x='25' y='38' font-family='sans-serif' font-size='13' font-weight='bold' fill='%236b21a8'>重症薬疹 (SJS / TEN) 鑑別判定スコア</text><g font-family='sans-serif' font-size='10' fill='%233b0764'><text x='30' y='65' font-weight='bold'>病態</text><text x='110' y='65' font-weight='bold'>表皮剥離面積 (BSA)</text><text x='240' y='65' font-weight='bold'>粘膜病変 (眼/口/陰部)</text><line x1='25' y1='72' x2='330' y2='72' stroke='%23e9d5ff' stroke-width='1'/><text x='30' y='92'>SJS</text><text x='110' y='92'>&lt; 10 %</text><text x='240' y='92'>2箇所以上の重症粘膜疹</text><text x='30' y='115'>Overlapping</text><text x='110' y='115'>10 〜 30 %</text><text x='240' y='115'>広範浸潤紅斑・紫斑</text><text x='30' y='138' font-weight='bold' fill='%23dc2626'>TEN</text><text x='110' y='138' font-weight='bold' fill='%23dc2626'>&gt; 30 %</text><text x='240' y='138' font-weight='bold' fill='%23dc2626'>Nikolsky現象 陽性</text></g><rect x='15' y='165' width='330' height='26' fill='%237e22ce' rx='4'/><text x='25' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>疑い薬物即時中止 ＋ ステロイドパルス・IVIG・高次救急搬送</text></svg>",
  },
  {
    id: "ATLAS_ENDO_EARLY_GASTRIC_CA",
    category: "内視鏡",
    title: "早期胃癌 (0-IIc型: 陥凹型早期胃癌)",
    typicalFeatures: "胃角部小弯〜前庭部の浅い不整陥凹病変。辺縁粘膜のひだ集中・途読、境界明瞭な発赤・褪色、NBI拡大内視鏡における微細血管構築異常（irregular microvascular pattern）",
    clinicalSignificance: "粘膜内または粘膜下層浅層（SM1）にとどまる早期癌。内視鏡的粘膜下層剥離術（ESD）の絶対適応基準（2cm以下の分化型粘膜内癌、潰瘍瘢痕なし等）に合致すれば根治切除可能。",
    differentialDiagnosis: "胃潰瘍（消化性潰瘍）瘢痕期、慢性萎縮性胃炎の限局性びらん、胃良性ポリープ、MALTリンパ腫",
    imageFileName: "endo_early_gastric_cancer_0iic.webp",
    sdFilePath: "/clinical_atlas/endoscopy/endo_gastric_ca_0iic.webp",
    findingsSummary: "内視鏡所見: 胃角部小弯に約15mmの境界明瞭な不整陥凹病変(0-IIc)。ひだ集中・途絶。早期胃癌疑い。ESD適応精査。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><rect width='360' height='200' fill='%23fef2f2'/><rect x='15' y='15' width='330' height='140' rx='8' fill='white' stroke='%23b91c1c' stroke-width='1.5'/><text x='25' y='38' font-family='sans-serif' font-size='13' font-weight='bold' fill='%23991b1b'>早期胃癌 パリ分類・ESD適応基準ガイド</text><g font-family='sans-serif' font-size='10' fill='%23450a0a'><text x='30' y='65' font-weight='bold'>肉眼型: 0-IIc (浅い不整陥凹型)</text><text x='200' y='65' font-weight='bold'>好発: 胃角部小弯</text><line x1='25' y1='72' x2='330' y2='72' stroke='%23fecaca' stroke-width='1'/><text x='30' y='90'>・病変境界: 明瞭（DL: Demarcation line 陽性）</text><text x='30' y='108'>・微小血管: Irregular microvascular pattern (NBI拡大所見)</text><text x='30' y='126'>・ひだ所見: 集中ひだの先端細細・突然途絶（T1b浸潤指標）</text><text x='30' y='144' font-weight='bold' fill='%23b91c1c'>・ESD絶対適応: 2cm以下・肉眼的粘膜内(cT1a)・分化型・潰瘍(-) </text></g><rect x='15' y='165' width='330' height='26' fill='%23991b1b' rx='4'/><text x='25' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>胃生検施行 ＋ CTによる遠隔転移精査 ＋ 内視鏡的切除(ESD)検討</text></svg>",
  },
  {
    id: "ATLAS_ENDO_GERD_LA_B",
    category: "内視鏡",
    title: "逆流性食道炎 (ロサンゼルス分類: Grade B)",
    typicalFeatures: "食道下部胃食道接合部（GEJ）の粘膜ひだ上に限局する、長径 5mm 以上の粘膜傷害（びらん）。ただし、2本以上のひだ間に連続性（癒合）はない。",
    clinicalSignificance: "胃酸逆流による器質的食道粘膜傷害。胸焼け、呑酸、心窩部痛の主訴と合致。P-CAB（タケキャブ 20mg）またはPPI（ネキシウム等）による初期治療（4〜8週間）の保険適用基準。",
    differentialDiagnosis: "好酸球性食道炎（縦走溝・輪状溝）、カンジダ食道炎（白斑付着）、食道アカラシア、食道扁平上皮癌",
    imageFileName: "endo_gerd_la_grade_b.webp",
    sdFilePath: "/clinical_atlas/endoscopy/endo_gerd_la_b.webp",
    findingsSummary: "内視鏡所見: 下部食道に長径>5mmの非癒合性びらん。逆流性食道炎 LA Grade B。タケキャブ20mg処方開始。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><rect width='360' height='200' fill='%23f0fdfa'/><rect x='15' y='15' width='330' height='140' rx='8' fill='white' stroke='%230f766e' stroke-width='1.5'/><text x='25' y='38' font-family='sans-serif' font-size='13' font-weight='bold' fill='%23115e59'>逆流性食道炎 改訂ロサンゼルス分類 (LA Classification)</text><g font-family='sans-serif' font-size='10' fill='%23134e4a'><text x='30' y='65'>Grade A: 長径 &lt; 5mm の粘膜傷害（ひだを越えない）</text><text x='30' y='85' font-weight='bold' fill='%230f766e'>Grade B: 長径 ≧ 5mm の粘膜傷害（相互に癒合しない）★本症例</text><text x='30' y='105'>Grade C: 2本以上のひだにまたがる癒合性粘膜傷害（周径の75%未満）</text><text x='30' y='125'>Grade D: 全周の少なくとも75%以上に広がる広範粘膜傷害</text><text x='30' y='145' font-weight='bold'>・推奨治療: P-CAB (ボノプラザン 20mg 1日1回 4週間処方)</text></g><rect x='15' y='165' width='330' height='26' fill='%230f766e' rx='4'/><text x='25' y='182' font-family='sans-serif' font-size='11' font-weight='bold' fill='white'>タケキャブ20mg 初期4週間投与 ➔ 症状改善後10mg維持療法</text></svg>",
  },
  {
    id: "ATLAS_ECG_ANGINA_ST_DEP",
    category: "心電図",
    title: "労作性狭心症・心筋虚血 (V4〜V6 水平型ST低下 ＆ 陰性T波)",
    typicalFeatures: "労作時の胸部圧迫感・息切れ・動悸発作に一致した左側胸部誘導（V4〜V6）およびI, aVLでの 0.1mV (1mm) 以上の水平型（Horizontal）または下降型（Down-sloping）ST低下、対称性陰性T波。",
    clinicalSignificance: "心内膜下虚血（安定労作性狭心症〜不安定狭心症 NSTE-ACS）の典型的12誘導心電図所見。高血圧・脂質異常症を背景とする冠動脈有意狭窄を示唆。ニトロペン舌下錠による症状・ST変化の改善確認、心筋トロポニンT/I・BNP迅速測定、心エコー、冠動脈CTまたは冠動脈造影（CAG）が必須。",
    differentialDiagnosis: "非ST上昇型心筋梗塞（NSTEMI: トロポニン陽性）、左室肥大に伴うストレイン型ST-T変化、ジギタリス効果（盆状ST低下）、低カリウム血症",
    imageFileName: "ecg_angina_horizontal_st_depression.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_angina_st_depression.webp",
    hasEcgGrid: true,
    findingsSummary: "12誘導ECG: V4-V6にて水平型ST低下(-2.0mm)およびT波陰転化。労作性狭心症・心筋虚血疑い。トロポニン・BNP測定および冠動脈CT/循環器対診。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><defs><pattern id='ecgGridAng' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M10 0L0 0 0 10' fill='none' stroke='%23fca5a5' stroke-width='0.5'/></pattern><pattern id='ecgMajorAng' width='50' height='50' patternUnits='userSpaceOnUse'><rect width='50' height='50' fill='url(%23ecgGridAng)'/><path d='M50 0L0 0 0 50' fill='none' stroke='%23f87171' stroke-width='1.2'/></pattern></defs><rect width='360' height='200' fill='%23fff5f5'/><rect width='360' height='200' fill='url(%23ecgMajorAng)'/><path d='M10 110v-40h15v40h10' fill='none' stroke='%231e293b' stroke-width='1.8'/><text x='10' y='62' font-family='monospace' font-size='9' font-weight='bold' fill='%2364748b'>1mV Cal</text><text x='60' y='30' font-family='monospace' font-size='11.5' font-weight='bold' fill='%23991b1b'>V5: Effort Angina (Horizontal ST -2.0mm)</text><line x1='35' y1='110' x2='345' y2='110' stroke='%2364748b' stroke-width='0.8' stroke-dasharray='3 3'/><path d='M35 110h18 c4 0 7-4 10-4 s5 4 9 4 h8 l4 8 l6-68 l6 82 h22 c8 0 12 12 18 12 s10-18 16-18 h22 c4 0 7-4 10-4 s5 4 9 4 h8 l4 8 l6-68 l6 82 h22 c8 0 12 12 18 12 s10-18 16-18 h25' fill='none' stroke='%23b91c1c' stroke-width='2.2'/><rect x='10' y='165' width='340' height='26' fill='%230f172a' opacity='0.92'/><text x='18' y='182' font-family='sans-serif' font-size='10.5' font-weight='bold' fill='%2338bdf8'>労作性狭心症: ニトロペン舌下 ＋ トロポニン/BNP ＋ 冠動脈CT</text></svg>",
  },
  {
    id: "ATLAS_ECG_HF_LVH",
    category: "心電図",
    title: "高血圧性左室肥大 ＆ うっ血性心不全 (LVH Strain ＆ BNP上昇)",
    typicalFeatures: "Sokolow-Lyon基準陽性（SV1 + RV5 ≧ 3.5mV / 35mm）、左側胸部誘導（V5, V6）における高電位R波および非対称性ST低下・陰性T波（ストレイン型ST-T変化）、左房負荷所見（II誘導の二峰性P波・V1の陰性P波増大）。",
    clinicalSignificance: "長期の高血圧症・動脈硬化に伴う圧負荷から左室肥大（LVH）および拡張障害型心不全（HFpEF）へ進展した所見。労作時息切れ・動悸・胸部圧迫感の原因となり、BNP / NT-proBNP測定および心エコー（左室駆出率 LVEF・E/e'評価）の適応。",
    differentialDiagnosis: "労作性狭心症、肥大型心筋症（HCM: 巨大陰性T波）、大動脈弁狭窄症（AS）",
    imageFileName: "ecg_lvh_strain_heart_failure.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_lvh_strain.webp",
    hasEcgGrid: true,
    findingsSummary: "12誘導ECG: SV1+RV5>35mm(左室高電位)＋V5-V6ストレイン型ST低下。高血圧性心肥大・心不全(HFpEF)疑い。心エコー・BNP精査。",
    thumbnailUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='200' viewBox='0 0 360 200'><defs><pattern id='ecgGridLvh' width='10' height='10' patternUnits='userSpaceOnUse'><path d='M10 0L0 0 0 10' fill='none' stroke='%23fca5a5' stroke-width='0.5'/></pattern><pattern id='ecgMajorLvh' width='50' height='50' patternUnits='userSpaceOnUse'><rect width='50' height='50' fill='url(%23ecgGridLvh)'/><path d='M50 0L0 0 0 50' fill='none' stroke='%23f87171' stroke-width='1.2'/></pattern></defs><rect width='360' height='200' fill='%23fff5f5'/><rect width='360' height='200' fill='url(%23ecgMajorLvh)'/><text x='15' y='28' font-family='monospace' font-size='11.5' font-weight='bold' fill='%231e3a8a'>V5: LVH High Voltage + Strain Pattern</text><path d='M15 120h20 c4 0 7-4 11-4 s6 4 10 4 h8 l3 8 l6-95 l6 98 c10 5 18 18 26 22 c8 3 14-20 22-25 h30 c4 0 7-4 11-4 s6 4 10 4 h8 l3 8 l6-95 l6 98 c10 5 18 18 26 22 c8 3 14-20 22-25 h35' fill='none' stroke='%231e40af' stroke-width='2.2'/><rect x='10' y='165' width='340' height='26' fill='%231e3a8a' opacity='0.92'/><text x='18' y='182' font-family='sans-serif' font-size='10.5' font-weight='bold' fill='white'>高血圧性左室肥大・息切れ: 心エコー ＋ BNP測定 ＋ 降圧最適化</text></svg>",
  }
];

// 3. 医薬品添付文書・錠剤刻印・持参薬識別
export interface DrugIdentificationItem {
  id: string;
  yjCode: string;            // 厚労省 YJコード
  janCode?: string;          // JANバーコード
  brandName: string;
  genericName: string;
  imprintCode: string;       // 統合刻印記号 (後方互換性)
  imprintFront: string;      // 表側 刻印記号 (例: "TAKECAB 20")
  imprintBack: string;       // 裏側 刻印記号 (例: "20")
  colorAndShape: string;
  category: string;
  diameterMm: number;        // 直径 (mm)
  thicknessMm: number;       // 厚さ (mm)
  hasScoredLine: boolean;    // 割線有無
  standardDose: string;
  renalDoseInfo: string;     // 腎機能別減量設計 (eGFR/CCr基準)
  majorCautions: string;
  frontImageUrl: string;     // 表側サムネイル (256x256 WebP DataURL)
  backImageUrl: string;      // 裏側サムネイル (256x256 WebP DataURL)
  thumbnailUrl?: string;     // 互換用サムネイル
  sdFilePath: string;
  pdfPath: string;           // 添付文書原本PDFパス
}

export const DRUG_IDENTIFICATION_CATALOG: DrugIdentificationItem[] = [
  {
    id: "DRUG_ID_AMODIPIN5",
    yjCode: "2171022F2020",
    janCode: "4987087034110",
    brandName: "アムロジピン錠5mg (アムロジン/ノルバスク等)",
    genericName: "アムロジピンベシル酸塩",
    imprintCode: "ア 5 / NL 5",
    imprintFront: "ア 5",
    imprintBack: "NL 5",
    colorAndShape: "白色〜淡黄色、円形割線入り錠",
    category: "持続性Ca拮抗薬 (高血圧症・狭心症治療薬)",
    diameterMm: 7.0,
    thicknessMm: 2.8,
    hasScoredLine: true,
    standardDose: "高血圧症: 1回2.5〜5mg 1日1回（効果不十分時10mgまで増量可）。狭心症（労作性狭心症・冠攣縮性狭心症）: 1回5mg 1日1回。",
    renalDoseInfo: "腎機能障害患者における用量調節は不要（肝代謝型。透析患者でも通常用量で使用可能、透析除去率極めて低い）。",
    majorCautions: "妊婦禁忌。グレープフルーツジュース併用注意（CYP3A4阻害により降圧作用増強）。副作用として下腿浮腫・ほてり・歯肉肥厚に留意。",
    sdFilePath: "/drugs/pill_photos/amlodipine_5mg.webp",
    pdfPath: "/drugs/package_inserts/2171022F2020.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23fefce8' stroke='%23eab308' stroke-width='4'/><line x1='40' y1='128' x2='216' y2='128' stroke='%23ca8a04' stroke-width='2' stroke-dasharray='4'/><text x='128' y='105' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%23713f12'>ア</text><text x='128' y='170' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%23713f12'>5</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 割線 ア 5]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23fefce8' stroke='%23eab308' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%23713f12'>NL 5</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 識別コード NL 5]</text></svg>",
  },
  {
    id: "DRUG_ID_ATORVASTATIN10",
    yjCode: "2189015F2024",
    janCode: "4987111451102",
    brandName: "アトルバスタチン錠10mg (リピトール等)",
    genericName: "アトルバスタチンカルシウム水和物",
    imprintCode: "AT 10 / 932",
    imprintFront: "アトルバ 10",
    imprintBack: "AT 10",
    colorAndShape: "白色〜微黄白色、円形フィルムコーティング錠",
    category: "HMG-CoA還元酵素阻害剤 (スタチン・脂質異常症治療薬)",
    diameterMm: 6.1,
    thicknessMm: 2.7,
    hasScoredLine: false,
    standardDose: "高コレステロール血症（脂質異常症）: 通常成人1回10mgを1日1回経口投与（重症時は1日20mgまで増量可）。家族性高コレステロール血症は最大40mg。",
    renalDoseInfo: "腎機能障害患者における用量調節は原則不要（胆汁排泄型）。ただし腎障害合併例ではフィブラート系併用による横紋筋融解症リスクが高まるためCK・筋肉痛を厳重監視。",
    majorCautions: "重篤な肝障害患者・妊婦・授乳婦・グレカプレビル/ピブレンタスビル投与中は禁忌。横紋筋融解症（筋肉痛、脱力感、CK上昇、ミオグロビン尿）出現時は直ちに投与中止。",
    sdFilePath: "/drugs/pill_photos/atorvastatin_10mg.webp",
    pdfPath: "/drugs/package_inserts/2189015F2024.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='86' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><text x='128' y='118' font-family='sans-serif' font-weight='bold' font-size='19' text-anchor='middle' fill='%23334155'>アトルバ</text><text x='128' y='148' font-family='sans-serif' font-weight='bold' font-size='22' text-anchor='middle' fill='%23334155'>10</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 円形 6.1mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='86' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%23334155'>AT 10</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 裏刻印 AT 10]</text></svg>",
  },
  {
    id: "DRUG_ID_NITROPEN03",
    yjCode: "2171005H1036",
    janCode: "4987045011214",
    brandName: "ニトロペン舌下錠0.3mg",
    genericName: "ニトログリセリン",
    imprintCode: "NK / 0.3",
    imprintFront: "NK",
    imprintBack: "0.3",
    colorAndShape: "白色、円形素錠（速崩性舌下錠）",
    category: "冠血管拡張薬・硝酸薬 (狭心症発作寛解薬)",
    diameterMm: 5.5,
    thicknessMm: 2.3,
    hasScoredLine: false,
    standardDose: "狭心症・胸部圧迫感発作時: 通常成人1回1錠（0.3mg）を舌下に投与。速やかに溶けて1〜2分で効果発現。5分経過しても改善しない場合はもう1錠追加し、計3錠で無効なら直ちに救急要請。",
    renalDoseInfo: "腎機能障害による用量調節不要（血管平滑筋・肝臓で速やかに代謝）。",
    majorCautions: "【併用禁忌】PDE5阻害薬（シルデナフィル、タダラフィル、バルデナフィル）およびリオシグアト（アデンプas）とは過度な血圧低下・ショックを招くため絶対併用禁忌。起立性低血圧・めまい・転倒を防ぐため必ず座位または臥位で舌下させること（噛み砕いたり飲み込んだりしない）。",
    sdFilePath: "/drugs/pill_photos/nitropen_03mg.webp",
    pdfPath: "/drugs/package_inserts/2171005H1036.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='80' fill='%23ffffff' stroke='%2338bdf8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%230369a1'>NK</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 舌下錠 5.5mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='80' fill='%23ffffff' stroke='%2338bdf8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%230369a1'>0.3</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 規格 0.3mg]</text></svg>",
  },
  {
    id: "DRUG_ID_BAYASPIRIN100",
    yjCode: "3399007F1024",
    janCode: "4987341101114",
    brandName: "バイアスピリン錠100mg",
    genericName: "アスピリン（腸溶錠）",
    imprintCode: "BA / 100",
    imprintFront: "BA",
    imprintBack: "100",
    colorAndShape: "白色、円形腸溶性フィルムコーティング錠",
    category: "抗血小板薬 (狭心症・心筋梗塞・虚血性脳血管障害)",
    diameterMm: 8.1,
    thicknessMm: 3.5,
    hasScoredLine: false,
    standardDose: "狭心症（慢性安定狭心症・不安定狭心症）・心筋梗塞・虚血性脳血管障害における血栓・塞栓形成の抑制: 通常成人1回100mgを1日1回経口投与。急性冠症候群(ACS)初回負荷時は100〜300mg。",
    renalDoseInfo: "重篤な腎障害患者は禁忌。軽〜中等度腎障害時は腎血流低下・出血傾向に注意。",
    majorCautions: "消化性潰瘍のある患者、出血傾向、アスピリン喘息、出産予定日12週以内の妊婦は禁忌。低用量アスピリン潰瘍予防のためPPI/P-CAB（タケキャブ等）併用を考慮。腸溶錠のため粉砕・噛み砕き禁止。",
    sdFilePath: "/drugs/pill_photos/bayaspirin_100mg.webp",
    pdfPath: "/drugs/package_inserts/3399007F1024.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23f8fafc' stroke='%2364748b' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%231e293b'>BA</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 腸溶錠 8.1mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23f8fafc' stroke='%2364748b' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%231e293b'>100</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 100mg]</text></svg>",
  },
  {
    id: "DRUG_ID_BISOPROLOL25",
    yjCode: "2123016F2020",
    janCode: "4987087035513",
    brandName: "ビソプロロールフマル酸塩錠2.5mg (メインテート)",
    genericName: "ビソプロロールフマル酸塩",
    imprintCode: "TA 122 / 2.5",
    imprintFront: "ビソプロ 2.5",
    imprintBack: "2.5",
    colorAndShape: "白色〜微黄白色、円形割線入り錠",
    category: "選択的β1遮断薬 (狭心症・高血圧・慢性心不全・頻脈性心房細動)",
    diameterMm: 7.0,
    thicknessMm: 3.0,
    hasScoredLine: true,
    standardDose: "本態性高血圧症・狭心症: 1回2.5〜5mg 1日1回。頻脈性心房細動: 1日1回2.5mgから開始し最大5mg。慢性心不全: 1日1回0.625mgから開始し段階的に維持量(1.25〜5mg)へ漸増。",
    renalDoseInfo: "肝・腎両排泄型（1:1）。重度腎機能障害（CrCl<30）では半量から慎重に開始。",
    majorCautions: "高度徐脈、房室ブロック(II, III度)、洞不全症候群、心原性ショック、未治療の褐色細胞腫は禁忌。気管支喘息患者および急な自己中断（狭心症悪化・反跳現象）に厳重注意。",
    sdFilePath: "/drugs/pill_photos/bisoprolol_25mg.webp",
    pdfPath: "/drugs/package_inserts/2123016F2020.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23fef9c3' stroke='%23ca8a04' stroke-width='4'/><line x1='40' y1='128' x2='216' y2='128' stroke='%23a16207' stroke-width='2' stroke-dasharray='4'/><text x='128' y='105' font-family='sans-serif' font-weight='bold' font-size='18' text-anchor='middle' fill='%23713f12'>ビソプロ</text><text x='128' y='168' font-family='sans-serif' font-weight='bold' font-size='24' text-anchor='middle' fill='%23713f12'>2.5</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 割線 2.5mg]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23fef9c3' stroke='%23ca8a04' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%23713f12'>2.5</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 2.5]</text></svg>",
  },
  {
    id: "DRUG_ID_TAKECAB20",
    yjCode: "2329031F2024",
    janCode: "4987123143522",
    brandName: "タケキャブ錠20mg",
    genericName: "ボノプラザンフマル酸塩",
    imprintCode: "TAKECAB 20 / 20",
    imprintFront: "TAKECAB 20",
    imprintBack: "20",
    colorAndShape: "淡赤色、円形フィルムコーティング錠",
    category: "カリウムイオン競合型アシッドブロッカー (P-CAB)",
    diameterMm: 7.1,
    thicknessMm: 3.4,
    hasScoredLine: true,
    standardDose: "逆流性食道炎: 1回20mg 1日1回（通常4週、最長8週）。胃潰瘍・十二指腸潰瘍: 1回20mg 1日1回。ピロリ除菌: 1回20mgをアモキシシリン・クラリスロマイシンと1日2回7日間。",
    renalDoseInfo: "腎機能障害患者における用量調節は原則不要（重度腎障害時も通常用量で投与可能だが慎重投与）。",
    majorCautions: "アタザナビル（レイアタッツ）、リルピビリン（エジュラント）投与中の患者は禁忌（胃酸分泌抑制により抗HIV薬の吸収低下）。",
    sdFilePath: "/drugs/pill_photos/takecab_20mg.webp",
    pdfPath: "/drugs/package_inserts/2329031F2024.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23fda4af' stroke='%23f43f5e' stroke-width='4'/><line x1='128' y1='40' x2='128' y2='216' stroke='%23e11d48' stroke-width='2' stroke-dasharray='4'/><text x='128' y='122' font-family='sans-serif' font-weight='bold' font-size='18' text-anchor='middle' fill='%23881337'>TAKECAB</text><text x='128' y='148' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' fill='%23881337'>20</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 表刻印 7.1mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23fda4af' stroke='%23f43f5e' stroke-width='4'/><line x1='128' y1='40' x2='128' y2='216' stroke='%23e11d48' stroke-width='2' stroke-dasharray='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='30' text-anchor='middle' fill='%23881337'>20</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 裏刻印 割線]</text></svg>",
  },
  {
    id: "DRUG_ID_ELIQUIS5",
    yjCode: "3339002F2025",
    janCode: "4987087037746",
    brandName: "エリキュース錠5mg",
    genericName: "アピキサバン",
    imprintCode: "894 / 5",
    imprintFront: "894",
    imprintBack: "5",
    colorAndShape: "黄色、両凸の楕円形フィルムコーティング錠",
    category: "経口直接作用型第Xa因子阻害剤 (DOAC)",
    diameterMm: 9.9,
    thicknessMm: 4.2,
    hasScoredLine: false,
    standardDose: "非弁膜症性心房細動における虚血性脳卒中予防: 1回5mg 1日2回。深部静脈血栓症(DVT)の治療: 1回10mg 1日2回 7日間 ➔ 1回5mg 1日2回。",
    renalDoseInfo: "減量基準（1回2.5mg 1日2回）: ①80歳以上 ②体重<=60kg ③血清Cr>=1.5mg/dL のうち2項目以上該当時。重度腎障害(CLcr<15)は禁忌。",
    majorCautions: "出血性疾患、急性細菌性心内膜炎、重度腎不全は禁忌。ケトコナゾール等強力なCYP3A4・P-gp阻害薬併用時は注意。",
    sdFilePath: "/drugs/pill_photos/eliquis_5mg.webp",
    pdfPath: "/drugs/package_inserts/3339002F2025.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><ellipse cx='128' cy='128' rx='95' ry='60' fill='%23fef08a' stroke='%23eab308' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%23713f12'>894</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 楕円形 9.9x6.0mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><ellipse cx='128' cy='128' rx='95' ry='60' fill='%23fef08a' stroke='%23eab308' stroke-width='4'/><text x='128' y='138' font-family='sans-serif' font-weight='bold' font-size='32' text-anchor='middle' fill='%23713f12'>5</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 規格刻印 5mg]</text></svg>",
  },
  {
    id: "DRUG_ID_FORXIGA10",
    yjCode: "3969018F2023",
    janCode: "4987087039603",
    brandName: "フォシーガ錠10mg",
    genericName: "ダパグリフロジンプロピレングリコール水和物",
    imprintCode: "10 / 1427",
    imprintFront: "10",
    imprintBack: "1427",
    colorAndShape: "黄色、両凸のダイヤモンド形(菱形)フィルムコーティング錠",
    category: "SGLT2阻害剤 (糖尿病・慢性心不全・CKD治療薬)",
    diameterMm: 8.5,
    thicknessMm: 4.1,
    hasScoredLine: false,
    standardDose: "2型糖尿病: 1回5mg 1日1回（効果不十分時10mg）。慢性心不全（HFrEF/HFpEF）、慢性腎臓病（CKD）: 1回10mg 1日1回。",
    renalDoseInfo: "eGFR 25〜60: 心不全・CKDに対して10mg継続推奨。eGFR < 25: 新規開始は推奨されないが継続可。透析患者には無効のため投与中止。",
    majorCautions: "尿路感染・性器感染、脱水、正常血糖ケトアシドーシス（euglycemic DKA）に注意。シックデイ（発熱・下痢・食思不振）時は必ず休薬。",
    sdFilePath: "/drugs/pill_photos/forxiga_10mg.webp",
    pdfPath: "/drugs/package_inserts/3969018F2023.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><polygon points='128,45 218,128 128,211 38,128' fill='%23fef08a' stroke='%23ca8a04' stroke-width='4'/><text x='128' y='137' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%23713f12'>10</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: ダイヤモンド形 10mg]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><polygon points='128,45 218,128 128,211 38,128' fill='%23fef08a' stroke='%23ca8a04' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' fill='%23713f12'>1427</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 識別コード 1427]</text></svg>",
  },
  {
    id: "DRUG_ID_METGLUCO500",
    yjCode: "3962002F3021",
    janCode: "4987116105101",
    brandName: "メトグルコ錠500mg (メトホルミン)",
    genericName: "メトホルミン塩酸塩",
    imprintCode: "DS 262 / 500",
    imprintFront: "DS 262",
    imprintBack: "500",
    colorAndShape: "白色〜帯黄白色、円形割線入りフィルムコーティング錠",
    category: "ビグアナイド系経口血糖降下剤 (2型糖尿病第1選択薬)",
    diameterMm: 10.6,
    thicknessMm: 5.0,
    hasScoredLine: true,
    standardDose: "2型糖尿病: 通常1日500mgより開始し、維持量として1日750〜1500mgを1日2〜3回食直前または食後に分割経口投与（最高1日2250mg）。",
    renalDoseInfo: "eGFR 45〜59: 最大1500mg/日。eGFR 30〜44: 最大750mg/日（慎重投与）。eGFR < 30 mL/min: 【絶対禁忌】（乳酸アシドーシス発症リスク）。",
    majorCautions: "ヨード造影剤検査の前後48時間は必ず一時休薬すること。脱水・シックデイ（発熱・下痢・嘔吐・絶食）・過度のアルコール摂取時は乳酸アシドーシス防止のため直ちに休薬指導。",
    sdFilePath: "/drugs/pill_photos/metgluco_500mg.webp",
    pdfPath: "/drugs/package_inserts/3962002F3021.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='92' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><line x1='38' y1='128' x2='218' y2='128' stroke='%2364748b' stroke-width='2' stroke-dasharray='4'/><text x='128' y='105' font-family='sans-serif' font-weight='bold' font-size='22' text-anchor='middle' fill='%231e293b'>DS</text><text x='128' y='168' font-family='sans-serif' font-weight='bold' font-size='22' text-anchor='middle' fill='%231e293b'>262</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 割線 DS 262]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='92' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%231e293b'>500</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 500mg]</text></svg>",
  },
  {
    id: "DRUG_ID_CALONAL500",
    yjCode: "1141007F3028",
    janCode: "4987496015014",
    brandName: "カロナール錠500mg (アセトアミノフェン)",
    genericName: "アセトアミノフェン",
    imprintCode: "SD 500 / カロナール 500",
    imprintFront: "カロナール 500",
    imprintBack: "SD 500",
    colorAndShape: "白色、楕円形割線入り素錠",
    category: "非ピリン系解熱鎮痛剤 (感冒発熱・各種疼痛第1選択)",
    diameterMm: 15.6,
    thicknessMm: 5.5,
    hasScoredLine: true,
    standardDose: "各種疼痛・腰痛症・変形性関節症: 1回300〜1000mg 1日総量4000mgまで。急性上気道炎（感冒）の解熱・鎮痛: 1回300〜500mg 頓用（原則1日2回まで、最大1500mg）。",
    renalDoseInfo: "NSAIDsと異なり腎血流を低下させないため、CKD・高齢者・心不全患者の解熱鎮痛において第1選択（減量不要）。",
    majorCautions: "【警告】1日総量1500mgを超す高用量長期投与時は定期的な肝機能検査を実施。市販総合感冒薬との重複服用によるアセトアミノフェン過量摂取（劇症肝炎・重篤な肝障害）を厳重に注意喚起。",
    sdFilePath: "/drugs/pill_photos/calonal_500mg.webp",
    pdfPath: "/drugs/package_inserts/1141007F3028.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><ellipse cx='128' cy='128' rx='98' ry='55' fill='%23ffffff' stroke='%2394a3b8' stroke-width='4'/><line x1='128' y1='73' x2='128' y2='183' stroke='%2364748b' stroke-width='2' stroke-dasharray='4'/><text x='80' y='134' font-family='sans-serif' font-weight='bold' font-size='15' text-anchor='middle' fill='%231e293b'>カロナール</text><text x='176' y='136' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' fill='%231e293b'>500</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 楕円形 500mg]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><ellipse cx='128' cy='128' rx='98' ry='55' fill='%23ffffff' stroke='%2394a3b8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='24' text-anchor='middle' fill='%231e293b'>SD 500</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: SD 500]</text></svg>",
  },
  {
    id: "DRUG_ID_LOXONIN60",
    yjCode: "1149019F1020",
    janCode: "4987107615619",
    brandName: "ロキソニン錠60mg (ロキソプロフェン)",
    genericName: "ロキソプロフェンナトリウム水和物",
    imprintCode: "LOXONIN / SANKYO 251",
    imprintFront: "ロキソニン 60",
    imprintBack: "251",
    colorAndShape: "ごくうすい紅色の円形割線入り素錠",
    category: "非ステロイド性消炎鎮痛剤 (NSAIDs)",
    diameterMm: 9.1,
    thicknessMm: 3.3,
    hasScoredLine: true,
    standardDose: "関節リウマチ・変形性関節症・腰痛症・歯痛・術後疼痛: 1回60mgを1日3回経口投与（頓用時は1回60〜120mg）。急性上気道炎の解熱鎮痛: 1回60mgを頓用（原則1日2回まで、最大180mg/日）。",
    renalDoseInfo: "プロスタグランジン合成阻害により腎血流量を低下させるため、CKD（eGFR<60）・高齢者・利尿薬/ARB/ACE阻害薬併用患者（Triple Whammy）では急性腎障害（AKI）リスクが高く原則回避（アセトアミノフェンへ変更推奨）。",
    majorCautions: "消化性潰瘍、重篤な血液・肝・腎・心機能不全、アスピリン喘息、妊娠後期の女性は禁忌。ニューキノロン系抗菌薬（レボフロキサシン等）との併用で痙攣誘発リスクあり。",
    sdFilePath: "/drugs/pill_photos/loxonin_60mg.webp",
    pdfPath: "/drugs/package_inserts/1149019F1020.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23ffe4e6' stroke='%23fb7185' stroke-width='4'/><line x1='38' y1='128' x2='218' y2='128' stroke='%23f43f5e' stroke-width='2' stroke-dasharray='4'/><text x='128' y='105' font-family='sans-serif' font-weight='bold' font-size='18' text-anchor='middle' fill='%239f1239'>ロキソニン</text><text x='128' y='168' font-family='sans-serif' font-weight='bold' font-size='24' text-anchor='middle' fill='%239f1239'>60</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 淡紅色 9.1mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='90' fill='%23ffe4e6' stroke='%23fb7185' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%239f1239'>251</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 識別 251]</text></svg>",
  },
  {
    id: "DRUG_ID_SAWACILLIN250",
    yjCode: "6131001M2023",
    janCode: "4987123401127",
    brandName: "サワシリンカプセル250mg (アモキシシリン)",
    genericName: "アモキシシリン水和物",
    imprintCode: "SW 770 / 250mg",
    imprintFront: "SW 770",
    imprintBack: "250",
    colorAndShape: "白色〜淡黄白色ボディ・淡赤色キャップの硬カプセル剤",
    category: "広範囲経口ペニシリン系抗菌薬 (溶連菌咽頭炎・肺炎・ピロリ除菌第1選択)",
    diameterMm: 18.8,
    thicknessMm: 6.4,
    hasScoredLine: false,
    standardDose: "感染症（A群β溶連菌咽頭炎・肺炎・中耳炎・副鼻腔炎等）: 通常成人1回250mg（力価）を1日3〜4回経口投与（重症・肺炎時は1回500mg 1日3回）。ピロリ除菌: 1回750mgを1日2回7日間。",
    renalDoseInfo: "eGFR 10〜30: 1回250〜500mgを12時間毎（1日2回）へ減量。eGFR < 10 / 透析: 1回250〜500mgを24時間毎（1日1回、透析日は透析後）。",
    majorCautions: "ペニシリン系アレルギー既往および伝染性単核球症（EBウイルス感染: 高率に広範な麻疹様皮疹を誘発）は禁忌。溶連菌性咽頭炎ではリウマチ熱予防のため10日間の完遂を指導。",
    sdFilePath: "/drugs/pill_photos/sawacillin_250mg.webp",
    pdfPath: "/drugs/package_inserts/6131001M2023.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><rect x='28' y='92' width='100' height='72' rx='36' fill='%23fda4af' stroke='%23e11d48' stroke-width='3'/><rect x='118' y='92' width='110' height='72' rx='36' fill='%23fefce8' stroke='%23cbd5e1' stroke-width='3'/><text x='128' y='134' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' fill='%231e293b'>SW 770</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: カプセル 250mg]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><rect x='28' y='92' width='100' height='72' rx='36' fill='%23fda4af' stroke='%23e11d48' stroke-width='3'/><rect x='118' y='92' width='110' height='72' rx='36' fill='%23fefce8' stroke='%23cbd5e1' stroke-width='3'/><text x='128' y='134' font-family='sans-serif' font-weight='bold' font-size='20' text-anchor='middle' fill='%231e293b'>AMPC 250</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: AMPC 250]</text></svg>",
  },
  {
    id: "DRUG_ID_VALTREX500",
    yjCode: "6250019F1020",
    janCode: "4987246721011",
    brandName: "バルトレックス錠500 (バラシクロビル)",
    genericName: "バラシクロビル塩酸塩",
    imprintCode: "GX CF1 / 500",
    imprintFront: "GX CF1",
    imprintBack: "500",
    colorAndShape: "白色、長楕円形フィルムコーティング錠",
    category: "抗ヘルペスウイルス剤 (帯状疱疹・単純疱疹治療薬)",
    diameterMm: 18.5,
    thicknessMm: 6.1,
    hasScoredLine: false,
    standardDose: "帯状疱疹: 通常成人1回1000mg（2錠）を1日3回（計3000mg/日）7日間経口投与。単純疱疹: 1回500mg（1錠）を1日2回5日間。",
    renalDoseInfo: "【腎機能別減量必須】帯状疱疹時: CrCl≧50: 1000mg×3回/日、CrCl 30〜49: 1000mg×2回/日、CrCl 10〜29: 1000mg×1回/日、CrCl<10/透析: 500mg×1回/日。",
    majorCautions: "高齢者・腎機能低下例で通常量を漫然投与すると、重篤なアシクロビル脳症（意識障害、構音障害、幻覚、ミオクローヌス）および急性腎不全を惹起する。十分な水分摂取を指導（腎排泄不要なアメナリーフへの変更も選択肢）。",
    sdFilePath: "/drugs/pill_photos/valtrex_500mg.webp",
    pdfPath: "/drugs/package_inserts/6250019F1020.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><rect x='26' y='88' width='204' height='80' rx='40' fill='%23f8fafc' stroke='%2338bdf8' stroke-width='4'/><text x='128' y='135' font-family='sans-serif' font-weight='bold' font-size='22' text-anchor='middle' fill='%230369a1'>GX CF1</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 長楕円錠 18.5mm]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><rect x='26' y='88' width='204' height='80' rx='40' fill='%23f8fafc' stroke='%2338bdf8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='26' text-anchor='middle' fill='%230369a1'>500</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 500mg]</text></svg>",
  },
  {
    id: "DRUG_ID_FEBURIC20",
    yjCode: "3949003F2021",
    janCode: "4987299123456",
    brandName: "フェブリク錠20mg (フェブキソスタット)",
    genericName: "フェブキソスタット",
    imprintCode: "帝人 486 / 20",
    imprintFront: "フェブリク 20",
    imprintBack: "20",
    colorAndShape: "白色〜微黄白色、円形割線入りフィルムコーティング錠",
    category: "非プリン型選択的キサンチンオキシダーゼ阻害剤 (痛風・高尿酸血症治療薬)",
    diameterMm: 7.1,
    thicknessMm: 3.1,
    hasScoredLine: true,
    standardDose: "痛風・高尿酸血症: 1日1回10mgより開始し、2週以降に1日1回20mg、6週以降に維持量1日1回40mgへ段階的に増量（最大60mg）。",
    renalDoseInfo: "肝・腎両排泄型のため、軽度〜中等度腎機能障害（eGFR≧30）では減量不要（アロプリノールと異なりCKD合併例で使いやすい）。重度腎障害（eGFR<30）は慎重投与。",
    majorCautions: "【併用禁忌】メルカプトプリン（ロイケリン）、アザチオプリン（イムラン）とは骨髄抑制増強のため絶対併用禁忌。尿酸値の急激な低下により痛風関節炎（痛風発作）を誘発するため必ず10mg少量から漸増開始し、発作中は新規開始しない。",
    sdFilePath: "/drugs/pill_photos/feburic_20mg.webp",
    pdfPath: "/drugs/package_inserts/3949003F2021.pdf",
    frontImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><line x1='40' y1='128' x2='216' y2='128' stroke='%2364748b' stroke-width='2' stroke-dasharray='4'/><text x='128' y='105' font-family='sans-serif' font-weight='bold' font-size='17' text-anchor='middle' fill='%231e293b'>フェブリク</text><text x='128' y='168' font-family='sans-serif' font-weight='bold' font-size='24' text-anchor='middle' fill='%231e293b'>20</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[FRONT: 割線 20mg]</text></svg>",
    backImageUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256' viewBox='0 0 256 256'><rect width='256' height='256' fill='%230f172a'/><circle cx='128' cy='128' r='88' fill='%23f8fafc' stroke='%2394a3b8' stroke-width='4'/><text x='128' y='136' font-family='sans-serif' font-weight='bold' font-size='28' text-anchor='middle' fill='%231e293b'>20</text><text x='128' y='240' font-family='monospace' font-size='11' text-anchor='middle' fill='%23cbd5e1'>[BACK: 20]</text></svg>",
  }
];

// 4. 臨床医学スコアリング ＆ 薬物動態相互作用マトリクス
export interface ClinicalScoreItem {
  id: string;
  scoreName: string;
  targetClinicalCondition: string;
  calculationFormula: string;
  riskEvaluation: string;
  clinicalAction: string;
}

export const CLINICAL_SCORES_CATALOG: ClinicalScoreItem[] = [
  {
    id: "SCORE_CHADS2",
    scoreName: "CHADS2 スコア (非弁膜症性心房細動の脳梗塞発症リスク)",
    targetClinicalCondition: "心房細動 (AF) 患者における抗凝固療法（DOAC/ワルファリン）の適応決定",
    calculationFormula: "C(うっ血性心不全): +1, H(高血圧): +1, A(年齢>=75歳): +1, D(糖尿病): +1, S2(脳卒中/TIA既往): +2 [計 0〜6点]",
    riskEvaluation: "0点: 低リスク（年間脳梗塞率 1.9%）, 1点: 中等度リスク（年間 2.8%）, 2点以上: 高リスク（2点: 4.0%, 3点: 5.9%, 4点: 8.5%, 5点: 12.5%, 6点: 18.2%）",
    clinicalAction: "2点以上で抗凝固療法（DOAC第1選択）を強く推奨。1点でもガイドライン上DOAC投与を考慮（推奨度高）。0点では抗血栓療法原則不要。"
  },
  {
    id: "SCORE_HAS_BLED",
    scoreName: "HAS-BLED スコア (抗凝固療法中の大出血リスク評価)",
    targetClinicalCondition: "DOAC / ワルファリン投与中の患者における出血合併症リスクの層別化",
    calculationFormula: "H(高血圧 sBP>160): +1, A(腎機能または肝機能異常 各1): +1〜2, S(脳卒中既往): +1, B(出血既往): +1, L(不安定なINR): +1, E(高齢 >=65歳): +1, D(薬物(抗血小板/NSAIDs)または飲酒 各1): +1〜2 [計 0〜9点]",
    riskEvaluation: "0〜2点: 低〜中等度出血リスク, 3点以上: 高出血リスク（年重大出血率 > 3.7%）",
    clinicalAction: "3点以上でも抗凝固療法を即中止するのではなく、修正可能なリスク因子（血圧管理、NSAIDs中止、節酒等）の是正および綿密なフォローアップを行う。"
  },
  {
    id: "SCORE_ADROP",
    scoreName: "A-DROP スコア (成人市中肺炎の重症度分類・日本呼吸器学会)",
    targetClinicalCondition: "市中肺炎 (CAP) における外来・入院・ICU治療判定",
    calculationFormula: "A(Age): 男性>=70歳/女性>=75歳: +1, D(Dehydration): BUN>=21mg/dL または脱水所見: +1, R(Respiration): SpO2<=90% (PaO2<=60Torr): +1, O(Orientation): 意識障害あり: +1, P(Pressure): 収縮期血圧<=90mmHg: +1 [計 0〜5点]",
    riskEvaluation: "0点: 軽症（外来治療可能、死亡率 0.4%）, 1〜2点: 中等症（入院検討、死亡率 3.1%）, 3点: 重症（入院治療必須、死亡率 14.7%）, 4〜5点: 超重症（ICU入室検討、死亡率 30.6%）",
    clinicalAction: "軽症（0点）は外来経口ペニシリン・マクロライド等で治療可。1点以上は原則入院適応。ショック（P）や著明な低酸素（R）がある場合は緊急入院。"
  },
  {
    id: "SCORE_CENTOR",
    scoreName: "Modified Centor スコア (急性咽頭炎における溶連菌 GAS 確率)",
    targetClinicalCondition: "急性咽頭炎患者におけるA群β溶血性連鎖球菌（GAS）感染の鑑別と抗菌薬適応",
    calculationFormula: "①発熱(>38℃): +1, ②咳の欠如: +1, ③有痛性前頸部リンパ節腫脹: +1, ④扁桃の腫脹・滲出液: +1, 年齢修正: 3〜14歳(+1), 15〜44歳(0), >=45歳(-1) [計 -1〜5点]",
    riskEvaluation: "0〜1点: GAS確率 < 10%（抗菌薬・迅速抗原検査不要）, 2〜3点: GAS確率 15〜30%（迅速抗原キット実施推奨）, 4点以上: GAS確率 > 50%（迅速検査＋ペニシリン系抗菌薬投与推奨）",
    clinicalAction: "感冒ウイルス感染が疑われる0〜1点へのルーチン抗菌薬投与は厳禁（Minds強く非推奨）。3点以上で迅速キット陽性時アモキシシリン10日間投与。"
  }
];

// 5. 医科診療報酬・施設基準マスター（外来・レセプト算定要件）
export interface MedicalFeeProcedureItem {
  id: string;
  code: string;
  name: string;
  points: string;
  targetCondition: string;
  mandatoryRequirements: string;
  soapPlanTemplate: string;
}

export const MEDICAL_FEE_PROCEDURES_CATALOG: MedicalFeeProcedureItem[] = [
  {
    id: "FEE_LIFESTYLE_2",
    code: "B001-3",
    name: "生活習慣病管理料 (II)",
    points: "333点 (月1回算定)",
    targetCondition: "高血圧症、脂質異常症、糖尿病を主病とする外来患者（検査・注射等を包括しない外来処方箋交付ケース）",
    mandatoryRequirements: "①療養計画書の初回作成および概ね4ヶ月ごとの見直し ②患者の署名（初回および変更時必須） ③生活習慣に関する総合的な指導（食事・運動・喫煙等） ④カルテへの指導内容要約記載 ⑤長期処方（28日以上）またはリフィル処方箋の対応方針を院内掲示",
    soapPlanTemplate: "【生活習慣病療養計画】主病:高血圧・脂質異常症。目標血圧<130/80mmHg、減塩6g/日未満、有酸素運動週3回を指導。療養計画書を交付し本人署名受領。次回4週間後フォロー。"
  },
  {
    id: "FEE_INFECTION_PREVENTION",
    code: "A000-注11",
    name: "外来感染対策向上加算",
    points: "6点 (受診毎)",
    targetCondition: "発熱・上気道症状・消化器症状等を有する感染症疑い患者の外来診療体制（空間的・時間的分離）",
    mandatoryRequirements: "①専任の院内感染管理者配置 ②感染対策マニュアルの作成と年2回以上の研修 ③地域の医師会・基幹病院との定期カンファレンス参加 ④抗菌薬適正使用の推進 ⑤発熱患者の導線分離",
    soapPlanTemplate: "【感染対策】発熱・上気道症状あり、時間的・空間的分離ブースにて診察実施。適切な個人防護具（PPE）着用。抗菌薬適正使用基準に則り対症療法方針。"
  }
];

// 32GB MicroSD 全領域配分マップ（視覚化用メタデータ）
export interface MicroSdStoragePartition {
  categoryName: string;
  sizeGb: number;
  percentage: number;
  path: string;
  description: string;
  itemCountDescription: string;
}

export const MICRO_SD_STORAGE_MAP: MicroSdStoragePartition[] = [
  {
    categoryName: "ガイドライン原本PDF & Minds構造化全集",
    sizeGb: 10.5,
    percentage: 35.2,
    path: "/guidelines/",
    description: "Minds収載全疾患（300〜500冊）および主要20学会の公式原本PDF全巻・高圧縮Web最適化版",
    itemCountDescription: "公式ガイドライン原本 約450タイトル"
  },
  {
    categoryName: "ローカルAIモデル重み (Gemma 2 / EmbeddingGemma 2)",
    sizeGb: 6.5,
    percentage: 21.8,
    path: "/models/",
    description: "Gemma 2 2B (jpn-it / 2B-it 1.5GB), Gemma 2 9B (4.0GB), EmbeddingGemma 2 (INT4 0.5GB), Whisper (0.5GB) 完全オフライン重み",
    itemCountDescription: "Google Gemma 2ファミリー SLM/埋め込みモデル 4系統"
  },
  {
    categoryName: "医薬品添付文書全文 & 錠剤識別写真",
    sizeGb: 4.5,
    percentage: 15.1,
    path: "/drugs/",
    description: "PMDA公表の全医療用医薬品添付文書全文SQLite ＋ 錠剤・カプセル表裏刻印写真WebP",
    itemCountDescription: "約 22,000 品目添付文書 ＋ 刻印写真"
  },
  {
    categoryName: "臨床アトラス画像 (皮膚科・内視鏡・心電図)",
    sizeGb: 4.0,
    percentage: 13.4,
    path: "/clinical_atlas/",
    description: "皮膚科アトラス2,000点、内視鏡病変1,500点、12誘導心電図ライブラリ500例の高圧縮WebP",
    itemCountDescription: "高解像度臨床画像 約 4,000 点"
  },
  {
    categoryName: "セマンティック・ベクトル & 全文検索インデックス",
    sizeGb: 1.5,
    percentage: 5.0,
    path: "/index/",
    description: "EmbeddingGemma 2 MRL 128/256d 量子化ベクトルDB ＋ SQLite FTS5 転置インデックス",
    itemCountDescription: "全テキスト横断ベクトルDB 1.2GB"
  },
  {
    categoryName: "救急・中毒・災害医療 (DMAT) プロトコル",
    sizeGb: 0.8,
    percentage: 2.7,
    path: "/protocols/",
    description: "急性農薬・医薬品中毒処置、JRC蘇生2020、DMAT START式トリアージマニュアル",
    itemCountDescription: "非常用救急プロトコル 150 項目"
  },
  {
    categoryName: "医科診療報酬・公的医療コード・検査・スコアマスター",
    sizeGb: 0.5,
    percentage: 1.7,
    path: "/protocols/tensuhyo_2026.db",
    description: "医科点数表、厚労省薬価基準（2万件）、病名（2.5万件）、JLAC10検査、CHADS2等スコア式",
    itemCountDescription: "公的コード・算定マスター 約 50,000 件"
  },
  {
    categoryName: "システム予約・差分更新・リードキャッシュ領域",
    sizeGb: 1.5,
    percentage: 5.0,
    path: "/cache/",
    description: "FAT32ディレクトリエントリ、PWAストリーミングバッファ、年1回物理スワップ領域",
    itemCountDescription: "リードキャッシュ ＆ 安全マージン"
  }
];
