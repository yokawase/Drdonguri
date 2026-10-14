/**
 * Dr.Dongly システムバージョン一元管理モジュール
 * ビルド時に Vite の define により最新のビルド日時とバージョンが自動注入・更新されます
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const APP_NAME = 'Dr.Dongly';
export const APP_NAME_JA = 'DrVoice どんぐり君！';

// アプリケーションバージョン (package.json と同期)
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.4.0';

// ビルドタイムスタンプ (Vite ビルド時に自動更新)
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

// 最新ファームウェアバージョン (Windows標準 Alt+テンキー 100%決定論 日本語転送＆F5事故ゼロHIL対応版)
export const LATEST_FIRMWARE_VERSION = 'v21.0';
export const FIRMWARE_RELEASE_DATE = '2026-10-14';
export const FIRMWARE_RELEASE_TITLE = 'v21.0（Windows標準 Alt+テンキー 100%決定論 日本語転送＆F5事故ゼロHIL対応版）';

// ローカルAI & OCR エンジン構成
export const AI_ENGINE_INFO = 'WebLLM (Qwen2.5 1.5B / 0.5B)';
export const OCR_ENGINE_INFO = 'Tesseract.js (完全ローカルブラウザOCR)';
export const LOCAL_RULE_ENGINE_INFO = 'MEDIS病名マスター & HVC防衛的サジェスト';

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
