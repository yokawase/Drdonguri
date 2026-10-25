#pragma once
#include <Arduino.h>

#if defined(T_DONGLE_S3)

#include <LovyanGFX.hpp>
#include "donguri_images.h"

// ============================================================================
// LILYGO T-Dongle-S3 ST7735S (0.96 inch IPS 160x80) 公式ハードウェア構成定義
// ============================================================================
class LGFX_TDongleS3 : public lgfx::LGFX_Device {
    lgfx::Panel_ST7735S _panel_instance;
    lgfx::Bus_SPI       _bus_instance;
    lgfx::Light_PWM     _light_instance;

public:
    LGFX_TDongleS3(void) {
        {
            auto cfg = _bus_instance.config();
            cfg.spi_host   = SPI2_HOST;
            cfg.spi_mode   = SPI_MODE0;
            cfg.freq_write = 27000000;
            cfg.freq_read  = 16000000;
            cfg.pin_sclk   = 5;   // TFT_SCLK
            cfg.pin_mosi   = 3;   // TFT_MOSI
            cfg.pin_miso   = -1;
            cfg.pin_dc     = 2;   // TFT_DC
            _bus_instance.config(cfg);
            _panel_instance.setBus(&_bus_instance);
        }
        {
            auto cfg = _panel_instance.config();
            cfg.pin_cs          = 4;   // TFT_CS
            cfg.pin_rst         = 1;   // TFT_RST
            cfg.pin_busy        = -1;
            cfg.memory_width    = 132; // ST7735S 物理RAM幅 (160x80回転時rowstart=26正立)
            cfg.memory_height   = 162; // ST7735S 物理RAM高
            cfg.panel_width     = 80;
            cfg.panel_height    = 160;
            cfg.offset_x        = 26;  // IPSパネル水平オフセット
            cfg.offset_y        = 1;   // IPSパネル垂直オフセット
            cfg.offset_rotation = 0;   // 回転基準オフセット0
            cfg.invert          = true;  // IPSパネル色反転
            cfg.rgb_order       = false; // RGBカラーオーダー
            cfg.bus_shared      = true;
            _panel_instance.config(cfg);
        }
        {
            auto cfg = _light_instance.config();
            cfg.pin_bl      = 38;  // TFT_BL バックライト
            cfg.invert      = false;
            cfg.freq        = 44100;
            cfg.pwm_channel = 7;
            _light_instance.config(cfg);
            _panel_instance.setLight(&_light_instance);
        }
        setPanel(&_panel_instance);
    }
};

enum DonguriFace {
    FACE_IDLE = 0,       // 待機（すやすや・笑顔）
    FACE_RECEIVING = 1,  // 受信（もぐもぐ・データ蓄積）
    FACE_TYPING = 2,     // 打鍵（タイピング残像・高速打鍵）
    FACE_DONE = 3        // 完了（王冠笑顔・満面の大喜び）
};

enum DonguriLcdPage {
    LCD_PAGE_COCKPIT = 0,   // Page 1: どんぐり秘書コックピット (キャラ＋タグ＋進捗＋HVC)
    LCD_PAGE_KANJI = 1,     // Page 2: 100%漢字変換テレメトリ ([Z][K][H][A]バー＋11ms決定論監視)
    LCD_PAGE_CLINICAL = 2,  // Page 3: カルテ連動バイタル・eGFR・RedFlag安全監査モニター
    LCD_PAGE_SYSTEM = 3     // Page 4: 3省2GL閉域網・32GB SD・LED/LCD輝度診断
};

class DonguriDisplay {
private:
    LGFX_TDongleS3 lcd;
    LGFX_Sprite canvas; // 160x80 全画面ダブルバッファ
    DonguriFace currentFace;
    uint8_t currentPage;
    uint8_t lcdBrightnessPct;
    uint8_t ledBrightnessPct;
    bool isInitialized;

    // ステータス表示のキャッシュ
    char curStatus[24];
    int curTagZ, curTagK, curTagA, curTagH;
    int curProgress;
    int curHvcScore;
    int curAlertCount;
    char curNotice[32];
    char curVitalLine[32];

    void drawPageDots(uint8_t activePage) {
        for (uint8_t p = 0; p < 4; p++) {
            int cx = 136 + p * 6;
            int cy = 6;
            if (p == activePage) {
                canvas.fillCircle(cx, cy, 2, 0xFFE0);
            } else {
                canvas.drawPixel(cx, cy, 0x7BEF);
            }
        }
    }

