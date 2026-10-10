# DrVoice どんぐり君！（Drdonguri）プロジェクト憲章 & 永続ガイドライン (GEMINI.md)

このドキュメントは、Google Antigravity 2.0 エージェントが本プロジェクトで作業する際に最優先で遵守すべき「絶対ルール」および「システム設計仕様」です。新しいチャットセッションを開始した際も、常にこの指針を基盤として行動してください。

---

## 1. プロジェクト基本情報
- **プロダクト名**: DrVoice どんぐり君！ (`dr-dongly` / `Drdonguri`)
- **目的**: スマホ音声入力・テキストを、ESP32デバイス（AtomS3U / T-dongle-S3）経由で医療用電子カルテ端末にUSB-HID（キーボード）として超高速・無誤爆で直接打鍵転送するシステム。
- **公開WebUI (PWA)**: [https://yokawase.github.io/Drdonguri/](https://yokawase.github.io/Drdonguri/)
- **現在のバージョン**: **`v2.3.0`** (ファームウェア: `v20.0`)

---

## 2. 絶対遵守ルール（忘却厳禁）

### ① 医療難読単漢字マスターの永久廃止
- かつてUIに存在していた単漢字リスト（「嚥」「瘻」「褥」などの30文字）は、**臨床的需要がなく実質未使用であったため v2.3.0 で完全撤廃されました**。
- **禁止事項**: 難読単漢字リストの復活・再作成・再検索タブ追加は絶対に行わないでください。
- ※ファームウェア内の `kanji_yomi.bin`（JIS全漢字 6,528文字の音訓読み）は、物理打鍵エンジンのSpace変換用として維持・正常稼働中。

### ② 臨床現場に真に必要な「6大医療ナレッジマスター」
PWAおよびFlash/SD検索エンジンでは、以下の6大マスターを正として運用・拡張してください：
1. **Minds診療ガイドライン**: 111疾患・CQ、推奨文、エビデンスレベル、実践Tips
2. **🔬 臨床検査値＆基準値・パニック値**: HbA1c, eGFR, BNP, D-ダイマー, CRP, トロポニン等とカルテSOAP定型文
3. **💉 外来診療行為・指導管理料**: 生活習慣病管理料(I/II), 特定疾患療養管理料, オンライン診療等の算定要件
4. **⚠️ 腎機能別(eGFR/CrCl) 投与設計**: DOAC 4剤, メトホルミン, SGLT2i, バラシクロビル等の減量・禁忌基準
5. **💊 主要処方薬・医薬品マスター**: 厚労省医薬品マスター、標準用法、禁忌注意
6. **📋 保険病名・傷病名マスター**: 厚労省レセプト傷病名、ICD-10

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
| [`src/version.ts`](file:///home/medart-code/Drdonguri/src/version.ts) | アプリケーションバージョン (`2.3.0`)・ビルド時刻一元管理 |
| [`src/components/MedicalDataSearchModal.tsx`](file:///home/medart-code/Drdonguri/src/components/MedicalDataSearchModal.tsx) | 6大医療データ統合検索モーダル ＆ WebLLM臨床意思決定支援UI |
| [`src/data/medicalKnowledgeCatalog.ts`](file:///home/medart-code/Drdonguri/src/data/medicalKnowledgeCatalog.ts) | 6大医療マスターのインクリメンタル検索エンジン |
| [`scripts/generate_medical_search_catalog.py`](file:///home/medart-code/Drdonguri/scripts/generate_medical_search_catalog.py) | 医療マスターカタログ自動生成スクリプト |
| [`src/services/webLlmService.ts`](file:///home/medart-code/Drdonguri/src/services/webLlmService.ts) | WebGPUによる完全ブラウザ内完結・通信不要のローカルLLM (Qwen2.5) |
| [`setup_denkaru_printer.ps1`](file:///home/medart-code/Drdonguri/setup_denkaru_printer.ps1) | T-dongle-S3 複合機（仮想プリンタ＋キーボード）のWindows伝カル自動開通スクリプト |
| [`main.cpp`](file:///home/medart-code/Drdonguri/main.cpp) | AtomS3U / T-dongle-S3 ファームウェア本体（F5廃止・HYBRID打鍵エンジン） |
| [`ANTIGRAVITY.md`](file:///home/medart-code/Drdonguri/ANTIGRAVITY.md) | 全開発ステップ（ステップ1〜14）の詳細開発履歴・技術仕様書 |
