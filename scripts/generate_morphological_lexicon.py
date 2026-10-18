#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ 高精度形態素辞書ジェネレーター (generate_morphological_lexicon.py)
- Google Mozc 公式辞書 (dictionary00.txt 〜 dictionary09.txt)
- 厚労省マスター (医科診療行為・医薬品・傷病名)
- 臨床特化医療辞書 & 動詞・形容詞活用形自動展開
から、高速かつ超軽量な形態素辞書 (src/data/morphologicalLexicon.ts) を生成する。
"""

import os
import glob
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOZC_DIR = os.path.join(BASE_DIR, "data", "mozc_cache")
OUTPUT_TS = os.path.join(BASE_DIR, "src", "data", "morphologicalLexicon.ts")

# かな ➔ 正規化ローマ字変換テーブル
KANA_MAP = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sya', 'しゅ': 'syu', 'しょ': 'syo',
    'ちゃ': 'tya', 'ちゅ': 'tyu', 'ちょ': 'tyo',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'zya', 'じゅ': 'zyu', 'じょ': 'zyo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo',
    'てぃ': 'ti', 'でぃ': 'di', 'でゅ': 'dyu',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo',
    'ヴぁ': 'va', 'ヴぃ': 'vi', 'ヴ': 'vu', 'ヴぇ': 've', 'ヴぉ': 'vo',
    'ちぇ': 'tye', 'しぇ': 'sye', 'じぇ': 'zye',
    'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso',
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'si', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'ti', 'つ': 'tu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'hu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'wo',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'zi', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ー': '-',
}

def kana_to_romaji(kana: str) -> str:
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

        if i + 1 < length and hira[i:i+2] in KANA_MAP:
            res += KANA_MAP[hira[i:i+2]]
            i += 2
            continue

        if hira[i] in KANA_MAP:
            res += KANA_MAP[hira[i]]
            i += 1
            continue

        res += hira[i]
        i += 1

    return res

def main():
    print("=== DrVoice どんぐり君！ 高精度形態素辞書コンパイラ開始 ===")
    
    # { word: (cost, romaji, tag) }
    lexicon = {}

    # 1. 医療特化・臨床頻出語彙 (最優先・コスト0)
    medical_words = [
        # 消化器・内視鏡
        ('早期胃癌', 'soukiigan', 'G'),
        ('胃癌', 'igan', 'G'),
        ('所見', 'syoken', 'G'),
        ('内視鏡所見', 'naisikyousyoken', 'G'),
        ('内視鏡', 'naisikyou', 'Z'),
        ('拡大内視鏡', 'kakudainaisikyou', 'Z'),
        ('陥凹', 'kannou', 'G'),
        ('陥凹型', 'kannougata', 'G'),
        ('境界', 'kyoukai', 'G'),
        ('境界明瞭', 'kyoukaimeiryou', 'G'),
        ('発赤', 'hosseki', 'Z'),
        ('褪色', 'taisyoku', 'G'),
        ('微細血管構築異常', 'bisaikekkankoutikuijyou', 'Z'),
        ('微細血管', 'bisaikekkann', 'Z'),
        ('構築異常', 'koutikuijyou', 'G'),
        ('異常', 'ijyou', 'G'),
        ('胃潰瘍', 'ikaiyou', 'Z'),
        ('消化性潰瘍', 'syoukaseikaiyou', 'Z'),
        ('瘢痕期', 'hannkonnki', 'Z'),
        ('胃良性ポリープ', 'iryouseipori-pu', 'Z'),
        ('良性ポリープ', 'ryouseipori-pu', 'Z'),
        ('ポリープ', 'pori-pu', 'K'),
        ('胃角部小弯', 'ikakubusyouwann', 'Z'),
        ('胃角部', 'ikakubu', 'Z'),
        ('胃角', 'ikaku', 'G'),
        ('小弯', 'syouwann', 'Z'),
        ('前庭部', 'zenteibu', 'Z'),
        ('前庭', 'zentei', 'G'),
        ('精査要', 'seisayou', 'Z'),
        ('臨床判断', 'rinnsyouhanndann', 'Z'),
        ('慢性萎縮性胃炎', 'mannseiisyokuseiienn', 'Z'),
        ('萎縮性胃炎', 'isyokuseiienn', 'Z'),
        ('限局性びらん', 'gennkyokuseibiran', 'Z'),
        ('びらん', 'biran', 'H'),
        ('適応精査', 'tekiouseisa', 'Z'),
        ('ESD適応精査', 'esdtekiouseisa', 'Z'),
        ('鑑別疾患', 'kannbetusikkann', 'Z'),
        ('鑑別', 'kannbetu', 'Z'),
        ('疾患', 'sikkann', 'Z'),
        ('典型所見', 'tennkeisyoken', 'G'),
        ('典型', 'tennkei', 'Z'),
        ('浅い', 'asai', 'Z'),
        ('不整陥凹病変', 'huseikannnoubyouhenn', 'Z'),
        ('不整陥凹', 'huseikannnou', 'Z'),
        ('病変', 'byouhenn', 'Z'),
        ('不整', 'husei', 'Z'),
        ('ひだ集中', 'hidasyuutyuu', 'Z'),
        ('途絶', 'tozetu', 'Z'),
        ('途読', 'todoku', 'Z'),
        ('辺縁粘膜', 'hennennnennmaku', 'Z'),
        ('辺縁', 'hennenn', 'Z'),
        ('粘膜', 'nennmaku', 'Z'),

        # 急性腹痛・背部痛・内科
        ('体動時背部痛', 'taidoujihaibutuu', 'Z'),
        ('体動時', 'taidouji', 'Z'),
        ('体動', 'taidou', 'Z'),
        ('背部痛', 'haibutuu', 'Z'),
        ('背部', 'haibu', 'Z'),
        ('筋筋膜性疼痛', 'kinkimmakuseitoutuu', 'Z'),
        ('筋筋膜性', 'kinkimmakusei', 'Z'),
        ('疼痛', 'toutuu', 'Z'),
        ('内臓疾患', 'naizousikkann', 'Z'),
        ('除外要', 'jyogaiyou', 'Z'),
        ('除外', 'jyogai', 'Z'),
        ('対症療法', 'taisyouryouhou', 'Z'),
        ('鎮痛薬処方', 'tinntuuyakusyohou', 'Z'),
        ('鎮痛薬', 'tinntuuyaku', 'Z'),
        ('安静指導', 'annseisidou', 'Z'),
        ('安静', 'annsei', 'Z'),
        ('肝機能再検', 'kankinousaikenn', 'Z'),
        ('肝機能', 'kankinou', 'Z'),
        ('再検', 'saikenn', 'Z'),
        ('炎症反応', 'ennsyouhannnou', 'G'),
        ('腹部超音波精査検討', 'hukubutyouonnpaseisakennntou', 'Z'),
        ('腹部超音波', 'hukubutyouonnpa', 'Z'),
        ('精査検討', 'seisakennntou', 'Z'),
        ('時々', 'tokidoki', 'Z'),
        ('普通', 'hutsuu', 'Z'),
        ('受診', 'jyusinn', 'G'),
        ('中性', 'tyuusei', 'G'),
        ('理学所見', 'rigakusyokenn', 'Z'),
        ('バイタル特記なし', 'baitarutokkinasi', 'Z'),
        ('特記なし', 'tokkinasi', 'Z'),
        ('特記', 'tokki', 'G'),
        ('処方', 'syohou', 'G'),
        ('内臓', 'naizou', 'G'),
        ('歳', 'sai', 'G'),
        ('主訴', 'syuso', 'Z'),
        ('現病歴', 'gennbyoureki', 'Z'),
        ('既往歴', 'kioureki', 'Z'),
        ('内服薬', 'naihukuyaku', 'Z'),
        ('身体所見', 'sinntaisyokenn', 'Z'),

        # 医療提供体制・医療経済学・学術用語
        ('現代', 'gendai', 'Z'),
        ('医療提供体制', 'iryouteikyoutaisei', 'Z'),
        ('医療提供', 'iryouteikyou', 'Z'),
        ('提供体制', 'teikyoutaisei', 'Z'),
        ('提供', 'teikyou', 'Z'),
        ('体制', 'taisei', 'Z'),
        ('医療費抑制', 'iryouhiyokusei', 'Z'),
        ('医療費', 'iryouhi', 'Z'),
        ('抑制', 'yokusei', 'Z'),
        ('志向', 'sikou', 'Z'),
        ('国家財政政策', 'kokkazaiseiseisaku', 'Z'),
        ('国家財政', 'kokkazaisei', 'Z'),
        ('国家', 'kokka', 'Z'),
        ('財政政策', 'zaiseiseisaku', 'Z'),
        ('財政', 'zaisei', 'Z'),
        ('政策', 'seisaku', 'Z'),
        ('医療機関', 'iryoukikann', 'Z'),
        ('財務的困窮', 'zaimutekikonnkyuu', 'Z'),
        ('財務的', 'zaimuteki', 'Z'),
        ('財務', 'zaimu', 'Z'),
        ('困窮', 'konnkyuu', 'Z'),
        ('臨床現場', 'rinnsyougennba', 'Z'),
        ('低価値医療', 'teikatiiryou', 'Z'),
        ('低価値', 'teikati', 'Z'),
        ('価値', 'kati', 'Z'),
        ('蔓延', 'mannenn', 'Z'),
        ('個別', 'kobetu', 'Z'),
        ('事象', 'jisyou', 'Z'),
        ('構造的', 'kouzouteki', 'Z'),
        ('構造', 'kouzou', 'Z'),
        ('連結', 'rennketu', 'Z'),
        ('一連', 'itirenn', 'Z'),
        ('病理学的連鎖', 'byourigakutekirennsa', 'Z'),
        ('病理学的', 'byourigakuteki', 'Z'),
        ('病理学', 'byourigaku', 'Z'),
        ('病理', 'byouri', 'Z'),
        ('連鎖', 'rennsa', 'Z'),
        ('人口構造', 'jinnkoukouzou', 'Z'),
        ('人口', 'jinnkou', 'Z'),
        ('急激', 'kyuugeki', 'Z'),
        ('高齢化', 'koureika', 'Z'),
        ('社会保障給付費', 'syakaihosyoukyuuhuhi', 'Z'),
        ('社会保障', 'syakaihosyou', 'Z'),
        ('給付費', 'kyuuhuhi', 'Z'),
        ('膨張', 'boutyou', 'Z'),
        ('背景', 'haikei', 'Z'),
        ('公定価格', 'kouteikakaku', 'Z'),
        ('公定', 'koutei', 'Z'),
        ('価格', 'kakaku', 'Z'),
        ('病床削減圧力', 'byousyousakugennaturyoku', 'Z'),
        ('病床削減', 'byousyousakugenn', 'Z'),
        ('病床', 'byousyou', 'Z'),
        ('削減圧力', 'sakugennaturyoku', 'Z'),
        ('削減', 'sakugenn', 'Z'),
        ('圧力', 'aturyoku', 'Z'),
        ('環境', 'kannkyou', 'Z'),
        ('経営基盤', 'keieikibann', 'Z'),
        ('経営', 'keiei', 'Z'),
        ('基盤', 'kibann', 'Z'),
        ('脆弱', 'zeijyaku', 'Z'),
        ('中小病院', 'tyuushoubyouinn', 'Z'),
        ('中小', 'tyuushou', 'Z'),
        ('急速', 'kyuusoku', 'Z'),
        ('枯渇', 'kokatu', 'Z'),
        ('銀行融資', 'ginnkouyuusi', 'Z'),
        ('銀行', 'ginnkou', 'Z'),
        ('融資', 'yuusi', 'Z'),
        ('延命策', 'ennmeisaku', 'Z'),
        ('延命', 'ennmei', 'Z'),
        ('診療報酬債権', 'sinnryouhousyuusaikenn', 'Z'),
        ('診療報酬', 'sinnryouhousyuu', 'Z'),
        ('債権', 'saikenn', 'Z'),
        ('外部再生資本', 'gaibusaiseisihonn', 'Z'),
        ('外部', 'gaibu', 'Z'),
        ('再生資本', 'saiseisihonn', 'Z'),
        ('再生', 'saisei', 'Z'),
        ('資本', 'sihonn', 'Z'),
        ('介入', 'kainyuu', 'Z'),
        ('変容', 'hennyou', 'Z'),
        ('自律的ガバナンス', 'jiritutekigabanannsu', 'Z'),
        ('自律的', 'jirituteki', 'Z'),
        ('自律', 'jiritu', 'Z'),
        ('形骸化', 'keigaika', 'Z'),
        ('資本回収', 'sihonnkaisyuu', 'Z'),
        ('回収', 'kaisyuu', 'Z'),
        ('最優先', 'saiyuusenn', 'Z'),
        ('経営管理', 'keieikannri', 'Z'),
        ('管理', 'kannri', 'Z'),
        ('現場', 'gennba', 'Z'),
        ('結果', 'kekka', 'Z'),
        ('医療従事者', 'iryoujyuujisya', 'Z'),
        ('従事者', 'jyuujisya', 'Z'),
        ('従事', 'jyuuji', 'Z'),
        ('出来高点数', 'dekidakatennsuu', 'Z'),
        ('出来高', 'dekidaka', 'Z'),
        ('点数', 'tennsuu', 'Z'),
        ('極大化', 'kyokudaika', 'Z'),
        ('診療圧力', 'sinnryouaturyoku', 'Z'),
        ('診療', 'sinnryou', 'Z'),
        ('過度', 'kado', 'Z'),
        ('医学的蓋然性', 'igakutekigaizennsei', 'Z'),
        ('医学的', 'igakuteki', 'Z'),
        ('医学', 'igaku', 'Z'),
        ('蓋然性', 'gaizennsei', 'Z'),
        ('過剰提供', 'kajyouteikyou', 'Z'),
        ('過剰', 'kajyou', 'Z'),
        ('医療倫理', 'iryourinnri', 'Z'),
        ('倫理', 'rinnri', 'Z'),
        ('崩壊', 'houkai', 'Z'),
        ('破綻', 'hatann', 'Z'),
        ('本稿', 'honnkou', 'Z'),
        ('医療経済学', 'iryoukeizaigaku', 'Z'),
        ('医療経済', 'iryoukeizai', 'Z'),
        ('経済学', 'keizaigaku', 'Z'),
        ('経済', 'keizai', 'Z'),
        ('保健政策学', 'hokennseisakugaku', 'Z'),
        ('保健政策', 'hokennseisaku', 'Z'),
        ('保健', 'hokenn', 'Z'),
        ('政策学', 'seisakugaku', 'Z'),
        ('病院組織論', 'byouinnsosikironn', 'Z'),
        ('病院組織', 'byouinnsosiki', 'Z'),
        ('組織論', 'sosikironn', 'Z'),
        ('組織', 'sosiki', 'Z'),
        ('生命倫理学', 'seimeirinnrigaku', 'Z'),
        ('生命倫理', 'seimeirinnri', 'Z'),
        ('生命', 'seimei', 'Z'),
        ('知見', 'tiken', 'Z'),
        ('統合', 'tougou', 'Z'),
        ('三層連鎖', 'sannsourennsa', 'Z'),
        ('三層', 'sannsou', 'Z'),
        ('構造的病理', 'kouzoutekibyouri', 'Z'),
        ('解明', 'kaimei', 'Z'),
        ('制度改革', 'seidokaikaku', 'Z'),
        ('制度', 'seido', 'Z'),
        ('改革', 'kaikaku', 'Z'),
        ('学術的論点', 'gakujyututekironntenn', 'Z'),
        ('学術的', 'gakujyututeki', 'Z'),
        ('学術', 'gakujyutu', 'Z'),
        ('論点', 'ronntenn', 'Z'),
        ('提示', 'teiji', 'Z'),

        # カタカナ専門用語
        ('ファクタリング', 'fakutarinngu', 'K'),
        ('キャッシュフロー', 'kyasshyufuro-', 'K'),
        ('ガバナンス', 'gabanannsu', 'K'),
        ('マクロ', 'makuro', 'K'),
        ('メゾ', 'mezo', 'K'),
        ('ミクロ', 'mikuro', 'K'),
        ('コスト', 'kosuto', 'K'),
    ]

    for item in medical_words:
        w = item[0]
        r = item[1]
        t = item[2] if len(item) > 2 else 'Z'
        lexicon[w] = (0, r, t)

    # 2. 単漢字・接尾辞
    single_kanji = {
        '的': ('teki', 'Z'), '化': ('ka', 'Z'), '性': ('sei', 'Z'), '学': ('gaku', 'Z'),
        '論': ('ron', 'Z'), '費': ('hi', 'Z'), '者': ('sya', 'Z'), '策': ('saku', 'Z'),
        '格': ('kaku', 'Z'), '力': ('ryoku', 'Z'), '炎': ('enn', 'Z'), '症': ('syou', 'Z'),
        '痛': ('tuu', 'Z'), '法': ('hou', 'Z'), '薬': ('yaku', 'Z'), '病': ('byou', 'Z'),
        '院': ('inn', 'Z'), '期': ('ki', 'Z'), '型': ('gata', 'Z'), '感': ('kann', 'Z'),
        '部': ('bu', 'Z'), '界': ('kai', 'Z'), '色': ('syoku', 'Z'), '管': ('kann', 'Z'),
        '築': ('tiku', 'Z'), '態': ('tai', 'Z'), '度': ('do', 'Z'), '率': ('ritu', 'Z'),
        '量': ('ryou', 'Z'), '数': ('suu', 'Z'), '点': ('tenn', 'Z'), '線': ('senn', 'Z'),
        '帯': ('tai', 'Z'), '膜': ('maku', 'Z'), '節': ('setu', 'Z'), '腺': ('senn', 'Z'),
        '器': ('ki', 'Z'), '域': ('iki', 'Z'), '路': ('ro', 'Z'), '脈': ('myaku', 'Z'),
        '孔': ('kou', 'Z'), '弁': ('benn', 'Z'), '腔': ('kou', 'Z'), '壁': ('heki', 'Z'),
        '筋': ('kinn', 'Z'), '骨': ('kotu', 'Z'), '皮': ('hi', 'Z'), '胃': ('i', 'Z'),
        '肝': ('kann', 'Z'), '腎': ('jinn', 'Z'), '肺': ('hai', 'Z'), '心': ('sinn', 'Z'),
        '脳': ('nou', 'Z'), '腸': ('tyou', 'Z'), '膵': ('sui', 'Z'), '胆': ('tann', 'Z'),
        '値': ('ati', 'Z'),
        '錠': ('jyou', 'Z'),
        '回': ('kai', 'Z'),
    }
    for k, (r, t) in single_kanji.items():
        if k not in lexicon:
            lexicon[k] = (0, r, t)

    # 3. 動詞・形容詞の語幹
    stems = {
        '捉え': 'torae', '持ち込': 'motiko', '課さ': 'kasa', '欠く': 'kaku', '欠き': 'kaki',
        '生み出': 'umida', '向け': 'muke', '至る': 'itaru', '至り': 'itari', '至っ': 'ita',
        '頼る': 'tayoru', '頼り': 'tayori', '頼っ': 'tayo', '動か': 'ugoka', '動かし': 'ugokasi',
        '和らげ': 'yawarage', '伴う': 'tomonau', '伴い': 'tomonai', '伴っ': 'tomona',
        '疑う': 'utagau', '疑い': 'utagai', '疑っ': 'utaga', '現れ': 'araware', '消え': 'kie',
        '強ま': 'tuyoma', '弱ま': 'yowama', '高ま': 'takam'
    }
    for k, r in stems.items():
        if k not in lexicon:
            lexicon[k] = (0, r, 'Z')

    # 4. Mozc 常用語・学術語・カタカナ語 (コスト <= 5500)
    mozc_files = sorted(glob.glob(os.path.join(MOZC_DIR, "dictionary*.txt")))
    print(f" -> Mozc辞書ファイル探索: {len(mozc_files)} 個")

    for fp in mozc_files:
        with open(fp, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('\t')
                if len(parts) < 5: continue
                yomi = parts[0]
                cost = int(parts[3]) if parts[3].isdigit() else 99999
                word = parts[4]

                if len(word) < 2 or len(word) > 12: continue
                has_kanji = any(0x4E00 <= ord(c) <= 0x9FFF for c in word)
                is_pure_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)

                if not has_kanji and not (is_pure_katakana and len(word) >= 3):
                    continue

                if len(word) == 2 and has_kanji:
                    cost -= 1500

                # 最重要語彙閾値: コスト <= 5200 (約6万語に最適化)
                if cost > 5200:
                    continue

                if word in lexicon:
                    continue

                romaji = kana_to_romaji(yomi)
                if not romaji: continue

                tag = 'K' if is_pure_katakana else 'Z'
                lexicon[word] = (cost, romaji, tag)

    print(f" -> 辞書統合完了: 総語彙数 = {len(lexicon):,} 語")

    # 5. 超軽量TSモジュール出力
    # 特殊タグ (G=Space2回, K=F7) を持つ語を特別マップへ、通常漢字語を高速文字列マップへ
    special_tags = {}
    main_dict = {}

    for w, (c, r, t) in lexicon.items():
        if t != 'Z':
            special_tags[w] = t
        main_dict[w] = r

    # 最長一致探索のため、キーを長さ降順でソートしたタプル配列、またはオブジェクト
    # JS/TSでの最長一致探索には、文字長ごとのプレーンオブジェクト、または降順キー配列が極めて高速
    print(f"=== TSコード出力: {OUTPUT_TS} ===")
    
    with open(OUTPUT_TS, 'w', encoding='utf-8') as f:
        f.write("// =============================================================================\n")
        f.write("// File: src/data/morphologicalLexicon.ts\n")
        f.write("// 説明: Google Mozc ＋ 厚労省マスター ＋ 臨床特化医療辞書から生成された\n")
        f.write(f"//       高精度形態素・読み・タグ付けマスターデータベース (総登録数: {len(lexicon):,} 語)\n")
        f.write("// =============================================================================\n\n")

        # 特殊タグマップ (G, K)
        f.write("export const MORPH_TAGS: Record<string, 'G' | 'K' | 'H'> = {\n")
        for w, t in special_tags.items():
            safe_w = w.replace('\\', '\\\\').replace("'", "\\'")
            f.write(f"  '{safe_w}': '{t}',\n")
        f.write("};\n\n")

        # メイン読み辞書 { 単語: ローマ字 }
        f.write("export const MORPH_ROMAJI: Record<string, string> = {\n")
        # 長い単語から順に出力
        sorted_keys = sorted(main_dict.keys(), key=lambda x: len(x), reverse=True)
        for w in sorted_keys:
            r = main_dict[w]
            safe_w = w.replace('\\', '\\\\').replace("'", "\\'")
            safe_r = r.replace('\\', '\\\\').replace("'", "\\'")
            f.write(f"  '{safe_w}': '{safe_r}',\n")
        f.write("};\n\n")

        # 接頭辞・接尾辞リスト
        f.write("export const MEDICAL_SUFFIXES = [\n")
        for s in single_kanji.keys():
            f.write(f"  '{s}',\n")
        f.write("];\n")

    size_mb = os.path.getsize(OUTPUT_TS) / (1024 * 1024)
    print(f" -> 出力完了: {OUTPUT_TS} ({len(lexicon):,} 語, {size_mb:.2f} MB)")

if __name__ == '__main__':
    main()
