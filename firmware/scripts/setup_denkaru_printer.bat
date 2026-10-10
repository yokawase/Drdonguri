@echo off
chcp 65001 >nul
title DrVoice どんぐり君 電カル仮想プリンター自動設定ツール
echo ==============================================================================
echo   DrVoice どんぐり君！ 電カルWindows仮想プリンター自動設定ツール
echo   T-Dongle-S3 / AtomS3U 医療双方向エッジコプロセッサ
echo ==============================================================================
echo.

:: 1. 管理者権限のチェック & 自動昇格
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] 管理者権限を取得しています。UACダイアログが表示されたら [はい] を押してください...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: 2. PowerShell 自動設定スクリプトの実行 (ポリシー制限をバイパス)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_denkaru_printer.ps1"

echo.
echo 処理が完了しました。何かキーを押すと画面を閉じます。
pause >nul
