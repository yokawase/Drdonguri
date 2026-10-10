# ==============================================================================
# DrVoice どんぐり君！ (T-Dongle-S3 / ESP32-S3 16MB) 書込スクリプト
# ==============================================================================
# 実行要件: Windows 10/11, PowerShell 5.1 / 7+, PlatformIO Core (pio)
# ハードウェア: LILYGO T-Dongle-S3 (ESP32-S3, 16MB Flash, 0.96inch ST7735 LCD, MicroSD)
# ==============================================================================

[CmdletBinding()]
param (
    [string]$ComPort = "",
    [switch]$SkipFs = $false,
    [switch]$SkipApp = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  DrVoice どんぐり君！ T-Dongle-S3 (ESP32-S3 16MB) 書込スクリプト             " -ForegroundColor Cyan
Write-Host "  USB Composite (HID打鍵 + 仮想プリンタ吸い上げ) & LCDピクセルアート表示      " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. カレントディレクトリの確認
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$ScriptDir\..\platformio.ini") {
    $BaseDir = (Resolve-Path "$ScriptDir\..").Path
} else {
    $BaseDir = (Get-Location).Path
}
Set-Location $BaseDir

Write-Host "[1/4] プロジェクト構成の検証中: $BaseDir" -ForegroundColor Yellow
if (-not (Test-Path "platformio.ini")) {
    Write-Error "platformio.ini が見つかりません。firmware ディレクトリ直下で実行してください。"
}
if (-not (Test-Path "partitions_16MB.csv")) {
    Write-Error "partitions_16MB.csv が見つかりません。"
}
if (-not (Test-Path "src\main.cpp")) {
    Write-Error "src\main.cpp が見つかりません。"
}

# 2. PlatformIO コマンドの確認
Write-Host "[2/4] PlatformIO Core (pio) の検出中..." -ForegroundColor Yellow
$PioCmd = $null
if (Get-Command "pio" -ErrorAction SilentlyContinue) {
    $PioCmd = "pio"
} elseif (Test-Path "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe") {
    $PioCmd = "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe"
} else {
    Write-Host " -> pio コマンドが見つかりません。pip で PlatformIO Core をインストールします..." -ForegroundColor Yellow
    pip install platformio
    if (Get-Command "pio" -ErrorAction SilentlyContinue) {
        $PioCmd = "pio"
    } else {
        $PioCmd = "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe"
    }
}
Write-Host " -> 使用する PlatformIO: $PioCmd" -ForegroundColor Green

# 3. SPIFFS 辞書データの確認
Write-Host "[3/4] SPIFFS 辞書バイナリ (data/) の確認中..." -ForegroundColor Yellow
$DataDir = Join-Path $BaseDir "data"
$TermsBin = Join-Path $DataDir "med_terms.bin"

if (Test-Path $TermsBin) {
    $tSize = (Get-Item $TermsBin).Length
    Write-Host " -> 辞書バイナリ確認: med_terms.bin ($tSize B)" -ForegroundColor Green
} else {
    Write-Warning "data/med_terms.bin が見つかりません。辞書なしで進行します。"
}

# 4. COMポートの検出＆入力解決
Write-Host "[4/4] T-Dongle-S3 シリアルポートの検出中..." -ForegroundColor Yellow
$Ports = [System.IO.Ports.SerialPort]::GetPortNames()

if ([string]::IsNullOrWhiteSpace($ComPort)) {
    if ($Ports.Count -eq 0) {
        Write-Host ""
        Write-Warning "シリアルポートが自動検出されませんでした。"
        Write-Host "【ヒント】T-Dongle-S3 のBOOTボタン (正面の小さなボタン) を押しながらUSBポートに挿入してください。" -ForegroundColor Cyan
        $UserInput = (Read-Host "使用する COM ポート名を入力してください (例: COM5)").Trim()
        $ComPort = if ($UserInput.StartsWith("COM", [System.StringComparison]::OrdinalIgnoreCase)) { $UserInput.ToUpper() } else { "COM$UserInput" }
    } elseif ($Ports.Count -eq 1) {
        $ComPort = $Ports[0]
        Write-Host " -> 自動検出されたポート: $ComPort" -ForegroundColor Green
    } else {
        Write-Host "複数のシリアルポートが検出されました:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $Ports.Count; $i++) {
            Write-Host "  [$i] $($Ports[$i])"
        }
        $UserInput = (Read-Host "使用するポート名または番号を入力してください (例: COM5 または 5) [デフォルト: $($Ports[0])]").Trim()
        if ([string]::IsNullOrWhiteSpace($UserInput)) {
            $ComPort = $Ports[0]
        } elseif ($UserInput.StartsWith("COM", [System.StringComparison]::OrdinalIgnoreCase)) {
            $ComPort = $UserInput.ToUpper()
        } elseif ($Ports -contains "COM$UserInput") {
            $ComPort = "COM$UserInput"
        } elseif ($UserInput -match '^\d+$' -and [int]$UserInput -ge 0 -and [int]$UserInput -lt $Ports.Count) {
            $ComPort = $Ports[[int]$UserInput]
        } elseif ($UserInput -match '^\d+$') {
            $ComPort = "COM$UserInput"
        } else {
            $ComPort = $UserInput
        }
    }
}

if ([string]::IsNullOrWhiteSpace($ComPort)) {
    Write-Error "有効なCOMポートが指定されませんでした。スクリプトを再実行してください。"
}

Write-Host " -> 選択されたターゲットポート: $ComPort" -ForegroundColor Green

# 5. 書込実行
Write-Host ""
Write-Host "T-Dongle-S3 ($ComPort) への書込を開始します..." -ForegroundColor Yellow

# A. SPIFFS (辞書領域) の書込
if (-not $SkipFs -and (Test-Path $DataDir)) {
    Write-Host ""
    Write-Host ">>> [A] SPIFFS 辞書イメージの構築 & フラッシュ書き込み..." -ForegroundColor Cyan
    & $PioCmd run -e lilygo-t-dongle-s3 --target uploadfs --upload-port $ComPort
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "SPIFFS の書き込みにスキップまたは警告が発生しました。本体ファームウェアへ進みます。"
    } else {
        Write-Host " ✓ SPIFFS 辞書領域の書込完了！" -ForegroundColor Green
    }
}

# B. ファームウェア本体のコンパイル & 書込
if (-not $SkipApp) {
    Write-Host ""
    Write-Host ">>> [B] ファームウェア本体 (lilygo-t-dongle-s3) のコンパイル & 書き込み..." -ForegroundColor Cyan
    & $PioCmd run -e lilygo-t-dongle-s3 --target upload --upload-port $ComPort
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ファームウェアの書き込みに失敗しました。BOOTボタンを押しながら再挿入して再試行してください。"
    }
    Write-Host " ✓ ファームウェア本体の書込完了！" -ForegroundColor Green
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " 🎉 T-Dongle-S3 への書込がすべて正常に完了しました！" -ForegroundColor Green
Write-Host "    - LCD画面に 'WAITING BLE' とシンプル可愛いくっきりどんぐりさんが表示されます。" -ForegroundColor Green
Write-Host "    - PCから抜いて、電カルPCに挿し直してください。" -ForegroundColor Green
Write-Host "    - 次に 'setup_denkaru_printer.bat' を実行して仮想プリンターを自動登録してください。" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""
