#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import time
import subprocess
import serial

PORT = "/dev/ttyACM0"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def run(cmd):
    print(f"\n>>> 実行: {cmd}")
    res = subprocess.run(cmd, shell=True, cwd=BASE_DIR)
    if res.returncode != 0:
        print(f"[ERROR] コマンド失敗: {cmd}")
        sys.exit(res.returncode)

def wait_for_port(timeout=300):
    print(f" -> ポート {PORT} の接続を待機中（最大 {timeout} 秒）...")
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.exists(PORT):
            print(f" ✓ ターゲットポート {PORT} を検出しました！")
            time.sleep(1.0)
            return True
        time.sleep(0.5)
    print(f" ❌ タイムアウト: {PORT} が検出されませんでした。")
    return False

def clean_sd_test_files():
    print("\n -> SDカード内テストファイル削除中...")
    try:
        ser = serial.Serial(PORT, 115200, timeout=3.0)
        time.sleep(0.5)
        ser.reset_input_buffer()
        for f in ["/test.txt", "/test_sz.bin"]:
            ser.write(f"DELETE {f}\n".encode('utf-8'))
            ser.flush()
            res = ser.readline().decode('utf-8', errors='ignore').strip()
            print(f"    削除 {f}: {res}")
        ser.close()
    except Exception as e:
        print(f"    [警告] テストファイル削除スキップ: {e}")

def main():
    if not wait_for_port(300):
        sys.exit(1)

    print("============================================================")
    print(" [1/4] SD-Flasher ファームウェアの書き込み")
    print("============================================================")
    run(f"pio run -e sd-flasher --target upload --upload-port {PORT}")
    time.sleep(2.0)

    print("============================================================")
    print(" [2/4] SDカード内ナレッジデータ (114件) の全件整合性更新")
    print("============================================================")
    clean_sd_test_files()
    run(f"python3 firmware/scripts/transfer_sd_files.py")
    time.sleep(2.0)

    print("============================================================")
    print(" [3/4] SPIFFS 辞書領域の書き込み (med_terms, kanji_yomi, minds_cds)")
    print("============================================================")
    run(f"pio run -e lilygo-t-dongle-s3 --target uploadfs --upload-port {PORT}")
    time.sleep(2.0)

    print("============================================================")
    print(" [4/4] 最新本体ファームウェア (SD表示 & LED & BOOT長押し) の書き込み")
    print("============================================================")
    run(f"pio run -e lilygo-t-dongle-s3 --target upload --upload-port {PORT}")

    print("\n🎉 すべてのアップデートが完璧に完了しました！")

if __name__ == "__main__":
    main()