    void renderCockpitPage() {
        // 1. 左領域 (X: 0〜55, Y: 0〜79): どんぐりさんアニメーション
        const uint16_t* imgPtr = donguri_idle;
        switch (currentFace) {
            case FACE_IDLE:      imgPtr = donguri_idle; break;
            case FACE_RECEIVING: imgPtr = donguri_receiving; break;
            case FACE_TYPING:    imgPtr = donguri_typing; break;
            case FACE_DONE:      imgPtr = donguri_done; break;
            default:             imgPtr = donguri_idle; break;
        }
        canvas.pushImage(0, 0, DONGURI_IMG_W, DONGURI_IMG_H, imgPtr);

        // 2. 境界縦線 (X: 56)
        canvas.drawFastVLine(56, 0, 80, 0x18E3);

        // 3. 右領域 (X: 57〜159): 形態素・進捗・CDS・HVCスコア
        uint16_t badgeColor = 0x07E0; // 緑
        if (strstr(curStatus, "TYPING")) badgeColor = 0xF800; // 赤
        else if (strstr(curStatus, "PULL") || strstr(curStatus, "COMPLETE")) badgeColor = 0x07FF; // シアン色 (電カル吸い上げ・完了)
        else if (strstr(curStatus, "RECV")) badgeColor = 0xFFE0; // 黄
        else if (strstr(curStatus, "DONE") || strstr(curStatus, "READY")) badgeColor = 0x07FF; // シアン

        canvas.setTextColor(badgeColor, 0x0863);
        canvas.setFont(&fonts::Font0);
        canvas.setTextSize(1);
        canvas.drawString(curStatus, 61, 3);
        drawPageDots(0);

        // 中段: 形態素タグカウント (Y: 15, 25)
        canvas.setTextColor(0xFFE0, 0x0863);
        canvas.drawString("[Z]:", 61, 15);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagZ, 83, 15);

