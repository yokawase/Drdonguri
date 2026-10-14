#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DrVoice どんぐり君！ Alt+Numpad 100%決定論ファームウェア 自動書き込みスクリプト
T-Dongle-S3 がダウンロードモード（BOOTボタン長押し挿入）で接続されるのを待機し、自動でフラッシュします。
"""

import os
import sys
import time
import subprocess
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_serial_port():
    ports = glob.glob("/dev/ttyACM*") + glob.glob("/dev/ttyUSB*")
    return ports[0] if ports else None

def main():
    print("==================================================================")
    print(" 🌰 DrVoice どんぐり君！ Alt+Numpad 100%決定論ファームウェア フラッシャー")
    print("==================================================================")
    print("【接続手順】")
    print(" 1. T-Dongle-S3 をPCのUSBポートから抜きます。")
    print(" 2. 本体側面の「BOOTボタン (GPIO 0)」を押したままにします。")
    print(" 3. 押したままPCのUSBポートへ挿入し、1秒後にボタンを離します。")
    print("------------------------------------------------------------------")
    print(" -> 書き込みポート (/dev/ttyACM* / /dev/ttyUSB*) を待機中...")

    port = None
    t0 = time.time()
    while time.time() - t0 < 120:
        port = find_serial_port()
        if port:
            print(f" ✓ ターゲットポート検出: {port}")
            time.sleep(1.0)
            break
        time.sleep(0.5)

    if not port:
        print(" ❌ タイムアウト: ダウンロードモードのポートが検出されませんでした。")
        sys.exit(1)

    print(f"\n>>> ファームウェア書き込み開始: pio run -e lilygo-t-dongle-s3 -t upload --upload-port {port}")
    cmd = f"pio run -e lilygo-t-dongle-s3 -t upload --upload-port {port}"
    res = subprocess.run(cmd, shell=True, cwd=BASE_DIR)
    if res.returncode == 0:
        print("\n==================================================================")
        print(" 🎉 Alt+Numpad ファームウェアの書き込みが正常に完了しました！")
        print(" T-Dongle-S3 が自動再起動し、複合機 (HID+仮想プリンタ) として起動します。")
        print("==================================================================")
    else:
        print(f"\n❌ 書き込み失敗 (コード: {res.returncode})")
        sys.exit(res.returncode)

if __name__ == "__main__":
    main()
