import mainCppRaw from '@/firmware/src/main.cpp?raw';
import flashAtoms3uPs1Raw from '@/firmware/scripts/flash_atoms3u.ps1?raw';

export const LATEST_FIRMWARE_VERSION = 'v16.3';
export const FIRMWARE_RELEASE_DATE = '2026-10-04';
export const FIRMWARE_RELEASE_TITLE = 'v16.3（HYBRID Unicode F5完全着弾・誤送信法則根絶版）';

export const PARTITIONS_8MB_CSV_SOURCE = `# Name,   Type, SubType, Offset,   Size,     Flags
nvs,      data, nvs,     0x9000,   0x5000,
otadata,  data, ota,     0xe000,   0x2000,
app0,     app,  ota_0,   0x10000,  0x200000,
spiffs,   data, spiffs,  0x210000, 0x5E0000,
`;

export const PLATFORMIO_INI_SOURCE = `[env:m5stack-atoms3u]
platform = espressif32 @ 6.6.0
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200

; AtomS3U ハードウェア構成（ESP32-S3FN8: 8MB Flash / PSRAM非搭載）
board_build.mcu = esp32s3
board_build.f_cpu = 240000000L
board_build.f_flash = 80000000L
board_build.flash_mode = qio
board_build.partitions = partitions_8MB.csv

; 依存ライブラリ
lib_deps = 

; コンパイルフラグ（PSRAM完全無効化 / USB-HID構成）
build_flags = 
    -DBOARD_HAS_PSRAM=0
    -DARDUINO_USB_MODE=0
    -DARDUINO_USB_CDC_ON_BOOT=0
`;

export const MAIN_CPP_SOURCE = mainCppRaw;
export const FIRMWARE_MAIN_CPP_SOURCE = mainCppRaw;
export const FLASH_ATOMS3U_PS1_SOURCE = flashAtoms3uPs1Raw;

