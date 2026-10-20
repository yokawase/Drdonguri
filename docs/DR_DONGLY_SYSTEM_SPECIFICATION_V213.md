# DrVoice どんぐり君！（Dr.Dongly）全機能詳細技術仕様書
### システムバージョン: v2.13.2 / ファームウェアバージョン: v22.4

**文書管理番号**: MEDART-DRD-TECHSPEC-2026-V213  
**発行日**: 2026年10月20日  
**著作権**: 株式会社MedArt / DrVoice どんぐり君！開発プロジェクトチーム  
**公式公開URL (PWA)**: [https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)  
**準拠ガイドライン**: 厚生労働省「医療情報システムの安全管理に関するガイドライン 第6.0版」 / 厚生労働省「プログラムの医療機器該当性に関するガイドライン」

---

## 目次

1. [システム概要 & 解決する医療課題](#1-システム概要--解決する医療課題)
2. [システム全体アーキテクチャ](#2-システム全体アーキテクチャ)
3. [ハードウェア仕様 & ピンアサイン](#3-ハードウェア仕様--ピンアサイン)
4. [デバイスファームウェア仕様 (v22.4)](#4-デバイスファームウェア仕様-v224)
5. [v20.1 HYBRIDキーストローク & 長単位結合オートマトン](#5-v201-hybridキーストローク--長単位結合オートマトン)
6. [32GB MicroSD 10大医療データポートフォリオ (29.8GB配分)](#6-32gb-microsd-10大医療データポートフォリオ-298gb配分)
7. [デュアル通信プロトコル仕様 (BLE 5.0 + Wi-Fi SoftAP)](#7-デュアル通信プロトコル仕様-ble-50--wi-fi-softap)
8. [USB仮想プリンタによる電カル吸い上げ仕様](#8-usb仮想プリンタによる電カル吸い上げ仕様)
9. [Web / PWA アプリケーション仕様 (v2.13.2)](#9-web--pwa-アプリケーション仕様-v2132)
10. [オンデバイス医療AI仕様 (WebLLM Gemma 2 & EmbeddingGemma 2)](#10-オンデバイス医療ai仕様-webllm-gemma-2--embeddinggemma-2)
11. [医療安全・誤爆防止 4大原則](#11-医療安全誤爆防止-4大原則)
12. [品質保証 & テスト検証体制](#12-品質保証--テスト検証体制)

---

## 1. システム概要 & 解決する医療課題

### 1.1 医療現場における4大障壁
1. **電子カルテ閉域網（Air-Gapped Network）の壁**: 外部インターネットから遮断されているため、市販のクラウド音声入力やクラウドAIが導入不可。
2. **院内USBセキュリティ規制（EDR / MSC禁止）の壁**: マルウェア感染および個人情報持出防止のため、USBメモリ（マスストレージ: MSC）の挿入が一律禁止。
3. **IME誤変換・キーボードエミュレーションの文字化け事故**: 従来のALT codes送信によるOSメニューバー脱落事故（Menu Bar Trap）やIME ON/OFF干渉による重大な誤記載リスク。
4. **2024年医師働き方改革への対応**: 医師1人あたり1日1〜2時間を要する電子カルテ記載・退院サマリー作成業務の削減が急務。

### 1.2 本システムの解決アプローチ
「**DrVoice どんぐり君！（Dr.Dongly）**」は、医師個人の手元端末（スマートフォン／タブレットPWA）と、電子カルテ端末のUSBポートに直挿しする超小型ESP32ドングルをWeb Bluetooth（BLE）でワイヤレス接続し、電子カルテPC側には一切のドライバ・常駐ソフトウェアをインストールすることなく、**標準USB物理キーボード（HID）および標準テキストプリンタ**として動作させる完全オンプレミス型ソリューションです。

---

## 2. システム全体アーキテクチャ

```mermaid
flowchart TD
    subgraph Client [医師の手元端末 (スマートフォン / タブレット PWA v2.13.2)]
        UI["Native PWA Edge Layout (スプリットコンプリメンタリー)"]
        Audio["Web Speech API 音声認識 ＆ リアルタイム波形"]
        Vibrato["0.5ms WASM形態素解析 (Sudachi Mode C)"]
        Compiler["HYBRID キーストローク トランスパイラ"]
        WebLLM["WebGPU ローカルLLM (Gemma 2 2B FP32/INT4)"]
        Embedding["EmbeddingGemma 2 (740M MRL 128d) ベクトル検索"]
        AudioCtrl["Web Audio API 消音ミュート制御 (Local-first)"]
    end

    subgraph Wireless [超低遅延デュアルワイヤレス通信]
        BLE["BLE 5.0 2M PHY (GATT / CRC16パケット / 11ms遅延制御)"]
        SoftAP["Wi-Fi SoftAP 192.168.4.1 (原本PDF / 1024px WebP ストリーミング)"]
    end

    subgraph Dongle [ESP32-S3 ハードウェアドングル (ファームウェア v22.4)]
        FW["Core 0: BLE/Wi-Fi通信 ＆ Core 1: 物理打鍵・プリンタ処理"]
        TinyUSB["TinyUSB 複合スタック: HID Keyboard(03h) + 仮想プリンタ(07h)"]
        NoMSC["※ マスストレージ (MSC) クラス完全無効化 (EDR完全無風)"]
        LCD["ST7735 0.96インチ カラーLCD (どんぐり君ステータス描画)"]
        LED["APA102 / WS2812 フルカラーLED"]
        SD["32GB MicroSD (10大医療ポートフォリオ 29.8GB / Zero-Write保護)"]
    end

    subgraph Terminal [医療機関 電子カルテ端末 (完全閉域網 PC)]
        HID["OS標準 USB HID キーボード (直接打鍵注入)"]
        PRT["OS標準 USB テキストプリンタ (Bulk OUT 吸い上げ)"]
        KarteApp["電子カルテ アプリケーション (SOAP / 処方箋 / サマリー)"]
    end

    Audio --> UI
    UI --> Vibrato
    Vibrato --> Compiler
    Compiler --> BLE
    BLE <--> FW

    FW --> TinyUSB
    TinyUSB --> HID
    HID -->|11ms インターキー遅延 直接打鍵| KarteApp

    KarteApp -->|印刷 Ctrl+P| PRT
    PRT --> TinyUSB
    TinyUSB --> FW
    FW -->|BLE Notification| BLE
    BLE --> WebLLM
    WebLLM --> UI

    SD <-->|HTTP GET / 192.168.4.1| SoftAP
    SoftAP --> UI
```

---

## 3. ハードウェア仕様 & ピンアサイン

本システムは、医療機関の現場環境に応じて以下の2種類のハードウェアを選択可能です。

| 項目 | LilyGO T-Dongle-S3 (推奨・主力機) | M5Stack AtomS3U (超小型ポータブル機) |
| :--- | :--- | :--- |
| **SoC** | ESP32-S3 (Xtensa Dual-Core 32-bit LX7, 最大240MHz) | ESP32-S3 (Xtensa Dual-Core 32-bit LX7, 最大240MHz) |
| **Flash / PSRAM** | 16MB Flash / 8MB Octal PSRAM | 8MB Flash / 内蔵SRAM |
| **USB インターフェース** | USB Type-A オス (オンボード直挿し, Full Speed 12Mbps) | USB Type-A オス (オンボード直挿し, Full Speed 12Mbps) |
| **ディスプレイ** | 0.96インチ ST7735 SPI カラーIPS液晶 (160×80 px) | 非搭載 (超小型化特化) |
| **インジケータ** | フルカラー APA102 DotStar RGB LED | フルカラー WS2812 RGB LED |
| **外部ストレージ** | MicroSDカードスロット (SPI接続, 最大128GB対応) | 非搭載 (内蔵SPIFFS辞書のみ) |
| **マイク** | 非搭載 (スマホ側マイク使用) | SPM1423 PDM デジタルマイク内蔵 |
| **外形寸法・重量** | 58 × 22 × 11 mm / 約18g | 52 × 20 × 10 mm / 約12g |

### ピンアサイン（LilyGO T-Dongle-S3）
- `TFT_MOSI: GPIO 3` / `TFT_SCLK: GPIO 5` / `TFT_CS: GPIO 4` / `TFT_DC: GPIO 2` / `TFT_RST: GPIO 1` / `TFT_BL: GPIO 38`
- `SD_MOSI: GPIO 11` / `SD_MISO: GPIO 13` / `SD_SCLK: GPIO 12` / `SD_CS: GPIO 10`
- `LED_DATA: GPIO 40` / `LED_CLK: GPIO 39`
- `BTN_PIN: GPIO 0`

---

## 4. デバイスファームウェア仕様 (v22.4)

### 4.1 TinyUSB 複合クラス・ドライバ設計
- **USB Vendor ID (VID)**: `0x303A` (Espressif)
- **USB Product ID (PID)**: `0x8001` (Dr.Dongly Dual Composite)
- **複合クラス構成**:
  1. **HID Keyboard Interface (Interface 0, Class 03h)**:
     - エンドポイント: IN Interrupt (EP 0x81, 64バイト, ポーリング間隔 1ms)
     - レポート記述子: 標準 8バイト キーボードレポート（修飾キー1バイト、予約1バイト、キースキャンコード6バイト）
  2. **Printer Interface (Interface 1, Class 07h, Subclass 01h, Protocol 02h 双方向)**:
     - エンドポイント: OUT Bulk (EP 0x02, 64バイト) / IN Bulk (EP 0x82, 64バイト)
- **MSC（マスストレージ）の完全無効化**:
  - `usb_descriptors.c` において、Class 08h（Mass Storage）の記述子、SCSIコマンドハンドラ、BOT（Bulk-Only Transport）エンドポイントを一切定義せず完全に排除。
  - **効果**: 病院のEDR（CrowdStrike、Microsoft Defender for Endpoint等）および情報漏洩防止DLPツールから「USBメモリ」として一切検知されず、セキュリティアラート・ポート遮断が起きません。

### 4.2 物理打鍵タイミング制御
- **インターキー遅延**: **11ms**（電子カルテPCの低スペック端末・仮想デスクトップVDI・Citrix・VMware環境でも文字抜けを起こさない安全最適値）。
- **KeyUp 二重送出**: キー押し下げ後、確実にキー解放レポート（全ゼロ）を送出し、キー押しっぱなし暴走を物理遮断。

---

## 5. v20.1 HYBRIDキーストローク & 長単位結合オートマトン

### 5.1 長単位結合オートマトン（Sudachi Mode C 思想）
日本語の医学用語は形態素解析で「単漢字」に過剰分断されると、IME変換時に誤変換が頻発します（例: 「背中」➔「背」「中」、「体動時」➔「体」「動」「時」）。
Dr.Donglyでは、独自の長単位結合オートマトンにより、複合名詞および医療接尾辞を1つの長いトークンとして統合します。

### 5.2 4大HYBRID打鍵プレフィックス
トランスパイラ（[`KeyStrokeCompiler.ts`](file:///home/medart-code/Drdonguri/src/services/KeyStrokeCompiler.ts)）は、形態素を以下の4分類に自動コンパイルしてドングルへ送信します：

| 識別子 | 対象品詞 / 文字列種別 | 打鍵シーケンス | 特徴・安全対策 |
| :---: | :--- | :--- | :--- |
| **`[Z]`** | 漢字熟語・自立語語幹（例:「増悪」「動か」） | 熟語全体の正規化ローマ字打鍵 ➔ **Spaceキー** ➔ **Enter確定** | 単漢字ではなく熟語単位で一括変換するため、IMEの文脈予測が最適に作動。 |
| **`[K]`** | 全角カタカナ（例:「カルテ」「アセスメント」） | 平仮名ローマ字打鍵 ➔ **KEY_F7 強制確定** | カタカナ変換の誤爆を物理的に根絶。Space変換を一切行わない。 |
| **`[H]`** | 付属語（助詞/語尾/句読点、例:「の」「について」「。」） | 平仮名ローマ字打鍵 ➔ **即時 Enter 確定 (Space禁止)** | 助詞・句読点にSpaceキーが混入して勝手な漢字に化ける事故を永久遮断。 |
| **`[A]`** | 半角英数字・記号（例:「120/80」「mg」「SpO2」） | IMEを介さず **ASCIIキーコード直接送出 (F10確定)** | 数値や単位の全角化・誤変換を完全排除。 |

> **ALT codesの永久排除**: OSメニューバー脱落事故（Menu Bar Trap）、レジストリ権限の壁、IME ON/OFF干渉による文字化け、EDR異常検知を防ぐため、ALT codesはシステム全体から完全撤廃されています。

---

## 6. 32GB MicroSD 10大医療データポートフォリオ (29.8GB配分)

32GB MicroSD（実効容量 29.8GB）のストレージ領域は、Zero-Write（読取専用保護）の厳格な配分マップに基づき管理されています。

```
32GB MicroSD (29.8 GB) 配分マップ
┌────────────────────────────────────────────────────────┬────────┐
│ ① ガイドライン原本PDF & Minds構造化全集 (450タイトル)    │ 10.5 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ② ローカルAIモデル重み (Gemma 2 2B/9B, EmbeddingGemma 2)│  6.5 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ③ 医薬品添付文書全文 (22,000品目) & 錠剤識別写真WebP     │  4.5 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ④ 臨床アトラス画像 (皮膚科・内視鏡・ECG方眼紙 4,000点)  │  4.0 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ⑤ セマンティック・ベクトル & 全文検索インデックス (128d) │  1.5 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ⑥ 救急・中毒・災害医療(DMAT)プロトコル (PAM, NAC, トリアージ)│  0.8 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ⑦ 医科診療報酬・公的医療コード・検査・スコアマスター    │  0.5 GB│
├────────────────────────────────────────────────────────┼────────┤
│ ⑧ システム予約・リードキャッシュ領域 (FAT破損防止保護) │  1.5 GB│
└────────────────────────────────────────────────────────┴────────┘
```

1. **ガイドライン原本PDF & Minds構造化全集 (10.5 GB)**: Minds収載全疾患・約450タイトルの公式原本PDFおよびCQ全件。
2. **ローカルAIモデル重み (6.5 GB)**: Gemma 2 2B/9B, EmbeddingGemma 2 (INT4/FP16), Whisper オフライン重み。
3. **医薬品添付文書全文 & 錠剤識別写真 (4.5 GB)**: PMDA公表約22,000品目の添付文書 ＋ 錠剤表裏刻印写真WebP。
4. **臨床アトラス画像 (4.0 GB)**: 皮膚科・内視鏡・心電図ライブラリ 高解像度WebP 約4,000点（ECG方眼紙グリッド対応）。
5. **セマンティック・ベクトル & 全文検索インデックス (1.5 GB)**: EmbeddingGemma 2 MRL 128d 事前計算ベクトルDB ＋ SQLite FTS5。
6. **救急・中毒・災害医療(DMAT)プロトコル (0.8 GB)**: 有機リン・PAM、アセトアミノフェンOD・NAC、STARTトリアージ。
7. **医科診療報酬・公的医療コード・検査・スコアマスター (0.5 GB)**: 医科点数表、厚労省薬価、病名コード、CHADS2等の臨床スコア。
8. **システム予約・リードキャッシュ領域 (1.5 GB)**: FAT破損防止 Zero-Write 読取専用保護。

---

## 7. デュアル通信プロトコル仕様 (BLE 5.0 + Wi-Fi SoftAP)

医療現場における即時性と大容量転送を両立させるため、デュアル通信アーキテクチャを確立しています。

### 7.1 フェーズ1: BLE 5.0 (2M PHY) 超低遅延通信
- **GATT Service UUID**: `19B10000-E8F2-537E-4F6C-D104768A1214`
- **キーストローク送信 Characteristic**: `19B10001-E8F2-537E-4F6C-D104768A1214` (Write Without Response)
- **プリンタ吸い上げ通知 Characteristic**: `19B10002-E8F2-537E-4F6C-D104768A1214` (Notify)
- **パケット構造**:
  - `[0..1]`: CRC16-CCITT チェックサム (2 bytes)
  - `[2]`: シーケンス番号 (1 byte)
  - `[3]`: コマンド種別 (`0x01`: 打鍵, `0x02`: ステータス, `0x03`: サムネイル)
  - `[4..N]`: ペイロードデータ（UTF-8 打鍵シーケンス）

### 7.2 フェーズ2: Wi-Fi SoftAP (192.168.4.1) 大容量ストリーミング
- **SSID**: `DrDongly-Medical-XXXX` (WPA2-PSK)
- **Webサーバ**: ESP32-S3 Core 0 内蔵軽量HTTPサーバ (Port 80)
- **機能**: 1024px 高解像度アトラスWebP画像およびガイドライン原本PDFの高速HTTPレンジリクエスト・ストリーミング再生。

---

## 8. USB仮想プリンタによる電カル吸い上げ仕様

### 8.1 動作原理
1. 医師が電子カルテ上で任意のテキスト（患者の経過、血液検査データ、処方歴等）を選択し、Windows標準の「印刷（Ctrl+P）」を実行。
2. 出力プリンタとして「Dr.Dongly Generic Text Printer」を選択。
3. 電子カルテPCのOS標準スプーラから、USBドングルのBulk OUTエンドポイント（EP 0x02）へテキストデータが送出。
4. ドングルファームウェアがデータを受信し、BLE経由で医師の手元スマホPWAへ自動転送。

### 8.2 自動開通スクリプト (`setup_denkaru_printer.ps1`)
- 管理者権限不要または標準権限で実行可能なPowerShellスクリプトを提供。
- Windows標準の「Generic / Text Only（汎用/テキストのみ）」プリンタドライバをUSB印刷サポートポート（USB001等）に自動紐付け。

---

## 9. Web / PWA アプリケーション仕様 (v2.13.2)

### 9.1 ネイティブ風PWA仕様 ([`NativePwaEdgeLayout.tsx`](file:///home/medart-code/Drdonguri/src/components/NativePwaEdgeLayout.tsx))
- **Edge-to-Edge デザイン**: iOS Safari / Android Chrome のノッチ・セーフエリア（`env(safe-area-inset-top/bottom)`）に完全追従。
- **バウンス抑止**: `overscroll-behavior-y: none` によるオーバースクロール無効化。
- **スプリットコンプリメンタリー配色トークン**:
  - `dongly.base`: 濃紺・ダークスレート（医療機器の信頼性）
  - `dongly.amber`: 琥珀色（ハイライト・キーストローク動作状態）
  - `dongly.coral`: コーラル赤（警告・録音中・エマージェンシー）
  - `dongly.status`: エメラルド緑（接続・正常同期）

### 9.2 Local-first ワンタップ消音ミュートシステム ([`src/utils/macAudio.ts`](file:///home/medart-code/Drdonguri/src/utils/macAudio.ts))
- 静粛性が求められる診察室・病棟向けに、レトロMac操作効果音（`playMacBeep` 等）を即座に消音するトグルボタンを配置。
- `localStorage`（キー: `drvoice_audio_muted`）により再起動後も消音状態を自動維持。
- メインヘッダー、システムドロワー、10大医療検索モーダルの3箇所に配置。

---

## 10. オンデバイス医療AI仕様 (WebLLM Gemma 2 & EmbeddingGemma 2)

### 10.1 WebGPU ローカルLLM (Gemma 2 2B)
- **モデル**: Google DeepMind Gemma 2 2B (FP32 / INT4 量子化)
- **実行エンジン**: ブラウザ内 WebGPU (Apache TVM WebLLM)
- **ゼロクラウド保証**: 入力テキストおよびプロンプトは医師の手元端末のVRAM/RAM内のみで処理され、外部への通信は一切発生しません。
- **臨床タスク**:
  - 音声入力テキストの誤字脱字修正・医療用語正規化
  - 口頭の会話調テキストから構造化SOAP（Subjective / Objective / Assessment / Plan）形式への自動変換
  - 敬体・常体の統一および冗長表現の圧縮

### 10.2 EmbeddingGemma 2 臨床セマンティック検索
- **モデル**: Google DeepMind EmbeddingGemma 2 (740M MRL 128次元)
- **ベクトルDB**: 10大医療マスター全283件・事前計算ベクトルデータベース ([`embeddingGemmaVectors.ts`](file:///home/medart-code/Drdonguri/src/data/embeddingGemmaVectors.ts))
- **Web Worker**: バックグラウンド高速コサイン類似度ランキング処理（UIの描画フレームレート60fpsを維持）。

---

## 11. 医療安全・誤爆防止 4大原則

1. **F5キーコード完全撤廃**: 従来のキーボードマクロで見られたF5（画面更新）キーコードを物理打鍵エンジンから完全遮断。電子カルテの画面リロード・未保存カルテ消失事故を0%に防止。
2. **Space変換の品詞限定**: 付属語（助詞/語尾/記号）に対するSpaceキー送出をコードレベルで禁止。
3. **キーボードフォーカス監視 & 自動サスペンド**: BLE切断時や通信エラー発生時は、即時に打鍵送信をサスペンドし、中途半端な文字注入を防止。
4. **ハードウェアLED・LCDによる打鍵ステータス可視化**: ドングル上の液晶ディスプレイおよびフルカラーLEDにより、「待機中(青)」「打鍵中(緑)」「エラー(赤)」を医師が視覚的に常時確認可能。

---

## 12. 品質保証 & テスト検証体制

- **ユニットテストフレームワーク**: Vitest
- **テストスイート**:
  - `tests/macAudio.test.ts`: 消音ミュート制御・永続化検証（5件）
  - `tests/medicalDataCatalog.test.ts`: 10大医療カタログ・配分マップ検証（18件）
  - `tests/keyStrokeCompiler.test.ts`: Sudachi Mode C / v20.1 HYBRIDキーストローク検証（24件）
  - `tests/bleMedicalIndexService.test.ts`: BLEパケット・辞書検索検証（12件）
  - `tests/vibratoWorker.test.ts`: 形態素解析・モダリティ解析検証（12件）
- **テスト合格率**: **全71テスト 100% PASS**
- **静的解析**: TypeScript Strictモード（型エラーゼロ）、ESLint パス
- **CI/CDパイプライン**: GitHub Actions による自動テスト・自動ビルド・GitHub Pages への自動デプロイ
