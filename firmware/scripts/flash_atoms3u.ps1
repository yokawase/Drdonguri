# ==============================================================================
# DrVoice どんぐり君！ (AtomS3U / ESP32-S3) ファームウェア & SPIFFS辞書書込スクリプト
# ==============================================================================
# 実行要件: Windows 10/11, PowerShell 5.1 / 7+, PlatformIO Core (pio)
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
Write-Host "  DrVoice どんぐり君！ AtomS3U (ESP32-S3 8MB) 書込スクリプト (v16.0)           " -ForegroundColor Cyan
Write-Host "  Zero-RAM SPIFFS二分探索 (/kanji_f5.bin, /med_terms.bin) 物理打鍵エンジン     " -ForegroundColor Cyan
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
if (-not (Test-Path "partitions_8MB.csv")) {
    Write-Error "partitions_8MB.csv が見つかりません。"
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

# 3. SPIFFS 辞書データ (data/) の確認・自動生成
Write-Host "[3/4] SPIFFS 辞書バイナリ (data/) の確認中..." -ForegroundColor Yellow
$DataDir = Join-Path $BaseDir "data"
if (-not (Test-Path $DataDir)) {
    New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
}

$KanjiBin = Join-Path $DataDir "kanji_f5.bin"
$TermsBin = Join-Path $DataDir "med_terms.bin"

function Generate-SeedDictionaries {
    param ([string]$DataPath)
    Write-Host " -> シード辞書バイナリ (kanji_f5.bin / med_terms.bin) を直接生成中..." -ForegroundColor Yellow

    # A. 難読漢字マスター (8バイト固定長)
    $kanjiCatalog = @(
        @{ Char = "嚥"; Unicode = 0x54BD },
        @{ Char = "瘻"; Unicode = 0x763B },
        @{ Char = "褥"; Unicode = 0x8925 },
        @{ Char = "瘡"; Unicode = 0x7621 },
        @{ Char = "瘢"; Unicode = 0x7622 },
        @{ Char = "痕"; Unicode = 0x75D5 },
        @{ Char = "痙"; Unicode = 0x7579 },
        @{ Char = "攣"; Unicode = 0x65DE },
        @{ Char = "掻"; Unicode = 0x63BB },
        @{ Char = "爬"; Unicode = 0x722C },
        @{ Char = "痺"; Unicode = 0x75FA },
        @{ Char = "癌"; Unicode = 0x764C },
        @{ Char = "瘤"; Unicode = 0x7624 },
        @{ Char = "喀"; Unicode = 0x5580 },
        @{ Char = "痰"; Unicode = 0x75F0 },
        @{ Char = "嘔"; Unicode = 0x5614 },
        @{ Char = "吐"; Unicode = 0x5410 },
        @{ Char = "嗄"; Unicode = 0x55E4 },
        @{ Char = "膿"; Unicode = 0x81BF },
        @{ Char = "痂"; Unicode = 0x75C2 },
        @{ Char = "吻"; Unicode = 0x543B },
        @{ Char = "穿"; Unicode = 0x7A7F },
        @{ Char = "腔"; Unicode = 0x8154 },
        @{ Char = "塞"; Unicode = 0x585E },
        @{ Char = "栓"; Unicode = 0x6813 },
        @{ Char = "嚢"; Unicode = 0x56CA },
        @{ Char = "胞"; Unicode = 0x80DE },
        @{ Char = "潰"; Unicode = 0x6F70 },
        @{ Char = "瘍"; Unicode = 0x760D },
        @{ Char = "憩"; Unicode = 0x61A9 },
        @{ Char = "盲"; Unicode = 0x76F2 },
        @{ Char = "鞘"; Unicode = 0x9798 },
        @{ Char = "齲"; Unicode = 0x9F44 },
        @{ Char = "腱"; Unicode = 0x8171 },
        @{ Char = "顆"; Unicode = 0x984E },
        @{ Char = "篩"; Unicode = 0x7BE9 },
        @{ Char = "錐"; Unicode = 0x9310 },
        @{ Char = "嵌"; Unicode = 0x5嵌 },
        @{ Char = "頓"; Unicode = 0x9813 }
    )

    # UTF-8バイト列ソート
    $utf8Enc = [System.Text.Encoding]::UTF8
    $sortedKanji = $kanjiCatalog | Sort-Object {
        $b = $utf8Enc.GetBytes($_.Char)
        [System.BitConverter]::ToString($b)
    }

    $kStream = [System.IO.File]::Create((Join-Path $DataPath "kanji_f5.bin"))
    $kWriter = New-Object System.IO.BinaryWriter($kStream)
    # Header: KANJ (4B) + Count (2B) + RecLen (2B)
    $kWriter.Write($utf8Enc.GetBytes("KANJ"))
    $kWriter.Write([uint16]$sortedKanji.Count)
    $kWriter.Write([uint16]8)

    foreach ($item in $sortedKanji) {
        $uBytes = $utf8Enc.GetBytes($item.Char)
        $padBytes = New-Object byte[] 4
        [System.Array]::Copy($uBytes, $padBytes, [System.Math]::Min(4, $uBytes.Length))
        $kWriter.Write($padBytes)
        $kWriter.Write([uint16]$item.Unicode)
        $kWriter.Write([byte]1) # Flag (0x01: F5強制)
        $kWriter.Write([byte]0) # Padding
    }
    $kWriter.Close()
    $kStream.Close()

    # B. 医療用語・薬品名マスター (32バイト固定長)
    function Fnv1a32([string]$str) {
        $hash = [uint32]0x811C9DC5
        $prime = [uint32]0x01000193
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($str)
        foreach ($b in $bytes) {
            $hash = ($hash -bxor [uint32]$b)
            $hash = [uint32](($hash * $prime) -band 0xFFFFFFFF)
        }
        return $hash
    }

    $termSeeds = @(
        @{ Term = "タケキャブ"; Romaji = "takekyabu"; Mode = 2 },
        @{ Term = "アムロジピン"; Romaji = "amurojipin"; Mode = 2 },
        @{ Term = "ロキソニン"; Romaji = "rokisonin"; Mode = 2 },
        @{ Term = "カロナール"; Romaji = "karonaru"; Mode = 2 },
        @{ Term = "ビオフェルミン"; Romaji = "bioferumin"; Mode = 2 },
        @{ Term = "フォシーガ"; Romaji = "foshiga"; Mode = 2 },
        @{ Term = "ロキソプロフェンナトリウム"; Romaji = "rokisopurofennatoriyumu"; Mode = 2 },
        @{ Term = "アセトアミノフェン"; Romaji = "asetoaminofen"; Mode = 2 },
        @{ Term = "アムロジピンベシル酸塩"; Romaji = "amurojipinbesirusanen"; Mode = 2 },
        @{ Term = "デキストロメトルファン"; Romaji = "dekisutorometorufan"; Mode = 2 },
        @{ Term = "トラネキサム酸"; Romaji = "toranekisamusan"; Mode = 1 },
        @{ Term = "ボノプラザンフマル酸塩"; Romaji = "bonopurazanfumarusanen"; Mode = 2 },
        @{ Term = "急性虫垂炎"; Romaji = "kyuseichusuien"; Mode = 1 },
        @{ Term = "胃潰瘍"; Romaji = "ikaiyou"; Mode = 1 },
        @{ Term = "逆流性食道炎"; Romaji = "gyakuryuseishokudouen"; Mode = 1 },
        @{ Term = "狭心症"; Romaji = "kyoushinshou"; Mode = 1 },
        @{ Term = "急性気管支炎"; Romaji = "kyuuseikikanshien"; Mode = 1 },
        @{ Term = "高血圧症"; Romaji = "kouketsuatsushou"; Mode = 1 },
        @{ Term = "脂質異常症"; Romaji = "shishitsuijoushou"; Mode = 1 },
        @{ Term = "２型糖尿病"; Romaji = "nigatatounyoubyou"; Mode = 1 },
        @{ Term = "帯状疱疹"; Romaji = "taijouhoushin"; Mode = 1 },
        @{ Term = "嚥下障害"; Romaji = "engeshougai"; Mode = 1 },
        @{ Term = "誤嚥性肺炎"; Romaji = "goenseihaien"; Mode = 1 }
    )

    $termRecords = @()
    foreach ($t in $termSeeds) {
        $termRecords += @{
            Hash = Fnv1a32($t.Term)
            Mode = [byte]$t.Mode
            Romaji = $t.Romaji
        }
    }
    $sortedTerms = $termRecords | Sort-Object { $_.Hash }

    $tStream = [System.IO.File]::Create((Join-Path $DataPath "med_terms.bin"))
    $tWriter = New-Object System.IO.BinaryWriter($tStream)
    # Header: TERM (4B) + Count (4B) + RecLen (2B) + Reserved (6B)
    $tWriter.Write($utf8Enc.GetBytes("TERM"))
    $tWriter.Write([uint32]$sortedTerms.Count)
    $tWriter.Write([uint16]32)
    $tWriter.Write((New-Object byte[] 6))

    $asciiEnc = [System.Text.Encoding]::ASCII
    foreach ($rec in $sortedTerms) {
        $tWriter.Write([uint32]$rec.Hash)
        $tWriter.Write([byte]$rec.Mode)
        $rBytes = $asciiEnc.GetBytes($rec.Romaji)
        $rLen = [System.Math]::Min(25, $rBytes.Length)
        $tWriter.Write([byte]$rLen)
        $padRomaji = New-Object byte[] 26
        [System.Array]::Copy($rBytes, $padRomaji, $rLen)
        $tWriter.Write($padRomaji)
    }
    $tWriter.Close()
    $tStream.Close()
}

if ((-not (Test-Path $KanjiBin)) -or (-not (Test-Path $TermsBin))) {
    if (Test-Path "$ScriptDir\compile_pipeline.py") {
        try {
            python "$ScriptDir\compile_pipeline.py"
        } catch {}
    }
    if ((-not (Test-Path $KanjiBin)) -or (-not (Test-Path $TermsBin))) {
        Generate-SeedDictionaries -DataPath $DataDir
    }
}

$kSize = (Get-Item $KanjiBin).Length
$tSize = (Get-Item $TermsBin).Length
Write-Host " -> 辞書バイナリ確認: kanji_f5.bin ($kSize B), med_terms.bin ($tSize B)" -ForegroundColor Green

# 4. COMポートの柔軟な検出＆入力解決
Write-Host "[4/4] AtomS3U (ESP32-S3) シリアルポートの検出中..." -ForegroundColor Yellow
$Ports = [System.IO.Ports.SerialPort]::GetPortNames()

if ([string]::IsNullOrWhiteSpace($ComPort)) {
    if ($Ports.Count -eq 0) {
        Write-Host ""
        Write-Warning "シリアルポートが自動検出されませんでした。"
        Write-Host "【ヒント】AtomS3U をPCのUSB-A端子にしっかりと差し込んでください。" -ForegroundColor Cyan
        Write-Host "書き込みモードにする場合: 正面ボタンまたは側面の小さなボタンを押しながらPCに挿入してください。" -ForegroundColor Cyan
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
Write-Host "AtomS3U ($ComPort) への書込を開始します..." -ForegroundColor Yellow

# A. SPIFFS (辞書領域: 0x210000, 5.87MB) の書込
if (-not $SkipFs) {
    Write-Host ""
    Write-Host ">>> [A] SPIFFS 医療辞書イメージの構築 & フラッシュ書き込み..." -ForegroundColor Cyan
    & $PioCmd run -e m5stack-atoms3u --target uploadfs --upload-port $ComPort
    if ($LASTEXITCODE -ne 0) {
        Write-Error "SPIFFS の書き込みに失敗しました。COMポート ($ComPort) の接続状態を確認してください。"
    }
    Write-Host " ✓ SPIFFS 辞書領域の書込完了！" -ForegroundColor Green
}

# B. ファームウェア本体 (app0: 0x10000, 2MB) の書込
if (-not $SkipApp) {
    Write-Host ""
    Write-Host ">>> [B] ファームウェア本体 (src/main.cpp) のコンパイル & 書き込み..." -ForegroundColor Cyan
    & $PioCmd run -e m5stack-atoms3u --target upload --upload-port $ComPort
    if ($LASTEXITCODE -ne 0) {
        Write-Error "ファームウェアの書き込みに失敗しました。"
    }
    Write-Host " ✓ ファームウェア本体の書込完了！" -ForegroundColor Green
}

Write-Host ""
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " 🎉 AtomS3U への書込がすべて正常に完了しました！" -ForegroundColor Green
Write-Host "    - WS2812 LED が青色（BLE待機）または緑色（BLE接続）に点灯します。" -ForegroundColor Green
Write-Host "    - 電子カルテPCのUSBポートに挿入し、DrVoiceアプリから接続してください。" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Write-Host ""
