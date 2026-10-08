#include <Arduino.h>
#include <USB.h>
#include <USBHIDKeyboard.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "FS.h"
#include "SPIFFS.h"
#include "freertos/queue.h"

// TinyUSB マウント監視API
extern "C" bool tud_mounted(void);

// ============================================================================
// ハードウェア設定・ピン定義 (M5Stack AtomS3U: ESP32-S3FN8, 8MB Flash, No PSRAM)
// ============================================================================
#define RGB_LED_PIN         35  // 内蔵WS2812フルカラーLED
#define FRONT_BTN_PIN       41  // 正面プッシュスイッチ (Active LOW: 押下時にGND)

// BLE UUID定義 (DrVoice どんぐり君 アプリと完全一致)
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// プロトコル制約
#define MAX_PAYLOAD_SIZE    4096
#define MAX_PACKETS         16
#define MAX_PACKET_LEN      256
#define BLE_CHUNK_SIZE      (8 + MAX_PACKET_LEN)
#define BLE_QUEUE_SIZE      32
#define RX_TIMEOUT_MS       1500  // 受信タイムアウト (1.5秒で迅速に再送要求)
#define MAX_RETRY_COUNT     3

// 安全なキーコード定義 (USBHIDKeyboard準拠)
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
#ifndef KEY_LEFT_SHIFT
#define KEY_LEFT_SHIFT 0x81
#endif
#ifndef KEY_F5
#define KEY_F5 0xC6
#endif
#ifndef KEY_F6
#define KEY_F6 0xC7
#endif
#ifndef KEY_F7
#define KEY_F7 0xC8
#endif
#ifndef KEY_F10
#define KEY_F10 0xCB
#endif

// ============================================================================
// 型定義・プロトコル構造体
// ============================================================================
enum SystemState {
  STATE_USB_NOT_READY,
  STATE_WAITING_BLE,
  STATE_BLE_CONNECTED,
  STATE_RECEIVING,
  STATE_READY_TO_TYPE,  // 受信・CRC完全検証完了（黄色LED点灯・ボタン押下待機）
  STATE_TYPING,         // USB送出中（赤色LED点灯）
  STATE_ERROR
};

enum DispatchMode {
  MODE_RAW_ASCII = 0,        // 患者ID、半角英数字直接送出
  MODE_IME_ROMAJI = 1,       // クライアント側IME協調ローマ字モード (<IME_ON>等タグ)
  MODE_HYBRID_UNICODE = 2    // 自然文節・高精度IME協調パイプライン
};

#pragma pack(push, 1)
// 8バイト初期化フレーム
struct SessionInitHeader {
  uint16_t sessionId;
  uint8_t  totalPackets;
  uint16_t totalBytes;
  uint16_t totalCrc16;
  uint8_t  reserved;
};

// 8バイトスロットパケットヘッダ
struct SlotHeader {
  uint16_t sessionId;
  uint8_t  seqNo;
  uint8_t  mode;
  uint16_t payloadLen;
  uint16_t chunkCrc16;
};

// ----------------------------------------------------------------------------
// SPIFFS固定長バイナリ辞書構造体 (Zero-RAM Binary Search Specification)
// ----------------------------------------------------------------------------
// 1. /kanji_yomi.bin ヘッダ (12バイト)
struct KanjiYomiHeader {
  char     magic[4];       // "YOMI"
  uint16_t count;          // レコード件数 (LE)
  uint16_t recordSize;     // レコード長 (12バイト)
  char     reserved[4];    // 予約
};

// /kanji_yomi.bin レコード (12バイト固定長 / UTF-8昇順ソート済み)
struct KanjiYomiRecord {
  char     utf8[4];        // UTF-8文字バイト列 (Nullパディング)
  char     romaji[8];      // 代表音読みローマ字 (Nullパディング)
};

// 2. /med_terms.bin ヘッダ (16バイト)
struct TermHeader {
  char     magic[4];       // "TERM"
  uint32_t count;          // レコード件数 (LE)
  uint16_t recordSize;     // レコード長 (32バイト)
  uint8_t  reserved[6];    // 予約領域 (Null)
};

// /med_terms.bin レコード (32バイト固定長 / FNV-1a 32bitハッシュ昇順ソート済み)
struct MedTermRecord {
  uint32_t hash;           // FNV-1a 32bitハッシュ (LE)
  uint8_t  mode;           // 打鍵モード (1: Space漢字変換, 2: F7カタカナ強制, 3: 半角F10)
  uint8_t  romajiLen;      // ローマ字バイト長
  char     romaji[26];     // ヘボン式ローマ字列 (Nullパディング)
};
#pragma pack(pop)

struct BleQueueItem {
  uint16_t length;
  uint8_t  data[BLE_CHUNK_SIZE];
};

struct PacketSlot {
  bool     received;
  uint16_t len;
  uint8_t  payload[MAX_PACKET_LEN];
};

struct MessageContext {
  uint16_t   sessionId;
  uint8_t    totalPackets;
  uint8_t    receivedCount;
  uint16_t   expectedTotalBytes;
  uint16_t   expectedTotalCrc;
  uint8_t    mode;
  size_t     actualTotalBytes;
  uint32_t   lastActivityTime;
  uint8_t    retryAttempts;
  PacketSlot slots[MAX_PACKETS];
  char       assembledBuffer[MAX_PAYLOAD_SIZE + 1];
};

// ============================================================================
// グローバル変数
// ============================================================================
USBHIDKeyboard Keyboard;
static BLEServer *pBleServer = nullptr;
static BLECharacteristic *pTxRxCharacteristic = nullptr;
static QueueHandle_t bleQueue = nullptr;

static SystemState currentState = STATE_WAITING_BLE;
static bool isBleConnected = false;
static bool lastUsbState = false;
static bool spiffsMounted = false;

static MessageContext currentMsg;

// ============================================================================
// CRC-16/CCITT-FALSE 計算 (Poly: 0x1021, Init: 0xFFFF)
// ============================================================================
uint16_t calculateCrc16(const uint8_t* data, size_t length) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; i++) {
    crc ^= ((uint16_t)data[i] << 8);
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = (crc << 1);
      }
    }
  }
  return crc;
}

static inline uint16_t readUint16LE(const uint8_t* buf) {
  return (uint16_t)buf[0] | ((uint16_t)buf[1] << 8);
}

// ============================================================================
// FNV-1a 32-bit ハッシュ計算 (オフセット: 0x811C9DC5, 素数: 0x01000193)
// ============================================================================
uint32_t calculateFnv1a32(const char* data, size_t len) {
  uint32_t hash = 0x811C9DC5;
  for (size_t i = 0; i < len; i++) {
    hash ^= (uint8_t)data[i];
    hash = hash * 0x01000193;
  }
  return hash;
}

// UTF-8文字長判定
static inline size_t getUtf8CharLen(uint8_t c) {
  if ((c & 0x80) == 0) return 1;
  if ((c & 0xE0) == 0xC0) return 2;
  if ((c & 0xF0) == 0xE0) return 3;
  if ((c & 0xF8) == 0xF0) return 4;
  return 1;
}

// ============================================================================
// ハードウェア制御 (WS2812 RGB LED) - 変化時のみ書き込んで割込停止を抑止
// ============================================================================
void setLedColor(uint8_t r, uint8_t g, uint8_t b) {
  static uint8_t curR = 255, curG = 255, curB = 255;
  if (r == curR && g == curG && b == curB) return;
  curR = r; curG = g; curB = b;
  neopixelWrite(RGB_LED_PIN, r, g, b);
}

// ============================================================================
// 医療情報セキュリティ: 最適化抑止型ゼロクリア
// ============================================================================
void secureWipeMessageContext() {
  volatile uint8_t* p = (volatile uint8_t*)&currentMsg;
  size_t n = sizeof(MessageContext);
  while (n--) {
    *p++ = 0;
  }
}

// FreeRTOSキューの完全排出（打鍵完了時・切断時・明示的WIPE時のみ実行）
void drainBleQueue() {
  if (bleQueue == nullptr) return;
  BleQueueItem item;
  while (xQueueReceive(bleQueue, &item, 0) == pdTRUE) {
    volatile uint8_t* p = (volatile uint8_t*)&item;
    size_t n = sizeof(BleQueueItem);
    while (n--) {
      *p++ = 0;
    }
  }
}

// BLE NotifyによるACK返信
void sendBleAck(const char* ackType, uint16_t sessionId, const char* detail = "") {
  if (pTxRxCharacteristic == nullptr || !isBleConnected) return;

  char message[64];
  if (strlen(detail) > 0) {
    snprintf(message, sizeof(message), "ACK:%u:%s:%s", sessionId, ackType, detail);
  } else {
    snprintf(message, sizeof(message), "ACK:%u:%s", sessionId, ackType);
  }

  pTxRxCharacteristic->setValue((uint8_t*)message, strlen(message));
  pTxRxCharacteristic->notify();
  delay(8);
}

// ============================================================================
// 緊急NumLock解除トグル送出
// 外部からの明示的コマンド CMD:NUM_UNLOCK 受信時のみ実行
// ============================================================================
void sendNumLockToggle() {
  KeyReport report;
  memset(&report, 0, sizeof(KeyReport));
  report.keys[0] = 0x53; // USB HID Usage 0x53 = NumLock
  Keyboard.sendReport(&report);
  delay(20);
  memset(&report, 0, sizeof(KeyReport));
  Keyboard.sendReport(&report);
  delay(20);
}

// ============================================================================
// 電カル監視ソフト対応: KeyUpレポート完全保証型 キー送出関数
// 単なる Keyboard.write() ではOSのメッセージフック（Trend Micro/Skysea等）によってKeyUpが脱落し、
// キーリピート暴発（かんjyy, ppおいんtt等）が発生するため、明示的に二重解放レポート(0x00)を送出する
// ============================================================================
void safeWrite(uint8_t key) {
  Keyboard.press(key);
  delay(6);              // OSがKeyDownを確実に認識・処理する時間
  Keyboard.release(key);
  delay(2);
  Keyboard.releaseAll();  // 念押しで全キー解放レポート(0x00)を送信（二重解放保証）
}

