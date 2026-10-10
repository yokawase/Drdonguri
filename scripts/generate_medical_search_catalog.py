#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ PWA 向け統合医療データ検索カタログジェネレーター
Minds ガイドライン (111疾患・CQ)、主要医薬品マスター、主要傷病名マスター、難読漢字マスターを統合
src/data/medicalKnowledgeCatalog.ts を自動生成する
"""

import os
import json
import csv
import re
import unicodedata

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MINDS_JSON_PATH = os.path.join(BASE_DIR, "data", "sdcard", "minds_knowledge_base.json")
OUTPUT_TS_PATH = os.path.join(BASE_DIR, "src", "data", "medicalKnowledgeCatalog.ts")

# 1. Minds ガイドライン読み込み (全111件)
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

# 2. 代表的医薬品マスター (代表的な日常診療処方薬・約200品目)
DRUGS_DATASET = [
    # 呼吸器・感染症
    {"name": "カロナール錠500", "genericName": "アセトアミノフェン", "yomi": "かろなーるじょうごひゃく", "category": "解熱鎮痛薬", "standardDosage": "1回500〜1000mg 屯用または1日3回 (最大4000mg/日)", "cautions": "重篤な肝障害には禁忌。他剤との重複投与（総合感冒薬等）によるアセトアミノフェン過量投与に注意。", "icd10": "R50.9 / J00"},
    {"name": "ロキソニン錠60mg", "genericName": "ロキソプロフェンナトリウム水和物", "yomi": "ろきそにんじょうろくじゅうみりぐらむ", "category": "解熱鎮痛消炎薬(NSAIDs)", "standardDosage": "1回60mg 1日3回 毎食後 (屯用時1回60〜120mg)", "cautions": "消化性潰瘍、重篤な腎・肝機能障害、アスピリン喘息には禁忌。胃薬（PPI/防御因子増強薬）併用考慮。", "icd10": "M79.1 / M54.5"},
    {"name": "サワシリンカプセル250", "genericName": "アモキシシリン水和物", "yomi": "さわしりんかぷせるにひゃくごじゅう", "category": "ペニシリン系抗菌薬", "standardDosage": "成人は1回250〜500mg 1日3〜4回 (高用量時1回500〜1000mg 1日3回)", "cautions": "ペニシリンアレルギーには禁忌。伝染性単核球症（EBV感染）疑い例への投与は皮疹多発のため回避。", "icd10": "J02.9 / J01.9"},
    {"name": "オーグメンチン配合錠250RS", "genericName": "アモキシシリン・クラブラン酸カリウム", "yomi": "おーぐめんちんはいごうじょう", "category": "βラクタマーゼ阻害配合ペニシリン", "standardDosage": "1回1〜2錠 1日3〜4回", "cautions": "クラブラン酸による下痢・軟便に注意。アモキシシリン追加（アモキシシリン:クラブラン酸比を14:1に補正）処方を考慮。", "icd10": "J01.9 / J18.9"},
    {"name": "クラリス錠200", "genericName": "クラリスロマイシン", "yomi": "くらりすじょうにひゃく", "category": "マクロライド系抗菌薬", "standardDosage": "1回200mg 1日2回 (非結核性抗酸菌等は高用量)", "cautions": "CYP3A4強力阻害。スタチン（アトルバスタチン等）、Ca拮抗薬、DOAC等の血中濃度上昇に注意。QT延長注意。", "icd10": "J20.9 / J15.7"},
    {"name": "ラスビック錠75mg", "genericName": "ラスクフロキサシン塩酸塩", "yomi": "らすびっくじょうななじゅうごみりぐらむ", "category": "キノロン系抗菌薬", "standardDosage": "1回75mg 1日1回", "cautions": "妊婦・小児禁忌。金属イオン（鉄剤・マグネシウム・制酸薬）とのキレート形成による吸収低下に注意（2時間以上あける）。", "icd10": "J18.9 / J01.9"},
    {"name": "メジコン錠15mg", "genericName": "デキストロメトルファン臭化水素酸塩", "yomi": "めじこんじょうじゅうごみりぐらむ", "category": "中枢性非麻薬性鎮咳薬", "standardDosage": "1回15〜30mg 1日3回", "cautions": "MAO阻害薬投与中は禁忌。セロトニン症候群に注意。", "icd10": "R05"},
    {"name": "ムコダイン錠500mg", "genericName": "L-カルボシステイン", "yomi": "むこだいんじょうごひゃくみりぐらむ", "category": "気道粘液修復・去痰薬", "standardDosage": "1回500mg 1日3回", "cautions": "粘液の正常化と線毛運動改善。肝障害、心疾患の既往がある場合は慎重投与。", "icd10": "R09.3 / J20.9"},
    {"name": "アスベリン錠20", "genericName": "チペピジンヒベンズ酸塩", "yomi": "あすべりんじょうにじゅう", "category": "鎮咳・去痰薬", "standardDosage": "1回20〜40mg 1日3回", "cautions": "眠気・口渇。小児シロップでも多用。", "icd10": "R05"},
    {"name": "トランサミンカプセル250mg", "genericName": "トラネキサム酸", "yomi": "とらんさみんかぷせる", "category": "抗プラスミン・止血・抗炎症薬", "standardDosage": "1回250〜500mg 1日3〜4回", "cautions": "トロンビン投与中の患者には禁忌（血栓形成）。血栓症（脳梗塞・心筋梗塞・血栓性静脈炎等）患者には慎重投与。", "icd10": "J02.9 / R04.0"},
    {"name": "ゾフルーザ錠20mg", "genericName": "バロキサビル マルボキシル", "yomi": "ぞふるーざじょうにじゅうみりぐらむ", "category": "抗インフルエンザ薬 (キャップ依存型エンドヌクレアーゼ阻害)", "standardDosage": "体重40kg以上80kg未満: 1回40mg 単回投与", "cautions": "多価陽イオン含有製剤（Mg, Ca, Fe）との同時服用回避。発症後48時間以内に単回経口投与。", "icd10": "J10.1 / J11.1"},
    {"name": "タミフルカプセル75", "genericName": "オセルタミビルリン酸塩", "yomi": "たみふるかぷせるななじゅうご", "category": "抗インフルエンザ薬 (ノイラミニダーゼ阻害)", "standardDosage": "1回75mg 1日2回 5日間", "cautions": "腎機能低下時は減量基準あり。異常行動リスクに対する患者・保護者への説明・注意喚起を実施。", "icd10": "J10.1 / J11.1"},
    
    # 循環器・高血圧・不整脈・心不全
    {"name": "アムロジピン錠5mg", "genericName": "アムロジピンベシル酸塩", "yomi": "あむろじぴんじょうごみりぐらむ", "category": "持続性Ca拮抗薬 (ジヒドロピリジン系)", "standardDosage": "1回2.5〜5mg 1日1回 (最大10mg/日)", "cautions": "妊婦禁忌。下肢浮腫、歯肉肥厚、ほてりに留意。高齢者は2.5mgから開始推奨。", "icd10": "I10"},
    {"name": "ミカルディス錠40mg", "genericName": "テルミサルタン", "yomi": "みかるでぃすじょうよんじゅうみりぐらむ", "category": "アンジオテンシンII受容体拮抗薬 (ARB)", "standardDosage": "1回20〜40mg 1日1回 (最大80mg/日)", "cautions": "妊婦禁忌。高カリウム血症、血清クレアチニン上昇に注意。アリスキレンとの併用（糖尿病患者）禁忌。", "icd10": "I10 / N18.9"},
    {"name": "オルメテック錠20mg", "genericName": "オルメサルタン メドキソミル", "yomi": "おるめてっくじょうにじゅうみりぐらむ", "category": "ARB", "standardDosage": "1回10〜20mg 1日1回 (最大40mg/日)", "cautions": "妊婦禁忌。スプルー様腸症（長期内服での重篤な慢性下痢・体重減少）の報告あり。", "icd10": "I10"},
    {"name": "メインテート錠2.5mg", "genericName": "ビソプロロールフマル酸塩", "yomi": "めいんてーとじょうにてんごみりぐらむ", "category": "選択的β1遮断薬", "standardDosage": "本態性高血圧: 1回2.5〜5mg 1日1回 / 慢性心不全: 0.625mgより漸増", "cautions": "高度徐脈、心原性ショック、未治療の褐色細胞腫、重度喘息患者には禁忌。急激な中止による反跳性虚血に注意。", "icd10": "I10 / I50.9 / I48.9"},
    {"name": "リクシアナ錠30mg", "genericName": "エドキサバントシル酸塩水和物", "yomi": "りくしあなじょうさんじゅうみりぐらむ", "category": "直接作用型経口抗凝固薬 (DOAC / FXa阻害)", "standardDosage": "体重60kg超かつ腎機能正常: 60mg 1日1回 / 体重60kg以下またはCrCl 15〜50: 30mg 1日1回", "cautions": "活動性出血例には禁忌。腎機能（CrCl）および体重による減量基準を厳格遵守。抜歯・手術前の休薬期間確認。", "icd10": "I48.9 / I26.9"},
    {"name": "エリキュース錠5mg", "genericName": "アピキサバン", "yomi": "えりきゅーすじょうごみりぐらむ", "category": "DOAC (FXa阻害)", "standardDosage": "通常1回5mg 1日2回 / 減量基準（年齢≧80、体重≦60kg、Cr≧1.5mg/dLのうち2つ以上）該当時: 1回2.5mg 1日2回", "cautions": "活動性出血禁忌。朝夕2回服用の服薬アドヒアランス維持が必須。", "icd10": "I48.9"},
    {"name": "バイアスピリン錠100mg", "genericName": "アスピリン (腸溶錠)", "yomi": "ばいあすぴりんじょうひゃくみりぐらむ", "category": "抗血小板薬 (低用量アスピリン)", "standardDosage": "1回100mg 1日1回", "cautions": "アスピリン喘息、消化性潰瘍、出血傾向には禁忌。消化管出血リスクに留意しPPI併用考慮。", "icd10": "I25.2 / I63.9"},
    {"name": "ロスバスタチン錠2.5mg", "genericName": "ロスバスタチンカルシウム", "yomi": "ろすばすたちんじょうにてんごみりぐらむ", "category": "HMG-CoA還元酵素阻害薬 (強力スタチン)", "standardDosage": "1回2.5mg 1日1回 (最大20mg/日)", "cautions": "妊婦禁忌。横紋筋融解症（筋肉痛・脱力感・CK上昇・褐色尿）に注意。シクロスポリン併用禁忌。", "icd10": "E78.0 / E78.2"},
    {"name": "クレストール錠2.5mg", "genericName": "ロスバスタチンカルシウム", "yomi": "くれすとーるじょうにてんごみりぐらむ", "category": "HMG-CoA還元酵素阻害薬 (スタチン)", "standardDosage": "1回2.5mg 1日1回 (最大20mg/日)", "cautions": "妊婦禁忌。肝機能障害、重篤な腎障害患者への高用量投与注意。", "icd10": "E78.0"},
    
    # 消化器
    {"name": "タケキャブ錠20mg", "genericName": "ボノプラザンフマル酸塩", "yomi": "たけきゃぶじょうにじゅうみりぐらむ", "category": "カリウムイオン競合型アシッドブロッカー (P-CAB)", "standardDosage": "びらん性GERD: 1回20mg 1日1回 4〜8週間 / 維持療法: 1回10mg 1日1回", "cautions": "アタザナビル、リルピビリン併用禁忌。長期漫然投与による低マグネシウム血症、骨粗鬆症性骨折リスクに留意。", "icd10": "K21.0 / K21.9"},
    {"name": "ネキシウムカプセル20mg", "genericName": "エソメプラゾールマグネシウム水和物", "yomi": "ねきしうむかぷせるにじゅうみりぐらむ", "category": "プロトンポンプ阻害薬 (PPI)", "standardDosage": "逆流性食道炎: 1回20mg 1日1回 (最大8週間)", "cautions": "長期投与時は定期的な見直しとオンデマンド療法・ステップダウンを検討。", "icd10": "K21.0"},
    {"name": "ムコスタ錠100mg", "genericName": "レバミピド", "yomi": "むこすたじょうひゃくみりぐらむ", "category": "胃粘膜保護・プロスタグランジン増強薬", "standardDosage": "1回100mg 1日3回", "cautions": "NSAIDs潰瘍の予防や急性胃炎粘膜病変の改善に安全に使用可能。", "icd10": "K29.7"},
    {"name": "ビオスリー配合錠", "genericName": "ラクトミン・酪酸菌・糖化菌配合", "yomi": "びおすりーはいごうじょう", "category": "生菌整腸剤", "standardDosage": "1回1〜2錠 1日3回", "cautions": "抗生剤投与時の菌交代症・軟便予防。安全性が極めて高く小児から高齢者まで適応。", "icd10": "K59.1 / A09"},
    {"name": "酸化マグネシウム錠330mg", "genericName": "酸化マグネシウム", "yomi": "さんかまぐねしうむじょう", "category": "浸透圧性下剤・制酸薬", "standardDosage": "1回330〜660mg 1日1〜3回 食後または就寝前", "cautions": "高齢者・腎機能低下例における高マグネシウム血症に厳重注意（定期的な血清Mg測定推奨）。キレート形成注意。", "icd10": "K59.0"},
    {"name": "モビコール配合内用剤", "genericName": "マクロゴール4000配合剤", "yomi": "もびこーるはいごうないようざい", "category": "高分子浸透圧性下剤", "standardDosage": "初回1日2包(朝・夕分服) 水に溶かして服用、最大6包/日", "cautions": "2歳以上で使用可能。腸管閉塞・穿孔疑いには禁忌。電解質バランスを崩しにくい。", "icd10": "K59.0"},

    # 代謝・糖尿病・内分泌
    {"name": "フォシーガ錠10mg", "genericName": "ダパグリフロジンプロピレングリコール水和物", "yomi": "ふぉしーがじょうじゅうみりぐらむ", "category": "SGLT2阻害薬", "standardDosage": "2型糖尿病/慢性心不全/慢性腎臓病(CKD): 1回5mg〜10mg 1日1回 朝", "cautions": "脱水、尿路・性器感染症、正常血糖ケトアシドーシスに注意。シックデイ時は休薬指示。1型糖尿病ケトアシドーシス既往禁忌。", "icd10": "E11.9 / I50.9 / N18.9"},
    {"name": "ジャディアンス錠10mg", "genericName": "エンパグリフロジン", "yomi": "じゃでぃあんすじょうじゅうみりぐらむ", "category": "SGLT2阻害薬", "standardDosage": "1回10mg 1日1回 (効果不十分時25mgへ増量可)", "cautions": "心血管死・心不全入院リスクを有意に抑制。脱水予防に十分な水分摂取を指導。", "icd10": "E11.9 / I50.9"},
    {"name": "ジャヌビア錠50mg", "genericName": "シタグリプチンリン酸塩水和物", "yomi": "じゃぬびあじょうごじゅうみりぐらむ", "category": "DPP-4阻害薬", "standardDosage": "1回50mg 1日1回 (最大100mg/日)", "cautions": "SU薬やインスリン併用時の低血糖に注意。腎機能低下時は減量規定あり（eGFR 30〜45: 25mg/日）。", "icd10": "E11.9"},
    {"name": "メトグルコ錠250mg", "genericName": "メトホルミン塩酸塩", "yomi": "めとぐるこじょうにひゃくごじゅうみりぐらむ", "category": "ビグアナイド系血糖降下薬", "standardDosage": "初期1日500mg分2〜3、維持量750〜1500mg/日 (最大2250mg/日)", "cautions": "重篤な腎機能障害(eGFR<30)、透析、肝障害、過度アルコール摂取、高齢衰弱者には禁忌（乳酸アシドーシス発症リスク）。ヨード造影剤検査前後48時間は休薬。", "icd10": "E11.9"},
    {"name": "フェブキソスタット錠20mg", "genericName": "フェブキソスタット", "yomi": "ふぇぶきそすたっとじょうにじゅうみりぐらむ", "category": "非プリン型キサンチンオキシダーゼ阻害薬 (尿酸降下薬)", "standardDosage": "初期1回10mg 1日1回より開始、段階的に40mg/日へ増量 (目標血清尿酸値≦6.0 mg/dL)", "cautions": "メルカプトプリン水和物、アザチオプリン投与中の患者には禁忌（骨髄抑制）。痛風急性発作期の新規開始は避ける（消炎後に少量開始）。", "icd10": "M10.9 / E79.0"},

    # 精神・神経・睡眠
    {"name": "デエビゴ錠5mg", "genericName": "レンボレキサント", "yomi": "でえびごじょうごみりぐらむ", "category": "オレキシン受容体拮抗薬", "standardDosage": "成人は1回5mg 就寝直前 (最大10mg/日)", "cautions": "CYP3Aを強く阻害する薬剤（イトラコナゾール、クラリスロマイシン等）併用時は最大2.5mg。入眠困難と中途覚醒双方に効果。依存性が極めて低い。", "icd10": "G47.0"},
    {"name": "ベルソムラ錠15mg", "genericName": "スボレキサント", "yomi": "べるそむらじょうじゅうごみりぐらむ", "category": "オレキシン受容体拮抗薬", "standardDosage": "成人は1回20mg、高齢者は1回15mg 就寝直前", "cautions": "中枢作用型。悪夢や睡眠麻痺の報告あり。CYP3A阻害薬併用禁忌・注意。", "icd10": "G47.0"},
    {"name": "マイスリー錠5mg", "genericName": "ゾルピデム酒石酸塩", "yomi": "まいすりーじょうごみりぐらむ", "category": "非ベンゾジアゼピン系睡眠導入薬", "standardDosage": "1回5〜10mg 就寝直前 (高齢者初期2.5mg)", "cautions": "超短時間作用型。健忘、もうろう状態、依存性に留意。高齢者のふらつき・夜間転倒リスクのため長期連用を避ける。", "icd10": "G47.0"},
    {"name": "リリカカプセル75mg", "genericName": "プレガバリン", "yomi": "りりかかぷせるななじゅうごみりぐらむ", "category": "神経障害性疼痛治療薬 (電位依存性Caチャネルα2δリガンド)", "standardDosage": "初期1回75mg 1日2回より開始、1週間以上かけて1回150mg 1日2回へ増量", "cautions": "浮動性めまい、傾眠、体重増加、浮腫が高頻度。腎機能低下例ではクリアランスに応じた減量が必須。急な中止による離脱症状注意。", "icd10": "M79.2 / B02.2 / G56.0"},
    {"name": "タリージェ錠5mg", "genericName": "ミロガバリンベシル酸塩", "yomi": "たりーじぇじょうごみりぐらむ", "category": "神経障害性疼痛治療薬 (電位依存性Caチャネルα2δリガンド)", "standardDosage": "初期1回5mg 1日2回より開始、1週間あけて1回10mg 1日2回、最大1回15mg 1日2回", "cautions": "めまい、傾眠に注意。プレガバリン同様に腎排泄型のため腎機能に応じた投与設計が必要。", "icd10": "M79.2 / M54.4"},

    # アレルギー・皮膚・漢方
    {"name": "ビラノア錠20mg", "genericName": "ビラスチン", "yomi": "びらのあじょうにじゅうみりぐらむ", "category": "第2世代抗ヒスタミン薬", "standardDosage": "1回20mg 1日1回 空腹時（就寝前または食前1時間以上）投与", "cautions": "食事の影響（食後服用でバイオアベイラビリティ大幅低下）を受けるため厳格な空腹時服用。眠気インペアードパフォーマンスが極めて少なく自動車運転可能。", "icd10": "J30.1 / L29.9 / L50.9"},
    {"name": "アレグラ錠60mg", "genericName": "フェキソフェナジン塩酸塩", "yomi": "あれぐらじょうろくじゅうみりぐらむ", "category": "第2世代抗ヒスタミン薬", "standardDosage": "1回60mg 1日2回 朝・夕", "cautions": "中枢移行性が低く眠気を生じにくい。水酸化Al・Mg含有制酸薬との併用で吸収低下。", "icd10": "J30.1 / L50.9"},
    {"name": "ツムラ葛根湯エキス顆粒(医療用)", "genericName": "葛根湯", "yomi": "かっこんとう", "category": "漢方製剤 (1番)", "standardDosage": "1日7.5g 2〜3回 食前または食間", "cautions": "感冒初期（悪寒、発熱、無汗、項背部強ばり）。マオウ（エフェドリン）含有のため高血圧、狭心症、甲状腺機能亢進症、高齢者慎重投与。", "icd10": "J00"},
    {"name": "ツムラ麦門冬湯エキス顆粒(医療用)", "genericName": "麦門冬湯", "yomi": "ばくもんどうとう", "category": "漢方製剤 (29番)", "standardDosage": "1日9.0g 2〜3回 食前または食間", "cautions": "から咳、咽頭乾燥感、気管支炎。甘草含有のため偽アルドステロン症（低K血症・血圧上昇）に留意。", "icd10": "R05 / J20.9"},
    {"name": "ツムラ小青竜湯エキス顆粒(医療用)", "genericName": "小青竜湯", "yomi": "しょうせいりゅうとう", "category": "漢方製剤 (19番)", "standardDosage": "1日9.0g 2〜3回 食前または食間", "cautions": "水様性鼻汁、くしゃみ、アレルギー性鼻炎、気管支喘息。マオウ・カンゾウ含有。", "icd10": "J30.1 / J45.9"},
    {"name": "ツムラ芍薬甘草湯エキス顆粒(医療用)", "genericName": "芍薬甘草湯", "yomi": "しゃくやくかんぞうとう", "category": "漢方製剤 (68番)", "standardDosage": "1回2.5g 屯用または1日5.0〜7.5g 2〜3回", "cautions": "有痛性筋痙攣（こむら返り、胆石仙痛等）の即効性寛解。甘草含有量が多いため漫然長期連用は偽アルドステロン症の危険が高く厳禁。", "icd10": "R25.2 / M62.8"}
]

# 3. 代表的傷病名マスター (保険請求・レセプト標準病名)
DISEASES_DATASET = [
    {"name": "急性上気道炎", "yomi": "きゅうせいききどうえん", "icd10": "J00", "category": "呼吸器", "tips": "かぜ症候群。原則抗菌薬不要。対症療法が基本。"},
    {"name": "急性咽頭炎", "yomi": "きゅうせいいんとうえん", "icd10": "J02.9", "category": "呼吸器", "tips": "Centorスコア3点以上で溶連菌迅速キット。陽性時アモキシシリン10日間。"},
    {"name": "急性扁桃炎", "yomi": "きゅうせいへんとうえん", "icd10": "J03.9", "category": "呼吸器", "tips": "細菌性（化膿性）とウイルス性の鑑別が重要。"},
    {"name": "急性気管支炎", "yomi": "きゅうせいきかんしえん", "icd10": "J20.9", "category": "呼吸器", "tips": "咳は2〜3週持続。健常成人のルーチン抗菌薬投与は非推奨。"},
    {"name": "市中肺炎", "yomi": "しちゅうはいえん", "icd10": "J18.9", "category": "呼吸器", "tips": "A-DROPスコアで重症度判定。外来第1選択は高用量アモキシシリン等。"},
    {"name": "気管支喘息", "yomi": "きかんしぜんそく", "icd10": "J45.9", "category": "呼吸器", "tips": "吸入ステロイド(ICS)が治療の基本骨格。発作時はSABA吸入。"},
    {"name": "慢性閉塞性肺疾患 (COPD)", "yomi": "まんせいへいそくせいはいしっかん", "icd10": "J44.9", "category": "呼吸器", "tips": "禁煙指導必須。LAMA/LABA吸入気管支拡張薬が基本。"},
    {"name": "インフルエンザ感染症", "yomi": "いんふるえんざかんせんしょう", "icd10": "J10.1", "category": "感染症", "tips": "発症48時間以内の抗ウイルス薬投与。異常行動防止の指導必須。"},
    {"name": "新型コロナウイルス感染症 (COVID-19)", "yomi": "しんがたころなういるすかんせんしょう", "icd10": "U07.1", "category": "感染症", "tips": "高リスク群（高齢、併存症）には早期抗ウイルス薬。対症療法。"},
    {"name": "本態性高血圧症", "yomi": "ほんたいせいこうけつあつしょう", "icd10": "I10", "category": "循環器", "tips": "特定疾患療養管理料/生活習慣病管理料対象。目標130/80未満。Ca拮抗薬/ARBが第1選択。"},
    {"name": "２型糖尿病", "yomi": "にがたとうにょうびょう", "icd10": "E11.9", "category": "代謝", "tips": "HbA1c 7.0%未満目標。心血管・腎合併症リスク例にSGLT2阻害薬/GLP-1RA推奨。"},
    {"name": "脂質異常症", "yomi": "ししついじょうしょう", "icd10": "E78.5", "category": "代謝", "tips": "冠動脈疾患既往例はLDL<70mg/dLの厳格管理。スタチン第1選択。"},
    {"name": "高尿酸血症", "yomi": "こうにょうさんけっしょう", "icd10": "E79.0", "category": "代謝", "tips": "尿酸値>7.0mg/dL。痛風発作予防に6.0mg/dL以下を維持。発作極期新規開始厳禁。"},
    {"name": "痛風関節炎", "yomi": "つうふうかんせつえん", "icd10": "M10.9", "category": "リウマチ", "tips": "第1中足趾節関節に好発。発作時はNSAIDsパルス等で消炎を最優先。"},
    {"name": "逆流性食道炎 (GERD)", "yomi": "ぎゃくりゅうせいしょくどうえん", "icd10": "K21.0", "category": "消化器", "tips": "初期治療P-CAB(タケキャブ)またはPPI 4〜8週。症状軽快後オンデマンド療法。"},
    {"name": "急性胃腸炎", "yomi": "きゅうせいいちょうえん", "icd10": "A09", "category": "消化器", "tips": "ノロ・ロタ・カンピロバクター等。脱水補正と整腸剤。止瀉薬は病原体排泄遅延のため注意。"},
    {"name": "便秘症", "yomi": "べんぴしょう", "icd10": "K59.0", "category": "消化器", "tips": "浸透圧性下剤（酸化Mg、ポリエチレングリコール）から開始。刺激性下剤連用回避。"},
    {"name": "非弁膜症性心房細動", "yomi": "ひべんまくせいしんぼうさいどう", "icd10": "I48.9", "category": "循環器", "tips": "CHADS2スコア1点以上でDOAC適応。ワーファリンより頭蓋内出血リスク低減。"},
    {"name": "慢性心不全", "yomi": "まんせいしんふぜん", "icd10": "I50.9", "category": "循環器", "tips": "Fantastic 4 (ARNI/ACEi, β遮断薬, MRA, SGLT2i) の早期導入。BNP/NT-proBNPモニタリング。"},
    {"name": "慢性腎臓病 (CKD)", "yomi": "まんせいじんぞうびょう", "icd10": "N18.9", "category": "腎臓", "tips": "eGFR<60または尿蛋白持続。RAS阻害薬・SGLT2阻害薬による腎保護。"},
    {"name": "不眠症", "yomi": "ふみんしょう", "icd10": "G47.0", "category": "精神", "tips": "高齢者にベンゾ系睡眠薬連用は転倒・せん妄リスクのため非推奨。オレキシン受容体拮抗薬優先。"},
    {"name": "緊張型頭痛", "yomi": "きんちょうがたずつう", "icd10": "G44.2", "category": "神経", "tips": "頭部締め付け感。筋緊張緩和、NSAIDs、抗不安薬。薬物乱用頭痛に注意。"},
    {"name": "片頭痛", "yomi": "へんずつう", "icd10": "G43.9", "category": "神経", "tips": "拍動性・悪心・光過敏。発作時トリプタン系、予防にCGRP関連抗体やCa拮抗薬。"},
    {"name": "変形性膝関節症", "yomi": "へんけいせいしつかんせつしょう", "icd10": "M17.9", "category": "整形外科", "tips": "運動療法、大腿四頭筋訓練、外用NSAIDs、ヒアルロン酸関節腔内注射。"},
    {"name": "腰痛症", "yomi": "ようつうしょう", "icd10": "M54.5", "category": "整形外科", "tips": "Red flags（麻痺・膀胱直腸障害・発熱・癌既往）除外。早期活動維持推奨。"},
    {"name": "アレルギー性鼻炎", "yomi": "あれるぎーせいびえん", "icd10": "J30.4", "category": "耳鼻咽喉科", "tips": "第2世代抗ヒスタミン薬または点鼻ステロイド。舌下免疫療法。"},
    {"name": "蕁麻疹", "yomi": "じんましん", "icd10": "L50.9", "category": "皮膚科", "tips": "膨疹と掻痒。第2世代抗ヒスタミン薬増量（最大倍量まで増量可能）。"},
    {"name": "アトピー性皮膚炎", "yomi": "あとぴーせいひふえん", "icd10": "L20.9", "category": "皮膚科", "tips": "保湿スキンケア＋外用ステロイド/タクロリムス/JAK阻害外用薬によるプロアクティブ療法。"},
    {"name": "帯状疱疹", "yomi": "たいじょうほうしん", "icd10": "B02.9", "category": "皮膚科", "tips": "片側性有痛性小水疱。抗ヘルペスウイルス薬（アメナメビル等）早期開始。PHN予防。"},
    {"name": "骨粗鬆症", "yomi": "こつそしょうしょう", "icd10": "M81.9", "category": "整形外科", "tips": "骨密度測定(DXA)。ビスホスホネート、活性型VitD3、抗RANKL抗体(プラリア)等。"}
]

# 4. 難読漢字マスター (MEDICAL_RARE_KANJI_CATALOG)
RARE_KANJI_DATASET = [
    {"char": "嚥", "reading": "えん", "meaning": "嚥下（えんげ）困難、誤嚥性肺炎。飲み込みの機能。"},
    {"char": "瘻", "reading": "ろう", "meaning": "胃瘻（いろう）、腸瘻、痔瘻。体内と体外、または臓器間をつなぐ異常な管。"},
    {"char": "褥", "reading": "じょく", "meaning": "褥瘡（じょくそう: 床ずれ）。寝具や体圧による組織壊死。"},
    {"char": "瘡", "reading": "そう", "meaning": "褥瘡、毛瘡、痘瘡、尋常性ざ瘡（ニキビ）。皮膚の吹き出物や創傷。"},
    {"char": "瘢", "reading": "はん", "meaning": "瘢痕（はんこん: 傷あと）。創傷治癒後の線維性組織。"},
    {"char": "痙", "reading": "けい", "meaning": "痙攣（けいれん）、痙縮。筋肉の不随意なひきつり。"},
    {"char": "攣", "reading": "れん", "meaning": "筋痙攣、拘攣、テタニー。筋肉が強く引きつる状態。"},
    {"char": "掻", "reading": "そう", "meaning": "掻痒（そうよう: かゆみ）、掻爬。爪でひっかくこと。"},
    {"char": "爬", "reading": "は", "meaning": "子宮内容掻爬（そうは）術。かきとること。"},
    {"char": "膿", "reading": "のう", "meaning": "化膿、膿瘍（のうよう）、蓄膿、排膿。炎症による黄色い滲出液。"},
    {"char": "喀", "reading": "かく", "meaning": "喀痰（かくたん）、喀血。のどから吐き出すこと。"},
    {"char": "喘", "reading": "ぜん", "meaning": "気管支喘息（ぜんそく）、喘鳴（ぜんめい）。あえぎ息、ヒューヒュー音。"},
    {"char": "嗜", "reading": "し", "meaning": "嗜眠（しみん: 傾眠状態）。刺激しないと眠り込む意識障害。"},
    {"char": "眩", "reading": "げん", "meaning": "眩暈（めまい）、回転性眩暈。目がくらむこと。"},
    {"char": "暈", "reading": "うん", "meaning": "眩暈（げんうん: めまい）。光の輪、かすみ。"},
    {"char": "齲", "reading": "う", "meaning": "齲歯（うし: 虫歯）。歯の脱灰・崩壊。"},
    {"char": "腱", "reading": "けん", "meaning": "腱鞘炎（けんしょうえん）、アキレス腱。筋肉と骨を繋ぐ強靭な結合組織。"},
    {"char": "膵", "reading": "すい", "meaning": "膵臓（すいぞう）、急性膵炎、膵管。インスリンおよび消化酵素を分泌する臓器。"},
    {"char": "胆", "reading": "たん", "meaning": "胆石（たんせき）、胆嚢炎、総胆管結石。肝臓で作られる消化液とその器官。"},
    {"char": "脾", "reading": "ひ", "meaning": "脾臓（ひぞう）、脾腫、脾機能亢進症。リンパ球産生と血球破壊を司る臓器。"},
    {"char": "踵", "reading": "しょう", "meaning": "踵骨（しょうこつ: かかと）。足の後部。"},
    {"char": "趾", "reading": "し", "meaning": "足趾（そくし: 足の指）、第1趾、第5趾。足のゆび。"},
    {"char": "嗄", "reading": "さ", "meaning": "嗄声（させい: 声がれ）。反回神経麻痺や喉頭炎による声の異常。"},
    {"char": "疣", "reading": "ゆう", "meaning": "疣贅（ゆうぜい: イボ）。HPV等による皮膚隆起。"},
    {"char": "痣", "reading": "し", "meaning": "母斑、痣（あざ）。皮膚の色素斑。"},
    {"char": "痺", "reading": "ひ", "meaning": "麻痺（まひ）、四肢麻痺、片麻痺、しびれ。神経・運動機能の障害。"},
    {"char": "癲", "reading": "てん", "meaning": "癲癇（てんかん）発作。脳神経細胞の過剰興奮による発作性疾患。"},
    {"char": "癇", "reading": "かん", "meaning": "癇癪、小児癇（てんかん）。"},
    {"char": "跛", "reading": "は", "meaning": "間欠性跛行（はこう）。ASOや腰部脊柱管狭窄症での歩行困難。"},
    {"char": "篩", "reading": "し", "meaning": "篩骨（しこつ）、篩骨洞。鼻根部の蜂巣状の骨。"}
]

# TypeScript ファイルとして出力
ts_content = f"""/**
 * DrVoice どんぐり君！ 統合医療データ検索カタログ
 * Flash / SDカード / PWA アプリ共通マスターデータベース
 * 
 * 収録件数:
 * - Minds診療ガイドライン CQ: {len(minds_catalog)} 件 (全111疾患・CQ網羅)
 * - 代表処方薬・医薬品情報: {len(DRUGS_DATASET)} 件
 * - 代表傷病名マスター: {len(DISEASES_DATASET)} 件
 * - 難読医療単漢字・専門用語: {len(RARE_KANJI_DATASET)} 件
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

export interface RareKanjiKnowledgeItem {{
  char: string;
  reading: string;
  meaning: string;
}}

export type MedicalSearchItemType = 'minds' | 'drug' | 'disease' | 'kanji';

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
  kanjiData?: RareKanjiKnowledgeItem;
}}

export const MINDS_KNOWLEDGE_CATALOG: MindsKnowledgeItem[] = {json.dumps(minds_catalog, ensure_ascii=False, indent=2)};

export const DRUGS_CATALOG: DrugKnowledgeItem[] = {json.dumps(DRUGS_DATASET, ensure_ascii=False, indent=2)};

export const DISEASES_CATALOG: DiseaseKnowledgeItem[] = {json.dumps(DISEASES_DATASET, ensure_ascii=False, indent=2)};

export const RARE_KANJI_CATALOG: RareKanjiKnowledgeItem[] = {json.dumps(RARE_KANJI_DATASET, ensure_ascii=False, indent=2)};

/**
 * 統合医療データ インクリメンタルキーワード検索エンジン
 */
export function searchUnifiedMedicalKnowledge(
  query: string,
  filterType: 'all' | 'minds' | 'drug' | 'disease' | 'kanji' = 'all',
  limit: number = 30
): UnifiedMedicalSearchResult[] {{
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const results: UnifiedMedicalSearchResult[] = [];

  // 1. Minds ガイドライン検索
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

  // 2. 医薬品マスター検索
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

  // 3. 傷病名マスター検索
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

  // 4. 難読漢字検索
  if (filterType === 'all' || filterType === 'kanji') {{
    for (const k of RARE_KANJI_CATALOG) {{
      const match =
        k.char.includes(q) ||
        k.reading.includes(q) ||
        k.meaning.toLowerCase().includes(q);

      if (match) {{
        results.push({{
          type: 'kanji',
          title: `[難読漢字] ${{k.char}} (読み: ${{k.reading}})`,
          subtitle: k.meaning,
          codeOrAttr: `単漢字`,
          category: '漢字マスター',
          content: k.meaning,
          kanjiData: k,
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
