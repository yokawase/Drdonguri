#include "typing_engine.h"
#include <string.h>

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

void DonguriTypingEngine::sendKatakanaF7(const char* romaji) {
  if (romaji == nullptr || romaji[0] == '\0') return;

  bool sentAny = false;
  for (size_t i = 0; romaji[i] != '\0'; i++) {
    if (romaji[i] != ' ' && (uint8_t)romaji[i] < 0x80) {
      sendSafeChar(romaji[i]);
      sentAny = true;
    }
  }
  if (!sentAny) return;
  delay(20);

  // F7キー（全角カタカナ変換）打鍵
  safeWrite(KEY_F7);
  delay(25);

  // Enterキー（確定）打鍵
  safeWrite(KEY_RETURN);
  delay(40);
  forceReleaseAll();
}

static void flushAsciiF10Segment(DonguriTypingEngine* engine, bool& hasNonSpace) {
  if (!hasNonSpace) return;
  delay(20);
  engine->safeWrite(KEY_F10);
  delay(25);
  engine->safeWrite(KEY_RETURN);
  delay(35);
  engine->forceReleaseAll();
  hasNonSpace = false;
}

void DonguriTypingEngine::sendAsciiF10(const char* ascii) {
  if (ascii == nullptr || ascii[0] == '\0') return;

  bool hasNonSpace = false;
  char prevAsciiChar = 0;
  size_t i = 0;
  while (ascii[i] != '\0') {
    uint8_t c0 = (uint8_t)ascii[i];
    // UTF-8 ギリシャ文字 (α, β, γ, δ, μ: 0xCE 0xB1..0xBC) が [A]γ-GTP[/A] 等に混入した場合の安全変換
    if (c0 == 0xCE && ascii[i + 1] != '\0') {
      uint8_t c1 = (uint8_t)ascii[i + 1];
      const char* greekRomaji = nullptr;
      if (c1 == 0xB1) greekRomaji = "aruha";
      else if (c1 == 0xB2) greekRomaji = "be-ta";
      else if (c1 == 0xB3) greekRomaji = "ganma";
      else if (c1 == 0xB4) greekRomaji = "deruta";
      else if (c1 == 0xBC) greekRomaji = "myu-";

      if (greekRomaji != nullptr) {
        flushAsciiF10Segment(this, hasNonSpace);
        prevAsciiChar = 0;
        sendGreekG(greekRomaji);
        i += 2;
        continue;
      }
    }


    if (c0 < 0x80) {
      char ch = ascii[i];
      if (ch == ' ' || ch == '\t') {
        flushAsciiF10Segment(this, hasNonSpace);
        prevAsciiChar = 0;
        sendSafeChar(ch);
        i++;
        continue;
      }

      // 括弧・カンマ・コロンは単独でF10確定してIME文節分裂を防止
      if (ch == '(' || ch == ')' || ch == '[' || ch == ']' || ch == ',') {
        flushAsciiF10Segment(this, hasNonSpace);
        sendSafeChar(ch);
        hasNonSpace = true;
        flushAsciiF10Segment(this, hasNonSpace);
        prevAsciiChar = 0;
        i++;
        continue;
      }

      // 小文字(a-z)の直後に大文字(A-Z)が来る場合 (例: mmHg, SpO2) はMS-IMEのShift文節分割を防ぐため一旦F10確定
      if ((ch >= 'A' && ch <= 'Z') && (prevAsciiChar >= 'a' && prevAsciiChar <= 'z')) {
        flushAsciiF10Segment(this, hasNonSpace);
      }

      sendSafeChar(ch);
      hasNonSpace = true;
      prevAsciiChar = ch;
    }
    i++;
  }

  flushAsciiF10Segment(this, hasNonSpace);
}

