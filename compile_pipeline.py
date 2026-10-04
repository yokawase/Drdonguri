#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ 医療マスターバイナリコンパイラ
厚労省 医薬品マスター (y.zip) & 傷病名マスター (b.zip) から
AtomS3U (ESP32-S3 8MB Flash) 向け固定長バイナリ辞書を生成
- med_terms.bin (32バイト固定長、FNV-1a 32bitハッシュ、ローマ字シーケンス、モード1/2)
- kanji_f5.bin (8バイト固定長、UTF-8 4B, Unicode 2B, 属性 1B)
"""

import os
import csv
import struct
import unicodedata
import pykakasi

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = BASE_DIR
DATA_DIR = BASE_DIR
os.makedirs(DATA_DIR, exist_ok=True)

kks = pykakasi.kakasi()

def fnv1a_32(text: str) -> int:
    norm = unicodedata.normalize('NFKC', text).strip()
    h = 0x811C9DC5
    for b in norm.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h

def kana_to_romaji(kana_text: str) -> str:
    result = kks.convert(kana_text)
    romaji = "".join([item['hepburn'] for item in result])
    return "".join([c for c in romaji if c.isalnum()]).lower()

def compile_terms():
    print(" -> [A] 医薬品 & 傷病名マスターをコンパイル中 (med_terms.bin)...")
    term_dict = {}
    all_files = []
    for root, _, files in os.walk(RAW_DIR):
        for f in files:
            all_files.append(os.path.join(root, f))
    
    drug_files = [f for f in all_files if os.path.basename(f).lower().startswith('y') and f.lower().endswith(('.csv', '.txt'))]
    disease_files = [f for f in all_files if os.path.basename(f).lower().startswith('b') and f.lower().endswith(('.csv', '.txt'))]

    if drug_files:
        target = drug_files[0]
        print(f"     医薬品マスター解析: {os.path.basename(target)}")
        with open(target, 'r', encoding='cp932', errors='replace') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 5:
                    name = row[4].strip()
                    kana = row[5].strip() if len(row) > 5 else name
                    if name:
                        romaji = kana_to_romaji(kana)[:25]
                        term_dict[fnv1a_32(name)] = (name, romaji, 2)
        print(f"     医薬品エントリ登録数: {len(term_dict):,} 件")

    if disease_files:
        target = disease_files[0]
        print(f"     傷病名マスター解析: {os.path.basename(target)}")
        count_d = 0
        with open(target, 'r', encoding='cp932', errors='replace') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 3:
                    name = row[2].strip()
                    kana = row[3].strip() if len(row) > 3 else name
                    if name:
                        romaji = kana_to_romaji(kana)[:25]
                        term_dict[fnv1a_32(name)] = (name, romaji, 1)
                        count_d += 1
        print(f"     傷病名エントリ登録数: {count_d:,} 件")

    if len(term_dict) < 50:
        print("     [情報] シードデータを投入します...")
        seeds = [
            ("タケキャブ", "takekyabu", 2), ("アムロジピン", "amurojipin", 2),
            ("ロキソニン", "rokisonin", 2), ("カロナール", "karonaru", 2),
            ("ビオフェルミン", "bioferumin", 2), ("フォシーガ", "foshiga", 2),
            ("急性虫垂炎", "kyuseichusuien", 1), ("胃潰瘍", "ikaiyou", 1),
            ("逆流性食道炎", "gyakuryuseishokudouen", 1), ("狭心症", "kyoushinshou", 1)
        ]
        for t, r, m in seeds:
            term_dict[fnv1a_32(t)] = (t, r, m)

    sorted_records = sorted(term_dict.items(), key=lambda x: x[0])
    out_path = os.path.join(DATA_DIR, "med_terms.bin")
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<4sIH6s', b'TERM', len(sorted_records), 32, b'\x00'*6))
        for h, (name, romaji, mode) in sorted_records:
            romaji_b = romaji.encode('ascii', errors='ignore')[:25]
            romaji_pad = romaji_b.ljust(26, b'\x00')
            f.write(struct.pack('<IBB26s', h, mode, len(romaji_b), romaji_pad))
    print(f"     => 生成完了: {out_path} ({len(sorted_records):,} 語, {os.path.getsize(out_path):,} bytes)")

def compile_kanji():
    print(" -> [B] 医療難読漢字テーブルを抽出・コンパイル中 (kanji_f5.bin)...")
    seen_kanji = set()
    for root, _, files in os.walk(RAW_DIR):
        for f in files:
            if f.lower().endswith(('.csv', '.txt')) and not f.startswith('.'):
                fpath = os.path.join(root, f)
                with open(fpath, 'r', encoding='cp932', errors='replace') as fp:
                    for line in fp:
                        for char in line:
                            if '\u4e00' <= char <= '\u9fff':
                                seen_kanji.add(char)
    priority_set = {
        "嚥", "瘻", "褥", "瘡", "瘢", "痕", "攣", "爬", "掻", "痺",
        "癌", "瘤", "喀", "痰", "嘔", "吐", "嗄", "膿", "痂", "吻",
        "穿", "腔", "塞", "栓", "嚢", "胞", "潰", "瘍", "憩", "盲",
        "痙", "攣", "鞘", "齲", "腱", "顆", "篩", "錐", "嵌", "頓"
    }

    records = []
    for char in sorted(list(seen_kanji)):
        cp = ord(char)
        if char in priority_set or cp >= 0x7000:
            utf8_b = char.encode('utf-8')[:4].ljust(4, b'\x00')
            records.append((utf8_b, cp, 1))

    if not records:
        for char in priority_set:
            utf8_b = char.encode('utf-8')[:4].ljust(4, b'\x00')
            records.append((utf8_b, ord(char), 1))

def compile_kanji_yomi():
    print(" -> [C] JIS全漢字音訓読み辞書をコンパイル中 (kanji_yomi.bin)...")
    kanji_dict = {}
    for cp in range(0x4E00, 0x9FA6):
        ch = chr(cp)
        res = kks.convert(ch)
        if res and res[0]['hepburn'] and res[0]['hepburn'] != ch:
            romaji = res[0]['hepburn'].lower()
            romaji_clean = "".join([c for c in romaji if c.isalpha()])
            if romaji_clean:
                kanji_dict[ch] = romaji_clean

    records = []
    for ch, romaji in kanji_dict.items():
        utf8_b = ch.encode('utf-8')[:4].ljust(4, b'\x00')
        romaji_b = romaji.encode('ascii', errors='ignore')[:7].ljust(8, b'\x00')
        records.append((utf8_b, romaji_b))

    records.sort(key=lambda x: x[0])
    bin_payload = bytearray()
    bin_payload.extend(struct.pack('<4sHH4s', b'YOMI', len(records), 12, b'\x00'*4))
    for utf8_b, romaji_b in records:
        bin_payload.extend(utf8_b)
        bin_payload.extend(romaji_b)

    for out_d in [DATA_DIR, os.path.join(BASE_DIR, "firmware", "data")]:
        os.makedirs(out_d, exist_ok=True)
        out_bin = os.path.join(out_d, "kanji_yomi.bin")
        with open(out_bin, 'wb') as f:
            f.write(bin_payload)
        print(f"     => 生成完了: {out_bin} ({len(records):,} 文字, {len(bin_payload):,} bytes)")

if __name__ == '__main__':
    compile_terms()
    compile_kanji()
    compile_kanji_yomi()
