#include <Arduino.h>
#include "FS.h"
#include "SD_MMC.h"

// T-Dongle-S3 TF/SDMMC ピンアサイン
#define SD_CLK 12
#define SD_CMD 16
#define SD_D0  14
#define SD_D1  17
#define SD_D2  21
#define SD_D3  18

// T-Dongle-S3 APA102 RGB LED
#define APA102_DI 40
#define APA102_CI 39

static void apa102_write_byte(uint8_t b) {
    for (int i = 7; i >= 0; i--) {
        digitalWrite(APA102_DI, (b >> i) & 1);
        digitalWrite(APA102_CI, HIGH);
        digitalWrite(APA102_CI, LOW);
    }
}

static void setLed(uint8_t r, uint8_t g, uint8_t b, uint8_t brightness = 31) {
    for (int i = 0; i < 4; i++) apa102_write_byte(0x00);
    apa102_write_byte(0xE0 | (brightness & 0x1F));
    apa102_write_byte(b);
    apa102_write_byte(g);
    apa102_write_byte(r);
    for (int i = 0; i < 4; i++) apa102_write_byte(0xFF);
}

bool initSD() {
    // まず 1-bit モードで確実なマウントを試みる
    SD_MMC.setPins(SD_CLK, SD_CMD, SD_D0);
    if (SD_MMC.begin("/sdcard", true)) {
        Serial.println("[SD] Mounted in 1-bit mode successfully");
        return true;
    }
    
    // 1-bit で失敗した場合は 4-bit モードを試みる
    SD_MMC.setPins(SD_CLK, SD_CMD, SD_D0, SD_D1, SD_D2, SD_D3);
    if (SD_MMC.begin("/sdcard", false)) {
        Serial.println("[SD] Mounted in 4-bit mode successfully");
        return true;
    }

    return false;
}

void setup() {
    pinMode(APA102_DI, OUTPUT);
    pinMode(APA102_CI, OUTPUT);
    digitalWrite(APA102_DI, LOW);
    digitalWrite(APA102_CI, LOW);
    setLed(0, 0, 64); // 青色（起動中）

    Serial.begin(115200);
    delay(1000);

    Serial.println("\n--- T-Dongle-S3 SD Card Flasher v1.0 ---");

    if (!initSD()) {
        Serial.println("[ERROR] SD_MOUNT_FAILED");
        setLed(64, 0, 0); // 赤色（エラー）
        return;
    }

    uint8_t cardType = SD_MMC.cardType();
    Serial.printf("[SD] Card Type: %d\n", cardType);
    uint64_t cardSize = SD_MMC.cardSize() / (1024 * 1024);
    uint64_t totalBytes = SD_MMC.totalBytes() / (1024 * 1024);
    uint64_t usedBytes = SD_MMC.usedBytes() / (1024 * 1024);
    Serial.printf("[SD] Size: %llu MB (Total: %llu MB, Used: %llu MB)\n", cardSize, totalBytes, usedBytes);

    setLed(0, 64, 0); // 緑色（マウント成功）
    Serial.println("[SD_FLASHER_READY]");
}

void loop() {
    if (!Serial.available()) {
        delay(10);
        return;
    }

    String line = Serial.readStringUntil('\n');
    line.trim();

    if (line.startsWith("PING")) {
        Serial.println("PONG");
    } else if (line.startsWith("MKDIR ")) {
        String dir = line.substring(6);
        if (!dir.startsWith("/")) dir = "/" + dir;
        SD_MMC.mkdir(dir.c_str());
        Serial.println("OK");
    } else if (line.startsWith("SIZE ")) {
        String path = line.substring(5);
        if (!path.startsWith("/")) path = "/" + path;
        if (SD_MMC.exists(path.c_str())) {
            File f = SD_MMC.open(path.c_str(), FILE_READ);
            if (f) {
                Serial.printf("SIZE %s %d\n", path.c_str(), f.size());
                f.close();
            } else {
                Serial.println("ERR_OPEN");
            }
        } else {
            Serial.println("NOT_FOUND");
        }
    } else if (line.startsWith("WRITE ")) {
        // format: WRITE <filepath> <size>
        int firstSpace = line.indexOf(' ');
        int secondSpace = line.indexOf(' ', firstSpace + 1);
        if (secondSpace == -1) {
            Serial.println("ERR_SYNTAX");
            return;
        }

        String path = line.substring(firstSpace + 1, secondSpace);
        if (!path.startsWith("/")) path = "/" + path;
        size_t fileSize = line.substring(secondSpace + 1).toInt();

        File file = SD_MMC.open(path.c_str(), FILE_WRITE);
        if (!file) {
            Serial.printf("ERR_OPEN_FAILED %s\n", path.c_str());
            setLed(64, 0, 0);
            return;
        }

        setLed(64, 64, 0); // 黄色（書込中）
        Serial.println("READY"); // 準備完了、バイナリ送信要求
        Serial.flush();

        size_t received = 0;
        uint8_t buf[128];
        bool ok = true;

        while (received < fileSize) {
            size_t want = min((size_t)sizeof(buf), fileSize - received);
            size_t chunkR = 0;
            unsigned long tStart = millis();

            while (chunkR < want && millis() - tStart < 5000) {
                int c = Serial.read();
                if (c >= 0) {
                    buf[chunkR++] = (uint8_t)c;
                    tStart = millis();
                } else {
                    delay(1);
                }
            }

            if (chunkR < want) {
                ok = false;
                break;
            }

            file.write(buf, chunkR);
            received += chunkR;
            Serial.write('K');
            Serial.flush();
        }

        file.flush();
        file.close();

        if (ok && received == fileSize) {
            setLed(0, 64, 0); // 緑色（成功）
            Serial.printf("OK_WRITE %s %d\n", path.c_str(), received);
        } else {
            setLed(64, 0, 0); // 赤色（失敗）
            Serial.printf("ERR_INCOMPLETE %d/%d\n", received, fileSize);
        }
        Serial.flush();
    } else if (line.startsWith("DELETE ")) {
        String path = line.substring(7);
        if (!path.startsWith("/")) path = "/" + path;
        if (SD_MMC.remove(path.c_str())) {
            Serial.println("OK_DELETE");
        } else {
            Serial.println("ERR_DELETE");
        }
    } else if (line.startsWith("LIST")) {
        File root = SD_MMC.open("/");
        if (!root || !root.isDirectory()) {
            Serial.println("ERR_NO_ROOT");
            return;
        }
        File file = root.openNextFile();
        while (file) {
            Serial.printf("FILE: %s (%d bytes)\n", file.name(), file.size());
            file = root.openNextFile();
        }
        Serial.println("END_LIST");
    } else {
        Serial.println("UNKNOWN_CMD");
    }
}