void DonguriTypingEngine::sendKanjiZ(const char* romaji) {
  if (romaji == nullptr || romaji[0] == '\0') return;

  bool sentAny = false;
  for (size_t i = 0; romaji[i] != '\0'; i++) {
    if (romaji[i] != ' ' && (uint8_t)romaji[i] < 0x80) {
      sendSafeChar(romaji[i]);
      sentAny = true;
    }
  }
  if (!sentAny) return;
  delay(20);

  // Space変換（第1候補）
  safeWrite(' ');
  delay(35);

  // Enter確定
  safeWrite(KEY_RETURN);
  delay(40);
  forceReleaseAll();
}

void DonguriTypingEngine::sendHiraganaH(const char* romaji) {
  if (romaji == nullptr || romaji[0] == '\0') return;

  bool sentAny = false;
  size_t i = 0;
  while (romaji[i] != '\0') {
    uint8_t c0 = (uint8_t)romaji[i];
    // UTF-8 3バイト句読点・長音記号 ([H]、[/H], [H]。[/H], [H]ー[/H] 等) の直接変換
    if (c0 == 0xE3 && romaji[i + 1] != '\0' && romaji[i + 2] != '\0') {
      uint8_t c1 = (uint8_t)romaji[i + 1];
      uint8_t c2 = (uint8_t)romaji[i + 2];
      if (c1 == 0x80 && c2 == 0x81) { // 「、」
        sendSafeChar(',');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0x80 && c2 == 0x82) { // 「。」
        sendSafeChar('.');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0x80 && c2 == 0x8C) { // 「「」
        sendSafeChar('[');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0x80 && c2 == 0x8D) { // 「」」
        sendSafeChar(']');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0x83 && c2 == 0xBC) { // 「ー」
        sendSafeChar('-');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0x83 && c2 == 0xBB) { // 「・」
        sendSafeChar('/');
        sentAny = true;
        i += 3;
        continue;
      }
    }

    // UTF-8 全角カンマ「，」(0xEF 0xBC 0x8C) / 全角ピリオド「．」(0xEF 0xBC 0x8E)
    if (c0 == 0xEF && romaji[i + 1] != '\0' && romaji[i + 2] != '\0') {
      uint8_t c1 = (uint8_t)romaji[i + 1];
      uint8_t c2 = (uint8_t)romaji[i + 2];
      if (c1 == 0xBC && c2 == 0x8C) { // 「，」
        sendSafeChar(',');
        sentAny = true;
        i += 3;
        continue;
      }
      if (c1 == 0xBC && c2 == 0x8E) { // 「．」
        sendSafeChar('.');
        sentAny = true;
        i += 3;
        continue;
      }
    }

    if (c0 < 0x80 && romaji[i] != ' ') {
      sendSafeChar(romaji[i]);
      sentAny = true;
    }
    i++;
  }

  if (!sentAny) return;
  delay(20);

  // Enter即時確定（Spaceキー禁止・漢字化遮断）
  safeWrite(KEY_RETURN);
  delay(40);
  forceReleaseAll();
}

void DonguriTypingEngine::sendGreekG(const char* romaji) {
  if (romaji == nullptr || romaji[0] == '\0') return;

  bool sentAny = false;
  for (size_t i = 0; romaji[i] != '\0'; i++) {
    if (romaji[i] != ' ' && (uint8_t)romaji[i] < 0x80) {
      sendSafeChar(romaji[i]);
      sentAny = true;
    }
  }
  if (!sentAny) return;
  delay(20);

  // Space 2回 ➔ Enter確定（第2候補 α/β）
  safeWrite(' ');
  delay(30);
  safeWrite(' ');
  delay(35);
  safeWrite(KEY_RETURN);
  delay(40);
  forceReleaseAll();
}

