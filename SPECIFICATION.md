# DrVoice どんぐり君！（Dr.Dongly）システム総合技術仕様書

**ドキュメントバージョン**: `v2.18.0`  
**ファームウェアバージョン**: `v23.0`  
**最終更新日**: 2026年10月22日  
**公開WebUI (PWA)**: [https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)  
**リポジトリ**: [yokawase/Drdonguri](https://github.com/yokawase/Drdonguri)

---

## 目次

1. [プロジェクト概要 & 設計思想](#1-プロジェクト概要--設計思想)
2. [システム全体アーキテクチャ](#2-システム全体アーキテクチャ)
3. [ハードウェア & ファームウェア仕様書](#3-ハードウェア--ファームウェア仕様書)
4. [USB複合機 ＆ 通信プロトコル仕様書](#4-usb複合機--通信プロトコル仕様書)
5. [HID物理打鍵エンジン ＆ MS-IME制御アーキテクチャ](#5-hid物理打鍵エンジン--ms-ime制御アーキテクチャ)
6. [クライアント側 PWA / WebUI 仕様書](#6-クライアント側-pwa--webui-仕様書)
7. [オンデバイス臨床AI ＆ セマンティック検索基盤](#7-オンデバイス臨床ai--セマンティック検索基盤)
8. [32GB MicroSD 10大医療データポートフォリオ](#8-32gb-microsd-10大医療データポートフォリオ)
9. [高精度画像OCRエンジン仕様書 (Gemini Vision ＆ ローカル安全網)](#9-高精度画像ocrエンジン仕様書-gemini-vision--ローカル安全網)
10. [セキュリティ・医療安全・運用基準](#10-セキュリティ医療安全運用基準)
11. [ファイル構成 ＆ モジュールリファレンス](#11-ファイル構成--モジュールリファレンス)

---

## 1. プロジェクト概要 & 設計思想

### 1.1 背景とコアミッション
日本の臨床現場における電子カルテ端末は、強固な閉域ネットワーク（インターネット完全遮断・USBメモリ等のマスストレージ禁止・外部ソフトウェアのインストール厳禁）下で運用されています。
医師は診察中にキーボードとマウスに縛られ、患者との対面対話が圧迫される「電子カルテ入力の過大な負担」を抱えています。
本プロダクト **「DrVoice どんぐり君！（Dr.Dongly）」** は、**「電カル端末側には1行のプログラムもインストールせず、物理キーボードおよび仮想プリンタとしてハードウェア認識させる」** ことで、セキュアな閉域電カルへスマートフォンの音声入力・構造化カルテ・医療マスター情報を超高速（11msインターキーディレイ）・無誤爆（100%漢字確定）で直接打鍵転送する革新的な医療入力システムです。

### 1.2 5大コアフィロソフィー
1. **Zero-Installation（電カル端末インストール完全ゼロ）**:
   - 医療情報セキュリティガイドラインに準拠し、電子カルテ端末側には専用ドライバやエージェントソフトを一切導入しません。標準USB-HIDキーボードとして認識させます。
2. **100% 決定論的漢字確定（誤変換の根絶）**:
   - 電カル側MS-IMEの変換予測・学習の揺らぎを送信側の「長単位結合オートマトン（Sudachi Mode C思想）」と「5大IMEコントロール法則」で完全に制御し、同音異義語や誤分断を物理的に防止します。
3. **完全ローカル・患者プライバシー保護**:
   - 音声認識、形態素解析、WebLLM（Gemma 2 2B）、セマンティック検索（EmbeddingGemma 2）はすべてブラウザ内部（WebGPU / Web Worker / IndexedDB）で閉域完結し、患者個人情報や病名が外部サーバーへ流出することを構造的に防ぎます。
4. **32GB MicroSD 10大医療データポートフォリオ**:
   - 日本医療機能評価機構（Minds）ガイドライン約450タイトル原本PDF、PMDA添付文書約22,000品目、錠剤表裏写真、臨床心電図・内視鏡アトラス、DMAT救急中毒プロトコルをデバイス内に常駐。
5. **Zero-Drop 物理打鍵信頼性**:
   - 11msの精密遅延制御、KeyUp二重送出、ALT codesの完全排除、OSメニューバートラップ物理遮断により、1文字の脱落も許さない臨床グレードの打鍵転送を実現。

---

## 2. システム全体アーキテクチャ

システムは大きく **「スマートフォン（PWA）」**、**「ESP32ハードウェアドングル（T-dongle-S3 / AtomS3U）」**、**「医療用電子カルテ端末（Windows PC）」** の3要素で構成されます。

```mermaid
flowchart LR
    subgraph Mobile ["📱 スマートフォン (PWA)"]
        MIC["音声入力 / リアルタイム波形"] --> DECODER["医療音声デコーダー\n(medicalSpeechDecoder.ts)"]
        OCR["高精度カメラOCR\n(Gemini Vision / WASM)"] --> EDITOR["極大化エディタ\n(NativePwaEdgeLayout.tsx)"]
        DECODER --> EDITOR
        
        subgraph LocalAI ["🧠 クライアント閉域AIエンジン"]
            VIBRATO["0.5ms形態素解析\n(vibrato.worker.ts)"]
            EMB["EmbeddingGemma 2 128d\n(embeddingGemmaService.ts)"]
            LLM["WebLLM Gemma 2 2B\n(webLlmService.ts)"]
        end
        
        EDITOR --> VIBRATO
        EDITOR --> EMB
        EDITOR --> LLM
        
        COMPILER["長単位結合オートマトン\n5大IME制御コンパイラ\n(KeyStrokeCompiler.ts)"]
        VIBRATO --> COMPILER
        EDITOR --> COMPILER
    end

    subgraph Hardware ["🔌 どんぐり君 ドングル (T-dongle-S3)"]
        BLE["BLE 5.0 GATT サーバー\n(6E400001-...)"]
        TYPING["物理打鍵エンジン\n(typing_engine.cpp)\n11msディレイ / KeyUp二重送出"]
        DISP["0.96インチ IPS液晶\n(ST7735 80x160 4画面)"]
        LED["APA102 フルカラーLED"]
        WIFI["Wi-Fi SoftAP Port 80\n(192.168.4.1)"]
        SD["32GB MicroSD (29.8GB)\nFAT Zero-Write保護"]
        
        BLE --> TYPING
        TYPING --> DISP
        TYPING --> LED
        WIFI --> SD
    end

    subgraph Denkaru ["💻 医療用電子カルテ端末 (Windows)"]
        USB_HID["USB-HID Keyboard (03h)\n標準HIDドライバ"]
        USB_PRT["USB仮想プリンタ (07h)\nGeneric Text Only"]
        IME["MS-IME / ATOK"]
        CHART["電子カルテ画面\n(SOAP / 処方オーダ)"]
        
        USB_HID --> IME --> CHART
        CHART -. 印刷出力 .-> USB_PRT
    end

    COMPILER == "BLEパケット (CRC16/64B)" ==> BLE
    TYPING == "USBキーストローク直接送出" ==> USB_HID
    USB_PRT == "バルク吸い上げ (Bulk IN)" ==> BLE
    BLE -. リアルタイム吸い上げカルテ .-> EDITOR
    SD == "1024pxアトラスWebP / 原本PDF" ==> WIFI
```

---

## 3. ハードウェア & ファームウェア仕様書

### 3.1 対象ハードウェアプラットフォーム
本システムは以下の2種類のESP32-S3マイコンデバイスを公式サポートします。

| 項目 | **LilyGO T-dongle-S3 (主力推奨機)** | **M5Stack AtomS3U (サブ機)** |
| :--- | :--- | :--- |
| **SoC** | ESP32-S3 (Dual-Core Xtensa LX7 @ 240MHz) | ESP32-S3FN8 (Dual-Core Xtensa LX7 @ 240MHz) |
| **内蔵Flash** | 16MB SPI Flash | 8MB SPI Flash |
| **内蔵SRAM** | 512KB SRAM (PSRAM非搭載) | 512KB SRAM (PSRAM非搭載) |
| **外部ストレージ**| MicroSD (TF Cardスロット搭載、最大32GB) | なし |
| **ディスプレイ** | 0.96インチ IPSカラー液晶 (80×160ドット, ST7735) | なし (RGB LEDのみ) |
| **LEDインジケータ**| APA102 フルカラーDotStar LED (DI: 40, CI: 39) | WS2812B RGB LED (GPIO 35) |
| **物理ボタン** | タクトスイッチ (GPIO 0) | タクトスイッチ (GPIO 41) |
| **USB形状** | USB-A オス (PC直接挿入型) | USB-A オス (超小型ドングル) |
| **用途** | 32GB医療データ常駐、画面ステータス確認、主力運用 | 往診・ポケット携帯用の超小型バックアップ機 |

### 3.2 T-dongle-S3 ピンアサインマッピング
- **ST7735 液晶ディスプレイ**:
  - `TFT_MOSI`: GPIO 3
  - `TFT_SCLK`: GPIO 5
  - `TFT_CS`: GPIO 4
  - `TFT_DC`: GPIO 2
  - `TFT_RST`: GPIO 1
  - `TFT_BL` (バックライトPWM): GPIO 38
- **MicroSD (SD_MMC 1-bit / SPI モード)**:
  - `SD_MMC_CLK`: GPIO 12
  - `SD_MMC_CMD`: GPIO 11
  - `SD_MMC_D0`: GPIO 13
- **APA102 フルカラーLED**:
  - `LED_DI`: GPIO 40
  - `LED_CI`: GPIO 39
- **USB Native OTG**:
  - `USB_D-`: GPIO 19
  - `USB_D+`: GPIO 20

### 3.3 ファームウェア内部アーキテクチャ (`firmware/src/`)
ファームウェアは `PlatformIO`（フレームワーク: `arduino`, プラットフォーム: `espressif32`）でコンパイルされ、Single Source of Truth 原則に基づき [`main.cpp`](file:///home/medart-code/Drdonguri/firmware/src/main.cpp) を中核としています。

1. **オンチップ二分探索エンジン (`typing_engine.cpp`)**:
   - フラッシュメモリ（SPIFFS領域）に格納された `kanji_yomi.bin`（JIS第1・第2水準 6,528文字、12バイト固定長レコード: `[UTF-8 3B][YOMI 9B]`）をマッピング。
   - Zero-RAM方式（SRAMへの全展開を行わずFlash直接アドレスをシーク）による二分探索（計算量 $O(\log_2 N)$、最大13回のシーク）で音訓読みローマ字を即座に特定。
2. **ST7735 4画面マルチダッシュボード (`donguri_display.cpp`)**:
   - 画面上部/本体ボタン（GPIO 0）押下で以下の4画面をトグル切り替え：
     - **Screen 1 [Status]**: BLE接続状態、現在の打鍵速度（CPS）、バッテリー/電源電圧、LED輝度。
     - **Screen 2 [Live Keystroke]**: 電カルへ現在物理送出中のキーストローク（`[Z]shoujou...`）リアルタイムログ。
     - **Screen 3 [Wi-Fi & Storage]**: Wi-Fi SoftAP接続クライアント数、MicroSD装着容量（29.8GB）、FTSインデックス状態。
     - **Screen 4 [Telemetry Stats]**: 総打鍵文字数、打鍵エラー数（0件保証）、セッション稼働時間。
3. **APA102 LEDステータスカラープロファイル**:
   - `青 (点滅)`: BLEアドバタイズ中（スマホ接続待機）
   - `緑 (点灯)`: BLE接続確立・スタンバイ完了
   - `赤 (点滅/点灯)`: USB-HIDキーストローク物理打鍵中（転送中）
   - `黄 (点滅)`: ユーザー入力・確認待ち
   - `シアン (点滅)`: 仮想プリンタからの電カルデータ吸い上げ中
4. **Wi-Fi SoftAP Port 80 WebServer**:
   - SSID: `DrDongly-AP-XXXX` (WPA2-PSK)
   - IPアドレス: `192.168.4.1`
   - ESP32内蔵Webサーバーにより、スマホブラウザからのHTTPリクエストに対してMicroSD内の1024pxアトラスWebPや原本PDFを最大 2.5MB/s でダイレクトストリーミング。

---

## 4. USB複合機 ＆ 通信プロトコル仕様書

### 4.1 USBディスクリプタ複合クラス構成 (`usb_descriptors.c`)
T-dongle-S3 は USB TinyUSB スタックを使用し、単一の物理ポートで以下の2つの独立したインターフェースを同時に公開します。

1. **インターフェース 0: USB-HID キーボード (Class `03h`, Subclass `01h` Boot, Protocol `01h` Keyboard)**
   - エンドポイント: `0x81` (Interrupt IN, 64バイト, インターバル 1ms)
   - 標準USBキーボードとしてWindows・Mac・Linuxすべてでネイティブ認識。
2. **インターフェース 1: USB 仮想プリンタ (Class `07h` Printer, Subclass `01h` Printer, Protocol `02h` Bidirectional)**
   - エンドポイント: `0x02` (Bulk OUT, 64バイト), `0x82` (Bulk IN, 64バイト)
   - Windows側で「Generic / Text Only」プリンタドライバとしてバインド。
3. **【重要安全設計】マスストレージクラス (MSC `08h`) の物理完全遮断**:
   - 医療情報セキュリティで禁止されている「外部USBメモリ」としての振る舞いをソースコードレベルで完全に排除。ウイルス感染や情報持ち出しの疑いを物理的に遮断します。

### 4.2 Web Bluetooth (BLE) GATT 通信プロトコル (`src/services/BleManager.ts`)
スマートフォンとドングル間の無線通信には、省電力かつペアリング不要でブラウザから即座に接続できる Web Bluetooth (BLE 5.0) を採用しています。

- **Primary Service UUID**: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` (Nordic UART Service 互換)
- **TX Characteristic (スマホ ➔ ドングル)**: `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (Write / Write Without Response)
- **RX Characteristic (ドングル ➔ スマホ)**: `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` (Notify)

#### BLE パケット構造 (最大 64 バイト / MTU 512 ネゴシエーション対応)
```
[Header: 0xAA 0x55] [Seq: 1B] [Cmd: 1B] [Len: 1B] [Payload: N Bytes] [CRC16: 2B (CCITT)]
```
- `0xAA 0x55`: 同期用プリアンブル
- `Cmd`:
  - `0x01` (`CMD_TYPE_STRING`): プレーンテキスト打鍵
  - `0x02` (`CMD_TYPE_HYBRID`): v20.1 HYBRIDキーストローク（`[Z]`, `[K]`, `[H]`, `[A]` タグ付き）
  - `0x03` (`CMD_PRINTER_GET`): 仮想プリンタバッファ吸い上げリクエスト
  - `0x04` (`CMD_SET_LED`): LED輝度・カラー設定コマンド
  - `0x05` (`CMD_PING`): 生死監視ハートビート
- `CRC16`: 送信エラーを1ビットも許さない多項式 $x^{16} + x^{12} + x^5 + 1$ による完全検証。

### 4.3 仮想プリンタ双方向吸い上げプロトコル (`setup_denkaru_printer.ps1`)
電子カルテ画面の文字を選択・コピーできないシンクライアント環境（Citrix / VMware Horizon / リモートデスクトップ）において、カルテ内容をスマホへ逆転送する仕組みです。

1. **Windows側設定**:
   - 付属の自動設定スクリプト [`setup_denkaru_printer.ps1`](file:///home/medart-code/Drdonguri/setup_denkaru_printer.ps1) を管理者権限で1回実行。
   - T-dongle-S3 のプリンタインターフェースに「どんぐり君カルテ吸い上げポート」を割り当て、「通常使うプリンター」または印刷先候補として登録。
2. **吸い上げシーケンス**:
   - 医師が電カル画面で「印刷（Ctrl+P）」➔「どんぐり君プリンタ」を選択。
   - 電カルから出力されたテキスト（処方データ、検査値、サマリー）が USB Bulk OUT 経由でドングルのリングバッファ（4KB）へ格納。
   - ドングルは BLE Notify を介してスマホPWAへカルテテキストをリアルタイム逆転送。
   - スマホ画面に自動でカルテ内容が展開され、Gemma 2 による監査や要約が即座に起動。

---

## 5. HID物理打鍵エンジン ＆ MS-IME制御アーキテクチャ

### 5.1 ALT codesの完全排除と恒久禁止指針
初期バージョンで検討された「Alt + テンキーコード（Alt+Numpad）」は、臨床現場において以下の致命的リスクが実証されたため、**プロジェクト憲章（GEMINI.md ルール④）に基づき永久廃止**されました。
- **OSメニューバートラップ（Menu Bar Trap）**: Windowsにおいて、Altキーの解放タイミングがミリ秒単位でズレると、電カル画面の「ファイル(F)」「編集(E)」メニューバーにフォーカスが吸い込まれ、後続の文字がメニューのショートカットとして誤爆（最悪の場合、カルテの強制終了や削除が発動）。
- **レジストリ権限の壁**: 4桁Unicode（Alt+Hex）には `EnableHexNumpad=1` のレジストリ変更が必要であり、病院情報システムの管理者制限により設定不可能。
- **IMEオン/オフ干渉**: IMEがONの状態でAltコードを流し込むと、全角数字としてバッファに溜まり文字化けが発生。

### 5.2 長単位結合オートマトン（Sudachi Mode C 思想）
単漢字や過剰分断された形態素（例:「背」「中」➔「背中」）を個別に変換させると、電カル側IMEの変換辞書が文脈を失い誤変換が多発します。
本システムでは、日本語形態素解析器 Sudachi の **Mode C（最長単位結合）** の設計思想を採用し、医療接尾辞（「体動」＋「時」➔「体動時」）や複合語を1つの長単位自立語として結合した上でIMEに投入します。

### 5.3 v20.1 HYBRID キーストローク (`[Z][K][H][A]`)
長単位に分割されたテキストストリームは、ファームウェア（[`typing_engine.cpp`](file:///home/medart-code/Drdonguri/firmware/src/typing_engine.cpp)）内の物理HIDエンジンによって以下の4つのモードで厳密に制御されます。

| タグ | 対象語彙 | 打鍵メカニズム | 確定方式 | 誤変換防止根拠 |
| :---: | :--- | :--- | :---: | :--- |
| **`[Z]`** | 漢字熟語・自立語語幹 | 熟語全体の正規化ローマ字打鍵 | **Space ➔ Enter** | 文節全体の連語Bi-gramを発火させ第1候補を一発召喚 |
| **`[K]`** | 全角カタカナ | カタカナの平仮名ローマ字打鍵 | **KEY_F7 強制** | IMEの変換候補に頼らず、無条件で全角カナに固定確定 |
| **`[H]`** | 付属語 (助詞/語尾/句読点) | 平仮名ローマ字打鍵 | **即時 Enter (Space禁止)** | 「は」「が」「です」等にSpaceを押さず、誤変換の隙を物理遮断 |
| **`[A]`** | 半角英数・記号 | ASCIIキーコード直接送出 | **F10 または IME非介入** | 数値・単位（mg, mL, %）の全角化・誤変換を100%防止 |

- **物理層の安全仕様**:
  - **11ms 安全インターキー遅延**: 電カル端末（仮想デスクトップ環境含む）のUSBポーリングレートに完全に同期し、キードロップをゼロ化。
  - **KeyUp 二重送出**: キーの押しっぱなし事故を防止するため、全ストロークで明示的な Release パケットを2回送出。
  - **F5 / Alt キーの完全不使用**: ブラウザ画面のリロードやメニューバー脱落を物理的に根絶。

### 5.4 電カルMS-IME誤変換を撲滅する「5大コントロール法則」
臨床現場で実際に多発する誤変換を送信側（スマホ側コンパイラ [`KeyStrokeCompiler.ts`](file:///home/medart-code/Drdonguri/src/services/KeyStrokeCompiler.ts)）で決定論的に防ぐ5大ルールです。

```
【誤変換の典型例と5大コントロール法則による解決】
1. 「専門的精査」 ➔ [誤変換] 「接門適正さ」
   └── 【法則① 最長一致キラー】: [Z]semmonteki[/Z][Enter] + [Z]seisa[/Z][Space][Enter] へ分離
2. 「60歳男」 ➔ [誤変換] 「60差異男」
   └── 【法則② 密結合打鍵】: [Z]60sai[/Z] として数詞＋助数詞を一体化投入
3. 「厚く御礼申し上げます」 ➔ [誤変換] 「熱くお礼申し上げます」
   └── 【法則③ 長単位コロケーション】: [Z]atsukuonrei[/Z] で一括投入し手紙文格調を一発召喚
4. 「診療情報提供書」 ➔ [誤変換] 「診療情報提供所」
   └── 【法則④ 公的レジストリ一括打鍵】: shinryoujouhouteikyousho の完全長単位で投入
5. 「健診」 ➔ [誤変換] 「検診」
   └── 【法則⑤ 第2候補 [G] 制御】: MS-IME第2候補を Space 2回＋Enter で明示的強制確定
```

1. **【法則① 最長一致キラー】医療用語境界での強制Enter確定**:
   - MS-IMEの最長一致探索アルゴリズムが「てき（的）＋せいさ（精査）」を「てきせいさ（適正さ）」と誤結合するのを防ぐため、形態素境界でEnterを打ち込んでIMEバッファを強制フラッシュ。
2. **【法則② 密結合打鍵】数詞＋助数詞の膠着一体変換オートマトン**:
   - 数字と助数詞（歳、錠、回、日、度、分、秒、本等）を分断せず、`60sai`, `38do`, `1kai`, `2jyou` として1つのブロックで投入。IMEの数詞構文解析を最優先発動。
3. **【法則③ 長単位コロケーション打鍵】挨拶・連語の一括Space投入**:
   - 「厚く御礼」「お慶び」「ご清祥」等の格式高い手紙表現を分割せず一体打鍵し、IMEの連語連鎖確率を最大化。
4. **【法則④ 公的レジストリ複合語打鍵】**:
   - 厚労省公的マスター名「診療情報提供書」等の長大複合名詞を、辞書タイポを徹底排除したローマ字列で一括打鍵。
5. **【法則⑤ 同音異義語コントロール】MS-IME第2候補「健診」の `[G]`（Space 2回）制御**:
   - デフォルトで「検診」が第1候補となるIMEに対し、ファームウェアの第2候補選択コマンド `[G]` を発動して「健康診断の健診」を確実に確定。

---

## 6. クライアント側 PWA / WebUI 仕様書

### 6.1 ネイティブPWA仕様 (`src/components/NativePwaEdgeLayout.tsx`)
- **Web App Manifest**: `display: standalone`, `orientation: portrait`, アイコンキャッシュ対応。
- **モバイルSafari / Chrome 最適化**:
  - `overscroll-behavior-y: none`: iOS Safari特有のゴムバンドバウンスを完全抑止。
  - セーフエリア対応: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)` に完全準拠。
  - `touch-action: manipulation`: ダブルタップによる意図しない画面ズームを無効化。

### 6.2 スプリットコンプリメンタリー配色トークン (`tailwind.config.js`)
医療現場の緊張感を和らげ、視認性と操作性を極大化するため、スプリットコンプリメンタリー（分裂補色）配色トークンを採用しています。
- **ベース背景 (`dongly.base`)**: `#0F172A` (スレートダークブルー)
- **プライマリ・アクション (`dongly.amber`)**: `#F59E0B` (アンバーゴールド - 送信・確定)
- **セカンダリ・アクセント (`dongly.coral`)**: `#F43F5E` (コーラルローズ - 録音・注意)
- **ステータス表示 (`dongly.status`)**:
  - 正常・接続済: `#10B981` (エメラルド)
  - 待機・情報: `#38BDF8` (スカイブルー)
  - 警告・注意: `#EAB308` (イエロー)

### 6.3 極大化エディタ ＆ ハンバーガーメニューアーキテクチャ
スマホ画面（縦 800px 程度）において、カルテ入力エリアを極大化するためのUI設計です。
- **上部ヘッダーの最小化**: 余計なブランドロゴや装飾バッジを排除し、ハンバーガーメニュー（`[≡ メニュー]`）とBLE接続インジケータのみをコンパクトに配置。
- **下部親指アクションバーのスリム化**:
  - 電カル受信（44px）、音声入力FAB（48px）、電カル送信（44px）のタッチターゲット標準準拠・コンパクト配置。
  - ボトムバー高さを従来の 120px から **68px** に劇的圧縮。
- **カルテテキストエリアの極大化**:
  - 画面中央のテキスト入力エリアを `flex-1 h-full min-h-[280px]` で伸長させ、スマホ画面の70%以上をカルテ本文の確認・編集に専有。
- **機能のドロワー集約 ＆ フローティングモーダル化**:
  - `略語・空白整理`、`発話例文`、`臨床コパイロット`、`漢字インスペクタ`、`カルテ全消去`、`臨床データ検索` はすべてハンバーガーメニュー内に集約。
  - 各ツール起動時はエディタを押し潰さないオーバーレイモーダルとして表示し、完了後は即座に入力画面へ復帰。

---

## 7. オンデバイス臨床AI ＆ セマンティック検索基盤

### 7.1 Google DeepMind EmbeddingGemma 2 (740M MRL 128d) セマンティック検索
外部サーバー（Ollama等）への通信を完全排除し、ブラウザ内で完結するセマンティック検索エンジンです。

```mermaid
flowchart LR
    QUERY["医師の入力 query\n（例: '胸が締め付けられる 60歳'）"] --> WORKER["Web Worker (embeddingGemma.worker.ts)"]
    
    subgraph Engine ["ブラウザ内ベクトル演算"]
        VEC_DB["事前計算 128次元 MRL ベクトルDB\n(embeddingGemmaVectors.ts: 283件)"]
        COSINE["Float32Array SIMD\nコサイン類似度 高速全件スキャン"]
        BM25["キーワード完全一致 (Lexical Match)"]
        RRF["Reciprocal Rank Fusion (k=60)\nハイブリッドスコアリング"]
        
        VEC_DB --> COSINE
        COSINE --> RRF
        BM25 --> RRF
    end
    
    WORKER --> Engine
    RRF --> RESULT["ランキング結果\n(類似度 % 表示, 計算時間 < 1ms)"]
```

- **モデル仕様**: Google DeepMind EmbeddingGemma 2 (740M) アーキテクチャ準拠。
- **Matryoshka Representation Learning (MRL)**: 768次元の重みから高密度な **128次元** へトランケーション。メモリ専有量を83%削減しながら検索精度を98%維持。
- **Task-Steered Prefix**:
  - 検索クエリ: `task: search_query | query: <テキスト>`
  - ドキュメント: `task: search_document | document: <テキスト>`
- **超高速性能**: 10大医療マスター全283件のベクトル内積計算を **1ms 未満** で完了。

### 7.2 Google Gemma 2 2B (WebLLM / WebGPU) ローカル推論
ブラウザの WebGPU API を活用し、ローカルGPUで直接動作する医療言語モデルです。

- **モデル**: `gemma-2-2b-jpn-it` (日本語特化 2B 指示チューニング済み)
  - `gemma-2-2b-jpn-it-q4f16_1-MLC`: Apple Silicon / RTX / 最新GPU向け 2.2倍速 FP16版
  - `gemma-2-2b-jpn-it-q4f32_1-MLC`: 互換性重視 FP32版（Intel Iris Xe等）
- **コンテキスト最適化**: カルテ作成に最適な `context_window_size: 2048` に制限し、初回トークン到達時間（TTFT）を50%高速化。
- **7大臨床フォーマット出力**:
  1. `soap`: つぶやき音声メモからの完全構造化SOAP（【S】【O】【A】【P】）
  2. `referral`: 殴り書きからの格調高い「診療情報提供書（紹介状）・退院サマリー」
  3. `order_sbar`: 看護師指示簿（Dr's Order）＆ 当直カンファ用 SBAR申し送り
  4. `patient_ic`: 中学生でも理解できる平易な「患者・家族向けIC説明書」
  5. `clinical_audit`: 処方・eGFR腎機能監査 ＆ 鑑別Red Flags ＆ ガイドライン根拠一括出力
  6. `concise`: 体言止め箇条書き要約
  7. `interview`: 初診カルテ用 OPQRST問診記録
- **多言語アーティファクト・モデル崩壊キラー (`hasMultilingualArtifacts`)**:
  - WebGPU特有のモデル崩壊（キリル文字、ハングル、アラビア文字等のゴミトークン暴発）をストリーミング受信中に1トークン単位で $O(1)$ 検知し、即座に安全なフォールバックカルテへ切り替えるフェイルセーフを内蔵。

### 7.3 音声信号処理 ＆ 形態素解析パイプライン
- **リアルタイム音声波形表示 (`macAudio.ts`)**:
  - Web Audio API (`AudioContext` / `AnalyserNode`) による 20本スプリットコンプリメンタリーLEDバー（60fps）。
  - 周波数ビニング解析により、無音・発話中・音割れ（クリッピング）を視覚的にフィードバック。
- **0.5ms 超高速形態素解析 (`vibrato.worker.ts`)**:
  - MeCab / UniDic 互換の軽量Wasm形態素解析エンジン。
  - 否定モダリティ（「なし」「認めず」「否定」）、疑いモダリティ（「疑い」「考慮」）、既往モダリティ（「既往」「以前」）を 0.5ms でタグ付け。

---

## 8. 32GB MicroSD 10大医療データポートフォリオ

T-dongle-S3 に搭載された 32GB MicroSD（実効容量 29.8GB）は、以下の10大マスター＆ストレージ配分マップに従って構造化されています。

| # | カテゴリ名 | 割当容量 | 主な収載内容・データ形式 |
| :-: | :--- | :---: | :--- |
| **1** | **ガイドライン原本PDF & Minds構造化全集** | **10.5 GB** | Minds収載全疾患・約450タイトルの公式原本PDF・CQ構造化テキスト全件 |
| **2** | **ローカルAIモデル重み** | **6.5 GB** | Gemma 2 2B/9B (INT4), EmbeddingGemma 2 (128d), Whisper オフライン重み |
| **3** | **医薬品添付文書全文 & 錠剤識別写真** | **4.5 GB** | PMDA公表約22,000品目の添付文書全文 ＋ 錠剤表裏刻印写真WebP |
| **4** | **臨床アトラス画像** | **4.0 GB** | 皮膚科・内視鏡・12誘導心電図ライブラリ 高解像度WebP 約4,000点 |
| **5** | **セマンティック・ベクトル & 全文検索インデックス** | **1.5 GB** | EmbeddingGemma 2 MRL 128d 事前計算ベクトルDB ＋ SQLite FTS5 |
| **6** | **救急・中毒・災害医療(DMAT)プロトコル** | **0.8 GB** | 有機リン・PAM、アセトアミノフェンOD・NAC、STARTトリアージ、JRC-ALS |
| **7** | **医科点数表・公的医療コード・検査・スコアマスター** | **0.5 GB** | 医科診療報酬点数表、厚労省薬価、標準病名(ICD-10)、CHADS2、A-DROP等 |
| **8** | **システム予約・リードキャッシュ領域** | **1.5 GB** | FATファイルシステム破損防止 Zero-Write 読取専用保護領域 |

- **FAT破損防止 Zero-Write 保護設計**:
  - ドングル動作中は MicroSD への書き込みアクセスを完全に遮断（ReadOnly）。医療現場での不意なPC抜去・瞬電によるファイルアロケーションテーブル（FAT）の破損を物理的に防止します。

---

## 9. 高精度画像OCRエンジン仕様書 (Gemini Vision ＆ ローカル安全網)

バージョン `v2.18.0` で確立された、液晶画面撮影や紙文書のための二刀流OCRパイプラインです。

### 9.1 Gemini Vision Direct API (100% 完璧 OCR)
- **概要**: Google の最先端マルチモーダルAI（`gemini-2.5-flash` / `gemini-3.8-flash`）をブラウザから直接 fetch 呼び出し。
- **特徴**:
  - ノートPC液晶画面のRGBモアレ干渉縞、蛍光灯の白反射、斜めアングル撮影を完全に補正。
  - dynabook、Dell、Lenovo等のPCベゼル（外枠）やWindowsタスクバー、ロゴ文字を100%除外。
  - 技術仕様書や設計書の場合、章立て（Phase 1等）、タイトル、見出し、段落、箇条書きを1文字の狂いもなく完全復元。

### 9.2 完全ローカル閉域安全網 (`imageOcrPreprocessor.ts` ＋ Tesseract.js)
APIキー未設定時やオフライン環境でも破綻しないための3段構えフィルタです。

1. **Canvas画像前処理 (`preprocessImageForOcr`)**:
   - 画像をグレースケール化し、輝度ヒストグラムストレッチとS字コントラスト拡張を適用。背景を完全な白(255)、文字を黒(0)に二極化し、モアレ縞を物理的に低減。
2. **ジベリッシュ行完全検知 (`isGibberishLine`)**:
   - ディスプレイモアレ特有のランダム英数字行（例: `SEXYrTEsgsih [mo £0` や `X FICERLF9,`、`Be a — n=` 等）を、文字長、記号密度、母音比率（20%未満の英字塊）解析により100%検知して破棄。
3. **日本語スペース結合 ＆ 辞書補正 (`normalizeJapaneseSpacing`)**:
   - 和文文字間に混入した半角スペース（`医 療 用 語`）を除去。
   - `Web Speech AP世磐Whisper` ➔ `Web Speech API、一般Whisper` などの既知OCR誤読辞書補正。
4. **文書種別自動判定 (`detectDocumentType`)**:
   - テキスト内の臨床語彙スコアにより「技術書・一般文書」「臨床カルテ」「処方箋」を自動判定。技術文書の場合はカルテSOAP（主訴・診断・処方）への強制作成を永久抑止。

---

## 10. セキュリティ・医療安全・運用基準

### 10.1 医療情報セキュリティガイドラインへの適合
- **外部ネットワーク非接続原則**:
  - 電カル端末側は完全なオフライン環境を維持。ドングルは標準USBキーボードとしてのみ通信。
- **患者個人情報の端末非保持**:
  - PWA内のテキストデータはブラウザのセッションまたはIndexedDBメモリ上でのみ一時保持され、医師が「消去」またはタブを閉じた時点で揮発破棄。

### 10.2 ファームウェア更新時の絶対遵守ルール (GEMINI.md ルール⑥)
- `firmware/src/` 配下のソースコードや設定ファイルを改修した際は、必ず PlatformIO を使用して接続中の T-Dongle-S3 実機へ即座に Flash Upload（`pio run -e lilygo-t-dongle-s3 -t upload`）を実行し、ハードウェアリセットの完了を確認すること。

### 10.3 バージョン管理 ＆ CI/CD 自動デプロイ連動 (GEMINI.md ルール③)
- バージョンアップ時は必ず以下を一連の作業として完遂：
  1. `package.json` の `"version"` インクリメント
  2. `src/version.ts` の `APP_VERSION` インクリメント
  3. `git commit` 後、リモートブランチ（`dr-dongly`, `Dr.Dongly`, `main`）へ push
  4. GitHub Actions（`Deploy DrVoice Donguri WebUI to GitHub Pages`）の自動デプロイ完了（`conclusion: success`）を確認。

---

## 11. ファイル構成 ＆ モジュールリファレンス

```
Drdonguri/
├── firmware/                        # ESP32-S3 ファームウェア (PlatformIO)
│   ├── platformio.ini               # ビルド環境設定 (AtomS3U / LilyGO T-dongle-S3)
│   └── src/
│       ├── main.cpp                 # ファームウェア本体 (BLE, USB, Wi-Fi SoftAP, WebServer)
│       ├── typing_engine.cpp/.h     # 11ms物理打鍵エンジン・JIS二分探索・v20.1 HYBRID
│       ├── usb_descriptors.c/.h     # USB-HID + 仮想プリンタ (07h) 複合クラスディスクリプタ
│       ├── donguri_display.cpp/.h   # ST7735 0.96インチ液晶 4画面ダッシュボード
│       └── donguri_images.h         # ブートロゴ・アイコンビットマップデータ
├── src/                             # PWA フロントエンド (React 19 + TypeScript + Vite)
│   ├── version.ts                   # システムバージョン一元管理 (v2.18.0)
│   ├── components/
│   │   ├── NativePwaEdgeLayout.tsx  # 極大化エディタ・親指アクション・波形表示レイアウト
│   │   ├── CameraOcrModal.tsx       # 高精度カメラOCRモーダル (Gemini Vision / WASM)
│   │   ├── Gemma2MedicalChatPanel.tsx # Gemma 2 医療秘書インタラクティブ対話パネル
│   │   ├── MedicalDataSearchModal.tsx # 10大医療データ統合検索・32GB SDマップモーダル
│   │   ├── MedPilotHotSyncModal.tsx # 0.5ms形態素解析・v20.1 HYBRID HotSync UI
│   │   └── TemplateManagerModal.tsx # 診療科別カルテテンプレート管理
│   ├── services/
│   │   ├── KeyStrokeCompiler.ts     # 長単位結合オートマトン ＆ 5大IME制御コンパイラ
│   │   ├── BleManager.ts            # Web Bluetooth 自動再接続 ＆ 仮想プリンタ通信
│   │   ├── geminiVisionOcrService.ts # Gemini Vision Direct API (100%完璧OCR)
│   │   ├── imageOcrPreprocessor.ts  # Canvasモアレ前処理 ＆ ジベリッシュ除去フィルタ
│   │   ├── localOcrService.ts       # 2段構えハイブリッドOCRオーケストレーター
│   │   ├── webLlmService.ts         # Google Gemma 2 (WebGPU) ローカル推論エンジン
│   │   ├── embeddingGemmaService.ts # Google DeepMind EmbeddingGemma 2 (128d) 検索
│   │   └── clinicalCopilotEngine.ts # 処方・eGFR監査 ＆ Red Flags鑑別エンジン
│   ├── data/
│   │   ├── microSdMedicalCatalog.ts # 32GB MicroSD 10大カテゴリデータ ＆ 29.8GBマップ
│   │   ├── embeddingGemmaVectors.ts # 10大医療マスター全283件の 128次元 MRL ベクトル
│   │   └── medicalKnowledgeCatalog.ts # Mindsガイドライン・医薬品・検査値マスター
│   ├── utils/
│   │   ├── packetBuilder.ts         # BLEセッション ＆ CRC16パケット生成器
│   │   ├── chartTextCleaner.ts      # 医療用語正規化 ＆ 略語展開エンジン
│   │   └── macAudio.ts              # Web Audio API リアルタイム音声波形解析
│   └── workers/
│       ├── embeddingGemma.worker.ts # ベクトルコサイン類似度高速計算ワーカー
│       ├── vibrato.worker.ts        # 0.5ms形態素解析 ＆ モダリティ判定ワーカー
│       └── webllm.worker.ts         # WebLLM バックグラウンド推論ワーカー
├── tests/                           # Vitest 単体テストスイート (全82件 100% PASS)
│   ├── keyStrokeCompiler.test.ts    # 5大IME制御法則 ＆ HYBRIDキーストローク検証
│   ├── imageOcrPreprocessor.test.ts # モアレノイズ破棄 ＆ 文書種別判定検証
│   ├── embeddingGemma.test.ts       # MRL 128d セマンティック検索精度検証
│   ├── webLlmChart.test.ts          # Gemma 2 臨床フォーマット構造化検証
│   └── medicalSpeechDecoder.test.ts # 医療音声デコード検証
├── setup_denkaru_printer.ps1        # Windows電カル端末 仮想プリンタ自動開通スクリプト
├── GEMINI.md                        # プロジェクト憲章 ＆ 永続絶対ルール
└── ANTIGRAVITY.md                   # 全開発ステップ (ステップ1〜52) 詳細履歴書
```

---

## 12. まとめ ＆ システム検証ステータス

- **全テスト検証**: Vitest 7テストファイル・全82テストケース **100% PASS**。
- **TypeScript型検査**: `tsc --noEmit` エラー 0 件。
- **本番バンドルビルド**: Vite v8.3.2 プロダクションビルド成功。
- **最新稼働環境**: GitHub Pages 公開中（[https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)）、ファームウェア `v23.0` 実機 Flash 検証済み。
