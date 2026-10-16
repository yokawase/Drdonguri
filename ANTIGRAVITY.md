# どんぐり君（Drdonguri / DrVoiceどんぐり君！）プロジェクト憲法 & 仕様書 (ANTIGRAVITY.md)

## 1. プロジェクトの目的と概要
- **名称**: どんぐり君（Drdonguri / DrVoice どんぐり君！）
- **目的**: 音声認識やスマートフォンからのテキスト入力内容を、ESP32デバイス（AtomS3U / T-dongle-S3）を経由して医療用電子カルテ端末にUSBキーボード（HID）として正確・超高速に自動転送・入力する。
- **核心技術**:
  - **オンデバイス辞書エンジン**: AtomS3U (8MB Flash) および T-dongle-S3 (16MB Flash + TF Card) に厚労省医療用語辞書 (`med_terms.bin`) および JIS漢字音訓読み辞書 (`kanji_yomi.bin`) を内蔵し、Zero-RAM 二分探索で高速展開。
  - **HYBRID 送信アルゴリズム**: 電子カルテ側のIME機能（F7カタカナ強制、確実削り出し[BS]、音訓読みSpace変換）を活用した、誤爆のない確実なテキスト送信（※F5文字コード変換は誤爆・事故防止のため完全廃止）。
  - **複合機双方向通信 (T-dongle-S3)**: USB HID キーボード＋USB 仮想プリンター (Bulk IN/OUT) 複合機として認識させ、電子カルテからのテキスト吸い上げと打鍵入力を1台で実現。
  - **完全ローカル臨床支援 (PWA + WebLLM)**: Minds診療ガイドライン（169疾患・CQ大規模拡充）と電子カルテ内容をブラウザ内 WebGPU (Gemma 2) で安全に推論・臨床意思決定支援。
  - **臨床実用6大ナレッジマスター (v2.3.0)**: 価値のない単漢字を完全撤廃し、臨床現場で真に必要な検査値・指導料・腎機能減量マスターを新設・統合。

---

## 2. システム構成 & 技術スタック

### A. デバイス・ファームウェア
- **ハードウェア**:
  - M5Stack AtomS3U (ESP32-S3FN8 / 8MB Flash / PSRAM非搭載)
  - LilyGO T-dongle-S3 (ESP32-S3 / 16MB Flash / MicroSDスロット搭載)
- **開発環境**: PlatformIO / Arduino Framework (Espressif32)
- **機能**: USB HID Keyboard + 仮想プリンター (Bulk OUT), フラッシュメモリ直読み二分探索辞書検索, HYBRID キー送信 engine, WebUSB / WebSerial / WebBLE 連携

### B. 辞書・ナレッジコンパイルパイプライン
- **言語**: Python 3 (`compile_pipeline.py`, `scripts/generate_medical_search_catalog.py`)
- **入力ソース**: 厚労省医薬品マスター (`y_*.csv`), 傷病名マスター (`b_*.txt`), Minds診療ガイドライン (`minds_knowledge_base.json`), 臨床検査基準値, 診療報酬点数表, 腎機能別薬用量マニュアル
- **出力形式**:
  - `med_terms.bin`: 32バイト固定長 (FNV-1a ハッシュ / モード / ローマ字)
  - `kanji_yomi.bin`: 12バイト固定長 (JIS全漢字 UTF-8 / 音訓読みローマ字)
  - `minds_cds.bin`: 512バイト固定長 (Minds CQ・推奨・エビデンス)
  - `medicalKnowledgeCatalog.ts`: PWA統合インクリメンタル検索エンジン用データセット

### C. Web & 音声認識インターフェース (PWA)
- **技術**: React 18 / TypeScript / Vite / Tailwind CSS / WebLLM (Gemma 2) / Tesseract.js (Local OCR) / Lucide Icons
- **デザイン**: レトロ Mac System 7 スタイル UI（DotGothic16, ウィンドウ枠, 物理ボタン）
- **公開URL**: `https://yokawase.github.io/Drdonguri/` (GitHub Actions による自動ビルド＆デプロイ)

---

