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
            cfg.memory_width    = 80;  // 公式推奨: 80
            cfg.memory_height   = 160; // 公式推奨: 160
            cfg.panel_width     = 80;
            cfg.panel_height    = 160;
            cfg.offset_x        = 26;  // IPSパネル水平オフセット
            cfg.offset_y        = 1;   // IPSパネル垂直オフセット
            cfg.offset_rotation = 0;   // 回転基準オフセット0 (setRotationで制御)
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

class DonguriDisplay {
private:
    LGFX_TDongleS3 lcd;
    LGFX_Sprite canvas; // 160x80 全画面ダブルバッファ
    DonguriFace currentFace;
    bool isInitialized;

    // ステータス表示のキャッシュ
    char curStatus[24];
    int curTagZ, curTagK, curTagA, curTagH;
    int curProgress;
    int curHvcScore;
    char curNotice[32];

public:
    DonguriDisplay() 
        : canvas(&lcd), 
          currentFace(FACE_IDLE), 
          isInitialized(false),
          curTagZ(0), curTagK(0), curTagA(0), curTagH(0),
          curProgress(0), curHvcScore(0) {
        strcpy(curStatus, "WAITING BLE");
        strcpy(curNotice, "Minds 111 Q");
    }

    void init() {
        lcd.init();
        lcd.setRotation(1); // 160x80 横長表示
        lcd.setBrightness(220);
        lcd.fillScreen(TFT_BLACK);

        canvas.setColorDepth(16);
        canvas.createSprite(160, 80);

        isInitialized = true;
        render();
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
        if (statusText) strncpy(curStatus, statusText, sizeof(curStatus) - 1);
        curTagZ = tagZ;
        curTagK = tagK;
        curTagA = tagA;
        curTagH = tagH;
        curProgress = progressPercent;
        curHvcScore = hvcScore;
        if (noticeText) strncpy(curNotice, noticeText, sizeof(curNotice) - 1);

        if (isInitialized) {
            render();
        }
    }

    void render() {
        if (!isInitialized) return;

        // 全面背景クリア（濃紺: 0x0863 = #0a0e17）
        canvas.fillScreen(0x0863);

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
        // (1) 上段: ステータスバッジ (Y: 4)
        uint16_t badgeColor = 0x07E0; // 緑
        if (strstr(curStatus, "TYPING")) badgeColor = 0xF800; // 赤
        else if (strstr(curStatus, "RECV") || strstr(curStatus, "PULL")) badgeColor = 0xFFE0; // 黄
        else if (strstr(curStatus, "DONE")) badgeColor = 0x07FF; // シアン
        else if (strstr(curStatus, "READY")) badgeColor = 0x07FF; // シアン

        canvas.setTextColor(badgeColor, 0x0863);
        canvas.setFont(&fonts::Font0); // 6x8
        canvas.setTextSize(1);
        canvas.drawString(curStatus, 62, 4);

        // (2) 中段: 形態素タグカウント (Y: 17, 27)
        canvas.setTextColor(0xFFE0, 0x0863); // 黄色 [Z]漢字
        canvas.drawString("[Z]:", 62, 17);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagZ, 82, 17);

        canvas.setTextColor(0x07FF, 0x0863); // 水色 [K]カナ
        canvas.drawString("[K]:", 108, 17);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagK, 128, 17);

        canvas.setTextColor(0xF81F, 0x0863); // マゼンタ [A]英数
        canvas.drawString("[A]:", 62, 27);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagA, 82, 27);

        canvas.setTextColor(0x07E0, 0x0863); // 緑 [H]助詞
        canvas.drawString("[H]:", 108, 27);
        canvas.setTextColor(0xFFFF, 0x0863);
        canvas.drawNumber(curTagH, 128, 27);

        // (3) 中下段: プログレスバー (Y: 38〜43, 幅92)
        int barW = 92;
        int barH = 5;
        int barX = 62;
        int barY = 38;
        canvas.drawRect(barX, barY, barW, barH, 0x4208); // 枠線グレー
        if (curProgress > 0) {
            int fillW = (barW - 2) * constrain(curProgress, 0, 100) / 100;
            uint16_t pColor = (curProgress >= 100) ? 0x07E0 : 0x05FF;
            canvas.fillRect(barX + 1, barY + 1, fillW, barH - 2, pColor);
        }

        // (4) 下段: HVCスコア表示 (Y: 48〜62)
        canvas.setFont(&fonts::Font2); // 8x16
        if (curHvcScore > 0) {
            uint16_t hvcColor = (curHvcScore >= 85) ? 0x07E0 : (curHvcScore >= 70 ? 0x07FF : 0xFFE0);
            canvas.setTextColor(hvcColor, 0x0863);
            canvas.drawString("HVC:", 62, 48);
            canvas.drawNumber(curHvcScore, 98, 48);
            canvas.drawString("pt", 124, 48);
        } else {
            canvas.setTextColor(0x7BEF, 0x0863);
            canvas.drawString("HVC: -- pt", 62, 48);
        }

        // (5) 最下段: CDS・Minds通知ラベル (Y: 68〜76)
        canvas.setFont(&fonts::Font0); // 6x8
        canvas.setTextColor(0x07FF, 0x0863);
        if (curNotice[0] != '\0') {
            canvas.drawString(curNotice, 62, 68);
        }

        // 4. LCDへ全画面一括転送（フリッカー完全ゼロ）
        canvas.pushSprite(0, 0);
    }
};

extern DonguriDisplay g_display;

#endif // T_DONGLE_S3
