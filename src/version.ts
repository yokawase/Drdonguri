/**
 * Dr.Dongly システムバージョン一元管理モジュール
 * ビルド時に Vite の define により最新のビルド日時とバージョンが自動注入・更新されます
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

export const APP_NAME = 'Dr.Dongly';
export const APP_NAME_JA = 'DrVoice どんぐり君！';

// アプリケーションバージョン (package.json と同期)
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.40.0';

// ビルドタイムスタンプ (Vite ビルド時に自動更新)
export const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString();

// 最新ファームウェアバージョン (Direct Auto-Dispatch & Remote Trigger 安定化 FW)
export const LATEST_FIRMWARE_VERSION = 'v23.8';
export const FIRMWARE_RELEASE_DATE = '2026-10-30';
export const FIRMWARE_RELEASE_TITLE = 'v23.8（2分間ハング根絶・BLE接続パラメータ最適化・GATTタイムアウト保護＆動的完了判定版）';

// ローカルAI & 臨床セマンティック検索エンジン構成
export const AI_ENGINE_INFO = 'Aho-Corasick自己進化 ＆ EmbeddingGemma 2 (740M MRL 128d) ＆ WebLLM (Gemma 2 2B Q4F16/F32)';
export const OCR_ENGINE_INFO = 'Gemini Vision (100%完璧OCR) ＆ Canvasモアレ前処理＋Tesseract.js';
export const LOCAL_RULE_ENGINE_INFO = 'Aho-Corasickクローズドループ ＆ Vibrato 0.5ms形態素解析';

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
