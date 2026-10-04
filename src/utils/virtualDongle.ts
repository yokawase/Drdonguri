/**
 * 仮想 M5Stack AtomS3U (どんぐり君) シミュレータ
 * v5.0 ファームウェア (src/main.cpp) のステートマシン・メモリ管理・JIS打鍵を完全エミュレーション
 */

import { SystemState, DispatchMode, LedStatus } from '../types';
import { calculateCrc16 } from './crc16';
import { 
  MAX_PAYLOAD_SIZE, 
  MAX_PACKETS, 
  MAX_PACKET_LEN, 
  readUint16LE, 
  PreparedSession,
  PreparedSlotPacket 
} from './packetBuilder';
import { fnv1a32, PRESET_MEDICAL_TERMS, MEDICAL_RARE_KANJI_CATALOG } from './medicalDictCompiler';

export interface VirtualDongleListener {
  onStateChange: (state: SystemState, led: LedStatus) => void;
  onAckGenerated: (ackStr: string) => void;
  onKeystroke: (char: string, accumulatedText: string) => void;
  onMemoryWiped: () => void;
  onLog: (direction: 'tx' | 'rx' | 'sys', tag: string, msg: string) => void;
}

export const LED_DEFINITIONS: Record<SystemState, LedStatus> = {
  [SystemState.STATE_USB_NOT_READY]: {
    colorName: '紫色 (USB未接続)',
    hex: '#c026d3',
    rgb: [192, 38, 211],
    description: 'PCにUSBキーボードとして認識されていない警告',
  },
  [SystemState.STATE_WAITING_BLE]: {
    colorName: '青色 (BLE待機中)',
    hex: '#2563eb',
    rgb: [0, 0, 64],
    description: '起動完了・スマホからのBLE接続待機中',
  },
  [SystemState.STATE_BLE_CONNECTED]: {
    colorName: '緑色 (BLE接続中)',
    hex: '#16a34a',
    rgb: [0, 64, 0],
    description: 'スマホとペアリング完了・通信可能',
  },
  [SystemState.STATE_RECEIVING]: {
    colorName: '青緑色 (パケット受信中)',
    hex: '#0891b2',
    rgb: [0, 48, 64],
    description: 'パケット受信中・CRC検証中',
  },
  [SystemState.STATE_READY_TO_TYPE]: {
    colorName: '黄色 (打鍵待機中)',
    hex: '#ca8a04',
    rgb: [64, 64, 0],
    description: '受信・完全性検証完了（医師のボタン押下待機）',
  },
  [SystemState.STATE_TYPING]: {
    colorName: '赤色 (USB送出中)',
    hex: '#dc2626',
    rgb: [64, 0, 0],
    description: 'USB-HID打鍵中（二重実行ロック）',
  },
  [SystemState.STATE_ERROR]: {
    colorName: '赤点滅 (エラー)',
    hex: '#ef4444',
    rgb: [64, 0, 0],
    description: 'CRC不一致またはパラメータ異常',
    blinking: true,
  },
};

export class VirtualDongleSimulator {
  public currentState: SystemState = SystemState.STATE_BLE_CONNECTED;
  public isUsbMounted: boolean = true;
  public isBleConnected: boolean = true;
  
  // ファームウェア MessageContext のエミュレーション
  private sessionId: number = 0;
  private totalPackets: number = 0;
  private receivedCount: number = 0;
  private expectedTotalBytes: number = 0;
  private expectedTotalCrc: number = 0;
  private mode: DispatchMode = DispatchMode.MODE_IME_ROMAJI;
  private actualTotalBytes: number = 0;
  private slots: { received: boolean; len: number; payload: Uint8Array }[] = [];
  private assembledBuffer: string = '';
  private typedText: string = '';

  private listener: VirtualDongleListener | null = null;
  private isTyping: boolean = false;

  constructor() {
    this.resetSlots();
  }

  public setListener(listener: VirtualDongleListener): void {
    this.listener = listener;
    this.notifyState();
  }

  private resetSlots(): void {
    this.slots = [];
    for (let i = 0; i < MAX_PACKETS; i++) {
      this.slots.push({ received: false, len: 0, payload: new Uint8Array(MAX_PACKET_LEN) });
    }
  }

  private notifyState(): void {
    if (this.listener) {
      this.listener.onStateChange(this.currentState, LED_DEFINITIONS[this.currentState]);
    }
  }

  private sendAck(ackType: string, detail?: string): void {
    const msg = detail ? `ACK:${this.sessionId}:${ackType}:${detail}` : `ACK:${this.sessionId}:${ackType}`;
    if (this.listener) {
      this.listener.onAckGenerated(msg);
      this.listener.onLog('rx', 'DONGLE_ACK', msg);
    }
  }

