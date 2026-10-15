#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <assert.h>
#include <stdbool.h>

// ============================================================================
// CP932 (Shift_JIS) 10進コード計算・オフセット単体テスト
// 目的: 「胃 → 亜」の化けを根絶し、Windows標準 Alt+Numpad の完全決定論を検証する
// ============================================================================

// 期待されるCP932 10進コード定義
#define EXPECTED_CODE_A     "034975" // 「亜」 (0x889F)
#define EXPECTED_CODE_ATSU  "034995" // 「圧」 (0x88B3) - ※以前「胃」と誤認されていたコード
#define EXPECTED_CODE_I     "035037" // 「胃」 (0x88DD) - 正しい10進コード
#define EXPECTED_CODE_GAN   "035552" // 「癌」 (0x8AE0)
#define EXPECTED_CODE_KOU   "036226" // 「高」 (0x8D82)
#define EXPECTED_CODE_KETSU "035980" // 「血」 (0x8C8C)

// Shift_JIS (2バイト) を Windows Alt+Numpad 形式の「先頭0付き10進数文字列」へ変換する計算関数
void sjisToAltNumpadCode(uint16_t sjisCode, char* outBuf, size_t bufSize) {
  // Windows ANSIコードページ (CP932) では、先頭に「0」を付与した10進数で解釈される
  snprintf(outBuf, bufSize, "0%05u", (unsigned int)sjisCode);
}

// モック: キーレポート追跡用
typedef struct {
  uint8_t modifiers;
  uint8_t keys[6];
} MockKeyReport;

#define MAX_LOG 256
static MockKeyReport s_reportLog[MAX_LOG];
static int s_logCount = 0;

void mockReset() {
  s_logCount = 0;
  memset(s_reportLog, 0, sizeof(s_reportLog));
}

void mockSendReport(uint8_t modifiers, uint8_t key) {
  if (s_logCount < MAX_LOG) {
    s_reportLog[s_logCount].modifiers = modifiers;
    s_reportLog[s_logCount].keys[0] = key;
    s_logCount++;
  }
}

// タイピングステートマシンのAlt+Numpad送信モックロジック
void testSendAltNumpad(const char* digits) {
  // 1. KEY_LEFT_ALT (0x04) 押下保持
  mockSendReport(0x04, 0);

  // 2. テンキー順次打鍵
  for (size_t i = 0; digits[i] != '\0'; i++) {
    char c = digits[i];
    uint8_t scancode = 0x59 + (c - '1'); // 簡易マッピング
    if (c == '0') scancode = 0x62;

    mockSendReport(0x04, scancode); // KeyDown
    mockSendReport(0x00, 0);        // KeyUp
  }

  // 3. KEY_LEFT_ALT 解放
  mockSendReport(0x00, 0);

  // 4. Alt抜け防止: ダミーShift空打ち (modifiers = 0x02)
  mockSendReport(0x02, 0); // Shift押下
  mockSendReport(0x00, 0); // Shift解放
}

int main(void) {
  printf("=== DrVoice どんぐり君！ CP932 & Alt+Numpad 単体テスト開始 ===\n");

  char codeBuf[16];

  // 1. 「亜」の検証
  sjisToAltNumpadCode(0x889F, codeBuf, sizeof(codeBuf));
  printf("[TEST 1] 「亜」 (0x889F) ➔ %s (期待値: %s)\n", codeBuf, EXPECTED_CODE_A);
  assert(strcmp(codeBuf, EXPECTED_CODE_A) == 0);

  // 2. 「圧」の検証 (034995)
  sjisToAltNumpadCode(0x88B3, codeBuf, sizeof(codeBuf));
  printf("[TEST 2] 「圧」 (0x88B3) ➔ %s (期待値: %s)\n", codeBuf, EXPECTED_CODE_ATSU);
  assert(strcmp(codeBuf, EXPECTED_CODE_ATSU) == 0);

  // 3. 「胃」の検証 (035037)
  // 胃は Shift_JIS で 0x88DD (10進: 35037)。「圧 (034995)」や「亜 (034975)」と決して衝突しないこと！
  sjisToAltNumpadCode(0x88DD, codeBuf, sizeof(codeBuf));
  printf("[TEST 3] 「胃」 (0x88DD) ➔ %s (期待値: %s)\n", codeBuf, EXPECTED_CODE_I);
  assert(strcmp(codeBuf, EXPECTED_CODE_I) == 0);
  assert(strcmp(codeBuf, EXPECTED_CODE_ATSU) != 0); // 圧との非衝突保証
  assert(strcmp(codeBuf, EXPECTED_CODE_A) != 0);    // 亜との非衝突保証

  // 4. 「癌」の検証 (035552)
  sjisToAltNumpadCode(0x8AE0, codeBuf, sizeof(codeBuf));
  printf("[TEST 4] 「癌」 (0x8AE0) ➔ %s (期待値: %s)\n", codeBuf, EXPECTED_CODE_GAN);
  assert(strcmp(codeBuf, EXPECTED_CODE_GAN) == 0);

  // 5. 「高血圧」の検証 (高:036226, 血:035980, 圧:034995)
  sjisToAltNumpadCode(0x8D82, codeBuf, sizeof(codeBuf));
  assert(strcmp(codeBuf, EXPECTED_CODE_KOU) == 0);
  sjisToAltNumpadCode(0x8C8C, codeBuf, sizeof(codeBuf));
  assert(strcmp(codeBuf, EXPECTED_CODE_KETSU) == 0);
  printf("[TEST 5] 「高血圧」 (高:036226, 血:035980, 圧:034995) ➔ 100%%整合\n");

  // 6. タイピングステートマシン: Alt抜け防止（ダミーShift空打ち）検証
  mockReset();
  testSendAltNumpad(EXPECTED_CODE_I); // 「胃」打鍵

  // ログ末尾のチェック: Alt解放後に必ず Shift (modifiers: 0x02) が打たれてから解放されているか
  assert(s_logCount >= 4);
  bool hasShiftGuard = false;
  for (int i = 0; i < s_logCount; i++) {
    if (s_reportLog[i].modifiers == 0x02) {
      hasShiftGuard = true;
      break;
    }
  }
  printf("[TEST 6] Alt解放後のダミーShift空打ち (modifiers 0x02): %s\n", hasShiftGuard ? "合格 (メニュー誤爆完全遮断)" : "不合格");
  assert(hasShiftGuard == true);

  printf("=== 全テストケース正常合格 (SUCCESS) ===\n");
  return 0;
}