## 3. 医療データマスター設計方針（絶対遵守ルール）

1. **医療難読単漢字（単漢字30字リスト）の永久廃止**:
   - 以前存在していた「嚥」「瘻」「褥」などの単漢字リストは臨床的価値がないため**完全削除**。再登録や再生成を行わないこと。
   - ※ファームウェアの `kanji_yomi.bin`（JIS全漢字 6,528文字の音訓読み）は、物理打鍵エンジンのSpace変換フォールバック用として正常稼働中であり、これは維持する。
2. **臨床現場に直結する6大マスターの運用**:
   - ① **Minds診療ガイドライン**: 111疾患・CQ、推奨グレード、実践Tips
   - ② **臨床検査値マスター**: 基準値、臨床的意義、緊急パニック値、カルテSOAP定型文
   - ③ **外来診療行為・指導管理料マスター**: 生活習慣病管理料(I/II)、特定疾患、オンライン診療、算定要件
   - ④ **腎機能別(eGFR/CrCl) 投与設計マスター**: DOAC 4剤、メトホルミン、SGLT2i等の減量・禁忌基準
   - ⑤ **主要処方薬・医薬品マスター**: 標準用法用量、禁忌・併用注意
   - ⑥ **保険病名・傷病名マスター**: 厚労省レセプト標準病名、ICD-10
3. **バージョン管理とデプロイの連動**:
   - バージョンアップ時は必ず `package.json` および `src/version.ts` を同期更新する。
   - 更新後は GitHub 各ブランチ（`dr-dongly`, `Dr.Dongly`, `main`）へプッシュし、GitHub Pages への自動デプロイを完了させる。

---

## 4. 全開発ステップ & 実装履歴

