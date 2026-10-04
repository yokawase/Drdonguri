/**
 * 電子カルテPCカレントペイン ＆ スマホ双方向インタラクティブ通信クライアント
 * WebSocketsによる実インフラ双方向リアルタイム同期 (Server as Source of Truth)
 */

import { EhrPaneId, EhrStationState, WsClientRole, WsMessage, DispatchMode } from '../types';

export type EhrSyncListener = {
  onStateInit?: (state: EhrStationState) => void;
  onPaneFocus?: (paneId: EhrPaneId, cursorPosition?: number, sourceRole?: WsClientRole) => void;
  onPaneUpdate?: (paneId: EhrPaneId, text: string, sourceRole?: WsClientRole) => void;
  onKeystrokeInject?: (paneId: EhrPaneId, text: string, fullText: string, mode: DispatchMode, sourceRole?: WsClientRole) => void;
  onBtnPress?: (sourceRole?: WsClientRole) => void;
  onPeerStatus?: (pcCount: number, phoneCount: number) => void;
  onConnectionChange?: (connected: boolean, connecting: boolean, error?: string) => void;
};

export class EhrRealtimeClient {
  private ws: WebSocket | null = null;
  private roomId: string = 'clinic-station-1';
  private role: WsClientRole = 'phone-app';
  private listeners: Set<EhrSyncListener> = new Set();
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private reconnectTimer: any = null;
  private isDisposed: boolean = false;
  private isRemoteUpdateInProgress: boolean = false;

  constructor(roomId: string = 'clinic-station-1', role: WsClientRole = 'phone-app') {
    this.roomId = roomId;
    this.role = role;
  }

  public setRoomAndRole(roomId: string, role: WsClientRole) {
    const roomChanged = this.roomId !== roomId;
    const roleChanged = this.role !== role;
    this.roomId = roomId;
    this.role = role;

    if ((roomChanged || roleChanged) && this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: 'JOIN',
        roomId: this.roomId,
        role: this.role,
        clientInfo: navigator.userAgent
      });
    }
  }

  public getRoomId(): string {
    return this.roomId;
  }

  public getRole(): WsClientRole {
    return this.role;
  }

  public addListener(listener: EhrSyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public connect() {
    if (this.isDisposed) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    this.notifyConnectionChange(false, true);

    try {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const protocol = isHttps ? 'wss:' : 'ws:';
      const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
      const wsUrl = `${protocol}//${host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.notifyConnectionChange(true, false);

        // 参加メッセージ送信
        this.send({
          type: 'JOIN',
          roomId: this.roomId,
          role: this.role,
          clientInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (e) {
          console.error('[EhrSync] JSON parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        this.notifyConnectionChange(false, false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[EhrSync] WebSocket error, will reconnect:', err);
        this.isConnecting = false;
        this.notifyConnectionChange(false, false, 'Connection error');
      };
    } catch (err: any) {
      this.isConnecting = false;
      this.notifyConnectionChange(false, false, err?.message || 'Init failed');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isDisposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected && !this.isDisposed) {
        this.connect();
      }
    }, 2000);
  }

  private notifyConnectionChange(connected: boolean, connecting: boolean, error?: string) {
    for (const l of this.listeners) {
      l.onConnectionChange?.(connected, connecting, error);
    }
  }

  private handleIncomingMessage(msg: any) {
    switch (msg.type) {
      case 'STATE_INIT': {
        for (const l of this.listeners) {
          l.onStateInit?.(msg.state);
        }
        break;
      }
      case 'PANE_FOCUS': {
        for (const l of this.listeners) {
          l.onPaneFocus?.(msg.paneId, msg.cursorPosition, msg.sourceRole);
        }
        break;
      }
      case 'PANE_UPDATE': {
        this.isRemoteUpdateInProgress = true;
        for (const l of this.listeners) {
          l.onPaneUpdate?.(msg.paneId, msg.text, msg.sourceRole);
        }
        setTimeout(() => {
          this.isRemoteUpdateInProgress = false;
        }, 50);
        break;
      }
      case 'KEYSTROKE_INJECT': {
        for (const l of this.listeners) {
          l.onKeystrokeInject?.(msg.paneId, msg.text, msg.fullText, msg.mode, msg.sourceRole);
        }
        break;
      }
      case 'BTN_PRESS': {
        for (const l of this.listeners) {
          l.onBtnPress?.(msg.sourceRole);
        }
        break;
      }
      case 'PEER_STATUS': {
        for (const l of this.listeners) {
          l.onPeerStatus?.(msg.pcCount, msg.phoneCount);
        }
        break;
      }
      case 'CLEAR_PANE': {
        for (const l of this.listeners) {
          l.onPaneUpdate?.(msg.paneId, '', msg.sourceRole);
        }
        break;
      }
    }
  }

  public send(msg: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        console.error('[EhrSync] Send error:', e);
      }
    }
  }

  /**
   * カレントペインのフォーカス移動をPC/スマホへ通知
   */
  public focusPane(paneId: EhrPaneId, cursorPosition?: number) {
    this.send({
      type: 'PANE_FOCUS',
      roomId: this.roomId,
      paneId,
      cursorPosition,
      sourceRole: this.role
    });
  }

  /**
   * ペインのテキスト内容更新を相互送信
   */
  public updatePaneText(paneId: EhrPaneId, text: string) {
    if (this.isRemoteUpdateInProgress) return; // ループ防止
    this.send({
      type: 'PANE_UPDATE',
      roomId: this.roomId,
      paneId,
      text,
      sourceRole: this.role
    });
  }

  /**
   * スマホからPCカレントペインへのUSB-HID打鍵注入
   */
  public injectKeystroke(paneId: EhrPaneId, text: string, mode: DispatchMode = DispatchMode.MODE_IME_ROMAJI) {
    this.send({
      type: 'KEYSTROKE_INJECT',
      roomId: this.roomId,
      paneId,
      text,
      mode,
      sourceRole: this.role
    });
  }

  /**
   * 本体の物理ボタンまたはスマホ上の打鍵トリガー押下を通知
   */
  public pressButton() {
    this.send({
      type: 'BTN_PRESS',
      roomId: this.roomId,
      sourceRole: this.role
    });
  }

  /**
   * カレントペインまたは指定ペインのテキスト消去
   */
  public clearPane(paneId?: EhrPaneId) {
    this.send({
      type: 'CLEAR_PANE',
      roomId: this.roomId,
      paneId,
      sourceRole: this.role
    });
  }

  public disconnect() {
    this.isDisposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }
}

// シングルトンインスタンス管理用
let globalEhrSyncClient: EhrRealtimeClient | null = null;

export function getEhrSyncClient(roomId: string = 'clinic-station-1', role: WsClientRole = 'phone-app'): EhrRealtimeClient {
  if (!globalEhrSyncClient) {
    globalEhrSyncClient = new EhrRealtimeClient(roomId, role);
    globalEhrSyncClient.connect();
  } else {
    globalEhrSyncClient.setRoomAndRole(roomId, role);
  }
  return globalEhrSyncClient;
}
