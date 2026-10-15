# DrVoice どんぐり君！（Drdonguri）プロジェクト憲章 & 永続ガイドライン (GEMINI.md)

このドキュメントは、Google Antigravity 2.0 エージェントが本プロジェクトで作業する際に最優先で遵守すべき「絶対ルール」および「システム設計仕様」です。新しいチャットセッションを開始した際も、常にこの指針を基盤として行動してください。

---

## 1. プロジェクト基本情報
- **プロダクト名**: DrVoice どんぐり君！ (`dr-dongly` / `Drdonguri`)
- **目的**: スマホ音声入力・テキストを、ESP32デバイス（AtomS3U / T-dongle-S3）経由で医療用電子カルテ端末にUSB-HID（キーボード）として超高速・無誤爆で直接打鍵転送するシステム。
- **公開WebUI (PWA)**: [https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)
- **現在のバージョン**: **`v2.7.0`** (ファームウェア: `v22.0`)

---

## 2. 絶対遵守ルール（忘却厳禁）

### ① 医療難読単漢字マスターの永久廃止
- かつてUIに存在していた単漢字リスト（「嚥」「瘻」「褥」などの30文字）は、**臨床的需要がなく実質未使用であったため v2.3.0 で完全撤廃されました**。
- **禁止事項**: 難読単漢字リストの復活・再作成・再検索タブ追加は絶対に行わないでください。
- ※ファームウェア内の `kanji_yomi.bin`（JIS全漢字 6,528文字の音訓読み）は、物理打鍵エンジンのSpace変換用として維持・正常稼働中。

### ② 臨床現場に真に必要な「10大医療データポートフォリオ (32GB MicroSD 29.8GB)」
T-Dongle-S3 32GB MicroSDおよびPWAセマンティック検索エンジンでは、以下の10大マスター＆ストレージ配分マップを正として運用・拡張してください：
1. **ガイドライン原本PDF & Minds構造化全集 (10.5 GB)**: Minds収載全疾患・約450タイトルの公式原本PDF・CQ全件
2. **ローカルAIモデル重み (6.5 GB)**: Qwen2.5-1.5B/7B, EmbeddingGemma 2 (INT4), Whisper-small オフライン重み
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

