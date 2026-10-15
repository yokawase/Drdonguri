#include "typing_engine.h"
#include <string.h>

static const uint8_t KEYPAD_SCANCODES[10] = {
  HID_KEYPAD_0,
  HID_KEYPAD_1,
  HID_KEYPAD_2,
  HID_KEYPAD_3,
  HID_KEYPAD_4,
  HID_KEYPAD_5,
  HID_KEYPAD_6,
  HID_KEYPAD_7,
  HID_KEYPAD_8,
  HID_KEYPAD_9
};

DonguriTypingEngine::DonguriTypingEngine(USBHIDKeyboard& keyboard)
  : _kbd(keyboard) {
}

void DonguriTypingEngine::begin() {
  _kbd.begin();
  forceReleaseAll();
}

void DonguriTypingEngine::forceReleaseAll() {
  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));
  _kbd.sendReport(&rep);
  delay(2);
  _kbd.sendReport(&rep); // 二重送出による脱落防止
  delay(TYPING_INTER_REPORT_DELAY_MS);
}

void DonguriTypingEngine::clearAltMenuTrap() {
  // WindowsのOS仕様: 「Altキー単独押下・解放」はウィンドウのメニューバー([ファイル(F)])をアクティブにする。
  // これをOSカーネルレベルでキャンセルするため、無害な修飾キー(Shift)の空打ちを1回発行する。
  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));
  rep.modifiers = 0x02; // KEYBOARD_MODIFIER_LEFTSHIFT
  _kbd.sendReport(&rep);
  delay(TYPING_INTER_REPORT_DELAY_MS);

  memset(&rep, 0, sizeof(KeyReport));
  _kbd.sendReport(&rep);
  delay(2);
  _kbd.sendReport(&rep);
  delay(TYPING_INTER_REPORT_DELAY_MS);
}

void DonguriTypingEngine::resetImeState() {
  // 電子カルテ側のIMEモード（未確定入力、全角/半角のズレ）を強制リセット
  // JIS無変換キー (Usage 0x8B) を2回空打ち
  KeyReport rep;
  for (int i = 0; i < 2; i++) {
    memset(&rep, 0, sizeof(KeyReport));
    rep.keys[0] = KEY_JIS_NONCONVERT;
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);

    memset(&rep, 0, sizeof(KeyReport));
    _kbd.sendReport(&rep);
    delay(2);
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);
  }
}

void DonguriTypingEngine::sendAltNumpadCode(const char* digits) {
  if (digits == nullptr || digits[0] == '\0') return;

  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));

  // 1. KEY_LEFT_ALT を押下保持 (Hold)
  // KEYBOARD_MODIFIER_LEFTALT = 0x04 (TU_BIT(2))
  rep.modifiers = 0x04;
  _kbd.sendReport(&rep);
  delay(TYPING_ALT_HOLD_DELAY_MS);

  // 2. テンキーの各数字を順次打鍵 (押下 11ms ➔ 解放 11ms)
  for (size_t i = 0; digits[i] != '\0'; i++) {
    char c = digits[i];
    uint8_t kp_code = 0;

    if (c >= '0' && c <= '9') {
      kp_code = KEYPAD_SCANCODES[c - '0'];
    } else if (c == '+') {
      kp_code = HID_KEYPAD_ADD;
    } else {
      continue;
    }

    // KeyDown (Alt押下保持 + テンキー押下)
    rep.modifiers = 0x04;
    rep.keys[0] = kp_code;
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);

    // KeyUp (テンキーのみ解放、Altは保持)
    rep.keys[0] = 0;
    _kbd.sendReport(&rep);
    delay(2);
    _kbd.sendReport(&rep); // 二重送出
    delay(TYPING_INTER_REPORT_DELAY_MS);
  }

  // 3. KEY_LEFT_ALT を解放 (Release) ➔ Windowsが文字コードを合成・確定着弾
  memset(&rep, 0, sizeof(KeyReport));
  _kbd.sendReport(&rep);
  delay(2);
  _kbd.sendReport(&rep);
  delay(TYPING_INTER_REPORT_DELAY_MS);

  // 4. Alt抜けによるメニュー誤爆防止: ダミーShift空打ち
  clearAltMenuTrap();

  // 文字確定インターバル
  delay(TYPING_CHAR_COMMIT_DELAY_MS);
}