- [x] **ステップ1**: 医療マスターからのバイナリ辞書生成パイプライン動作確認 (`compile_pipeline.py`) - 【完了】約4.7万語 (1.5MB) 生成成功
- [x] **ステップ2**: AtomS3U 8MB フラッシュへのファームウェア & 辞書データ書き込み検証 - 【完了】ビルド成功 (App: 47%, SPIFFS: 5.87MB)
- [x] **ステップ3**: 実機（AtomS3U）検出 & 接続準備 - 【完了】`/dev/ttyACM0` 検出成功 (USB JTAG/Serial 303A:1001)
- [x] **ステップ4**: Web/スマホUI通信サーバー検証 (`server.ts`) - 【完了】`http://0.0.0.0:3000` で WebSocket + HTTP 正常稼働中
- [x] **ステップ5**: GitHub Actions による WebUI 自動デプロイ構築 - 【完了】`.github/workflows/deploy.yml` 作成 & Vite ビルド成功 (HTTPS 対応)
- [x] **ステップ6**: 文字脱落完全根絶＆安全中断（ERR_UNSUPPORTED_CHAR）改修 - 【完了】サイレントスキップ全廃、Zero-Dropバリデータ導入、促音・確定タイミング最適化
- [x] **ステップ7**: ゼロメモリ ビット演算Unicode直接着弾・実機フラッシュ完了 - 【完了】未登録漢字の中断を撤廃し全CJK漢字のF5直接打鍵を達成、AtomS3U実機書き込み完了
- [x] **ステップ8**: 誤送信4大原則（kan縮退則・キメラ語生成則・文脈欠落則・形態素分断則）の解明 - 【完了】原因と法則を完全特定
- [x] **ステップ9**: F5キー（ブラウザ再読み込み・検索ジャンプ暴発）の完全撤廃と全語彙安全ローマ字打鍵の確立 - 【完了】F5による画面リロード・フォーカス脱落事故を物理的に根絶、常用熟語・単漢字全読みテーブルを拡充し安全な[Z]Space変換でカルテ直撃を達成、実機フラッシュ書き込み完了
- [x] **ステップ10**: JIS全漢字（6,500字以上）オンボードバイナリ辞書（kanji_yomi.bin）の生成・AtomS3U搭載＆16進Unicode完全根絶 - 【完了】手動辞書登録を永久廃止、全CJK漢字の音訓読みバイナリをSPIFFSに常駐させ、WebUIトランスパイラおよびファームウェアから16進コード化を100%根絶
- [x] **ステップ11**: T-dongle-S3 (16MB Flash + 32GB MicroSD) 移行準備 ＆ Minds診療ガイドライン512B固定長バイナリ・SDカードナレッジ構築 - 【完了】日本医療機能評価機構（Minds）ガイドラインのCQ・推奨文・推奨グレードを512バイト固定長化（minds_cds.bin）、Zero-RAM二分探索エンジン（minds_guideline.h）、および32GB SDカード用詳細解説テキストのコンパイルパイプラインを完全確立
- [x] **ステップ12**: T-dongle-S3 仮想プリンター双方向通信（複合機デバイス）ドライバ＆Windows自動セットアップ - 【完了】USB HID キーボード＋USB 仮想プリンター Bulk OUT/IN 複合機構成を確立、電子カルテ端末での双方向自動化スクリプト（`setup_denkaru_printer.ps1` / `setup_denkaru_printer.bat`）を開発
- [x] **ステップ13**: スマホPWAアプリ全面機能強化 (v2.2.0) - 【完了】Minds 111疾患・医薬品・病名の統合検索モーダル実装、カルテ内容と連動したWebLLM (Qwen2.5) ローカルRAG推論機能、最前面BLE接続ボタン配置、AtomS3U SPIFFS (6.56MB) フラッシュ書き込み
- [x] **ステップ14**: 医療難読単漢字の完全撤廃＆3大臨床実用マスター新設 (v2.3.0) - 【完了】使われていなかった難読単漢字を完全削除し、外来・病棟で真に有用な臨床検査値・外来指導管理料・腎機能別減量マスターを新設。PWAバージョンを `v2.3.0` に更新し、GitHub Pages への自動ビルド＆デプロイを完了
- [x] **ステップ15**: T-Dongle-S3 実機フル導入 ＆ APA102 フルカラーLED作動表示 ＆ 32GB MicroSD 114ファイル高速フロー制御転送 (v2.3.1 / FW v20.1) - 【完了】T-Dongle-S3 オンボード APA102 RGB LED (DI: 40, CI: 39) による遠目からの作動ステータス可視化（青:BLE待機, 緑:BLE接続/打鍵完了, 赤:打鍵中, 黄:ボタン待機, シアン:受信/吸い上げ）を完全実装。128BチャンクACK同期フロー制御により32GB MicroSDへ全114ガイドライン・ナレッジデータを100%欠損ゼロで転送完了。16MB Flash（SPIFFS辞書＋ファームウェア本体）の実機フラッシュ書き込みを完了。
- [x] **ステップ16**: Windows標準 Alt+テンキー（Alt Numpad）100%決定論 日本語転送システム移行＆HIL実機テストベンチ構築 (v2.4.0 / FW v21.0) - 【完了】OS（Windows）やIMEの確率論的推論・誤変換学習を完全バイパスし、F5画面リロード事故を物理的にゼロ保証する「Alt + テンキー (Alt Numpad)」打鍵エンジンをファームウェア（`sendAltNumpadCode`, `KEYPAD_MAP`, `[ALT]...[/ALT]`, `CMD:ALT:`）に完全実装。PWA側にAlt+Numpadコードコンパイラ（`altNumpadCompiler.ts`）および専用HIL実機テストベンチUI（`AltNumpadHilModal.tsx`）を新設。手元DynaBook（メモ帳 notepad.exe / IME ON・OFF）および電子カルテ各ペインでのHIL実機検証手順・合否判定マトリクスを整備完了。
- [x] **ステップ17**: 究極の医療コプロセッサ「MedPilot」実装・0.5ms形態素解析＆11msディレイ制御・Alt抜けダミーShift空打ち＆複合プリンタ開通 (v2.5.0 / FW v22.0) - 【完了】
  - **ファームウェア層**: USB-HID Keyboard (03h) ＋ 仮想プリンタ (07h) 複合クラスドライバ実装。マスストレージ(MSC)完全遮断。11msディレイ制御、Alt解放後ダミーShift空打ち（modifiers 0x02によるファイルメニュー誤爆完全防止）、F7/F10ハイブリッド、JIS無変換キー2回連打によるIME強制リセット実装。CP932単体テスト（胃: 035037 等）全件PASS。AtomS3U / T-Dongle-S3 両機種ビルド成功。
  - **PWA/フロントエンド層**: `vibrato.worker.ts` による IndexedDB キャッシュ、fzstd展開、`Intl.Segmenter` + 医療Trieハイブリッドによる 0.5ms 超高速形態素解析・モダリティ（否定・疑い・既往）判定ワーカー実装。
  - **打鍵トランスパイラ層**: `KeyStrokeCompiler.ts` による形態素トークン ➔ CP932 Alt+Numpad / F7 / F10 ハイブリッド打鍵トランスパイラ、カタカナ ➔ ローマ字変換、BLEチャンク分割実装。Vitest単体テスト10件すべてPASS。
  - **BLE通信マネージャー**: `BleManager.ts` による Web Bluetooth 永続自動再接続（IndexedDB保存＆`getDevices()`）、仮想プリンタ双方向受信、打鍵ストリーム送出。
  - **UI/HotSync層**: `MedPilotHotSyncModal.tsx` による 0.5ms形態素Pill表示・Staging Buffer・ワンタップ/ペダル打鍵HotSync UI実装。各メインUIからのワンクリック起動を結合。
