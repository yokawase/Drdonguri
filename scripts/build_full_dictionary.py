#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ 超高精度・統合日本語バイナリ辞書コンパイラ (v2.0)
- CLINICAL_COMPOUND_MAP & INFLECTED_WORD_MAP (最優先)
- 厚労省 医薬品マスター (y_20260930.csv) ＆ ベース薬品名抽出
- 厚労省 傷病名マスター (b_20260601.txt)
- Google Mozc OSS 一般日本語辞書 (dictionary00.txt 〜 dictionary09.txt)
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

term_dict = {}

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

print(f" -> 臨床辞書合計: {len(term_dict)} 件")


print("=== [2] 厚労省 傷病名マスター (b_*.txt / csv) の解析 ===")
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
                # 記号除去、未コード化等を除外
                if not name or len(name) < 2 or '未コード化' in name or name.startswith('＊＊'):
                    continue
                # ローマ字生成
                romaji = kana_to_romaji(kana)[:25]
                if romaji:
                    h = fnv1a_32(name)
                    if h not in term_dict:
                        is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in name)
                        mode = 2 if is_katakana else 1
                        term_dict[h] = (name, romaji, mode, 100)
                        count_d += 1
    print(f"    傷病名エントリ登録: {count_d:,} 件 (累計: {len(term_dict):,} 件)")


print("=== [3] 厚労省 医薬品マスター (y_*.csv / txt) の解析 ===")
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
                
                # 1. 規格名そのもの
                candidates = []
                if name and len(name) >= 2:
                    candidates.append((name, kana))
                
                # 2. ベース薬品名 (例: 「ロキソニン」「アスピリン」「ガスター」「ファモチジン」)
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
                            term_dict[h] = (w, romaji, mode, 100)
                            count_y += 1
    print(f"    医薬品エントリ登録: {count_y:,} 件 (累計: {len(term_dict):,} 件)")


print("=== [4] Mozc 公式辞書データの解析＆一般重要語彙の抽出 ===")
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
            # 日本語文字を含むか
            if not any(ord(c) >= 0x3040 for c in word): continue

            is_katakana = all(0x30A0 <= ord(c) <= 0x30FF or c in 'ー・' for c in word)
            mode = 2 if is_katakana else 1

            if word not in mozc_candidates or cost < mozc_candidates[word][0]:
                mozc_candidates[word] = (cost, yomi, mode)

print(f" -> Mozc ユニーク候補語彙: {len(mozc_candidates):,} 語")

# コスト順にソートして、上限件数まで追加
# SPIFFSのオーバーヘッド（ブロック予備・メタデータ等）を考慮し、安全値 120,000語（約3.84MB）とする。
target_total_words = 120000
needed_mozc = target_total_words - len(term_dict)
print(f" -> Mozc から追加予定の語数: 約 {needed_mozc:,} 語")

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


print("=== [5] 固定長バイナリ辞書 (med_terms.bin) の生成 ===")
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

print("=== 完了 ===")
