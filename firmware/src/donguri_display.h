#pragma once
#include <Arduino.h>

#if defined(T_DONGLE_S3)

#include <LovyanGFX.hpp>
#include "donguri_images.h"

// ============================================================================
// LILYGO T-Dongle-S3 ST7735S (0.96 inch IPS 160x80) LovyanGFX 構成定義
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
            cfg.spi_mode   = 0;
            cfg.freq_write = 27000000;
            cfg.freq_read  = 16000000;
            cfg.spi_3wire  = false;
            cfg.use_lock   = true;
            cfg.dma_channel = SPI_DMA_CH_AUTO;
            cfg.pin_sclk   = 5;   // TFT_SCLK
            cfg.pin_mosi   = 3;   // TFT_MOSI
            cfg.pin_miso   = -1;
            cfg.pin_dc     = 2;   // TFT_DC
            _bus_instance.config(cfg);
            _panel_instance.setBus(&_bus_instance);
        }
        {
            auto cfg = _panel_instance.config();
            cfg.pin_cs           = 4;   // TFT_CS
            cfg.pin_rst          = 1;   // TFT_RST
            cfg.pin_busy         = -1;
            cfg.memory_width     = 132;
            cfg.memory_height    = 162;
            cfg.panel_width      = 80;
            cfg.panel_height     = 160;
            cfg.offset_x         = 26;
            cfg.offset_y         = 1;
            cfg.offset_rotation  = 1;   // 横向き表示 (160x80)
            cfg.dummy_read_pixel = 8;
            cfg.dummy_read_bits  = 1;
            cfg.readable         = false;
            cfg.invert           = true;  // IPSパネル反転
            cfg.rgb_order        = false;
            cfg.dlen_16bit       = false;
            cfg.bus_shared       = false;
            _panel_instance.config(cfg);
        }
        {
            auto cfg = _light_instance.config();
            cfg.pin_bl      = 38;  // TFT_BL
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
    FACE_RECEIVING = 1,  // 受信（もぐもぐ・データ読込）
    FACE_TYPING = 2,     // 打鍵（タイピング残像・集中）
    FACE_DONE = 3        // 完了（王冠笑顔・大喜び）
};

class DonguriDisplay {
private:
    LGFX_TDongleS3 lcd;
    LGFX_Sprite rightSprite; // 右領域 (104x80) 用オフスクリーンスプライト
    DonguriFace currentFace;
    bool isInitialized;
    unsigned long lastFaceUpdateMs;

public:
    DonguriDisplay() : rightSprite(&lcd), currentFace((DonguriFace)-1), isInitialized(false), lastFaceUpdateMs(0) {}

    void init() {
        lcd.init();
        lcd.setRotation(1); // 160x80 横長
        lcd.setBrightness(180);
        lcd.fillScreen(TFT_BLACK);

        // 右領域スプライト (104 x 80, 16bitカラー)
        rightSprite.setColorDepth(16);
        rightSprite.createSprite(104, 80);

        isInitialized = true;
        showFace(FACE_IDLE);
        updateStatus("STANDBY", 0, 0, 0, 0, 0, 0, "Minds READY");
    }

    void showFace(DonguriFace face) {
        if (!isInitialized) return;
        if (currentFace == face && (millis() - lastFaceUpdateMs < 500)) return;
        currentFace = face;
        lastFaceUpdateMs = millis();

        const uint16_t* imgPtr = nullptr;
        switch (face) {
            case FACE_IDLE:      imgPtr = donguri_idle; break;
            case FACE_RECEIVING: imgPtr = donguri_receiving; break;
            case FACE_TYPING:    imgPtr = donguri_typing; break;
            case FACE_DONE:      imgPtr = donguri_done; break;
            default:             imgPtr = donguri_idle; break;
        }

        if (imgPtr != nullptr) {
            // 左領域 (X: 0〜55, Y: 0〜79) に描画
            lcd.pushImage(0, 0, DONGURI_IMG_W, DONGURI_IMG_H, imgPtr);
        }
    }