  /**
   * 医療情報セキュリティ：セキュアメモリ消去 (secureWipeMessageContext) のエミュレーション
   */
  public secureWipeMessageContext(): void {
    this.sessionId = 0;
    this.totalPackets = 0;
    this.receivedCount = 0;
    this.expectedTotalBytes = 0;
    this.expectedTotalCrc = 0;
    this.actualTotalBytes = 0;
    this.assembledBuffer = '';
    this.resetSlots();
    if (this.listener) {
      this.listener.onMemoryWiped();
      this.listener.onLog('sys', 'SECURE', 'AtomS3U メモリゼロクリア完了 (secureWipeMessageContext)');
    }
  }

  public sendNumUnlock(): void {
    if (this.listener) {
      this.listener.onLog('tx', 'USB_HID', '★[NumLock解除] USB HID Usage 0x53 (NumLock トグル) を送出してテンキー固定を解除しました');
    }
    this.sendAck('NUM_UNLOCKED', 'OK');
  }

  public setUsbMounted(mounted: boolean): void {
    this.isUsbMounted = mounted;
    if (!mounted) {
      this.currentState = SystemState.STATE_USB_NOT_READY;
      this.sendAck('ERR_USB_NOT_READY');
    } else {
      this.currentState = this.isBleConnected ? SystemState.STATE_BLE_CONNECTED : SystemState.STATE_WAITING_BLE;
    }
    this.notifyState();
  }

  public setBleConnected(connected: boolean): void {
    this.isBleConnected = connected;
    if (!connected) {
      this.currentState = SystemState.STATE_WAITING_BLE;
      this.secureWipeMessageContext();
    } else {
      this.currentState = this.isUsbMounted ? SystemState.STATE_BLE_CONNECTED : SystemState.STATE_USB_NOT_READY;
    }
    this.notifyState();
  }

  /**
   * セッション初期化フレーム (8バイト) の受信処理
   */
  public receiveInitFrame(data: Uint8Array): void {
    if (data.length !== 8) {
      this.sendAck('ERR_INIT_PARAMS');
      return;
    }

    const sid = readUint16LE(data, 0);
    const totPkts = data[2];
    const totBytes = readUint16LE(data, 3);
    const totCrc = readUint16LE(data, 5);

    if (totPkts === 0 || totPkts > MAX_PACKETS || totBytes === 0 || totBytes > MAX_PAYLOAD_SIZE) {
      this.sendAck('ERR_INIT_PARAMS', sid.toString());
      return;
    }

    this.secureWipeMessageContext();
    this.sessionId = sid;
    this.totalPackets = totPkts;
    this.expectedTotalBytes = totBytes;
    this.expectedTotalCrc = totCrc;
    this.currentState = SystemState.STATE_RECEIVING;
    this.notifyState();

    this.sendAck('SESSION_READY');
  }

  /**
   * データスロットフレーム (8Bヘッダ + ペイロード) の受信処理
   */
  public receiveSlotFrame(data: Uint8Array): void {
    if (data.length < 8) return;

    const sid = readUint16LE(data, 0);
    const seqNo = data[2];
    const mode = data[3];
    const payloadLen = readUint16LE(data, 4);
    const chunkCrc = readUint16LE(data, 6);
    const payload = data.slice(8);

    if (this.currentState !== SystemState.STATE_RECEIVING || this.sessionId !== sid) {
      this.sendAck('ERR_SESSION_MISMATCH', sid.toString());
      return;
    }

    if (seqNo >= this.totalPackets || payloadLen !== payload.length || payloadLen > MAX_PACKET_LEN) {
      this.sendAck('ERR_SLOT_HEADER', sid.toString());
      return;
    }

    // チャンクCRC16検証
    const actualChunkCrc = calculateCrc16(payload);
    if (actualChunkCrc !== chunkCrc) {
      this.sendAck('ERR_CHUNK_CRC', sid.toString());
      return;
    }

    // 重複チェック
    if (this.slots[seqNo].received) {
      const existingSlice = this.slots[seqNo].payload.slice(0, this.slots[seqNo].len);
      let same = true;
      if (this.slots[seqNo].len !== payloadLen) same = false;
      else {
        for (let k = 0; k < payloadLen; k++) {
          if (existingSlice[k] !== payload[k]) { same = false; break; }
        }
      }
      if (!same) {
        this.sendAck('ERR_SLOT_CONFLICT', sid.toString());
        this.secureWipeMessageContext();
        this.currentState = SystemState.STATE_ERROR;
        this.notifyState();
        return;
      }
    } else {
      this.slots[seqNo].len = payloadLen;
      this.slots[seqNo].payload.set(payload, 0);
      this.slots[seqNo].received = true;
      this.receivedCount++;
      this.mode = mode;
    }

    // 全パケット受信完了判定
    if (this.receivedCount === this.totalPackets) {
      let offset = 0;
      let bufferOverflow = false;
      const combined = new Uint8Array(MAX_PAYLOAD_SIZE + 1);

      for (let i = 0; i < this.totalPackets; i++) {
        if (offset + this.slots[i].len > MAX_PAYLOAD_SIZE) {
          bufferOverflow = true;
          break;
        }
        combined.set(this.slots[i].payload.slice(0, this.slots[i].len), offset);
        offset += this.slots[i].len;
      }

      if (bufferOverflow || offset !== this.expectedTotalBytes) {
        this.sendAck('ERR_LEN_MISMATCH');
        this.secureWipeMessageContext();
        this.currentState = SystemState.STATE_ERROR;
        this.notifyState();
        return;
      }

      // 全体CRC16検証
      const actualTotalCrc = calculateCrc16(combined.slice(0, offset));
      if (actualTotalCrc !== this.expectedTotalCrc) {
        this.sendAck('ERR_TOTAL_CRC');
        this.secureWipeMessageContext();
        this.currentState = SystemState.STATE_ERROR;
        this.notifyState();
        return;
      }

      // 検証成功 ➔ ボタン待機
      const decoder = new TextDecoder();
      this.assembledBuffer = decoder.decode(combined.slice(0, offset));
      this.actualTotalBytes = offset;
      this.currentState = SystemState.STATE_READY_TO_TYPE;
      this.notifyState();
      this.sendAck('ALL_PACKETS_READY');
    }
  }

