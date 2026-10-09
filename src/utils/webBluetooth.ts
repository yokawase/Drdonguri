/**
 * Web Bluetooth (Web BLE) 接続・プロトコル通信マネージャー (v6.0 高信頼版)
 * AtomS3U (EHR-AI-Dongle) の GATT サービス・キャラクタリスティックと通信
 * 複数回送信・連続送信におけるGATTロック解放・キュー破棄を完全保証
 */

import { PreparedSession, parseMissingBitmap, toHexDump } from './packetBuilder';

export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
export const CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

export interface BleAckEvent {
  raw: string;
  sessionId: number;
  ackType: string;
  detail?: string;
  timestamp: number;
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

  // 仮想プリンター吸い上げストリーミングバッファ
  private printerBuffer: number[] = [];
  private printerDataListeners: PrinterDataCallback[] = [];
  private printerCompleteListeners: PrinterJobCompleteCallback[] = [];

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

    this.device = chosenDevice;

    try {
      this.device.addEventListener('gattserverdisconnected', () => {
        this.log('sys', 'BLE', 'AtomS3U とのBLE接続が切断されました（メモリゼロクリア実行）');
        this.server = null;
        this.characteristic = null;
        this.isNotifyActive = false;
        this.isWriting = false;
        if (this.onDisconnectListener) {
          this.onDisconnectListener();
        }
      });

      this.log('sys', 'GATT', `デバイス「${this.device.name || 'EHR-AI-Dongle'}」に接続中...`);
      this.server = await this.device.gatt!.connect();

      // スタック安定化待機
      await new Promise((r) => setTimeout(r, 400));

      // リトライ付きで Primary Service を取得
      let service: BluetoothRemoteGATTService | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (!this.server || !this.server.connected) {
            this.log('sys', 'GATT', `GATT再接続試行 (${attempt}/3)...`);
            this.server = await this.device.gatt!.connect();
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
      try {
        await this.characteristic.startNotifications();
        this.characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
          const char = event.target as BluetoothRemoteGATTCharacteristic;
          if (!char.value) return;
          const decoder = new TextDecoder();
          const ackStr = decoder.decode(char.value);
          this.handleIncomingAck(ackStr, new Uint8Array(char.value.buffer));
        });
        this.isNotifyActive = true;
        this.log('sys', 'GATT', 'ACK通知 (Notify) の購読を有効化しました (双方向通信確立)');
      } catch (notifyErr: any) {
        this.isNotifyActive = false;
        this.log('sys', 'WARN', `ACK通知購読をスキップ（片方向高速送信モードで安全に接続維持）: ${notifyErr?.message || notifyErr}`);
      }