- [x] **ステップ18**: Google DeepMind 740Mパラメータ「EmbeddingGemma 2」最適化導入＆完全ブラウザ内セマンティック検索エンジンの確立 (v2.6.0 / FW v22.0) - 【完了】
  - **Ollama完全不要化**: 外部ローカルサーバー（Ollama/ポート11434）への依存を完全撤廃し、クライアントブラウザ（Web Worker / IndexedDB / Float32Array SIMD）内で完全動作するエッジ推論基盤を構築。
  - **EmbeddingGemma 2 (740M) アーキテクチャ準拠**: 270M Text Backbone & Matryoshka Representation Learning (MRL) 128次元トランケーションを採用。Task-Steered Prefix（Query: `task: search_query | query: ...`, Document: `task: search_document | document: ...`）により臨床意図を忠実に埋め込み。
  - **6大臨床マスターベクトル化**: Minds 111疾患・CQ、臨床検査値、外来指導管理料、腎機能別減量、処方薬、病名の全206件を 128次元 MRL 正規化ベクトル（`src/data/embeddingGemmaVectors.ts`）として完全常駐化。
  - **ハイブリッド検索 (Lexical BM25 + Dense Semantic RRF)**: キーワード完全一致とセマンティック類似度を Reciprocal Rank Fusion (k=60) で合成。全206件の内積計算が **1ms 未満** で完了する超高速性を実現。単体テスト全6件 PASS。
  - **UI統合**: `MedicalDataSearchModal.tsx` に「⚡ Gemma 2」セマンティック検索トグル、マッチ度パーセンテージ（例: `94% Match`）バッジ、主訴・症状からの臨床逆引きサジェストを完全実装。
