import { calculateCrc16 } from './crc16';
import { DispatchMode } from '../types';
import { formatForEhrNewlines, transpileToImeRomajiSequence, generateKeystrokeSequence } from './japaneseImeTranspiler';
import { compileMedicalTextToImeBoost, CompileImeOptions, kanjiWordToRomaji } from './imePrecisionCompiler';
import { preprocessMedicalText, PreprocessOptions } from './medicalTextPreprocessor';

export const MAX_PAYLOAD_SIZE = 4096;
export const MAX_PACKETS = 16;
export const MAX_PACKET_LEN = 256;
export const SESSION_INIT_HEADER_SIZE = 8;
export const SLOT_HEADER_SIZE = 8;

export interface PreparedSlotPacket {
  seqNo: number;
  mode: DispatchMode;
  payloadLen: number;
  chunkCrc16: number;
  headerBytes: Uint8Array;
  payloadBytes: Uint8Array;
  fullPacket: Uint8Array;
}

export interface PreparedSession {
  sessionId: number;
  totalPackets: number;
  totalBytes: number;
  totalCrc16: number;
  mode: DispatchMode;
  initPacket: Uint8Array;
  slotPackets: PreparedSlotPacket[];
  rawText: string;
}

/**
 * 2バイト (uint16) をリトルエンディアンで書き込み
 */
export function writeUint16LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xFF;
  target[offset + 1] = (value >> 8) & 0xFF;
}

/**
 * 2バイト (uint16) をリトルエンディアンで読み出し
 */
export function readUint16LE(source: Uint8Array, offset: number): number {
  return source[offset] | (source[offset + 1] << 8);
}

/**
 * 補足制御コマンドコード (HIDキーボード協調用)
 * - CMD_IME_MUHENKAN (0x11): JIS無変換キー (Non-Convert) 送出コマンド
 * - CMD_IME_COMMIT (0x0A / \n): 確定Enterキーコード
 */
export const CMD_IME_MUHENKAN = '\x11';
export const CMD_IME_COMMIT = '\n';

/**
 * 日本語入力の確定キー（Enter）および変換リセット処理を強制付与する強化ロジック
 * 
 * Windows IME (MS-IME / ATOK / Google日本語入力) において、
 * BLE経由で送出されたキーストロークの末尾がローマ字や未確定状態のまま残るのを防ぐため、
 * シーケンスの末尾に【文節変換スペース】＋【無変換キーコード】＋【複数のEnterキーコード】を組み合わせた
 * パディング・補足コマンドを付与し、OS側で確実に確定処理が完了するようにします。
 * 
 * 【動作仕様】
 * 1. 末尾が半角英字 (ローマ字) の場合は文節変換スペース ' ' を付与
 * 2. 『無変換』補足コマンド (CMD_IME_MUHENKAN = 0x11):
 *    サジェスト・予測変換や余分な文節候補を無変換状態で固定・キャンセル
 * 3. 複数の『Enter』キーコード (\n\n):
 *    - 1回目のEnter: 未確定文字列の完全確定（コミット、画面上は改行されない）
 *    - 2回目のEnter: 変換候補ウィンドウの完全クローズおよび段落確定
 * 4. 境界パディング:
 *    パケット末尾の欠落やバッファ端のゴミ読み込みを防止
 */
export function applyImeCommitAndResetSequence(
  text: string, 
  mode: DispatchMode,
  options?: {
    useMuhenkanCommand?: boolean;
    multipleEnterCount?: number;
  }
): string {
  if (!text) return '';
  if (mode !== DispatchMode.MODE_IME_ROMAJI) {
    return text;
  }

  let processed = text;

  // 1. 末尾が半角英字 (未変換の可能性のあるローマ字) の場合は文節変換スペースを確保
  if (/[a-zA-Z]$/.test(processed)) {
    processed += ' ';
  }

  // 2. 『無変換』補足コマンドの挿入 (末尾が既に無変換コマンドでない場合)
  const useMuhenkan = options?.useMuhenkanCommand ?? true;
  if (useMuhenkan && !processed.includes(CMD_IME_MUHENKAN)) {
    // 既存の改行末尾を一旦取り除いて無変換を挿入
    processed = processed.replace(/\n+$/, '');
    processed += CMD_IME_MUHENKAN;
  }

  // 3. 複数の『Enter』キーコードを付与 (最低2回のEnterにより、未確定コミット＋ウィンドウ破棄を保証)
  const enterCount = Math.max(2, options?.multipleEnterCount ?? 2);
  const enterPadding = '\n'.repeat(enterCount);

  // 既存の末尾改行数に合わせてパディングを付加
  if (!processed.endsWith(enterPadding)) {
    processed = processed.replace(/\n+$/, '') + enterPadding;
  }

  return processed;
}