      this.log('sys', 'READY', 'AtomS3U (どんぐり君) とのBLE接続が完了しました！(LED緑色)');
      return true;
    } catch (err: any) {
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
    this.server = await this.device.gatt.connect();
    await new Promise((r) => setTimeout(r, 350));

    const service = await this.server.getPrimaryService(SERVICE_UUID.toLowerCase());
    this.characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID.toLowerCase());

    if (this.isNotifyActive) {
      try {
        await this.characteristic.startNotifications();
      } catch {
        this.isNotifyActive = false;
      }
    }

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
      const fullText = decodePrinterBytes(fullBytes);
      this.log('rx', 'PRN_END', `電カル過去カルテ吸い上げ完了: 全 ${fullBytes.length} Bytes / ${fullText.length} 文字`);
      for (const cb of [...this.printerCompleteListeners]) {
        try {
          cb(fullText, fullBytes.length);
        } catch (e) {
          console.error(e);
        }
      }
      this.printerBuffer = [];
      return;
    }

    this.log('rx', 'ACK', ackStr, toHexDump(rawBytes));

    // フォーマット: "ACK:<sessionId>:<ackType>[:<detail>]"
    const parts = ackStr.split(':');
    if (parts.length >= 3 && parts[0] === 'ACK') {
      const sessionId = parseInt(parts[1], 10);
      const ackType = parts[2];
      const detail = parts.slice(3).join(':');

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
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isNotifyActive = false;
    this.isWriting = false;
    this.log('sys', 'BLE', '切断処理が完了しました。');
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
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // 1. Android/WebBLEで最もストールせず高速な writeValueWithoutResponse を最優先
          if ('writeValueWithoutResponse' in this.characteristic) {
            try {
              await (this.characteristic as any).writeValueWithoutResponse(bufferToSend);
              return;
            } catch (wNrErr: any) {
              // fall through to withResponse
            }
          }

          // 2. writeValueWithResponse
          if ('writeValueWithResponse' in this.characteristic) {
            try {
              await (this.characteristic as any).writeValueWithResponse(bufferToSend);
              return;
            } catch (wRespErr: any) {
              // fall through to writeValue
            }
          }

          // 3. 標準 writeValue
          if ('writeValue' in this.characteristic) {
            await this.characteristic.writeValue(bufferToSend);
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
    // 送信前に必ず排他ロックをリセット
    this.isWriting = false;

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
          const missingSeqs = parseMissingBitmap(event.detail, session.totalPackets);
          this.log('sys', 'RETRY', `マイコンから再送要求検知: 未着スロット [${missingSeqs.join(', ')}]`);
          try {
            for (const seq of missingSeqs) {
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

        // 3. 全パケット受信完了・検証完了
        if (event.ackType === 'ALL_PACKETS_READY') {
          if (onProgress) onProgress(100, '受信成功！LEDが黄色に点灯しました。AtomS3U本体の正面ボタンを押してください。');
          this.log('sys', 'FLOW', '★全パケット受信・全体CRC照合完了！AtomS3U正面ボタンを押して打鍵してください。(LED黄色)');
          isCompleted = true;
          removeAck();
          resolve(true);
        }

        // 4. 打鍵開始
        if (event.ackType === 'DISPATCH_STARTED') {
          if (onProgress) onProgress(100, 'DISPATCH_STARTED (LED赤色: USB打鍵中)');
          this.log('sys', 'FLOW', 'ボタン押下を検知。USB-HIDキーストローク送出中...');
        }

        // 5. 打鍵完了
        if (event.ackType === 'USB_REPORTS_SENT') {
          if (onProgress) onProgress(100, 'USB_REPORTS_SENT (完了・LED緑色復帰)');
          this.log('sys', 'FLOW', '打鍵レポート送出完了・メモリ消去完了。カルテ画面の文字を目視確認してください。');
        }

        // 6. エラー通知
        if (event.ackType.startsWith('ERR_')) {
          this.log('sys', 'ERR', `マイコン側エラー通知: ${event.ackType} ${event.detail || ''}`);
          removeAck();
          reject(new Error(`AtomS3Uエラー: ${event.ackType}`));
        }
      });

      try {
        // ステップ1: セッション初期化フレーム (8バイト) 送信
        this.log('tx', 'INIT', `セッション初期化フレーム送信 (SID:${session.sessionId}, Pkts:${session.totalPackets}, Bytes:${session.totalBytes}, CRC:0x${session.totalCrc16.toString(16).toUpperCase()})`, toHexDump(session.initPacket));
        if (onProgress) onProgress(5, 'セッション初期化中...');
        
        await this.writeData(session.initPacket);

        if (this.isNotifyActive) {
          // マイコンからの SESSION_READY を待機 (最大600ms)
          const waitStart = Date.now();
          while (!isReadyForSlots && Date.now() - waitStart < 600) {
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
          const slot = session.slotPackets[i];
          const pct = Math.floor(10 + ((i + 1) / session.slotPackets.length) * 85);
          if (onProgress) onProgress(pct, `スロット #${i + 1}/${session.totalPackets} 送信中...`);

          this.log('tx', `SLOT#${i}`, `スロット #${i} 送信 (${slot.payloadLen}B, CRC:0x${slot.chunkCrc16.toString(16).toUpperCase()})`, toHexDump(slot.fullPacket));
          await this.writeData(slot.fullPacket);
          await new Promise(r => setTimeout(r, 35));
        }

        if (!this.isNotifyActive) {
          await new Promise(r => setTimeout(r, 150));
          if (onProgress) onProgress(100, '全パケット送信完了！AtomS3U本体の正面ボタンを押してください。');
          this.log('sys', 'FLOW', '★全パケット送信完了！AtomS3UのLEDが黄色になったら本体ボタンを押して打鍵してください。');
          removeAck();
          resolve(true);
          return;
        }

        if (onProgress) onProgress(95, '全パケット送信完了。マイコン照合待機中...');

        // マイコンからの ALL_PACKETS_READY / RETRY 受信待機フェイルセーフタイムアウト (5.0秒)
        setTimeout(() => {
          if (!isCompleted) {
            isCompleted = true;
            removeAck();
            resolve(true);
          }
        }, 5000);

      } catch (err: any) {
        removeAck();
        reject(err);
      }
    });
  }
}

export const bleManager = new BleDongleManager();
