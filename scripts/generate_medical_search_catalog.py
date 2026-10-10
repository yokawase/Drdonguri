#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ PWA 向け統合臨床ナレッジカタログジェネレーター (v2.3.0)
- 難読単漢字を完全撤廃
- [1] Minds 診療ガイドライン (全111疾患・CQ完全マスター)
- [2] 主要処方薬・医薬品情報 (一般名・用法用量・禁忌・注意事項)
- [3] 保険病名・傷病名マスター (ICD-10・レセプト算定Tips)
- [4] 臨床検査値・基準値・パニック値マスター (HbA1c, eGFR, BNP, CRP, D-ダイマー等)
- [5] 外来診療行為・指導管理料マスター (生活習慣病管理料, 特定疾患, オンライン診療等)
- [6] 腎機能別(eGFR/CrCl) 薬物投与量・減量・禁忌マスター (DOAC, SGLT2i, 抗菌薬等)
を統合し src/data/medicalKnowledgeCatalog.ts を自動生成する
"""

import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINDS_JSON_PATH = os.path.join(BASE_DIR, "data", "sdcard", "minds_knowledge_base.json")
OUTPUT_TS_PATH = os.path.join(BASE_DIR, "src", "data", "medicalKnowledgeCatalog.ts")

# 1. Minds ガイドライン (全111疾患・CQ)
minds_catalog = []
if os.path.exists(MINDS_JSON_PATH):
    with open(MINDS_JSON_PATH, "r", encoding="utf-8") as f:
        minds_raw = json.load(f)
        for item in minds_raw:
            minds_catalog.append({
                "id": item["id"],
                "icd10": item["icd10"],
                "diseaseName": item.get("disease_name", item.get("diseaseName", "")),
                "category": item.get("category", "ガイドライン"),
                "cqNum": item.get("cq_num", item.get("cqNum", 1)),
                "cqTitle": item.get("cq_title", item.get("cqTitle", "")),
                "strength": item.get("strength", 1),
                "evidenceLevel": item.get("evidence_level", item.get("evidenceLevel", 1)),
                "recommendation": item.get("recommendation", ""),
                "detail": {
                    "background": item.get("detail", {}).get("background", ""),
                    "rational": item.get("detail", {}).get("rational", ""),
                    "practiceTip": item.get("detail", {}).get("practice_tip", item.get("detail", {}).get("practiceTip", "")),
                    "guidelineTitle": item.get("detail", {}).get("guideline_title", item.get("detail", {}).get("guidelineTitle", "")),
                    "society": item.get("detail", {}).get("society", "")
                }
            })
print(f"Loaded Minds CQs: {len(minds_catalog)} records")

# 2. 代表的医薬品マスター
DRUGS_DATASET = [
    # 呼吸器・感染症
    {"name": "カロナール錠500", "genericName": "アセトアミノフェン", "yomi": "かろなーるじょうごひゃく", "category": "解熱鎮痛薬", "standardDosage": "1回500〜1000mg 屯用または1日3回 (最大4000mg/日)", "cautions": "重篤な肝障害には禁忌。他剤との重複投与（総合感冒薬等）による過量投与に注意。", "icd10": "R50.9 / J00"},
    {"name": "ロキソニン錠60mg", "genericName": "ロキソプロフェンナトリウム水和物", "yomi": "ろきそにんじょうろくじゅうみりぐらむ", "category": "解熱鎮痛消炎薬(NSAIDs)", "standardDosage": "1回60mg 1日3回 毎食後 (屯用時1回60〜120mg)", "cautions": "消化性潰瘍、重篤な腎機能障害(eGFR<30)、アスピリン喘息には禁忌。胃粘膜保護薬併用推奨。", "icd10": "M79.1 / M54.5"},
    {"name": "サワシリンカプセル250", "genericName": "アモキシシリン水和物", "yomi": "さわしりんかぷせるにひゃくごじゅう", "category": "ペニシリン系抗菌薬", "standardDosage": "成人は1回250〜500mg 1日3〜4回 (高用量時1回500〜1000mg 1日3回)", "cautions": "ペニシリンアレルギーには禁忌。伝染性単核球症（EBV）疑い例への投与は皮疹多発のため回避。", "icd10": "J02.9 / J01.9"},
    {"name": "オーグメンチン配合錠250RS", "genericName": "アモキシシリン・クラブラン酸カリウム", "yomi": "おーぐめんちんはいごうじょう", "category": "βラクタマーゼ阻害配合ペニシリン", "standardDosage": "1回1〜2錠 1日3〜4回", "cautions": "クラブラン酸による下痢・軟便に注意。アモキシシリン追加（比率14:1補正）処方を考慮。", "icd10": "J01.9 / J18.9"},
    {"name": "クラリス錠200", "genericName": "クラリスロマイシン", "yomi": "くらりすじょうにひゃく", "category": "マクロライド系抗菌薬", "standardDosage": "1回200mg 1日2回 (非結核性抗酸菌等は高用量)", "cautions": "CYP3A4強力阻害。スタチン、Ca拮抗薬、DOAC等の血中濃度上昇注意。CrCl<30で半量減量。", "icd10": "J20.9 / J15.7"},
    {"name": "ラスビック錠75mg", "genericName": "ラスクフロキサシン塩酸塩", "yomi": "らすびっくじょうななじゅうごみりぐらむ", "category": "キノロン系抗菌薬", "standardDosage": "1回75mg 1日1回", "cautions": "妊婦・小児禁忌。金属イオン（鉄・マグネシウム・制酸薬）とキレート形成（2時間以上間隔）。", "icd10": "J18.9 / J01.9"},
    {"name": "メジコン錠15mg", "genericName": "デキストロメトルファン臭化水素酸塩", "yomi": "めじこんじょうじゅうごみりぐらむ", "category": "中枢性非麻薬性鎮咳薬", "standardDosage": "1回15〜30mg 1日3回", "cautions": "MAO阻害薬投与中は禁忌。セロトニン症候群に注意。", "icd10": "R05"},
    {"name": "ムコダイン錠500mg", "genericName": "L-カルボシステイン", "yomi": "むこだいんじょうごひゃくみりぐらむ", "category": "気道粘液修復・去痰薬", "standardDosage": "1回500mg 1日3回", "cautions": "粘液正常化と線毛運動改善。肝障害、心疾患の既往がある場合は慎重投与。", "icd10": "R09.3 / J20.9"},
    {"name": "トランサミンカプセル250mg", "genericName": "トラネキサム酸", "yomi": "とらんさみんかぷせる", "category": "抗プラスミン・止血・抗炎症薬", "standardDosage": "1回250〜500mg 1日3〜4回", "cautions": "トロンビン投与中の患者には禁忌（血栓形成）。血栓症患者には慎重投与。", "icd10": "J02.9 / R04.0"},
    {"name": "ゾフルーザ錠20mg", "genericName": "バロキサビル マルボキシル", "yomi": "ぞふるーざじょうにじゅうみりぐらむ", "category": "抗インフルエンザ薬", "standardDosage": "体重40〜80kg: 1回40mg 単回投与", "cautions": "多価陽イオン含有製剤（Mg, Ca, Fe）との同時服用回避。発症48時間以内に単回経口投与。", "icd10": "J10.1 / J11.1"},
    {"name": "タミフルカプセル75", "genericName": "オセルタミビルリン酸塩", "yomi": "たみふるかぷせるななじゅうご", "category": "抗インフルエンザ薬", "standardDosage": "1回75mg 1日2回 5日間", "cautions": "腎機能低下時減量基準あり。異常行動リスクに対する患者・家族への説明・注意喚起を実施。", "icd10": "J10.1 / J11.1"},

    # 循環器・高血圧・不整脈・心不全
    {"name": "アムロジピン錠5mg", "genericName": "アムロジピンベシル酸塩", "yomi": "あむろじぴんじょうごみりぐらむ", "category": "持続性Ca拮抗薬", "standardDosage": "1回2.5〜5mg 1日1回 (最大10mg/日)", "cautions": "妊婦禁忌。下肢浮腫、歯肉肥厚、ほてりに留意。高齢者は2.5mgから開始推奨。", "icd10": "I10"},
    {"name": "ミカルディス錠40mg", "genericName": "テルミサルタン", "yomi": "みかるでぃすじょうよんじゅうみりぐらむ", "category": "ARB", "standardDosage": "1回20〜40mg 1日1回 (最大80mg/日)", "cautions": "妊婦禁忌。高K血症、血清クレアチニン上昇に注意。アリスキレン（糖尿病例）併用禁忌。", "icd10": "I10 / N18.9"},
    {"name": "オルメテック錠20mg", "genericName": "オルメサルタン メドキソミル", "yomi": "おるめてっくじょうにじゅうみりぐらむ", "category": "ARB", "standardDosage": "1回10〜20mg 1日1回 (最大40mg/日)", "cautions": "妊婦禁忌。スプルー様腸症（長期内服での重篤な慢性下痢・体重減少）の報告あり。", "icd10": "I10"},
    {"name": "メインテート錠2.5mg", "genericName": "ビソプロロールフマル酸塩", "yomi": "めいんてーとじょうにてんごみりぐらむ", "category": "選択的β1遮断薬", "standardDosage": "高血圧: 1回2.5〜5mg 1日1回 / 心不全: 0.625mgより漸増", "cautions": "高度徐脈、心原性ショック、重度喘息禁忌。急激な中止による反跳性虚血に注意。", "icd10": "I10 / I50.9 / I48.9"},
    {"name": "リクシアナ錠30mg", "genericName": "エドキサバントシル酸塩水和物", "yomi": "りくしあなじょうさんじゅうみりぐらむ", "category": "DOAC (FXa阻害)", "standardDosage": "体重>60kgかつ正常腎: 60mg 1日1回 / 体重≦60kgまたはCrCl 15-50: 30mg 1日1回", "cautions": "活動性出血禁忌。CrCl<15禁忌。腎機能（CrCl）と体重に応じた減量基準を厳格遵守。", "icd10": "I48.9 / I26.9"},
    {"name": "エリキュース錠5mg", "genericName": "アピキサバン", "yomi": "えりきゅーすじょうごみりぐらむ", "category": "DOAC (FXa阻害)", "standardDosage": "1回5mg 1日2回 / 減量基準（年齢≧80、体重≦60kg、Cr≧1.5のうち2つ該当）: 1回2.5mg 1日2回", "cautions": "活動性出血禁忌。CrCl<15禁忌。朝夕2回服用の服薬アドヒアランス維持が必須。", "icd10": "I48.9"},
    {"name": "バイアスピリン錠100mg", "genericName": "アスピリン (腸溶錠)", "yomi": "ばいあすぴりんじょうひゃくみりぐらむ", "category": "抗血小板薬", "standardDosage": "1回100mg 1日1回", "cautions": "アスピリン喘息、消化性潰瘍、出血傾向禁忌。消化管出血リスクに留意しPPI併用考慮。", "icd10": "I25.2 / I63.9"},
    {"name": "ロスバスタチン錠2.5mg", "genericName": "ロスバスタチンカルシウム", "yomi": "ろすばすたちんじょうにてんごみりぐらむ", "category": "強力スタチン", "standardDosage": "1回2.5mg 1日1回 (最大20mg/日)", "cautions": "妊婦禁忌。横紋筋融解症（筋肉痛・脱力感・CK上昇・褐色尿）に注意。シクロスポリン併用禁忌。", "icd10": "E78.0 / E78.2"},

    # 消化器
    {"name": "タケキャブ錠20mg", "genericName": "ボノプラザンフマル酸塩", "yomi": "たけきゃぶじょうにじゅうみりぐらむ", "category": "P-CAB (強力酸分泌抑制)", "standardDosage": "びらん性GERD: 1回20mg 1日1回 4〜8週 / 維持療法: 1回10mg 1日1回", "cautions": "アタザナビル、リルピビリン併用禁忌。長期漫然投与による低Mg血症、骨折リスクに留意。", "icd10": "K21.0 / K21.9"},
    {"name": "ネキシウムカプセル20mg", "genericName": "エソメプラゾールマグネシウム水和物", "yomi": "ねきしうむかぷせるにじゅうみりぐらむ", "category": "PPI", "standardDosage": "逆流性食道炎: 1回20mg 1日1回 (最大8週間)", "cautions": "長期投与時は定期的な見直しとオンデマンド療法・ステップダウンを検討。", "icd10": "K21.0"},
    {"name": "ムコスタ錠100mg", "genericName": "レバミピド", "yomi": "むこすたじょうひゃくみりぐらむ", "category": "胃粘膜保護薬", "standardDosage": "1回100mg 1日3回", "cautions": "NSAIDs潰瘍予防や急性胃炎粘膜病変改善に安全に使用可能。", "icd10": "K29.7"},
    {"name": "ビオスリー配合錠", "genericName": "生菌配合整腸剤", "yomi": "びおすりーはいごうじょう", "category": "生菌整腸剤", "standardDosage": "1回1〜2錠 1日3回", "cautions": "抗生剤投与時の菌交代症・下痢予防。安全性が極めて高く小児から高齢者まで適応。", "icd10": "K59.1 / A09"},
    {"name": "酸化マグネシウム錠330mg", "genericName": "酸化マグネシウム", "yomi": "さんかまぐねしうむじょう", "category": "浸透圧性下剤", "standardDosage": "1回330〜660mg 1日1〜3回 食後または就寝前", "cautions": "高齢者・腎機能低下例の高Mg血症に厳重注意（定期的な血清Mg測定推奨）。", "icd10": "K59.0"},
    {"name": "モビコール配合内用剤", "genericName": "マクロゴール4000配合剤", "yomi": "もびこーるはいごうないようざい", "category": "高分子浸透圧性下剤", "standardDosage": "初回1日2包(朝・夕分服) 水に溶かして服用、最大6包/日", "cautions": "2歳以上で使用可能。腸管閉塞・穿孔疑い禁忌。電解質バランスを崩しにくい。", "icd10": "K59.0"},

    # 代謝・糖尿病・内分泌
    {"name": "フォシーガ錠10mg", "genericName": "ダパグリフロジンプロピレングリコール水和物", "yomi": "ふぉしーがじょうじゅうみりぐらむ", "category": "SGLT2阻害薬", "standardDosage": "2型糖尿病/慢性心不全/CKD: 1回5〜10mg 1日1回 朝", "cautions": "脱水、尿路感染、正常血糖ケトアシドーシス注意。シックデイ時は休薬。eGFR<20は非推奨。", "icd10": "E11.9 / I50.9 / N18.9"},
    {"name": "ジャディアンス錠10mg", "genericName": "エンパグリフロジン", "yomi": "じゃでぃあんすじょうじゅうみりぐらむ", "category": "SGLT2阻害薬", "standardDosage": "1回10mg 1日1回 (効果不十分時25mgへ増量可)", "cautions": "心血管死・心不全入院リスクを有意に抑制。脱水予防に十分な水分摂取を指導。", "icd10": "E11.9 / I50.9"},
    {"name": "ジャヌビア錠50mg", "genericName": "シタグリプチンリン酸塩水和物", "yomi": "じゃぬびあじょうごじゅうみりぐらむ", "category": "DPP-4阻害薬", "standardDosage": "1回50mg 1日1回 (最大100mg/日)", "cautions": "SU薬やインスリン併用時の低血糖注意。eGFR 30-45: 25mg/日, eGFR<30: 12.5mg/日減量。", "icd10": "E11.9"},
    {"name": "メトグルコ錠250mg", "genericName": "メトホルミン塩酸塩", "yomi": "めとぐるこじょうにひゃくごじゅうみりぐらむ", "category": "ビグアナイド系血糖降下薬", "standardDosage": "初期1日500mg分2〜3、維持750〜1500mg/日 (最大2250mg/日)", "cautions": "重篤な腎機能障害(eGFR<30)、透析、肝障害、過度飲酒、高齢衰弱者禁忌（乳酸アシドーシス）。", "icd10": "E11.9"},
    {"name": "フェブキソスタット錠20mg", "genericName": "フェブキソスタット", "yomi": "ふぇぶきそすたっとじょうにじゅうみりぐらむ", "category": "尿酸降下薬", "standardDosage": "初期1回10mg 1日1回、段階的に40mg/日へ増量 (目標血清UA≦6.0 mg/dL)", "cautions": "アザチオプリン投与中禁忌。痛風発作期の新規開始は避ける（消炎後に少量開始）。", "icd10": "M10.9 / E79.0"},

    # 精神・神経・睡眠
    {"name": "デエビゴ錠5mg", "genericName": "レンボレキサント", "yomi": "でえびごじょうごみりぐらむ", "category": "オレキシン受容体拮抗薬", "standardDosage": "成人は1回5mg 就寝直前 (最大10mg/日)", "cautions": "CYP3A阻害薬併用時は最大2.5mg。入眠困難と中途覚醒双方に効果。依存性が極めて低い。", "icd10": "G47.0"},
    {"name": "ベルソムラ錠15mg", "genericName": "スボレキサント", "yomi": "べるそむらじょうじゅうごみりぐらむ", "category": "オレキシン受容体拮抗薬", "standardDosage": "成人は1回20mg、高齢者は1回15mg 就寝直前", "cautions": "悪夢や睡眠麻痺の報告あり。CYP3A阻害薬併用禁忌・注意。", "icd10": "G47.0"},
    {"name": "マイスリー錠5mg", "genericName": "ゾルピデム酒石酸塩", "yomi": "まいすりーじょうごみりぐらむ", "category": "非ベンゾジアゼピン系睡眠薬", "standardDosage": "1回5〜10mg 就寝直前 (高齢者初期2.5mg)", "cautions": "超短時間作用型。健忘、ふらつき、依存性。高齢者の転倒骨折リスクのため長期連用回避。", "icd10": "G47.0"},
    {"name": "リリカカプセル75mg", "genericName": "プレガバリン", "yomi": "りりかかぷせるななじゅうごみりぐらむ", "category": "神経障害性疼痛治療薬", "standardDosage": "初期1回75mg 1日2回より開始、1回150mg 1日2回へ増量", "cautions": "めまい、傾眠、体重増加、浮腫。腎機能に応じた用量調節が必須。急な中止による離脱注意。", "icd10": "M79.2 / B02.2 / G56.0"},
    {"name": "タリージェ錠5mg", "genericName": "ミロガバリンベシル酸塩", "yomi": "たりーじぇじょうごみりぐらむ", "category": "神経障害性疼痛治療薬", "standardDosage": "初期1回5mg 1日2回、1週間後1回10mg 1日2回、最大1回15mg 1日2回", "cautions": "めまい、傾眠注意。腎排泄型のため腎機能に応じた投与設計が必要。", "icd10": "M79.2 / M54.4"},

    # アレルギー・漢方
    {"name": "ビラノア錠20mg", "genericName": "ビラスチン", "yomi": "びらのあじょうにじゅうみりぐらむ", "category": "第2世代抗ヒスタミン薬", "standardDosage": "1回20mg 1日1回 空腹時（就寝前または食前1時間以上）投与", "cautions": "食後服用で効果大幅低下のため厳格な空腹時服用。眠気・インペアードパフォーマンス皆無。", "icd10": "J30.1 / L29.9 / L50.9"},
    {"name": "アレグラ錠60mg", "genericName": "フェキソフェナジン塩酸塩", "yomi": "あれぐらじょうろくじゅうみりぐらむ", "category": "第2世代抗ヒスタミン薬", "standardDosage": "1回60mg 1日2回 朝・夕", "cautions": "中枢移行性が低く眠気を生じない。水酸化Al・Mg含有制酸薬との併用で吸収低下。", "icd10": "J30.1 / L50.9"},
    {"name": "ツムラ葛根湯エキス顆粒", "genericName": "葛根湯", "yomi": "かっこんとう", "category": "漢方製剤 (1番)", "standardDosage": "1日7.5g 2〜3回 食前または食間", "cautions": "感冒初期（悪寒、無汗、項背部強ばり）。マオウ含有のため高血圧、心疾患、高齢者慎重投与。", "icd10": "J00"},
    {"name": "ツムラ芍薬甘草湯エキス顆粒", "genericName": "芍薬甘草湯", "yomi": "しゃくやくかんぞうとう", "category": "漢方製剤 (68番)", "standardDosage": "1回2.5g 屯用または1日5.0〜7.5g 2〜3回", "cautions": "こむら返り、胆石仙痛の即効寛解。甘草多量含有のため漫然長期連用は偽アルドステロン症注意。", "icd10": "R25.2 / M62.8"}
]

# 3. 代表的傷病名マスター
DISEASES_DATASET = [
    {"name": "急性上気道炎", "yomi": "きゅうせいききどうえん", "icd10": "J00", "category": "呼吸器", "tips": "かぜ症候群。原則抗菌薬不要。対症療法が基本。"},
    {"name": "急性咽頭炎", "yomi": "きゅうせいいんとうえん", "icd10": "J02.9", "category": "呼吸器", "tips": "Centorスコア3点以上で溶連菌迅速キット。陽性時アモキシシリン10日間。"},
    {"name": "急性気管支炎", "yomi": "きゅうせいきかんしえん", "icd10": "J20.9", "category": "呼吸器", "tips": "咳は2〜3週持続。健常成人のルーチン抗菌薬投与は非推奨。"},
    {"name": "市中肺炎", "yomi": "しちゅうはいえん", "icd10": "J18.9", "category": "呼吸器", "tips": "A-DROPスコアで重症度判定。外来第1選択は高用量アモキシシリン等。"},
    {"name": "気管支喘息", "yomi": "きかんしぜんそく", "icd10": "J45.9", "category": "呼吸器", "tips": "吸入ステロイド(ICS)が治療の基本骨格。発作時はSABA吸入。"},
    {"name": "慢性閉塞性肺疾患 (COPD)", "yomi": "まんせいへいそくせいはいしっかん", "icd10": "J44.9", "category": "呼吸器", "tips": "禁煙指導必須。LAMA/LABA吸入気管支拡張薬が基本。"},
    {"name": "本態性高血圧症", "yomi": "ほんたいせいこうけつあつしょう", "icd10": "I10", "category": "循環器", "tips": "生活習慣病管理料/特定疾患対象。目標130/80未満。Ca拮抗薬/ARBが第1選択。"},
    {"name": "２型糖尿病", "yomi": "にがたとうにょうびょう", "icd10": "E11.9", "category": "代謝", "tips": "HbA1c 7.0%未満目標。心血管・腎合併症リスク例にSGLT2阻害薬/GLP-1RA推奨。"},
    {"name": "脂質異常症", "yomi": "ししついじょうしょう", "icd10": "E78.5", "category": "代謝", "tips": "冠動脈疾患既往例はLDL<70mg/dLの厳格管理。スタチン第1選択。"},
    {"name": "高尿酸血症", "yomi": "こうにょうさんけっしょう", "icd10": "E79.0", "category": "代謝", "tips": "血清UA>7.0mg/dL。痛風発作予防に6.0以下維持。発作極期の新規開始厳禁。"},
    {"name": "痛風関節炎", "yomi": "つうふうかんせつえん", "icd10": "M10.9", "category": "リウマチ", "tips": "第1中足趾節関節に好発。発作時はNSAIDsパルス等で消炎最優先。"},
    {"name": "逆流性食道炎 (GERD)", "yomi": "ぎゃくりゅうせいしょくどうえん", "icd10": "K21.0", "category": "消化器", "tips": "初期治療P-CAB(タケキャブ)またはPPI 4〜8週。症状軽快後オンデマンド。"},
    {"name": "急性胃腸炎", "yomi": "きゅうせいいちょうえん", "icd10": "A09", "category": "消化器", "tips": "ノロ・ロタ・細菌性等。脱水補正と整腸剤。止瀉薬の漫然投与注意。"},
    {"name": "非弁膜症性心房細動", "yomi": "ひべんまくせいしんぼうさいどう", "icd10": "I48.9", "category": "循環器", "tips": "CHADS2スコア1点以上でDOAC適応。ワーファリンより頭蓋内出血リスク半減。"},
    {"name": "慢性心不全", "yomi": "まんせいしんふぜん", "icd10": "I50.9", "category": "循環器", "tips": "Fantastic 4 (ARNI/ACEi, β遮断薬, MRA, SGLT2i) の早期導入。BNPモニタリング。"},
    {"name": "慢性腎臓病 (CKD)", "yomi": "まんせいじんぞうびょう", "icd10": "N18.9", "category": "腎臓", "tips": "eGFR<60または尿蛋白持続。RAS阻害薬・SGLT2阻害薬による腎保護。"},
    {"name": "不眠症", "yomi": "ふみんしょう", "icd10": "G47.0", "category": "精神", "tips": "高齢者ベンゾ系長期連用は転倒・せん妄リスクのため非推奨。オレキシン拮抗薬優先。"},
    {"name": "緊張型頭痛", "yomi": "きんちょうがたずつう", "icd10": "G44.2", "category": "神経", "tips": "頭部締め付け感。筋緊張緩和、NSAIDs。薬物乱用頭痛に注意。"},
    {"name": "片頭痛", "yomi": "へんずつう", "icd10": "G43.9", "category": "神経", "tips": "拍動性・悪心・光過敏。発作時トリプタン系、予防にCGRP抗体やCa拮抗薬。"},
    {"name": "帯状疱疹", "yomi": "たいじょうほうしん", "icd10": "B02.9", "category": "皮膚科", "tips": "片側性有痛性小水疱。抗ヘルペスウイルス薬早期開始。帯状疱疹後神経痛(PHN)予防。"}
]

# 4. 【新規】臨床検査値マスター＆基準値・臨床的意義・パニック値 (Lab Tests)
LAB_TESTS_DATASET = [
    {
        "name": "HbA1c (NGSP)",
        "yomi": "えいちびーえーわんしー",
        "referenceRange": "4.9 〜 6.0 %",
        "panicValue": "≧ 10.0 % (高血糖クリーゼ・ケトアシドーシス警戒)",
        "category": "糖尿病・内分泌",
        "clinicalSignificance": "過去1〜2ヶ月間の平均血糖値を反映。合併症予防目標 < 7.0 %、強化療法目標 < 6.0 %、高齢者・低血糖リスク例 7.0〜8.0 %。",
        "soapTemplate": "HbA1c: 6.8% (血糖コントロール概ね良好、目標<7.0%維持)"
    },
    {
        "name": "eGFR (推算糸球体濾過量)",
        "yomi": "いーじーえふあーる",
        "referenceRange": "≧ 60 mL/min/1.73m²",
        "panicValue": "< 15 mL/min/1.73m² (末期腎不全・透析導入準備水準)",
        "category": "腎機能",
        "clinicalSignificance": "腎機能ステージ判定基準。G1(≧90), G2(60-89), G3a(45-59: 要注意), G3b(30-44: 薬剤減量必須), G4(15-29: 専門医紹介), G5(<15)。",
        "soapTemplate": "eGFR: 52 mL/min/1.73m² (CKD Stage G3a相当、脱水注意・腎排泄薬投与量確認)"
    },
    {
        "name": "血清クレアチニン (Cr)",
        "yomi": "けっせいくれあちにん",
        "referenceRange": "男性: 0.65〜1.07 mg/dL / 女性: 0.46〜0.79 mg/dL",
        "panicValue": "≧ 3.0 mg/dL または 前回比 1.5倍以上の急激な上昇 (AKI疑い)",
        "category": "腎機能",
        "clinicalSignificance": "筋肉量に依存するため高齢女性では見かけ上正常でも低eGFRの隠れCKDに留意。NSAIDs、RAS阻害薬開始後の急激な上昇に注意。",
        "soapTemplate": "Cr: 0.85 mg/dL (前回0.82と比し著変なし)"
    },
    {
        "name": "BNP (脳性ナトリウム利尿ペプチド)",
        "yomi": "びーえぬぴー",
        "referenceRange": "≦ 18.4 pg/mL",
        "panicValue": "≧ 500 pg/mL (急性非代償性心不全・緊急入院適応考慮)",
        "category": "循環器・心機能",
        "clinicalSignificance": "心室負荷・心筋壁進展で分泌。18.5〜40: 軽度負荷 / 40〜100: 心不全の可能性あり / 100〜200: 心不全精査推奨 / >200: 治療を要する心不全。",
        "soapTemplate": "BNP: 85 pg/mL (軽度心室負荷あり、下肢浮腫・胸部ラ音なし、水分塩分制限指導)"
    },
    {
        "name": "NT-proBNP",
        "yomi": "えぬてぃーぷろびーえぬぴー",
        "referenceRange": "≦ 125 pg/mL (75歳以上: ≦ 450 pg/mL)",
        "panicValue": "≧ 1,800 pg/mL (心不全急性増悪・入院考慮)",
        "category": "循環器・心機能",
        "clinicalSignificance": "腎排泄型のため腎機能低下例で高値を示す。半減期がBNPより長く血中濃度が安定。除外診断および治療効果判定に有用。",
        "soapTemplate": "NT-proBNP: 240 pg/mL (心機能定期フォロー)"
    },
    {
        "name": "CRP (C反応性蛋白)",
        "yomi": "しーあーるぴー",
        "referenceRange": "≦ 0.14 mg/dL",
        "panicValue": "≧ 10.0 mg/dL (重症細菌感染症・敗血症・広範組織壊死警戒)",
        "category": "炎症・感染症",
        "clinicalSignificance": "急性炎症マーカー。0.3〜1.0: 軽微炎症・ウイルス性 / 1.0〜5.0: 細菌感染・膠原病 / ≧10.0: 重症細菌性肺炎・敗血症・膿瘍。",
        "soapTemplate": "CRP: 0.35 mg/dL (軽度上昇、細菌性重症感染は否定的)"
    },
    {
        "name": "D-ダイマー",
        "yomi": "でぃーだいまー",
        "referenceRange": "≦ 1.0 μg/mL",
        "panicValue": "≧ 5.0 μg/mL (深部静脈血栓症(DVT)・肺塞栓症(PE)・DIC高リスク)",
        "category": "凝固・線溶系",
        "clinicalSignificance": "フィブリン分解産物。カットオフ <1.0 でDVT/PEを安全に除外。高齢者では年齢×0.01 (75歳なら <1.5) を臨床的目安とする。",
        "soapTemplate": "D-ダイマー: 0.6 μg/mL (下肢深部静脈血栓症・肺塞栓症は否定的)"
    },
    {
        "name": "AST (GOT) / ALT (GPT)",
        "yomi": "えーえすてぃー / えーえるてぃー",
        "referenceRange": "AST: 13〜30 U/L / ALT: 7〜23 (男〜30) U/L",
        "panicValue": "≧ 500 U/L (急性肝炎・劇症肝炎・虚血性肝障害・薬剤性肝障害)",
        "category": "肝胆道系",
        "clinicalSignificance": "ALT>AST: NAFLD/NASH、脂肪肝、ウイルス性慢性肝炎。AST>ALT: アルコール性肝障害、肝硬変、うっ血肝、心筋・骨格筋疾患。",
        "soapTemplate": "AST/ALT: 28/34 U/L (ALT軽度優位、脂肪肝疑い・食事運動指導継続)"
    },
    {
        "name": "γ-GTP",
        "yomi": "がんまじーてぃーぴー",
        "referenceRange": "男性: ≦ 50 U/L / 女性: ≦ 30 U/L",
        "panicValue": "≧ 300 U/L (総胆管結石・閉塞性黄疸・重度アルコール肝障害)",
        "category": "肝胆道系",
        "clinicalSignificance": "胆道系酵素およびアルコール感受性マーカー。ALP上昇を伴う場合は胆道閉塞や結石を強く疑う。薬剤性肝障害のモニタリングに必須。",
        "soapTemplate": "γ-GTP: 45 U/L (節酒効果あり、前回より改善)"
    },
    {
        "name": "LDLコレステロール (悪玉コレステロール)",
        "yomi": "えるでぃーえるこれすてろーる",
        "referenceRange": "60 〜 119 mg/dL",
        "panicValue": "≧ 180 mg/dL (家族性高コレステロール血症(FH)疑い)",
        "category": "脂質代謝",
        "clinicalSignificance": "動脈硬化性疾患予防ガイドライン目標値: 一次予防(低リスク<140, 中リスク<120, 高リスク<100)、二次予防(冠動脈疾患既往) <70 mg/dL。",
        "soapTemplate": "LDL-C: 98 mg/dL (冠動脈疾患高リスク群目標<100達成)"
    },
    {
        "name": "血清尿酸 (UA)",
        "yomi": "けっせいにょうさん",
        "referenceRange": "2.1 〜 7.0 mg/dL",
        "panicValue": "≧ 9.0 mg/dL (腎結石・痛風発作高頻度・尿細管閉塞警戒)",
        "category": "尿酸・代謝",
        "clinicalSignificance": ">7.0 mg/dLで高尿酸血症。痛風関節炎既往例では再発防止のため ≦ 6.0 mg/dL を維持目標とする。発作極期新規薬開始は禁忌。",
        "soapTemplate": "UA: 5.8 mg/dL (目標値≦6.0達成、フェブキソスタット継続)"
    },
    {
        "name": "TSH (甲状腺刺激ホルモン)",
        "yomi": "てぃーえすえいち",
        "referenceRange": "0.54 〜 4.54 μIU/mL",
        "panicValue": "< 0.01 (甲状腺中毒症/バセドウ) または > 20.0 (重症粘液水腫/甲状腺機能低下)",
        "category": "甲状腺・内分泌",
        "clinicalSignificance": "甲状腺機能の最も鋭敏なスクリーニング指標。TSH低値＋FT4高値＝機能亢進症。TSH高値＋FT4低値＝機能低下症（橋本病等）。",
        "soapTemplate": "TSH: 2.15 μIU/mL (正常範囲、甲状腺機能異常なし)"
    },
    {
        "name": "フェリチン (貯蔵鉄)",
        "yomi": "ふぇりちん",
        "referenceRange": "男性: 20〜250 ng/mL / 女性: 5〜120 ng/mL",
        "panicValue": "< 5.0 (高度鉄欠乏) または > 1,000 (ヘモクロマトーシス・成人スチル病)",
        "category": "血液・造血系",
        "clinicalSignificance": "体内貯蔵鉄の指標。<12〜20 ng/mL で潜在性鉄欠乏症。炎症・感染症・悪性腫瘍では急性期反応蛋白として偽高値を示すことに留意。",
        "soapTemplate": "フェリチン: 14 ng/mL (潜在性鉄欠乏あり、鉄剤補充を検討)"
    },
    {
        "name": "尿中微量アルブミン / Cr 比",
        "yomi": "にょうちゅうびりょうあるぶみんひ",
        "referenceRange": "< 30.0 mg/gCr (正常アルブミン尿)",
        "panicValue": "≧ 300.0 mg/gCr (顕性蛋白尿期・不可逆的腎硬化症進行期)",
        "category": "糖尿病性腎症",
        "clinicalSignificance": "30〜299 mg/gCr で早期糖尿病性腎症（第2期）。この段階での厳格血糖血圧管理とSGLT2阻害薬/ARB導入により正常化が可能。",
        "soapTemplate": "尿中アルブミン比: 48 mg/gCr (微量アルブミン尿期、RAS阻害・SGLT2阻害強化)"
    },
    {
        "name": "血清カリウム (K)",
        "yomi": "けっせいきりうむ",
        "referenceRange": "3.6 〜 5.0 mEq/L",
        "panicValue": "< 2.8 mEq/L (致死的不整脈・麻痺) または ≧ 6.0 mEq/L (心停止・心室細動)",
        "category": "電解質",
        "clinicalSignificance": "高K血症(>5.5): ARB/ACE阻害薬、MRA(スピロノラクトン)、CKDで頻発。テント状T波。低K血症(<3.5): 利尿薬、甘草連用（偽アルドステロン症）。",
        "soapTemplate": "K: 4.4 mEq/L (電解質安定、降圧薬継続可)"
    }
]

# 5. 【新規】外来診療行為・指導管理料・レセプト算定マスター (Procedures)
PROCEDURES_DATASET = [
    {
        "code": "B001-3",
        "name": "生活習慣病管理料(I)",
        "points": "月1回 610点〜760点 (包括検査あり)",
        "yomi": "せいかつしゅうかんびょうかんりりょういち",
        "category": "医学管理料",
        "targetDisease": "高血圧症、脂質異常症、糖尿病 (いずれかが主病)",
        "requirements": "療養計画書の作成、患者への説明、患者の署名受領（初回および計画変更時必須）。目標設定と食事・運動・服薬指導をカルテに要約記載。",
        "soapTemplate": "【医学管理】生活習慣病管理料(I) 算定。療養計画書作成・交付・患者同意取得。目標血圧<130/80、減塩6g/日および有酸素運動継続を指導。"
    },
    {
        "code": "B001-3-2",
        "name": "生活習慣病管理料(II)",
        "points": "月1回 333点 (検査は出来高算定)",
        "yomi": "せいかつしゅうかんびょうかんりりょうに",
        "category": "医学管理料",
        "targetDisease": "高血圧症、脂質異常症、糖尿病",
        "requirements": "包括検査なし。月1回の計画的療養指導および療養計画書の交付。血液検査等を出来高で併算定可能。主病名と指導内容をカルテ記載。",
        "soapTemplate": "【医学管理】生活習慣病管理料(II) 算定。生活習慣改善療養計画書を交付し服薬コンプライアンス良好を確認。"
    },
    {
        "code": "B000",
        "name": "特定疾患療養管理料",
        "points": "月2回まで 147点/回 (診療所)",
        "yomi": "とくていしっかんりょうようかんりりょう",
        "category": "医学管理料",
        "targetDisease": "高血圧・糖尿病・脂質異常症以外の特定疾患（慢性心不全、喘息、COPD、不整脈、脳血管障害等）",
        "requirements": "許可病床200床未満の病院または診療所。初診料算定月は算定不可。生活習慣病管理料との同月併算定不可。主病の治療方針要約記載。",
        "soapTemplate": "【医学管理】特定疾患療養管理料 算定。慢性心不全の服薬アドヒアランス指導および体重・浮腫モニタリング確認。"
    },
    {
        "code": "A000加算",
        "name": "外来感染対策向上加算",
        "points": "月1回 6点 (初診・再診時)",
        "yomi": "がいらいかんせんたいさくこうじょうかさん",
        "category": "初・再診加算",
        "targetDisease": "全患者 (届出施設)",
        "requirements": "院内感染管理者の配置、年2回以上の感染研修受講、抗菌薬適正使用の推進、拠点病院との連携カンファレンス参加。",
        "soapTemplate": "【加算】外来感染対策向上加算 算定。標準予防策実施。"
    },
    {
        "code": "A003",
        "name": "情報通信機器を用いた診療 (オンライン診療)",
        "points": "初診 251点 / 再診 73点",
        "yomi": "じょうほうつうしんききをもちいたしんりょう",
        "category": "初・再診料",
        "targetDisease": "オンライン診療指針に適合する病態",
        "requirements": "指針遵守。初診オンラインでは向精神薬・麻薬の処方厳禁。リアルタイム視覚・聴覚通信。対面診療が必要と判断した際の連携体制確保。",
        "soapTemplate": "【オンライン診療】情報通信機器を用いた診療 実施。ビデオ通話にて表情・バイタル確認。向精神薬処方なし。"
    },
    {
        "code": "F400加算",
        "name": "一般名処方加算1 / 加算2",
        "points": "加算1 (全品目一般名): 9点 / 加算2 (一部一般名): 7点",
        "yomi": "いっぱんめいしょほうかさん",
        "category": "処方料・処方箋料",
        "targetDisease": "処方箋交付時",
        "requirements": "後発医薬品が存在する先発医薬品について一般名（有効成分名）で処方箋発行。患者への後発医薬品推進の趣旨説明。",
        "soapTemplate": "【処方】一般名処方加算1 算定。全品目一般名にて院外処方箋交付。"
    },
    {
        "code": "D208",
        "name": "心電図検査 (12誘導心電図)",
        "points": "130点",
        "yomi": "しんでんずけんさ",
        "category": "生理機能検査",
        "targetDisease": "不整脈疑い、虚血性心疾患、高血圧、胸痛、動悸、健診異常",
        "requirements": "安静時12誘導心電図記録。波形記録と医師の診断所見（洞調律、ST-T変化なし等）のカルテ記載必須。",
        "soapTemplate": "【検査】12誘導心電図 実施: HR 68bpm, Regular sinus rhythm. 有意なST-T変化・異常Q波なし。"
    },
    {
        "code": "D215",
        "name": "超音波検査 (腹部エコー)",
        "points": "530点",
        "yomi": "ちょうおんぱけんさふくぶ",
        "category": "超音波検査",
        "targetDisease": "肝胆膵・脾腎・消化管疾患疑い",
        "requirements": "走査範囲・観察臓器ごとの所見記録。画像保存と診断所見（脂肪肝、胆石有無、肝内占拠病変の有無等）の記載。",
        "soapTemplate": "【検査】腹部超音波検査 実施: 肝表面平滑、軽度明度亢進(脂肪肝)、胆嚢結石・ポリープなし、膵・脾・両腎に異常なし。"
    },
    {
        "code": "D215-2",
        "name": "超音波検査 (心臓エコー)",
        "points": "880点",
        "yomi": "ちょうおんぱけんさしんぞう",
        "category": "超音波検査",
        "targetDisease": "心不全、弁膜症、心肥大、心雑音、動悸",
        "requirements": "左室駆出率(LVEF)、左室内径、心室中隔壁厚、弁膜症重症度(逆流・狭窄)の計測および画像記録。",
        "soapTemplate": "【検査】心臓超音波検査 実施: LVEF 62%, 左室壁運動異常なし, 有意な弁膜症逆流なし, 心嚢液貯留なし。"
    },
    {
        "code": "J000",
        "name": "創傷処置 (100cm²未満)",
        "points": "52点",
        "yomi": "そうしょうしょち",
        "category": "処置",
        "targetDisease": "切創、挫創、擦過傷、熱傷、皮膚潰瘍",
        "requirements": "創傷部位、面積、処置内容（生理食塩水洗浄、外用剤塗布、被覆材保護）のカルテ記載。",
        "soapTemplate": "【処置】創傷処置 実施: 生理食塩水にて十分に創部洗浄、モイストヒーリング被覆材貼付。"
    },
    {
        "code": "G000",
        "name": "関節腔内注射",
        "points": "80点 (手技料、薬剤料別途)",
        "yomi": "かんせつくうないちゅうしゃ",
        "category": "注射",
        "targetDisease": "変形性膝関節症、関節リウマチ、肩関節周囲炎",
        "requirements": "穿刺関節部位、穿刺液性状（関節液排液量等）、注入薬剤名（ヒアルロン酸等）のカルテ記載。",
        "soapTemplate": "【注射】右膝関節腔内注射 実施: 局所消毒後、ヒアルロン酸Na注25mgを関節腔内へ確実に注入。合併症なし。"
    }
]

# 6. 【新規】腎機能別(eGFR/CrCl) 主要薬剤 投与量・減量・禁忌マスター (Renal Dose)
RENAL_DOSE_DATASET = [
    {
        "drugName": "リクシアナ (エドキサバン)",
        "standardDose": "60mg 1日1回",
        "category": "DOAC (抗凝固薬)",
        "cutoffs": [
            {"range": "CrCl > 50 mL/min", "dose": "60mg 1日1回 (体重>60kg)"},
            {"range": "CrCl 15 〜 50 mL/min", "dose": "30mg 1日1回 (減量基準合致)"},
            {"range": "CrCl < 15 mL/min", "dose": "禁忌 (透析患者含む)"}
        ],
        "clinicalTip": "体重≦60kgまたは併用P-gp阻害薬がある場合も30mgに減量。CrCl≧95では虚血性脳卒中相対リスク上昇に留意。"
    },
    {
        "drugName": "エリキュース (アピキサバン)",
        "standardDose": "5mg 1日2回",
        "category": "DOAC (抗凝固薬)",
        "cutoffs": [
            {"range": "通常腎機能", "dose": "5mg 1日2回"},
            {"range": "減量基準2項目以上該当時", "dose": "2.5mg 1日2回 (基準: 年齢≧80、体重≦60kg、Cr≧1.5のうち2つ)"},
            {"range": "CrCl < 15 mL/min", "dose": "禁忌"}
        ],
        "clinicalTip": "腎機能単独ではなく「年齢・体重・血清Cr」の3要素中2要素合致で減量する独特のクライテリアに注意。"
    },
    {
        "drugName": "イグザレルト (リバーロキサバン)",
        "standardDose": "15mg 1日1回",
        "category": "DOAC (抗凝固薬)",
        "cutoffs": [
            {"range": "CrCl ≧ 50 mL/min", "dose": "15mg 1日1回 食直後"},
            {"range": "CrCl 15 〜 49 mL/min", "dose": "10mg 1日1回 食直後 (減量)"},
            {"range": "CrCl < 15 mL/min", "dose": "禁忌"}
        ],
        "clinicalTip": "生物学的利用能を高めるため必ず「食直後」に服用するよう患者指導を実施。"
    },
    {
        "drugName": "メトグルコ (メトホルミン)",
        "standardDose": "500 〜 1500mg/日 (最大2250mg)",
        "category": "ビグアナイド系血糖降下薬",
        "cutoffs": [
            {"range": "eGFR ≧ 60 mL/min", "dose": "通常用量 (最大2250mg/日)"},
            {"range": "eGFR 45 〜 59 mL/min", "dose": "最高用量 1500mg/日 まで減量"},
            {"range": "eGFR 30 〜 44 mL/min", "dose": "最高用量 750mg/日 まで減量"},
            {"range": "eGFR < 30 mL/min", "dose": "禁忌 (重篤な乳酸アシドーシス発症リスク)"}
        ],
        "clinicalTip": "ヨード造影剤検査前後は一時休薬（検査前48時間〜検査後48時間）。脱水・過度アルコール摂取時も休薬。"
    },
    {
        "drugName": "フォシーガ (ダパグリフロジン)",
        "standardDose": "5mg 〜 10mg 1日1回",
        "category": "SGLT2阻害薬",
        "cutoffs": [
            {"range": "eGFR ≧ 45 mL/min", "dose": "5mg 〜 10mg 1日1回 (2型糖尿病/心不全/CKD)"},
            {"range": "eGFR 25 〜 44 mL/min", "dose": "心不全・CKD目的で継続可能 (血糖降下作用は減弱)"},
            {"range": "eGFR < 20 〜 25 mL/min", "dose": "新規投与開始は非推奨 (透析患者は禁忌)"}
        ],
        "clinicalTip": "腎機能低下例でも心不全・腎保護エビデンスあり。シックデイ時は脱水・ケトアシドーシス防止のため休薬。"
    },
    {
        "drugName": "ジャヌビア (シタグリプチン)",
        "standardDose": "50mg 1日1回",
        "category": "DPP-4阻害薬",
        "cutoffs": [
            {"range": "eGFR ≧ 45 mL/min", "dose": "50mg 1日1回 (効果不十分時最大100mg)"},
            {"range": "eGFR 30 〜 44 mL/min", "dose": "25mg 1日1回 (半量に減量)"},
            {"range": "eGFR < 30 mL/min / 透析", "dose": "12.5mg 1日1回 (1/4量に減量)"}
        ],
        "clinicalTip": "腎排泄型DPP-4阻害薬。腎機能低下例で減量を怠ると低血糖リスク増大。トラゼンタは減量不要。"
    },
    {
        "drugName": "トラゼンタ (リナグリプチン)",
        "standardDose": "5mg 1日1回",
        "category": "DPP-4阻害薬",
        "cutoffs": [
            {"range": "すべての腎機能・透析患者", "dose": "5mg 1日1回 (減量不要)"}
        ],
        "clinicalTip": "胆汁・糞中排泄型のため、eGFR低下例や血液透析患者でも投与量調節なしに安全に使用可能。"
    },
    {
        "drugName": "フェブキソスタット (フェブリク)",
        "standardDose": "10mg 〜 40mg 1日1回",
        "category": "尿酸降下薬",
        "cutoffs": [
            {"range": "eGFR ≧ 30 mL/min", "dose": "通常用量 (減量不要、最大60mg)"},
            {"range": "eGFR < 30 mL/min / 透析", "dose": "慎重投与 (少量から開始、過度な低下注意)"}
        ],
        "clinicalTip": "アロプリノールと異なり腎排泄依存度が低いため中等度CKD合併痛風患者で第一選択となる。"
    },
    {
        "drugName": "バルトレックス (バラシクロビル)",
        "standardDose": "1回500mg 1日2回 (単純疱疹) / 1回1000mg 1日3回 (帯状疱疹)",
        "category": "抗ヘルペスウイルス薬",
        "cutoffs": [
            {"range": "CrCl ≧ 50 mL/min", "dose": "通常用量"},
            {"range": "CrCl 30 〜 49 mL/min", "dose": "帯状疱疹: 1回1000mg 1日2回"},
            {"range": "CrCl 10 〜 29 mL/min", "dose": "帯状疱疹: 1回1000mg 1日1回 (大幅減量)"},
            {"range": "CrCl < 10 mL/min", "dose": "帯状疱疹: 1回500mg 1日1回"}
        ],
        "clinicalTip": "減量を怠ると高濃度の活性体により重篤なアシクロビル脳症（意識障害・幻覚・ミオクローヌス）を発症。高齢者で特に頻発。"
    },
    {
        "drugName": "クラリス (クラリスロマイシン)",
        "standardDose": "1回200mg 1日2回",
        "category": "マクロライド系抗菌薬",
        "cutoffs": [
            {"range": "CrCl ≧ 30 mL/min", "dose": "通常用量 (1回200mg 1日2回)"},
            {"range": "CrCl < 30 mL/min", "dose": "1回200mg 1日1回 (半量に減量)"}
        ],
        "clinicalTip": "重度腎障害時は血中濃度が著明に上昇しQT延長や消化器症状が悪化するため半量投与を厳守。"
    }
]

# TypeScript ファイル構築
ts_content = f"""/**
 * DrVoice どんぐり君！ 統合臨床ナレッジカタログ (v2.3.0)
 * 難読単漢字を完全撤廃し、医師の電子カルテ作成・臨床判断に真に必要な6大マスターを統合
 * 
 * 収録マスター:
 * 1. Minds診療ガイドライン CQ: {len(minds_catalog)} 件 (全111疾患・CQ完全網羅)
 * 2. 主要処方薬・医薬品マスター: {len(DRUGS_DATASET)} 件
 * 3. 保険病名・傷病名マスター: {len(DISEASES_DATASET)} 件
 * 4. 臨床検査値・基準値・パニック値マスター: {len(LAB_TESTS_DATASET)} 件
 * 5. 診療行為・指導料・レセプト要件マスター: {len(PROCEDURES_DATASET)} 件
 * 6. 腎機能別(eGFR/CrCl) 投与量・減量・禁忌マスター: {len(RENAL_DOSE_DATASET)} 件
 * 
 * 自動生成スクリプト: scripts/generate_medical_search_catalog.py
 */