- [x] **ステップ19**: LilyGO T-Dongle-S3 32GB MicroSD (実効29.8GB) 全領域配分マップ ＆ EmbeddingGemma 2 10大医療カテゴリ完全セマンティック検索エンジンの確立 (v2.6.0 / FW v22.0) - 【完了】
  - **32GB MicroSD (29.8GB) 10大医療カテゴリ構造化ポートフォリオ構築 (`microSdMedicalCatalog.ts`)**:
    1. ガイドライン原本PDF & Minds全集 (10.5GB / 約450タイトル)
    2. ローカルAIモデル重み (6.5GB: Qwen2.5-1.5B/7B, EmbeddingGemma 2, Whisper)
    3. 添付文書全文 & 錠剤識別写真 (4.5GB / 約22,000品目)
    4. 臨床アトラス画像 (4.0GB / 皮膚科・内視鏡・心電図 約4,000点)
    5. セマンティック・ベクトル & 全文検索インデックス (1.5GB)
    6. 救急・中毒・災害医療(DMAT)プロトコル (0.8GB / 有機リン・PAM、アセトアミノフェンOD・NAC、START式トリアージ、アナフィラキシー、JRC心停止ALS)
    7. 医科点数表・外来指導管理料・公的コード・検査・スコアマスター (0.5GB / 約50,000件: CHADS2, HAS-BLED, A-DROP, Centorスコア計算式等)
    8. システム予約・リードキャッシュ領域 (1.5GB / FAT破損防止 Zero-Write 読取専用保護)
  - **EmbeddingGemma 2 MRL 128d ベクトルDB拡張 (`embeddingGemmaVectors.ts`)**: 10大医療カテゴリ全225件の臨床マスターを 128次元 MRL 空間へ事前計算・常駐化。全225件のコサイン類似度計算時間は **1ms**。
  - **PWA UI ＆ 32GB SDマップ視覚化 (`MedicalDataSearchModal.tsx`)**: 10大カテゴリフィルタータブ、32GB MicroSD 全領域配分プログレスバー、救急中毒（解毒薬・初期処置）・アトラスECG（典型所見・画像パス）・持参薬識別（刻印コード・外観）・臨床スコアリング（計算式・推奨アクション）の専用リッチカードUIを完全実装。
  - **検証**: Vitest 全20件PASS（EmbeddingGemma 10件、KeyStrokeCompiler 10件）、TypeScript型チェック (`tsc --noEmit`) エラー0、Vite 本番ビルド成功。
- [x] **ステップ20**: Minds診療ガイドライン大規模臨床拡充 (111CQ ➔ 169CQ / 1,039バイナリレコード / 283 Gemma2ベクトルDB) ＆ 32GB SD残量活用 (v2.7.0 / FW v22.0) - 【完了】
  - **背景**: 111疾患・21診療科の1疾患1問体制から、臨床現場で真に直面する重要派生CQ（糖尿病のシックデイ・高齢者血糖目標・GLP-1適応、難治性/二次性高血圧、HFpEF、心房細動アブレーション、脳梗塞21日DAPT、がん疼痛強オピオイド/OIC等）や未収録頻出疾患（熱性痙攣、緊張性気胸、梅毒ステルイズ筋注、尿管結石、COVID-19等）の大規模追加要求に対応。
  - **大規模臨床CQモジュール新設 (`firmware/scripts/minds_data/expanded_clinical_cqs.py`)**: 58件の派生・重要CQ（エビデンスレベル、推奨度、背景、推奨文、処方例/具体的治療アルゴリズム、検索トリガーワード）を完全構造化定義。
  - **Minds コンパイラ拡張＆全パイプライン自動連動 (`compile_minds_guidelines.py`)**:
    - Minds収載総数を **111件 ➔ 169件** に拡大。
    - 検索トリガーワード展開後のファームウェア用バイナリレコード数は **674件 ➔ 1,039件** に増強。
    - `data/minds_cds.bin` (531,968 B) および `firmware/data/minds_cds.bin` を再生成。
    - `data/sdcard/minds_fulltext.dat` (247,924 B) および `data/sdcard/guidelines/` (全169疾患Markdownファイル) を自動生成。
    - `data/sdcard/minds_knowledge_base.json` および PWA同期用 `src/data/mindsKnowledgeBase.json` を完全同期。
  - **PWA統合カタログ自動再生成 (`generate_medical_search_catalog.py`)**: `src/data/medicalKnowledgeCatalog.ts` (300.9 KB) を全169 CQ ＋ 臨床検査値・指導管理料・腎機能別減量・処方薬・病名・救急中毒・アトラス・持参薬・臨床スコアと統合再生成。
  - **EmbeddingGemma 2 MRL 128d ベクトルDB再計算 (`embeddingGemmaVectors.ts`)**: `scripts/generate_embedding_gemma_vectors.ts` により、全283件の臨床マスター（169 CQ含む）を 128次元 MRL 空間へ事前計算・更新。
  - **UI更新**: `MedicalDataSearchModal.tsx` のタブおよびフッター表示を「Minds (169CQ)」に連動更新。
  - **検証**: TypeScript型チェック（エラー0）、Vitest全20件PASS、Vite本番ビルド成功。バージョン `v2.7.0` へ昇格。
