# PlatformIO extra_script: 書き込み完了後にウォッチドッグリセットで通常ファームウェアへ確実にブートさせる
# ESP32-S3 内蔵 USB-Serial/JTAG では RTS ハードリセット後に ROM ダウンロードモード
# (rst:0x15, boot:0x0 "waiting for download") で停止することがあるため、
# esptool v5 系の --after watchdog-reset (PlatformIO 同梱 4.5.1 は未対応) を別途実行する。
import subprocess
import sys

Import("env")  # noqa: F821  (PlatformIO が注入)


def _watchdog_reset(source, target, env):
    port = env.subst("$UPLOAD_PORT")
    if not port:
        print("[post_upload] UPLOAD_PORT 未確定のためウォッチドッグリセットをスキップ")
        return
    cmd = [sys.executable, "-m", "esptool", "--port", port, "--after", "watchdog-reset", "run"]
    print("[post_upload] ウォッチドッグリセット実行: " + " ".join(cmd))
    try:
        subprocess.run(cmd, check=False, timeout=30)
    except Exception as exc:  # 書き込み自体は成功しているため警告のみ
        print(f"[post_upload] ウォッチドッグリセット失敗（手動で抜き差ししてください）: {exc}")


env.AddPostAction("upload", _watchdog_reset)  # noqa: F821