void DonguriTypingEngine::sendKatakanaF7(const char* romaji) {
  if (romaji == nullptr || romaji[0] == '\0') return;

  // ローマ字文字列を順次打鍵
  for (size_t i = 0; romaji[i] != '\0'; i++) {
    sendSafeChar(romaji[i]);
  }
  delay(TYPING_INTER_REPORT_DELAY_MS);

  // F7キー（全角カタカナ変換）打鍵
  safeWrite(KEY_F7);
  delay(TYPING_INTER_REPORT_DELAY_MS);

  // Enterキー（確定）打鍵
  safeWrite(KEY_RETURN);
  delay(TYPING_INTER_REPORT_DELAY_MS);
}

void DonguriTypingEngine::sendAsciiF10(const char* ascii) {
  if (ascii == nullptr || ascii[0] == '\0') return;

  // ASCII文字列を順次打鍵
  for (size_t i = 0; ascii[i] != '\0'; i++) {
    sendSafeChar(ascii[i]);
  }
  delay(TYPING_INTER_REPORT_DELAY_MS);

  // F10キー（半角変換）打鍵
  safeWrite(KEY_F10);
  delay(TYPING_INTER_REPORT_DELAY_MS);

  // Enterキー（確定）打鍵
  safeWrite(KEY_RETURN);
  delay(TYPING_INTER_REPORT_DELAY_MS);
}

void DonguriTypingEngine::safeWrite(uint8_t key) {
  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));
  rep.keys[0] = key;
  _kbd.sendReport(&rep);
  delay(TYPING_INTER_REPORT_DELAY_MS);

  memset(&rep, 0, sizeof(KeyReport));
  _kbd.sendReport(&rep);
  delay(2);
  _kbd.sendReport(&rep); // 二重解放
  delay(TYPING_INTER_REPORT_DELAY_MS);
}