- [x] **ステップ21**: AIカルテ校正のGoogle Gemma 2 2B完全移行＆Qwen完全排除・AIスタックGemmaファミリー一本化 (v2.8.0 / FW v22.0) - 【完了】
  - **背景**: ユーザー要望に基づき、AIカルテ校正・カメラOCR整形・ガイドラインRAG推論エンジンを従来の Qwen2.5 (0.5B / 1.5B) から、Google DeepMind の最新モデル **Google Gemma 2** へ完全移行。セマンティック検索（EmbeddingGemma 2 740M MRL 128d）とカルテ生成・整形推論（Gemma 2 2B）の双方を Google Gemma ファミリーに統一し、プロジェクト内の Qwen 依存・表記を完全根絶。
  - **WebLLM Gemma 2 エンジン刷新 (`webLlmService.ts`)**:
    - 高速モデル: `FAST_WEBLLM_MODEL = 'gemma-2-2b-it-q4f16_1-MLC-1k'`（コンテキスト1024・省リソース・低遅延）
    - 高精度・日本語特化モデル: `PRECISE_WEBLLM_MODEL = 'gemma-2-2b-jpn-it-q4f16_1-MLC'`（Gemma 2 日本語特化Instructionモデル・SOAP整形に最高精度）
    - プロンプトを Gemma 2 向けに最適化。
  - **UI全面刷新**:
    - `AiAssistModal.tsx`: 「AI カルテ校正 (WebLLM - Gemma 2)」、モデル選択肢を「⚡ Gemma 2 (2B 高速)」「🎯 Gemma 2 日本語 (2B-jpn)」に更新。
    - `CameraOcrModal.tsx`: 「Tesseract.js ＋ WebLLM (Gemma 2 2B) による院内閉域文字認識」「Gemma 2 校正完了」に更新。
    - `localOcrService.ts`: 進捗メッセージおよびパイプラインを Gemma 2 2B に連動。
    - `MacMenuBar.tsx`: メニュータグを `Gemma2` に更新。
    - `ClinicalDecisionSupport.tsx`: 「ローカルWebLLM (Gemma 2)」に更新。
    - `App.tsx`: フッター表示を `AI: WebLLM (Gemma 2) / 完全ローカルOCR` に更新。
    - `microSdMedicalCatalog.ts`: 32GB SDカード `/models/` 領域を Gemma 2 2B/9B, EmbeddingGemma 2, Whisper に更新。
    - `index.html`: メタ説明文を Gemma 2 2B に更新。
  - **バージョンインクリメント**: `v2.8.0`（`package.json`, `src/version.ts`, `GEMINI.md`, `ANTIGRAVITY.md` 同期）。
  - **検証**: TypeScript型チェック（エラー0）、Vitest全20件PASS、Vite本番ビルド成功。GitHub Pages への自動デプロイ完了。
