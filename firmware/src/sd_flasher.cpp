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
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n--- T-Dongle-S3 SD Card Flasher v1.0 ---");

    if (!initSD()) {
        Serial.println("[ERROR] SD_MOUNT_FAILED");
        return;
    }

    uint8_t cardType = SD_MMC.cardType();
    Serial.printf("[SD] Card Type: %d\n", cardType);
    uint64_t cardSize = SD_MMC.cardSize() / (1024 * 1024);
    uint64_t totalBytes = SD_MMC.totalBytes() / (1024 * 1024);
    uint64_t usedBytes = SD_MMC.usedBytes() / (1024 * 1024);
    Serial.printf("[SD] Size: %llu MB (Total: %llu MB, Used: %llu MB)\n", cardSize, totalBytes, usedBytes);

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
        if (SD_MMC.mkdir(dir.c_str())) {
            Serial.println("OK");
        } else {
            // すでに存在する場合もOK
            Serial.println("OK");
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
            return;
        }

        Serial.println("READY"); // 準備完了、バイナリ送信要求

        size_t received = 0;
        uint8_t buf[512];
        unsigned long timeout = millis() + 5000;

        while (received < fileSize && millis() < timeout) {
            int avail = Serial.available();
            if (avail > 0) {
                int toRead = min((size_t)avail, min((size_t)sizeof(buf), fileSize - received));
                int r = Serial.readBytes((char*)buf, toRead);
                if (r > 0) {
                    file.write(buf, r);
                    received += r;
                    timeout = millis() + 5000; // タイムアウトリセット
                }
            }
        }

        file.flush();
        file.close();

        if (received == fileSize) {
            Serial.printf("OK_WRITE %s %d\n", path.c_str(), received);
        } else {
            Serial.printf("ERR_INCOMPLETE %d/%d\n", received, fileSize);
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
