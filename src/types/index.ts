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
  MODE_ALT_NUMPAD = 3,       // ★ Windows標準 Alt+テンキー 100%決定論モード (IME完全バイパス)
}

export enum EhrNewlineMode {
  NORMAL_ENTER = 'enter',       // 標準改行 (Enter)
  MICS_ALT_ENTER = 'alt_enter', // MICS Navigator等 (Alt + Enter: ペイン閉鎖防止)
  CTRL_ENTER = 'ctrl_enter',    // 富士通EGMAIN等 (Ctrl + Enter)
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

export const DEFAULT_PRESET_TEMPLATES: MedicalTemplate[] = [
  {
    id: 'preset_angina_soap',
    title: '労作性狭心症・胸痛精査 SOAP',
    category: 'soap',
    description: '胸部圧迫感・ST低下・ニトロペン処方の循環器標準SOAP',
    content: `【S】昨日夕方より階段昇降時に前胸部圧迫感および冷汗が出現。安静にて約5分で軽快。左肩への放散痛あり。
【O】BP 158/94mmHg、HR 88bpm（整）、SpO2 97%(room air)、BT 36.6℃。心音：整、心雑音なし。呼吸音：清。12誘導心電図にてV4-V6誘導に水平型ST低下(0.15mV)を認める。内服：アムロジピン錠5mg、アトルバスタチン錠10mg。
【A】#1 労作性狭心症の疑い（急性冠症候群の除外が必要） #2 高血圧症 #3 脂質異常症
【P】迅速トロポニンT・CK-MB・Dダイマー採血、心エコー実施。発作時頓用としてニトロペン舌下錠0.3mg処方。循環器内科へ冠動脈CT・CAG精査紹介。`,
  },
  {
    id: 'preset_uri_soap',
    title: '急性上気道炎・発熱外来 SOAP',
    category: 'soap',
    description: '発熱・咽頭痛・咳嗽に対する内科外来SOAP定型文',
    content: `【S】昨日より38.2℃の発熱、咽頭痛、乾性咳嗽が出現。食事・水分摂取は可能。周囲に感冒流行なし。
【O】BP 122/76mmHg、HR 84bpm、SpO2 98%(room air)、BT 37.8℃。咽頭発赤軽度、扁桃白苔なし、頸部リンパ節腫脹なし。胸部聴診：呼吸音清、ラ音なし。SARS-CoV-2/Flu迅速抗原検査：陰性。
【A】#1 急性上気道炎
【P】対症療法としてアセトアミノフェン錠500mg（頓用）、トラネキサム酸錠250mg、デキストロメトルファン錠15mgを5日分処方。水分補給・安静指導。高熱持続や呼吸苦出現時は即時再診指示。`,
  },
  {
    id: 'preset_ht_dm_followup',
    title: '生活習慣病（高血圧・脂質異常症・糖尿病）定期再診',
    category: 'preset',
    description: '慢性疾患の定期処方継続・家庭血圧確認SOAP',
    content: `【S】自覚症状なし。家庭血圧は朝125/78mmHg前後で安定。胸痛・動悸・息切れ・低血糖症状なし。服薬アドヒアランス良好。
【O】BP 128/80mmHg、HR 72bpm（整）、SpO2 98%。心音純、呼吸音清、下腿浮腫なし。採血：HbA1c 6.4%、LDL-C 98mg/dL、eGFR 68.5mL/min、AST 22、ALT 19。
【A】#1 高血圧症（コントロール良好） #2 脂質異常症 #3 2型糖尿病
【P】アムロジピン錠5mg 1T1x朝食後、アトルバスタチン錠10mg 1T1x夕食後を60日分Do処方。減塩・有酸素運動継続指導。次回2ヶ月後採血・再診。`,
  },
  {
    id: 'preset_referral_summary',
    title: '専門医紹介・箇条書き臨床サマリー',
    category: 'short',
    description: '高次医療機関・専門科への紹介用 簡潔箇条書き要約',
    content: `【臨床経過・主訴】
・労作時前胸部圧迫感、冷汗、左肩放散痛（持続5分、安静軽快）
【主要所見・バイタル・内服】
・BP 158/94mmHg、HR 88bpm、SpO2 97%(RA)
・12誘導心電図：V4〜V6水平型ST低下(0.15mV)
・既往・内服：高血圧症・脂質異常症（アムロジピン5mg、アトルバスタチン10mg内服中）
【アセスメント・方針】
・労作性狭心症（不安定狭心症を含む虚血性心疾患）疑い
・ニトロペン舌下錠0.3mg処方の上、貴科にて冠動脈精査をお願い申し上げます。`,
  },
];

