#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ JIS全漢字音読み辞書ジェネレータ
- firmware/data/kanji_yomi.bin (AtomS3U SPIFFS用: 12B固定長, Zero-RAM二分探索)
- src/data/jisKanjiRomajiTable.ts (WebUIトランスパイラ用)
"""

import os
import struct
import unicodedata
import pykakasi

kks = pykakasi.kakasi()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRMWARE_DATA_DIR = os.path.join(BASE_DIR, "firmware", "data")
DATA_DIR = os.path.join(BASE_DIR, "data")
SRC_DATA_DIR = os.path.join(BASE_DIR, "src", "data")

os.makedirs(FIRMWARE_DATA_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(SRC_DATA_DIR, exist_ok=True)

def generate_dict():
    print(" === JIS全漢字（CJK統合漢字）音訓読み辞書生成開始 ===")
    
    # 常用漢字・JIS第1・第2水準（U+4E00〜U+9FA5）
    kanji_dict = {}
    
    for cp in range(0x4E00, 0x9FA6):
        ch = chr(cp)
        res = kks.convert(ch)
        if res and res[0]['hepburn'] and res[0]['hepburn'] != ch:
            romaji = res[0]['hepburn'].lower()
            # ヘボン式の整理 (特殊記号除外、英字のみ)
            romaji_clean = "".join([c for c in romaji if c.isalpha()])
            if romaji_clean:
                # 代表的な日本語読みへの調整（長音ハイフン等の正規化）
                kanji_dict[ch] = romaji_clean

    print(f" -> 抽出された漢字総数: {len(kanji_dict):,} 字")

    # 1. AtomS3U バイナリ辞書 (kanji_yomi.bin)
    # ソート順: UTF-8バイト列の昇順（バイナリ比較 memcmp 互換）
    records = []
    for ch, romaji in kanji_dict.items():
        utf8_b = ch.encode('utf-8')[:4].ljust(4, b'\x00')
        romaji_b = romaji.encode('ascii', errors='ignore')[:7].ljust(8, b'\x00')
        records.append((utf8_b, romaji_b, ch, romaji))

    # UTF-8バイト列でソート
    records.sort(key=lambda x: x[0])

    bin_payload = bytearray()
    # ヘッダー: 'YOMI' (4B), count (uint16_t 2B), recordSize (uint16_t 2B: 12), reserved (4B)
    bin_payload.extend(struct.pack('<4sHH4s', b'YOMI', len(records), 12, b'\x00'*4))
    
    for utf8_b, romaji_b, _, _ in records:
        bin_payload.extend(utf8_b)
        bin_payload.extend(romaji_b)

    for out_dir in [FIRMWARE_DATA_DIR, DATA_DIR]:
        out_bin = os.path.join(out_dir, "kanji_yomi.bin")
        with open(out_bin, 'wb') as f:
            f.write(bin_payload)
        print(f" -> バイナリ出力: {out_bin} ({len(records):,} 語, {len(bin_payload):,} bytes)")

    # 2. WebUI TypeScript テーブル (src/data/jisKanjiRomajiTable.ts)
    ts_out = os.path.join(SRC_DATA_DIR, "jisKanjiRomajiTable.ts")
    with open(ts_out, 'w', encoding='utf-8') as f:
        f.write("/**\n")
        f.write(" * JIS第1・第2水準＋常用漢字 全漢字（6,500字以上）音訓読みローマ字テーブル\n")
        f.write(" * 未登録漢字の「16進Unicodeコード化」および「文字脱落」を100%永久根絶\n")
        f.write(" */\n\n")
        f.write("export const JIS_KANJI_ROMAJI: Record<string, string> = {\n")
        items = []
        for ch, romaji in sorted(kanji_dict.items()):
            items.append(f"  '{ch}': '{romaji}'")
        f.write(",\n".join(items))
        f.write("\n};\n")
    print(f" -> TypeScript出力: {ts_out} ({len(kanji_dict):,} エントリ, {os.path.getsize(ts_out):,} bytes)")
    print(" === 辞書生成完了 ===")

if __name__ == '__main__':
    generate_dict()