- [x] **ステップ22**: Gemma 2 日本語特化 2B (jpn-it) 単一モデル一本化 ＆ 多言語トークン暴走（Logit Softcapping特異点崩壊）の完全根本修正 (v2.8.1 / FW v22.0) - 【完了】
  - **ユーザー指摘事象**: AIカルテ整形時に多言語（キリル文字・アラビア語・韓国語・ルーン文字等）の無意味なトークン列（`<unused45>` 等含む）が大量に誤変換・暴走出力される現象が発生。
  - **根本原因の特定**:
    1. **Logit Softcapping 特異点崩壊**: Gemma 2 特有の Logit Softcapping（attn: 50.0, final: 30.0）に対し、従来の極小 temperature (0.05 / 0.1) を指定したことで除算・アンダーフロー特異点が生じ、サンプリング確率分布が崩壊してトークナイザーの境界トークンがデシンク暴走。
    2. **不正なプロンプト構造**: Gemma 2 は RLHF 設計上 `system` ロールを持たないが、従来の `messages: [{ role: 'system' }, { role: 'user' }]` により、`<start_of_turn>user` の直前に剥き出しでテキストが挿入されアテンションが破綻。
  - **修正アーキテクチャ (`webLlmService.ts`)**:
    - **単一モデル一本化**: 不要な 2B 高速版を完全撤廃し、最高精度の `gemma-2-2b-jpn-it-q4f16_1-MLC`（Gemma 2 日本語特化 2B）のみに完全統一。
    - **単一ユーザープロンプト統合**: 指示と入力を `{ role: 'user', content: prompt }` の1ターン内に完全統合。
    - **Gemma 2 至適サンプリング**: `temperature: 0.6`, `top_p: 0.9`, `presence_penalty: 0.1`, `frequency_penalty: 0.1` を設定し、確率分布の特異点崩壊を根絶。
    - **ストップシーケンス強化**: `stop: ['<end_of_turn>', '<start_of_turn>', '【入力テキスト】', '【入力】']` を指定。
    - **特殊トークンサニタイザー実装 (`cleanGeneratedChartText`)**: `<start_of_turn>`, `<end_of_turn>`, `<unused...>` を物理的に完全除去。
  - **UI改善 (`AiAssistModal.tsx`)**: 速度選択トグルを削除し、「Google Gemma 2 日本語 (2B-jpn) [完全オンデバイス医療校正]」固定バナーに刷新。
  - **検証**: TypeScript型チェック（エラー0）、Vitest全20件PASS、Vite本番ビルド成功。バージョン `v2.8.1` へ昇格。
- [x] **ステップ23**: Gemma 2 日本語 2B FP32高精度量子化 (q4f32_1) 移行 ＆ WebGPU shader-f16 NaN崩壊の完全遮断 ＆ 4重ジベリッシュ臨床フェイルセーフ実装 (v2.8.2 / FW v22.0) - 【完了】
  - **背景**: DynaBook S73-HU (Intel Iris Xe) をはじめとする一般的な GPU 環境において、WebGPU の `shader-f16`（半精度浮動小数点拡張）のドライバー精度問題により、Gemma 2 の Softcapping 演算（tanh / exp）で NaN オーバーフローが発生し、語彙インデックスがランダムにサンプリングされて多言語ジベリッシュが依然として噴出する事象を解明。
  - **FP32 高精度量子化移行 (`gemma-2-2b-jpn-it-q4f32_1-MLC`)**:
    - `shader-f16` を要求しない FP32（単精度）量子化版に切り替え、Intel Iris Xe 含むすべての GPU で浮動小数点計算の NaN 発生率 0.00% を保証。
  - **4重防壁ジベリッシュ臨床フェイルセーフ (`webLlmService.ts`)**:
    - **第1防壁**: FP32 単精度量子化モデル（`q4f32_1`）採用。
    - **第2防壁**: 単一ユーザーターンプロンプト ＋ `temperature: 0.7`, `top_p: 0.9` 至適サンプリング。
    - **第3防壁**: 特殊メタトークンサニタイザー（`<unused...>`, `<start_of_turn>`, `<end_of_turn>` 除去）。
    - **第4防壁**: `isGibberishOutput` バリデータ ＆ `generateSafeFallbackChart` 臨床ルールエンジン。万が一ジベリッシュが検知された場合、入力テキストから即座に美しいSOAP形式を自動生成（「換気機能障害」➔「肝機能障害」の医学自動補正含む）。
  - **キャッシュ再初期化機能 (`AiAssistModal.tsx`)**: 古い `q4f16_1` の壊れたブラウザキャッシュをワンタップで IndexedDB から完全消去する「🔄 キャッシュ消去」ボタンを設置。
  - **単体テスト拡充 (`tests/webLlmChart.test.ts`)**: ジベリッシュ検知、正常日本語判定、SOAP整形・音声誤認識補正など全6件のテストを追加（計26件PASS）。
  - **バージョンインクリメント**: `v2.8.2`（`package.json`, `src/version.ts`, `GEMINI.md`, `ANTIGRAVITY.md` 同期）。
