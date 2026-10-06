#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ 超高精度・統合日本語バイナリ辞書コンパイラ (v3.0)
- [1] CLINICAL_COMPOUND_MAP & INFLECTED_WORD_MAP (最優先)
- [2] 厚労省 医科診療行為マスター (s_*.csv) - 手術手技(K)・処置(J)・検査(D)・画像(E)
- [3] ORCA / DMiME 医療辞書 (dmime_*.txt) - 解剖部位・身体所見・症状・臨床表現
- [4] 厚労省 傷病名マスター (b_*.txt)
- [5] 厚労省 医薬品マスター (y_*.csv) ＆ ベース薬品名抽出
- [6] Google Mozc OSS 一般日本語辞書 (dictionary00.txt 〜 dictionary09.txt)
から AtomS3U (8MB Flash / 5.8MB SPIFFS) 向け 32バイト固定長バイナリ辞書 med_terms.bin を生成
"""

import os
import sys
import csv
import re
import struct
import unicodedata
import urllib.request
import pykakasi

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "data", "mozc_cache")
DATA_DIR = os.path.join(BASE_DIR, "data")
FIRMWARE_DATA_DIR = os.path.join(BASE_DIR, "firmware", "data")

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FIRMWARE_DATA_DIR, exist_ok=True)

kks = pykakasi.kakasi()

def fnv1a_32(text: str) -> int:
    norm = unicodedata.normalize('NFKC', text).strip()
    h = 0x811C9DC5
    for b in norm.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h

def kana_to_romaji(kana_text: str) -> str:
    # 半角カナを全角に正規化
    norm_kana = unicodedata.normalize('NFKC', kana_text)
    result = kks.convert(norm_kana)
    romaji_parts = []
    for item in result:
        h = item['hepburn']
        romaji_parts.append(h)
    romaji = "".join(romaji_parts).lower()
    # 撥音「ん」の正規化: 末尾の n は nn 化してナ行癒着を防止
    if romaji.endswith('n') and not romaji.endswith('nn'):
        romaji += 'n'
    # 特殊記号を除去し英字とハイフンのみ残す
    clean = "".join([c for c in romaji if c.isalnum() or c == '-'])
    return clean

def clean_drug_base_name(name: str) -> str:
    n = unicodedata.normalize('NFKC', name)
    n = re.sub(r"【.*?】", "", n)
    n = re.sub(r"「.*?」", "", n)
    n = re.sub(r"（.*?）", "", n)
    n = re.sub(r"\(.*?\)", "", n)
    # 規格・剤形を除去
    parts = re.split(r"[0-9]+[．\.%％mgｍｇ包個本管枚点袋瓶]|錠|散|カプセル|細粒|顆粒|末|シロップ|注|点眼|軟膏|クリーム|テープ|パップ|ゲル|吸入", n)
    base = parts[0].strip(" 　・-")
    return base

def clean_procedure_base_name(name: str) -> str:
    n = unicodedata.normalize('NFKC', name)
    n = re.sub(r"【.*?】", "", n)
    n = re.sub(r"「.*?」", "", n)
    n = re.sub(r"（.*?）", "", n)
    n = re.sub(r"\(.*?\)", "", n)
    parts = re.split(r"加算|注|減算|生活療養", n)
    base = parts[0].strip(" 　・-")
    return base

term_dict = {}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Webアプリ臨床推論辞書 (最優先・コスト0)
# ─────────────────────────────────────────────────────────────────────────────
print("=== [1] Webアプリ臨床辞書 (CLINICAL_COMPOUND_MAP, INFLECTED_WORD_MAP) の解析 ===")
ts_path = os.path.join(BASE_DIR, "src", "utils", "imePrecisionCompiler.ts")
if os.path.exists(ts_path):
    with open(ts_path, "r", encoding="utf-8") as f:
        content = f.read()

    # CLINICAL_COMPOUND_MAP
    m1 = re.search(r"export const CLINICAL_COMPOUND_MAP: Record<string, string> = \{([\s\S]*?)\};", content)
    if m1:
        pairs = re.findall(r"[\x27\x22]([^\x27\x22]+)[\x27\x22]\s*:\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]", m1.group(1))
        for word, rom in pairs:
            w_norm = unicodedata.normalize('NFKC', word).strip()
            if len(w_norm) < 2: continue
            h = fnv1a_32(w_norm)
            is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in w_norm)
            mode = 2 if is_katakana else 1
            term_dict[h] = (w_norm, rom[:25], mode, 0)
        print(f" -> CLINICAL_COMPOUND_MAP 登録: {len(pairs)} 件")

    # INFLECTED_WORD_MAP
    m2 = re.search(r"export const INFLECTED_WORD_MAP: Record<string, string> = \{([\s\S]*?)\};", content)
    if m2:
        pairs = re.findall(r"[\x27\x22]([^\x27\x22]+)[\x27\x22]\s*:\s*[\x27\x22]([^\x27\x22]+)[\x27\x22]", m2.group(1))
        for word, rom in pairs:
            w_norm = unicodedata.normalize('NFKC', word).strip()
            if len(w_norm) < 2: continue
            h = fnv1a_32(w_norm)
            term_dict[h] = (w_norm, rom[:25], 1, 0)
        print(f" -> INFLECTED_WORD_MAP 登録: {len(pairs)} 件")

print(f" -> 臨床推論辞書合計: {len(term_dict)} 件")

# ─────────────────────────────────────────────────────────────────────────────
# 2. 厚労省 医科診療行為マスター (s_*.csv / txt)
# ─────────────────────────────────────────────────────────────────────────────
print("=== [2] 厚労省 医科診療行為マスター (s_*.csv / txt) の解析 ===")
proc_files = [f for f in os.listdir(BASE_DIR) if f.lower().startswith('s_') and f.lower().endswith(('.csv', '.txt'))]
if proc_files:
    target = os.path.join(BASE_DIR, proc_files[0])
    print(f" -> 医科診療行為マスター解析: {os.path.basename(target)}")
    count_s = 0
    with open(target, 'r', encoding='cp932', errors='replace') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) > 6:
                name = unicodedata.normalize('NFKC', row[4].strip())
                kana = unicodedata.normalize('NFKC', row[6].strip())
                if not name or len(name) < 2 or name.startswith('＊＊'):
                    continue

                candidates = [(name, kana)]
                base = clean_procedure_base_name(name)
                if len(base) >= 2 and base != name:
                    candidates.append((base, base))

                for w, k in candidates:
                    romaji = kana_to_romaji(k)[:25]
                    if romaji:
                        h = fnv1a_32(w)
                        if h not in term_dict:
                            is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in w)
                            mode = 2 if is_katakana else 1
                            term_dict[h] = (w, romaji, mode, 50)
                            count_s += 1
    print(f"    診療行為エントリ登録: {count_s:,} 件 (累計: {len(term_dict):,} 件)")

# ─────────────────────────────────────────────────────────────────────────────
# 3. ORCA / DMiME 医療辞書 (dmime_*.txt)
# ─────────────────────────────────────────────────────────────────────────────
print("=== [3] ORCA / DMiME 医療辞書 (dmime_*.txt) の解析 ===")
dmime_files = [f for f in os.listdir(BASE_DIR) if 'dmime' in f.lower() and f.lower().endswith(('.txt', '.csv', '.tsv'))]
if dmime_files:
    target = os.path.join(BASE_DIR, dmime_files[0])
    print(f" -> DMiME 医療辞書解析: {os.path.basename(target)}")
    count_dm = 0
    with open(target, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            parts = line.strip().split(',')
            if len(parts) >= 2:
                yomi = unicodedata.normalize('NFKC', parts[0].strip())
                word = unicodedata.normalize('NFKC', parts[1].strip())
                if len(word) < 2 or word.startswith('＊＊'):
                    continue
                # 日本語文字を含むか
                if not any(ord(c) >= 0x3040 for c in word):
                    continue
                romaji = kana_to_romaji(yomi)[:25]
                if romaji:
                    h = fnv1a_32(word)
                    if h not in term_dict:
                        is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)
                        mode = 2 if is_katakana else 1
                        term_dict[h] = (word, romaji, mode, 60)
                        count_dm += 1
    print(f"    DMiME エントリ登録: {count_dm:,} 件 (累計: {len(term_dict):,} 件)")

# ─────────────────────────────────────────────────────────────────────────────
# 4. 厚労省 傷病名マスター (b_*.txt / csv)
# ─────────────────────────────────────────────────────────────────────────────
print("=== [4] 厚労省 傷病名マスター (b_*.txt / csv) の解析 ===")
disease_files = [f for f in os.listdir(BASE_DIR) if f.lower().startswith('b') and f.lower().endswith(('.csv', '.txt'))]
if disease_files:
    target = os.path.join(BASE_DIR, disease_files[0])
    print(f" -> 傷病名マスター解析: {os.path.basename(target)}")
    count_d = 0
    with open(target, 'r', encoding='cp932', errors='replace') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) > 9:
                name = unicodedata.normalize('NFKC', row[5].strip())
                kana = unicodedata.normalize('NFKC', row[9].strip())
                if not name or len(name) < 2 or '未コード化' in name or name.startswith('＊＊'):
                    continue
                romaji = kana_to_romaji(kana)[:25]
                if romaji:
                    h = fnv1a_32(name)
                    if h not in term_dict:
                        is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in name)
                        mode = 2 if is_katakana else 1
                        term_dict[h] = (name, romaji, mode, 80)
                        count_d += 1
    print(f"    傷病名エントリ登録: {count_d:,} 件 (累計: {len(term_dict):,} 件)")

# ─────────────────────────────────────────────────────────────────────────────
# 5. 厚労省 医薬品マスター (y_*.csv / txt)
# ─────────────────────────────────────────────────────────────────────────────
print("=== [5] 厚労省 医薬品マスター (y_*.csv / txt) の解析 ===")
drug_files = [f for f in os.listdir(BASE_DIR) if f.lower().startswith('y') and f.lower().endswith(('.csv', '.txt'))]
if drug_files:
    target = os.path.join(BASE_DIR, drug_files[0])
    print(f" -> 医薬品マスター解析: {os.path.basename(target)}")
    count_y = 0
    with open(target, 'r', encoding='cp932', errors='replace') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) > 6:
                name = unicodedata.normalize('NFKC', row[4].strip())
                kana = unicodedata.normalize('NFKC', row[6].strip())
                gen_name = unicodedata.normalize('NFKC', row[37].strip()) if len(row) > 37 else ""
                
                candidates = []
                if name and len(name) >= 2:
                    candidates.append((name, kana))
                
                base1 = clean_drug_base_name(name)
                if len(base1) >= 2 and base1 != name:
                    candidates.append((base1, base1))
                
                if gen_name:
                    base2 = clean_drug_base_name(gen_name)
                    if len(base2) >= 2:
                        candidates.append((base2, base2))

                for w, k in candidates:
                    romaji = kana_to_romaji(k)[:25]
                    if romaji:
                        h = fnv1a_32(w)
                        if h not in term_dict:
                            is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in w)
                            mode = 2 if is_katakana else 1
                            term_dict[h] = (w, romaji, mode, 80)
                            count_y += 1
    print(f"    医薬品エントリ登録: {count_y:,} 件 (累計: {len(term_dict):,} 件)")

# ─────────────────────────────────────────────────────────────────────────────
# 6. Mozc 公式辞書データの解析＆一般重要語彙の抽出（活用形自動全展開エンジン搭載）
# ─────────────────────────────────────────────────────────────────────────────
print("=== [6] Mozc 公式辞書データの解析＆一般重要語彙の抽出（活用形全展開＆連濁優先） ===")

def generate_inflected_forms(word: str, yomi: str, base_cost: int):
    """
    動詞・形容詞の基本形から、高頻度の活用形（連用形、テ形、タ形、未然形等）を自動生成。
    語幹音読み分解によるキメラ語生成（関わって➔緩和って、詳しく➔少市区等）を根本根絶する。
    """
    forms = []
    if len(word) < 2 or len(yomi) < 2:
        return forms
    
    # 漢字を含んでいる単語のみ対象
    if not any(0x4E00 <= ord(c) <= 0x9FFF for c in word):
        return forms

    # 1. 形容詞: 〜い (例: 詳しい、高い、低い、重い、浅い、近い)
    if word.endswith('い') and yomi.endswith('い'):
        w_stem, y_stem = word[:-1], yomi[:-1]
        forms.append((w_stem + 'く', y_stem + 'く', base_cost + 5))      # 詳しく
        forms.append((w_stem + 'かった', y_stem + 'かった', base_cost + 15))  # 詳しかった
        forms.append((w_stem + 'くて', y_stem + 'くて', base_cost + 10))    # 詳しくて
        forms.append((w_stem + 'ければ', y_stem + 'ければ', base_cost + 20))  # 詳しければ
        forms.append((w_stem + 'さ', y_stem + 'さ', base_cost + 20))      # 詳しさ
        return forms

    # 2. サ変動詞: 〜する (例: 局在する、侵入する、発生する)
    if word.endswith('する') and yomi.endswith('する'):
        w_stem, y_stem = word[:-2], yomi[:-2]
        forms.append((w_stem + 'し', y_stem + 'し', base_cost + 5))
        forms.append((w_stem + 'して', y_stem + 'して', base_cost + 5))
        forms.append((w_stem + 'した', y_stem + 'した', base_cost + 5))
        forms.append((w_stem + 'しない', y_stem + 'しない', base_cost + 15))
        forms.append((w_stem + 'される', y_stem + 'される', base_cost + 15))
        forms.append((w_stem + 'させる', y_stem + 'させる', base_cost + 20))
        return forms

    # 3. 動詞: 語尾活用
    last_w, last_y = word[-1], yomi[-1]
    w_stem, y_stem = word[:-1], yomi[:-1]

    if last_w == 'る' and last_y == 'る':
        # 一段動詞（〜える、〜いる）の可能性判定
        if len(yomi) >= 2 and yomi[-2] in 'いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ':
            forms.append((w_stem, y_stem, base_cost + 10))
            forms.append((w_stem + 'て', y_stem + 'て', base_cost + 10))
            forms.append((w_stem + 'た', y_stem + 'た', base_cost + 10))
            forms.append((w_stem + 'ない', y_stem + 'ない', base_cost + 15))
            forms.append((w_stem + 'ます', y_stem + 'ます', base_cost + 15))
            forms.append((w_stem + 'られる', y_stem + 'られる', base_cost + 20))
        # 五段ラ行（関わる、減る、折る、戻る等）
        forms.append((w_stem + 'り', y_stem + 'り', base_cost + 10))
        forms.append((w_stem + 'って', y_stem + 'って', base_cost + 10))
        forms.append((w_stem + 'った', y_stem + 'った', base_cost + 10))
        forms.append((w_stem + 'らない', y_stem + 'らない', base_cost + 15))
        forms.append((w_stem + 'ります', y_stem + 'ります', base_cost + 15))
    elif last_w == 'く' and last_y == 'く':  # 五段カ行（引く、抜く、聞く、届く、動く）
        forms.append((w_stem + 'き', y_stem + 'き', base_cost + 10))
        forms.append((w_stem + 'いて', y_stem + 'いて', base_cost + 10))
        forms.append((w_stem + 'いた', y_stem + 'いた', base_cost + 10))
        forms.append((w_stem + 'かない', y_stem + 'かない', base_cost + 15))
        forms.append((w_stem + 'きます', y_stem + 'きます', base_cost + 15))
    elif last_w == 'ぐ' and last_y == 'ぐ':  # 五段ガ行（防ぐ、注ぐ）
        forms.append((w_stem + 'ぎ', y_stem + 'ぎ', base_cost + 10))
        forms.append((w_stem + 'いで', y_stem + 'いで', base_cost + 10))
        forms.append((w_stem + 'いだ', y_stem + 'いだ', base_cost + 10))
        forms.append((w_stem + 'がない', y_stem + 'がない', base_cost + 15))
        forms.append((w_stem + 'ぎます', y_stem + 'ぎます', base_cost + 15))
    elif last_w == 'す' and last_y == 'す':  # 五段サ行（増やす、減らす、起こす、落とす、残す、治す）
        forms.append((w_stem + 'し', y_stem + 'し', base_cost + 10))
        forms.append((w_stem + 'して', y_stem + 'して', base_cost + 10))
        forms.append((w_stem + 'した', y_stem + 'した', base_cost + 10))
        forms.append((w_stem + 'さない', y_stem + 'さない', base_cost + 15))
        forms.append((w_stem + 'します', y_stem + 'します', base_cost + 15))
    elif last_w == 'つ' and last_y == 'つ':  # 五段タ行（保つ、待つ）
        forms.append((w_stem + 'ち', y_stem + 'ち', base_cost + 10))
        forms.append((w_stem + 'って', y_stem + 'って', base_cost + 10))
        forms.append((w_stem + 'った', y_stem + 'った', base_cost + 10))
        forms.append((w_stem + 'たない', y_stem + 'たない', base_cost + 15))
    elif last_w == 'む' and last_y == 'む':  # 五段マ行（飲む、含む、進む、痛む）
        forms.append((w_stem + 'み', y_stem + 'み', base_cost + 10))
        forms.append((w_stem + 'んで', y_stem + 'んで', base_cost + 10))
        forms.append((w_stem + 'んだ', y_stem + 'んだ', base_cost + 10))
        forms.append((w_stem + 'まない', y_stem + 'まない', base_cost + 15))
    elif last_w == 'う' and last_y == 'う':  # 五段ワ行（追う、伴う、疑う、補う）
        forms.append((w_stem + 'い', y_stem + 'い', base_cost + 10))
        forms.append((w_stem + 'って', y_stem + 'って', base_cost + 10))
        forms.append((w_stem + 'った', y_stem + 'った', base_cost + 10))
        forms.append((w_stem + 'わない', y_stem + 'わない', base_cost + 15))
    elif last_w == 'ぶ' and last_y == 'ぶ':  # 五段バ行（選ぶ、並ぶ）
        forms.append((w_stem + 'び', y_stem + 'び', base_cost + 10))
        forms.append((w_stem + 'んで', y_stem + 'んで', base_cost + 10))
        forms.append((w_stem + 'んだ', y_stem + 'んだ', base_cost + 10))
        forms.append((w_stem + 'ばない', y_stem + 'ばない', base_cost + 15))

    return forms

mozc_files = []
for i in range(10):
    fn = f"dictionary0{i}.txt"
    fp = os.path.join(CACHE_DIR, fn)
    if os.path.exists(fp):
        mozc_files.append(fp)

mozc_candidates = {}
for fp in mozc_files:
    print(f" -> 解析中: {os.path.basename(fp)} ...")
    with open(fp, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) < 5: continue
            yomi = parts[0]
            cost = int(parts[3]) if parts[3].isdigit() else 99999
            word = parts[4]

            if len(word) < 2 or len(word) > 20: continue
            if not any(ord(c) >= 0x3040 for c in word): continue

            # ★【法則1対策：漢字2文字熟語の優先優遇ボーナス】
            # 「細胞」「骨髄」「血栓」等の連濁語が単漢字分解されるのを防ぐため、コストを-1500優遇
            if len(word) == 2 and all(0x4E00 <= ord(c) <= 0x9FFF for c in word):
                cost -= 1500

            is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)
            mode = 2 if is_katakana else 1

            if word not in mozc_candidates or cost < mozc_candidates[word][0]:
                mozc_candidates[word] = (cost, yomi, mode)

            # ★【法則2対策：動詞・形容詞の活用形全展開】
            # 基本形が登録された場合、その連用形・テ形・タ形なども展開して候補プールに追加
            inflected = generate_inflected_forms(word, yomi, cost)
            for inf_w, inf_y, inf_c in inflected:
                if len(inf_w) < 2 or len(inf_w) > 20: continue
                if inf_w not in mozc_candidates or inf_c < mozc_candidates[inf_w][0]:
                    mozc_candidates[inf_w] = (inf_c, inf_y, 1)

print(f" -> Mozc ユニーク候補語彙（活用展開後）: {len(mozc_candidates):,} 語")

# コスト順にソートして、上限件数まで追加
# AtomS3U 8MB Flash (SPIFFS 5.8MB) の安全限界: 130,000語 (約 3.97 MB)
target_total_words = 130000
needed_mozc = target_total_words - len(term_dict)
print(f" -> 目標総語彙数: {target_total_words:,} 語 (Mozc から追加予定: 約 {needed_mozc:,} 語)")

sorted_mozc = sorted(mozc_candidates.items(), key=lambda x: x[1][0])
added_mozc = 0
for word, (cost, yomi, mode) in sorted_mozc:
    h = fnv1a_32(word)
    if h in term_dict:
        continue
    romaji = kana_to_romaji(yomi)[:25]
    if romaji:
        term_dict[h] = (word, romaji, mode, cost)
        added_mozc += 1
        if len(term_dict) >= target_total_words:
            break

print(f" -> Mozc 追加語数: {added_mozc:,} 件")
print(f" === 辞書統合完了: 総登録語彙数 = {len(term_dict):,} 語 ===")

# ─────────────────────────────────────────────────────────────────────────────
# 7. 固定長バイナリ辞書 (med_terms.bin) の生成
# ─────────────────────────────────────────────────────────────────────────────
print("=== [7] 固定長バイナリ辞書 (med_terms.bin) の生成 ===")
sorted_records = sorted(term_dict.items(), key=lambda x: x[0])

out_paths = [
    os.path.join(DATA_DIR, "med_terms.bin"),
    os.path.join(FIRMWARE_DATA_DIR, "med_terms.bin")
]

for out_path in out_paths:
    with open(out_path, 'wb') as f:
        # ヘッダー (16B): 'TERM' (4B), count (uint32_t 4B), recordSize (uint16_t 2B: 32), reserved (6B)
        f.write(struct.pack('<4sIH6s', b'TERM', len(sorted_records), 32, b'\x00'*6))
        for h, (word, romaji, mode, _) in sorted_records:
            romaji_b = romaji.encode('ascii', errors='ignore')[:25]
            romaji_pad = romaji_b.ljust(26, b'\x00')
            f.write(struct.pack('<IBB26s', h, mode, len(romaji_b), romaji_pad))
    print(f" -> バイナリ出力: {out_path} ({len(sorted_records):,} 語, {os.path.getsize(out_path):,} bytes / {os.path.getsize(out_path)/1024/1024:.2f} MB)")

print("=== 全工程完了 ===")
