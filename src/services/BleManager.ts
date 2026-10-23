// =============================================================================
// File: src/services/BleManager.ts
// 説明: Web Bluetooth 統合BLEマネージャー（src/utils/webBluetooth.ts への一本化）
//       GATT競合・二重接続・状態不整合を根絶し、単一のbleManagerシングルトンを完全共有
// =============================================================================

export {
  bleManager,
  BleDongleManager,
  BleDongleManager as BleManager,
  SERVICE_UUID as DONGURI_BLE_SERVICE_UUID,
  CHARACTERISTIC_UUID as DONGURI_BLE_CHARACTERISTIC_UUID,
} from '../utils/webBluetooth';

export type {
  BleConnectionState,
  BleAckEvent,
  BleEventMap,
  AckCallback,
  LogCallback,
  PrinterDataCallback,
  PrinterJobCompleteCallback,
} from '../utils/webBluetooth';