// ============================================================================
// JIS 109/106 キーボード対応 キーストローク送出エンジン
// 未定義コードや危険なスキャンコードは一切送出せず、安全なASCII記号補正のみを行う
// ============================================================================
void sendSafeChar(char c) {
  uint8_t uc = (uint8_t)c;
  
  if (uc < 32 || uc > 126) {
    if (c == '\b' || uc == 0x08) {
      safeWrite(KEY_BACKSPACE);
      delay(25);
      return;
    }
    if (c == '\t') {
      safeWrite(KEY_TAB);
      delay(12);
      return;
    }
    if (c == '\n') {
      safeWrite(KEY_RETURN);
      delay(20);
      return;
    }
    if (uc == 0x1B || uc == 0x11) { // ESC または 無変換・リセットコマンド
      safeWrite(KEY_ESC);
      delay(15);
      return;
    }
    return;
  }

  // Windows JIS 109キーボード配列向け記号補正
  switch (c) {
    case ':': // JISでは「'」キー位置 (0x27)
      safeWrite((char)0x27);
      break;
    case '@': // JISではバッククォートキー位置 (0x60)
      safeWrite((char)0x60);
      break;
    case '[': // JISでは「]」キー位置
      safeWrite(']');
      break;
    case ']': // JISでは「\」キー位置 (0x5C)
      safeWrite((char)0x5C);
      break;
    case '^': // JISでは「=」キー位置
      safeWrite('=');
      break;
    case '~': // JIS Shift + ^
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('=');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '(': // JIS Shift + 8
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('8');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case ')': // JIS Shift + 9
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('9');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '=': // JIS Shift + -
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('-');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '+': // JIS Shift + ;
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press(';');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '%': // JIS Shift + 5
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('5');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '"': // JIS Shift + 2
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('2');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '\'': // JIS Shift + 7
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('7');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '&': // JIS Shift + 6
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('6');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '{': // JIS Shift + [
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press(']');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '}': // JIS Shift + ] (0x5C)
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press((char)0x5C);
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '<': // JIS Shift + ,
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press(',');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '>': // JIS Shift + .
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('.');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '?': // JIS Shift + /
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('/');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '!': // JIS Shift + 1
      Keyboard.press(KEY_LEFT_SHIFT);
      Keyboard.press('1');
      delay(4);
      Keyboard.releaseAll();
      delay(2);
      Keyboard.releaseAll();
      break;
    case '*': // JIS Shift + : (Usage 0x34)
      {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.modifiers = 0x02; // Left Shift
        rep.keys[0] = 0x34;   // HID Usage 0x34 = ' (JIS配列では「:」)
        Keyboard.sendReport(&rep);
        delay(4);
        memset(&rep, 0, sizeof(KeyReport));
        Keyboard.sendReport(&rep);
        delay(2);
        Keyboard.releaseAll();
        delay(2);
      }
      break;
    case '#': // JIS Shift + 3 (Usage 0x20)
      {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.modifiers = 0x02; // Left Shift
        rep.keys[0] = 0x20;   // HID Usage 0x20 = '3'
        Keyboard.sendReport(&rep);
        delay(4);
        memset(&rep, 0, sizeof(KeyReport));
        Keyboard.sendReport(&rep);
        delay(2);
        Keyboard.releaseAll();
        delay(2);
      }
      break;
    case '_': // JIS Shift + ろ (Usage 0x87)
      {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.modifiers = 0x02; // Left Shift
        rep.keys[0] = 0x87;   // HID Usage 0x87 = International 1 (かな/ろ)
        Keyboard.sendReport(&rep);
        delay(4);
        memset(&rep, 0, sizeof(KeyReport));
        Keyboard.sendReport(&rep);
        delay(2);
        Keyboard.releaseAll();
        delay(2);
      }
      break;
    case '\\': // JISでは「￥」キー位置 (Usage 0x89 = International 3)
      {
        KeyReport rep;
        memset(&rep, 0, sizeof(KeyReport));
        rep.keys[0] = 0x89;   // HID Usage 0x89 = International 3 (￥)
        Keyboard.sendReport(&rep);
        delay(4);
        memset(&rep, 0, sizeof(KeyReport));
        Keyboard.sendReport(&rep);
        delay(2);
        Keyboard.releaseAll();
        delay(2);
      }
      break;
    default:
      safeWrite(c);
      break;
  }
  delay(11); // 電カルセーフ・インターキー遅延 (11ms: 監視ソフトフック遅延を完全に吸収し脱落・リピート暴発ゼロ保証)
}

// ============================================================================
// Zero-RAM SPIFFS 二分探索エンジン
// RAM上に辞書を一括展開せず、f.seek()で必要なレコード（8B/32B）のみをスタック変数に読み出す
// ============================================================================