### ④ チャットの推奨運用
- 1つのチャットは **約15〜25ターン** を目安とし、1つのマイルストーン（バージョンリリースや特定機能の完成）が完了した時点で新しいチャットに切り替えることを推奨します。
- 過去の決定事項は本ファイル（`GEMINI.md`）および [`ANTIGRAVITY.md`](file:///home/medart-code/Drdonguri/ANTIGRAVITY.md) に永続化されています。

---

## 3. 主要アーキテクチャ & ファイル構成

| ファイル / ディレクトリ | 役割・技術スタック |
| :--- | :--- |
| [`src/version.ts`](file:///home/medart-code/Drdonguri/src/version.ts) | アプリケーションバージョン (`2.6.0`)・ビルド時刻一元管理 |
| [`src/data/microSdMedicalCatalog.ts`](file:///home/medart-code/Drdonguri/src/data/microSdMedicalCatalog.ts) | 32GB MicroSD 10大医療カテゴリ構造化データ ＆ 29.8GB全領域配分マップ |
| [`src/services/embeddingGemmaService.ts`](file:///home/medart-code/Drdonguri/src/services/embeddingGemmaService.ts) | Google DeepMind EmbeddingGemma 2 (740M MRL 128d) 臨床セマンティック検索エンジン |
| [`src/data/embeddingGemmaVectors.ts`](file:///home/medart-code/Drdonguri/src/data/embeddingGemmaVectors.ts) | 10大医療マスター全225件の 128次元 MRL 事前計算ベクトルデータベース |
| [`src/workers/embeddingGemma.worker.ts`](file:///home/medart-code/Drdonguri/src/workers/embeddingGemma.worker.ts) | バックグラウンド高速コサイン類似度ランキング Web Worker |
| [`src/components/MedPilotHotSyncModal.tsx`](file:///home/medart-code/Drdonguri/src/components/MedPilotHotSyncModal.tsx) | MedPilot 0.5ms形態素解析・臨床意思決定支援・100%決定論打鍵HotSync UI |
| [`src/services/KeyStrokeCompiler.ts`](file:///home/medart-code/Drdonguri/src/services/KeyStrokeCompiler.ts) | 形態素トークン ➔ CP932 Alt+Numpad / F7 / F10 ハイブリッド打鍵トランスパイラ |
| [`src/services/BleManager.ts`](file:///home/medart-code/Drdonguri/src/services/BleManager.ts) | Web Bluetooth 永続自動再接続 ＆ 仮想プリンタ双方向通信マネージャー |
| [`src/workers/vibrato.worker.ts`](file:///home/medart-code/Drdonguri/src/workers/vibrato.worker.ts) | 0.5ms形態素解析・モダリティ（否定/疑い/既往）Web Worker |
| [`firmware/src/typing_engine.cpp`](file:///home/medart-code/Drdonguri/firmware/src/typing_engine.cpp) | 11msディレイ制御 ＆ Alt解放後ダミーShift空打ち（メニュー誤爆防止）HIDエンジン |
| [`firmware/src/usb_descriptors.c`](file:///home/medart-code/Drdonguri/firmware/src/usb_descriptors.c) | USB-HID Keyboard ＋ 仮想プリンタ (07h) 複合クラスドライバ (MSC完全遮断) |
| [`src/components/AltNumpadHilModal.tsx`](file:///home/medart-code/Drdonguri/src/components/AltNumpadHilModal.tsx) | Windows標準 Alt+テンキー 100%決定論 日本語転送 HIL実機テストベンチ |
| [`src/utils/altNumpadCompiler.ts`](file:///home/medart-code/Drdonguri/src/utils/altNumpadCompiler.ts) | Alt+Numpad (Unicode/CP932) 100%決定論コードコンパイラ ＆ 臨床プリセット |
| [`scripts/flash_alt_numpad_fw.py`](file:///home/medart-code/Drdonguri/scripts/flash_alt_numpad_fw.py) | T-Dongle-S3 ダウンロードモード自動検知＆ファームウェアフラッシャー |
| [`src/components/MedicalDataSearchModal.tsx`](file:///home/medart-code/Drdonguri/src/components/MedicalDataSearchModal.tsx) | 10大医療データ統合検索モーダル ＆ 32GB SD配分マップ視覚化 ＆ WebLLM RAG |
| [`src/data/medicalKnowledgeCatalog.ts`](file:///home/medart-code/Drdonguri/src/data/medicalKnowledgeCatalog.ts) | 医療マスターのインクリメンタル検索エンジン |
| [`scripts/generate_embedding_gemma_vectors.ts`](file:///home/medart-code/Drdonguri/scripts/generate_embedding_gemma_vectors.ts) | EmbeddingGemma 2 MRL 128d ベクトル生成スクリプト |
| [`src/services/webLlmService.ts`](file:///home/medart-code/Drdonguri/src/services/webLlmService.ts) | WebGPUによる完全ブラウザ内完結・通信不要のローカルLLM (Qwen2.5) |
| [`setup_denkaru_printer.ps1`](file:///home/medart-code/Drdonguri/setup_denkaru_printer.ps1) | T-dongle-S3 複合機（仮想プリンタ＋キーボード）のWindows伝カル自動開通スクリプト |
| [`main.cpp`](file:///home/medart-code/Drdonguri/main.cpp) | AtomS3U / T-dongle-S3 ファームウェア本体（Alt+Numpad 100%決定論＆HYBRID打鍵） |
| [`ANTIGRAVITY.md`](file:///home/medart-code/Drdonguri/ANTIGRAVITY.md) | 全開発ステップ（ステップ1〜19）の詳細開発履歴・技術仕様書 |