void DonguriTypingEngine::sendSafeChar(char c) {
  // JIS 109/106 キーボード配列に適合したスキャンコード送出
  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));

  if (c >= 'a' && c <= 'z') {
    rep.keys[0] = (uint8_t)(0x04 + (c - 'a')); // HID Usage: 'a' = 0x04
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);
    forceReleaseAll();
    return;
  }
  if (c >= 'A' && c <= 'Z') {
    rep.modifiers = 0x02; // Left Shift
    rep.keys[0] = (uint8_t)(0x04 + (c - 'A'));
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);
    forceReleaseAll();
    return;
  }
  if (c >= '1' && c <= '9') {
    rep.keys[0] = (uint8_t)(0x1E + (c - '1')); // '1' = 0x1E
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);
    forceReleaseAll();
    return;
  }
  if (c == '0') {
    rep.keys[0] = 0x27; // '0' = 0x27
    _kbd.sendReport(&rep);
    delay(TYPING_INTER_REPORT_DELAY_MS);
    forceReleaseAll();
    return;
  }

  // 特殊記号（JISキーボードマッピング）
  switch (c) {
    case ' ':
      rep.keys[0] = 0x2C; // Space
      break;
    case '\t':
      rep.keys[0] = KEY_TAB;
      break;
    case '\n':
    case '\r':
      rep.keys[0] = KEY_RETURN;
      break;
    case '-':
      rep.keys[0] = 0x2D; // '-' (JIS)
      break;
    case '^':
      rep.keys[0] = 0x2E; // '^' (JIS)
      break;
    case '@':
      rep.keys[0] = 0x2F; // '@' (JIS)
      break;
    case '[':
      rep.keys[0] = 0x30; // '[' (JIS)
      break;
    case ']':
      rep.keys[0] = 0x31; // ']' (JIS)
      break;
    case ';':
      rep.keys[0] = 0x33; // ';' (JIS)
      break;
    case ':':
      rep.keys[0] = 0x34; // ':' (JIS)
      break;
    case ',':
      rep.keys[0] = 0x36; // ','
      break;
    case '.':
      rep.keys[0] = 0x37; // '.'
      break;
    case '/':
      rep.keys[0] = 0x38; // '/'
      break;
    case '\\':
      rep.keys[0] = 0x89; // '\' (JIS Usage 0x89)
      break;
    // Shift組み合わせ記号
    case '!': // JIS Shift + 1
      rep.modifiers = 0x02; rep.keys[0] = 0x1E; break;
    case '"': // JIS Shift + 2
      rep.modifiers = 0x02; rep.keys[0] = 0x1F; break;
    case '#': // JIS Shift + 3
      rep.modifiers = 0x02; rep.keys[0] = 0x20; break;
    case '$': // JIS Shift + 4
      rep.modifiers = 0x02; rep.keys[0] = 0x21; break;
    case '%': // JIS Shift + 5
      rep.modifiers = 0x02; rep.keys[0] = 0x22; break;
    case '&': // JIS Shift + 6
      rep.modifiers = 0x02; rep.keys[0] = 0x23; break;
    case '\'': // JIS Shift + 7
      rep.modifiers = 0x02; rep.keys[0] = 0x24; break;
    case '(': // JIS Shift + 8
      rep.modifiers = 0x02; rep.keys[0] = 0x25; break;
    case ')': // JIS Shift + 9
      rep.modifiers = 0x02; rep.keys[0] = 0x26; break;
    case '=': // JIS Shift + -
      rep.modifiers = 0x02; rep.keys[0] = 0x2D; break;
    case '~': // JIS Shift + ^
      rep.modifiers = 0x02; rep.keys[0] = 0x2E; break;
    case '`': // JIS Shift + @
      rep.modifiers = 0x02; rep.keys[0] = 0x2F; break;
    case '{': // JIS Shift + [
      rep.modifiers = 0x02; rep.keys[0] = 0x30; break;
    case '+': // JIS Shift + ;
      rep.modifiers = 0x02; rep.keys[0] = 0x33; break;
    case '*': // JIS Shift + :
      rep.modifiers = 0x02; rep.keys[0] = 0x34; break;
    case '}': // JIS Shift + ]
      rep.modifiers = 0x02; rep.keys[0] = 0x31; break;
    case '<': // JIS Shift + ,
      rep.modifiers = 0x02; rep.keys[0] = 0x36; break;
    case '>': // JIS Shift + .
      rep.modifiers = 0x02; rep.keys[0] = 0x37; break;
    case '?': // JIS Shift + /
      rep.modifiers = 0x02; rep.keys[0] = 0x38; break;
    case '_': // JIS Shift + \ (Usage 0x87: Int1)
      rep.modifiers = 0x02; rep.keys[0] = 0x87; break;
    default:
      // 未定義記号はスキップ
      return;
  }

  _kbd.sendReport(&rep);
  delay(TYPING_INTER_REPORT_DELAY_MS);
  forceReleaseAll();
}