export interface MindsKnowledgeItem {{
  id: string;
  icd10: string;
  diseaseName: string;
  category: string;
  cqNum: number;
  cqTitle: string;
  strength: number; // 1:強く推奨, 2:弱く推奨, 3:弱く非推奨, 4:強く非推奨
  evidenceLevel: number; // 1:質A, 2:質B, 3:質C, 4:質D
  recommendation: string;
  detail: {{
    background: string;
    rational: string;
    practiceTip: string;
    guidelineTitle: string;
    society: string;
  }};
}}

export interface DrugKnowledgeItem {{
  name: string;
  genericName: string;
  yomi: string;
  category: string;
  standardDosage: string;
  cautions: string;
  icd10: string;
}}

export interface DiseaseKnowledgeItem {{
  name: string;
  yomi: string;
  icd10: string;
  category: string;
  tips: string;
}}

export interface LabTestKnowledgeItem {{
  name: string;
  yomi: string;
  referenceRange: string;
  panicValue: string;
  category: string;
  clinicalSignificance: string;
  soapTemplate: string;
}}

export interface ProcedureKnowledgeItem {{
  code: string;
  name: string;
  points: string;
  yomi: string;
  category: string;
  targetDisease: string;
  requirements: string;
  soapTemplate: string;
}}

export interface RenalDoseKnowledgeItem {{
  drugName: string;
  standardDose: string;
  category: string;
  cutoffs: Array<{{ range: string; dose: string }}>;
  clinicalTip: string;
}}

