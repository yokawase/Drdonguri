# ==============================================================================
# DrVoice どんぐり君！ 電カルWindows仮想プリンター自動設定スクリプト
# ==============================================================================
# 対象OS: Windows 10 / Windows 11 (電子カルテ端末・閉域網PC)
# 目的: T-Dongle-S3 / AtomS3U のUSB双方向仮想プリンター (Generic / Text Only) を
#       Windowsに完全自動で登録・ポートバインドし、テキスト吸い上げを開通させる。
# ==============================================================================

[CmdletBinding()]
param (
    [string]$PrinterName = "Donguri-Pull",
    [switch]$SetAsDefault = $false
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "  DrVoice どんぐり君！ 電カルWindows仮想プリンター自動設定ツール               " -ForegroundColor Cyan
Write-Host "  USB Bulk OUT 双方向エッジコプロセッサ自動バインドエンジン                    " -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 管理者権限の確認
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "このスクリプトはプリンターを登録するために管理者権限が必要です。"
    Write-Host "管理者権限で再起動します..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

# 2. Windows標準 Generic / Text Only プリンタードライバーの確認・インストール
Write-Host "[1/4] Windows標準 'Generic / Text Only' ドライバーの確認中..." -ForegroundColor Yellow
$driverName = "Generic / Text Only"

$installedDriver = Get-PrinterDriver -Name $driverName -ErrorAction SilentlyContinue
if (-not $installedDriver) {
    Write-Host " -> ドライバーが未登録のため、Windows標準リポジトリから登録中..." -ForegroundColor Cyan
    try {
        Add-PrinterDriver -Name $driverName
        Write-Host " ✓ '$driverName' ドライバーを登録しました。" -ForegroundColor Green
    } catch {
        # rundll32 による ntprint.inf からのフォールバックインストール
        Write-Host " -> フォールバック: printui.dll による ntprint.inf 呼び出し..." -ForegroundColor Yellow
        $infPath = "$env:WINDIR\inf\ntprint.inf"
        & rundll32.exe printui.dll,PrintUIEntry /ia /m "$driverName" /f "$infPath"
        Start-Sleep -Seconds 2
        $installedDriver = Get-PrinterDriver -Name $driverName -ErrorAction SilentlyContinue
        if ($installedDriver) {
            Write-Host " ✓ '$driverName' ドライバーの登録に成功しました。" -ForegroundColor Green
        } else {
            Write-Error "ドライバーの登録に失敗しました: $_"
        }
    }
} else {
    Write-Host " ✓ '$driverName' ドライバーはインストール済みです。" -ForegroundColor Green
}

# 3. USB印刷ポート (USB001, USB002 等) の検出
Write-Host "[2/4] USB仮想印刷ポートの検出中..." -ForegroundColor Yellow

$usbPorts = Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "USB*" } | Sort-Object Name -Descending

$targetPort = $null
if ($usbPorts -and $usbPorts.Count -gt 0) {
    $targetPort = $usbPorts[0].Name
    Write-Host " ✓ 検出されたUSB印刷ポート: $targetPort (合計 $($usbPorts.Count) ポート検出)" -ForegroundColor Green
} else {
    # ポートがまだ見つからない場合: T-Dongle-S3 が未接続の可能性がある
    Write-Host ""
    Write-Warning "現在、USB印刷ポート (USB001等) が検出されていません。"
    Write-Host "【重要】T-Dongle-S3 をPCのUSBポートにしっかり差し込んでください。" -ForegroundColor Cyan
    Write-Host "※ ドングルのLCDに画面が表示されるか確認してください。" -ForegroundColor Cyan
    Write-Host "※ 挿入後、5秒待機して再スキャンします..." -ForegroundColor Yellow
    
    Start-Sleep -Seconds 5
    $usbPorts = Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "USB*" } | Sort-Object Name -Descending
    if ($usbPorts -and $usbPorts.Count -gt 0) {
        $targetPort = $usbPorts[0].Name
        Write-Host " ✓ USB印刷ポートが検出されました: $targetPort" -ForegroundColor Green
    } else {
        # 既定のポートとして USB001 を仮定
        $targetPort = "USB001"
        Write-Host " -> ポートを '$targetPort' として先行登録します (挿入時に自動リンクされます)。" -ForegroundColor Yellow
    }
}

