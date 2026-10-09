#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
DrVoice どんぐり君 / Dr.Dongly - T-dongle-S3 向け 大規模Minds診療ガイドラインコンパイラ
日本医療機能評価機構（Minds）および各主要医学会公式診療ガイドラインに基づく
日常診療〜専門診療の全主要111疾患・111重要CQ・680トリガーワードを完全網羅。

1. 16MB Flash用: 512バイト固定長バイナリ (minds_cds.bin) - Zero-RAM 二分探索
2. 32GB SDカード用: 詳細背景・エビデンス全文 (minds_fulltext.dat / minds_knowledge_base.json)
3. 32GB SDカード用: 各疾患 Markdown ドキュメント (guidelines/<ICD10>_cq<N>.md)
=============================================================================
"""

import os
import sys
import json
import struct
import importlib

def fnv1a_32(text: str) -> int:
    h = 0x811c9dc5
    for b in text.encode('utf-8'):
        h ^= b
        h = (h * 0x01000193) & 0xffffffff
    return h

def pad_string(s: str, max_len: int) -> bytes:
    encoded = b""
    for char in s:
        char_bytes = char.encode('utf-8')
        if len(encoded) + len(char_bytes) > max_len - 1:
            break
        encoded += char_bytes
    return encoded + b'\x00' * (max_len - len(encoded))

def load_all_guideline_entries() -> list:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    minds_dir = os.path.join(script_dir, "minds_data")
    if minds_dir not in sys.path:
        sys.path.insert(0, minds_dir)

    module_names = [
        'infection', 'respiratory', 'cardiovascular', 'metabolism',
        'gastroenterology', 'nephrology_urology', 'neurology',
        'psychiatry', 'orthopedics_rheumatology', 'dermatology',
        'ent_ophthalmology', 'pediatrics', 'gynecology', 'emergency_general'
    ]

    all_entries = []
    for m_name in module_names:
        mod = importlib.import_module(m_name)
        entries = getattr(mod, 'ENTRIES', [])
        all_entries.extend(entries)

    return all_entries

def compile_minds_guidelines(base_dir: str):
    data_dir = os.path.join(base_dir, "data")
    firmware_data_dir = os.path.join(base_dir, "firmware", "data")
    sdcard_dir = os.path.join(data_dir, "sdcard")
    guidelines_doc_dir = os.path.join(sdcard_dir, "guidelines")

    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(firmware_data_dir, exist_ok=True)
    os.makedirs(sdcard_dir, exist_ok=True)
    os.makedirs(guidelines_doc_dir, exist_ok=True)

    guidelines = load_all_guideline_entries()
    print(f"=================================================================")
    print(f" Minds 診療ガイドライン 大規模コンパイル")
    print(f" 対象疾患・CQ数: {len(guidelines)} 件")
    print(f"=================================================================")

    processed_records = []
    sdcard_fulltext_bytes = bytearray()
    knowledge_base = []
    rec_id = 0

    for entry in guidelines:
        detail_obj = entry["detail"]
        markdown_text = f"""# 【Minds診療ガイドライン】{entry['disease_name']} ({entry['icd10']})
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
        safe_fname = f"{entry['icd10']}_cq{entry['cq_num']}.md"
        with open(os.path.join(guidelines_doc_dir, safe_fname), "w", encoding="utf-8") as f:
            f.write(markdown_text)

        encoded_detail = markdown_text.encode('utf-8')
        sd_offset = len(sdcard_fulltext_bytes)
        sd_len = len(encoded_detail)
        sdcard_fulltext_bytes.extend(encoded_detail)

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

    # トリガーハッシュ昇順ソート (Zero-RAM 二分探索の必須要件)
    processed_records.sort(key=lambda x: x["trigger_hash"])

    print(f" -> トリガーワード展開後の総レコード数: {len(processed_records)} 件")

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

    # 16MB Flash用バイナリ保存
    flash_bin_path1 = os.path.join(data_dir, "minds_cds.bin")
    flash_bin_path2 = os.path.join(firmware_data_dir, "minds_cds.bin")
    with open(flash_bin_path1, "wb") as f:
        f.write(binary_output)
    with open(flash_bin_path2, "wb") as f:
        f.write(binary_output)

    # 32GB SDカード用詳細テキスト保存
    sd_dat_path = os.path.join(sdcard_dir, "minds_fulltext.dat")
    with open(sd_dat_path, "wb") as f:
        f.write(sdcard_fulltext_bytes)

    # WebLLM RAG用 JSON保存
    kb_json_path = os.path.join(sdcard_dir, "minds_knowledge_base.json")
    with open(kb_json_path, "w", encoding="utf-8") as f:
        json.dump(knowledge_base, f, ensure_ascii=False, indent=2)

    print(f" -> [完了] 16MB Flash 用バイナリ: {flash_bin_path1} ({len(binary_output)} B, {len(binary_output)//512} レコード)")
    print(f" -> [完了] 32GB SDカード 用テキスト: {sd_dat_path} ({len(sdcard_fulltext_bytes)} B)")
    print(f" -> [完了] WebLLM RAG 用 JSON: {kb_json_path} ({len(knowledge_base)} ガイドライン)")
    print(f" -> [完了] SDカード Markdown 個別文書: {guidelines_doc_dir} ({len(guidelines)} ファイル)")
    print(f"=================================================================")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.abspath(os.path.join(script_dir, "..", ".."))
    compile_minds_guidelines(base)
