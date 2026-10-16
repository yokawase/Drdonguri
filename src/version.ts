/**
 * Dr.Dongly システムバージョン一元管理モジュール
 * ビルド時に Vite の define により最新のビルド日時とバージョンが自動注入・更新されます
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const APP_NAME = 'Dr.Dongly';
export const APP_NAME_JA = 'DrVoice どんぐり君！';

// アプリケーションバージョン (package.json と同期)
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.9.1';

// ビルドタイムスタンプ (Vite ビルド時に自動更新)
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

// 最新ファームウェアバージョン (長単位結合オートマトン＆v20.1 HYBRID打鍵[Z][K][H][A]対応版)
export const LATEST_FIRMWARE_VERSION = 'v22.1';
export const FIRMWARE_RELEASE_DATE = '2026-10-16';
export const FIRMWARE_RELEASE_TITLE = 'v22.1（長単位結合オートマトン＆v20.1 HYBRID打鍵[Z][K][H][A]・ALT codes排除版）';

// ローカルAI & 臨床セマンティック検索エンジン構成
export const AI_ENGINE_INFO = 'EmbeddingGemma 2 (740M MRL 128d) ＆ WebLLM (Gemma 2 2B)';
export const OCR_ENGINE_INFO = 'Tesseract.js (完全ローカルブラウザOCR)';
export const LOCAL_RULE_ENGINE_INFO = 'Vibrato/軽量Wasm 0.5ms形態素解析 ＆ HVC防衛的サジェスト';

// 統合バージョン表示ラベル
export const FULL_VERSION_LABEL = `${APP_NAME} v${APP_VERSION} (FW ${LATEST_FIRMWARE_VERSION})`;

/**
 * 人間可読なビルド日時文字列を取得
 */
export function getFormattedBuildDate(): string {
  try {
    const d = new Date(BUILD_TIME);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '2026/10/09';
  }
}