void DonguriTypingEngine::safeWrite(uint8_t key) {
  KeyReport rep;
  memset(&rep, 0, sizeof(KeyReport));
  if (key == ' ') {
    rep.keys[0] = 0x2C; // HID Usage: Spacebar (0x20 is '3' in HID!)
  } else if (key == '\n' || key == '\r') {
    rep.keys[0] = 0x28; // HID Usage: Enter
  } else if (key == '\t') {
    rep.keys[0] = 0x2B; // HID Usage: Tab
  } else if (key == '\b') {
    rep.keys[0] = 0x2A; // HID Usage: Backspace
  } else if (key >= 136) {
    // Arduino USBHIDKeyboard の特殊キー定数 (KEY_RETURN=0xB0, KEY_F7=0xC8, KEY_F10=0xCB 等) は
    // HID Usage ID に +136 (0x88) されているため減算して正規のHID Usage IDへ変換する
    rep.keys[0] = (uint8_t)(key - 136);
  } else {
    rep.keys[0] = key;
  }
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
      rep.keys[0] = 0x2B; // Tab (HID Usage 0x2B)
      break;
    case '\n':
    case '\r':
      rep.keys[0] = 0x28; // Enter (HID Usage 0x28)
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

    // 1.1 [Z]...[/Z] (漢字熟語・自立語: Space変換 ➔ Enter確定)
    if (strncmp(&stream[i], "[Z]", 3) == 0 || strncmp(&stream[i], "<Z>", 3) == 0) {
      i += 3;
      char romaji[128] = {0};
      size_t rlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/Z]", 4) == 0 || strncmp(&stream[i], "</Z>", 4) == 0) {
          i += 4;
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
        sendKanjiZ(romaji);
      }
      continue;
    }

    // 1.2 [K]...[/K] (全角カタカナ: KEY_F7 ➔ Enter確定)
    if (strncmp(&stream[i], "[K]", 3) == 0 || strncmp(&stream[i], "<K>", 3) == 0) {
      i += 3;
      char romaji[128] = {0};
      size_t rlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/K]", 4) == 0 || strncmp(&stream[i], "</K>", 4) == 0) {
          i += 4;
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

    // 1.3 [H]...[/H] (助詞・語尾・ひらがな: Enter即時確定 / Space禁止)
    if (strncmp(&stream[i], "[H]", 3) == 0 || strncmp(&stream[i], "<H>", 3) == 0) {
      i += 3;
      char romaji[128] = {0};
      size_t rlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/H]", 4) == 0 || strncmp(&stream[i], "</H>", 4) == 0) {
          i += 4;
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
        sendHiraganaH(romaji);
        // 句読点 ([H]、[/H] / [H]。[/H]) の直後に付与されたストリーム視覚区切り用スペース1文字は物理打鍵しない
        if ((strcmp(romaji, "、") == 0 || strcmp(romaji, "。") == 0) && i < length && stream[i] == ' ') {
          i++;
        }
      }
      continue;
    }

    // 1.4 [G]...[/G] (ギリシャ文字・記号: Space 2回 ➔ Enter確定)
    if (strncmp(&stream[i], "[G]", 3) == 0 || strncmp(&stream[i], "<G>", 3) == 0) {
      i += 3;
      char romaji[64] = {0};
      size_t rlen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/G]", 4) == 0 || strncmp(&stream[i], "</G>", 4) == 0) {
          i += 4;
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
        sendGreekG(romaji);
      }
      continue;
    }

    // 2. [ALT]...[/ALT] (GEMINI.md 憲章第4条: Alt+NumpadはMenu Bar Trap防止のため物理遮断・安全スキップ)
    if (strncmp(&stream[i], "[ALT]", 5) == 0 || strncmp(&stream[i], "<ALT>", 5) == 0) {
      i += 5;
      while (i < length) {
        if (strncmp(&stream[i], "[/ALT]", 6) == 0 || strncmp(&stream[i], "</ALT>", 6) == 0) {
          i += 6;
          break;
        }
        if (stream[i] == '[' || stream[i] == '<' || stream[i] == '\n' || stream[i] == '\r') {
          break;
        }
        i++;
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

    // 4. [A]...[/A] または [F10]...[/F10] (半角英数・ギリシャ記号: KEY_F10 ➔ Enter確定)
    if (strncmp(&stream[i], "[A]", 3) == 0 || strncmp(&stream[i], "<A>", 3) == 0 ||
        strncmp(&stream[i], "[F10]", 5) == 0 || strncmp(&stream[i], "<F10>", 5) == 0) {
      size_t openLen = (stream[i+1] == 'F' || stream[i+1] == 'f') ? 5 : 3;
      i += openLen;
      char ascii[128] = {0};
      size_t alen = 0;
      while (i < length) {
        if (strncmp(&stream[i], "[/A]", 4) == 0 || strncmp(&stream[i], "</A>", 4) == 0) {
          i += 4;
          break;
        }
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

    // 5. [RAW]...[/RAW] (IME変換なし直接キー送出)
    if (strncmp(&stream[i], "[RAW]", 5) == 0 || strncmp(&stream[i], "<RAW>", 5) == 0) {
      i += 5;
      while (i < length) {
        if (strncmp(&stream[i], "[/RAW]", 6) == 0 || strncmp(&stream[i], "</RAW>", 6) == 0) {
          i += 6; break;
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
        rep.modifiers = 0x04; // Left Alt
        rep.keys[0] = 0x28;   // HID Enter Usage ID
        _kbd.sendReport(&rep);
        delay(TYPING_INTER_REPORT_DELAY_MS);
        forceReleaseAll();
        clearAltMenuTrap();
        i += 11;
        continue;
      }
      if (strncmp(&stream[i], "<CTRL_ENTER>", 12) == 0 || strncmp(&stream[i], "[CTRL_ENTER]", 12) == 0) {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.modifiers = 0x01; // Left Ctrl
        rep.keys[0] = 0x28;   // HID Enter Usage ID
        _kbd.sendReport(&rep);
        delay(TYPING_INTER_REPORT_DELAY_MS);
        forceReleaseAll();
        i += 12;
        continue;
      }
      if (strncmp(&stream[i], "<TAB>", 5) == 0 || strncmp(&stream[i], "[TAB]", 5) == 0) {
        safeWrite(KEY_TAB); i += 5; continue;
      }
      if (strncmp(&stream[i], "<BS>", 4) == 0 || strncmp(&stream[i], "[BS]", 4) == 0) {
        safeWrite(KEY_BACKSPACE); i += 4; continue;
      }
      if (strncmp(&stream[i], "<DEL>", 5) == 0 || strncmp(&stream[i], "[DEL]", 5) == 0) {
        safeWrite(KEY_DELETE); i += 5; continue;
      }
      if (strncmp(&stream[i], "<LEFT>", 6) == 0 || strncmp(&stream[i], "[LEFT]", 6) == 0) {
        safeWrite(KEY_LEFT_ARROW); i += 6; continue;
      }
      if (strncmp(&stream[i], "<RIGHT>", 7) == 0 || strncmp(&stream[i], "[RIGHT]", 7) == 0) {
        safeWrite(KEY_RIGHT_ARROW); i += 7; continue;
      }
      if (strncmp(&stream[i], "<ESC>", 5) == 0 || strncmp(&stream[i], "[ESC]", 5) == 0) {
        safeWrite(KEY_ESC); i += 5; continue;
      }
    }

    // 6.5. 万が一の裸UTF-8記号フォールバック（全角カンマ・ピリオド・不等号等）
    if ((uint8_t)stream[i] == 0xEF && i + 2 < length) {
      uint8_t b1 = (uint8_t)stream[i + 1];
      uint8_t b2 = (uint8_t)stream[i + 2];
      if (b1 == 0xBC && b2 == 0x8C) { sendSafeChar(','); i += 3; continue; } // 「，」
      if (b1 == 0xBC && b2 == 0x8E) { sendSafeChar('.'); i += 3; continue; } // 「．」
      if (b1 == 0xBC && b2 == 0x9C) { sendSafeChar('<'); i += 3; continue; } // 「＜」
      if (b1 == 0xBC && b2 == 0x9E) { sendSafeChar('>'); i += 3; continue; } // 「＞」
      if (b1 == 0xBD && b2 == 0x9E) { sendSafeChar('~'); i += 3; continue; } // 「～」
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
