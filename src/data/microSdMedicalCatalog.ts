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
    sdFilePath: "/clinical_atlas/ecg_library/ecg_stemi_anterior.webp"
  },
  {
    id: "ATLAS_ECG_HYPERKALEMIA",
    category: "心電図",
    title: "重度高カリウム血症 (テント状T波 ＆ QRS拡大)",
    typicalFeatures: "左右対称で基部が狭く尖った高いT波（テント状T波: Peaked T wave）、P波の平坦化〜消失、PR間隔延長、QRS幅の著明拡大、サイン波（Sine wave pattern）",
    clinicalSignificance: "K値 > 6.5〜7.0 mEq/L の極めて危険なパニック所見。心室細動（VF）や心静止（Asystole）へ直結する超緊急病態。直ちにグルコン酸カルシウム（カルチコール）10ml静注（心筋保護膜安定化）およびGI療法（ブドウ糖・インスリン点滴）が必要。",
    differentialDiagnosis: "早期再分極、正常亜型（若年男性の増高T波）、急性虚血性心筋梗塞超初期（Hyperacute T wave）",
    imageFileName: "ecg_hyperkalemia_peaked_t.webp",
    sdFilePath: "/clinical_atlas/ecg_library/ecg_hyperkalemia.webp"
  },
  {
    id: "ATLAS_DERM_HERPES_ZOSTER",
    category: "皮膚科",
    title: "帯状疱疹 (Herpes Zoster: 皮神経分節一致の水疱)",
    typicalFeatures: "片側性の神経支配領域（デルマトーム）に一致して帯状に配列する紅斑および小水疱・膿疱。灼熱痛・神経痛を先行・随伴する。",
    clinicalSignificance: "水痘・帯状疱疹ウイルス（VZV）の再活性化。皮疹出現後72時間以内の抗ウイルス薬（アメナメビル、バラシクロビル、アシクロビル）投与開始が帯状疱疹後神経痛（PHN）予防に極めて重要。",
    differentialDiagnosis: "単純ヘルペス（HSV）、接触皮膚炎（うるし等）、丹毒、虫刺症、多形滲出性紅斑",
    imageFileName: "derm_zoster_th4_dermatome.webp",
    sdFilePath: "/clinical_atlas/dermatology/derm_herpes_zoster.webp"
  },
  {
    id: "ATLAS_DERM_SJS_TEN",
    category: "皮膚科",
    title: "スティーブンス・ジョンソン症候群 / 中毒性表皮壊死症 (SJS / TEN)",
    typicalFeatures: "高熱、口唇・口腔・眼球結膜などの2箇所以上の多発粘膜疹、体幹・四肢の広範な紅斑・紫斑・表皮剥離（Nikolsky現象陽性）。",
    clinicalSignificance: "重症薬疹（原因薬: アロプリノール、カルバマゼピン、NSAIDs、抗てんかん薬等）。皮膚剥離面積 10%未満: SJS, 30%以上: TEN。死亡率高率（10〜30%）。原因薬即時中止、ステロイドパルス、免疫グロブリン静注（IVIG）、熱傷ユニット管理が必要。",
    differentialDiagnosis: "多形滲出性紅斑（EEM）、ブドウ球菌性熱傷様皮膚症候群（SSSS）、GVHD、落葉状天疱瘡",
    imageFileName: "derm_sjs_mucosal_involvement.webp",
    sdFilePath: "/clinical_atlas/dermatology/derm_sjs_ten.webp"
  },
  {
    id: "ATLAS_ENDO_EARLY_GASTRIC_CA",
    category: "内視鏡",
    title: "早期胃癌 (0-IIc型: 陥凹型早期胃癌)",
    typicalFeatures: "胃角部小弯〜前庭部の浅い不整陥凹病変。辺縁粘膜のひだ集中・途絶、境界明瞭な発赤・褪色、NBI拡大内視鏡における微細血管構築異常（irregular microvascular pattern）",
    clinicalSignificance: "粘膜内または粘膜下層浅層（SM1）にとどまる早期癌。内視鏡的粘膜下層剥離術（ESD）の絶対適応基準（2cm以下の分化型粘膜内癌、潰瘍瘢痕なし等）に合致すれば根治切除可能。",
    differentialDiagnosis: "胃潰瘍（消化性潰瘍）瘢痕期、慢性萎縮性胃炎の限局性びらん、胃良性ポリープ、MALTリンパ腫",
    imageFileName: "endo_early_gastric_cancer_0iic.webp",
    sdFilePath: "/clinical_atlas/endoscopy/endo_gastric_ca_0iic.webp"
  },
  {
    id: "ATLAS_ENDO_GERD_LA_B",
    category: "内視鏡",
    title: "逆流性食道炎 (ロサンゼルス分類: Grade B)",
    typicalFeatures: "食道下部胃食道接合部（GEJ）の粘膜ひだ上に限局する、長径 5mm 以上の粘膜傷害（びらん）。ただし、2本以上のひだ間に連続性（癒合）はない。",
    clinicalSignificance: "胃酸逆流による器質的食道粘膜傷害。胸焼け、呑酸、心窩部痛の主訴と合致。P-CAB（タケキャブ 20mg）またはPPI（ネキシウム等）による初期治療（4〜8週間）の保険適用基準。",
    differentialDiagnosis: "好酸球性食道炎（縦走溝・輪状溝）、カンジダ食道炎（白斑付着）、食道アカラシア、食道扁平上皮癌",
    imageFileName: "endo_gerd_la_grade_b.webp",
    sdFilePath: "/clinical_atlas/endoscopy/endo_gerd_la_b.webp"
  }
];

