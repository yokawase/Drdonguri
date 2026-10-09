#pragma once

#include <Arduino.h>
#include "FS.h"
#include "SPIFFS.h"
#include "SD.h"

// ============================================================================
// Minds 診療ガイドライン 512B 固定長バイナリ・Zero-RAM 二分探索エンジン
// 対象マイコン: LILYGO T-dongle-S3 (ESP32-S3 / 16MB Flash / MicroSDスロット搭載)
// ============================================================================

#define MINDS_RECORD_SIZE 512

#pragma pack(push, 1)
struct MindsGuidelineRecord512 {
    uint16_t id;              // ユニークレコードID (2B)
    char     icd10[6];        // ICD-10コード (例: "J00\0\0\0") (6B)
    uint32_t trigger_hash;    // 疾患名/トリガー語のFNV-1a 32bitハッシュ (4B)
    uint16_t cq_num;          // CQ番号 (例: 1) (2B)
    uint8_t  strength;        // 推奨度 (1:強く推奨, 2:弱く推奨, 3:弱く非推奨, 4:強く非推奨) (1B)
    uint8_t  evidence_level;  // エビデンス質 (1:質A, 2:質B, 3:質C, 4:質D) (1B)
    uint8_t  alert_flags;     // 警告フラグ (0:標準, 1:禁忌あり, 2:併用注意, 3:高齢者注意, 4:漫然投与注意) (1B)
    uint8_t  reserved1;       // 予約・パディング (1B)
    uint32_t sd_offset;       // 32GB SDカード内詳細解説テキストの開始オフセット (4B)
    uint16_t sd_length;       // 32GB SDカード内詳細解説テキスト長 (2B)
    char     category[12];    // 診療科・大分類 (UTF-8, null終端) (12B)
    char     disease_name[44];// 代表疾患名 (UTF-8, null終端) (44B)
    char     cq_title[80];    // CQタイトル (UTF-8, null終端) (80B)
    char     recommendation[352]; // 推奨文要約・臨床アクション (UTF-8, null終端) (352B)
};
#pragma pack(pop)

// 静的サイズアサーション (厳密に512バイトであることをコンパイル時検証)
static_assert(sizeof(MindsGuidelineRecord512) == MINDS_RECORD_SIZE, "MindsGuidelineRecord512 must be exactly 512 bytes!");

class MindsGuidelineEngine {
private:
    File flashFile;
    File sdFile;
    size_t totalRecords = 0;
    bool isFlashLoaded = false;
    bool isSdMounted = false;

    // FNV-1a 32-bit Hash
    static uint32_t calculateHash(const char* str) {
        uint32_t hash = 0x811c9dc5;
        while (*str) {
            hash ^= (uint8_t)(*str++);
            hash *= 0x01000193;
        }
        return hash;
    }

public:
    MindsGuidelineEngine() {}

    /**
     * 16MB Flash 内の固定長辞書 (/minds_cds.bin) をマウント
     */
    bool beginFlash(const char* path = "/minds_cds.bin") {
        if (!SPIFFS.exists(path)) {
            Serial.printf("[Minds] Flash辞書が見つかりません: %s\n", path);
            return false;
        }
        flashFile = SPIFFS.open(path, "r");
        if (!flashFile) {
            Serial.println("[Minds] Flash辞書オープン失敗");
            return false;
        }
        size_t fileSize = flashFile.size();
        totalRecords = fileSize / MINDS_RECORD_SIZE;
        isFlashLoaded = (totalRecords > 0);
        Serial.printf("[Minds] Flash 512B 辞書初期化成功: %d レコード (%d KB)\n", totalRecords, fileSize / 1024);
        return isFlashLoaded;
    }

    /**
     * 32GB MicroSD カード内の全文ナレッジベース (/minds_fulltext.dat) をマウント
     */
    bool beginSdCard(const char* path = "/minds_fulltext.dat") {
        if (!SD.exists(path)) {
            Serial.printf("[Minds] SDカード詳細テキストが見つかりません: %s\n", path);
            isSdMounted = false;
            return false;
        }
        sdFile = SD.open(path, "r");
        if (!sdFile) {
            Serial.println("[Minds] SDカードファイルオープン失敗");
            isSdMounted = false;
            return false;
        }
        isSdMounted = true;
        Serial.printf("[Minds] 32GB SDカード 全文ナレッジマウント成功: %d KB\n", sdFile.size() / 1024);
        return true;
    }

    /**
     * 【Zero-RAM 二分探索】
     * 入力された病名・キーワードから 512B 固定長レコードを Flash から直接シークして即時照合
     */
    bool lookupGuideline(const char* keyword, MindsGuidelineRecord512* outRecord) {
        if (!isFlashLoaded || totalRecords == 0 || !keyword || !outRecord) return false;

        uint32_t targetHash = calculateHash(keyword);
        int low = 0;
        int high = (int)totalRecords - 1;

        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (!flashFile.seek(mid * MINDS_RECORD_SIZE, SeekSet)) {
                return false;
            }

            MindsGuidelineRecord512 current;
            size_t bytesRead = flashFile.read((uint8_t*)&current, MINDS_RECORD_SIZE);
            if (bytesRead != MINDS_RECORD_SIZE) return false;

            if (current.trigger_hash == targetHash) {
                memcpy(outRecord, &current, MINDS_RECORD_SIZE);
                return true;
            } else if (current.trigger_hash < targetHash) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return false;
    }

    /**
     * 32GB SD カードから詳細背景・エビデンス全文を取得
     */
    String readDetailedFulltext(const MindsGuidelineRecord512& record) {
        if (!isSdMounted || !sdFile || record.sd_length == 0) {
            return String("【SDカード未挿入】詳細解説は32GB MicroSDカードを装着すると参照できます。");
        }

        if (!sdFile.seek(record.sd_offset, SeekSet)) {
            return String("【SD読込エラー】シークに失敗しました。");
        }

        char buffer[record.sd_length + 1];
        size_t readBytes = sdFile.read((uint8_t*)buffer, record.sd_length);
        buffer[readBytes] = '\0';
        return String(buffer);
    }

    /**
     * 推奨強さのテキスト表現
     */
    static const char* getStrengthLabel(uint8_t strength) {
        switch (strength) {
            case 1: return "強く推奨 (Grade 1)";
            case 2: return "弱く推奨/提案 (Grade 2)";
            case 3: return "弱く非推奨 (Grade 2 Against)";
            case 4: return "強く非推奨 (Grade 1 Against)";
            default: return "推奨グレード未定義";
        }
    }

    /**
     * エビデンスの確実性のテキスト表現
     */
    static const char* getEvidenceLabel(uint8_t ev) {
        switch (ev) {
            case 1: return "質A (高)";
            case 2: return "質B (中)";
            case 3: return "質C (低)";
            case 4: return "質D (極めて低)";
            default: return "未評価";
        }
    }
};