export const COMPILE_PIPELINE_SH_SOURCE = `#!/usr/bin/env bash
set -euo pipefail
# ==============================================================================
# DrVoice どんぐり君！ 医療マスター一括コンパイル ＆ AtomS3U 直接フラッシャー
# ==============================================================================

BASE_DIR="$HOME/drvoice-donguri"
RAW_DIR="$BASE_DIR/raw_data"
DATA_DIR="$BASE_DIR/data"
SRC_DIR="$BASE_DIR/src"

echo ""
echo "=============================================================================="
echo " どんぐり君！ 選択肢 B【オンデバイス完結型】AtomS3U SPIFFS 辞書完全稼働パイプライン"
echo " 仕組み: 厚労省マスター約5万語を Flash (5.87MB) に書き込み、オンデバイス二分探索で展開"
echo " メリット: AtomS3U 単体で医療用語マスターを保持し完全スタンドアロン稼働"
echo " 課題: 辞書追加・更新時は AtomS3U を有線接続して pio run -t uploadfs で再フラッシュ"
echo "=============================================================================="
echo ""

# ------------------------------------------------------------------------------
# STEP 1: 前提環境と依存パッケージの検証
# ------------------------------------------------------------------------------
echo "[1/6] ディレクトリ・依存パッケージの検証..."
mkdir -p "$RAW_DIR" "$DATA_DIR" "$SRC_DIR"

for cmd in python3 unzip; do
  if ! command -v "$cmd" &> /dev/null; then
    echo " -> $cmd が見つかりません。apt で導入します..."
    sudo apt-get update && sudo apt-get install -y "$cmd"
  fi
done

if ! python3 -c "import pykakasi" &> /dev/null; then
  echo " -> pykakasi をインストールします..."
  pip3 install --user pykakasi || pip3 install pykakasi
fi

# ------------------------------------------------------------------------------
# STEP 2: PlatformIO & 8MBパーティション設定の強制適用
# ------------------------------------------------------------------------------
echo "[2/6] 8MB Flash パーティションおよび platformio.ini の同期..."

cat << 'EOF_PART' > "$BASE_DIR/partitions_8MB.csv"
# Name,   Type, SubType, Offset,   Size,     Flags
nvs,      data, nvs,     0x9000,   0x5000,
otadata,  data, ota,     0xe000,   0x2000,
app0,     app,  ota_0,   0x10000,  0x200000,
spiffs,   data, spiffs,  0x210000, 0x5E0000,
EOF_PART
echo " -> partitions_8MB.csv (SPIFFS: 5.87MB) を同期しました。"

NEED_INI_UPDATE=false
if [ ! -f "$BASE_DIR/platformio.ini" ]; then
  NEED_INI_UPDATE=true
elif ! grep -q "partitions_8MB.csv" "$BASE_DIR/platformio.ini"; then
  echo " [!] 既存の platformio.ini に 8MB パーティション設定が見つかりません。"
  cp "$BASE_DIR/platformio.ini" "$BASE_DIR/platformio.ini.bak"
  NEED_INI_UPDATE=true
fi

if [ "$NEED_INI_UPDATE" = true ]; then
  echo " -> platformio.ini を AtomS3U 8MB SPIFFS 仕様に設定します..."
  cat << 'EOF_INI' > "$BASE_DIR/platformio.ini"
[platformio]
default_envs = m5stack-atoms3u

[env:m5stack-atoms3u]
platform = espressif32 @ 6.6.0
board = esp32-s3-devkitc-1
framework = arduino
monitor_speed = 115200

board_build.mcu = esp32s3
board_build.f_cpu = 240000000L
board_build.f_flash = 80000000L
board_build.flash_mode = qio
board_build.flash_size = 8MB
board_build.partitions = partitions_8MB.csv
board_upload.flash_size = 8MB

build_flags =
    -DBOARD_HAS_PSRAM=0
    -DARDUINO_USB_MODE=0
    -DARDUINO_USB_CDC_ON_BOOT=0
    -DCORE_DEBUG_LEVEL=1

lib_deps =
EOF_INI
fi

if [ -d "$BASE_DIR/.pio/build/m5stack-atoms3u" ]; then
  rm -f "$BASE_DIR/.pio/build/m5stack-atoms3u/spiffs.bin"
fi

# ------------------------------------------------------------------------------
# STEP 3: y.zip / b.zip の解凍
# ------------------------------------------------------------------------------
echo "[3/6] 厚労省マスター ZIP アーカイブの展開..."
Y_ZIP=$(find "$RAW_DIR" -maxdepth 1 -iname "y*.zip" | head -n 1 || true)
B_ZIP=$(find "$RAW_DIR" -maxdepth 1 -iname "b*.zip" | head -n 1 || true)

if [ -n "$Y_ZIP" ]; then
  echo " -> 医薬品マスター解凍中: $(basename "$Y_ZIP")"
  unzip -q -o "$Y_ZIP" -d "$RAW_DIR/" || true
fi

if [ -n "$B_ZIP" ]; then
  echo " -> 傷病名マスター解凍中: $(basename "$B_ZIP")"
  unzip -q -o "$B_ZIP" -d "$RAW_DIR/" || true
fi

# ------------------------------------------------------------------------------
# STEP 4: 高速バイナリコンパイラ スクリプトの実行
# ------------------------------------------------------------------------------
echo "[4/6] バイナリコンパイル実行..."
python3 "$BASE_DIR/compile_pipeline.py"

echo ""
echo "辞書バイナリ生成結果 ($DATA_DIR):"
ls -lh "$DATA_DIR/med_terms.bin" "$DATA_DIR/kanji_f5.bin"

# ------------------------------------------------------------------------------
# STEP 5: PlatformIO SPIFFS ビルド & 書込
# ------------------------------------------------------------------------------
echo ""
echo "[5/5] SPIFFS イメージ構築 & AtomS3U への書込..."
PIO_CMD=""
if command -v pio &> /dev/null; then
  PIO_CMD="pio"
elif [ -f "$HOME/.platformio/penv/bin/pio" ]; then
  PIO_CMD="$HOME/.platformio/penv/bin/pio"
elif [ -f "$HOME/.local/bin/pio" ]; then
  PIO_CMD="$HOME/.local/bin/pio"
else
  echo " -> PlatformIO Core をインストールします..."
  pip3 install --user platformio || pip3 install platformio
  PIO_CMD="$HOME/.local/bin/pio"
fi

TARGET_PORT=$(ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null | head -n 1 || true)
if [ -z "$TARGET_PORT" ]; then
  echo " [!] USB接続された AtomS3U が見つかりません。"
  echo "     SPIFFS イメージの構築テストのみ実行します..."
  cd "$BASE_DIR"
  $PIO_CMD run -e m5stack-atoms3u --target buildfs
  echo " ✓ 5.87MB SPIFFS イメージの構築に成功しました。"
  exit 0
fi

echo " -> 検出されたポート: $TARGET_PORT"
sudo chmod 666 "$TARGET_PORT" || true

read -r -p "AtomS3U ($TARGET_PORT) に SPIFFS とファームウェアを書き込みますか？ [Y/n]: " CONFIRM
CONFIRM=\${CONFIRM:-Y}
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  cd "$BASE_DIR"
  echo ">>> [A] SPIFFS (医療辞書バイナリ) の構築と書き込み..."
  $PIO_CMD run -e m5stack-atoms3u --target uploadfs --upload-port "$TARGET_PORT"
  echo ">>> [B] ファームウェア本体のコンパイルと書き込み..."
  $PIO_CMD run -e m5stack-atoms3u --target upload --upload-port "$TARGET_PORT"
  echo "🎉 大容量辞書SPIFFSおよびファームウェアの書き込みが完了しました！"
fi
`;

export const COMPILE_PIPELINE_PY_SOURCE = `#!/usr/bin/env python3
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

BASE_DIR = os.path.expanduser("~/drvoice-donguri")
RAW_DIR = os.path.join(BASE_DIR, "raw_data")
DATA_DIR = os.path.join(BASE_DIR, "data")
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
        f.write(struct.pack('<4sIH6s', b'TERM', len(sorted_records), 32, b'\\x00'*6))
        for h, (name, romaji, mode) in sorted_records:
            romaji_b = romaji.encode('ascii', errors='ignore')[:25]
            romaji_pad = romaji_b.ljust(26, b'\\x00')
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
                            if '\\u4e00' <= char <= '\\u9fff':
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
            utf8_b = char.encode('utf-8')[:4].ljust(4, b'\\x00')
            records.append((utf8_b, cp, 1))

    if not records:
        for char in priority_set:
            utf8_b = char.encode('utf-8')[:4].ljust(4, b'\\x00')
            records.append((utf8_b, ord(char), 1))

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
`;

