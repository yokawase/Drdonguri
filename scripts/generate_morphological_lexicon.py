#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ 高精度医療＆普遍日本語形態素辞書ジェネレーター (v4.0)
- [1] 臨床・カルテ・紹介状・退院サマリー最優先マスター (CLINICAL_CORE_LEXICON)
- [2] DMiME 医療辞書 (dmime_medical_dict.txt: 42,464件)
- [3] Google Mozc OSS 一般日本語辞書 (dictionary00.txt 〜 09.txt: 129万件)
      * min(cost) 選別により「しげあつ」「めてき」「なにそつ」等の人名・方言誤爆を完全根絶
      * 2文字・3文字・4文字の一般・医療語彙を最適コスト閾値で網羅
- [4] 単漢字・接尾辞・語幹 (音読み優先、BS削り出しアンカー完全排除)
- [5] 撥音「ん」末尾の nn 正規化 (MS-IME Space確定での英字化「in天下」根絶)
"""

import os
import glob
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOZC_DIR = os.path.join(BASE_DIR, "data", "mozc_cache")
DMIME_PATH = os.path.join(BASE_DIR, "dmime_medical_dict.txt")
OUTPUT_TS = os.path.join(BASE_DIR, "src", "data", "morphologicalLexicon.ts")

# かな ➔ 正規化ローマ字変換テーブル (Windows MS-IME 標準ヘボン式)
KANA_MAP = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja',  'じゅ': 'ju',  'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'ふぁ': 'fa',  'ふぃ': 'fi',  'ふぇ': 'fe',  'ふぉ': 'fo',
    'てぃ': 'thi', 'でぃ': 'dhi', 'でゅ': 'dyu',
    'うぃ': 'wi',  'うぇ': 'we',  'うぉ': 'wo',
    'ヴぁ': 'va',  'ヴぃ': 'vi',  'ヴ': 'vu',    'ヴぇ': 've',  'ヴぉ': 'vo',
    'ちぇ': 'che', 'しぇ': 'she', 'じぇ': 'je',
    'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ー': '-',
}

def kana_to_romaji(kana: str) -> str:
    """かな文字列をヘボン式・MS-IME最適ローマ字へ変換 (撥音末尾nn保証)"""
    hira = ""
    for c in kana:
        code = ord(c)
        if 0x30A1 <= code <= 0x30F6:
            hira += chr(code - 0x60)
        else:
            hira += c

    res = ""
    i = 0
    length = len(hira)
    while i < length:
        # 促音「っ」
        if hira[i] == 'っ':
            if i + 1 < length:
                next_c = hira[i+1]
                next_rom = ""
                if i + 2 < length and hira[i+1:i+3] in KANA_MAP:
                    next_rom = KANA_MAP[hira[i+1:i+3]]
                elif next_c in KANA_MAP:
                    next_rom = KANA_MAP[next_c]
                if next_rom and next_rom[0].isalpha():
                    res += next_rom[0]
                    i += 1
                    continue
            res += "xtsu"
            i += 1
            continue

        # 撥音「ん」: 末尾または次が母音・ヤ行の場合は必ず 'nn'
        if hira[i] == 'ん':
            if i + 1 < length:
                next_c = hira[i+1]
                if next_c in 'あいうえおアイウエオやゆよヤユヨ':
                    res += "nn"
                else:
                    res += "n"
            else:
                res += "nn"
            i += 1
            continue

        # 2文字かな
        if i + 1 < length and hira[i:i+2] in KANA_MAP:
            res += KANA_MAP[hira[i:i+2]]
            i += 2
            continue

        # 1文字かな
        if hira[i] in KANA_MAP:
            res += KANA_MAP[hira[i]]
            i += 1
            continue

        res += hira[i]
        i += 1

    # 安全策: 文字列末尾が単一の 'n' で終わっていたら 'nn' に補正 (MS-IME誤確定・英字化防止)
    if res.endswith('n') and not res.endswith('nn'):
        res += 'n'

    return res

def main():
    print("=== DrVoice どんぐり君！ 高精度形態素辞書コンパイラ開始 (v4.0) ===")
    
    # { word: (cost, romaji, tag) }
    lexicon = {}

    # -------------------------------------------------------------------------
    # 1. 臨床・カルテ・紹介状・退院サマリー最優先マスター (最優先・コスト0)
    # -------------------------------------------------------------------------
    clinical_core = [
        # 心電図・循環器
        ('心電図所見', 'sindenzushoken', 'Z'),
        ('心電図', 'sindenzu', 'Z'),
        ('労作性狭心症', 'rousakuseikyoushinsyou', 'Z'),
        ('狭心症', 'kyoushinsyou', 'Z'),
        ('心筋虚血', 'shinkinkyoketsu', 'Z'),
        ('心筋梗塞', 'shinkinkousoku', 'Z'),
        ('非ST上昇型心筋梗塞', 'hiSTjousyougatashinkinkousoku', 'Z'),
        ('ST上昇型心筋梗塞', 'STjousyougatashinkinkousoku', 'Z'),
        ('ST低下', 'STteika', 'Z'),
        ('水平型ST低下', 'suiheigataSTteika', 'Z'),
        ('水平型', 'suiheigata', 'Z'),
        ('下降型', 'kakougata', 'Z'),
        ('陰性T波', 'inseiTha', 'Z'),
        ('対称性陰性T波', 'taishouseiinseiTha', 'Z'),
        ('T波陰転化', 'Thaintenka', 'Z'),
        ('陰転化', 'intenka', 'Z'),
        ('典型所見', 'tenkeishoken', 'Z'),
        ('所見', 'shoken', 'Z'),
        ('労作時', 'rousakuji', 'Z'),
        ('労作', 'rousaku', 'Z'),
        ('胸部圧迫感', 'kyoubuappakukan', 'Z'),
        ('胸部絞扼感', 'kyoubukouyakukan', 'Z'),
        ('胸部誘導', 'kyoubuyuudou', 'Z'),
        ('左側胸部誘導', 'hidarigawakyoubuyuudou', 'Z'),
        ('左側', 'hidarigawa', 'Z'),
        ('息切れ', 'ikigire', 'Z'),
        ('動悸発作', 'doukihossa', 'Z'),
        ('動悸', 'douki', 'Z'),
        ('対称性', 'taishousei', 'Z'),
        ('臨床判断', 'rinshouhandan', 'Z'),
        ('トロポニン', 'toroponin', 'K'),
        ('トロポニン陽性', 'toroponinyousei', 'Z'),
        ('BNP測定', 'BNPsokutei', 'Z'),
        ('冠動脈CT', 'kandoumyakuCT', 'Z'),
        ('冠動脈', 'kandoumyaku', 'Z'),
        ('循環器対診', 'junkankitaishin', 'Z'),
        ('循環器', 'junkanki', 'Z'),
        ('対診', 'taishin', 'Z'),
        ('鑑別疾患', 'kambetushikkan', 'Z'),
        ('鑑別', 'kambetu', 'Z'),
        ('左室肥大', 'sashitsuhidai', 'Z'),
        ('ストレイン型ST-T変化', 'sutoreingataST-Thenka', 'Z'),
        ('ストレイン型', 'sutoreingata', 'Z'),
        ('ジギタリス効果', 'jigitarisukouka', 'Z'),
        ('ジギタリス', 'jigitarisu', 'K'),
        ('盆状ST低下', 'bonjouSTteika', 'Z'),
        ('盆状', 'bonjou', 'Z'),
        ('低カリウム血症', 'teikariumukessyou', 'Z'),
        ('カリウム血症', 'kariumukessyou', 'Z'),
        ('高カリウム血症', 'koukariumukessyou', 'Z'),
        ('陽性', 'yousei', 'Z'),
        ('陰性', 'insei', 'Z'),
        ('疑い', 'utagai', 'Z'),

        # 診療情報提供書・紹介状・手紙・退院サマリー
        ('診療情報提供書', 'shinryoujouhouteikyoujo', 'Z'),
        ('情報提供書', 'jouhouteikyoujo', 'Z'),
        ('退院時サマリードラフト', 'taiinjisamari-dorafuto', 'Z'),
        ('退院時サマリー', 'taiinjisamari-', 'Z'),
        ('退院時', 'taiinji', 'Z'),
        ('サマリードラフト', 'samari-dorafuto', 'K'),
        ('サマリー', 'samari-', 'K'),
        ('ドラフト', 'dorafuto', 'K'),
        ('拝啓時下', 'haikeijika', 'Z'),
        ('拝啓', 'haikei', 'Z'),
        ('時下', 'jika', 'Z'),
        ('ご清祥', 'goseishou', 'Z'),
        ('清祥', 'seishou', 'Z'),
        ('お慶び申し上げます', 'oyorokobimoushiagemasu', 'Z'),
        ('お慶び', 'oyorokobi', 'Z'),
        ('平素より', 'heisoyori', 'Z'),
        ('平素', 'heiso', 'Z'),
        ('格別のご高配', 'kakubetsunogokouhai', 'Z'),
        ('ご高配', 'gokouhai', 'Z'),
        ('高配', 'kouhai', 'Z'),
        ('格別', 'kakubetsu', 'Z'),
        ('厚く御礼申し上げます', 'atsukuoreimoushiagemasu', 'Z'),
        ('御礼', 'orei', 'Z'),
        ('今般', 'kompan', 'Z'),
        ('患者様', 'kanjasama', 'Z'),
        ('患者', 'kanja', 'Z'),
        ('専門的精査', 'semmontekiseisa', 'Z'),
        ('精査加療', 'seisakaryou', 'Z'),
        ('専門的', 'semmonteki', 'Z'),
        ('精査', 'seisa', 'Z'),
        ('加療', 'karyou', 'Z'),
        ('ご加療', 'gokaryou', 'Z'),
        ('ご紹介', 'goshoukai', 'Z'),
        ('傷病名', 'shoubyoumei', 'Z'),
        ('対象疾患', 'taishoushikkan', 'Z'),
        ('紹介目的', 'shoukaimokuteki', 'Z'),
        ('目的', 'mokuteki', 'Z'),
        ('方針', 'houshin', 'Z'),
        ('今後の方針', 'kongonohoushin', 'Z'),
        ('ご高診', 'gokoushin', 'Z'),
        ('高診', 'koushin', 'Z'),
        ('お願い申し上げます', 'onegaimoushiagemasu', 'Z'),
        ('お願い', 'onegai', 'Z'),
        ('既往歴', 'kioureki', 'Z'),
        ('常用薬', 'jouyouyaku', 'Z'),
        ('重篤な', 'juutokuna', 'Z'),
        ('重篤', 'juutoku', 'Z'),
        ('アレルギーなし', 'arerugi-nashi', 'Z'),
        ('アレルギー', 'arerugi-', 'K'),
        ('症状経過', 'syoujyoukeika', 'Z'),
        ('現病歴', 'gembyoureki', 'Z'),
        ('発熱', 'hatsunetsu', 'Z'),
        ('疼痛あり', 'toutuuari', 'Z'),
        ('疼痛なし', 'toutuunashi', 'Z'),
        ('疼痛', 'toutuu', 'Z'),
        ('少しあり', 'sukoshiari', 'Z'),
        ('アセトアミノフェン錠', 'asetoaminofenjou', 'Z'),
        ('アセトアミノフェン', 'asetoaminofen', 'K'),
        ('処方', 'shohou', 'Z'),
        ('現在の処方', 'genzainoshohou', 'Z'),
        ('身体所見', 'shintaishoken', 'Z'),
        ('身体', 'shintai', 'Z'),
        ('検査所見', 'kensashoken', 'Z'),
        ('バイタルサイン', 'baitarusain', 'K'),
        ('特記異常所見なし', 'tokkiijyoushokennashi', 'Z'),
        ('特記異常所見', 'tokkiijyoushoken', 'Z'),
        ('異常所見', 'ijyoushoken', 'Z'),
        ('特記', 'tokki', 'Z'),
        ('治療経過', 'chiryoukeika', 'Z'),
        ('ご多忙中', 'gotabouchuu', 'Z'),
        ('多忙中', 'tabouchuu', 'Z'),
        ('多忙', 'tabou', 'Z'),
        ('恐れ入りますが', 'osoreirimasuga', 'Z'),
        ('何卒', 'nanitozo', 'Z'),
        ('敬具', 'keigu', 'Z'),

        # 消化器・内科・検査頻出語
        ('早期胃癌', 'soukiigan', 'Z'),
        ('胃癌', 'igan', 'Z'),
        ('内視鏡所見', 'naishikyoushoken', 'Z'),
        ('内視鏡', 'naishikyou', 'Z'),
        ('拡大内視鏡', 'kakudainaishikyou', 'Z'),
        ('陥凹', 'kannou', 'Z'),
        ('境界明瞭', 'kyoukaimeiryou', 'Z'),
        ('境界不明瞭', 'kyoukaifumeiryou', 'Z'),
        ('胃潰瘍', 'ikaiyou', 'Z'),
        ('消化性潰瘍', 'shoukaseikaiyou', 'Z'),
        ('瘢痕期', 'hankonki', 'Z'),
        ('急性気管支炎', 'kyuuseikikanshien', 'Z'),
        ('逆流性食道炎', 'gyakuryuuseishokudouen', 'Z'),
        ('高血圧症', 'kouketsuatsushou', 'Z'),
        ('脂質異常症', 'shishitsuijoushou', 'Z'),
        ('糖尿病', 'tounyoubyou', 'Z'),
        ('誤嚥性肺炎', 'goenseihaien', 'Z'),
        ('体動時背部痛', 'taidoujihaibutsuu', 'Z'),
        ('背部痛', 'haibutsuu', 'Z'),
        ('筋筋膜性疼痛', 'kinkimmakuseitoutuu', 'Z'),
        ('除外要', 'jogaiyou', 'Z'),
        ('対症療法', 'taishouryouhou', 'Z'),
        ('鎮痛薬処方', 'chintuuyakushohou', 'Z'),
        ('鎮痛薬', 'chintuuyaku', 'Z'),
        ('安静指導', 'anseishidou', 'Z'),
        ('肝機能再検', 'kankinousaiken', 'Z'),
        ('肝機能', 'kankinou', 'Z'),
        ('炎症反応', 'ensyouhannou', 'Z'),
        ('腹部超音波', 'fukubuchouonpa', 'Z'),
        ('理学所見', 'rigakushoken', 'Z'),
        ('咽頭発赤', 'intouhosseki', 'Z'),
        ('扁桃腫大', 'hentoushudai', 'Z'),
        ('扁桃肥大', 'hentouhidai', 'Z'),
        ('扁桃炎', 'hentouen', 'Z'),
        ('扁桃', 'hentou', 'Z'),
        ('腫大', 'shudai', 'Z'),
        ('総合感冒薬', 'sougoukambouyaku', 'Z'),
        ('感冒薬', 'kambouyaku', 'Z'),
    ]

    for item in clinical_core:
        w = item[0]
        r = item[1]
        t = item[2] if len(item) > 2 else 'Z'
        lexicon[w] = (0, r, t)

    print(f" -> 臨床最優先マスター登録: {len(clinical_core)} 語")

    # -------------------------------------------------------------------------
    # 2. DMiME 医療辞書 (dmime_medical_dict.txt) 読み込み
    # -------------------------------------------------------------------------
    dmime_count = 0
    if os.path.exists(DMIME_PATH):
        with open(DMIME_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split(',')
                if len(parts) < 2:
                    continue
                yomi = parts[0].strip()
                word = parts[1].strip()

                # 短すぎる語や記号のみは除外
                if len(word) < 2 or len(word) > 20:
                    continue
                if word in lexicon:
                    continue

                # カタカナ語判定
                is_pure_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)
                has_kanji = any(0x4E00 <= ord(c) <= 0x9FFF for c in word)

                if not has_kanji and not is_pure_katakana:
                    continue

                romaji = kana_to_romaji(yomi)
                if not romaji:
                    continue

                tag = 'K' if is_pure_katakana else 'Z'
                # 医療辞書はコスト 100 で登録
                lexicon[word] = (100, romaji, tag)
                dmime_count += 1
        print(f" -> DMiME 医療辞書登録: {dmime_count:,} 語")
    else:
        print(f" [WARN] DMiME辞書ファイルが見つかりません: {DMIME_PATH}")

    # -------------------------------------------------------------------------
    # 3. Google Mozc 公式辞書 (dictionary00.txt 〜 dictionary09.txt)
    #    全件走査し、各単語の「最小コスト読み」を決定論的に抽出
    # -------------------------------------------------------------------------
    mozc_files = sorted(glob.glob(os.path.join(MOZC_DIR, "dictionary*.txt")))
    print(f" -> Mozc辞書ファイル走査: {len(mozc_files)} 個")

    # word -> (best_cost, yomi, is_katakana)
    mozc_best = {}

    for fp in mozc_files:
        with open(fp, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('\t')
                if len(parts) < 5:
                    continue
                yomi = parts[0]
                cost = int(parts[3]) if parts[3].isdigit() else 99999
                word = parts[4]

                if len(word) < 2 or len(word) > 16:
                    continue

                has_kanji = any(0x4E00 <= ord(c) <= 0x9FFF for c in word)
                is_pure_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)

                if not has_kanji and not (is_pure_katakana and len(word) >= 3):
                    continue

                # 2文字〜4文字の漢字熟語は優先度を高める (コストボーナス)
                effective_cost = cost
                if has_kanji:
                    if len(word) == 2:
                        effective_cost -= 2000
                    elif len(word) in (3, 4):
                        effective_cost -= 1000

                if word not in mozc_best or effective_cost < mozc_best[word][0]:
                    mozc_best[word] = (effective_cost, yomi, is_pure_katakana)

    mozc_added = 0
    # コスト閾値: 一般語・学術語を十分に拾い上げる最適閾値 7000
    for word, (eff_cost, yomi, is_katakana) in mozc_best.items():
        if word in lexicon:
            continue
        if eff_cost > 5800:
            continue

        romaji = kana_to_romaji(yomi)
        if not romaji:
            continue

        tag = 'K' if is_katakana else 'Z'
        lexicon[word] = (eff_cost, romaji, tag)
        mozc_added += 1

    print(f" -> Mozc 最適コスト語彙登録: {mozc_added:,} 語")

    # -------------------------------------------------------------------------
    # 4. 単漢字・接尾辞・語幹 (音読み・正規読み優先、BS削り出しアンカー完全排除)
    # -------------------------------------------------------------------------
    single_kanji = {
        '整': ('sei', 'Z'), '清': ('sei', 'Z'), '軟': ('nan', 'Z'), '純': ('jun', 'Z'),
        '錠': ('jyou', 'Z'), '包': ('hou', 'Z'), '回': ('kai', 'Z'), '胃': ('i', 'Z'),
        '腸': ('chou', 'Z'), '肝': ('kan', 'Z'), '腎': ('jin', 'Z'), '肺': ('hai', 'Z'),
        '脳': ('nou', 'Z'), '腫': ('syu', 'Z'), '診': ('shin', 'Z'), '症': ('syou', 'Z'),
        '炎': ('enn', 'Z'), '痛': ('tuu', 'Z'), '的': ('teki', 'Z'), '化': ('ka', 'Z'),
        '性': ('sei', 'Z'), '学': ('gaku', 'Z'), '論': ('ron', 'Z'), '費': ('hi', 'Z'),
        '者': ('sya', 'Z'), '策': ('saku', 'Z'), '力': ('ryoku', 'Z'), '法': ('hou', 'Z'),
        '薬': ('yaku', 'Z'), '病': ('byou', 'Z'), '院': ('in', 'Z'), '期': ('ki', 'Z'),
        '型': ('gata', 'Z'), '感': ('kan', 'Z'), '部': ('bu', 'Z'), '管': ('kan', 'Z'),
        '度': ('do', 'Z'), '率': ('ritu', 'Z'), '量': ('ryou', 'Z'), '数': ('suu', 'Z'),
        '点': ('ten', 'Z'), '線': ('sen', 'Z'), '筋': ('kin', 'Z'), '骨': ('kotsu', 'Z'),
        '皮': ('hi', 'Z'), '心': ('shin', 'Z'), '胆': ('tan', 'Z'), '膵': ('sui', 'Z'),
        '値': ('chi', 'Z'), '敬': ('kei', 'Z'), '書': ('syo', 'Z'), '低': ('tei', 'Z'),
        '高': ('kou', 'Z'), '対': ('tai', 'Z'), '陰': ('inn', 'Z'), '具': ('gu', 'Z'),
        '塞': ('soku', 'Z'), '梗': ('kou', 'Z'), '篤': ('toku', 'Z'), '処': ('syo', 'Z'),
        '何': ('nani', 'Z'), '卒': ('sotsu', 'Z'), '配': ('hai', 'Z'), '祥': ('shou', 'Z'),
        '喉': ('nodo', 'Z'), '咳': ('seki', 'Z'), '非': ('hi', 'Z'), '波': ('ha', 'Z'),
        '盆': ('bon', 'Z'), '状': ('jou', 'Z'), '息': ('iki', 'Z'), '導': ('dou', 'Z'),
        '胸': ('mune', 'Z'), '左': ('hidari', 'Z'), '右': ('migi', 'Z'), '側': ('gawa', 'Z'),
    }
    for k, (r, t) in single_kanji.items():
        if k not in lexicon:
            lexicon[k] = (0, r, t)
        else:
            # 既存にあっても単漢字は医療音読み・正規読みに上書き
            lexicon[k] = (0, r, t)

    # 語幹
    stems = {
        '動か': 'ugoka', '動かし': 'ugokasi', '和らげ': 'yawarage',
        '伴う': 'tomonau', '伴い': 'tomonai', '伴っ': 'tomona',
        '疑う': 'utagau', '疑い': 'utagai', '現れ': 'araware',
        '強ま': 'tuyoma', '弱ま': 'yowama', '高ま': 'takam',
        '至る': 'itaru', '捉え': 'torae', '持ち込': 'mochiko',
        '生み出': 'umida', '向け': 'muke', '頼る': 'tayoru',
    }
    for k, r in stems.items():
        lexicon[k] = (0, r, 'Z')

    print(f"=== 辞書統合完了: 総語彙数 = {len(lexicon):,} 語 ===")

    # -------------------------------------------------------------------------
    # 5. TSモジュール出力
    # -------------------------------------------------------------------------
    special_tags = {}
    main_dict = {}

    for w, (c, r, t) in lexicon.items():
        if t != 'Z':
            special_tags[w] = t
        main_dict[w] = r

    print(f"=== TSコード出力: {OUTPUT_TS} ===")
    
    with open(OUTPUT_TS, 'w', encoding='utf-8') as f:
        f.write("// =============================================================================\n")
        f.write("// File: src/data/morphologicalLexicon.ts\n")
        f.write("// 説明: Google Mozc ＋ DMiME医療辞書 (4.2万語) ＋ 臨床最頻出マスターから生成された\n")
        f.write(f"//       高精度形態素・読み・タグ付けマスターデータベース (総登録数: {len(lexicon):,} 語)\n")
        f.write("// =============================================================================\n\n")

        # 特殊タグマップ (K = カタカナ F7確定, H = ひらがな Enter確定)
        f.write("export const MORPH_TAGS: Record<string, 'G' | 'K' | 'H'> = {\n")
        for w, t in special_tags.items():
            safe_w = w.replace('\\', '\\\\').replace("'", "\\'")
            f.write(f"  '{safe_w}': '{t}',\n")
        f.write("};\n\n")

        # メイン読み辞書 { 単語: ローマ字 }
        f.write("export const MORPH_ROMAJI: Record<string, string> = {\n")
        # 長い単語から順に出力（最長一致探索の確実化）
        sorted_keys = sorted(main_dict.keys(), key=lambda x: len(x), reverse=True)
        for w in sorted_keys:
            r = main_dict[w]
            safe_w = w.replace('\\', '\\\\').replace("'", "\\'")
            f.write(f"  '{safe_w}': '{r}',\n")
        f.write("};\n")

    print(f" [SUCCESS] 形態素辞書を出力しました: {OUTPUT_TS}")

if __name__ == '__main__':
    main()
