import { describe, it, expect } from 'vitest';
import {
  buildTransmissionSession,
  IOS_SAFE_PAYLOAD_LEN,
  MAX_PACKETS,
  MAX_PACKET_LEN,
  SLOT_HEADER_SIZE,
} from '../src/utils/packetBuilder';
import { VirtualDongleSimulator } from '../src/utils/virtualDongle';
import { DispatchMode } from '../src/types';

describe('iPad / iOS Bluefy 単一ATT PDUパケットサイズ最適化 & 互換性検証', () => {
  const IOS_COREBLUETOOTH_MAX_ATT_VALUE_BYTES = 182; // iOS標準 ATT_MTU(185) - 3B ATTヘッダ

  it('通常の外来・救急SOAPカルテ（コンパイル後2,752B以下）では全スロットが180B以下（単一PDU安全圏）に収まる', () => {
    const clinicalSoap = [
      '主訴：前胸部絞扼感および冷汗。体動時に増悪あり。',
      '現病歴：本日午前8時頃より安静時に胸部圧迫感が出現し救急搬送。',
      'バイタル：BP 148/92 mmHg, HR 88 bpm, SpO2 98% (RA), BT 36.6℃。',
      '身体所見：心音純、肺野清、下腿浮腫なし。',
      '検査計画：12誘導心電図、トロポニンI、胸部X線、心エコーを実施。',
      '処方：ニトログリセリン舌下錠0.3mg 1回1錠 頓用。',
    ].join('\n');

    const session = buildTransmissionSession(clinicalSoap, DispatchMode.MODE_HYBRID_UNICODE);

    expect(session.totalBytes).toBeGreaterThan(180);
    expect(session.totalBytes).toBeLessThanOrEqual(IOS_SAFE_PAYLOAD_LEN * MAX_PACKETS);
    expect(session.totalPackets).toBeLessThanOrEqual(MAX_PACKETS);

    for (const slot of session.slotPackets) {
      expect(slot.payloadLen).toBeLessThanOrEqual(IOS_SAFE_PAYLOAD_LEN);
      expect(slot.fullPacket.byteLength).toBe(SLOT_HEADER_SIZE + slot.payloadLen);
      expect(slot.fullPacket.byteLength).toBeLessThanOrEqual(IOS_COREBLUETOOTH_MAX_ATT_VALUE_BYTES);
    }
  });

  it('退院サマリー等の超長文（2,753〜4,096B）では自動的にチャンク幅を拡張し totalPackets <= 16 を維持する', () => {
    // ASCII半角テキストで3,180B前後のストリームを生成（> 172 * 16 = 2752B）
    const longAsciiSummary = 'Bp120/80mmHg Hr72bpm SpO2_99pct '.repeat(60);
    const session = buildTransmissionSession(longAsciiSummary, DispatchMode.MODE_HYBRID_UNICODE);

    expect(session.totalBytes).toBeGreaterThan(IOS_SAFE_PAYLOAD_LEN * MAX_PACKETS);
    expect(session.totalBytes).toBeLessThanOrEqual(4096);
    expect(session.totalPackets).toBeLessThanOrEqual(MAX_PACKETS);

    for (const slot of session.slotPackets) {
      expect(slot.payloadLen).toBeLessThanOrEqual(MAX_PACKET_LEN);
    }
  });

  it('180B単一PDUチャンク化されたセッションが VirtualDongleSimulator でCRC16完全一致・ALL_PACKETS_READYとなる', () => {
    const dongle = new VirtualDongleSimulator();
    const acks: string[] = [];
    dongle.setListener({
      onStateChange: () => {},
      onAckGenerated: (ack) => acks.push(ack),
      onKeystroke: () => {},
      onMemoryWiped: () => {},
      onLog: () => {},
    });

    const note = '糖尿病性腎症第3期。HbA1c 7.4%、eGFR 48.2 mL/min/1.73m2。ダパグリフロジン10mg 1日1回朝食後を継続。'.repeat(4);
    const session = buildTransmissionSession(note, DispatchMode.MODE_HYBRID_UNICODE);

    dongle.receiveInitFrame(session.initPacket);
    expect(acks).toContain(`ACK:${session.sessionId}:SESSION_READY`);

    for (const slot of session.slotPackets) {
      expect(slot.fullPacket.byteLength).toBeLessThanOrEqual(180);
      dongle.receiveSlotFrame(slot.fullPacket);
    }

    expect(acks).toContain(`ACK:${session.sessionId}:ALL_PACKETS_READY`);
  });
});
