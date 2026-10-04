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
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if os.path.exists(os.path.join(SCRIPT_DIR, "..", "platformio.ini")):
    BASE_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
elif os.path.exists(os.path.join(os.getcwd(), "platformio.ini")):
    BASE_DIR = os.getcwd()
else:
    BASE_DIR = os.path.expanduser("~/drvoice-donguri")

RAW_DIR = os.path.join(BASE_DIR, "raw_data")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

try:
    import pykakasi
    kks = pykakasi.kakasi()
    def kana_to_romaji(kana_text: str) -> str:
        result = kks.convert(kana_text)
        romaji = "".join([item['hepburn'] for item in result])
        return "".join([c for c in romaji if c.isalnum()]).lower()
except ImportError:
    kks = None
    def kana_to_romaji(kana_text: str) -> str:
        return ""

def fnv1a_32(text: str) -> int:
    norm = unicodedata.normalize('NFKC', text).strip()
    h = 0x811C9DC5
    for b in norm.encode('utf-8'):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h

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
        seeds = [
            ("タケキャブ", "takekyabu", 2), ("アムロジピン", "amurojipin", 2),
            ("ロキソニン", "rokisonin", 2), ("カロナール", "karonaru", 2),
            ("ビオフェルミン", "bioferumin", 2), ("フォシーガ", "foshiga", 2),
            ("スクリーニング", "sukuri-ninngu", 2), ("バイオマーカー", "baioma-ka-", 2),
            ("コリバクチン", "koribakutinn", 2), ("オッズ比", "ozzuhi", 1),
            ("急性虫垂炎", "kyuseichusuien", 1), ("胃潰瘍", "ikaiyou", 1),
            ("逆流性食道炎", "gyakuryuseishokudouen", 1), ("狭心症", "kyoushinshou", 1),
            ("大腸内視鏡", "daityounaisikyou", 1), ("大腸腫瘍", "daityousyuu", 1),
            ("大腸腺腫", "daityousensyu", 1), ("腺腫", "sensyu", 1),
            ("信頼区間", "sinnraikukann", 1), ("有意差", "yuuisa", 1),
            ("調整オッズ比", "tyouseiozzuhi", 1), ("無症候住民", "musyoukoujyuuminn", 1),
            ("無症候者", "musyoukousya", 1), ("便免疫化学検査", "bennmennekikagakukennsa", 1),
            ("便潜血検査", "bennsennketukennsa", 1), ("進行性腫瘍", "sinkouseisyuyou", 1),
            ("リスク層別化", "risukusoubetuka", 1), ("症例対照研究", "syoureitaisyoukennkyuu", 1),
            ("因果推論", "inngasuironn", 1), ("縦断研究", "jyuudannkennkyuu", 1)
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
        "痙", "攣", "鞘", "齲", "腱", "顆", "篩", "錐", "嵌", "頓",
        "疥", "癬", "肋"
    }

    records = []
    # 難読文字セットのみに限定（一般漢字へのF5乱射・タイムスタンプ誤挿入を根絶）
    target_chars = seen_kanji.intersection(priority_set) if seen_kanji else priority_set
    if not target_chars:
        target_chars = priority_set

    for char in sorted(list(target_chars)):
        cp = ord(char)
        utf8_b = char.encode('utf-8')[:4].ljust(4, b'\x00')
        records.append((utf8_b, cp, 1))

    records.sort(key=lambda x: x[0])
    out_path = os.path.join(DATA_DIR, "kanji_f5.bin")
    with open(out_path, 'wb') as f:
        f.write(struct.pack('<4sHH', b'KANJ', len(records), 8))
        for utf8_b, u_code, flag in records:
            f.write(struct.pack('<4sHBx', utf8_b, u_code, flag))
    print(f"     => 生成完了: {out_path} ({len(records):,} 文字, {os.path.getsize(out_path):,} bytes)")

if __name__ == '__main__':
    compile_terms()
    compile_kanji()
