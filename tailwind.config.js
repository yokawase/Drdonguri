/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ──────────────────────────────────────────
        // 1. スプリットコンプリメンタリー配色（独自パレット）
        // ──────────────────────────────────────────
        dongly: {
          // 【基準色: Primary/Base】 ディープスレートネイビー（約70〜80%）
          base: {
            DEFAULT: '#0F172A', // 最背面の背景
            card:    '#1E293B', // ヘッダー、フッター、カード
            subtle:  '#334155', // 境界線・ホバー時の背景
            border:  'rgba(51, 65, 85, 0.6)',
          },

          // 【補色隣接①: Accent 1】 ウォームアンバー / 琥珀（最重要アクション・音声入力FAB）
          amber: {
            DEFAULT: '#F59E0B', // 主ボタン
            hover:   '#D97706', // ホバー・アクティブ時
            glow:    'rgba(245, 158, 11, 0.25)', // FABの光彩シャドウ
            dark:    '#78350F', // アンバー背景時のテキスト・アイコン
          },

          // 【補色隣接②: Accent 2】 ソフトコーラル / テラコッタ（副次アクション・電カル受信・通知）
          coral: {
            DEFAULT: '#F43F5E', // アイコン・アクセント
            subtle:  'rgba(244, 63, 94, 0.15)', // 背景ハイライト
            border:  'rgba(244, 63, 94, 0.40)', // 枠線
          },

          // 【補助機能色: Functional】 状態通知・出力
          status: {
            ble:     '#10B981', // T-Dongle-S3 接続中（エメラルド）
            bleGlow: 'rgba(16, 185, 129, 0.2)',
            send:    '#38BDF8', // 電カルへ送信（スカイブルー）
          },

          // 【テキスト階層】
          text: {
            primary:   '#F8FAFC', // 本文・見出し
            secondary: '#94A3B8', // 補助テキスト・プレースホルダー
            muted:     '#64748B', // 非アクティブ・脚注
          }
        }
      },
      boxShadow: {
        // 音声入力FAB用のシックな発光シャドウ
        'fab-amber': '0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 8px 10px -6px rgba(245, 158, 11, 0.2)',
        'fab-recording': '0 10px 25px -5px rgba(225, 29, 72, 0.5), 0 8px 10px -6px rgba(225, 29, 72, 0.3)',
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};
