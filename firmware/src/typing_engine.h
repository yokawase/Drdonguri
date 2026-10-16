#ifndef TYPING_ENGINE_H
#define TYPING_ENGINE_H

#include <Arduino.h>
#include <USBHIDKeyboard.h>

// ============================================================================
// DrVoice どんぐり君！ (Dr.Dongly) タイピングステートマシン (typing_engine.h)
// 100%決定論的Alt+Numpad ＆ F7/F10ハイブリッド ＆ 電カルメニュー誤爆完全防止
// ============================================================================

// 厳格なタイミング定数（ミリ秒）
#define TYPING_INTER_REPORT_DELAY_MS   11   // レポート間最小ディレイ (DLP/SKYSEAフック対策)
#define TYPING_ALT_HOLD_DELAY_MS       11   // Alt押下保持ディレイ
#define TYPING_CHAR_COMMIT_DELAY_MS    20   // 文字確定完了インターバル

// キーコード補足定義 (USBHIDKeyboard準拠)
#ifndef KEY_LEFT_ALT
#define KEY_LEFT_ALT 0x82
#endif
#ifndef KEY_LEFT_SHIFT
#define KEY_LEFT_SHIFT 0x81
#endif
#ifndef KEY_LEFT_CTRL
#define KEY_LEFT_CTRL 0x80
#endif
#ifndef KEY_RETURN
#define KEY_RETURN 0xB0
#endif
#ifndef KEY_ESC
#define KEY_ESC 0xB1
#endif
#ifndef KEY_BACKSPACE
#define KEY_BACKSPACE 0xB2
#endif
#ifndef KEY_TAB
#define KEY_TAB 0xB3
#endif
#ifndef KEY_F7
#define KEY_F7 0xC8
#endif
#ifndef KEY_F10
#define KEY_F10 0xCB
#endif

// 日本語キーボード (106/109) 固有キー
#define KEY_JIS_NONCONVERT   0x8B  // 無変換キー (USB HID Usage 0x8B: Keyboard International5 / Non-Convert)
#define KEY_JIS_CONVERT      0x8A  // 変換キー (USB HID Usage 0x8A: Keyboard International4 / Convert)
#define KEY_JIS_KANA         0x88  // かな/カナキー (USB HID Usage 0x88: Keyboard International2 / Katakana/Hiragana)

// 外部インターフェース型定義
typedef void (*TypingProgressCallback)(int current, int total);

class DonguriTypingEngine {
public:
  DonguriTypingEngine(USBHIDKeyboard& keyboard);

  void begin();

  // 1. 全修飾キーおよびキーの強制全解放
  void forceReleaseAll();

  // 2. Alt抜けによる「ファイルメニュー誤爆」を物理的に遮断するダミーShift空打ち
  void clearAltMenuTrap();

  // 3. IMEモード強制初期化シーケンス（無変換キー連打）
  void resetImeState();

  // 4. [K] カタカナ最適化打鍵（ローマ字打鍵 ➔ F7全角カタカナ変換 ➔ Enter確定）
  void sendKatakanaF7(const char* romaji);

  // 5. [A] 半角英数・ギリシャ混在打鍵（直接ASCII打鍵 ➔ F10半角変換 ➔ Enter確定）
  void sendAsciiF10(const char* ascii);

  // 6. [Z] 漢字熟語・自立語打鍵（ローマ字打鍵 ➔ Space変換 ➔ Enter確定）
  void sendKanjiZ(const char* romaji);

  // 7. [H] 助詞・語尾・句読点・ひらがな打鍵（ローマ字/約物打鍵 ➔ Enter即時確定 / Space禁止）
  void sendHiraganaH(const char* romaji);

  // 8. [G] ギリシャ文字・医学記号打鍵（ローマ字打鍵 ➔ Space2回 ➔ Enter確定）
  void sendGreekG(const char* romaji);

  // 9. 安全な単一ASCII文字打鍵 (JIS記号補正付き)
  void sendSafeChar(char c);

  // 10. 安全な単一キー送出（KeyUp二重保証）
  void safeWrite(uint8_t key);

  // 11. メタタグ付きハイブリッド打鍵ストリームの解析送出
  // [Z]...[/Z], [K]...[/K], [H]...[/H], [A]...[/A], [G]...[/G], [IME_RESET], etc.
  void dispatchStream(const char* stream, size_t length, TypingProgressCallback progressCb = nullptr);

private:
  USBHIDKeyboard& _kbd;
};

#endif // TYPING_ENGINE_H