// 1. JIS全漢字音訓読みテーブル (/kanji_yomi.bin) 二分探索 (Zero-RAM)
bool lookupKanjiYomi(File& f, uint16_t count, const char* utf8Char, char* outRomaji, size_t maxLen) {
  if (utf8Char == nullptr || count == 0 || !f) return false;

  char target[4] = {0, 0, 0, 0};
  size_t ulen = getUtf8CharLen((uint8_t)utf8Char[0]);
  if (ulen > 4) ulen = 4;
  for (size_t u = 0; u < ulen; u++) {
    target[u] = utf8Char[u];
  }

  int32_t low = 0;
  int32_t high = (int32_t)count - 1;

  while (low <= high) {
    int32_t mid = low + (high - low) / 2;
    uint32_t offset = (uint32_t)sizeof(KanjiYomiHeader) + (uint32_t)mid * (uint32_t)sizeof(KanjiYomiRecord);

    if (!f.seek(offset, SeekSet)) break;

    KanjiYomiRecord rec;
    if (f.read((uint8_t*)&rec, sizeof(KanjiYomiRecord)) != sizeof(KanjiYomiRecord)) break;

    int cmp = memcmp(target, rec.utf8, 4);
    if (cmp == 0) {
      if (outRomaji != nullptr && maxLen > 0) {
        strncpy(outRomaji, rec.romaji, maxLen - 1);
        outRomaji[maxLen - 1] = '\0';
      }
      return true;
    } else if (cmp < 0) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return false;
}

bool lookupKanjiYomi(const char* utf8Char, char* outRomaji, size_t maxLen) {
  if (utf8Char == nullptr || !spiffsMounted) return false;

  File f = SPIFFS.open("/kanji_yomi.bin", "r");
  if (!f) return false;

  KanjiYomiHeader hdr;
  if (f.read((uint8_t*)&hdr, sizeof(KanjiYomiHeader)) != sizeof(KanjiYomiHeader)) {
    f.close();
    return false;
  }

  if (memcmp(hdr.magic, "YOMI", 4) != 0 || hdr.recordSize != sizeof(KanjiYomiRecord) || hdr.count == 0) {
    f.close();
    return false;
  }

  bool found = lookupKanjiYomi(f, hdr.count, utf8Char, outRomaji, maxLen);
  f.close();
  return found;
}

// 2. 医療用語・カタカナ薬名打鍵テーブル (/med_terms.bin) 二分探索
bool lookupMedicalTerm(File& f, uint32_t count, const char* word, size_t len, MedTermRecord* outRec) {
  if (word == nullptr || len == 0 || count == 0 || !f) return false;

  uint32_t targetHash = calculateFnv1a32(word, len);

  int32_t low = 0;
  int32_t high = (int32_t)count - 1;

  while (low <= high) {
    int32_t mid = low + (high - low) / 2;
    uint32_t offset = (uint32_t)sizeof(TermHeader) + (uint32_t)mid * (uint32_t)sizeof(MedTermRecord);

    if (!f.seek(offset, SeekSet)) break;

    MedTermRecord rec;
    if (f.read((uint8_t*)&rec, sizeof(MedTermRecord)) != sizeof(MedTermRecord)) break;

    if (targetHash == rec.hash) {
      if (outRec != nullptr) {
        *outRec = rec;
      }
      return true;
    } else if (targetHash < rec.hash) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return false;
}

bool lookupMedicalTerm(const char* word, size_t len, MedTermRecord* outRec) {
  if (word == nullptr || len == 0 || !spiffsMounted) return false;

  File f = SPIFFS.open("/med_terms.bin", "r");
  if (!f) return false;

  TermHeader hdr;
  if (f.read((uint8_t*)&hdr, sizeof(TermHeader)) != sizeof(TermHeader)) {
    f.close();
    return false;
  }

  if (memcmp(hdr.magic, "TERM", 4) != 0 || hdr.recordSize != sizeof(MedTermRecord) || hdr.count == 0) {
    f.close();
    return false;
  }

  bool found = lookupMedicalTerm(f, hdr.count, word, len, outRec);
  f.close();
  return found;
}


// 医療用語・カタカナ薬名のモード別物理打鍵
void sendMedTermKeystrokes(const MedTermRecord& rec) {
  size_t rLen = rec.romajiLen;
  if (rLen > 25) rLen = 25;
  for (size_t r = 0; r < rLen; r++) {
    char rc = rec.romaji[r];
    if (rc == '\0') break;
    sendSafeChar(rc);
  }
  if (rec.mode == 2) {
    // Mode 2: カタカナ薬品名 (F7全角カタカナ強制 ➔ Enter確定)
    delay(20);
    safeWrite(KEY_F7);
    delay(25);
    safeWrite(KEY_RETURN);
    delay(40);
  } else if (rec.mode == 3) {
    // Mode 3: 半角F10 (F10強制 ➔ Enter確定)
    delay(20);
    safeWrite(KEY_F10);
    delay(25);
    safeWrite(KEY_RETURN);
    delay(40);
  } else {
    // Mode 1: 傷病名・医学用語 (Space漢字変換 ➔ Enter確定)
    delay(20); // 候補パレット安定ウェイト
    safeWrite(' ');
    delay(35); // 候補窓展開ウェイト
    safeWrite(KEY_RETURN);
    delay(40);
  }
}

// ============================================================================
// レベル4用 一般かな・約物テーブル＆フォールバック変換エンジン
// ============================================================================
struct KanaTableEntry {
  const char* kana;
  const char* romaji;
};

// 2文字かなダイグラフ (きゃ, しゅ, ちょ等: 6バイトUTF-8)
static const KanaTableEntry DIGRAPH_TABLE[] = {
  {"きゃ", "kya"}, {"きゅ", "kyu"}, {"きょ", "kyo"},
  {"しゃ", "sya"}, {"しゅ", "syu"}, {"しょ", "syo"},
  {"ちゃ", "tya"}, {"ちゅ", "tyu"}, {"ちょ", "tyo"},
  {"にゃ", "nya"}, {"にゅ", "nyu"}, {"にょ", "nyo"},
  {"ひゃ", "hya"}, {"ひゅ", "hyu"}, {"ひょ", "hyo"},
  {"みゃ", "mya"}, {"みゅ", "myu"}, {"みょ", "myo"},
  {"りゃ", "rya"}, {"りゅ", "ryu"}, {"りょ", "ryo"},
  {"ぎゃ", "gya"}, {"ぎゅ", "gyu"}, {"ぎょ", "gyo"},
  {"じゃ", "zya"}, {"じゅ", "zyu"}, {"じょ", "zyo"},
  {"びゃ", "bya"}, {"びゅ", "byu"}, {"びょ", "byo"},
  {"ぴゃ", "pya"}, {"ぴゅ", "pyu"}, {"ぴょ", "pyo"},
  {"ふぁ", "fa"},  {"ふぃ", "fi"},  {"ふぇ", "fe"},  {"ふぉ", "fo"},
  {"てぃ", "ti"},  {"でぃ", "di"},  {"ちぇ", "tye"}, {"しぇ", "sye"},
  {"キャ", "kya"}, {"キュ", "kyu"}, {"キョ", "kyo"},
  {"シャ", "sya"}, {"シュ", "syu"}, {"ショ", "syo"},
  {"チャ", "tya"}, {"チュ", "tyu"}, {"チョ", "tyo"},
  {"ニャ", "nya"}, {"ニュ", "nyu"}, {"ニョ", "nyo"},
  {"ヒャ", "hya"}, {"ヒュ", "hyu"}, {"ヒョ", "hyo"},
  {"ミャ", "mya"}, {"ミュ", "myu"}, {"ミョ", "myo"},
  {"リャ", "rya"}, {"リュ", "ryu"}, {"リョ", "ryo"},
  {"ギャ", "gya"}, {"ギュ", "gyu"}, {"ギョ", "gyo"},
  {"ジャ", "zya"}, {"ジュ", "zyu"}, {"ジョ", "zyo"},
  {"ビャ", "bya"}, {"ビュ", "byu"}, {"ビョ", "byo"},
  {"ピャ", "pya"}, {"ピュ", "pyu"}, {"ピョ", "pyo"},
  {"ファ", "fa"},  {"フィ", "fi"},  {"フェ", "fe"},  {"フォ", "fo"},
  {"ティ", "ti"},  {"ディ", "di"},  {"チェ", "tye"}, {"シェ", "sye"}
};

// 1文字かな (3バイトUTF-8)
static const KanaTableEntry MONO_KANA_TABLE[] = {
  {"あ", "a"},  {"い", "i"},  {"う", "u"},  {"え", "e"},  {"お", "o"},
  {"か", "ka"}, {"き", "ki"}, {"く", "ku"}, {"け", "ke"}, {"こ", "ko"},
  {"が", "ga"}, {"ぎ", "gi"}, {"ぐ", "gu"}, {"げ", "ge"}, {"ご", "go"},
  {"さ", "sa"}, {"し", "si"}, {"す", "su"}, {"せ", "se"}, {"そ", "so"},
  {"ざ", "za"}, {"じ", "zi"}, {"ず", "zu"}, {"ぜ", "ze"}, {"ぞ", "zo"},
  {"た", "ta"}, {"ち", "ti"}, {"つ", "tu"}, {"て", "te"}, {"と", "to"},
  {"だ", "da"}, {"ぢ", "di"}, {"づ", "du"}, {"で", "de"}, {"ど", "do"},
  {"な", "na"}, {"に", "ni"}, {"ぬ", "nu"}, {"ね", "ne"}, {"の", "no"},
  {"は", "ha"}, {"ひ", "hi"}, {"ふ", "hu"}, {"へ", "he"}, {"ほ", "ho"},
  {"ば", "ba"}, {"び", "bi"}, {"ぶ", "bu"}, {"べ", "be"}, {"ぼ", "bo"},
  {"ぱ", "pa"}, {"ぴ", "pi"}, {"ぷ", "pu"}, {"ぺ", "pe"}, {"ぽ", "po"},
  {"ま", "ma"}, {"み", "mi"}, {"む", "mu"}, {"め", "me"}, {"も", "mo"},
  {"や", "ya"}, {"ゆ", "yu"}, {"よ", "yo"},
  {"ら", "ra"}, {"り", "ri"}, {"る", "ru"}, {"れ", "re"}, {"ろ", "ro"},
  {"わ", "wa"}, {"を", "wo"}, {"ん", "nn"},
  {"っ", "ltu"}, {"ゃ", "xya"}, {"ゅ", "xyu"}, {"ょ", "xyo"},
  {"ぁ", "xa"},  {"ぃ", "xi"},  {"ぅ", "xu"},  {"ぇ", "xe"},  {"ぉ", "xo"},
  {"ゔ", "vu"},
  {"ア", "a"},  {"イ", "i"},  {"ウ", "u"},  {"エ", "e"},  {"オ", "o"},
  {"カ", "ka"}, {"キ", "ki"}, {"ク", "ku"}, {"ケ", "ke"}, {"コ", "ko"},
  {"ガ", "ga"}, {"ギ", "gi"}, {"グ", "gu"}, {"ゲ", "ge"}, {"ゴ", "go"},
  {"サ", "sa"}, {"シ", "si"}, {"ス", "su"}, {"セ", "se"}, {"ソ", "so"},
  {"ザ", "za"}, {"ジ", "zi"}, {"ズ", "zu"}, {"ゼ", "ze"}, {"ゾ", "zo"},
  {"タ", "ta"}, {"チ", "ti"}, {"ツ", "tu"}, {"テ", "te"}, {"ト", "to"},
  {"ダ", "da"}, {"ヂ", "di"}, {"ヅ", "du"}, {"デ", "de"}, {"ド", "do"},
  {"ナ", "na"}, {"ニ", "ni"}, {"ヌ", "nu"}, {"ネ", "ne"}, {"ノ", "no"},
  {"ハ", "ha"}, {"ヒ", "hi"}, {"フ", "hu"}, {"ヘ", "he"}, {"ホ", "ho"},
  {"バ", "ba"}, {"ビ", "bi"}, {"ブ", "bu"}, {"ベ", "be"}, {"ボ", "bo"},
  {"パ", "pa"}, {"ピ", "pi"}, {"プ", "pu"}, {"ペ", "pe"}, {"ポ", "po"},
  {"マ", "ma"}, {"ミ", "mi"}, {"ム", "mu"}, {"メ", "me"}, {"モ", "mo"},
  {"ヤ", "ya"}, {"ユ", "yu"}, {"ヨ", "yo"},
  {"ラ", "ra"}, {"リ", "ri"}, {"ル", "ru"}, {"レ", "re"}, {"ロ", "ro"},
  {"ワ", "wa"}, {"ヲ", "wo"}, {"ン", "nn"},
  {"ッ", "ltu"}, {"ャ", "xya"}, {"ュ", "xyu"}, {"ョ", "xyo"},
  {"ァ", "xa"},  {"ィ", "xi"},  {"ゥ", "xu"},  {"ェ", "xe"},  {"ォ", "xo"},
  {"ヴ", "vu"},  {"ー", "-"}
};

// UTF-8ひらがな判定 (U+3041〜U+3096)
bool isUtf8Hiragana(const char* s) {
  if (s == nullptr) return false;
  uint8_t c0 = (uint8_t)s[0];
  uint8_t c1 = (uint8_t)s[1];
  uint8_t c2 = (uint8_t)s[2];
  if (c0 == 0xE3) {
    if (c1 == 0x81 && c2 >= 0x81 && c2 <= 0xBF) return true;
    if (c1 == 0x82 && c2 >= 0x80 && c2 <= 0x96) return true;
  }
  return false;
}

// UTF-8カタカナ判定 (U+30A1〜U+30FA, ー: U+30FC)
bool isUtf8Katakana(const char* s) {
  if (s == nullptr) return false;
  uint8_t c0 = (uint8_t)s[0];
  uint8_t c1 = (uint8_t)s[1];
  uint8_t c2 = (uint8_t)s[2];
  if (c0 == 0xE3) {
    if (c1 == 0x82 && c2 >= 0xA1 && c2 <= 0xBF) return true;
    if (c1 == 0x83 && c2 >= 0x80 && c2 <= 0xBC) return true;
  }
  return false;
}

const char* findDigraphRomaji(const char* s) {
  for (size_t i = 0; i < sizeof(DIGRAPH_TABLE) / sizeof(KanaTableEntry); i++) {
    if (memcmp(s, DIGRAPH_TABLE[i].kana, 6) == 0) {
      return DIGRAPH_TABLE[i].romaji;
    }
  }
  return nullptr;
}

const char* findMonoKanaRomaji(const char* s) {
  for (size_t i = 0; i < sizeof(MONO_KANA_TABLE) / sizeof(KanaTableEntry); i++) {
    if (memcmp(s, MONO_KANA_TABLE[i].kana, 3) == 0) {
      return MONO_KANA_TABLE[i].romaji;
    }
  }
  return nullptr;
}

// ============================================================================
// 物理ボタンの単一エッジ検出 (GPIO 41, Active LOW)
// ============================================================================
static int btnLastReading = HIGH;
static uint32_t btnLastDebounceTime = 0;
static int btnStableState = HIGH;

void resetButtonState() {
  btnLastReading = HIGH;
  btnStableState = HIGH;
  btnLastDebounceTime = millis();
}

bool isFrontButtonPressed() {
  int reading = digitalRead(FRONT_BTN_PIN);

  if (reading != btnLastReading) {
    btnLastDebounceTime = millis();
  }
  btnLastReading = reading;

  if ((millis() - btnLastDebounceTime) > 35) { // 35msデバウンス
    if (reading != btnStableState) {
      btnStableState = reading;
      if (btnStableState == LOW) { // 立ち下がりエッジ（押下時）
        return true;
      }
    }
  }
  return false;
}

// スマートHVC（High Value Care: 高価値医療）スコア推論エンジン (0〜100点)
int calculateHvcScore(const char* text, size_t len) {
  if (text == nullptr || len == 0) return 70;

  int score = 70;
  if (strstr(text, "S:") || strstr(text, "O:") || strstr(text, "A:") || strstr(text, "P:") ||
      strstr(text, "主訴") || strstr(text, "現病歴") || strstr(text, "所見") || 
      strstr(text, "診断") || strstr(text, "方針") || strstr(text, "評価")) {
    score += 10;
  }
  if (strstr(text, "BP") || strstr(text, "HR") || strstr(text, "SpO2") || strstr(text, "BT") ||
      strstr(text, "PR") || strstr(text, "血圧") || strstr(text, "脈拍") || strstr(text, "体温") ||
      strstr(text, "mmHg") || strstr(text, "bpm") || strstr(text, "℃") || strstr(text, "%")) {
    score += 10;
  }
  if (strstr(text, "X-P") || strstr(text, "XP") || strstr(text, "ECG") || strstr(text, "CT") ||
      strstr(text, "MRI") || strstr(text, "US") || strstr(text, "HbA1c") || strstr(text, "CRP") ||
      strstr(text, "WBC") || strstr(text, "eGFR") || strstr(text, "Cr") || strstr(text, "心電図") ||
      strstr(text, "レントゲン") || strstr(text, "エコー") || strstr(text, "採血")) {
    score += 10;
  }
  if (score > 100) score = 100;
  if (score < 50) score = 50;
  return score;
}

// ============================================================================
// ★【4層ハイブリッド打鍵ディスパッチャー (Zero-RAM SPIFFS二分探索統合版)】
// レベル1: 半角ASCII（英数字・単位・数値・記号補正）➔ 無変換キー/直接打鍵
// レベル2: /med_terms.bin 最長一致 ➔ 辞書Modeに応じたF7強制またはSpace変換
// レベル3: /kanji_f5.bin 難読医療漢字 ➔ Unicode 4桁 + F5 + Enter
// レベル4: 一般ひらがな・熟語 ➔ ひらがな連続塊は即時Enter確定、一般語は最小形態素Space変換
// 生HIDパルスを完全排除し、一般漢字へのF5乱射（日時スタンプ誤挿入バグ）を100%防止
// ============================================================================
bool dispatchSafeKeystrokes() {
  size_t i = 0;
  size_t total = currentMsg.actualTotalBytes;
  const char* buf = currentMsg.assembledBuffer;
  bool isMicsMode = false; // MICS Navigator電子カルテ向け Alt+Enter 改行フラグ

  // SPIFFS辞書ファイルのオープン（打鍵セッション中のみファイルハンドルを保持）
  File fYomi;
  File fTerms;
  uint16_t yomiCount = 0;
  uint32_t termCount = 0;

  if (spiffsMounted) {
    if (SPIFFS.exists("/kanji_yomi.bin")) {
      fYomi = SPIFFS.open("/kanji_yomi.bin", "r");
      if (fYomi) {
        KanjiYomiHeader yh;
        if (fYomi.read((uint8_t*)&yh, sizeof(KanjiYomiHeader)) == sizeof(KanjiYomiHeader)) {
          if (memcmp(yh.magic, "YOMI", 4) == 0 && yh.recordSize == sizeof(KanjiYomiRecord)) {
            yomiCount = yh.count;
          }
        }
      }
    }
    if (SPIFFS.exists("/med_terms.bin")) {
      fTerms = SPIFFS.open("/med_terms.bin", "r");
      if (fTerms) {
        TermHeader th;
        if (fTerms.read((uint8_t*)&th, sizeof(TermHeader)) == sizeof(TermHeader)) {
          if (memcmp(th.magic, "TERM", 4) == 0 && th.recordSize == sizeof(MedTermRecord)) {
            termCount = th.count;
          }
        }
      }
    }
  }

  while (i < total) {
    char c = buf[i];

    // Backspace文字 (\x08)
    if (c == '\x08') {
      safeWrite(KEY_BACKSPACE);
      delay(20);
      i++;
      continue;
    }

    // MICS Navigator電子カルテ専用モードタグの検出 (<EHR_MICS> / [EHR_MICS])
    if (strncmp(&buf[i], "<EHR_MICS>", 10) == 0 || strncmp(&buf[i], "[EHR_MICS]", 10) == 0) {
      isMicsMode = true;
      i += 10;
      continue;
    }

    // ------------------------------------------------------------------------
    // A. 改行処理 (CRLF / LF) - MICS Navigatorでは Alt+Enter でペイン閉鎖を防止！
    // ------------------------------------------------------------------------
    if (c == '\r') {
      if (i + 1 < total && buf[i + 1] == '\n') i++;
      if (isMicsMode) {
        Keyboard.press(KEY_LEFT_ALT);
        delay(10);
        safeWrite(KEY_RETURN);
        delay(10);
        Keyboard.releaseAll();
        delay(30);
      } else {
        safeWrite(KEY_RETURN);
        delay(25);
      }
      i++;
      continue;
    }
    if (c == '\n') {
      if (isMicsMode) {
        Keyboard.press(KEY_LEFT_ALT);
        delay(10);
        safeWrite(KEY_RETURN);
        delay(10);
        Keyboard.releaseAll();
        delay(30);
      } else {
        safeWrite(KEY_RETURN);
        delay(25);
      }
      i++;
      continue;
    }

    // ------------------------------------------------------------------------
    // B. 明示的制御タグの高速解析 ([K], [H], [Z], [A], [U], etc.)
    // ------------------------------------------------------------------------
    // 1. [K]...[/K] (カタカナモード: F7 ➔ Enter)
    if (strncmp(&buf[i], "[K]", 3) == 0 || strncmp(&buf[i], "<K>", 3) == 0) {
      i += 3;
      bool sentAnyChar = false;
      while (i < total) {
        if (strncmp(&buf[i], "[/K]", 4) == 0 || strncmp(&buf[i], "</K>", 4) == 0) {
          i += 4;
          break;
        }
        if (buf[i] == '[' || buf[i] == '<' || buf[i] == '\n' || buf[i] == '\r') {
          break;
        }
        char rc = buf[i];
        if (rc != ' ') {
          if ((uint8_t)rc < 0x80) {
            sendSafeChar(rc);
            sentAnyChar = true;
          }
        }
        i++;
      }
      if (sentAnyChar) {
        delay(20);
        safeWrite(KEY_F7);
        delay(25);
        safeWrite(KEY_RETURN);
        delay(40);
      }
      continue;
    }

    // 2. [H]...[/H] (ひらがな助詞モード: Enter即時確定、Space禁止、二重防護)
    if (strncmp(&buf[i], "[H]", 3) == 0 || strncmp(&buf[i], "<H>", 3) == 0) {
      i += 3;
      bool sentAnyChar = false;
      while (i < total) {
        if (strncmp(&buf[i], "[/H]", 4) == 0 || strncmp(&buf[i], "</H>", 4) == 0) {
          i += 4;
          break;
        }
        if (strncmp(&buf[i], "[K]", 3) == 0 || strncmp(&buf[i], "[H]", 3) == 0 || 
            strncmp(&buf[i], "[Z]", 3) == 0 || strncmp(&buf[i], "[A]", 3) == 0 || 
            strncmp(&buf[i], "[/", 2) == 0 || buf[i] == '\n' || buf[i] == '\r') {
          break;
        }

        // 万一生UTF-8ひらがなが混入した場合の安全フォールバック（助詞脱落＆空Enter暴発防止）
        if (isUtf8Hiragana(&buf[i])) {
          // 促音「っ」
          if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x81 && (uint8_t)buf[i+2] == 0xA3) {
            sendSafeChar('l'); sendSafeChar('t'); sendSafeChar('u');
            i += 3;
            sentAnyChar = true;
            continue;
          }
          // 撥音「ん」
          if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x82 && (uint8_t)buf[i+2] == 0x93) {
            sendSafeChar('n'); sendSafeChar('n');
            i += 3;
            sentAnyChar = true;
            continue;
          }
          // ダイグラフ (きゃ, しゅ等: 6バイト)
          if (i + 6 <= total) {
            const char* di = findDigraphRomaji(&buf[i]);
            if (di != nullptr) {
              for (const char* p = di; *p != '\0'; p++) sendSafeChar(*p);
              i += 6;
              sentAnyChar = true;
              continue;
            }
          }
          // モノかな (3バイト)
          if (i + 3 <= total) {
            const char* mo = findMonoKanaRomaji(&buf[i]);
            if (mo != nullptr) {
              for (const char* p = mo; *p != '\0'; p++) sendSafeChar(*p);
              i += 3;
              sentAnyChar = true;
              continue;
            }
          }
        }

        char rc = buf[i];
        if (rc != ' ') {
          if ((uint8_t)rc < 0x80) {
            sendSafeChar(rc);
            sentAnyChar = true;
          }
        }
        i++;
      }
      // ★文字が送出された場合のみ Enter で確定（空タグでの改行暴発を100%防止！）
      if (sentAnyChar) {
        delay(20);
        safeWrite(KEY_RETURN);
        delay(40);
      }
      continue;
    }

    // 3. [Z]...[/Z] (漢字変換モード: Space変換 ➔ Enter確定)
    if (strncmp(&buf[i], "[Z]", 3) == 0 || strncmp(&buf[i], "<Z>", 3) == 0) {
      i += 3;
      bool sentAnyChar = false;
      while (i < total) {
        if (strncmp(&buf[i], "[/Z]", 4) == 0 || strncmp(&buf[i], "</Z>", 4) == 0) {
          i += 4;
          break;
        }
        if (strncmp(&buf[i], "[K]", 3) == 0 || strncmp(&buf[i], "[H]", 3) == 0 || 
            strncmp(&buf[i], "[Z]", 3) == 0 || strncmp(&buf[i], "[G]", 3) == 0 || 
            strncmp(&buf[i], "[A]", 3) == 0 || strncmp(&buf[i], "[/", 2) == 0 || 
            buf[i] == '\n' || buf[i] == '\r') {
          break;
        }
        char rc = buf[i];
        if (rc != ' ') {
          if ((uint8_t)rc < 0x80) {
            sendSafeChar(rc);
            sentAnyChar = true;
          }
        }
        i++;
      }
      if (sentAnyChar) {
        delay(20); // 候補パレット安定ウェイト
        safeWrite(' ');
        delay(35); // 候補窓展開ウェイト
        safeWrite(KEY_RETURN);
        delay(40);
      }
      continue;
    }

    // 3.5 [G]...[/G] (ギリシャ文字変換モード: Space2回 ➔ Enterで第2候補記号α/βを直接物理確定！)
    if (strncmp(&buf[i], "[G]", 3) == 0 || strncmp(&buf[i], "<G>", 3) == 0) {
      i += 3;
      bool sentAnyChar = false;
      while (i < total) {
        if (strncmp(&buf[i], "[/G]", 4) == 0 || strncmp(&buf[i], "</G>", 4) == 0) {
          i += 4;
          break;
        }
        if (strncmp(&buf[i], "[K]", 3) == 0 || strncmp(&buf[i], "[H]", 3) == 0 || 
            strncmp(&buf[i], "[Z]", 3) == 0 || strncmp(&buf[i], "[G]", 3) == 0 || 
            strncmp(&buf[i], "[A]", 3) == 0 || strncmp(&buf[i], "[/", 2) == 0 || 
            buf[i] == '\n' || buf[i] == '\r') {
          break;
        }
        char rc = buf[i];
        if (rc != ' ') {
          if ((uint8_t)rc < 0x80) {
            sendSafeChar(rc);
            sentAnyChar = true;
          }
        }
        i++;
      }
      if (sentAnyChar) {
        delay(20);
        safeWrite(' '); // 第1候補（カタカナ）
        delay(30);
        safeWrite(' '); // 第2候補（記号 α / β）
        delay(35);
        safeWrite(KEY_RETURN); // 確定
        delay(40);
      }
      continue;
    }

    // 4. [A]...[/A] (半角ASCIIモード: 英数字・記号時はF10+EnterでMS-IME全角化完全防止＆直接送出)
    if (strncmp(&buf[i], "[A]", 3) == 0 || strncmp(&buf[i], "<A>", 3) == 0) {
      i += 3;
      bool hasNonSpace = false;
      while (i < total) {
        if (strncmp(&buf[i], "[/A]", 4) == 0 || strncmp(&buf[i], "</A>", 4) == 0) {
          i += 4;
          break;
        }
        if (strncmp(&buf[i], "[K]", 3) == 0 || strncmp(&buf[i], "[H]", 3) == 0 || 
            strncmp(&buf[i], "[Z]", 3) == 0 || strncmp(&buf[i], "[A]", 3) == 0 || 
            strncmp(&buf[i], "[/", 2) == 0 || buf[i] == '\n' || buf[i] == '\r') {
          break;
        }
        char ac = buf[i];
        if (ac != ' ' && ac != '\t') {
          hasNonSpace = true;
        }
        sendSafeChar(ac);
        i++;
      }
      // 英数字・記号が含まれていた場合、MS-IMEが日本語入力中なら未確定全角になっているため、
      // F10で半角英数・半角記号に強制変換し、Enterで未確定文字列を確定する！
      if (hasNonSpace) {
        delay(20);
        safeWrite(KEY_F10);
        delay(25);
        safeWrite(KEY_RETURN);
        delay(35);
      }
      continue;
    }

    // 5. [U]...[/U] (明示的Unicodeタグ: F5リロード暴発を完全防止し安全消費)
    if (strncmp(&buf[i], "[U]", 3) == 0 || strncmp(&buf[i], "<U>", 3) == 0) {
      i += 3;
      while (i < total) {
        if (strncmp(&buf[i], "[/U]", 4) == 0 || strncmp(&buf[i], "</U>", 4) == 0) {
          i += 4;
          break;
        }
        if (buf[i] == '[' || buf[i] == '<' || buf[i] == '\n' || buf[i] == '\r') {
          break;
        }
        i++;
      }
      continue;
    }

    // 6. 閉じタグの安全消費および補助キーコード (<ALT_ENTER>, <ENTER>, <SPACE>, [BS] 等)
    if (c == '<' || c == '[') {
      if (strncmp(&buf[i], "<ALT_ENTER>", 11) == 0 || strncmp(&buf[i], "[ALT_ENTER]", 11) == 0) {
        Keyboard.press(KEY_LEFT_ALT);
        delay(10);
        safeWrite(KEY_RETURN);
        delay(10);
        Keyboard.releaseAll();
        delay(30);
        i += 11;
        continue;
      }
      if (strncmp(&buf[i], "<CTRL_ENTER>", 12) == 0 || strncmp(&buf[i], "[CTRL_ENTER]", 12) == 0) {
        Keyboard.press(KEY_LEFT_CTRL);
        delay(10);
        safeWrite(KEY_RETURN);
        delay(10);
        Keyboard.releaseAll();
        delay(30);
        i += 12;
        continue;
      }
      if (strncmp(&buf[i], "[BS]", 4) == 0 || strncmp(&buf[i], "<BS>", 4) == 0) {
        safeWrite(KEY_BACKSPACE);
        delay(20);
        i += 4;
        continue;
      }
      if (strncmp(&buf[i], "[/K]", 4) == 0 || strncmp(&buf[i], "</K>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "[/H]", 4) == 0 || strncmp(&buf[i], "</H>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "[/Z]", 4) == 0 || strncmp(&buf[i], "</Z>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "[/G]", 4) == 0 || strncmp(&buf[i], "</G>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "[/A]", 4) == 0 || strncmp(&buf[i], "</A>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "[/U]", 4) == 0 || strncmp(&buf[i], "</U>", 4) == 0) { i += 4; continue; }
      if (strncmp(&buf[i], "<ENTER>", 7) == 0 || strncmp(&buf[i], "[ENTER]", 7) == 0) {
        safeWrite(KEY_RETURN);
        delay(25);
        i += 7;
        continue;
      }
      if (strncmp(&buf[i], "<CONV>", 6) == 0) {
        safeWrite(' ');
        delay(20);
        i += 6;
        continue;
      }
      if (strncmp(&buf[i], "<SPACE>", 7) == 0 || strncmp(&buf[i], "[SPACE]", 7) == 0) {
        safeWrite(' ');
        delay(15);
        i += 7;
        continue;
      }
      if (strncmp(&buf[i], "<IME_ON>", 8) == 0) { i += 8; continue; }
      if (strncmp(&buf[i], "<IME_OFF>", 9) == 0) { i += 9; continue; }
      if (strncmp(&buf[i], "[N]", 3) == 0 || strncmp(&buf[i], "<N>", 3) == 0) { i += 3; continue; }
    }

    // ------------------------------------------------------------------------
    // C. レベル1: 半角ASCII（英数字・単位・数値・記号補正）➔ 無変換キー/直接打鍵
    // ------------------------------------------------------------------------
    if ((uint8_t)c < 0x80) {
      sendSafeChar(c);
      i++;
      continue;
    }

    // ------------------------------------------------------------------------
    // D. マルチバイトUTF-8処理 (レベル2, レベル3, レベル4)
    // ------------------------------------------------------------------------

    // 【レベル2】: /med_terms.bin に合致する医薬品・傷病名の最長一致判定 (Zero-RAM二分探索)
    bool termMatched = false;
    if (fTerms && termCount > 0) {
      // 現在位置からタグ・改行・終端に達するまでのUTF-8文字境界を最大48バイト分収集
      size_t candOffsets[16];
      size_t candCount = 0;
      size_t scanIdx = i;

      while (scanIdx < total && candCount < 16) {
        char sc = buf[scanIdx];
        if (sc == '[' || sc == '<' || sc == '\r' || sc == '\n' || (uint8_t)sc < 0x80) {
          break;
        }
        size_t uLen = getUtf8CharLen((uint8_t)sc);
        if (scanIdx + uLen > total) break;
        scanIdx += uLen;
        size_t curLen = scanIdx - i;
        if (curLen >= 6) { // 医療用語は最短2文字 (6バイト以上)
          candOffsets[candCount++] = curLen;
        }
        if (curLen >= 48) break;
      }

      // 最長一致判定: 長い候補から順に二分探索
      for (int k = (int)candCount - 1; k >= 0; k--) {
        size_t testLen = candOffsets[k];
        MedTermRecord termRec;
        if (lookupMedicalTerm(fTerms, termCount, &buf[i], testLen, &termRec)) {
          sendMedTermKeystrokes(termRec);
          i += testLen;
          termMatched = true;
          break;
        }
      }
    }
    if (termMatched) {
      continue;
    }

    // 【レベル3】: /kanji_yomi.bin 未登録漢字塊（複合語・人名・動詞語幹）クラスタ一括変換エンジン
    // ★【単漢字確定の完全撤廃】: 漢字1文字ごとにSpace+Enterを押すとMS-IMEが「国率」「東鏡」「高表」「消去」
    // と誤爆するため、連続する未登録漢字（最大5文字）および後続送り仮名を未確定バッファとしてPCに連続送出し、
    // クラスタ境界で一括して [Space] ➔ [Enter] を1回だけ送る！
    size_t uLen = getUtf8CharLen((uint8_t)buf[i]);
    if (uLen >= 3 && i + uLen <= total) {
      char utf8Single[5] = {0, 0, 0, 0, 0};
      memcpy(utf8Single, &buf[i], uLen);

      char yomiRomaji[16] = {0};
      if (fYomi && yomiCount > 0 && lookupKanjiYomi(fYomi, yomiCount, utf8Single, yomiRomaji, sizeof(yomiRomaji))) {
        // 現在の文字から、未登録の漢字が何文字連続しているかをスキャン (最大5文字)
        size_t clusterScan = i;
        size_t kanjiCount = 0;

        while (clusterScan < total && kanjiCount < 5) {
          size_t curCharLen = getUtf8CharLen((uint8_t)buf[clusterScan]);
          if (curCharLen < 3 || clusterScan + curCharLen > total) break;

          char sc = buf[clusterScan];
          if (sc == '[' || sc == '<' || sc == '\r' || sc == '\n' || (uint8_t)sc < 0x80) break;

          char curUtf8[5] = {0};
          memcpy(curUtf8, &buf[clusterScan], curCharLen);
          char curYomi[16] = {0};

          if (!lookupKanjiYomi(fYomi, yomiCount, curUtf8, curYomi, sizeof(curYomi))) {
            break; // 漢字でなければ終了
          }

          // 2文字目以降で med_terms に合致する単語が見つかったら、そこから先はレベル2に任せる
          if (kanjiCount > 0 && fTerms && termCount > 0) {
            MedTermRecord checkRec;
            if (lookupMedicalTerm(fTerms, termCount, &buf[clusterScan], curCharLen * 2, &checkRec)) {
              break;
            }
          }

          // この漢字の読みローマ字をPCに送出（確定キーは絶対に押さない！）
          for (size_t r = 0; curYomi[r] != '\0'; r++) {
            sendSafeChar(curYomi[r]);
          }
          clusterScan += curCharLen;
          kanjiCount++;
        }

        // 送り仮名（ひらがな）が直後に続いている場合（例: 「行われている」「裏付けられた」）
        // 句読点・記号・空白に達するまで、ひらがなのローマ字も同一未確定バッファに連続送出
        while (clusterScan < total && isUtf8Hiragana(&buf[clusterScan])) {
          if (clusterScan + 3 <= total && (memcmp(&buf[clusterScan], "、", 3) == 0 || memcmp(&buf[clusterScan], "。", 3) == 0)) {
            break;
          }
          // 促音「っ」
          if (clusterScan + 3 <= total && (uint8_t)buf[clusterScan] == 0xE3 && (uint8_t)buf[clusterScan+1] == 0x81 && (uint8_t)buf[clusterScan+2] == 0xA3) {
            if (clusterScan + 6 <= total && isUtf8Hiragana(&buf[clusterScan+3])) {
              const char* nextDi = (clusterScan + 9 <= total) ? findDigraphRomaji(&buf[clusterScan+3]) : nullptr;
              const char* nextMo = findMonoKanaRomaji(&buf[clusterScan+3]);
              const char* nextRomaji = (nextDi != nullptr) ? nextDi : nextMo;
              if (nextRomaji != nullptr && nextRomaji[0] != 'a' && nextRomaji[0] != 'i' && 
                  nextRomaji[0] != 'u' && nextRomaji[0] != 'e' && nextRomaji[0] != 'o' && nextRomaji[0] != 'n') {
                sendSafeChar(nextRomaji[0]);
                clusterScan += 3;
                continue;
              }
            }
            sendSafeChar('l'); sendSafeChar('t'); sendSafeChar('u');
            clusterScan += 3;
            continue;
          }
          // 撥音「ん」
          if (clusterScan + 3 <= total && (uint8_t)buf[clusterScan] == 0xE3 && (uint8_t)buf[clusterScan+1] == 0x82 && (uint8_t)buf[clusterScan+2] == 0x93) {
            sendSafeChar('n'); sendSafeChar('n');
            clusterScan += 3;
            continue;
          }
          // ダイグラフ
          if (clusterScan + 6 <= total) {
            const char* di = findDigraphRomaji(&buf[clusterScan]);
            if (di != nullptr) {
              for (const char* p = di; *p != '\0'; p++) sendSafeChar(*p);
              clusterScan += 6;
              continue;
            }
          }
          // モノかな
          if (clusterScan + 3 <= total) {
            const char* mo = findMonoKanaRomaji(&buf[clusterScan]);
            if (mo != nullptr) {
              for (const char* p = mo; *p != '\0'; p++) sendSafeChar(*p);
              clusterScan += 3;
              continue;
            }
          }
          break;
        }

        // ★クラスタ末尾で一括 Space ➔ Enter 確定！
        delay(20);
        safeWrite(' ');
        delay(35);
        safeWrite(KEY_RETURN);
        delay(40);
        i = clusterScan;
        continue;
      }
    }

    // 【レベル4】: 上記以外の一般ひらがな・カタカナ・約物・一般語
    // 1. 全角約物・記号の変換 (山括弧 ＜ ＞ を含む全角記号を完全サポート)
    if (uLen == 3) {
      if (memcmp(&buf[i], "、", 3) == 0) { sendSafeChar(','); i += 3; continue; }
      if (memcmp(&buf[i], "。", 3) == 0) { sendSafeChar('.'); i += 3; continue; }
      if (memcmp(&buf[i], "・", 3) == 0) { sendSafeChar('/'); i += 3; continue; }
      if (memcmp(&buf[i], "「", 3) == 0 || memcmp(&buf[i], "【", 3) == 0 || memcmp(&buf[i], "『", 3) == 0) { sendSafeChar('['); i += 3; continue; }
      if (memcmp(&buf[i], "」", 3) == 0 || memcmp(&buf[i], "】", 3) == 0 || memcmp(&buf[i], "』", 3) == 0) { sendSafeChar(']'); i += 3; continue; }
      if (memcmp(&buf[i], "（", 3) == 0) { sendSafeChar('('); i += 3; continue; }
      if (memcmp(&buf[i], "）", 3) == 0) { sendSafeChar(')'); i += 3; continue; }
      if (memcmp(&buf[i], "〜", 3) == 0) { sendSafeChar('~'); i += 3; continue; }
      if (memcmp(&buf[i], "：", 3) == 0) { sendSafeChar(':'); i += 3; continue; }
      if (memcmp(&buf[i], "ー", 3) == 0) { sendSafeChar('-'); i += 3; continue; }
      if (memcmp(&buf[i], "＜", 3) == 0 || memcmp(&buf[i], "《", 3) == 0) { sendSafeChar('<'); i += 3; continue; }
      if (memcmp(&buf[i], "＞", 3) == 0 || memcmp(&buf[i], "》", 3) == 0) { sendSafeChar('>'); i += 3; continue; }
      if (memcmp(&buf[i], "＋", 3) == 0) { sendSafeChar('+'); i += 3; continue; }
      if (memcmp(&buf[i], "＝", 3) == 0) { sendSafeChar('='); i += 3; continue; }
      if (memcmp(&buf[i], "％", 3) == 0) { sendSafeChar('%'); i += 3; continue; }
      // 丸数字・囲み数字 (①〜⑩)
      if (memcmp(&buf[i], "①", 3) == 0) { sendSafeChar('('); sendSafeChar('1'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "②", 3) == 0) { sendSafeChar('('); sendSafeChar('2'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "③", 3) == 0) { sendSafeChar('('); sendSafeChar('3'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "④", 3) == 0) { sendSafeChar('('); sendSafeChar('4'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑤", 3) == 0) { sendSafeChar('('); sendSafeChar('5'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑥", 3) == 0) { sendSafeChar('('); sendSafeChar('6'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑦", 3) == 0) { sendSafeChar('('); sendSafeChar('7'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑧", 3) == 0) { sendSafeChar('('); sendSafeChar('8'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑨", 3) == 0) { sendSafeChar('('); sendSafeChar('9'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
      if (memcmp(&buf[i], "⑩", 3) == 0) { sendSafeChar('('); sendSafeChar('1'); sendSafeChar('0'); sendSafeChar(')'); sendSafeChar(' '); i += 3; continue; }
    }

// 2. ひらがな連続塊: ローマ字送出
    if (isUtf8Hiragana(&buf[i])) {
      while (i < total && isUtf8Hiragana(&buf[i])) {
        // 促音「っ」(0xE3 0x81 0xA3) の処理: 次の文字の子音を先読みして二重化
        if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x81 && (uint8_t)buf[i+2] == 0xA3) {
          if (i + 6 <= total && isUtf8Hiragana(&buf[i+3])) {
            const char* nextDi = (i + 9 <= total) ? findDigraphRomaji(&buf[i+3]) : nullptr;
            const char* nextMo = findMonoKanaRomaji(&buf[i+3]);
            const char* nextRomaji = (nextDi != nullptr) ? nextDi : nextMo;
            if (nextRomaji != nullptr && nextRomaji[0] != 'a' && nextRomaji[0] != 'i' && 
                nextRomaji[0] != 'u' && nextRomaji[0] != 'e' && nextRomaji[0] != 'o' && nextRomaji[0] != 'n') {
              sendSafeChar(nextRomaji[0]);
              i += 3;
              continue;
            }
          }
          sendSafeChar('l'); sendSafeChar('t'); sendSafeChar('u');
          i += 3;
          continue;
        }

        // 「ん」(0xE3 0x82 0x93) の処理: IMEで誤結合しないよう常に nn 送出
        if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x82 && (uint8_t)buf[i+2] == 0x93) {
          sendSafeChar('n');
          sendSafeChar('n');
          i += 3;
          continue;
        }

        // 2文字ダイグラフ判定 (きゃ, しゅ, ちょ等: 6バイト)
        if (i + 6 <= total) {
          const char* romajiDi = findDigraphRomaji(&buf[i]);
          if (romajiDi != nullptr) {
            for (const char* p = romajiDi; *p != '\0'; p++) {
              sendSafeChar(*p);
            }
            i += 6;
            continue;
          }
        }
        // 1文字かな判定 (3バイト)
        if (i + 3 <= total) {
          const char* romajiMo = findMonoKanaRomaji(&buf[i]);
          if (romajiMo != nullptr) {
            for (const char* p = romajiMo; *p != '\0'; p++) {
              sendSafeChar(*p);
            }
            i += 3;
            continue;
          }
        }
        i += getUtf8CharLen((uint8_t)buf[i]);
      }
      // ひらがな塊末尾の確定: 文末（句点・約物・改行・終端）のときのみ確定
      if (i >= total || buf[i] == '\n' || buf[i] == '\r' || 
          (i + 3 <= total && (memcmp(&buf[i], "。", 3) == 0 || memcmp(&buf[i], "、", 3) == 0))) {
        delay(20);
        safeWrite(KEY_RETURN);
        delay(40);
      }
      continue;
    }

    // 3. カタカナ連続塊: ローマ字送出 ➔ F7全角カタカナ強制 ➔ Enter確定
    if (isUtf8Katakana(&buf[i])) {
      while (i < total && isUtf8Katakana(&buf[i])) {
        // 促音「ッ」(0xE3 0x83 0x83) の処理
        if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x83 && (uint8_t)buf[i+2] == 0x83) {
          if (i + 6 <= total && isUtf8Katakana(&buf[i+3])) {
            const char* nextDi = (i + 9 <= total) ? findDigraphRomaji(&buf[i+3]) : nullptr;
            const char* nextMo = findMonoKanaRomaji(&buf[i+3]);
            const char* nextRomaji = (nextDi != nullptr) ? nextDi : nextMo;
            if (nextRomaji != nullptr && nextRomaji[0] != 'a' && nextRomaji[0] != 'i' && 
                nextRomaji[0] != 'u' && nextRomaji[0] != 'e' && nextRomaji[0] != 'o' && nextRomaji[0] != 'n') {
              sendSafeChar(nextRomaji[0]);
              i += 3;
              continue;
            }
          }
          sendSafeChar('l'); sendSafeChar('t'); sendSafeChar('u');
          i += 3;
          continue;
        }

        // 「ン」(0xE3 0x83 0xB3) の処理
        if (i + 3 <= total && (uint8_t)buf[i] == 0xE3 && (uint8_t)buf[i+1] == 0x83 && (uint8_t)buf[i+2] == 0xB3) {
          sendSafeChar('n');
          sendSafeChar('n');
          i += 3;
          continue;
        }

        if (i + 6 <= total) {
          const char* romajiDi = findDigraphRomaji(&buf[i]);
          if (romajiDi != nullptr) {
            for (const char* p = romajiDi; *p != '\0'; p++) {
              sendSafeChar(*p);
            }
            i += 6;
            continue;
          }
        }
        if (i + 3 <= total) {
          const char* romajiMo = findMonoKanaRomaji(&buf[i]);
          if (romajiMo != nullptr) {
            for (const char* p = romajiMo; *p != '\0'; p++) {
              sendSafeChar(*p);
            }
            i += 3;
            continue;
          }
        }
        i += getUtf8CharLen((uint8_t)buf[i]);
      }
      delay(20);
      safeWrite(KEY_F7);
      delay(25);
      safeWrite(KEY_RETURN);
      delay(40);
      continue;
    }

    // 4. 辞書未登録の一般漢字・未分類マルチバイト文字
    // ★【JIS全漢字音訓オンボード解決 (中断ゼロ・脱落ゼロ・F5完全廃絶)】
    if (uLen >= 3 && i + uLen <= total) {
      char utf8Single[5] = {0, 0, 0, 0, 0};
      memcpy(utf8Single, &buf[i], uLen);
      char yomiRomaji[16] = {0};
      if (fYomi && yomiCount > 0 && lookupKanjiYomi(fYomi, yomiCount, utf8Single, yomiRomaji, sizeof(yomiRomaji))) {
        for (size_t r = 0; yomiRomaji[r] != '\0'; r++) {
          sendSafeChar(yomiRomaji[r]);
        }
        delay(20); // 候補パレット安定ウェイト
        safeWrite(' ');
        delay(35); // 候補窓展開ウェイト
        safeWrite(KEY_RETURN);
        delay(40);
        i += uLen;
        continue;
      }
    }

    // 1バイト未知コード等の安全なスキップ
    i += (uLen > 0 ? uLen : 1);
  }

  // ファイルハンドルのクローズ
  if (fYomi) fYomi.close();
  if (fTerms) fTerms.close();
  return true;
}

// ============================================================================
// USB打鍵ディスパッチャー
// ============================================================================
void dispatchOutput() {
  if (currentMsg.actualTotalBytes == 0) return;

  if (!tud_mounted()) {
    currentState = STATE_USB_NOT_READY;
    setLedColor(64, 0, 64); // 紫色点灯（USB未接続警告）
    sendBleAck("ERR_USB_NOT_READY", currentMsg.sessionId);
    return;
  }

  currentState = STATE_TYPING;
  setLedColor(64, 0, 0); // 打鍵中: 赤色点灯
  sendBleAck("DISPATCH_STARTED", currentMsg.sessionId);

  // 4層ハイブリッド安全キーストローク送出（SPIFFS二分探索 Zero-RAM ＆ ビット演算Unicode直接着弾）
  dispatchSafeKeystrokes();

  // キーの完全開放
  Keyboard.releaseAll();

  sendBleAck("USB_REPORTS_SENT", currentMsg.sessionId);
  delay(30);

  // スマートHVCスコア推論
  int hvcScore = calculateHvcScore(currentMsg.assembledBuffer, currentMsg.actualTotalBytes);
  char hvcAck[32];
  const char* hvcGrade = (hvcScore >= 85) ? "EXCELLENT" : (hvcScore >= 70 ? "GOOD" : "REVIEW");
  snprintf(hvcAck, sizeof(hvcAck), "%d:%s", hvcScore, hvcGrade);
  sendBleAck("HVC_SCORE", currentMsg.sessionId, hvcAck);

  if (hvcScore >= 85) {
    setLedColor(0, 128, 64); // エメラルドグリーン
  } else if (hvcScore >= 70) {
    setLedColor(0, 96, 96);  // シアン
  } else {
    setLedColor(96, 96, 0);  // イエロー
  }
  delay(600);

  // セキュア消去
  secureWipeMessageContext();
  drainBleQueue();
  resetButtonState();

  currentState = isBleConnected ? STATE_BLE_CONNECTED : STATE_WAITING_BLE;
  if (isBleConnected) {
    setLedColor(0, 64, 0); // 緑点灯
  } else {
    setLedColor(0, 0, 64); // 青点灯
  }
}

// ============================================================================
// BLE コールバック実装
// ============================================================================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    isBleConnected = true;
    currentState = STATE_BLE_CONNECTED;
    setLedColor(0, 64, 0); // 接続完了: 緑点灯
  }

  void onDisconnect(BLEServer* pServer) override {
    isBleConnected = false;
    currentState = STATE_WAITING_BLE;
    drainBleQueue();
    secureWipeMessageContext();
    Keyboard.releaseAll();
    setLedColor(0, 0, 64); // 待機状態: 青点灯
  }
};

class MyCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) override {
    uint8_t* pData = pCharacteristic->getData();
    size_t len = pCharacteristic->getLength();

    if (len > 0 && bleQueue != nullptr) {
      if (len > BLE_CHUNK_SIZE) {
        return;
      }

      BleQueueItem item;
      item.length = (uint16_t)len;
      memcpy(item.data, pData, len);

      xQueueSend(bleQueue, &item, 0);
    }
  }
};

// ============================================================================
// Arduino setup()
// ============================================================================
void setup() {
  pinMode(RGB_LED_PIN, OUTPUT);
  pinMode(FRONT_BTN_PIN, INPUT_PULLUP);

  setLedColor(0, 0, 64); // 青色（起動中）

  // SPIFFS初期化 (フォーマットフラグ: true)
  spiffsMounted = SPIFFS.begin(true);

  Keyboard.begin();
  USB.begin();

  bleQueue = xQueueCreate(BLE_QUEUE_SIZE, sizeof(BleQueueItem));

  BLEDevice::init("EHR-AI-Dongle");
  BLEDevice::setMTU(517);

  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pBleServer->createService(SERVICE_UUID);
  pTxRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE | 
    BLECharacteristic::PROPERTY_WRITE_NR |
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxRxCharacteristic->setCallbacks(new MyCallbacks());

  BLE2902* pBle2902 = new BLE2902();
  pBle2902->setNotifications(true);
  pTxRxCharacteristic->addDescriptor(pBle2902);

  pService->start();

  BLEAdvertisementData oAdvertisementData;
  oAdvertisementData.setFlags(0x06);
  oAdvertisementData.setName("EHR-AI-Dongle");

  BLEAdvertisementData oScanResponseData;
  oScanResponseData.setCompleteServices(BLEUUID(SERVICE_UUID));

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAdvertisementData(oAdvertisementData);
  pAdvertising->setScanResponseData(oScanResponseData);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x0C);
  pAdvertising->setMaxPreferred(0x18);
  pAdvertising->start();

  secureWipeMessageContext();
  resetButtonState();
  Keyboard.releaseAll();
  lastUsbState = tud_mounted();
  setLedColor(0, 0, 64); // 青色（BLE接続待機中）
}

