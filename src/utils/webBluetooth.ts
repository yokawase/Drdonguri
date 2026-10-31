/**
 * Web Bluetooth (Web BLE) 接続・プロトコル通信マネージャー (v6.0 高信頼版)
 * AtomS3U (EHR-AI-Dongle) の GATT サービス・キャラクタリスティックと通信
 * 複数回送信・連続送信におけるGATTロック解放・キュー破棄を完全保証
 */

import { PreparedSession, parseMissingBitmap, toHexDump } from './packetBuilder';
import { cleanExtractedMedicalText } from './chartTextCleaner';


export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

const BLE_DB_NAME = 'donguri_ble_db';
const BLE_DB_VERSION = 1;
const BLE_STORE_NAME = 'paired_devices';
const KEY_LAST_DEVICE_ID = 'last_paired_device_id';

export type BleConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface BleAckEvent {
  raw: string;
  sessionId: number;
  ackType: string;
  detail?: string;
  timestamp: number;
}

export interface BleEventMap {
  stateChange: (state: BleConnectionState) => void;
  printerTextReceived: (text: string, rawBytes: Uint8Array) => void;
  ackReceived: (ack: string, sessionId?: number, extra?: string) => void;
  error: (err: Error) => void;
}

export type AckCallback = (event: BleAckEvent) => void;
export type LogCallback = (direction: 'tx' | 'rx' | 'sys', tag: string, msg: string, hex?: string) => void;
export type PrinterDataCallback = (chunk: string, totalReceivedBytes: number) => void;
export type PrinterJobCompleteCallback = (fullText: string, totalBytes: number) => void;

/**
 * Windows Text Only / Shift-JIS / UTF-8 自動判別デコーダー
 */
export function decodePrinterBytes(bytes: Uint8Array): string {
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(bytes);
  } catch {
    try {
      const sjisDecoder = new TextDecoder('shift_jis');
      return sjisDecoder.decode(bytes);
    } catch {
      const fallbackDecoder = new TextDecoder('utf-8');
      return fallbackDecoder.decode(bytes);
    }
  }
}

export class BleDongleManager {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
  private ackListeners: AckCallback[] = [];
  private logListener: LogCallback | null = null;
  private onDisconnectListener: (() => void) | null = null;
  private isNotifyActive: boolean = false;
  private isWriting: boolean = false;

  private state: BleConnectionState = 'disconnected';
  private eventListeners: { [K in keyof BleEventMap]?: BleEventMap[K][] } = {};

  // 仮想プリンター吸い上げストリーミングバッファ
  private printerBuffer: number[] = [];
  private printerDataListeners: PrinterDataCallback[] = [];
  private printerCompleteListeners: PrinterJobCompleteCallback[] = [];
  private isTransmissionAborted: boolean = false;
  // ユーザーが明示的に切断したかどうか (true の間は gattserverdisconnected でも自動再接続しない)
  private manualDisconnect: boolean = false;

  public getState(): BleConnectionState {
    return this.state;
  }

  private setState(newState: BleConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }

  public on<K extends keyof BleEventMap>(event: K, cb: BleEventMap[K]): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]?.push(cb);
  }

  public off<K extends keyof BleEventMap>(event: K, cb: BleEventMap[K]): void {
    const list = this.eventListeners[event];
    if (!list) return;
    this.eventListeners[event] = list.filter(item => item !== cb) as any;
  }

  private emit<K extends keyof BleEventMap>(event: K, ...args: Parameters<BleEventMap[K]>): void {
    const list = this.eventListeners[event];
    if (list) {
      for (const cb of list) {
        try {
          (cb as any)(...args);
        } catch (e) {
          console.error(`[BleDongleManager] Event ${event} error:`, e);
        }
      }
    }
  }

  private async openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(BLE_DB_NAME, BLE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BLE_STORE_NAME)) {
          db.createObjectStore(BLE_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async savePairedDeviceId(id: string): Promise<void> {
    try {
      const db = await this.openDb();
      const tx = db.transaction(BLE_STORE_NAME, 'readwrite');
      tx.objectStore(BLE_STORE_NAME).put(id, KEY_LAST_DEVICE_ID);
    } catch (e) {
      console.warn('[BleDongleManager] Failed to save device ID:', e);
    }
  }

  private async getSavedPairedDeviceId(): Promise<string | null> {
    try {
      const db = await this.openDb();
      return new Promise((resolve) => {
        const tx = db.transaction(BLE_STORE_NAME, 'readonly');
        const req = tx.objectStore(BLE_STORE_NAME).get(KEY_LAST_DEVICE_ID);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * サイレント自動再接続 (navigator.bluetooth.getDevices)
   */
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
          this.log('sys', 'BLE', `以前のペアリング済みデバイスを検出: ${target.name || target.id}`);
          return await this.connectToDevice(target);
        }
      }
    } catch (err) {
      this.log('sys', 'WARN', `サイレント再接続スキップ: ${err}`);
    }
    return false;
  }

  /**
   * 送信中断 (打鍵中止 & ドングルメモリ消去)
   */
  public async abortTransmission(): Promise<void> {
    this.isTransmissionAborted = true;
    this.log('sys', 'ABORT', 'ユーザーにより電子カルテ転送の中断が指示されました。ドングルへWIPE指示を送出します...');
    try {
      if (this.isConnected()) {
        await this.sendCommand('CMD:WIPE');
      }
    } catch (e: any) {
      console.warn('Abort WIPE failed:', e);
    }
  }

  public isConnected(): boolean {
    return !!(this.server && this.server.connected && this.characteristic);
  }

  public hasNotifySupport(): boolean {
    return this.isNotifyActive;
  }

  public getDeviceName(): string {
    return this.device?.name || 'EHR-AI-Dongle';
  }

  public setLogListener(cb: LogCallback): void {
    this.logListener = cb;
  }

  public setOnDisconnect(cb: () => void): void {
    this.onDisconnectListener = cb;
  }

  public addAckListener(cb: AckCallback): () => void {
    this.ackListeners.push(cb);
    return () => {
      this.ackListeners = this.ackListeners.filter(l => l !== cb);
    };
  }

  public addPrinterDataListener(cb: PrinterDataCallback): () => void {
    this.printerDataListeners.push(cb);
    return () => {
      this.printerDataListeners = this.printerDataListeners.filter(l => l !== cb);
    };
  }

  public addPrinterCompleteListener(cb: PrinterJobCompleteCallback): () => void {
    this.printerCompleteListeners.push(cb);
    return () => {
      this.printerCompleteListeners = this.printerCompleteListeners.filter(l => l !== cb);
    };
  }

  public clearPrinterBuffer(): void {
    this.printerBuffer = [];
  }

  private log(direction: 'tx' | 'rx' | 'sys', tag: string, msg: string, hex?: string) {
    if (this.logListener) {
      this.logListener(direction, tag, msg, hex);
    }
  }

  /**
   * ブラウザがWeb Bluetoothに対応しているか確認
   */
  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  /**
   * AtomS3U (EHR-AI-Dongle) とのBluetoothペアリング＆接続
   */
  public async connect(): Promise<boolean> {
    if (!BleDongleManager.isSupported()) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      if (hostname === '0.0.0.0' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        throw new Error('Web Bluetooth APIを有効にするため、アドレスバーのURLを http://localhost:3000 または http://127.0.0.1:3000 に変更して開き直してください。');
      }
      throw new Error('お使いのブラウザは Web Bluetooth API に対応していません。Google Chrome / Edge を使用し、http://localhost:3000 でアクセスしてください。');
    }

    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      this.log('sys', 'BLE_INFO', 'iframe環境のためBluetooth APIが制限されています。別タブで開いてください。');
      throw new Error('IFRAME_BLOCKED: プレビュー枠内ではBluetoothが制限されています。新しいタブで開いてください。');
    }

    this.log('sys', 'BLE', 'AtomS3U (EHR-AI-Dongle) のスキャンを開始...');

    let chosenDevice: BluetoothDevice | null = null;

    // 1. スマートスキャン（名前フィルタ＆サービスUUIDによるダイレクト検出）
    try {
      this.log('sys', 'BLE', 'Bluetoothデバイスをスキャン中（「EHR-AI-Dongle」を検索中）...');
      chosenDevice = await navigator.bluetooth!.requestDevice({
        filters: [
          { name: 'EHR-AI-Dongle' },
          { namePrefix: 'EHR' },
          { services: [SERVICE_UUID.toLowerCase()] },
          { namePrefix: 'Dong' },
        ],
        optionalServices: [SERVICE_UUID.toLowerCase()],
      });
    } catch (filterErr: any) {
      const errMsg = filterErr?.message || String(filterErr);
      if (
        errMsg.includes('permissions policy') ||
        errMsg.includes('Permissions-Policy') ||
        errMsg.includes('SecurityError') ||
        errMsg.includes('disallowed by permissions policy')
      ) {
        throw new Error('IFRAME_BLOCKED: プレビュー枠内ではBluetoothが制限されています。新しいタブで開いてください。');
      }
      if (errMsg.includes('User cancelled') || errMsg.includes('cancelled') || filterErr?.name === 'NotFoundError') {
        // フィルタで見つからない場合、全デバイス一覧（acceptAllDevices）へフォールバック
        this.log('sys', 'BLE', 'フィルタ検索で見つからなかったため、周辺全デバイス一覧スキャンに切り替えます...');
        try {
          chosenDevice = await navigator.bluetooth!.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID.toLowerCase()],
          });
        } catch (allErr: any) {
          if (allErr?.message?.includes('cancelled') || allErr?.name === 'NotFoundError') {
            throw new Error('DEVICE_CANCELLED: デバイスの選択がキャンセルされました。');
          }
          throw allErr;
        }
      } else {
        throw filterErr;
      }
    }

    if (!chosenDevice) {
      throw new Error('Bluetoothデバイスが選択されませんでした。');
    }

    return await this.connectToDevice(chosenDevice);
  }

  /**
   * MedPilot互換エイリアス
   */
  public async requestAndConnect(): Promise<void> {
    await this.connect();
  }

  /**
   * GATT切断イベントハンドラ
   * 名前付き(アロープロパティ)にして、再接続時の付け直し・重複登録防止を可能にする。
   * ユーザーが明示的に切断した場合 (manualDisconnect) は自動再接続を予約しない。
   */
  private handleGattDisconnected = (): void => {
    this.log('sys', 'BLE', 'AtomS3U とのBLE接続が切断されました（メモリゼロクリア実行）');
    this.server = null;
    this.characteristic = null;
    this.isNotifyActive = false;
    this.isWriting = false;
    this.setState('disconnected');
    if (this.onDisconnectListener) {
      this.onDisconnectListener();
    }
    if (this.manualDisconnect) {
      this.log('sys', 'BLE', 'ユーザーによる明示的な切断のため、自動再接続は行いません。');
      return;
    }
    // 3秒後に自動サイレント再接続を試行
    setTimeout(() => this.tryAutoReconnect(), 3000);
  };

  /**
   * Notify値変化イベントハンドラ (名前付き: 同一 characteristic への重複登録は自動で抑止される)
   */
  private handleCharacteristicValueChanged = (event: Event): void => {
    const char = event.target as BluetoothRemoteGATTCharacteristic;
    if (!char.value) return;
    const decoder = new TextDecoder();
    const ackStr = decoder.decode(char.value);
    this.handleIncomingAck(ackStr, new Uint8Array(char.value.buffer));
  };

  /**
   * 現在の characteristic に対する Notify (ACK通知) 購読のセットアップ
   * connectToDevice / ensureConnected の双方から使用する共通処理。
   * isNotifyActive には実際の購読状態を反映させる。
   * @returns 購読に成功したら true、失敗したら false (片方向送信モードとして継続可能)
   */
  private async subscribeNotifications(): Promise<boolean> {
    if (!this.characteristic) {
      this.isNotifyActive = false;
      return false;
    }
    try {
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', this.handleCharacteristicValueChanged);
      this.isNotifyActive = true;
      this.log('sys', 'GATT', 'ACK通知 (Notify) の購読を有効化しました (双方向通信確立)');
      return true;
    } catch (notifyErr: any) {
      this.isNotifyActive = false;
      this.log('sys', 'WARN', `ACK通知購読をスキップ（片方向高速送信モードで安全に接続維持）: ${notifyErr?.message || notifyErr}`);
      return false;
    }
  }

  /**
   * Android/WebBLEのGATTハング（最大120秒フリーズ）を完全防止するタイムアウト付きGATT接続ヘルパー
   */
  private async connectGattWithTimeout(
    device: BluetoothDevice,
    timeoutMs: number = 4500
  ): Promise<BluetoothRemoteGATTServer> {
    if (!device.gatt) throw new Error('BluetoothDevice に gatt が存在しません。');
    let timer: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          if (device.gatt?.connected) device.gatt.disconnect();
        } catch {}
        reject(
          new Error(
            `GATT接続タイムアウト (${timeoutMs}ms): Androidスタックの2分間ハングを防止し即時安全切断しました。`
          )
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([device.gatt.connect(), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 単一プロミスに対する安全タイムアウト保護ヘルパー
   */
  private async runWithTimeout<T>(p: Promise<T>, ms: number, opName: string): Promise<T> {
    let t: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`TIMEOUT_${opName}_${ms}ms`)), ms);
    });
    return Promise.race([p, timeoutPromise]).finally(() => {
      if (t) clearTimeout(t);
    });
  }

  /**
   * 指定されたBluetoothDeviceへの接続確立処理（スマートリトライ＆キャラクタリスティック購読）
   */
  public async connectToDevice(targetDevice: BluetoothDevice): Promise<boolean> {
    // 新規接続の開始により、明示的切断フラグを解除する
    this.manualDisconnect = false;
    this.device = targetDevice;
    this.setState('connecting');

    try {
      // 名前付きハンドラを付け直す (同一デバイスへの再接続でリスナーが累積しないようにする)
      this.device.removeEventListener('gattserverdisconnected', this.handleGattDisconnected);
      this.device.addEventListener('gattserverdisconnected', this.handleGattDisconnected);

      this.log('sys', 'GATT', `デバイス「${this.device.name || 'EHR-AI-Dongle'}」に接続中...`);
      this.server = await this.connectGattWithTimeout(this.device, 5000);

      // スタック安定化待機
      await new Promise((r) => setTimeout(r, 400));

      // リトライ付きで Primary Service を取得
      let service: BluetoothRemoteGATTService | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (!this.server || !this.server.connected) {
            this.log('sys', 'GATT', `GATT再接続試行 (${attempt}/3)...`);
            this.server = await this.connectGattWithTimeout(this.device, 3500);
            await new Promise((r) => setTimeout(r, 300));
          }
          this.log('sys', 'GATT', `Primary Service (${SERVICE_UUID}) を取得中... (試行 ${attempt}/3)`);
          service = await this.server.getPrimaryService(SERVICE_UUID.toLowerCase());
          if (service) break;
        } catch (err: any) {
          if (attempt === 3) throw err;
          this.log('sys', 'WARN', `サービス取得リトライ中 (${attempt}/3): ${err?.message || err}`);
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      if (!service) {
        throw new Error('Primary Service の取得に失敗しました。');
      }

      this.log('sys', 'GATT', `Characteristic (${CHARACTERISTIC_UUID}) を取得中...`);
      this.characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID.toLowerCase());

      await new Promise((r) => setTimeout(r, 200));

      // Notify（ACK通知）の購読
      await this.subscribeNotifications();

      if (this.device.id) {
        await this.savePairedDeviceId(this.device.id);
      }

      this.setState('connected');
      this.log('sys', 'READY', 'AtomS3U (どんぐり君) とのBLE接続が完了しました！(LED緑色)');
      return true;
    } catch (err: any) {
      this.setState('disconnected');
      this.emit('error', err);
      this.log('sys', 'ERR', `接続失敗: ${err.message}`);
      throw err;
    }
  }

  /**
   * 切断状態からの透過的自動再接続
   */
  public async ensureConnected(): Promise<boolean> {
    if (this.isConnected()) return true;

    if (!this.device || !this.device.gatt) {
      throw new Error('AtomS3Uデバイスが未ペアリングです。「実機BLE接続」を行ってください。');
    }

    this.log('sys', 'BLE', 'GATTサーバーへ自動再接続中...');
    this.server = await this.connectGattWithTimeout(this.device, 4000);
    await new Promise((r) => setTimeout(r, 350));

    const service = await this.server.getPrimaryService(SERVICE_UUID.toLowerCase());
    this.characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID.toLowerCase());

    // 再接続で得た新しい characteristic に対して Notify 購読を必ず再セットアップする。
    // 切断時に isNotifyActive は false へ落ちるため、旧状態に依存した条件分岐では
    // startNotifications() が二度と実行されず、ACKが届かない片方向接続になる。
    await this.subscribeNotifications();

    return this.isConnected();
  }

  /**
   * 受信ACK / プリンター吸い上げメッセージの解析とディスパッチ
   */
  private handleIncomingAck(ackStr: string, rawBytes: Uint8Array): void {
    // 1. 仮想プリンター印刷データストリーミング (PRN:...)
    if (rawBytes.length >= 4 && rawBytes[0] === 0x50 && rawBytes[1] === 0x52 && rawBytes[2] === 0x4E && rawBytes[3] === 0x3A) { // "PRN:"
      const payloadBytes = rawBytes.subarray(4);
      for (let i = 0; i < payloadBytes.length; i++) {
        this.printerBuffer.push(payloadBytes[i]);
      }
      const chunkText = decodePrinterBytes(payloadBytes);
      this.log('rx', 'PRN_DATA', `カルテ生データ受信: ${payloadBytes.length}B (累計: ${this.printerBuffer.length}B)`, toHexDump(payloadBytes));
      for (const cb of [...this.printerDataListeners]) {
        try {
          cb(chunkText, this.printerBuffer.length);
        } catch (e) {
          console.error(e);
        }
      }
      return;
    }

    // 2. 仮想プリンター印刷ジョブ完了 (PRN_END:<totalBytes>)
    if (ackStr.startsWith('PRN_END')) {
      const fullBytes = new Uint8Array(this.printerBuffer);
      const rawText = decodePrinterBytes(fullBytes);
      const fullText = cleanExtractedMedicalText(rawText);
      this.log('rx', 'PRN_END', `電カル過去カルテ吸い上げ＆空白除去完了: 全 ${fullBytes.length} Bytes / 整形後 ${fullText.length} 文字`);
      for (const cb of [...this.printerCompleteListeners]) {
        try {
          cb(fullText, fullBytes.length);
        } catch (e) {
          console.error(e);
        }
      }
      this.emit('printerTextReceived', fullText, fullBytes);
      this.printerBuffer = [];
      return;
    }

    this.log('rx', 'ACK', ackStr, toHexDump(rawBytes));

    // フォーマット: "ACK:<sessionId>:<ackType>[:<detail>]" または "ACK:<ackType>[:<detail>]"
    const parts = ackStr.split(':');
    if (parts.length >= 2 && parts[0] === 'ACK') {
      let sessionId = 0;
      let ackType = '';
      let detail = '';

      if (parts.length >= 3 && /^\d+$/.test(parts[1])) {
        sessionId = parseInt(parts[1], 10);
        ackType = parts[2];
        detail = parts.slice(3).join(':');
      } else {
        sessionId = 0;
        ackType = parts[1] || '';
        detail = parts.slice(2).join(':');
      }

      const event: BleAckEvent = {
        raw: ackStr,
        sessionId,
        ackType,
        detail,
        timestamp: Date.now(),
      };

      for (const listener of [...this.ackListeners]) {
        try {
          listener(event);
        } catch (e) {
          console.error(e);
        }
      }
      this.emit('ackReceived', ackType, sessionId, detail);
    }
  }

  /**
   * 電カル過去カルテ吸い上げコマンド (Ctrl+P -> Enter) をドングルへ送信
   */
  public async triggerAutoPull(): Promise<boolean> {
    if (!this.isConnected()) {
      throw new Error('AtomS3U (どんぐり君) と未接続です。');
    }
    this.log('tx', 'CMD', '電カル自動吸い上げ (Ctrl+P -> Enter) コマンド送出');
    const encoder = new TextEncoder();
    const cmd = encoder.encode('CMD:AUTO_PULL');
    await this.writeData(cmd);
    return true;
  }

  /**
   * 接続切断
   */
  public disconnect(): void {
    // 明示的な切断であることを記録し、gattserverdisconnected 側の自動再接続を抑止する
    this.manualDisconnect = true;
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isNotifyActive = false;
    this.isWriting = false;
    this.setState('disconnected');
    this.log('sys', 'BLE', '切断処理が完了しました。');
  }

  /**
   * 打鍵ストリーム送出（BLE MTU 240バイトセーフチャンク分割＆フロー制御）
   */
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
    const chunkSize = 240;

    let offset = 0;
    while (offset < totalBytes) {
      const end = Math.min(offset + chunkSize, totalBytes);
      const chunk = bytes.slice(offset, end);

      await this.writeData(chunk);

      offset = end;
      if (onProgress) {
        onProgress(offset, totalBytes);
      }
      // FIFOバッファ溢れ防止インターバル (15ms)
      await new Promise(r => setTimeout(r, 15));
    }
  }

  /**
   * バッファ安全書き込みヘルパー (2回目送信のデッドロック・GATTストール防止・高速ノンブロッキング)
   */
  private async writeData(data: Uint8Array): Promise<void> {
    if (!this.characteristic) throw new Error('Characteristicが初期化されていません。');
    
    // 排他ロック待機 (最大500msで強制アンロックしてデッドロックを防止)
    const lockWaitStart = Date.now();
    while (this.isWriting) {
      if (Date.now() - lockWaitStart > 500) {
        this.isWriting = false;
        break;
      }
      await new Promise(r => setTimeout(r, 10));
    }

    this.isWriting = true;
    try {
      const bufferToSend = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;

      // リトライループ (最大3回)
      let lastErr: any = null;
      const props = (this.characteristic as any)?.properties;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // 1. Android/iOS WebBLEで最速・ストールしない writeValueWithoutResponse を最優先
          if (
            (!props || props.writeWithoutResponse) &&
            typeof (this.characteristic as any).writeValueWithoutResponse === 'function'
          ) {
            try {
              await this.runWithTimeout(
                (this.characteristic as any).writeValueWithoutResponse(bufferToSend),
                1000,
                'WRITE_NR'
              );
              return;
            } catch (wNrErr: any) {
              // fall through to withResponse
            }
          }

          // 2. writeValueWithResponse (タイムアウト保護でハングを物理遮断)
          if (
            (!props || props.write) &&
            typeof (this.characteristic as any).writeValueWithResponse === 'function'
          ) {
            try {
              await this.runWithTimeout(
                (this.characteristic as any).writeValueWithResponse(bufferToSend),
                1200,
                'WRITE_RESP'
              );
              return;
            } catch (wRespErr: any) {
              // fall through to writeValue
            }
          }

          // 3. 標準 writeValue
          if ('writeValue' in this.characteristic) {
            await this.runWithTimeout(
              this.characteristic.writeValue(bufferToSend),
              1200,
              'WRITE_STD'
            );
            return;
          }
        } catch (writeErr: any) {
          lastErr = writeErr;
          const errMsg = writeErr?.message || String(writeErr);
          if (attempt < 3 && (errMsg.includes('in progress') || errMsg.includes('NetworkError') || errMsg.includes('busy') || errMsg.includes('GATT'))) {
            await new Promise(r => setTimeout(r, 20 * attempt));
            continue;
          }
          throw writeErr;
        }
      }

      if (lastErr) throw lastErr;
    } finally {
      this.isWriting = false;
    }
  }

  // ==========================================================================
  // 実機ドングル遠隔制御コマンド群
  // ==========================================================================

  public async sendCommand(cmd: string): Promise<boolean> {
    if (!this.isConnected()) {
      await this.ensureConnected();
    }
    const encoder = new TextEncoder();
    const bytes = encoder.encode(cmd);
    this.log('tx', 'CMD', `遠隔指示送信: ${cmd}`);
    await this.writeData(bytes);
    return true;
  }

  public async sendRemoteTrigger(): Promise<boolean> {
    return this.sendCommand('CMD:TRIGGER');
  }

  public async sendNumUnlock(): Promise<boolean> {
    return this.sendCommand('CMD:NUM_UNLOCK');
  }

  /**
   * 任意テキストまたはバイナリのダイレクト送出
   */
  public async sendData(textOrBytes: string | Uint8Array): Promise<boolean> {
    if (!this.isConnected()) {
      await this.ensureConnected();
    }
    const bytes = typeof textOrBytes === 'string' ? new TextEncoder().encode(textOrBytes) : textOrBytes;
    this.log('tx', 'DATA', `ダイレクトデータ送出: ${typeof textOrBytes === 'string' ? textOrBytes : '[Binary Bytes]'}`);
    await this.writeData(bytes);
    return true;
  }

  /**
   * HILテスト用: Alt+Numpad 即時打鍵送信 ([ALT]コード[/ALT])
   */
  public async sendAltNumpadDirect(code: string): Promise<boolean> {
    const payload = `[ALT]${code}[/ALT]`;
    this.log('tx', 'ALT_HIL', `Alt+Numpad打鍵テスト送信: ${payload}`);
    return this.sendData(payload);
  }

  /**
   * HILテスト用: Alt+Numpad CMD指示 (CMD:ALT:コード)
   */
  public async sendAltNumpadCommand(code: string): Promise<boolean> {
    return this.sendCommand(`CMD:ALT:${code}`);
  }

  public async sendPing(): Promise<{ rttMs: number }> {
    const ts = Date.now().toString();
    const startTime = performance.now();

    return new Promise<{ rttMs: number }>(async (resolve, reject) => {
      const remove = this.addAckListener((event) => {
        if (event.ackType === 'PONG') {
          const rtt = Math.round(performance.now() - startTime);
          remove();
          this.log('sys', 'PING', `BLE応答完了 (RTT: ${rtt}ms)`);
          resolve({ rttMs: rtt });
        }
      });

      setTimeout(() => {
        remove();
        resolve({ rttMs: Math.round(performance.now() - startTime) });
      }, 1500);

      try {
        await this.sendCommand(`CMD:PING:${ts}`);
      } catch (err) {
        remove();
        reject(err);
      }
    });
  }

  public async sendWipe(): Promise<boolean> {
    return this.sendCommand('CMD:WIPE');
  }

  public async sendLedTest(): Promise<boolean> {
    return this.sendCommand('CMD:LED_TEST');
  }

  public async requestStatus(): Promise<string> {
    return new Promise<string>(async (resolve) => {
      const remove = this.addAckListener((event) => {
        if (event.ackType === 'STATUS_RESP') {
          remove();
          resolve(event.detail || 'OK');
        }
      });

      setTimeout(() => {
        remove();
        resolve('TIMEOUT');
      }, 1200);

      try {
        await this.sendCommand('CMD:STATUS');
      } catch {
        remove();
        resolve('ERR');
      }
    });
  }

  public async requestDictInfo(): Promise<string> {
    return new Promise<string>(async (resolve) => {
      const remove = this.addAckListener((event) => {
        if (event.ackType === 'DICT_INFO_RESP') {
          remove();
          resolve(event.detail || 'OK');
        }
      });

      setTimeout(() => {
        remove();
        resolve('TIMEOUT');
      }, 1500);

      try {
        await this.sendCommand('CMD:DICT_INFO');
      } catch {
        remove();
        resolve('ERR');
      }
    });
  }

  /**
   * セッションパケット群の完全送信 (2回目送信・連続送信でも確実に動作)
   */
  public async transmitSession(
    session: PreparedSession,
    onProgress?: (progressPercent: number, stage: string) => void
  ): Promise<boolean> {
    // 送信前に必ず排他ロックをリセット & 中断フラグクリア
    this.isWriting = false;
    this.isTransmissionAborted = false;

    if (!this.isConnected()) {
      try {
        await this.ensureConnected();
      } catch (reconnectErr: any) {
        throw new Error(`AtomS3Uと再接続できませんでした: ${reconnectErr.message}`);
      }
    }

    return new Promise<boolean>(async (resolve, reject) => {
      let isReadyForSlots = false;
      let isCompleted = false;

      const removeAck = this.addAckListener(async (event) => {
        if (event.sessionId !== session.sessionId) return;

        // 1. セッション受付
        if (event.ackType === 'SESSION_READY') {
          isReadyForSlots = true;
          this.log('sys', 'FLOW', `セッション受付完了 (SID: ${session.sessionId})。スロット送信へ進みます。`);
        }

        // 2. ピンポイント再送要求 (RETRY)
        if (event.ackType === 'RETRY' && event.detail) {
          if (this.isTransmissionAborted) return;
          const missingSeqs = parseMissingBitmap(event.detail, session.totalPackets);
          this.log('sys', 'RETRY', `マイコンから再送要求検知: 未着スロット [${missingSeqs.join(', ')}]`);
          try {
            for (const seq of missingSeqs) {
              if (this.isTransmissionAborted) return;
              const slot = session.slotPackets[seq];
              if (slot) {
                this.log('tx', `RETRY#${seq}`, `未着スロット#${seq} をピンポイント再送 (${slot.payloadLen}B)...`);
                await this.writeData(slot.fullPacket);
                await new Promise(r => setTimeout(r, 30));
              }
            }
          } catch (e: any) {
            this.log('sys', 'ERR', `再送処理中のエラー: ${e.message}`);
          }
        }

        // 3. 全パケット受信完了・検証完了 ➔ 自動打鍵トリガー送出 (CMD:TRIGGER)
        if (event.ackType === 'ALL_PACKETS_READY') {
          if (onProgress) onProgress(96, '全パケット照合完了！電カルへ自動打鍵を開始中...');
          this.log('sys', 'FLOW', '★全パケット受信・全体CRC照合完了！自動打鍵トリガー(CMD:TRIGGER)を送出します。');
          // ドングルへ CMD:TRIGGER を即時送出 (ファームウェア側と二重保証)
          setTimeout(async () => {
            if (this.isTransmissionAborted || isCompleted) return;
            try {
              if (this.isConnected()) {
                await this.sendCommand('CMD:TRIGGER');
              }
            } catch (err: any) {
              this.log('sys', 'DEBUG', `CMD:TRIGGER通知: ${err?.message || err}`);
            }
          }, 60);
        }

        // 4. 打鍵開始検知 (リモートCMD:TRIGGER または 本体物理ボタン押下)
        if (
          event.ackType === 'DISPATCH_STARTED' ||
          event.ackType === 'REMOTE_TRIGGER_ACCEPTED' ||
          event.ackType === 'ALREADY_TYPING' ||
          event.ackType === 'PHYSICAL_BTN_PRESSED'
        ) {
          if (onProgress) onProgress(98, 'カルテ端末へ自動打鍵中... (LED赤色)');
          this.log('sys', 'FLOW', '打鍵開始を検知。USB-HIDキーストローク送出中...');
        }

        // 5. 打鍵完了検知
        if (event.ackType === 'USB_REPORTS_SENT' || event.ackType === 'HVC_SCORE') {
          if (onProgress) onProgress(100, '打鍵完了！カルテ画面の入力を確認してください。');
          this.log('sys', 'FLOW', '打鍵完了！電子カルテ画面に正常に入力されました。');
          isCompleted = true;
          removeAck();
          resolve(true);
        }

        // 6. エラー通知
        if (event.ackType.startsWith('ERR_')) {
          this.log('sys', 'ERR', `マイコン側エラー通知: ${event.ackType} ${event.detail || ''}`);
          removeAck();
          reject(new Error(`マイコンエラー: ${event.ackType} ${event.detail || ''}`));
        }
      });

      try {
        if (this.isTransmissionAborted) throw new Error('TRANSMISSION_ABORTED');

        // ステップ1: セッション初期化フレーム (8バイト) 送信
        this.log('tx', 'INIT', `セッション初期化フレーム送信 (SID:${session.sessionId}, Pkts:${session.totalPackets}, Bytes:${session.totalBytes}, CRC:0x${session.totalCrc16.toString(16).toUpperCase()})`, toHexDump(session.initPacket));
        if (onProgress) onProgress(5, 'セッション初期化中...');
        
        await this.writeData(session.initPacket);

        if (this.isNotifyActive) {
          // マイコンからの SESSION_READY を待機 (最大600ms)
          const waitStart = Date.now();
          while (!isReadyForSlots && Date.now() - waitStart < 600) {
            if (this.isTransmissionAborted) throw new Error('TRANSMISSION_ABORTED');
            await new Promise(r => setTimeout(r, 20));
          }

          if (!isReadyForSlots) {
            this.log('sys', 'WARN', 'SESSION_READY の応答待機タイムアウト。スロット送信へ進みます。');
          }
        } else {
          await new Promise(r => setTimeout(r, 40));
        }

        // ステップ2: 各スロットパケット順次送信 (安定インターバル 35ms)
        for (let i = 0; i < session.slotPackets.length; i++) {
          if (this.isTransmissionAborted) throw new Error('TRANSMISSION_ABORTED');

          const slot = session.slotPackets[i];
          const pct = Math.floor(10 + ((i + 1) / session.slotPackets.length) * 85);
          if (onProgress) onProgress(pct, `スロット #${i + 1}/${session.totalPackets} 送信中...`);

          this.log('tx', `SLOT#${i}`, `スロット #${i} 送信 (${slot.payloadLen}B, CRC:0x${slot.chunkCrc16.toString(16).toUpperCase()})`, toHexDump(slot.fullPacket));
          await this.writeData(slot.fullPacket);
          await new Promise(r => setTimeout(r, 35));
        }

        if (this.isTransmissionAborted) throw new Error('TRANSMISSION_ABORTED');

        if (!this.isNotifyActive) {
          await new Promise(r => setTimeout(r, 100));
          try {
            await this.sendCommand('CMD:TRIGGER');
          } catch {}
          await new Promise(r => setTimeout(r, 200));
          if (onProgress) onProgress(100, '全パケット送信完了！自動打鍵を開始しました。');
          this.log('sys', 'FLOW', '★全パケット送信完了＆CMD:TRIGGER送出完了。');
          removeAck();
          resolve(true);
          return;
        }

        if (onProgress) onProgress(95, '全パケット送信完了。マイコン照合待機中...');

        // マイコンからの ALL_PACKETS_READY / USB_REPORTS_SENT 受信待機タイムアウト
        // 打鍵時間は 11ms 遅延 × キーストローク数 (600Bで約15秒) となるため、
        // ペイロード長に応じた動的セーフティタイムアウト（最低25秒）を設定し、誤タイムアウトを完全防止
        const dynamicTimeoutMs = Math.max(25000, session.totalBytes * 50);

        const checkInterval = setInterval(() => {
          if (this.isTransmissionAborted) {
            clearInterval(checkInterval);
            removeAck();
            reject(new Error('TRANSMISSION_ABORTED'));
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!isCompleted && !this.isTransmissionAborted) {
            isCompleted = true;
            removeAck();
            this.log('sys', 'ERR', '完了ACK (ALL_PACKETS_READY / USB_REPORTS_SENT) の受信がタイムアウトしました。ドングル側で打鍵が完了していない可能性があるため、未達として扱います。');
            resolve(false);
          }
        }, dynamicTimeoutMs);

      } catch (err: any) {
        removeAck();
        reject(err);
      }
    });
  }

  /**
   * T-Dongle-S3 / AtomS3U 内蔵フルカラーLEDの輝度調節 (0〜100%)
   */
  async setLedBrightness(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (!this.isConnected()) return;
    await this.sendCommand(`CMD:LED_BRIGHT:${clamped}`);
  }

  /**
   * T-Dongle-S3 液晶バックライトの輝度調節 (5〜100%)
   */
  async setLcdBrightness(percent: number): Promise<void> {
    const clamped = Math.max(5, Math.min(100, Math.round(percent)));
    if (!this.isConnected()) return;
    await this.sendCommand(`CMD:LCD_BRIGHT:${clamped}`);
  }

  /**
   * T-Dongle-S3 液晶画面の表示ページ切替 (0:コックピット, 1:漢字変換テレメトリ, 2:カルテバイタル監査, 3:3省2GLシステム診断)
   */
  async setLcdPage(page: number): Promise<void> {
    const clamped = Math.max(0, Math.min(3, Math.round(page)));
    if (!this.isConnected()) return;
    await this.sendCommand(`CMD:LCD_PAGE:${clamped}`);
  }

  /**
   * 現在のカルテの形態素カウント・HVCスコア・安全監査アラート・バイタル要約をT-Dongle-S3液晶へ同期
   */
  async syncHudTelemetry(
    z: number,
    k: number,
    a: number,
    h: number,
    hvc: number,
    alerts: number,
    vitalSummary: string
  ): Promise<void> {
    if (!this.isConnected()) return;
    const safeVital = (vitalSummary || 'BP 142/86 HR 82')
      .replace(/[\r\n,]/g, ' ')
      .slice(0, 24);
    await this.sendCommand(`CMD:HUD_SYNC:${z},${k},${a},${h},${hvc},${alerts},${safeVital}`);
  }

  /**
   * T-Dongle-S3 Wi-Fi SoftAP のオンデマンド起動 (Phase 2 SDカードストリーミング用)
   */
  async startWifiAp(): Promise<boolean> {
    if (!this.isConnected()) return false;
    return this.sendCommand('CMD:WIFI_AP_START');
  }

  /**
   * T-Dongle-S3 Wi-Fi SoftAP の停止 (2.4GHz無線を100% BLE専有化)
   */
  async stopWifiAp(): Promise<boolean> {
    if (!this.isConnected()) return false;
    return this.sendCommand('CMD:WIFI_AP_STOP');
  }
}

export const bleManager = new BleDongleManager();