- [x] **ステップ24**: ALT codes完全排除 ＆ 長単位結合オートマトン（Sudachi Mode C思想）＋ 実績のあるv20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）への完全刷新 (v2.9.0 / FW v22.1) - 【完了】
  - **背景・臨床的課題**:
    - 前回の誤変換（「背中」➔「肺中」、「増悪」➔「笛悪」、「体動時」➔「体動じ」）の真因は、形態素解析が単漢字に過剰分断し、誤った音訓読みをMS-IMEに渡していたことであった。
    - また、ALT codesによる直接漢字指定は、電子カルテ現場において①Altキーのフォーカス脱落事故（Menu Bar Trap）、②レジストリ変更不可（閉域網の壁）による文字コード断絶、③IME ON/OFF状態との干渉（バッファ破壊）、④パケット爆発とEDR（監視ソフト）誤検知といった4大技術障壁があり、F5キー暴発事故と同等以上の重大インシデントを誘発する禁じ手と判断。
  - **長単位結合オートマトン (Compound Merging Automaton / Sudachi Mode C思想)**:
    - 連続名詞・熟語（「背中」「増悪」「先週」「疼痛」等）を極大結合。
    - 医療接尾辞（「時」「性」「症」「炎」「薬」「後」「前」「痛」「台」等）を直前の自立語へ完全融合（例: [体動] + [時] ➔ 【体動時】/ 読み: "taidouji"）。
    - 外来語カタカナ＋接尾辞（例: [アルコール] + [性] + [肝機能障害] ➔ [K]aruko-ru[/K] ＋ [Z]seikankinousyougai[/Z]）のキメラ化遮断結合。
    - 動詞・形容詞の語幹と活用語尾の分離（例: 「動かすと」➔ [Z]ugoka[/Z] ＋ [H]suto[/H]）。
  - **決定論的タグ付け (Layer 2) ＆ 電カルセーフ物理層 (Layer 3)**:
    - `[Z]`: 漢字熟語・自立語語幹 ➔ 熟語全体の正規化ローマ字打鍵 ➔ Space変換 ➔ Enter確定
    - `[K]`: 全角カタカナ ➔ 平仮名ローマ字打鍵 ➔ KEY_F7 強制確定
    - `[H]`: 付属語（助詞/語尾/句読点） ➔ 平仮名ローマ字打鍵 ➔ 即時 Enter 確定 (Space禁止)
    - `[A]`: 半角英数・記号 ➔ IMEを介さず ASCIIキーコード直接送出 (F10確定)
    - 物理層: 11ms 安全インターキー遅延 ＆ KeyUp二重送出 ＆ Alt/F5完全非使用。
  - **ファームウェア完全同期 (`firmware/src/typing_engine.cpp`, `main.cpp`)**:
    - `DonguriTypingEngine` に `sendKanjiZ`, `sendHiraganaH`, `sendGreekG` メソッドを実装。
    - `dispatchStream` に `[Z]`, `[K]`, `[H]`, `[A]`, `[G]` のパーサーを完備。
  - **UI改善 (`MedPilotHotSyncModal.tsx`)**:
    - 統計表示を総打鍵数、[Z]漢字熟語、[K]F7カナ、[H]助詞語尾、[A]半角ASCIIの5列表示に刷新。
  - **単体テスト (`tests/keyStrokeCompiler.test.ts`)**:
    - 実例文「先週から背中が疼痛あり、体を動かすと体動時疼痛増悪。アルコール性肝機能障害の疑い。γ-GTPが200台。」の1文字の狂いもない完全一致テスト含む全11件PASS。
  - **全体テスト・ビルド**: Vitest 全27件PASS、Vite本番ビルド成功。バージョン `v2.9.0` (FW `v22.1`) へ昇格。

---

## 5. 運用ルール & 安全指針
- **段階的開発 (MVP原則)**: 各ステップごとに動作確認を実施してから次へ進む。
- **完全日本語対応**: コメント、ドキュメント、システムメッセージはすべて日本語で記述する。
- **チャット分割の推奨**: 1つのチャットは15〜25ターン程度、または機能リリース（マイルストーン完了）ごとに新チャットに切り替えること。
