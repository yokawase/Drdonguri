/**
 * CCITT-CRC16 計算モジュール (多項式: 0x1021, 初期値: 0xFFFF)
 * AtomS3Uファームウェアの calculateCrc16 と完全互換
 */
export function calculateCrc16(data: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8) & 0xFFFF;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc & 0xFFFF;
}

/**
 * 文字列のUTF-8バイト列に対するCRC16計算
 */
export function calculateStringCrc16(text: string): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  return calculateCrc16(bytes);
}

/**
 * 16進数フォーマット表示 (例: 0x4A2B)
 */
export function formatHex16(val: number): string {
  return '0x' + (val & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}
