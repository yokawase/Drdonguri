// =============================================================================
// File: src/services/BleManager.ts
// 説明: Web Bluetooth 永続自動再接続（Persistent Auto-Reconnect）および
//       仮想プリンタ吸い上げ（上り）と決定論的打鍵ストリーム（下り）の双方向通信マネージャー
// =============================================================================

// ドングルと完全一致するBLE UUID
export const DONGURI_BLE_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const DONGURI_BLE_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

const DB_NAME = 'donguri_ble_db';
const DB_VERSION = 1;
const STORE_NAME = 'paired_devices';
const KEY_LAST_DEVICE_ID = 'last_paired_device_id';

export type BleConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface BleEventMap {
  stateChange: (state: BleConnectionState) => void;
  printerTextReceived: (text: string, rawBytes: Uint8Array) => void;
  ackReceived: (ack: string, sessionId?: number, extra?: string) => void;
  error: (err: Error) => void;
}

export class BleManager {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private state: BleConnectionState = 'disconnected';
  private listeners: { [K in keyof BleEventMap]?: BleEventMap[K][] } = {};

  private sjisDecoder: TextDecoder;

  constructor() {
    try {
      this.sjisDecoder = new TextDecoder('shift_jis');
    } catch {
      // Shift_JIS非対応ブラウザの場合はUTF-8フォールバック
      this.sjisDecoder = new TextDecoder('utf-8');
    }
  }

  public getState(): BleConnectionState {
    return this.state;
  }

  public isConnected(): boolean {
    return this.state === 'connected' && this.server?.connected === true;
  }

  // ---------------------------------------------------------------------------
  // イベント登録・通知
  // ---------------------------------------------------------------------------
  public on<K extends keyof BleEventMap>(event: K, cb: BleEventMap[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]?.push(cb);
  }

  public off<K extends keyof BleEventMap>(event: K, cb: BleEventMap[K]): void {
    const list = this.listeners[event];
    if (!list) return;
    this.listeners[event] = list.filter(item => item !== cb) as any;
  }

  private emit<K extends keyof BleEventMap>(event: K, ...args: Parameters<BleEventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      for (const cb of list) {
        try {
          (cb as any)(...args);
        } catch (e) {
          console.error(`[BleManager] Event ${event} error:`, e);
        }
      }
    }
  }

  private setState(newState: BleConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }

  // ---------------------------------------------------------------------------
  // IndexedDB ペアリング永続化層
  // ---------------------------------------------------------------------------
  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async savePairedDeviceId(id: string): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(id, KEY_LAST_DEVICE_ID);
    } catch (e) {
      console.warn('[BleManager] Failed to save device ID:', e);
    }
  }

  private async getSavedPairedDeviceId(): Promise<string | null> {
    try {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY_LAST_DEVICE_ID);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // サイレント自動再接続 (navigator.bluetooth.getDevices)
  // ---------------------------------------------------------------------------
  public async tryAutoReconnect(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) return false;
    if (this.isConnected()) return true;

    try {
      const savedId = await this.getSavedPairedDeviceId();
      if (!savedId) return false;

      // Chrome 85+ 認可済みデバイス取得
      if ('getDevices' in navigator.bluetooth) {
        const devices = await (navigator.bluetooth as any).getDevices();
        const target = devices.find((d: BluetoothDevice) => d.id === savedId);
        if (target) {
          console.log('[BleManager] 以前のペアリング済みデバイスを検出:', target.name || target.id);
          await this.connectToDevice(target);
          return true;
        }
      }
    } catch (err) {
      console.warn('[BleManager] サイレント再接続スキップ:', err);
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // ユーザー明示的ペアリング (Request Device)
  // ---------------------------------------------------------------------------
  public async requestAndConnect(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      throw new Error('Web Bluetooth API はこのブラウザでサポートされていません。');
    }

    this.setState('connecting');

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'EHR-AI-Dongle' },
          { services: [DONGURI_BLE_SERVICE_UUID] },
        ],
        optionalServices: [DONGURI_BLE_SERVICE_UUID],
      });

      await this.connectToDevice(device);
      if (device.id) {
        await this.savePairedDeviceId(device.id);
      }
    } catch (err: any) {
      this.setState('disconnected');
      this.emit('error', err);
      throw err;
    }
  }

  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    this.device = device;
    this.setState('connecting');

    device.addEventListener('gattserverdisconnected', () => {
      console.warn('[BleManager] デバイスが切断されました。');
      this.setState('disconnected');
      // 自動再接続試行
      setTimeout(() => this.tryAutoReconnect(), 2000);
    });

    if (!device.gatt) {
      throw new Error('GATT Server が利用できません。');
    }

    const server = await device.gatt.connect();
    this.server = server;

    const service = await server.getPrimaryService(DONGURI_BLE_SERVICE_UUID);
    const char = await service.getCharacteristic(DONGURI_BLE_CHARACTERISTIC_UUID);
    this.characteristic = char;

    // 通知の購読（電カル印刷データおよび打鍵ACK受信）
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (e: any) => {
      this.handleIncomingNotification(e.target.value);
    });

    this.setState('connected');
    console.log('[BleManager] ドングルと接続完了！');
  }

  // ---------------------------------------------------------------------------
  // 受信パケット処理（上り：カルテ生テキスト / ACK通知）
  // ---------------------------------------------------------------------------
  private handleIncomingNotification(dataView: DataView) {
    if (!dataView || dataView.byteLength === 0) return;

    const rawBytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);

    // ACK通知形式チェック (例: "ACK:ALT_STREAM_SENT", "ACK:HVC_SCORE:92:EXCELLENT")
    const textCheck = new TextDecoder('ascii').decode(rawBytes.slice(0, Math.min(32, rawBytes.length)));
    if (textCheck.startsWith('ACK:')) {
      const parts = textCheck.split(':');
      const ackType = parts[1] || '';
      const extra = parts.slice(2).join(':');
      this.emit('ackReceived', ackType, 0, extra);
      return;
    }

    // それ以外は電カル仮想プリンタから吸い上げたShift_JIS生テキスト
    try {
      const decodedText = this.sjisDecoder.decode(rawBytes);
      this.emit('printerTextReceived', decodedText, rawBytes);
    } catch (e) {
      console.warn('[BleManager] Shift_JIS decode error:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // データ送出（下り：ハイブリッド決定論打鍵ストリーム）
  // ---------------------------------------------------------------------------
  public async sendStream(
    streamText: string,
    onProgress?: (sent: number, total: number) => void
  ): Promise<void> {
    if (!this.isConnected() || !this.characteristic) {
      throw new Error('ドングルがBluetooth接続されていません。');
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(streamText);
    const totalBytes = bytes.length;
    const chunkSize = 240; // BLE MTUセーフサイズ

    let offset = 0;
    while (offset < totalBytes) {
      const end = Math.min(offset + chunkSize, totalBytes);
      const chunk = bytes.slice(offset, end);

      if ('writeValueWithoutResponse' in this.characteristic) {
        await (this.characteristic as any).writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }

      offset = end;
      if (onProgress) {
        onProgress(offset, totalBytes);
      }

      // ドングルのFIFOバッファ溢れ防止インターバル (15ms)
      await new Promise(r => setTimeout(r, 15));
    }
  }

  public disconnect(): void {
    if (this.server && this.server.connected) {
      this.server.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.setState('disconnected');
  }
}

export const bleManager = new BleManager();
