/**
 * DrVoice どんぐり君！ 型定義
 */

export enum SystemState {
  STATE_USB_NOT_READY = 'STATE_USB_NOT_READY',     // USBキーボード未マウント (紫色)
  STATE_WAITING_BLE = 'STATE_WAITING_BLE',         // BLE接続待機中 (青色)
  STATE_BLE_CONNECTED = 'STATE_BLE_CONNECTED',     // BLEペアリング済み・待機中 (緑色)
  STATE_RECEIVING = 'STATE_RECEIVING',             // パケット受信・CRC検証中 (青緑色)
  STATE_READY_TO_TYPE = 'STATE_READY_TO_TYPE',     // 受信・完全性検証完了・医師ボタン待ち (黄色)
  STATE_TYPING = 'STATE_TYPING',                   // USB-HID直接打鍵中・排他ロック (赤色)
  STATE_ERROR = 'STATE_ERROR',                     // エラー発生 (赤点滅/消去)
}

export enum DispatchMode {
  MODE_RAW_ASCII = 0,        // カルテ番号、患者ID、半角英数字
  MODE_IME_ROMAJI = 1,       // クライアント側IME協調ローマ字・自動確定シーケンス
  MODE_ONDEVICE_SPIFFS = 2,  // 【選択肢B】オンデバイス完結型: AtomS3U SPIFFS 医療マスター二分探索モード
  MODE_HYBRID_UNICODE = 2,   // ★ HYBRID Unicode 4層打鍵パイプライン（v14.0標準）
}

export interface LedStatus {
  colorName: string;
  hex: string;
  rgb: [number, number, number];
  description: string;
  blinking?: boolean;
}

export interface PacketSlot {
  seqNo: number;
  received: boolean;
  length: number;
  crc16: number;
  preview: string;
}

export interface BlePacketInfo {
  sessionId: number;
  seqNo: number;
  totalPackets: number;
  mode: DispatchMode;
  payloadLen: number;
  chunkCrc16: number;
  payloadHex: string;
  payloadText: string;
}

export interface SessionTransmissionStatus {
  sessionId: number;
  totalPackets: number;
  totalBytes: number;
  totalCrc16: number;
  mode: DispatchMode;
  slots: PacketSlot[];
  progress: number;
  status: 'idle' | 'initializing' | 'sending' | 'waiting_button' | 'typing' | 'completed' | 'failed';
  lastAck?: string;
  retryBitmap?: number;
  errorMessage?: string;
  startTime?: number;
  endTime?: number;
}

export interface MedicalTemplate {
  id: string;
  title: string;
  category: 'preset' | 'soap' | 'endoscopy' | 'prescription' | 'vitals' | 'short' | 'custom';
  description: string;
  content: string;
  isCustom?: boolean;
  createdAt?: number;
}

export interface CommunicationLogEntry {
  id: string;
  timestamp: string;
  direction: 'tx' | 'rx' | 'sys';
  tag: string;
  message: string;
  hex?: string;
}

// -----------------------------------------------------------------------------
// 電子カルテPCカレントペイン ＆ スマホ双方向インタラクティブ送受信プロトコル定義
// -----------------------------------------------------------------------------

export type EhrPaneId = 'SOAP_S' | 'SOAP_O' | 'SOAP_A' | 'SOAP_P' | 'PRESCRIPTION' | 'FREE_TEXT';

export interface EhrPaneDefinition {
  id: EhrPaneId;
  label: string;
  shortLabel: string;
  placeholder: string;
  shortcut: string;
  accentColor: string;
}

export const EHR_PANES: EhrPaneDefinition[] = [
  {
    id: 'SOAP_S',
    label: '【S】主訴・自覚症状 (Subjective)',
    shortLabel: 'S: 主訴',
    placeholder: '患者の訴え、病歴、問診内容を入力...',
    shortcut: 'Alt+1',
    accentColor: '#0ea5e9' // sky
  },
  {
    id: 'SOAP_O',
    label: '【O】客観的所見・診察 (Objective)',
    shortLabel: 'O: 所見',
    placeholder: '身体診察所見、バイタル、検査結果を入力...',
    shortcut: 'Alt+2',
    accentColor: '#10b981' // emerald
  },
  {
    id: 'SOAP_A',
    label: '【A】評価・診断 (Assessment)',
    shortLabel: 'A: 評価',
    placeholder: '診断名、病態評価、病態考察を入力...',
    shortcut: 'Alt+3',
    accentColor: '#f59e0b' // amber
  },
  {
    id: 'SOAP_P',
    label: '【P】治療方針・計画 (Plan)',
    shortLabel: 'P: 計画',
    placeholder: '治療方針、生活指導、次回予約を入力...',
    shortcut: 'Alt+4',
    accentColor: '#8b5cf6' // violet
  },
  {
    id: 'PRESCRIPTION',
    label: '【Rp】処方オーダー・検査指示',
    shortLabel: 'Rp: 処方',
    placeholder: '薬品名、用法用量、日数、検査指示を入力...',
    shortcut: 'Alt+5',
    accentColor: '#ec4899' // pink
  },
  {
    id: 'FREE_TEXT',
    label: '【自由記事】経過記録カレントペイン',
    shortLabel: '自由記事',
    placeholder: 'カルテ本文、総合経過記録、特記事項を入力...',
    shortcut: 'Alt+6',
    accentColor: '#64748b' // slate
  }
];

export interface EhrStationState {
  roomId: string;
  activePane: EhrPaneId;
  panes: Record<EhrPaneId, string>;
  cursor: {
    paneId: EhrPaneId;
    cursorPosition: number;
    selectionStart?: number;
    selectionEnd?: number;
  };
  patient: {
    id: string;
    name: string;
    kana: string;
    age: number;
    gender: '男性' | '女性';
    insurance: string;
    allergy: string;
  };
  connectedPeers: {
    pcCount: number;
    phoneCount: number;
  };
  lastUpdateSource: 'ehr-pc' | 'phone-app' | 'dongle';
  lastUpdatedAt: number;
}

export type WsClientRole = 'ehr-pc' | 'phone-app';

export type WsMessage =
  | { type: 'JOIN'; roomId: string; role: WsClientRole; clientInfo?: string }
  | { type: 'STATE_INIT'; state: EhrStationState }
  | { type: 'PANE_FOCUS'; roomId: string; paneId: EhrPaneId; cursorPosition?: number; sourceRole: WsClientRole }
  | { type: 'PANE_UPDATE'; roomId: string; paneId: EhrPaneId; text: string; sourceRole: WsClientRole }
  | { type: 'KEYSTROKE_INJECT'; roomId: string; paneId: EhrPaneId; text: string; mode: DispatchMode; sourceRole: WsClientRole }
  | { type: 'BTN_PRESS'; roomId: string; sourceRole: WsClientRole }
  | { type: 'CLEAR_PANE'; roomId: string; paneId?: EhrPaneId; sourceRole: WsClientRole }
  | { type: 'PEER_STATUS'; pcCount: number; phoneCount: number };