  /**
   * 欠落スロット再送タイムアウトのエミュレーション（SeqNo 0欠落も対応）
   */
  public triggerTimeoutCheck(): void {
    if (this.currentState === SystemState.STATE_RECEIVING && this.receivedCount < this.totalPackets) {
      let missingBitmap = 0;
      for (let i = 0; i < this.totalPackets; i++) {
        if (!this.slots[i].received) {
          missingBitmap |= (1 << i);
        }
      }
      const bitmapHex = '0x' + missingBitmap.toString(16).toUpperCase().padStart(4, '0');
      this.sendAck('RETRY', bitmapHex);
    }
  }

  /**
   * 正面物理ボタン (M5.BtnA, GPIO 41) 押下イベント
   * 【設計原則 4: ヒューマン・イン・ザ・ループ】
   * 医師がカルテ入力欄を選択し、正面ボタンを押下した瞬間（エッジ検出）にのみ打鍵
   */
  public async pressPhysicalButton(): Promise<void> {
    if (this.currentState !== SystemState.STATE_READY_TO_TYPE || this.isTyping) {
      if (this.listener) {
        this.listener.onLog('sys', 'WARN', 'ボタン押下無視: パケット未準備または打鍵実行中です。');
      }
      return;
    }

    if (!this.isUsbMounted) {
      this.currentState = SystemState.STATE_USB_NOT_READY;
      this.notifyState();
      this.sendAck('ERR_USB_NOT_READY');
      return;
    }

    this.isTyping = true;
    this.currentState = SystemState.STATE_TYPING;
    this.notifyState();
    this.sendAck('DISPATCH_STARTED');

    // 打鍵エミュレーション (選択肢B: オンデバイスSPIFFS辞書探索 vs クライアント側トランスパイル)
    let buffer = this.assembledBuffer;

    if (this.listener) {
      this.listener.onLog('sys', 'DISPATCH', '★【v15.0 4層タグ・安全打鍵パイプライン】(ASCII直接 / カタカナF7一括 / ひらがなEnter即時確定 / 漢字熟語最小Chunk確定)');
    }

    let i = 0;
    while (i < buffer.length) {
      const char = buffer[i];

      // 1. 改行処理
      if (char === '\n' || char === '\r') {
        this.typedText += '\n';
        if (this.listener) {
          this.listener.onLog('tx', 'USB_HID', '★Enter (カルテ改行)');
          this.listener.onKeystroke('\n', this.typedText);
        }
        i++;
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      // 2. 4層タグ解析
      // A. [K]...[/K] (カタカナモード)
      if (buffer.slice(i).startsWith('[K]')) {
        const endIdx = buffer.indexOf('[/K]', i + 3);
        const chunk = endIdx !== -1 ? buffer.slice(i + 3, endIdx) : buffer.slice(i + 3);
        if (this.listener) {
          this.listener.onLog('tx', 'USB_HID', `[K] カタカナ打鍵: ${chunk} ➔ [F7] カタカナ強制 ➔ [Enter] 確定`);
        }
        this.typedText += chunk;
        if (this.listener) this.listener.onKeystroke(chunk, this.typedText);
        i = endIdx !== -1 ? endIdx + 4 : buffer.length;
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      // B. [H]...[/H] (ひらがな助詞モード)
      if (buffer.slice(i).startsWith('[H]')) {
        const endIdx = buffer.indexOf('[/H]', i + 3);
        const chunk = endIdx !== -1 ? buffer.slice(i + 3, endIdx) : buffer.slice(i + 3);
        if (this.listener) {
          this.listener.onLog('tx', 'USB_HID', `[H] ひらがな打鍵: ${chunk} ➔ [Enter] 直接確定 (Space禁止)`);
        }
        this.typedText += chunk;
        if (this.listener) this.listener.onKeystroke(chunk, this.typedText);
        i = endIdx !== -1 ? endIdx + 4 : buffer.length;
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      // C. [Z]...[/Z] (漢字熟語モード)
      if (buffer.slice(i).startsWith('[Z]')) {
        const endIdx = buffer.indexOf('[/Z]', i + 3);
        const chunk = endIdx !== -1 ? buffer.slice(i + 3, endIdx) : buffer.slice(i + 3);
        if (this.listener) {
          this.listener.onLog('tx', 'USB_HID', `[Z] 漢字熟語打鍵: ${chunk} ➔ [Space] 変換 ➔ [Enter] 確定`);
        }
        this.typedText += chunk;
        if (this.listener) this.listener.onKeystroke(chunk, this.typedText);
        i = endIdx !== -1 ? endIdx + 4 : buffer.length;
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      // D. [A]...[/A] (ASCII直接モード)
      if (buffer.slice(i).startsWith('[A]')) {
        const endIdx = buffer.indexOf('[/A]', i + 3);
        const chunk = endIdx !== -1 ? buffer.slice(i + 3, endIdx) : buffer.slice(i + 3);
        if (this.listener) {
          this.listener.onLog('tx', 'USB_HID', `[A] ASCII打鍵: ${chunk}`);
        }
        this.typedText += chunk;
        if (this.listener) this.listener.onKeystroke(chunk, this.typedText);
        i = endIdx !== -1 ? endIdx + 4 : buffer.length;
        await new Promise(r => setTimeout(r, 15));
        continue;
      }

      // E. レガシータグ解析
      if (buffer.slice(i).startsWith('<ENTER>') || buffer.slice(i).startsWith('[ENTER]')) {
        this.typedText += '\n';
        if (this.listener) this.listener.onKeystroke('\n', this.typedText);
        i += 7;
        continue;
      }
      if (buffer.slice(i).startsWith('<CONV>')) {
        this.typedText += ' ';
        if (this.listener) this.listener.onKeystroke(' ', this.typedText);
        i += 6;
        continue;
      }
      if (buffer.slice(i).startsWith('<SPACE>') || buffer.slice(i).startsWith('[SPACE]')) {
        this.typedText += ' ';
        if (this.listener) this.listener.onKeystroke(' ', this.typedText);
        i += 7;
        continue;
      }
      if (buffer.slice(i).startsWith('<IME_ON>')) { i += 8; continue; }
      if (buffer.slice(i).startsWith('<IME_OFF>')) { i += 9; continue; }

      // 3. 通常文字（平文の漢字が直接来た場合の脱落防止チェック）
      if (/[\u4e00-\u9faf]/.test(char)) {
        if (this.listener) {
          this.listener.onLog('sys', 'ERR', `★未対応漢字エラー: [${char}] が直接届きました (サイレントスキップは禁止されています)`);
        }
        this.sendAck('ERR_UNSUPPORTED_CHAR', char);
        this.currentState = SystemState.STATE_ERROR;
        this.notifyState();
        this.isTyping = false;
        return;
      }

      this.typedText += char;
      if (this.listener) {
        this.listener.onKeystroke(char, this.typedText);
      }
      i++;
      await new Promise(r => setTimeout(r, 12));
    }

    // 打鍵レポート送出完了通知 (※カルテ反映は医師の目視責任)
    this.sendAck('USB_REPORTS_SENT');

    // 白色点滅アニメーションエミュレーション
    if (this.listener) {
      this.listener.onStateChange(this.currentState, {
        colorName: '白色 (送信完了点滅)',
        hex: '#f8fafc',
        rgb: [64, 64, 64],
        description: '送出終了・メモリ消去完了',
        blinking: true,
      });
    }

    await new Promise(r => setTimeout(r, 200));

    // メモリ完全消去
    this.secureWipeMessageContext();
    this.isTyping = false;
    this.currentState = SystemState.STATE_BLE_CONNECTED;
    this.notifyState();
  }

  public clearTypedText(): void {
    this.typedText = '';
  }

  public getTypedText(): string {
    return this.typedText;
  }
}