    void updateStatus(const char* statusText, 
                      int tagZ, int tagK, int tagA, int tagH, 
                      int progressPercent, int hvcScore, 
                      const char* noticeText) {
        if (!isInitialized) return;

        // スプライト背景クリア（濃紺: #0a0e17 -> RGB565: 0x0863）
        rightSprite.fillScreen(0x0863);

        // 境界縦線 (X: 0)
        rightSprite.drawFastVLine(0, 0, 80, 0x18E3);

        // 1. 上段: ステータスバッジ (Y: 2〜14)
        uint16_t badgeColor = 0x07E0; // 緑
        if (strstr(statusText, "TYPING")) badgeColor = 0xF800; // 赤
        else if (strstr(statusText, "RECV")) badgeColor = 0xFFE0; // 黄
        else if (strstr(statusText, "DONE")) badgeColor = 0x07FF; // シアン

        rightSprite.setTextColor(badgeColor, 0x0863);
        rightSprite.setFont(&fonts::Font0); // 6x8
        rightSprite.setTextSize(1);
        rightSprite.drawString(statusText, 6, 4);

        // 2. 中段: 形態素タグカウント (Y: 16〜34)
        rightSprite.setTextColor(0xFFE0, 0x0863); // 黄色 [Z]漢字
        rightSprite.drawString("[Z]:", 6, 17);
        rightSprite.setTextColor(0xFFFF, 0x0863);
        rightSprite.drawNumber(tagZ, 26, 17);

        rightSprite.setTextColor(0x07FF, 0x0863); // 水色 [K]カナ
        rightSprite.drawString("[K]:", 52, 17);
        rightSprite.setTextColor(0xFFFF, 0x0863);
        rightSprite.drawNumber(tagK, 72, 17);

        rightSprite.setTextColor(0xF81F, 0x0863); // マゼンタ [A]英数
        rightSprite.drawString("[A]:", 6, 27);
        rightSprite.setTextColor(0xFFFF, 0x0863);
        rightSprite.drawNumber(tagA, 26, 27);

        rightSprite.setTextColor(0x07E0, 0x0863); // 緑 [H]助詞
        rightSprite.drawString("[H]:", 52, 27);
        rightSprite.setTextColor(0xFFFF, 0x0863);
        rightSprite.drawNumber(tagH, 72, 27);

        // 3. 中下段: プログレスバー (Y: 38〜44, 幅92)
        int barW = 92;
        int barH = 5;
        int barX = 6;
        int barY = 38;
        rightSprite.drawRect(barX, barY, barW, barH, 0x4208); // 枠線グレー
        if (progressPercent > 0) {
            int fillW = (barW - 2) * constrain(progressPercent, 0, 100) / 100;
            uint16_t pColor = (progressPercent >= 100) ? 0x07E0 : 0x05FF;
            rightSprite.fillRect(barX + 1, barY + 1, fillW, barH - 2, pColor);
        }

        // 4. 下段: HVCスコア表示 (Y: 48〜62)
        rightSprite.setFont(&fonts::Font2); // 8x16
        if (hvcScore > 0) {
            uint16_t hvcColor = (hvcScore >= 85) ? 0x07E0 : (hvcScore >= 70 ? 0x07FF : 0xFFE0);
            rightSprite.setTextColor(hvcColor, 0x0863);
            rightSprite.drawString("HVC:", 6, 48);
            rightSprite.drawNumber(hvcScore, 42, 48);
            rightSprite.drawString("pt", 68, 48);
        } else {
            rightSprite.setTextColor(0x7BEF, 0x0863);
            rightSprite.drawString("HVC: -- pt", 6, 48);
        }

        // 5. 最下段: CDS・Minds通知ラベル (Y: 66〜76)
        rightSprite.setFont(&fonts::Font0); // 6x8
        rightSprite.setTextColor(0x07FF, 0x0863);
        if (noticeText && noticeText[0] != '\0') {
            rightSprite.drawString(noticeText, 6, 68);
        }

        // LCD 右領域 (X: 56, Y: 0) へ一括転送（フリッカーフリー）
        rightSprite.pushSprite(56, 0);
    }
};

extern DonguriDisplay g_display;

#endif // T_DONGLE_S3
