#ifndef USB_DESCRIPTORS_H
#define USB_DESCRIPTORS_H

#include <stdint.h>
#include <stdbool.h>
#include "tusb.h"
#include "esp32-hal-tinyusb.h"
#include "device/usbd_pvt.h"

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// DrVoice どんぐり君！ (Dr.Dongly) USB Composite 記述子定義
// Class 00h (Composite) ＝ HID Keyboard (Class 03h) ＋ USB Printer (Class 07h)
// 病院DLP監視ソフト（SKYSEA等）に一般周辺機器として認識させ、マスストレージ(MSC)は完全遮断
// ============================================================================

// 仮想プリンター (Class 07h) 定義
#define DONGURI_IEEE1284_DEVICE_ID "MFG:Generic;MDL:Custom-Text-Only;CMD:TEXT;CLS:PRINTER;DES:Generic Text Only;"
#define DONGURI_PRINTER_REQ_GET_DEVICE_ID   0
#define DONGURI_PRINTER_REQ_GET_PORT_STATUS 1
#define DONGURI_PRINTER_REQ_SOFT_RESET      2

// 記述子長: Interface(9) + Bulk OUT(7) + Bulk IN(7) = 23 bytes
#define DONGURI_PRINTER_DESC_LEN            (9 + 7 + 7)

// プリンター受信コールバック型
typedef void (*donguri_printer_rx_cb_t)(const uint8_t* data, uint16_t len);

// 外部公開API
void donguri_usb_printer_init(donguri_printer_rx_cb_t rx_cb);
uint16_t donguri_printer_load_descriptor(uint8_t* dst, uint8_t* itf);
bool donguri_printer_is_open(void);
uint8_t donguri_printer_get_itf_num(void);

#ifdef __cplusplus
}
#endif

#endif // USB_DESCRIPTORS_H
