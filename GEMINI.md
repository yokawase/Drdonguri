# DrVoice どんぐり君！（Drdonguri）プロジェクト憲章 & 永続ガイドライン (GEMINI.md)

このドキュメントは、Google Antigravity 2.0 エージェントが本プロジェクトで作業する際に最優先で遵守すべき「絶対ルール」および「システム設計仕様」です。新しいチャットセッションを開始した際も、常にこの指針を基盤として行動してください。

---

## 1. プロジェクト基本情報
- **プロダクト名**: DrVoice どんぐり君！ (`dr-dongly` / `Drdonguri`)
- **目的**: スマホ音声入力・テキストを、ESP32デバイス（AtomS3U / T-dongle-S3）経由で医療用電子カルテ端末にUSB-HID（キーボード）として超高速・無誤爆で直接打鍵転送するシステム。
- **公開WebUI (PWA)**: [https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)
- **現在のバージョン**: **`v2.34.0`** (ファームウェア: `v23.5`)

---

## 2. 絶対遵守ルール（忘却厳禁）

### ① 医療難読単漢字マスターの永久廃止
- かつてUIに存在していた単漢字リスト（「嚥」「瘻」「褥」などの30文字）は、**臨床的需要がなく実質未使用であったため v2.3.0 で完全撤廃されました**。
- **禁止事項**: 難読単漢字リストの復活・再作成・再検索タブ追加は絶対に行わないでください。
- ※ファームウェア内の `kanji_yomi.bin`（JIS全漢字 6,528文字の音訓読み）は、物理打鍵エンジンのSpace変換用として維持・正常稼働中。

### ② 臨床現場に真に必要な「10大医療データポートフォリオ (32GB MicroSD 29.8GB)」
T-Dongle-S3 32GB MicroSDおよびPWAセマンティック検索エンジンでは、以下の10大マスター＆ストレージ配分マップを正として運用・拡張してください：
1. **ガイドライン原本PDF & Minds構造化全集 (10.5 GB)**: Minds収載全疾患・約450タイトルの公式原本PDF・CQ全件
2. **ローカルAIモデル重み (6.5 GB)**: Gemma 2 2B/9B, EmbeddingGemma 2 (INT4), Whisper オフライン重み
3. **医薬品添付文書全文 & 錠剤識別写真 (4.5 GB)**: PMDA公表約22,000品目の添付文書 ＋ 錠剤表裏刻印写真WebP
4. **臨床アトラス画像 (4.0 GB)**: 皮膚科・内視鏡・心電図ライブラリ 高解像度WebP 約4,000点
5. **セマンティック・ベクトル & 全文検索インデックス (1.5 GB)**: EmbeddingGemma 2 MRL 128d ベクトルDB ＋ FTS5
6. **救急・中毒・災害医療(DMAT)プロトコル (0.8 GB)**: 有機リン・PAM、アセトアミノフェンOD・NAC、STARTトリアージ
7. **医科診療報酬・公的医療コード・検査・スコアマスター (0.5 GB)**: 医科点数表、厚労省薬価、病名、CHADS2等の臨床スコア
8. **システム予約・リードキャッシュ領域 (1.5 GB)**: FAT破損防止 Zero-Write 読取専用保護

### ③ バージョンアップ時の自動連動義務
機能追加や改修でバージョンを上げる場合は、必ず以下を一連の作業として完遂してください：
1. `package.json` の `"version"` をインクリメント
2. `src/version.ts` の `APP_VERSION` をインクリメント
3. `git commit` 後、リモートブランチ（`dr-dongly`, `Dr.Dongly`, `main`）へ push
4. GitHub Actions による GitHub Pages への自動デプロイ完了（`conclusion: success`）を確認する

### ④ ALT codesの完全排除 ＆ 長単位結合オートマトン（Sudachi Mode C）＋ v20.1 HYBRIDキーストローク（恒久採用）
- **ALT codes直接指定の永久禁止**: OSメニューバー脱落事故（Menu Bar Trap）、レジストリ権限の壁、IME ON/OFF干渉による文字化け、EDR誤検知・パケット爆発の危険があるため、ALT codesは臨床現場で絶対に使用しない。
- **長単位結合オートマトン（Sudachi Mode C思想）**: 形態素を単漢字に過剰分断せず、複合名詞（「背中」「増悪」等）や医療接尾辞（「体動」＋「時」➔「体動時」）を長単位で一体化し、動詞は語幹（「動か」）と語尾（「すと」）に分離する。
- **v20.1 HYBRIDキーストローク（11ms遅延）**:
  - `[Z]`: 漢字熟語・自立語語幹 ➔ 熟語全体の正規化ローマ字打鍵 ➔ Space変換 ➔ Enter確定
  - `[K]`: 全角カタカナ ➔ 平仮名ローマ字打鍵 ➔ KEY_F7 強制確定
  - `[H]`: 付属語（助詞/語尾/句読点） ➔ 平仮名ローマ字打鍵 ➔ 即時 Enter 確定 (Space禁止)
  - `[A]`: 半角英数・記号 ➔ IMEを介さず ASCIIキーコード直接送出 (F10確定)
