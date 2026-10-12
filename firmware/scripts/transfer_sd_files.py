#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
T-dongle-S3 MicroSD カード 自動ファイル転送スクリプト
sd_flasher ファームウェアとシリアル通信して、PC上の data/sdcard/* を MicroSD カードへ一括転送
"""

import os
import sys
import time
import serial

PORT = "/dev/ttyACM0"
BAUD = 115200

def send_command(ser, cmd: str, timeout: float = 3.0) -> str:
    """バッファをクリアしてコマンドを送信し、応答を待つ"""
    ser.reset_input_buffer()
    ser.write((cmd + "\n").encode('utf-8'))
    t_end = time.time() + timeout
    while time.time() < t_end:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if line:
            return line
    return ""

def transfer_sd_files(base_dir: str):
    sdcard_dir = os.path.join(base_dir, "data", "sdcard")
    if not os.path.exists(sdcard_dir):
        print(f"[ERROR] {sdcard_dir} が存在しません")
        sys.exit(1)

    print(f"============================================================")
    print(f" T-dongle-S3 MicroSD カード 自動ファイル転送")
    print(f" ポート: {PORT} (ボーレート: {BAUD})")
    print(f" 送信元: {sdcard_dir}")
    print(f"============================================================")

    try:
        ser = serial.Serial(PORT, BAUD, timeout=5.0)
    except Exception as e:
        print(f"[ERROR] ポートオープン失敗: {e}")
        sys.exit(1)

    time.sleep(0.5)
    ser.reset_input_buffer()

    print(" -> T-dongle-S3 の稼働状態を確認中...")
    resp = send_command(ser, "PING", timeout=2.0)
    print(f"    PING応答: {resp}")
    if "PONG" not in resp:
        # 再度試行
        resp = send_command(ser, "PING", timeout=2.0)
        print(f"    再試行PING応答: {resp}")

    # 1. ディレクトリ作成
    print("\n -> ディレクトリ作成: /guidelines")
    resp = send_command(ser, "MKDIR /guidelines", timeout=2.0)
    print(f"    MKDIR応答: {resp}")

    # 2. ファイル一覧の収集
    files_to_send = []
    for root, _, files in os.walk(sdcard_dir):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, sdcard_dir)
            target_path = "/" + rel_path.replace("\\", "/")
            files_to_send.append((full_path, target_path))

    print(f"\n -> 転送対象ファイル数: {len(files_to_send)} 件")

    # 3. ファイル順次送信
    success_count = 0
    for idx, (local_path, target_path) in enumerate(files_to_send, 1):
        file_size = os.path.getsize(local_path)
        with open(local_path, "rb") as fp:
            data = fp.read()

        print(f"[{idx}/{len(files_to_send)}] 転送中: {target_path} ({file_size} B)...", end="", flush=True)

        # まず既存ファイルサイズを確認
        ser.reset_input_buffer()
        ser.write(f"SIZE {target_path}\n".encode('utf-8'))
        t_check = time.time() + 1.5
        remote_size = None
        while time.time() < t_check:
            s_line = ser.readline().decode('utf-8', errors='ignore').strip()
            if s_line.startswith("SIZE "):
                parts = s_line.split()
                if len(parts) >= 3:
                    try:
                        remote_size = int(parts[2])
                    except ValueError:
                        pass
                break
            elif "NOT_FOUND" in s_line:
                break

        if remote_size == file_size:
            print(" ⏭️ スキップ (同名・同サイズ書込済)")
            success_count += 1
            continue

        # 書込要求
        ser.reset_input_buffer()
        cmd = f"WRITE {target_path} {file_size}\n".encode('utf-8')
        ser.write(cmd)
        ser.flush()

        # READY 待機
        ready_ok = False
        t_end = time.time() + 5.0
        while time.time() < t_end:
            r_line = ser.readline().decode('utf-8', errors='ignore').strip()
            if "READY" in r_line:
                ready_ok = True
                break

        if ready_ok:
            # バイナリデータ送信（128バイト単位・ACK同期フロー制御）
            chunk_size = 128
            transfer_failed = False
            for offset in range(0, len(data), chunk_size):
                chunk = data[offset:offset + chunk_size]
                ser.write(chunk)
                ser.flush()
                # チャンクACK ('K') を待機
                ack = ser.read(1)
                if ack != b'K':
                    print(f" ⚠️ ACK失敗 (offset {offset}, ack={ack})", end="")
                    transfer_failed = True
                    break

            if transfer_failed:
                print(" ❌ 送信中断")
                continue

            # 書込結果確認 (最大10秒待機)
            t_end = time.time() + 10.0
            res = ""
            while time.time() < t_end:
                r_line = ser.readline().decode('utf-8', errors='ignore').strip()
                if "OK_WRITE" in r_line:
                    res = r_line
                    break
                elif "ERR_" in r_line:
                    res = r_line
                    break

            if "OK_WRITE" in res:
                print(" ✓ 成功")
                success_count += 1
            else:
                print(f" ⚠️ 書込応答: {res}")
        else:
            print(" ❌ READY応答なし")

    # 4. SDカード内ファイル一覧確認
    print("\n -> SDカード内ファイル検証中...")
    ser.reset_input_buffer()
    ser.write(b"LIST\n")
    t_end = time.time() + 3.0
    while time.time() < t_end:
        line = ser.readline().decode('utf-8', errors='ignore').strip()
        if not line:
            continue
        if "END_LIST" in line:
            break
        print(f"    {line}")

    ser.close()
    print(f"\n============================================================")
    print(f" ✓ 転送完了: {success_count} / {len(files_to_send)} ファイル成功！")
    print(f"============================================================")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.abspath(os.path.join(script_dir, "..", ".."))
    transfer_sd_files(base)