void DonguriTypingEngine::dispatchStream(const char* stream, size_t length, TypingProgressCallback progressCb) {
  if (stream == nullptr || length == 0) return;

  size_t i = 0;
  while (i < length) {
    if (progressCb != nullptr) {
      progressCb((int)i, (int)length);
    }

    // 1. [IME_RESET] または <IME_RESET>
    if (strncmp(&stream[i], "[IME_RESET]", 11) == 0 || strncmp(&stream[i], "<IME_RESET>", 11) == 0) {
      resetImeState();
      i += 11;
      continue;
    }

    // 2. [ALT]035037[/ALT] または <ALT>035037</ALT>
    if (strncmp(&stream[i], "[ALT]", 5) == 0 || strncmp(&stream[i], "<ALT>", 5) == 0) {
      i += 5;
      char digits[16] = {0};
      size_t dlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/ALT]", 6) == 0 || strncmp(&stream[i], "</ALT>", 6) == 0) {
          i += 6;
          break;
        }
        if (stream[i] == '[' || stream[i] == '<' || stream[i] == '\n' || stream[i] == '\r') {
          break;
        }
        if ((stream[i] >= '0' && stream[i] <= '9') || stream[i] == '+') {
          if (dlen < sizeof(digits) - 1) {
            digits[dlen++] = stream[i];
          }
        }
        i++;
      }
      digits[dlen] = '\0';
      if (dlen > 0) {
        sendAltNumpadCode(digits);
      }
      continue;
    }

    // 3. [F7]karona-ru[/F7] または <F7>karona-ru</F7>
    if (strncmp(&stream[i], "[F7]", 4) == 0 || strncmp(&stream[i], "<F7>", 4) == 0) {
      i += 4;
      char romaji[64] = {0};
      size_t rlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/F7]", 5) == 0 || strncmp(&stream[i], "</F7>", 5) == 0) {
          i += 5;
          break;
        }
        if (stream[i] == '[' || stream[i] == '<' || stream[i] == '\n' || stream[i] == '\r') {
          break;
        }
        if (rlen < sizeof(romaji) - 1) {
          romaji[rlen++] = stream[i];
        }
        i++;
      }
      romaji[rlen] = '\0';
      if (rlen > 0) {
        sendKatakanaF7(romaji);
      }
      continue;
    }

    // 4. [F10]500mg[/F10] または <F10>500mg</F10>
    if (strncmp(&stream[i], "[F10]", 5) == 0 || strncmp(&stream[i], "<F10>", 5) == 0) {
      i += 5;
      char ascii[64] = {0};
      size_t alen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/F10]", 6) == 0 || strncmp(&stream[i], "</F10>", 6) == 0) {
          i += 6;
          break;
        }
        if (stream[i] == '[' || stream[i] == '<' || stream[i] == '\n' || stream[i] == '\r') {
          break;
        }
        if (alen < sizeof(ascii) - 1) {
          ascii[alen++] = stream[i];
        }
        i++;
      }
      ascii[alen] = '\0';
      if (alen > 0) {
        sendAsciiF10(ascii);
      }
      continue;
    }

    // 5. [RAW]...[/RAW] または [A]...[/A]
    if (strncmp(&stream[i], "[RAW]", 5) == 0 || strncmp(&stream[i], "<RAW>", 5) == 0 ||
        strncmp(&stream[i], "[A]", 3) == 0 || strncmp(&stream[i], "<A>", 3) == 0) {
      size_t tagSkip = (stream[i+1] == 'R' || stream[i+1] == 'r') ? 5 : 3;
      i += tagSkip;
      while (i < length) {
        if (strncmp(&stream[i], "[/RAW]", 6) == 0 || strncmp(&stream[i], "</RAW>", 6) == 0) {
          i += 6; break;
        }
        if (strncmp(&stream[i], "[/A]", 4) == 0 || strncmp(&stream[i], "</A>", 4) == 0) {
          i += 4; break;
        }
        if (stream[i] == '[' || stream[i] == '<' || stream[i] == '\n' || stream[i] == '\r') {
          break;
        }
        sendSafeChar(stream[i]);
        i++;
      }
      continue;
    }

    // 6. キー操作タグ
    if (stream[i] == '<' || stream[i] == '[') {
      if (strncmp(&stream[i], "<ENTER>", 7) == 0 || strncmp(&stream[i], "[ENTER]", 7) == 0) {
        safeWrite(KEY_RETURN); i += 7; continue;
      }
      if (strncmp(&stream[i], "<ALT_ENTER>", 11) == 0 || strncmp(&stream[i], "[ALT_ENTER]", 11) == 0) {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.modifiers = 0x04; // Alt
        rep.keys[0] = KEY_RETURN;
        _kbd.sendReport(&rep);
        delay(TYPING_INTER_REPORT_DELAY_MS);
        forceReleaseAll();
        clearAltMenuTrap();
        i += 11;
        continue;
      }
      if (strncmp(&stream[i], "<TAB>", 5) == 0 || strncmp(&stream[i], "[TAB]", 5) == 0) {
        safeWrite(KEY_TAB); i += 5; continue;
      }
      if (strncmp(&stream[i], "<BS>", 4) == 0 || strncmp(&stream[i], "[BS]", 4) == 0) {
        safeWrite(KEY_BACKSPACE); i += 4; continue;
      }
      if (strncmp(&stream[i], "<ESC>", 5) == 0 || strncmp(&stream[i], "[ESC]", 5) == 0) {
        safeWrite(KEY_ESC); i += 5; continue;
      }
    }

    // 7. 通常ASCII文字
    if ((uint8_t)stream[i] >= 0x20 && (uint8_t)stream[i] <= 0x7E) {
      sendSafeChar(stream[i]);
    } else if (stream[i] == '\n' || stream[i] == '\r') {
      safeWrite(KEY_RETURN);
    }
    i++;
  }

  forceReleaseAll();
  clearAltMenuTrap();
  if (progressCb != nullptr) {
    progressCb((int)length, (int)length);
  }
}