# 4. 仮想プリンター (Donguri-Pull) の登録・ポート割り当て
Write-Host "[3/4] 仮想プリンター '$PrinterName' の構成中..." -ForegroundColor Yellow

$existingPrinter = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
if ($existingPrinter) {
    Write-Host " -> 既存のプリンター '$PrinterName' を検出しました。ポート設定を更新します..." -ForegroundColor Cyan
    Set-Printer -Name $PrinterName -PortName $targetPort -DriverName $driverName
    Write-Host " ✓ プリンター '$PrinterName' をポート '$targetPort' に更新しました！" -ForegroundColor Green
} else {
    Write-Host " -> 新規プリンター '$PrinterName' を追加中 (ポート: $targetPort)..." -ForegroundColor Cyan
    try {
        Add-Printer -Name $PrinterName -DriverName $driverName -PortName $targetPort
        Write-Host " ✓ 仮想プリンター '$PrinterName' を新規登録しました！" -ForegroundColor Green
    } catch {
        # rundll32 によるフォールバック追加
        Write-Host " -> フォールバック: printui.dll によるプリンター追加..." -ForegroundColor Yellow
        & rundll32.exe printui.dll,PrintUIEntry /if /b "$PrinterName" /f "$env:WINDIR\inf\ntprint.inf" /r "$targetPort" /m "$driverName"
        Start-Sleep -Seconds 2
        $check = Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue
        if ($check) {
            Write-Host " ✓ プリンター '$PrinterName' の登録に成功しました！" -ForegroundColor Green
        } else {
            Write-Error "プリンターの追加に失敗しました: $_"
        }
    }
}

# 通常使うプリンターの設定（オプション）
if ($SetAsDefault) {
    (New-Object -ComObject WScript.Network).SetDefaultPrinter($PrinterName)
    Write-Host " ✓ '$PrinterName' を通常使うプリンターに設定しました。" -ForegroundColor Green
}

# 5. 双方向テスト送信（疎通確認）
Write-Host "[4/4] T-Dongle-S3 への双方向通信テスト（疎通確認）..." -ForegroundColor Yellow

try {
    $testTimestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $testText = "=== DONGURI MEDICAL EHR PULL TEST ===`r`nTimestamp: $testTimestamp`r`nDevice: T-Dongle-S3 Medical Coprocessor`r`nStatus: Communication OK`r`n=====================================`r`n"
    
    $tempFile = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tempFile, $testText, [System.Text.Encoding]::GetEncoding("Shift_JIS"))
    
    # 印刷キューへテキスト送出
    Start-Process -FilePath "notepad.exe" -ArgumentList "/p `"$tempFile`"" -WindowStyle Hidden -Wait
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    
    Write-Host " ✓ テスト印刷データを送出しました。" -ForegroundColor Green
    Write-Host "   (T-Dongle-S3 の LCD画面に 'PULL ...B' とシアン色で表示されれば開通成功です！)" -ForegroundColor Cyan
} catch {
    Write-Warning "テストデータの自動送出中に警告が発生しました (実運用には影響ありません): $_"
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " 🎉 電カル仮想プリンターの自動設定が完了しました！" -ForegroundColor Green
Write-Host ""
Write-Host " 【電カルでのテキスト吸い上げ手順】" -ForegroundColor Cyan
Write-Host "   1. 電子カルテ画面で過去カルテや所見を表示します。" -ForegroundColor White
Write-Host "   2. 印刷 (Ctrl + P) を押し、プリンターに '$PrinterName' を選択して [印刷] を実行。" -ForegroundColor White
Write-Host "      (または DrVoice Webアプリの [① 自動吸い上げ] ボタンを押すと、ドングルが自動打鍵)" -ForegroundColor White
Write-Host "   3. テキストデータが瞬時に T-Dongle-S3 に吸い上げられ、BLEでアプリへ連携されます。" -ForegroundColor White
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""