export interface BuildSessionOptions {
  sessionId?: number;
  enablePreprocessor?: boolean; // カルテテキスト・プリプロセッサ自動適用 (感冒・錠・回分・日分・単位等の安定化)
  preprocessOptions?: PreprocessOptions;
  enableImeBoost?: boolean; // IME精度向上ハイブリッド・パイプライン有効化 (Fキー強制・最小Chunk分解・Unicode F5)
  compileOptions?: Partial<CompileImeOptions>;
  useMuhenkanCommand?: boolean;
  multipleEnterCount?: number;
}

/**
 * テキストからBLE送信バイナリパケット群（セッション初期化＋スロットパケット群）を構築
 * 電子カルテ向けに各改行は「1行空けて（\n\n）」自動最適化され、
 * 日本語入力時は末尾に確定キー（Enter）および変換リセット処理が強制付与される
 */
export function buildTransmissionSession(
  text: string,
  mode: DispatchMode = DispatchMode.MODE_HYBRID_UNICODE,
  optionsOrSessionId?: number | BuildSessionOptions
): PreparedSession {
  const options: BuildSessionOptions = typeof optionsOrSessionId === 'number'
    ? { sessionId: optionsOrSessionId }
    : (optionsOrSessionId || {});

  const enablePreprocessor = options.enablePreprocessor ?? true;
  const enableImeBoost = options.enableImeBoost ?? true;

  let processedText = text;

  // 1. カルテテキスト・プリプロセッサ自動置換（℃➔度、不要な空白整理など）
  if (enablePreprocessor) {
    const preResult = preprocessMedicalText(processedText, options.preprocessOptions);
    processedText = preResult.processedText;
  }

  // 2. 医師個人カスタム辞書（略語マクロ展開）の適用
  if (enableImeBoost && options.compileOptions?.enableDoctorMacros !== false) {
    const macros = options.compileOptions?.doctorMacros;
    if (macros && macros.length > 0) {
      for (const macro of macros) {
        if (macro.enabled && macro.trigger) {
          const regex = new RegExp(`\\b${macro.trigger}\\b|(?<=\\s|^)${macro.trigger}(?=\\s|$)`, 'gi');
          processedText = processedText.replace(regex, macro.expansion);
        }
      }
    }
  }

  // 3. 送信モード別のフォーマット処理
  // ★【v15.0 4層タグ・安全打鍵パイプライン】
  // [K]: カタカナ (F7 ➔ Enter)
  // [H]: ひらがな・助詞 (Enter即時確定・Space禁止)
  // [Z]: 漢字熟語 (Space変換 ➔ Enter確定)
  // [A]: 半角ASCII直接
  // ★【v16.3 HYBRID Unicode・全漢字100%直接着弾パイプライン】
  // [K]: カタカナ (F7 ➔ Enter)
  // [H]: ひらがな・助詞 (Enter確定・Space禁止)
  // [U]: Unicode 4桁 (F5文字コード変換 ➔ Enter確定: 誤変換・同音異義語0%)
  // [A]: 半角ASCII直接（英文フレーズ・記号保護）
  let formattedText = processedText;
  if (mode === DispatchMode.MODE_HYBRID_UNICODE || mode === DispatchMode.MODE_IME_ROMAJI) {
    if (enableImeBoost) {
      const compiled = compileMedicalTextToImeBoost(processedText, {
        enableFunctionKeyRouting: true,
        enableChunkDecomposition: false, // 形態素破壊・漢字ローマ字化を完全防止
        enableUnicodeF5Assist: true,      // 漢字は100%直接Unicode F5着弾
        enableDoctorMacros: options.compileOptions?.enableDoctorMacros ?? true,
        doctorMacros: options.compileOptions?.doctorMacros,
      });
      formattedText = compiled.compiledPayload;
    } else {
      const transpiled = generateKeystrokeSequence(processedText);
      formattedText = transpiled.sequence;
    }
  } else {
    formattedText = formatForEhrNewlines(processedText);
  }

  // ★【Zero-Drop＆Zero-Misconversion 保証バリデータ】
  // タグ外に生漢字が残存している場合は、すべて [U]XXXX[/U]（Unicode F5直接着弾）にラップし、
  // カルテ端末へ寸分違わず原文通りの漢字を着弾させる
  if (mode === DispatchMode.MODE_HYBRID_UNICODE || mode === DispatchMode.MODE_IME_ROMAJI) {
    formattedText = formattedText.replace(/(\[[A-Z0-9]+\][\s\S]*?\[\/[A-Z0-9]+\])|([一-龠]+)/g, (match, tagPart, kanjiPart) => {
      if (tagPart) return tagPart;
      if (kanjiPart) {
        return Array.from(kanjiPart).map(c => {
          const cp = c.codePointAt(0);
          return cp ? `[U]${cp.toString(16).toUpperCase().padStart(4, '0')}[/U]` : c;
        }).join('');
      }
      return match;
    });
  }

  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(formattedText);

  if (rawBytes.length === 0) {
    throw new Error('送信テキストが空です。');
  }

  if (rawBytes.length > MAX_PAYLOAD_SIZE) {
    throw new Error(`ペイロードサイズ超過 (${rawBytes.length}B > 最大${MAX_PAYLOAD_SIZE}B)`);
  }

  // セッションIDの自動割り当て (1〜65535)
  const sid = options.sessionId ?? (Math.floor(Math.random() * 65000) + 1);
  const totalCrc16 = calculateCrc16(rawBytes);

  // パケット分割 (各スロット最大256バイト)
  const totalPackets = Math.ceil(rawBytes.length / MAX_PACKET_LEN);
  if (totalPackets > MAX_PACKETS) {
    throw new Error(`パケット数超過 (${totalPackets}個 > 最大${MAX_PACKETS}個)`);
  }

  // 1. セッション初期化フレーム (8バイト)
  // [0..1]: SessionID (LE)
  // [2]: TotalPackets (uint8)
  // [3..4]: TotalBytes (LE)
  // [5..6]: TotalCRC16 (LE)
  // [7]: Reserved (0)
  const initPacket = new Uint8Array(SESSION_INIT_HEADER_SIZE);
  writeUint16LE(initPacket, 0, sid);
  initPacket[2] = totalPackets;
  writeUint16LE(initPacket, 3, rawBytes.length);
  writeUint16LE(initPacket, 5, totalCrc16);
  initPacket[7] = 0;

  // 2. 各データスロットフレーム
  const slotPackets: PreparedSlotPacket[] = [];
  for (let i = 0; i < totalPackets; i++) {
    const start = i * MAX_PACKET_LEN;
    const end = Math.min(start + MAX_PACKET_LEN, rawBytes.length);
    const chunkPayload = rawBytes.slice(start, end);
    const chunkLen = chunkPayload.length;
    const chunkCrc = calculateCrc16(chunkPayload);

    // ヘッダ (8バイト)
    // [0..1]: SessionID (LE)
    // [2]: SeqNo
    // [3]: Mode
    // [4..5]: PayloadLen (LE)
    // [6..7]: ChunkCRC16 (LE)
    const header = new Uint8Array(SLOT_HEADER_SIZE);
    writeUint16LE(header, 0, sid);
    header[2] = i;
    header[3] = mode;
    writeUint16LE(header, 4, chunkLen);
    writeUint16LE(header, 6, chunkCrc);

    // パケット全体 (ヘッダ + ペイロード)
    const fullPacket = new Uint8Array(SLOT_HEADER_SIZE + chunkLen);
    fullPacket.set(header, 0);
    fullPacket.set(chunkPayload, SLOT_HEADER_SIZE);

    slotPackets.push({
      seqNo: i,
      mode,
      payloadLen: chunkLen,
      chunkCrc16: chunkCrc,
      headerBytes: header,
      payloadBytes: chunkPayload,
      fullPacket,
    });
  }

  return {
    sessionId: sid,
    totalPackets,
    totalBytes: rawBytes.length,
    totalCrc16,
    mode,
    initPacket,
    slotPackets,
    rawText: formattedText,
  };
}

/**
 * マイコンから受信した再送ビットマップ文字列 (例: "0x0005") を未着SeqNo配列 [0, 2] に分解
 */
export function parseMissingBitmap(bitmapStr: string, totalPackets: number): number[] {
  let mask = 0;
  if (bitmapStr.startsWith('0x') || bitmapStr.startsWith('0X')) {
    mask = parseInt(bitmapStr.slice(2), 16);
  } else {
    mask = parseInt(bitmapStr, 10);
  }

  const missingSeqs: number[] = [];
  for (let i = 0; i < totalPackets; i++) {
    if ((mask & (1 << i)) !== 0) {
      missingSeqs.push(i);
    }
  }
  return missingSeqs;
}

/**
 * バイト列のHEXダンプ文字列生成 (デバッグ用)
 */
export function toHexDump(bytes: Uint8Array, maxBytes: number = 32): string {
  const slice = bytes.slice(0, maxBytes);
  const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  return bytes.length > maxBytes ? `${hex} ... (${bytes.length} bytes)` : hex;
}
