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

// テンキーHIDスキャンコード
#define HID_KEYPAD_0         0x62
#define HID_KEYPAD_1         0x59
#define HID_KEYPAD_2         0x5A
#define HID_KEYPAD_3         0x5B
#define HID_KEYPAD_4         0x5C
#define HID_KEYPAD_5         0x5D
#define HID_KEYPAD_6         0x5E
#define HID_KEYPAD_7         0x5F
#define HID_KEYPAD_8         0x60
#define HID_KEYPAD_9         0x61
#define HID_KEYPAD_ADD       0x57  // テンキー '+'

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

  // 4. Alt+Numpad 100%決定論打鍵（CP932 10進数コード注入）
  void sendAltNumpadCode(const char* digits);

  // 5. カタカナ最適化打鍵（ローマ字打鍵 ➔ F7全角カタカナ変換 ➔ Enter確定）
  void sendKatakanaF7(const char* romaji);

  // 6. 半角英数打鍵（直接ASCII打鍵 ➔ F10半角変換 ➔ Enter確定）
  void sendAsciiF10(const char* ascii);

  // 7. 安全な単一ASCII文字打鍵 (JIS記号補正付き)
  void sendSafeChar(char c);

  // 8. 安全な単一キー送出（KeyUp二重保証）
  void safeWrite(uint8_t key);

  // 9. メタタグ付きハイブリッド打鍵ストリームの解析送出
  // [ALT]035037[/ALT], [F7]karona-ru[/F7], [F10]500mg[/F10], [A]text[/A], [IME_RESET], etc.
  void dispatchStream(const char* stream, size_t length, TypingProgressCallback progressCb = nullptr);

private:
  USBHIDKeyboard& _kbd;
  void sendKeypadDigit(char c);
};

#endif // TYPING_ENGINE_H