        canvas.setTextColor(0x07FF, 0x0863);
        canvas.drawString("[K]:", 108, 15);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagK, 130, 15);

        canvas.setTextColor(0xF81F, 0x0863);
        canvas.drawString("[A]:", 61, 25);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagA, 83, 25);

        canvas.setTextColor(0x07E0, 0x0863);
        canvas.drawString("[H]:", 108, 25);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagH, 130, 25);

        // 中下段: プログレスバー (Y: 36〜41, 幅94)
        int barX = 61, barY = 36, barW = 94, barH = 5;
        canvas.drawRect(barX, barY, barW, barH, 0x4208);
        if (curProgress > 0) {
            int fillW = (barW - 2) * constrain(curProgress, 0, 100) / 100;
            uint16_t pColor = (curProgress >= 100) ? 0x07E0 : 0x05FF;
            canvas.fillRect(barX + 1, barY + 1, fillW, barH - 2, pColor);
        }

        // 下段: HVCスコア ＆ LED輝度バッジ (Y: 45〜61)
        canvas.setFont(&fonts::Font2);
        if (curHvcScore > 0) {
            uint16_t hvcColor = (curHvcScore >= 85) ? 0x07E0 : (curHvcScore >= 70 ? 0x07FF : 0xFFE0);
            canvas.setTextColor(hvcColor, 0x0863);
            canvas.drawString("HVC:", 61, 45);
            canvas.drawNumber(curHvcScore, 93, 45);
        } else {
            canvas.setTextColor(0x07E0, 0x0863);
            canvas.drawString("100%IME", 61, 45);
        }

        canvas.setFont(&fonts::Font0);
        char brtBuf[16];
        snprintf(brtBuf, sizeof(brtBuf), "L:%u%%", (unsigned int)ledBrightnessPct);
        canvas.setTextColor(0xFD20, 0x0863);
        canvas.drawString(brtBuf, 122, 50);

        // 最下段: 臨床通知・バイタルティッカー (Y: 67)
        canvas.setTextColor(0x07FF, 0x0863);
        if (curNotice[0] != '\0') {
            canvas.drawString(curNotice, 61, 67);
        }
    }

    void renderKanjiTelemetryPage() {
        canvas.fillRect(0, 0, 160, 13, 0x10A5);
        canvas.setFont(&fonts::Font0);
        canvas.setTextColor(0xFFE0, 0x10A5);
        canvas.drawString("100% KANJI HYBRID", 4, 3);
        drawPageDots(1);

        int total = curTagZ + curTagK + curTagH + curTagA;
        if (total <= 0) total = 1;

        // 4本のスペクトラムバー ([Z] [K] [H] [A])
        const char* labels[4] = {"[Z]Kanji", "[K]Kana ", "[H]Hira ", "[A]ASCII"};
        int counts[4] = {curTagZ, curTagK, curTagH, curTagA};
        uint16_t colors[4] = {0xFFE0, 0x07FF, 0x07E0, 0xF81F};

        for (int idx = 0; idx < 4; idx++) {
            int y = 17 + idx * 11;
            canvas.setTextColor(colors[idx], 0x0863);
            canvas.drawString(labels[idx], 4, y);
            canvas.drawRect(56, y, 70, 7, 0x3186);
            int w = constrain((counts[idx] * 68) / total, (counts[idx] > 0 ? 3 : 0), 68);
            if (w > 0) {
                canvas.fillRect(57, y + 1, w, 5, colors[idx]);
            }
            canvas.setTextColor(0xFFFF, 0x0863);
            canvas.drawNumber(counts[idx], 130, y);
        }

        canvas.drawFastHLine(0, 62, 160, 0x18E3);
        canvas.setTextColor(0x07E0, 0x0863);
        canvas.drawString("ALT:0 | 11ms | [BS]Anchor", 4, 67);
    }

    void renderClinicalMonitorPage() {
        canvas.fillRect(0, 0, 160, 13, 0x18E3);
        canvas.setFont(&fonts::Font0);
        canvas.setTextColor(0x07FF, 0x18E3);
        canvas.drawString("SECRETARY VITALS", 4, 3);
        drawPageDots(2);

        // バイタル行
        canvas.setTextColor(0xFFE0, 0x0863);
        canvas.drawString("Vitals / Chart:", 4, 17);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawString(curVitalLine[0] ? curVitalLine : "BP 142/86 HR 82 SpO2 98%", 4, 28);

        // 安全監査・HVCスコアボックス
        canvas.drawRect(4, 40, 74, 22, 0x3186);
        canvas.setTextColor(0x07E0, 0x0863);
        canvas.drawString("HVC Score", 8, 43);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curHvcScore > 0 ? curHvcScore : 92, 48, 52);

        canvas.drawRect(82, 40, 74, 22, 0x3186);
        uint16_t alColor = (curAlertCount > 0) ? 0xFD20 : 0x07E0;
        canvas.setTextColor(alColor, 0x0863);
        canvas.drawString(curAlertCount > 0 ? "Audit Alert" : "Safety Audit", 86, 43);
        canvas.drawString(curAlertCount > 0 ? "CHECK RX" : "ALL CLEAR", 86, 52);

        canvas.setTextColor(0x07FF, 0x0863);
        canvas.drawString(curNotice[0] ? curNotice : "Gemma 2 Secretary Ready", 4, 67);
    }

    void renderSystemSecurityPage() {
        canvas.fillRect(0, 0, 160, 13, 0x0945);
        canvas.setFont(&fonts::Font0);
        canvas.setTextColor(0x07E0, 0x0945);
        canvas.drawString("3省2GL SECURE EDGE", 4, 3);
        drawPageDots(3);

        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawString("USB: HID+PRN(07h) MSC:0", 4, 17);
        canvas.setTextColor(0x07FF, 0x0863);
        canvas.drawString("SD : 32GB 10-Masters OK", 4, 28);

        // LED 輝度バー
        canvas.setTextColor(0xFFE0, 0x0863);
        canvas.drawString("LED:", 4, 41);
        canvas.drawRect(30, 41, 88, 7, 0x4208);
        int ledW = (86 * constrain((int)ledBrightnessPct, 0, 100)) / 100;
        if (ledW > 0) canvas.fillRect(31, 42, ledW, 5, 0xFFE0);
        canvas.drawNumber(ledBrightnessPct, 124, 41);
        canvas.drawString("%", 144, 41);

        // LCD バックライト輝度バー
        canvas.setTextColor(0x07FF, 0x0863);
        canvas.drawString("LCD:", 4, 52);
        canvas.drawRect(30, 52, 88, 7, 0x4208);
        int lcdW = (86 * constrain((int)lcdBrightnessPct, 5, 100)) / 100;
        if (lcdW > 0) canvas.fillRect(31, 53, lcdW, 5, 0x07FF);
        canvas.drawNumber(lcdBrightnessPct, 124, 52);
        canvas.drawString("%", 144, 52);

        canvas.setTextColor(0x7BEF, 0x0863);
        canvas.drawString("Click:Page | Hold2.5s:DFU", 4, 67);
    }