export type MedicalSearchItemType = 'minds' | 'drug' | 'disease' | 'lab' | 'proc' | 'renal';

export interface UnifiedMedicalSearchResult {{
  type: MedicalSearchItemType;
  title: string;
  subtitle: string;
  codeOrAttr: string;
  category: string;
  content: string;
  extraInfo?: string;
  mindsData?: MindsKnowledgeItem;
  drugData?: DrugKnowledgeItem;
  diseaseData?: DiseaseKnowledgeItem;
  labData?: LabTestKnowledgeItem;
  procData?: ProcedureKnowledgeItem;
  renalData?: RenalDoseKnowledgeItem;
}}

export const MINDS_KNOWLEDGE_CATALOG: MindsKnowledgeItem[] = {json.dumps(minds_catalog, ensure_ascii=False, indent=2)};

export const DRUGS_CATALOG: DrugKnowledgeItem[] = {json.dumps(DRUGS_DATASET, ensure_ascii=False, indent=2)};

export const DISEASES_CATALOG: DiseaseKnowledgeItem[] = {json.dumps(DISEASES_DATASET, ensure_ascii=False, indent=2)};

export const LAB_TESTS_CATALOG: LabTestKnowledgeItem[] = {json.dumps(LAB_TESTS_DATASET, ensure_ascii=False, indent=2)};