- 物理層: 11ms 安全インターキー遅延 ＆ KeyUp二重送出 ＆ Alt/F5完全非使用。

### ⑤ チャットの推奨運用
- 1つのチャットは **約15〜25ターン** を目安とし、1つのマイルストーン（バージョンリリースや特定機能の完成）が完了した時点で新しいチャットに切り替えることを推奨します。
- 過去の決定事項は本ファイル（`GEMINI.md`）および [`ANTIGRAVITY.md`](file:///home/medart-code/Drdonguri/ANTIGRAVITY.md) に永続化されています。

### ⑥ ファームウェア更新時のT-dongle-S3実機自動書き込み義務（絶対遵守）
- **ファームウェア変更時の即時Flash義務**: `firmware/src/` 配下のソースコード（`main.cpp`, `typing_engine.cpp`, `usb_descriptors.c`, `donguri_display.cpp` 等）や設定ファイルを改修・更新した際は、**必ず PlatformIO を使用して接続中の T-Dongle-S3 実機（`/dev/ttyACM0` 等）へ即座に Flash Upload（`pio run -e lilygo-t-dongle-s3 -t upload --upload-port <port>`）を実行すること**。
- アップロードが `[SUCCESS]` となり、RTS ピン経由での実機ハードウェアリセットが完了したことを確認するまでを一連の必須作業とする。ユーザーからの指示を待たずに自律的に実行すること。

---

## 3. 主要アーキテクチャ & ファイル構成

| ファイル / ディレクトリ | 役割・技術スタック |
| :--- | :--- |
| [`src/version.ts`](file:///home/medart-code/Drdonguri/src/version.ts) | アプリケーションバージョン (`2.23.0`)・ビルド時刻一元管理 |
| [`src/workers/diffWorker.ts`](file:///home/medart-code/Drdonguri/src/workers/diffWorker.ts) | 局所Diff ＆ 分離判定モジュール (Anchor Matching / SequenceMatcher / PIIフィルタ / Sudachi Mode C平滑化) |
| [`src/utils/ahoCorasick.ts`](file:///home/medart-code/Drdonguri/src/utils/ahoCorasick.ts) | Aho-Corasick 多パターン文字列検索・最長一致自動置換エンジン ($O(N)$ ミリ秒置換) |
| [`src/hooks/useAutoDictionary.ts`](file:///home/medart-code/Drdonguri/src/hooks/useAutoDictionary.ts) | 2大自動学習パイプライン (電カルIME誤変換 / ASR誤認識) ＆ n≥2厳格昇格 ＆ IndexedDB永続化 ＆ Whisper動的プロンプト注入 |
| [`src/components/LearnedDictionaryModal.tsx`](file:///home/medart-code/Drdonguri/src/components/LearnedDictionaryModal.tsx) | 自己学習クローズドループ辞書管理モーダル (手動登録・削除・観測回数可視化) |
| [`src/components/NativePwaEdgeLayout.tsx`](file:///home/medart-code/Drdonguri/src/components/NativePwaEdgeLayout.tsx) | ネイティブ風PWA仕様 (Aho-Corasick音声パイプライン直結・セーフエリア・スプリットコンプリメンタリー配色) |
| [`tailwind.config.js`](file:///home/medart-code/Drdonguri/tailwind.config.js) | スプリットコンプリメンタリー配色トークン (`dongly.base/amber/coral/status`) ＆ FABシャドウ定義 |
| [`src/data/microSdMedicalCatalog.ts`](file:///home/medart-code/Drdonguri/src/data/microSdMedicalCatalog.ts) | 32GB MicroSD 10大医療カテゴリ構造化データ ＆ 29.8GB全領域配分マップ |
| [`src/services/bleMedicalIndexService.ts`](file:///home/medart-code/Drdonguri/src/services/bleMedicalIndexService.ts) | フェーズ1: BLE完結 添付文書要約・錠剤刻印識別（表裏）・用量マスター・サムネイル提供 |
| [`src/services/sdCardStreamingService.ts`](file:///home/medart-code/Drdonguri/src/services/sdCardStreamingService.ts) | フェーズ2: Wi-Fi SoftAP統合 (192.168.4.1) 1024pxアトラスWebP ＆ 添付文書原本PDF高速ストリーミング |
| [`src/services/embeddingGemmaService.ts`](file:///home/medart-code/Drdonguri/src/services/embeddingGemmaService.ts) | Google DeepMind EmbeddingGemma 2 (740M MRL 128d) 臨床セマンティック検索エンジン |
| [`src/data/embeddingGemmaVectors.ts`](file:///home/medart-code/Drdonguri/src/data/embeddingGemmaVectors.ts) | 10大医療マスター全283件の 128次元 MRL 事前計算ベクトルデータベース |
| [`src/workers/embeddingGemma.worker.ts`](file:///home/medart-code/Drdonguri/src/workers/embeddingGemma.worker.ts) | バックグラウンド高速コサイン類似度ランキング Web Worker |
| [`src/components/MedPilotHotSyncModal.tsx`](file:///home/medart-code/Drdonguri/src/components/MedPilotHotSyncModal.tsx) | MedPilot 0.5ms形態素解析・臨床意思決定支援・v20.1 HYBRID HotSync UI |
| [`src/services/KeyStrokeCompiler.ts`](file:///home/medart-code/Drdonguri/src/services/KeyStrokeCompiler.ts) | 長単位結合オートマトン (Sudachi Mode C) ➔ v20.1 HYBRID (`[Z][K][H][A]`) トランスパイラ |
| [`src/utils/packetBuilder.ts`](file:///home/medart-code/Drdonguri/src/utils/packetBuilder.ts) | `KeyStrokeCompiler` 直結 BLE セッション＆CRC16パケットビルダー |
| [`src/services/BleManager.ts`](file:///home/medart-code/Drdonguri/src/services/BleManager.ts) | Web Bluetooth 永続自動再接続 ＆ 仮想プリンタ双方向通信マネージャー |
| [`src/workers/vibrato.worker.ts`](file:///home/medart-code/Drdonguri/src/workers/vibrato.worker.ts) | 0.5ms形態素解析・モダリティ（否定/疑い/既往）Web Worker |
| [`firmware/src/typing_engine.cpp`](file:///home/medart-code/Drdonguri/firmware/src/typing_engine.cpp) | 11msディレイ制御 ＆ v20.1 HYBRID (`[Z][K][H][A]`) HIDエンジン (Alt物理遮断) |
| [`firmware/src/usb_descriptors.c`](file:///home/medart-code/Drdonguri/firmware/src/usb_descriptors.c) | USB-HID Keyboard ＋ 仮想プリンタ (07h) 複合クラスドライバ (MSC完全遮断) |
| [`src/components/MedicalDataSearchModal.tsx`](file:///home/medart-code/Drdonguri/src/components/MedicalDataSearchModal.tsx) | 10大医療データ統合検索モーダル ＆ 錠剤識別（表裏） ＆ 臨床アトラス（ECG方眼紙グリッド） ＆ 32GB SD配分マップ |
| [`src/data/medicalKnowledgeCatalog.ts`](file:///home/medart-code/Drdonguri/src/data/medicalKnowledgeCatalog.ts) | 医療マスターのインクリメンタル検索エンジン |
| [`scripts/generate_embedding_gemma_vectors.ts`](file:///home/medart-code/Drdonguri/scripts/generate_embedding_gemma_vectors.ts) | EmbeddingGemma 2 MRL 128d ベクトル生成スクリプト |
| [`src/services/webLlmService.ts`](file:///home/medart-code/Drdonguri/src/services/webLlmService.ts) | WebGPUによる完全ブラウザ内完結・通信不要のローカルLLM (Gemma 2 2B FP32) |
| [`setup_denkaru_printer.ps1`](file:///home/medart-code/Drdonguri/setup_denkaru_printer.ps1) | T-dongle-S3 複合機（仮想プリンタ＋キーボード）のWindows伝カル自動開通スクリプト |
| [`firmware/src/main.cpp`](file:///home/medart-code/Drdonguri/firmware/src/main.cpp) | AtomS3U / T-dongle-S3 ファームウェア本体（Single Source of Truth, Wi-Fi SoftAP Port 80 WebServer内蔵） |
| [`ANTIGRAVITY.md`](file:///home/medart-code/Drdonguri/ANTIGRAVITY.md) | 全開発ステップ（ステップ1〜30）の詳細開発履歴・技術仕様書 |
