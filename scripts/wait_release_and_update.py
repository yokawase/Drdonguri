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

def wait_for_button_release_and_boot():
    print(" -> ユーザーがBOOTボタンを離すのを待機中...")
    while True:
        try:
            ser = serial.Serial(PORT, 115200, timeout=1.0)
            ser.dtr = False
            ser.rts = True
            time.sleep(0.1)
            ser.rts = False
            time.sleep(0.8)
            out = ser.read(ser.in_waiting or 500).decode('utf-8', errors='ignore')
            ser.close()
            
            if "SD_FLASHER_READY" in out or "SD] Size:" in out:
                print(" ✓ SD-Flasher が正常起動しました！")
                return True
            elif "boot:0x0" in out:
                # まだボタンが押されている
                time.sleep(0.5)
            else:
                # 起動ログが出ているかPING確認
                try:
                    s2 = serial.Serial(PORT, 115200, timeout=1.0)
                    s2.reset_input_buffer()
                    s2.write(b"PING\n")
                    time.sleep(0.3)
                    resp = s2.read(s2.in_waiting or 50).decode('utf-8', errors='ignore')
                    s2.close()
                    if "PONG" in resp:
                        print(" ✓ PONG応答を確認！SD-Flasher稼働中！")
                        return True
                except:
                    pass
                time.sleep(0.5)
        except Exception as e:
            time.sleep(0.5)

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
    if not wait_for_button_release_and_boot():
        sys.exit(1)

    print("\n============================================================")
    print(" [1/3] SDカード内ナレッジデータ (114件) の全件整合性更新")
    print("============================================================")
    clean_sd_test_files()
    run(f"python3 firmware/scripts/transfer_sd_files.py")
    time.sleep(1.0)

    print("\n============================================================")
    print(" [2/3] SPIFFS 辞書領域の書き込み (med_terms, kanji_yomi, minds_cds)")
    print("============================================================")
    run(f"pio run -e lilygo-t-dongle-s3 --target uploadfs --upload-port {PORT}")
    time.sleep(2.0)

    print("\n============================================================")
    print(" [3/3] 最新本体ファームウェア (SD表示 & LED & BOOT長押し) の書き込み")
    print("============================================================")
    run(f"pio run -e lilygo-t-dongle-s3 --target upload --upload-port {PORT}")

    print("\n🎉 新しいT-Dongle-S3 への全アップデートが完璧に完了しました！")

if __name__ == "__main__":
    main()
