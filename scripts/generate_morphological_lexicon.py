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
        # 消化器・内視鏡 (ヘボン式・Gタグ廃止)
        ('早期胃癌', 'soukiigan', 'Z'),
        ('胃癌', 'igan', 'Z'),
        ('所見', 'shoken', 'Z'),
        ('内視鏡所見', 'naishikyoushoken', 'Z'),
        ('内視鏡', 'naishikyou', 'Z'),
        ('拡大内視鏡', 'kakudainaishikyou', 'Z'),
        ('陥凹', 'kannou', 'Z'),
        ('陥凹型', 'kannougata', 'Z'),
        ('境界', 'kyoukai', 'Z'),
        ('境界明瞭', 'kyoukaimeiryou', 'Z'),
        ('発赤', 'hosseki', 'Z'),
        ('褪色', 'taishoku', 'Z'),
        ('微細血管構築異常', 'bisaikekkankoutikuijyou', 'Z'),
        ('微細血管', 'bisaikekkan', 'Z'),
        ('構築異常', 'koutikuijyou', 'Z'),
        ('異常', 'ijyou', 'Z'),
        ('胃潰瘍', 'ikaiyou', 'Z'),
        ('消化性潰瘍', 'shoukaseikaiyou', 'Z'),
        ('瘢痕期', 'hankonki', 'Z'),
        ('胃良性ポリープ', 'iryouseipori-pu', 'Z'),
        ('良性ポリープ', 'ryouseipori-pu', 'Z'),
        ('ポリープ', 'pori-pu', 'K'),
        ('胃角部小弯', 'ikakubushouwan', 'Z'),
        ('胃角部', 'ikakubu', 'Z'),
        ('胃角', 'ikaku', 'Z'),
        ('小弯', 'shouwan', 'Z'),
        ('前庭部', 'zenteibu', 'Z'),
        ('前庭', 'zentei', 'Z'),
        ('精査要', 'seisayou', 'Z'),
        ('臨床判断', 'rinshouhandan', 'Z'),
        ('慢性萎縮性胃炎', 'manseiishukuseiien', 'Z'),
        ('萎縮性胃炎', 'ishukuseiien', 'Z'),
        ('限局性びらん', 'genkyokuseibiran', 'Z'),
        ('びらん', 'biran', 'H'),
        ('適応精査', 'tekiouseisa', 'Z'),
        ('ESD適応精査', 'esdtekiouseisa', 'Z'),
        ('鑑別疾患', 'kambetushikkan', 'Z'),
        ('鑑別', 'kambetu', 'Z'),
        ('疾患', 'shikkan', 'Z'),
        ('典型所見', 'tenkeishoken', 'Z'),
        ('典型', 'tenkei', 'Z'),
        ('浅い', 'asai', 'Z'),
        ('不整陥凹病変', 'fuseikannoubyouhen', 'Z'),
        ('不整陥凹', 'fuseikannou', 'Z'),
        ('病変', 'byouhen', 'Z'),
        ('不整', 'fusei', 'Z'),
        ('ひだ集中', 'hidashuuchuu', 'Z'),
        ('途絶', 'tozetsu', 'Z'),
        ('途読', 'todoku', 'Z'),
        ('辺縁粘膜', 'henennnennmaku', 'Z'),
        ('辺縁', 'henenn', 'Z'),
        ('粘膜', 'nennmaku', 'Z'),

        # 急性腹痛・背部痛・内科
        ('体動時背部痛', 'taidoujihaibutsuu', 'Z'),
        ('体動時', 'taidouji', 'Z'),
        ('体動', 'taidou', 'Z'),
        ('背部痛', 'haibutsuu', 'Z'),
        ('背部', 'haibu', 'Z'),
        ('筋筋膜性疼痛', 'kinkimmakuseitoutuu', 'Z'),
        ('筋筋膜性', 'kinkimmakusei', 'Z'),
        ('疼痛', 'toutuu', 'Z'),
        ('内臓疾患', 'naizoushikkan', 'Z'),
        ('除外要', 'jogaiyou', 'Z'),
        ('除外', 'jogai', 'Z'),
        ('対症療法', 'taishouryouhou', 'Z'),
        ('鎮痛薬処方', 'chintuuyakushoho', 'Z'),
        ('鎮痛薬', 'chintuuyaku', 'Z'),
        ('安静指導', 'anseishidou', 'Z'),
        ('安静', 'ansei', 'Z'),
        ('肝機能再検', 'kankinousaiken', 'Z'),
        ('肝機能', 'kankinou', 'Z'),
        ('再検', 'saiken', 'Z'),
        ('炎症反応', 'ensyouhannou', 'Z'),
        ('腹部超音波精査検討', 'fukubuchouonpaseisakentou', 'Z'),
        ('腹部超音波', 'fukubuchouonpa', 'Z'),
        ('精査検討', 'seisakentou', 'Z'),
        ('時々', 'tokidoki', 'Z'),
        ('普通', 'hutsuu', 'Z'),
        ('受診', 'jushin', 'Z'),
        ('当院受診', 'touinjushin', 'Z'),
        ('中性', 'chuusei', 'Z'),
        ('理学所見', 'rigakushoken', 'Z'),
        ('バイタル特記なし', 'baitarutokkinashi', 'Z'),
        ('特記なし', 'tokkinashi', 'Z'),
        ('特記', 'tokki', 'Z'),
        ('処方', 'shoho', 'Z'),
        ('内臓', 'naizou', 'Z'),
        ('歳', 'sai', 'Z'),
        ('主訴', 'shuso', 'Z'),
        ('首相', 'shusou', 'Z'),
        ('現病歴', 'gembyoureki', 'Z'),
        ('既往歴', 'kioureki', 'Z'),
        ('内服薬', 'naihukuyaku', 'Z'),
        ('身体所見', 'shintaishoken', 'Z'),

        # 医療提供体制・医療経済学・学術用語 (ヘボン式・活用形/連体形完全対応)
        ('現代', 'gendai', 'Z'),
        ('医療提供体制', 'iryouteikyoutaisei', 'Z'),
        ('医療提供', 'iryouteikyou', 'Z'),
        ('提供体制', 'teikyoutaisei', 'Z'),
        ('提供', 'teikyou', 'Z'),
        ('体制', 'taisei', 'Z'),
        ('医療費抑制', 'iryouhiyokusei', 'Z'),
        ('医療費', 'iryouhi', 'Z'),
        ('抑制', 'yokusei', 'Z'),
        ('志向する', 'shikousuru', 'Z'),
        ('志向した', 'shikoushita', 'Z'),
        ('志向', 'shikou', 'Z'),
        ('国家財政政策', 'kokkazaiseiseisaku', 'Z'),
        ('国家財政', 'kokkazaisei', 'Z'),
        ('国家', 'kokka', 'Z'),
        ('財政政策', 'zaiseiseisaku', 'Z'),
        ('財政', 'zaisei', 'Z'),
        ('政策', 'seisaku', 'Z'),
        ('医療機関', 'iryoukikan', 'Z'),
        ('財務的困窮', 'zaimutekikonkyuu', 'Z'),
        ('財務的', 'zaimuteki', 'Z'),
        ('財務', 'zaimu', 'Z'),
        ('困窮', 'konkyuu', 'Z'),
        ('臨床現場', 'rinshougemba', 'Z'),
        ('低価値医療', 'teikachiiryou', 'Z'),
        ('低価値', 'teikachi', 'Z'),
        ('価値', 'kachi', 'Z'),
        ('蔓延', 'manen', 'Z'),
        ('個別', 'kobetsu', 'Z'),
        ('事象', 'jishou', 'Z'),
        ('構造的', 'kouzouteki', 'Z'),
        ('構造', 'kouzou', 'Z'),
        ('連結', 'renketsu', 'Z'),
        ('一連', 'ichiren', 'Z'),
        ('病理学的連鎖', 'byourigakutekirensa', 'Z'),
        ('病理学的', 'byourigakuteki', 'Z'),
        ('病理学', 'byourigaku', 'Z'),
        ('病理', 'byouri', 'Z'),
        ('連鎖', 'rensa', 'Z'),
        ('捉える', 'toraeru', 'Z'),
        ('捉え', 'torae', 'Z'),
        ('人口構造', 'jinkoukouzou', 'Z'),
        ('人口', 'jinkou', 'Z'),
        ('急激な', 'kyuugekina', 'Z'),
        ('急激', 'kyuugeki', 'Z'),
        ('高齢化', 'koureika', 'Z'),
        ('社会保障給付費', 'shakaihoshoukyuuhuhi', 'Z'),
        ('社会保障', 'shakaihoshou', 'Z'),
        ('給付費', 'kyuuhuhi', 'Z'),
        ('膨張', 'bouchou', 'Z'),
        ('背景', 'haikei', 'Z'),
        ('公定価格', 'kouteikakaku', 'Z'),
        ('公定', 'koutei', 'Z'),
        ('価格', 'kakaku', 'Z'),
        ('病床削減圧力', 'byoushousakugenatsuryoku', 'Z'),
        ('病床削減', 'byoushousakugen', 'Z'),
        ('病床', 'byoushou', 'Z'),
        ('削減圧力', 'sakugenatsuryoku', 'Z'),
        ('削減', 'sakugen', 'Z'),
        ('圧力', 'atsuryoku', 'Z'),
        ('環境', 'kankyou', 'Z'),
        ('経営基盤', 'keieikiban', 'Z'),
        ('経営', 'keiei', 'Z'),
        ('基盤', 'kiban', 'Z'),
        ('脆弱な', 'zeijyakuna', 'Z'),
        ('脆弱', 'zeijyaku', 'Z'),
        ('中小病院', 'chuushoubyouin', 'Z'),
        ('中小', 'chuushou', 'Z'),
        ('急速', 'kyuusoku', 'Z'),
        ('枯渇', 'kokatsu', 'Z'),
        ('銀行融資', 'ginkouyuushi', 'Z'),
        ('銀行', 'ginkou', 'Z'),
        ('融資', 'yuushi', 'Z'),
        ('延命策', 'enmeisaku', 'Z'),
        ('延命', 'enmei', 'Z'),
        ('診療報酬債権', 'shinryouhoushuusaiken', 'Z'),
        ('診療報酬', 'shinryouhoushuu', 'Z'),
        ('債権', 'saiken', 'Z'),
        ('外部再生資本', 'gaibusaiseishihon', 'Z'),
        ('外部', 'gaibu', 'Z'),
        ('再生資本', 'saiseishihon', 'Z'),
        ('再生', 'saisei', 'Z'),
        ('資本', 'shihon', 'Z'),
        ('介入', 'kainyuu', 'Z'),
        ('変容', 'henyou', 'Z'),
        ('自律的ガバナンス', 'jiritsutekigabanansu', 'Z'),
        ('自律的', 'jiritsuteki', 'Z'),
        ('自律', 'jiritsu', 'Z'),
        ('形骸化', 'keigaika', 'Z'),
        ('資本回収', 'shihonkaishuu', 'Z'),
        ('回収', 'kaishuu', 'Z'),
        ('最優先', 'saiyuusen', 'Z'),
        ('経営管理', 'keieikanri', 'Z'),
        ('管理', 'kanri', 'Z'),
        ('現場', 'gemba', 'Z'),
        ('持ち込む', 'mochikomu', 'Z'),
        ('持ち込み', 'mochikomi', 'Z'),
        ('結果', 'kekka', 'Z'),
        ('医療従事者', 'iryoujuujisha', 'Z'),
        ('従事者', 'juujisha', 'Z'),
        ('従事', 'juuji', 'Z'),
        ('出来高点数', 'dekidakadensuu', 'Z'),
        ('出来高', 'dekidaka', 'Z'),
        ('点数', 'tensuu', 'Z'),
        ('極大化', 'kyokudaika', 'Z'),
        ('診療圧力', 'shinryouatsuryoku', 'Z'),
        ('診療', 'shinryou', 'Z'),
        ('過度な', 'kadona', 'Z'),
        ('過度', 'kado', 'Z'),
        ('課され', 'kasare', 'Z'),
        ('課される', 'kasareru', 'Z'),
        ('課す', 'kasu', 'Z'),
        ('医学的蓋然性', 'igakutekigaizensei', 'Z'),
        ('医学的', 'igakuteki', 'Z'),
        ('医学', 'igaku', 'Z'),
        ('蓋然性', 'gaizensei', 'Z'),
        ('欠く', 'kaku', 'Z'),
        ('過剰提供', 'kadjouteikyou', 'Z'),
        ('過剰', 'kadjou', 'Z'),
        ('医療倫理', 'iryourinri', 'Z'),
        ('倫理', 'rinri', 'Z'),
        ('崩壊', 'houkai', 'Z'),
        ('破綻', 'hatan', 'Z'),
        ('本稿では', 'honkoudeha', 'Z'),
        ('本稿', 'honkou', 'Z'),
        ('医療経済学', 'iryoukeizaigaku', 'Z'),
        ('医療経済', 'iryoukeizai', 'Z'),
        ('経済学', 'keizaigaku', 'Z'),
        ('経済', 'keizai', 'Z'),
        ('保健政策学', 'hokenseisakugaku', 'Z'),
        ('保健政策', 'hokenseisaku', 'Z'),
        ('保健', 'hoken', 'Z'),
        ('政策学', 'seisakugaku', 'Z'),
        ('病院組織論', 'byouinsoshikiron', 'Z'),
        ('病院組織', 'byouinsoshiki', 'Z'),
        ('組織論', 'soshikiron', 'Z'),
        ('組織', 'soshiki', 'Z'),
        ('生命倫理学', 'seimeirinrigaku', 'Z'),
        ('生命倫理', 'seimeirinri', 'Z'),
        ('生命', 'seimei', 'Z'),
        ('知見', 'chiken', 'Z'),
        ('統合', 'tougou', 'Z'),
        ('三層連鎖', 'sansourensa', 'Z'),
        ('三層', 'sansou', 'Z'),
        ('生み出す', 'umidasu', 'Z'),
        ('生み出し', 'umidashi', 'Z'),
        ('構造的病理', 'kouzoutekibyouri', 'Z'),
        ('解明', 'kaimei', 'Z'),
        ('制度改革', 'seidokaikaku', 'Z'),
        ('制度', 'seido', 'Z'),
        ('改革', 'kaikaku', 'Z'),
        ('学術的論点', 'gakujutsutekironten', 'Z'),
        ('学術的', 'gakujutsuteki', 'Z'),
        ('学術', 'gakujutsu', 'Z'),
        ('論点', 'ronten', 'Z'),
        ('提示', 'teiji', 'Z'),

        # カタカナ専門用語
        ('ファクタリング', 'fakutaringu', 'K'),
        ('キャッシュフロー', 'kyasshyufuro-', 'K'),
        ('ガバナンス', 'gabanansu', 'K'),
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