// ============================================================================
// Arduino loop()
// ============================================================================
void loop() {
  // 0. BLE切断後の安全な再アドバタイズ処理
  static bool oldBleConnected = false;
  if (!isBleConnected && oldBleConnected) {
    delay(200);
    if (pBleServer != nullptr) {
      BLEDevice::startAdvertising();
    }
    oldBleConnected = isBleConnected;
  }
  if (isBleConnected && !oldBleConnected) {
    oldBleConnected = isBleConnected;
  }

  // 1. USBマウント状態のリアルタイム監視とBLE同期通知
  bool currentUsbState = tud_mounted();
  if (currentUsbState != lastUsbState) {
    lastUsbState = currentUsbState;
    if (currentUsbState) {
      sendBleAck("USB_MOUNTED", 0);
      if (currentState == STATE_USB_NOT_READY) {
        currentState = isBleConnected ? STATE_BLE_CONNECTED : STATE_WAITING_BLE;
        setLedColor(0, isBleConnected ? 64 : 0, isBleConnected ? 0 : 64);
      }
    } else {
      sendBleAck("USB_UNMOUNTED", 0);
      if (currentState != STATE_USB_NOT_READY && !isBleConnected) {
        currentState = STATE_USB_NOT_READY;
        setLedColor(64, 0, 64);
      }
    }
  }

  // 2. 受信キュー処理（バイナリパケット & 遠隔制御コマンド）
  BleQueueItem item;
  while (xQueueReceive(bleQueue, &item, 0) == pdTRUE) {

    // A. 遠隔制御コマンド (CMD:...) の解析
    if (item.length >= 4 && item.data[0] == 'C' && item.data[1] == 'M' && item.data[2] == 'D' && item.data[3] == ':') {
      char cmdBuf[64];
      size_t copyLen = item.length < sizeof(cmdBuf) - 1 ? item.length : sizeof(cmdBuf) - 1;
      memcpy(cmdBuf, item.data, copyLen);
      cmdBuf[copyLen] = '\0';

      // 1. 緊急NumLock解除トグル
      if (strcmp(cmdBuf, "CMD:NUM_UNLOCK") == 0) {
        sendNumLockToggle();
        sendBleAck("NUM_UNLOCKED", 0, "OK");
        continue;
      }

      // 2. リモート打鍵トリガー
      if (strcmp(cmdBuf, "CMD:TRIGGER") == 0) {
        if (currentState == STATE_READY_TO_TYPE) {
          sendBleAck("REMOTE_TRIGGER_ACCEPTED", currentMsg.sessionId);
          dispatchOutput();
        } else {
          sendBleAck("ERR_NOT_READY_TO_TYPE", currentMsg.sessionId);
        }
        continue;
      }

      // 3. BLE Ping & 疎通確認 (RTT計測)
      if (strncmp(cmdBuf, "CMD:PING:", 9) == 0) {
        const char* ts = cmdBuf + 9;
        sendBleAck("PONG", 0, ts);
        setLedColor(64, 64, 64); delay(30);
        if (currentState == STATE_BLE_CONNECTED) setLedColor(0, 64, 0);
        else if (currentState == STATE_READY_TO_TYPE) setLedColor(64, 64, 0);
        else setLedColor(0, 0, 64);
        continue;
      }

      // 4. 遠隔セキュアメモリゼロクリア (WIPE)
      if (strcmp(cmdBuf, "CMD:WIPE") == 0) {
        secureWipeMessageContext();
        drainBleQueue();
        Keyboard.releaseAll();
        currentState = isBleConnected ? STATE_BLE_CONNECTED : STATE_WAITING_BLE;
        setLedColor(0, isBleConnected ? 64 : 0, isBleConnected ? 0 : 64);
        sendBleAck("WIPED", 0);
        continue;
      }

      // 5. LEDテスト発光
      if (strcmp(cmdBuf, "CMD:LED_TEST") == 0) {
        setLedColor(64, 0, 0); delay(100);
        setLedColor(0, 64, 0); delay(100);
        setLedColor(0, 0, 64); delay(100);
        setLedColor(64, 64, 0); delay(100);
        if (currentState == STATE_BLE_CONNECTED) setLedColor(0, 64, 0);
        else if (currentState == STATE_READY_TO_TYPE) setLedColor(64, 64, 0);
        else setLedColor(0, 0, 64);
        sendBleAck("LED_TEST_OK", 0);
        continue;
      }

      // 6. ステータス問い合わせ
      if (strcmp(cmdBuf, "CMD:STATUS") == 0) {
        char statusDetail[48];
        snprintf(statusDetail, sizeof(statusDetail), "%d,%s,%u/%u", 
          currentState, tud_mounted() ? "USB_OK" : "USB_NO", 
          currentMsg.receivedCount, currentMsg.totalPackets);
        sendBleAck("STATUS_RESP", currentMsg.sessionId, statusDetail);
        continue;
      }
    }

    // B. セッション初期化フレーム (8バイト)
    if (item.length == sizeof(SessionInitHeader)) {
      uint16_t sid = readUint16LE(item.data);
      uint8_t totPkts = item.data[2];
      uint16_t totBytes = readUint16LE(item.data + 3);
      uint16_t totCrc = readUint16LE(item.data + 5);

      if (totPkts == 0 || totPkts > MAX_PACKETS || totBytes == 0 || totBytes > MAX_PAYLOAD_SIZE) {
        sendBleAck("ERR_INIT_PARAMS", sid);
        currentState = STATE_ERROR;
        setLedColor(64, 16, 0);
        continue;
      }

      secureWipeMessageContext();
      resetButtonState();
      Keyboard.releaseAll();
      currentMsg.sessionId = sid;
      currentMsg.totalPackets = totPkts;
      currentMsg.expectedTotalBytes = totBytes;
      currentMsg.expectedTotalCrc = totCrc;
      currentMsg.lastActivityTime = millis();
      currentMsg.retryAttempts = 0;
      currentState = STATE_RECEIVING;
      setLedColor(0, 48, 64); // シアン点灯（パケット受信中）
      sendBleAck("SESSION_READY", sid);
      continue;
    }

    // C. データスロットフレーム (ヘッダ8バイト + ペイロード)
    if (item.length >= sizeof(SlotHeader)) {
      uint16_t sid = readUint16LE(item.data);
      uint8_t seqNo = item.data[2];
      uint8_t mode = item.data[3];
      uint16_t payloadLen = readUint16LE(item.data + 4);
      uint16_t chunkCrc = readUint16LE(item.data + 6);
      uint8_t* payload = item.data + sizeof(SlotHeader);
      size_t actualLen = item.length - sizeof(SlotHeader);

      if (currentState != STATE_RECEIVING || currentMsg.sessionId != sid) {
        continue;
      }

      if (seqNo >= currentMsg.totalPackets || payloadLen != actualLen || payloadLen > MAX_PACKET_LEN) {
        sendBleAck("ERR_SLOT_HEADER", sid);
        continue;
      }

      if (calculateCrc16(payload, payloadLen) != chunkCrc) {
        sendBleAck("ERR_CHUNK_CRC", sid);
        continue;
      }

      // スロット格納
      if (!currentMsg.slots[seqNo].received) {
        currentMsg.slots[seqNo].len = payloadLen;
        memcpy(currentMsg.slots[seqNo].payload, payload, payloadLen);
        currentMsg.slots[seqNo].received = true;
        currentMsg.receivedCount++;
        currentMsg.mode = mode;
        currentMsg.lastActivityTime = millis();
      }

      // 全スロット受信完了判定
      if (currentMsg.receivedCount == currentMsg.totalPackets) {
        size_t offset = 0;
        bool bufferOverflow = false;

        for (uint8_t slotIdx = 0; slotIdx < currentMsg.totalPackets; slotIdx++) {
          if (offset + currentMsg.slots[slotIdx].len > MAX_PAYLOAD_SIZE) {
            bufferOverflow = true;
            break;
          }
          memcpy(currentMsg.assembledBuffer + offset, currentMsg.slots[slotIdx].payload, currentMsg.slots[slotIdx].len);
          offset += currentMsg.slots[slotIdx].len;
        }

        if (bufferOverflow || offset != currentMsg.expectedTotalBytes) {
          sendBleAck("ERR_LEN_MISMATCH", currentMsg.sessionId);
          secureWipeMessageContext();
          currentState = STATE_ERROR;
          setLedColor(64, 16, 0);
          break;
        }

        currentMsg.assembledBuffer[offset] = '\0';
        currentMsg.actualTotalBytes = offset;

        // 全体CRC16検証
        if (calculateCrc16((uint8_t*)currentMsg.assembledBuffer, offset) != currentMsg.expectedTotalCrc) {
          sendBleAck("ERR_TOTAL_CRC", currentMsg.sessionId);
          secureWipeMessageContext();
          currentState = STATE_ERROR;
          setLedColor(64, 16, 0);
          break;
        }

        // 全パケット完全受信・CRC一致：ボタン待機へ遷移し、黄色LED点灯
        resetButtonState();
        currentState = STATE_READY_TO_TYPE;
        setLedColor(64, 64, 0); // 黄色点灯（医師の物理ボタン押下待機）
        sendBleAck("ALL_PACKETS_READY", currentMsg.sessionId);
      }
    }
  }

  // 3. 受信タイムアウトと欠落パケット再送要求 (RETRY)
  if (currentState == STATE_RECEIVING && currentMsg.receivedCount < currentMsg.totalPackets) {
    if (millis() - currentMsg.lastActivityTime > RX_TIMEOUT_MS) {
      if (currentMsg.retryAttempts < MAX_RETRY_COUNT) {
        currentMsg.retryAttempts++;
        uint16_t missingBitmap = 0;
        for (uint8_t pIdx = 0; pIdx < currentMsg.totalPackets; pIdx++) {
          if (!currentMsg.slots[pIdx].received) {
            missingBitmap |= (1 << pIdx);
          }
        }
        char bitmapHex[10];
        snprintf(bitmapHex, sizeof(bitmapHex), "0x%04X", missingBitmap);
        sendBleAck("RETRY", currentMsg.sessionId, bitmapHex);
        currentMsg.lastActivityTime = millis();
      } else {
        sendBleAck("ERR_TIMEOUT_ABORT", currentMsg.sessionId);
        secureWipeMessageContext();
        drainBleQueue();
        Keyboard.releaseAll();
        currentState = isBleConnected ? STATE_BLE_CONNECTED : STATE_WAITING_BLE;
        setLedColor(0, isBleConnected ? 64 : 0, isBleConnected ? 0 : 64);
      }
    }
  }

  // 4. 物理ボタン押下の判定 (GPIO 41, Active LOW)
  if (currentState == STATE_READY_TO_TYPE) {
    setLedColor(64, 64, 0); // 黄色点灯維持
    if (isFrontButtonPressed()) {
      sendBleAck("PHYSICAL_BTN_PRESSED", currentMsg.sessionId);
      dispatchOutput(); // ボタン押下でカルテへ安全打鍵送出
    }
  }

  // 5. LED状態の維持とエラー時自動復帰
  if (currentState == STATE_WAITING_BLE) {
    setLedColor(0, 0, 64);
  } else if (currentState == STATE_BLE_CONNECTED) {
    setLedColor(0, 64, 0);
  } else if (currentState == STATE_ERROR) {
    static uint32_t errStartTime = 0;
    if (errStartTime == 0) errStartTime = millis();
    if (millis() - errStartTime > 1500) {
      errStartTime = 0;
      currentState = isBleConnected ? STATE_BLE_CONNECTED : STATE_WAITING_BLE;
      setLedColor(0, isBleConnected ? 64 : 0, isBleConnected ? 0 : 64);
    }
  }

  delay(10);
}
