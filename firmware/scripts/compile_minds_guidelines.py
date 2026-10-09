#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
DrVoice どんぐり君 / Dr.Dongly - T-dongle-S3 向け Mindsガイドラインコンパイラ
Minds（日本医療機能評価機構）診療ガイドライン重要推奨事項を
1. 16MB Flash用: 512バイト固定長バイナリ (minds_cds.bin) - Zero-RAM 二分探索
2. 32GB SDカード用: 詳細背景・エビデンス全文 (minds_fulltext.dat / minds_knowledge_base.json)
へコンパイル・生成するパイプライン
=============================================================================
"""

import os
import sys
import json
import struct

# FNV-1a 32-bit Hash
def fnv1a_32(text: str) -> int:
    h = 0x811c9dc5
    for b in text.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return h

# 文字列をUTF-8で固定バイト長に安全にパディング（マルチバイト文字境界を厳守・null終端保証）
def pad_string(s: str, max_len: int) -> bytes:
    encoded = b""
    for char in s:
        char_bytes = char.encode('utf-8')
        if len(encoded) + len(char_bytes) > max_len - 1:
            break
        encoded += char_bytes
    return encoded + b'\x00' * (max_len - len(encoded))

# =============================================================================
# Minds 診療ガイドライン CQ・推奨マスターデータ定義
# =============================================================================
GUIDELINE_ENTRIES = [
    # 1. 急性上気道炎 (かぜ症候群) / JAID・JSC感染症治療ガイドライン
    {
        "icd10": "J00",
        "category": "呼吸器感染症",
        "disease_name": "急性上気道炎（感冒・かぜ症候群）",
        "trigger_words": ["感冒", "かぜ", "風邪", "急性上気道炎", "上気道炎"],
        "cq_num": 1,
        "cq_title": "成人急性上気道炎に対して抗菌薬投与は推奨されるか？",
        "strength": 4, # 強く推奨しない
        "evidence_level": 1, # A
        "alert_flags": 4, # 漫然投与・耐性菌注意
        "recommendation": "【強く推奨しない (質A)】感冒は80%以上がウイルス性であり、ルーチン抗菌薬投与は罹病期間短縮や合併症予防に寄与せず、耐性菌出現および副作用リスクを高めるため投与しないことを強く推奨する。アセトアミノフェン等の対症療法を基本とする。",
        "detail": {
            "background": "感冒の90%以上はライノウイルス、コロナウイルス等のウイルス感染である。抗菌薬投与群とプラセボ群を比較した多数のRCTおよびコクランレビューにおいて、感冒に対する抗菌薬は症状持続期間を短縮させず、下痢や皮疹などの有害事象を統計学的に有意に増加させることが確認されている。",
            "rational": "耐性菌（ペニシリン耐性肺炎球菌やマクロライド耐性マイコプラズマ等）の蔓延を防ぐ観点からも、ウイルス性上気道炎に対する抗菌薬処方は差し控えるべきである。患者へは自然寛解する疾患である旨を説明し、解熱鎮痛薬（アセトアミノフェン）による対症療法を指導する。",
            "practice_tip": "Centorスコア0-1点（咳あり、扁桃発赤・滲出なし、有痛性前頸部リンパ節腫脹なし、発熱なし）ではGAS抗原検査も不要。経口第3世代セフェムやキノロンの漫然投与は厳に慎む。",
            "guideline_title": "JAID/JSC感染症治療ガイドライン2019 - 呼吸器感染症",
            "society": "日本感染症学会 / 日本化学療法学会"
        }
    },
    # 2. 急性咽頭炎・扁桃炎 / JAID・JSC
    {
        "icd10": "J02.9",
        "category": "呼吸器感染症",
        "disease_name": "急性咽頭炎・扁桃炎",
        "trigger_words": ["咽頭炎", "急性咽頭炎", "扁桃炎", "急性扁桃炎", "咽頭痛"],
        "cq_num": 1,
        "cq_title": "成人咽頭炎におけるA群β溶連菌(GAS)の鑑別と抗菌薬選択は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】Modified Centorスコア等でGAS感染を疑う場合、迅速抗原検査等で確認の上、第1選択としてペニシリン系抗菌薬（アモキシシリン等 10日間）を投与することを強く推奨する。広域キノロン・第3世代セフェムは回避する。",
        "detail": {
            "background": "咽頭炎の大部分はウイルス性だが、成人の5-15%、小児の20-30%でA群β溶血性連鎖球菌（S. pyogenes）が原因となる。GAS感染は急性糸球体腎炎やリウマチ熱の遠隔合併症を引き起こし得るため、適切な抗菌薬治療が必要である。",
            "rational": "GASは現在でもペニシリン系に100%感受性を維持している。アモキシシリン（20-40mg/kg/日 分2-3、成人1回500mg 1日2-3回 10日間）が第一選択。クラリスロマイシン等のマクロライドは耐性率が30-50%と高いためペニシリンアレルギー例のみ使用を検討する。",
            "practice_tip": "Centorスコア判定: 38℃以上の発熱(+1), 咳の欠如(+1), 前頸部リンパ節腫脹・圧痛(+1), 扁桃腫脹・滲出物(+1), 年齢15-44歳(0), 45歳以上(-1)。3点以上で迅速キット実施を推奨。",
            "guideline_title": "JAID/JSC感染症治療ガイドライン2019 - 呼吸器感染症",
            "society": "日本感染症学会 / 日本化学療法学会"
        }
    },
    # 3. 急性気管支炎 / JAID・JSC
    {
        "icd10": "J20.9",
        "category": "呼吸器感染症",
        "disease_name": "急性気管支炎",
        "trigger_words": ["急性気管支炎", "気管支炎", "咳嗽", "湿性咳嗽"],
        "cq_num": 1,
        "cq_title": "基礎疾患のない成人の急性気管支炎に抗菌薬は推奨されるか？",
        "strength": 4, # 強く推奨しない
        "evidence_level": 1, # A
        "alert_flags": 4,
        "recommendation": "【強く推奨しない (質A)】基礎疾患のない成人急性気管支炎に対するルーチン抗菌薬投与は強く推奨しない。咳の持続期間は平均2-3週間程度要することを患者に説明し、鎮咳薬・去痰薬等による対症療法を基本とする。",
        "detail": {
            "background": "急性気管支炎の原因病原体の90%以上はインフルエンザウイルス、RSウイルス、ライノウイルス等のウイルス感染である。咳が長引く（1-3週間）のが本症の通常経過である。",
            "rational": "抗菌薬投与による咳期間の短縮効果は平均0.5日程度にとどまり、副作用リスクや耐性菌増加のデメリットが大きく上回る。百日咳やマイコプラズマの疑い、またはCOPD急性増悪が否定される限り抗菌薬は投与しない。",
            "practice_tip": "バイタルサイン（頻呼吸 HR>100, RR>24, 体温>38℃）や胸部聴診でcoarse cracklesを認める場合は肺炎の除外（胸部X線）を先行する。",
            "guideline_title": "JAID/JSC感染症治療ガイドライン2019 - 呼吸器感染症",
            "society": "日本感染症学会 / 日本化学療法学会"
        }
    },
    # 4. 市中肺炎 / 日本呼吸器学会
    {
        "icd10": "J18.9",
        "category": "呼吸器科",
        "disease_name": "成人市中肺炎",
        "trigger_words": ["市中肺炎", "肺炎", "成人肺炎", "肺浸潤影"],
        "cq_num": 1,
        "cq_title": "外来軽症市中肺炎における第1選択抗菌薬は何か？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】A-DROPスコア0点（軽症外来治療群）では、原因菌の首位である肺炎球菌を標的とし、アモキシシリン高用量（またはアンピシリン/スルバクタム）を第一選択とする。非定型肺炎が疑われる場合はマクロライド系を併用・選択する。",
        "detail": {
            "background": "成人の市中肺炎（CAP）では肺炎球菌、インフルエンザ菌、肺炎マイコプラズマ、クラミドフィラが主要原因菌である。重症度評価（A-DROP）に基づき外来・入院適応を判定する。",
            "rational": "日本の肺炎球菌に対する経口ペニシリン耐性は高用量投与（サワシリン 1回500mg 1日3回 等）により克服可能である。レスピラトリーキノロン（レボフロキサシン等）は結核の診断遅延や耐性菌誘導リスクがあるため、初回軽症例へのルーチン投与は控える。",
            "practice_tip": "A-DROP判定: Age(男性70歳/女性75歳以上), Dehydration(BUN 21以上), Respiration(SpO2 90%以下), Orientation(意識障害), Pressure(収縮期血圧90以下)。0点は外来治療、1-2点は中等症（外来/入院）、3点以上は入院・重症。",
            "guideline_title": "成人肺炎診療ガイドライン2024",
            "society": "日本呼吸器学会"
        }
    },
    # 5. 高血圧症 / 日本高血圧学会
    {
        "icd10": "I10",
        "category": "循環器科",
        "disease_name": "本態性高血圧症",
        "trigger_words": ["高血圧", "本態性高血圧症", "高血圧症", "血圧上昇", "血圧高値"],
        "cq_num": 1,
        "cq_title": "75歳未満の成人の降圧目標値および第1選択薬は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】75歳未満成人・糖尿病合併・CKD合併例の降圧目標値は診察室 130/80 mmHg未満（家庭血圧 125/75 mmHg未満）。第1選択薬としてCa拮抗薬、ARB/ACE阻害薬、サイアザイド系利尿薬から単剤または低用量併用で開始する。",
        "detail": {
            "background": "高血圧は心血管イベント（脳卒中、心筋梗塞、心不全）および末期腎不全の最大のリスク因子である。積極的な降圧（厳格降圧 130/80未満）が心血管イベントを有意に抑制することがSPRINT試験等で実証された。",
            "rational": "第1選択薬はCa拮抗薬（アムロジピン等）、ARB（テルミサルタン、カンデサルタン等）、利尿薬。糖尿病合併例や蛋白尿陽性CKD例では腎保護作用（糸球体過剰濾過抑制）を有するARB/ACE阻害薬を最優先とする。",
            "practice_tip": "家庭血圧測定（朝・晩、座位安静2回平均）を治療の柱とする。診察室血圧のみで過剰投与とならないよう白衣高血圧や仮面高血圧に留意する。",
            "guideline_title": "高血圧治療ガイドライン2020 (JSH2020)",
            "society": "日本高血圧学会"
        }
    },
    # 6. 高血圧症・高齢者 / 日本高血圧学会
    {
        "icd10": "I10",
        "category": "循環器科",
        "disease_name": "高齢者高血圧症（75歳以上）",
        "trigger_words": ["高齢者高血圧", "後期高齢者高血圧"],
        "cq_num": 2,
        "cq_title": "75歳以上の後期高齢者における降圧目標値と注意点は？",
        "strength": 1, # 強く推奨
        "evidence_level": 2, # B
        "alert_flags": 3, # 高齢者注意
        "recommendation": "【強く推奨 (質B)】75歳以上の降圧目標は診察室 140/90 mmHg未満（家庭 135/85 mmHg未満）。忍容性があれば130/80 mmHg未満を目指す。過度な降圧による起立性低血圧、ふらつき、転倒、腎血流低下に留意し少量から緩徐に増量する。",
        "detail": {
            "background": "後期高齢者においても降圧治療による心血管死抑制効果は確立しているが、動脈硬化進展や圧受容体反射低下により過降圧のリスク（脳虚血、骨折、AKI）が増大する。",
            "rational": "フレイル（虚弱）や要介護状態の高齢者では降圧目標の個別化が推奨され、過度の降圧（収縮期110未満など）を避ける。利尿薬投与時は脱水や電解質異常（低Na、低K血症）に注意する。",
            "practice_tip": "立位血圧測定を行い起立性低血圧（収縮期20以上低下）の有無を確認する。ポリファーマシー是正も併せて行う。",
            "guideline_title": "高血圧治療ガイドライン2020 (JSH2020)",
            "society": "日本高血圧学会"
        }
    },
    # 7. 2型糖尿病 / 日本糖尿病学会
    {
        "icd10": "E11.9",
        "category": "糖尿病・代謝",
        "disease_name": "２型糖尿病",
        "trigger_words": ["2型糖尿病", "糖尿病", "高血糖", "HbA1c", "DM"],
        "cq_num": 1,
        "cq_title": "成人の血糖コントロール目標値および臓器保護を意図した薬剤選択は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】合併症予防の基本目標はHbA1c 7.0%未満（治療正常化は6.0%未満、低血糖危険時は8.0%未満）。心血管疾患・心不全・CKD合併例では臓器保護エビデンスを有するSGLT2阻害薬またはGLP-1受容体作動薬の積極的投与を推奨する。",
        "detail": {
            "background": "糖尿病の治療目的は細小血管合併症（網膜症、腎症、神経障害）および大血管症（脳卒中、心筋梗塞、下肢閉塞性動脈硬化症）の発症・進行阻止による健康寿命の延伸である。",
            "rational": "SGLT2阻害薬（ダパグリフロジン、エンパグリフロジン等）は心不全入院リスクおよび腎機能低下（eGFR傾き）を糖尿病の有無を問わず抑制するエビデンスが確立。肥満併用例では体重減少効果も併せ持つ。",
            "practice_tip": "高齢者におけるSU薬（グリメピリド等）は遷延性重篤低血糖リスクが高いため、原則少量から開始またはDPP-4阻害薬・SGLT2阻害薬への移行を検討する。",
            "guideline_title": "糖尿病診療ガイドライン2024",
            "society": "日本糖尿病学会"
        }
    },
    # 8. 脂質異常症 / 日本動脈硬化学会
    {
        "icd10": "E78.5",
        "category": "循環器・代謝",
        "disease_name": "脂質異常症（高コレステロール血症）",
        "trigger_words": ["脂質異常症", "高コレステロール血症", "高脂血症", "LDL-C", "高LDL血症"],
        "cq_num": 1,
        "cq_title": "冠動脈疾患既往者（二次予防）におけるLDL-C管理目標値と第一選択薬は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】冠動脈疾患の既往がある二次予防患者では、LDL-C目標値を70 mg/dL未満（極高リスク例では55 mg/dL未満）とし、第一選択薬として強力なスタチン（アトルバスタチン、ロスバスタチン等）を十分量投与することを強く推奨する。",
        "detail": {
            "background": "動脈硬化性プラークの安定化・退縮のためには徹底したLDL-C低下（The Lower, The Better）が不可欠である。二次予防におけるスタチンの心血管死抑制効果は確立されている。",
            "rational": "スタチン単剤で目標未達の場合は、小腸コレステロールトランスポーター阻害薬（エゼチミブ）の併用が強く推奨される。家族性高コレステロール血症や急性冠症候群では早期からの併用を考慮する。",
            "practice_tip": "投与開始前および投与後1-2ヶ月で肝機能（AST/ALT）およびCKを測定し、スタチン誘発性ミオパチー・横紋筋融解症の初期症状（筋肉痛・脱力感）に留意する。",
            "guideline_title": "動脈硬化性疾患予防ガイドライン2022年版",
            "society": "日本動脈硬化学会"
        }
    },
    # 9. 心房細動 / 日本循環器学会
    {
        "icd10": "I48.9",
        "category": "循環器科",
        "disease_name": "非弁膜症性心房細動",
        "trigger_words": ["心房細動", "非弁膜症性心房細動", "Af", "AF", "心房細動発作"],
        "cq_num": 1,
        "cq_title": "脳梗塞予防のための抗凝固療法（DOAC）適応基準は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 1, # 出血・併用禁忌注意
        "recommendation": "【強く推奨 (質A)】CHADS2スコア1点以上（特に2点以上）の非弁膜症性心房細動患者では、直接作用型経口抗凝固薬（DOAC: アピキサバン、リバーロキサバン、エドキサバン、ダビガトラン）による抗凝固療法を第一選択として強く推奨する。",
        "detail": {
            "background": "心房細動による心原性脳塞栓症は広範な脳梗塞を引き起こし、致命率および重症後遺症率が高い。CHADS2スコア（心不全1, 高血圧1, 年齢75歳以上1, 糖尿病1, 脳卒中/TIA既往2）で塞栓リスクを層別化する。",
            "rational": "大規模第III相RCTメタ解析において、DOACはワーファリンと比較して頭蓋内出血を約50%有意に減少させ、全死亡率および塞栓症予防効果で同等以上の優越性が証明されている。PT-INR測定が不要で用量設定が明快である。",
            "practice_tip": "腎機能（クレアチニンクリアランス）に応じた適切な減量基準を遵守する。抗血小板薬（バイアスピリン等）との不要な併用は出血リスクを激増させるため避ける。",
            "guideline_title": "2020年改訂版 不整脈薬物治療ガイドライン",
            "society": "日本循環器学会 / 日本不整脈心電学会"
        }
    },
    # 10. 心不全 / 日本循環器学会
    {
        "icd10": "I50.9",
        "category": "循環器科",
        "disease_name": "慢性心不全 (HFrEF)",
        "trigger_words": ["心不全", "慢性心不全", "収縮不全", "HFrEF", "心不全増悪"],
        "cq_num": 1,
        "cq_title": "左室駆出率低下心不全(HFrEF: EF≦40%)に対する基本薬物療法は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 1,
        "recommendation": "【強く推奨 (質A)】HFrEFに対しては予後改善効果が確立した4系統の薬剤（ARNI/ACE/ARB、β遮断薬、ミネラルコルチコイド受容体拮抗薬MRA、SGLT2阻害薬：いわゆるFantastic 4）の早期導入・併用滴定を強く推奨する。",
        "detail": {
            "background": "HFrEFの治療はかつての利尿薬による対症療法から、神経体液性因子遮断および心筋リモデリング抑制による死亡率・心不全入院リスク低減へとパラダイムシフトした。",
            "rational": "ARNI（サクビトリルバルサルタン）、カルベジロール/ビソプロロール、エプレレノン/スピロノラクトン、ダパグリフロジン/エンパグリフロジンの4剤併用により、全死亡リスクを最大60%以上抑制できる。",
            "practice_tip": "血清カリウム値（高K血症 K>5.0）および血清クレアチニン上昇に留意しながら少量より段階的に増量する。うっ血症状の制御にはループ利尿薬を必要最小限併用する。",
            "guideline_title": "2021年改訂版 急性・慢性心不全診療ガイドライン",
            "society": "日本循環器学会 / 日本心不全学会"
        }
    },
    # 11. 胃食道逆流症 (GERD) / 日本消化器病学会
    {
        "icd10": "K21.9",
        "category": "消化器科",
        "disease_name": "胃食道逆流症 (GERD)",
        "trigger_words": ["GERD", "逆流性食道炎", "胃食道逆流症", "胸やけ", "呑酸"],
        "cq_num": 1,
        "cq_title": "びらん性GERD（逆流性食道炎）の初期治療における第1選択薬は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 4, # 漫然投与注意
        "recommendation": "【強く推奨 (質A)】びらん性GERDの初期治療にはカリウムイオン競合型アシッドブロッカー（P-CAB: ボノプラザン）またはプロトンポンプ阻害薬（PPI）を4-8週間投与することを強く推奨する。症状軽快後は漫然投与を避け減量・オンデマンド療法を検討する。",
        "detail": {
            "background": "胃食道逆流症は胃酸逆流による胸やけ、呑酸、食道粘膜びらんを主徴とする。初期粘膜治癒率はP-CAB（タケキャブ 20mg 4週間）で約95%以上、PPI（8週間）で85-90%である。",
            "rational": "ボノプラザンは初回投与時から強力な酸分泌抑制を発揮し、CYP2C19遺伝子多型の影響を受けない。ただし、無酸状態の長期継続による低マグネシウム血症、腸管感染症、骨粗鬆症リスクが指摘されており、軽快後のステップダウン（10mgへの減量や休薬）が重要である。",
            "practice_tip": "保険適用上の初期投与期間（最大8週間）を厳守する。非びらん性NERDでは消化管運動改善薬や六君子湯の併用も考慮する。",
            "guideline_title": "胃食道逆流症(GERD)診療ガイドライン2021 改訂第3版",
            "society": "日本消化器病学会"
        }
    },
    # 12. 消化性潰瘍・ピロリ除菌 / 日本消化器病学会
    {
        "icd10": "K27.9",
        "category": "消化器科",
        "disease_name": "消化性潰瘍（胃潰瘍・十二指腸潰瘍）",
        "trigger_words": ["胃潰瘍", "十二指腸潰瘍", "消化性潰瘍", "ピロリ", "ピロリ除菌"],
        "cq_num": 1,
        "cq_title": "H. pylori陽性消化性潰瘍に対する除菌治療は推奨されるか？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】H. pylori陽性の胃・十二指腸潰瘍患者に対しては、潰瘍治癒後の再発を劇的に防止するため除菌療法（ボノプラザン/PPI + アモキシシリン + クラリスロマイシン 7日間）を行うことを強く推奨する。",
        "detail": {
            "background": "消化性潰瘍の二大成因はヘリコバクター・ピロリ感染とNSAIDsである。ピロリ菌持続感染下では潰瘍の年間再発率が50-80%に達するが、除菌成功により10%以下に低下する。",
            "rational": "一次除菌（ボノプラザン20mg×2 + アモキシシリン750mg×2 + クラリスロマイシン200mg/400mg×2 7日間）の除菌成功率は約90%である。不成功時は二次除菌（クラリスロマイシンをメトロニダゾール250mg×2に変更）を行う。",
            "practice_tip": "除菌判定は抗菌薬終了後4週間以上（PPI終了後2週間以上）空けて尿素呼気試験または便中抗原測定で評価する。",
            "guideline_title": "消化性潰瘍診療ガイドライン2020 改訂第3版",
            "society": "日本消化器病学会"
        }
    },
    # 13. 軽症頭部外傷 / 日本神経外傷学会
    {
        "icd10": "S09.9",
        "category": "救急・脳神経",
        "disease_name": "軽症頭部外傷（頭部打撲）",
        "trigger_words": ["頭部打撲", "頭部外傷", "軽症頭部外傷", "頭部受傷", "頭部CT適応"],
        "cq_num": 1,
        "cq_title": "GCS 15（意識清明）の軽症頭部打撲成人においてルーチン頭部CTは必要か？",
        "strength": 3, # 推奨しない(弱)
        "evidence_level": 2, # B
        "alert_flags": 0,
        "recommendation": "【推奨しない (質B)】GCS 15かつ神経学的局所徴候なし、頭蓋骨骨折疑いなし、嘔吐2回未満、受傷後健忘なし、抗血栓薬内服なし等の低リスク患者へのルーチンCT撮影は推奨しない。観察待機プロトコル（受帰宅後24時間の厳重観察指示）を推奨する。",
        "detail": {
            "background": "軽症頭部外傷（GCS 14-15）で受診する患者のうち、開頭手術を要する重大な頭蓋内出血を認める割合は1%未満である。不要な頭部CT検査は医療被曝（水晶体・甲状腺等）および医療費増大のハームを招く。",
            "rational": "Canadian CT Head Rule (CCHR) 高リスク基準: GCS<15(受傷2時間後), 開放性・陥没頭蓋骨骨折疑い, 頭蓋底骨折徴候(パンダの目、バトル徴候、髄液漏), 65歳以上, 2回以上の嘔吐。これらが1つも該当しない場合の感度は100%であり安全にCTを省略可能。",
            "practice_tip": "抗凝固薬（DOAC/ワーファリン）内服中の患者は受傷時症状が乏しくても遅発性頭蓋内血腫のリスクがあるため、閾値を下げてCT撮影を考慮する。",
            "guideline_title": "頭部外傷治療・管理のガイドライン第4版",
            "society": "日本神経外傷学会"
        }
    },
    # 14. 急性単純性膀胱炎 / 日本感染症学会・日本化学療法学会
    {
        "icd10": "N30.0",
        "category": "泌尿器感染症",
        "disease_name": "急性単純性膀胱炎",
        "trigger_words": ["膀胱炎", "急性膀胱炎", "急性単純性膀胱炎", "排尿時痛", "頻尿"],
        "cq_num": 1,
        "cq_title": "成人女性の急性単純性膀胱炎に対する推奨抗菌薬と期間は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 4, # 経口セフェム乱用防止
        "recommendation": "【強く推奨 (質A)】起因菌の大半は大腸菌（E. coli）である。第一選択としてST合剤（1回2錠 1日2回 3日間）またはアモキシシリン/クラブラン酸（AMPC/CVA 3-5日間）を推奨する。経口第3世代セフェムやフルオロキノロンの漫然使用は避ける。",
        "detail": {
            "background": "急性単純性膀胱炎は基礎疾患のない健常女性に生じる尿路感染症であり、大腸菌が約75-90%を占める。近年、経口セフェム系に対する耐性大腸菌（ESBL産生菌）の増加が問題となっている。",
            "rational": "日本の経口セフェムはバイオアベイラビリティが低く（15-40%）、腸内細菌叢の乱れと耐性化を誘導しやすい。ST合剤（バクタ）やAMPC/CVA（オーグメンチン等）は殺菌力が高く短期間（3日間）で治癒が得られる。",
            "practice_tip": "発熱（37.5℃以上）や側腹部叩打痛（CVA tenderness）を認める場合は急性腎盂腎炎を疑い、尿培養・血液検査を実施の上、治療強度を上げる。",
            "guideline_title": "JAID/JSC 感染症治療ガイドライン2020 - 尿路感染症",
            "society": "日本感染症学会 / 日本化学療法学会"
        }
    },
    # 15. 気管支喘息 / 日本アレルギー学会
    {
        "icd10": "J45.9",
        "category": "呼吸器科",
        "disease_name": "成人気管支喘息",
        "trigger_words": ["気管支喘息", "喘息", "喘鳴", "呼気性喘鳴", "咳喘息"],
        "cq_num": 1,
        "cq_title": "成人喘息の長期管理における吸入ステロイド薬(ICS)の推奨度は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】気道炎症を根本的に抑制し喘息死・急性増悪を予防するため、すべての成人喘息患者の長期管理薬として吸入ステロイド薬（ICS）またはICS/LABA配合薬を早期から導入することを強く推奨する。SABA単独管理は厳禁。",
        "detail": {
            "background": "喘息の本態は慢性の気道炎症であり、無症状期であっても気道のリモデリング（不可逆的狭窄）が進行する。短時間作用性吸入β2刺激薬（SABA: メプチン等）の乱用は喘息死リスクを高めることが判明している。",
            "rational": "ICS（ブデソニド、フルチカゾン等）およびICS/LABA配合薬（レルベア、シムビコート、アドエア等）は気道炎症を強力に沈静化させ、QOL改善および救急受診率低下をもたらす。",
            "practice_tip": "吸入後の「うがい（嗄声・口腔内カンジダ予防）」の励行を徹底する。症状消失後も自己中断しないよう患者教育を行う。",
            "guideline_title": "喘息予防・管理ガイドライン2021 (JGL2021)",
            "society": "日本アレルギー学会"
        }
    },
    # 16. 痛風・高尿酸血症 / 日本痛風・尿酸・核酸学会
    {
        "icd10": "M10.9",
        "category": "リウマチ・代謝",
        "disease_name": "痛風関節炎・高尿酸血症",
        "trigger_words": ["痛風", "痛風発作", "高尿酸血症", "尿酸値", "第1中足趾節関節"],
        "cq_num": 1,
        "cq_title": "痛風関節炎の急性発作期における尿酸降下薬の取り扱いは？",
        "strength": 3, # 推奨しない(弱)
        "evidence_level": 2, # B
        "alert_flags": 2, # 投与タイミング注意
        "recommendation": "【推奨しない (質B)】痛風発作極期に尿酸降下薬（アロプリノール、フェブキソスタット等）を新規開始すると、血中尿酸値の急激な変動により関節内の尿酸結晶剥離が誘発され発作が増悪・長期化するため推奨しない。NSAIDs等で発作寛解後に少量から開始する。",
        "detail": {
            "background": "痛風発作発症時に血中尿酸値を急速に低下させると、関節腔内の結晶崩壊が促進され炎症性サイトカインが過剰放出される。",
            "rational": "急性期はNSAIDs短期間パルス投与（ロキソプロフェン高用量等）またはコルヒチン、ステロイドで炎症を速やかに鎮静化させる。既存の尿酸降下薬を既に服用中の場合は用量を変更せず継続する。",
            "practice_tip": "発作完全消失から1-2週間経過後にフェブキソスタット10mg/日等の少量から開始し、血清尿酸値6.0 mg/dL以下を目標に漸増する。",
            "guideline_title": "高尿酸血症・痛風の治療ガイドライン第3版",
            "society": "日本痛風・尿酸・核酸学会"
        }
    },
    # 17. 骨粗鬆症 / 日本骨粗鬆症学会
    {
        "icd10": "M81.0",
        "category": "整形外科・内分泌",
        "disease_name": "原発性骨粗鬆症",
        "trigger_words": ["骨粗鬆症", "原発性骨粗鬆症", "YAM", "骨密度低下", "大腿骨骨折予防"],
        "cq_num": 1,
        "cq_title": "骨折リスクの高い骨粗鬆症における第一選択薬は何か？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 1, # 顎骨壊死注意
        "recommendation": "【強く推奨 (質A)】脆弱性骨折既往またはYAM<70%の患者に対し、椎体および大腿骨近位部骨折予防エビデンスを有するビスホスホネート製剤（アレンドロン酸等）または抗RANKL抗体（デノスマブ）を第一選択薬として強く推奨する。",
        "detail": {
            "background": "骨粗鬆症による大腿骨近位部骨折は要介護状態および死亡リスクを急増させる。骨折予防が至上命題である。",
            "rational": "ビスホスホネート製剤（内服週1回/月1回、注射年1回）およびデノスマブ（6ヶ月に1回皮下注）は強力な骨吸収抑制作用により骨密度を有意に増加させ骨折発生率を約40-70%低減する。",
            "practice_tip": "抜歯等の侵襲的歯科処置前の医科歯科連携（顎骨壊死MRONJ予防）および口腔衛生管理を指導する。腎機能障害（eGFR<30）ではビスホスホネートは禁忌となるためデノスマブ等を検討する。",
            "guideline_title": "骨粗鬆症の予防と治療ガイドライン2015年版",
            "society": "日本骨粗鬆症学会"
        }
    },
    # 18. 不眠症 / 日本睡眠学会
    {
        "icd10": "G47.0",
        "category": "精神・心療内科",
        "disease_name": "慢性不眠症",
        "trigger_words": ["不眠症", "不眠", "入眠困難", "中途覚醒", "熟眠障害"],
        "cq_num": 1,
        "cq_title": "高齢者不眠症におけるベンゾジアゼピン系睡眠薬の使用についての推奨は？",
        "strength": 4, # 強く推奨しない
        "evidence_level": 1, # A
        "alert_flags": 3, # 転倒・せん妄注意
        "recommendation": "【強く推奨しない (質A)】高齢者の不眠症に対し、ベンゾジアゼピン系睡眠薬の長期連用は筋弛緩・ふらつきによる夜間転倒・骨折、せん妄、依存性リスクが高いため強く推奨しない。オレキシン受容体拮抗薬（スボレキサント等）またはメラトニン受容体作動薬を優先する。",
        "detail": {
            "background": "高齢者の不眠には身体疾患や生活習慣、概日リズムのズレが複合している。古典的ベンゾジアゼピン系薬（ハルシオン、サイレース、デパス等）はGABA-A受容体広範刺激による筋弛緩作用と持ち越し効果が顕著である。",
            "rational": "オレキシン受容体拮抗薬（レンボレキサント、スボレキサント等）およびメラトニン受容体作動薬（ラメルテオン）は自然な睡眠覚醒リズムを整え、筋弛緩や耐性・依存を生じにくい。",
            "practice_tip": "薬物療法開始前に「睡眠衛生指導（朝の日光浴、カフェイン制限、寝床にいる時間の適正化）」を実施する。漫然とした長期処方は定期的に見直す。",
            "guideline_title": "睡眠薬の適正な使用と休薬のための診療ガイドライン",
            "society": "日本睡眠学会 / 厚生労働科学研究班"
        }
    },
    # 19. 認知症・BPSD / 日本認知症学会
    {
        "icd10": "F03",
        "category": "神経内科・精神科",
        "disease_name": "アルツハイマー型認知症 / BPSD",
        "trigger_words": ["認知症", "アルツハイマー", "アルツハイマー病", "BPSD", "物忘れ"],
        "cq_num": 1,
        "cq_title": "認知症患者の行動・心理症状(BPSD)に対する初期介入と抗精神病薬の適応は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 1, # 脳血管・死亡リスク注意
        "recommendation": "【強く推奨 (質A)】BPSD（興奮・焦燥感等）に対しては、誘因検索（身体苦痛・便秘・環境不適）と非薬物療法を第一選択とすることを強く推奨する。抗精神病薬のルーチン使用は死亡率および脳血管障害リスクを増加させるため、切迫した自傷他害時に限り必要最小限に留める。",
        "detail": {
            "background": "BPSDは認知機能低下に伴う不安や環境不適合、身体的不快感（疼痛、排尿障害等）が引き金となることが多い。抗精神病薬（リスペリドン、クエチアピン等）の投与は高齢者認知症患者において死亡リスクを約1.6-1.7倍増加させる（黒枠警告）。",
            "rational": "環境調整、バリデーション療法、介護者の関わり方の工夫で多くのBPSDは改善する。抑肝散（漢方薬）やタンドスピロン等の比較的安全な薬剤から検討する。",
            "practice_tip": "抗コリン作用を有する薬剤（第1世代抗ヒスタミン薬、三環系抗うつ薬、過活動膀胱治療薬の一部等）は認知機能悪化とせん妄を惹起するため速やかに中止・変更する。",
            "guideline_title": "認知症疾患診療ガイドライン2017",
            "society": "日本認知症学会"
        }
    },
    # 20. 帯状疱疹 / 日本皮膚科学会
    {
        "icd10": "B02.9",
        "category": "皮膚科",
        "disease_name": "帯状疱疹",
        "trigger_words": ["帯状疱疹", "ヘルペス", "水疱", "片側性皮疹", "ピリピリする痛み"],
        "cq_num": 1,
        "cq_title": "帯状疱疹の初期治療における抗ウイルス薬開始タイミングと推奨薬は？",
        "strength": 1, # 強く推奨
        "evidence_level": 1, # A
        "alert_flags": 0,
        "recommendation": "【強く推奨 (質A)】皮疹出現後72時間以内の可能な限り早期に抗ヘルペスウイルス薬（アメナメビル、バラシクロビル、ファムシクロビル）を開始することを強く推奨する。早期治療により皮疹治癒促進および帯状疱疹後神経痛（PHN）への移行を防止する。",
        "detail": {
            "background": "水痘・帯状疱疹ウイルス（VZV）の再活性化による知覚神経の炎症と皮膚病変。高齢者では激しい神経痛が数ヶ月〜年単位で遷延するPHNが高頻度に発生する。",
            "rational": "新規機序のヘリカーゼ・プライマーゼ阻害薬アメナメビル（アメナリーフ 400mg 1日1回食後 7日間）は腎排泄ではなく糞便排泄主体であるため、腎機能障害（eGFR低下）高齢者においても用量調節が不要で極めて安全に使用できる。",
            "practice_tip": "腎機能低下例におけるバラシクロビル・アシクロビル投与時は、アシクロビル脳症（意識障害、幻覚、ミオクローヌス）発症を防ぐため、eGFRに応じた確実な減量処方を遵守する。",
            "guideline_title": "帯状疱疹診療ガイドライン2023",
            "society": "日本皮膚科学会"
        }
    }
]

# =============================================================================
# コンパイル処理
# =============================================================================
def compile_minds_guidelines(base_dir: str):
    data_dir = os.path.join(base_dir, "data")
    firmware_data_dir = os.path.join(base_dir, "firmware", "data")
    sdcard_dir = os.path.join(data_dir, "sdcard")
    guidelines_doc_dir = os.path.join(sdcard_dir, "guidelines")
    
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(firmware_data_dir, exist_ok=True)
    os.makedirs(sdcard_dir, exist_ok=True)
    os.makedirs(guidelines_doc_dir, exist_ok=True)

    print(f"=================================================================")
    print(f" [Minds コンパイラ] 日本医療機能評価機構 診療ガイドライン 512B ビルド")
    print(f" 入力エントリー数: {len(GUIDELINE_ENTRIES)} 件")
    print(f"=================================================================")

    # 1. SDカード用詳細テキストバッファの構築
    sdcard_fulltext_bytes = bytearray()
    knowledge_base = []
    processed_records = []

    rec_id = 1
    for entry in GUIDELINE_ENTRIES:
        detail_obj = entry["detail"]
        
        # Markdown / プレーンテキスト詳細文書の生成
        markdown_text = f"""# 【Mindsガイドライン推奨】{entry['disease_name']} (ICD-10: {entry['icd10']})