export const PROCEDURES_CATALOG: ProcedureKnowledgeItem[] = {json.dumps(PROCEDURES_DATASET, ensure_ascii=False, indent=2)};

export const RENAL_DOSE_CATALOG: RenalDoseKnowledgeItem[] = {json.dumps(RENAL_DOSE_DATASET, ensure_ascii=False, indent=2)};

/**
 * 統合医療データ インクリメンタルキーワード検索エンジン
 */
export function searchUnifiedMedicalKnowledge(
  query: string,
  filterType: 'all' | 'minds' | 'drug' | 'disease' | 'lab' | 'proc' | 'renal' = 'all',
  limit: number = 30
): UnifiedMedicalSearchResult[] {{
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const results: UnifiedMedicalSearchResult[] = [];

  // 1. Minds ガイドライン
  if (filterType === 'all' || filterType === 'minds') {{
    for (const item of MINDS_KNOWLEDGE_CATALOG) {{
      const match =
        item.diseaseName.toLowerCase().includes(q) ||
        item.icd10.toLowerCase().includes(q) ||
        item.cqTitle.toLowerCase().includes(q) ||
        item.recommendation.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.detail.practiceTip.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'minds',
          title: `[Minds] ${{item.diseaseName}} CQ${{item.cqNum}}`,
          subtitle: item.cqTitle,
          codeOrAttr: `ICD-10: ${{item.icd10}} | 推奨度: ${{item.strength === 1 ? '強く推奨' : item.strength === 2 ? '弱く推奨' : item.strength === 3 ? '弱く非推奨' : '強く非推奨'}} (質${{item.evidenceLevel === 1 ? 'A' : item.evidenceLevel === 2 ? 'B' : item.evidenceLevel === 3 ? 'C' : 'D'}})`,
          category: item.category,
          content: item.recommendation,
          extraInfo: item.detail.practiceTip,
          mindsData: item,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  // 2. 医薬品情報
  if (filterType === 'all' || filterType === 'drug') {{
    for (const d of DRUGS_CATALOG) {{
      const match =
        d.name.toLowerCase().includes(q) ||
        d.genericName.toLowerCase().includes(q) ||
        d.yomi.includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.cautions.toLowerCase().includes(q) ||
        d.icd10.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'drug',
          title: `[医薬品] ${{d.name}}`,
          subtitle: `一般名: ${{d.genericName}} (${{d.yomi}})`,
          codeOrAttr: `${{d.category}} | ${{d.standardDosage}}`,
          category: d.category,
          content: d.cautions,
          extraInfo: `標準用法: ${{d.standardDosage}}`,
          drugData: d,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  // 3. 傷病名マスター
  if (filterType === 'all' || filterType === 'disease') {{
    for (const dis of DISEASES_CATALOG) {{
      const match =
        dis.name.toLowerCase().includes(q) ||
        dis.yomi.includes(q) ||
        dis.icd10.toLowerCase().includes(q) ||
        dis.category.toLowerCase().includes(q) ||
        dis.tips.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'disease',
          title: `[傷病名] ${{dis.name}}`,
          subtitle: `ICD-10: ${{dis.icd10}} (${{dis.yomi}})`,
          codeOrAttr: `診療科: ${{dis.category}}`,
          category: dis.category,
          content: dis.tips,
          diseaseData: dis,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  // 4. 臨床検査値・基準値マスター (新規)
  if (filterType === 'all' || filterType === 'lab') {{
    for (const lab of LAB_TESTS_CATALOG) {{
      const match =
        lab.name.toLowerCase().includes(q) ||
        lab.yomi.includes(q) ||
        lab.category.toLowerCase().includes(q) ||
        lab.referenceRange.toLowerCase().includes(q) ||
        lab.clinicalSignificance.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'lab',
          title: `[検査値] ${{lab.name}}`,
          subtitle: `基準値: ${{lab.referenceRange}} | パニック値: ${{lab.panicValue}}`,
          codeOrAttr: `${{lab.category}}`,
          category: lab.category,
          content: lab.clinicalSignificance,
          extraInfo: `カルテ定型文: ${{lab.soapTemplate}}`,
          labData: lab,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  // 5. 診療行為・指導料マスター (新規)
  if (filterType === 'all' || filterType === 'proc') {{
    for (const proc of PROCEDURES_CATALOG) {{
      const match =
        proc.name.toLowerCase().includes(q) ||
        proc.code.toLowerCase().includes(q) ||
        proc.yomi.includes(q) ||
        proc.category.toLowerCase().includes(q) ||
        proc.targetDisease.toLowerCase().includes(q) ||
        proc.requirements.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'proc',
          title: `[診療行為] ${{proc.name}} (${{proc.points}})`,
          subtitle: `区分: ${{proc.code}} | 対象: ${{proc.targetDisease}}`,
          codeOrAttr: `${{proc.category}}`,
          category: proc.category,
          content: proc.requirements,
          extraInfo: `カルテ記載例: ${{proc.soapTemplate}}`,
          procData: proc,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  // 6. 腎機能別(eGFR/CrCl) 投与設計マスター (新規)
  if (filterType === 'all' || filterType === 'renal') {{
    for (const ren of RENAL_DOSE_CATALOG) {{
      const cutoffsText = ren.cutoffs.map((c) => `${{c.range}}: ${{c.dose}}`).join(' / ');
      const match =
        ren.drugName.toLowerCase().includes(q) ||
        ren.category.toLowerCase().includes(q) ||
        ren.clinicalTip.toLowerCase().includes(q) ||
        cutoffsText.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'renal',
          title: `[腎機能減量] ${{ren.drugName}}`,
          subtitle: `標準量: ${{ren.standardDose}} (${{ren.category}})`,
          codeOrAttr: `eGFR/CrCl投与設計`,
          category: ren.category,
          content: cutoffsText,
          extraInfo: `臨床ポイント: ${{ren.clinicalTip}}`,
          renalData: ren,
        }});
        if (results.length >= limit) return results;
      }}
    }}
  }}

  return results;
}}
"""

with open(OUTPUT_TS_PATH, "w", encoding="utf-8") as f:
    f.write(ts_content)

print(f"Generated {OUTPUT_TS_PATH} successfully! Size: {os.path.getsize(OUTPUT_TS_PATH)} bytes")