// 3. 医薬品添付文書・錠剤刻印・持参薬識別
export interface DrugIdentificationItem {
  id: string;
  brandName: string;
  genericName: string;
  imprintCode: string; // 錠剤刻印記号 (例: "ア 327", "TL 20")
  colorAndShape: string;
  category: string;
  standardDose: string;
  majorCautions: string;
  sdFilePath: string;
}

export const DRUG_IDENTIFICATION_CATALOG: DrugIdentificationItem[] = [
  {
    id: "DRUG_ID_TAKECAB20",
    brandName: "タケキャブ錠20mg",
    genericName: "ボノプラザンフマル酸塩",
    imprintCode: "TAKECAB 20",
    colorAndShape: "淡赤色、円形フィルムコーティング錠、割線あり、直径7.1mm",
    category: "カリウムイオン競合型アシッドブロッカー (P-CAB)",
    standardDose: "逆流性食道炎: 1回20mg 1日1回（通常4週、最長8週）。ピロリ除菌: 1回20mgをアモキシシリン・クラリスロマイシンと1日2回7日間。",
    majorCautions: "アタザナビル（レイアタッツ）、リルピビリン（エジュラント）投与中の患者は禁忌（胃酸分泌抑制により抗HIV薬の吸収低下）。",
    sdFilePath: "/drugs/pill_photos/takecab_20mg.webp"
  },
  {
    id: "DRUG_ID_ELIQUIS5",
    brandName: "エリキュース錠5mg",
    genericName: "アピキサバン",
    imprintCode: "894 5",
    colorAndShape: "黄色、両凸の楕円形フィルムコーティング錠、短径6.0mm 長径9.9mm",
    category: "経口直接作用型第Xa因子阻害剤 (DOAC)",
    standardDose: "非弁膜症性心房細動における虚血性脳卒中予防: 1回5mg 1日2回。減量基準（1回2.5mg 1日2回）: ①80歳以上 ②体重60kg以下 ③血清Cr 1.5mg/dL以上のうち2項目以上該当。",
    majorCautions: "出血性疾患、急性細菌性心内膜炎、重度腎機能障害（CLcr < 15mL/min）は禁忌。ケトコナゾール、イトラコナゾール等強力なCYP3A4・P-gp阻害薬併用時は注意。",
    sdFilePath: "/drugs/pill_photos/eliquis_5mg.webp"
  },
  {
    id: "DRUG_ID_FORXIGA10",
    brandName: "フォシーガ錠10mg",
    genericName: "ダパグリフロジンプロピレングリコール水和物",
    imprintCode: "10 1427",
    colorAndShape: "黄色、両凸のダイヤモンド形フィルムコーティング錠",
    category: "SGLT2阻害剤 (糖尿病・慢性心不全・CKD治療薬)",
    standardDose: "2型糖尿病: 1回5mg 1日1回（効果不十分時10mg）。慢性心不全（HFrEF/HFpEF）、慢性腎臓病（CKD）: 1回10mg 1日1回。",
    majorCautions: "尿路感染・性器感染、脱水、正常血糖ケトアシドーシス（euglycemic DKA）に注意。シックデイ時は休薬。透析患者には無効のため投与不可。",
    sdFilePath: "/drugs/pill_photos/forxiga_10mg.webp"
  },
  {
    id: "DRUG_ID_AMODIPIN5",
    brandName: "アムロジピン錠5mg (アムロジン/ノルバスク等)",
    genericName: "アムロジピンベシル酸塩",
    imprintCode: "ア 5 / NL 5",
    colorAndShape: "白色〜淡黄色、円形素錠または割線入りフィルムコーティング錠",
    category: "持続性Ca拮抗薬 (ジヒドロピリジン系降圧薬)",
    standardDose: "高血圧症: 1回2.5〜5mg 1日1回。効果不十分時10mgまで増量可能。狭心症: 1回5mg 1日1回。",
    majorCautions: "妊婦禁忌。グレープフルーツジュース併用注意（CYP3A4阻害により血中濃度上昇）。下腿浮腫・歯肉肥厚に留意。",
    sdFilePath: "/drugs/pill_photos/amlodipine_5mg.webp"
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
    categoryName: "ローカルAIモデル重み (WebLLM / EmbeddingGemma)",
    sizeGb: 6.5,
    percentage: 21.8,
    path: "/models/",
    description: "Qwen2.5-1.5B/7B (q4/q3), EmbeddingGemma 2 (INT4 0.5GB), Whisper-small (1.2GB) 完全オフライン重み",
    itemCountDescription: "量子化SLM/音声認識モデル 4系統"
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