## CQ{entry['cq_num']}: {entry['cq_title']}

### 【学会公式推奨】
- **推奨度**: {"強く推奨" if entry['strength'] == 1 else "弱く推奨/提案" if entry['strength'] == 2 else "弱く非推奨" if entry['strength'] == 3 else "強く非推奨"}
- **エビデンスの確実性**: {"質A (高)" if entry['evidence_level'] == 1 else "質B (中)" if entry['evidence_level'] == 2 else "質C (低)" if entry['evidence_level'] == 3 else "質D (非常に低)"}
- **準拠指針**: {detail_obj['guideline_title']} ({detail_obj['society']})

### 【推奨文要約】
{entry['recommendation']}

### 【臨床的背景】
{detail_obj['background']}

### 【推奨決定の理由・エビデンス解説】
{detail_obj['rational']}

### 【日常診療・レセプト実践アドバイス】
{detail_obj['practice_tip']}
"""
        # SDカード内個別Markdownファイルの書き出し
        safe_fname = f"{entry['icd10']}_cq{entry['cq_num']}.md"
        with open(os.path.join(guidelines_doc_dir, safe_fname), "w", encoding="utf-8") as f:
            f.write(markdown_text)

        # SDカード用結合バイナリへの追記
        encoded_detail = markdown_text.encode('utf-8')
        sd_offset = len(sdcard_fulltext_bytes)
        sd_len = len(encoded_detail)
        sdcard_fulltext_bytes.extend(encoded_detail)

        # トリガーワードごとのレコード生成（疾患名またはキーワードごとに二分探索可能にする）
        for word in entry["trigger_words"]:
            h = fnv1a_32(word)
            processed_records.append({
                "id": rec_id,
                "icd10": entry["icd10"],
                "trigger_word": word,
                "trigger_hash": h,
                "cq_num": entry["cq_num"],
                "strength": entry["strength"],
                "evidence_level": entry["evidence_level"],
                "alert_flags": entry["alert_flags"],
                "sd_offset": sd_offset,
                "sd_len": sd_len,
                "category": entry["category"],
                "disease_name": entry["disease_name"],
                "cq_title": entry["cq_title"],
                "recommendation": entry["recommendation"],
            })
            rec_id += 1

        knowledge_base.append({
            "id": entry["icd10"] + f"_CQ{entry['cq_num']}",
            "icd10": entry["icd10"],
            "disease_name": entry["disease_name"],
            "category": entry["category"],
            "cq_num": entry["cq_num"],
            "cq_title": entry["cq_title"],
            "strength": entry["strength"],
            "evidence_level": entry["evidence_level"],
            "recommendation": entry["recommendation"],
            "detail": detail_obj,
            "sd_offset": sd_offset,
            "sd_len": sd_len
        })

    # 2. トリガーハッシュ順に昇順ソート（Zero-RAM 二分探索の必須要件）
    processed_records.sort(key=lambda x: x["trigger_hash"])

    print(f" -> トリガーワード展開後の総レコード数: {len(processed_records)} 件")

    # 3. 512バイト固定長バイナリのパック
    # フォーマット:
    # <H: id (2B)
    # 6s: icd10 (6B)
    # <I: trigger_hash (4B)
    # <H: cq_num (2B)
    # B: strength (1B)
    # B: evidence_level (1B)
    # B: alert_flags (1B)
    # B: reserved1 (1B)
    # <I: sd_offset (4B)
    # <H: sd_len (2B)
    # 12s: category (12B)
    # 44s: disease_name (44B)
    # 80s: cq_title (80B)
    # 352s: recommendation (352B)
    RECORD_STRUCT_FORMAT = "<H6sIHBBBB I H 12s 44s 80s 352s"
    expected_size = struct.calcsize(RECORD_STRUCT_FORMAT)
    assert expected_size == 512, f"Struct size is {expected_size}, expected 512 bytes!"

    binary_output = bytearray()
    for r in processed_records:
        packed = struct.pack(
            RECORD_STRUCT_FORMAT,
            r["id"] & 0xffff,
            pad_string(r["icd10"], 6),
            r["trigger_hash"] & 0xffffffff,
            r["cq_num"] & 0xffff,
            r["strength"] & 0xff,
            r["evidence_level"] & 0xff,
            r["alert_flags"] & 0xff,
            0, # reserved
            r["sd_offset"] & 0xffffffff,
            r["sd_len"] & 0xffff,
            pad_string(r["category"], 12),
            pad_string(r["disease_name"], 44),
            pad_string(r["cq_title"], 80),
            pad_string(r["recommendation"], 352),
        )
        assert len(packed) == 512, f"Packed record size {len(packed)} != 512"
        binary_output.extend(packed)

    # 4. ファイルへの書き出し
    # (A) 16MB Flash用固定長バイナリ (data/minds_cds.bin & firmware/data/minds_cds.bin)
    flash_bin_path1 = os.path.join(data_dir, "minds_cds.bin")
    flash_bin_path2 = os.path.join(firmware_data_dir, "minds_cds.bin")
    with open(flash_bin_path1, "wb") as f:
        f.write(binary_output)
    with open(flash_bin_path2, "wb") as f:
        f.write(binary_output)

    # (B) 32GB SDカード用詳細テキスト結合バイナリ (data/sdcard/minds_fulltext.dat)
    sd_dat_path = os.path.join(sdcard_dir, "minds_fulltext.dat")
    with open(sd_dat_path, "wb") as f:
        f.write(sdcard_fulltext_bytes)

    # (C) WebLLM / RAG ナレッジベース JSON (data/sdcard/minds_knowledge_base.json)
    kb_json_path = os.path.join(sdcard_dir, "minds_knowledge_base.json")
    with open(kb_json_path, "w", encoding="utf-8") as f:
        json.dump(knowledge_base, f, ensure_ascii=False, indent=2)

    print(f" -> [完了] 16MB Flash 用バイナリ: {flash_bin_path1} ({len(binary_output)} バイト, {len(binary_output)//512} レコード)")
    print(f" -> [完了] 32GB SDカード 用テキスト: {sd_dat_path} ({len(sdcard_fulltext_bytes)} バイト)")
    print(f" -> [完了] WebLLM RAG 用 JSON: {kb_json_path} ({len(knowledge_base)} ガイドライン)")
    print(f" -> [完了] SDカード Markdown 個別文書: {guidelines_doc_dir} ({len(GUIDELINE_ENTRIES)} ファイル)")
    print(f"=================================================================")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.abspath(os.path.join(script_dir, "..", ".."))
    compile_minds_guidelines(base)