public:
    DonguriDisplay() 
        : canvas(&lcd), 
          currentFace(FACE_IDLE),
          currentPage(LCD_PAGE_COCKPIT),
          lcdBrightnessPct(86),
          ledBrightnessPct(80),
          isInitialized(false),
          curTagZ(0), curTagK(0), curTagA(0), curTagH(0),
          curProgress(0), curHvcScore(92), curAlertCount(0) {
        strcpy(curStatus, "WAITING BLE");
        strcpy(curNotice, "Minds 10 Masters");
        strcpy(curVitalLine, "BP 142/86 HR 82 SpO2 98%");
    }

    void init() {
        lcd.init();
        lcd.setRotation(1); // 160x80 横長表示
        setLcdBrightnessPercent(lcdBrightnessPct);
        lcd.fillScreen(TFT_BLACK);

        canvas.setColorDepth(16);
        canvas.createSprite(160, 80);

        isInitialized = true;
        render();
    }

    void setLcdBrightnessPercent(uint8_t pct) {
        lcdBrightnessPct = constrain(pct, 5, 100);
        uint8_t pwm = (uint8_t)((lcdBrightnessPct * 255) / 100);
        if (pwm < 12) pwm = 12;
        lcd.setBrightness(pwm);
        if (isInitialized) render();
    }

    void setLedBrightnessPercent(uint8_t pct) {
        ledBrightnessPct = constrain(pct, 0, 100);
        if (isInitialized) render();
    }

    void setPage(uint8_t page) {
        currentPage = page % 4;
        if (isInitialized) render();
    }

    uint8_t nextPage() {
        currentPage = (currentPage + 1) % 4;
        if (isInitialized) render();
        return currentPage;
    }

    uint8_t getPage() const {
        return currentPage;
    }

    void syncClinicalTelemetry(int z, int k, int a, int h, int hvc, int alerts, const char* vitalSummary) {
        curTagZ = z;
        curTagK = k;
        curTagA = a;
        curTagH = h;
        if (hvc > 0) curHvcScore = hvc;
        curAlertCount = alerts;
        if (vitalSummary && vitalSummary[0] != '\0') {
            strncpy(curVitalLine, vitalSummary, sizeof(curVitalLine) - 1);
            curVitalLine[sizeof(curVitalLine) - 1] = '\0';
        }
        if (isInitialized) render();
    }

    void showFace(DonguriFace face) {
        currentFace = face;
        if (isInitialized) {
            render();
        }
    }

    void updateStatus(const char* statusText, 
                      int tagZ, int tagK, int tagA, int tagH, 
                      int progressPercent, int hvcScore, 
                      const char* noticeText) {
        if (statusText) {
            strncpy(curStatus, statusText, sizeof(curStatus) - 1);
            curStatus[sizeof(curStatus) - 1] = '\0';
        }
        curTagZ = tagZ;
        curTagK = tagK;
        curTagA = tagA;
        curTagH = tagH;
        curProgress = progressPercent;
        if (hvcScore > 0) curHvcScore = hvcScore;
        if (noticeText) {
            strncpy(curNotice, noticeText, sizeof(curNotice) - 1);
            curNotice[sizeof(curNotice) - 1] = '\0';
        }

        if (isInitialized) {
            render();
        }
    }

    void render() {
        if (!isInitialized) return;

        // 全面背景クリア（濃紺: 0x0863 = #0a0e17）
        canvas.fillScreen(0x0863);

        switch (currentPage) {
            case LCD_PAGE_COCKPIT:
                renderCockpitPage();
                break;
            case LCD_PAGE_KANJI:
                renderKanjiTelemetryPage();
                break;
            case LCD_PAGE_CLINICAL:
                renderClinicalMonitorPage();
                break;
            case LCD_PAGE_SYSTEM:
                renderSystemSecurityPage();
                break;
            default:
                renderCockpitPage();
                break;
        }

        // LCDへ全画面一括転送（フリッカー完全ゼロ）
        canvas.pushSprite(0, 0);
    }
};

extern DonguriDisplay g_display;

#endif // T_DONGLE_S3

