#include "usb_descriptors.h"
#include <string.h>

// ============================================================================
// USB Composite 仮想プリンター (Class 07h) クラスドライバ実装
// ============================================================================

static uint8_t s_printer_itf_num = 1;
static uint8_t s_printer_ep_out = 0;
static uint8_t s_printer_ep_in = 0;
static bool    s_printer_open = false;
static uint8_t s_printer_rx_buf[64];

static donguri_printer_rx_cb_t s_rx_callback = NULL;

uint16_t donguri_printer_load_descriptor(uint8_t* dst, uint8_t* itf) {
  s_printer_itf_num = *itf;
  uint8_t str_index = tinyusb_add_string_descriptor("Generic Text Only Printer");
  s_printer_ep_out = tinyusb_get_free_out_endpoint();
  s_printer_ep_in = tinyusb_get_free_in_endpoint();

  uint8_t descriptor[] = {
    // 1. Interface Descriptor (9 bytes)
    // bLength, bDescriptorType, bInterfaceNumber, bAlternateSetting, bNumEndpoints,
    // bInterfaceClass(0x07: Printer), bInterfaceSubClass(0x01: Printers), bInterfaceProtocol(0x02: Bi-directional), iInterface
    9, TUSB_DESC_INTERFACE, s_printer_itf_num, 0, 2, 0x07, 0x01, 0x02, str_index,

    // 2. Endpoint Descriptor (Bulk OUT: PC -> Dongle, 7 bytes)
    // bLength, bDescriptorType, bEndpointAddress, bmAttributes, wMaxPacketSize, bInterval
    7, TUSB_DESC_ENDPOINT, s_printer_ep_out, TUSB_XFER_BULK, 0x40, 0x00, 0,

    // 3. Endpoint Descriptor (Bulk IN: Dongle -> PC, 7 bytes)
    7, TUSB_DESC_ENDPOINT, (uint8_t)(0x80 | s_printer_ep_in), TUSB_XFER_BULK, 0x40, 0x00, 0
  };

  *itf += 1;
  memcpy(dst, descriptor, sizeof(descriptor));
  return sizeof(descriptor);
}

static void printer_class_init(void) {
  // 初期化処理
}

static void printer_class_reset(uint8_t rhport) {
  (void)rhport;
  s_printer_open = false;
}

static uint16_t printer_class_open(uint8_t rhport, tusb_desc_interface_t const* desc_intf, uint16_t max_len) {
  if (desc_intf->bInterfaceClass != 0x07) return 0;
  s_printer_itf_num = desc_intf->bInterfaceNumber;

  uint8_t const* p_desc = (uint8_t const*)desc_intf;
  uint8_t const* p_desc_end = p_desc + max_len;
  p_desc = tu_desc_next(p_desc);

  for (int i = 0; i < desc_intf->bNumEndpoints; i++) {
    if (p_desc >= p_desc_end) break;
    tusb_desc_endpoint_t const* desc_ep = (tusb_desc_endpoint_t const*)p_desc;
    if (desc_ep->bDescriptorType == TUSB_DESC_ENDPOINT) {
      usbd_edpt_open(rhport, desc_ep);
      if (tu_edpt_dir(desc_ep->bEndpointAddress) == TUSB_DIR_OUT) {
        s_printer_ep_out = desc_ep->bEndpointAddress;
      } else {
        s_printer_ep_in = desc_ep->bEndpointAddress;
      }
    }
    p_desc = tu_desc_next(p_desc);
  }

  s_printer_open = true;

  if (s_printer_ep_out != 0) {
    usbd_edpt_xfer(rhport, s_printer_ep_out, s_printer_rx_buf, sizeof(s_printer_rx_buf));
  }

  return (uint16_t)(p_desc - (uint8_t const*)desc_intf);
}

static bool printer_class_control_xfer_cb(uint8_t rhport, uint8_t stage, tusb_control_request_t const* request) {
  if (request->bmRequestType_bit.type == TUSB_REQ_TYPE_CLASS &&
      request->bmRequestType_bit.recipient == TUSB_REQ_RCPT_INTERFACE &&
      (request->wIndex & 0xFF) == s_printer_itf_num) {

    if (stage == CONTROL_STAGE_SETUP) {
      switch (request->bRequest) {
        case DONGURI_PRINTER_REQ_GET_DEVICE_ID: {
          static uint8_t dev_id_buf[128];
          const char* dev_id = DONGURI_IEEE1284_DEVICE_ID;
          uint16_t str_len = (uint16_t)strlen(dev_id);
          uint16_t total_len = str_len + 2;
          dev_id_buf[0] = (uint8_t)(total_len >> 8);
          dev_id_buf[1] = (uint8_t)(total_len & 0xFF);
          memcpy(&dev_id_buf[2], dev_id, str_len);

          uint16_t xfer_len = (request->wLength < total_len) ? request->wLength : total_len;
          return tud_control_xfer(rhport, request, dev_id_buf, xfer_len);
        }
        case DONGURI_PRINTER_REQ_GET_PORT_STATUS: {
          static uint8_t port_status = 0x18; // 0x18: Selected (0x10) + No Error (0x08)
          return tud_control_xfer(rhport, request, &port_status, 1);
        }
        case DONGURI_PRINTER_REQ_SOFT_RESET: {
          return tud_control_status(rhport, request);
        }
        default:
          return false;
      }
    }
    return true;
  }
  return false;
}

static bool printer_class_xfer_cb(uint8_t rhport, uint8_t ep_addr, xfer_result_t result, uint32_t xferred_bytes) {
  if (ep_addr == s_printer_ep_out) {
    if (result == XFER_RESULT_SUCCESS && xferred_bytes > 0) {
      if (s_rx_callback != NULL) {
        s_rx_callback(s_printer_rx_buf, (uint16_t)xferred_bytes);
      }
    }
    usbd_edpt_xfer(rhport, s_printer_ep_out, s_printer_rx_buf, sizeof(s_printer_rx_buf));
    return true;
  }
  return true;
}

static const usbd_class_driver_t s_donguri_printer_driver = {
#if CFG_TUSB_DEBUG >= CFG_TUD_LOG_LEVEL
  .name = "PRINTER",
#endif
  .init = printer_class_init,
  .reset = printer_class_reset,
  .open = printer_class_open,
  .control_xfer_cb = printer_class_control_xfer_cb,
  .xfer_cb = printer_class_xfer_cb,
  .sof = NULL
};

// TinyUSB アプリケーションドライバ登録コールバック
usbd_class_driver_t const* usbd_app_driver_get_cb(uint8_t* driver_count) {
  *driver_count = 1;
  return &s_donguri_printer_driver;
}

void donguri_usb_printer_init(donguri_printer_rx_cb_t rx_cb) {
  s_rx_callback = rx_cb;
  tinyusb_enable_interface(USB_INTERFACE_CUSTOM, DONGURI_PRINTER_DESC_LEN, donguri_printer_load_descriptor);
}

bool donguri_printer_is_open(void) {
  return s_printer_open;
}

uint8_t donguri_printer_get_itf_num(void) {
  return s_printer_itf_num;
}
