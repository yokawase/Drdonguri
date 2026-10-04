#!/usr/bin/env bash
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
CONFIRM=${CONFIRM:-Y}
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  cd "$BASE_DIR"
  echo ">>> [A] SPIFFS (医療辞書バイナリ) の構築と書き込み..."
  $PIO_CMD run -e m5stack-atoms3u --target uploadfs --upload-port "$TARGET_PORT"
  echo ">>> [B] ファームウェア本体のコンパイルと書き込み..."
  $PIO_CMD run -e m5stack-atoms3u --target upload --upload-port "$TARGET_PORT"
  echo "🎉 大容量辞書SPIFFSおよびファームウェアの書き込みが完了しました！"
fi
