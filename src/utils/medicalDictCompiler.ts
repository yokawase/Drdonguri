// ============================================================================
// DrVoice「どんぐり君！」医療マスター辞書 バイナリコンパイラ
// 厚労省マスター (y.zip, b.zip) 互換 32B 固定長レコード生成・二分探索エンジン
// ※F5文字コード確定方式は誤爆防止のため廃止。音訓読み＋Space変換または確実削り出し法へ完全移行
// ============================================================================

// FNV-1a 32-bit Hash
export function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// 1. 医療用語・医薬品レコード (32バイト固定長)
export interface MedTermRecord {
  term: string;           // 原語 (例: "ロキソプロフェンナトリウム")
  reading: string;        // 読み (例: "ろきそぷろふぇんなとりうむ")
  hash: number;           // FNV-1a 32bit (4B)
  mode: number;           // 1 = Space(漢字), 2 = F7(カタカナ), 0 = Direct (1B)
  len: number;            // ローマ字バイト長 (1B)
  romaji: string;         // ヘボン式ローマ字 (最大25文字 + \0 = 26B)
}



// 医療マスター代表プリセットレコード
export const PRESET_MEDICAL_TERMS: Omit<MedTermRecord, 'hash' | 'len'>[] = [
  { term: 'ロキソプロフェンナトリウム', reading: 'ろきそぷろふぇんなとりうむ', mode: 2, romaji: 'rokisopurofennatoriyumu' },
  { term: 'アセトアミノフェン', reading: 'あせとあみのふぇん', mode: 2, romaji: 'asetoaminofen' },
  { term: 'アムロジピンベシル酸塩', reading: 'あむろじぴんべしるさんえん', mode: 2, romaji: 'amurojipinbesirusanen' },
  { term: 'デキストロメトルファン', reading: 'できすとろめとるふぁん', mode: 2, romaji: 'dekisutorometorufan' },
  { term: 'トラネキサム酸', reading: 'とらねきさむさん', mode: 1, romaji: 'toranekisamusan' },
  { term: 'ボノプラザンフマル酸塩', reading: 'ぼのぷらざんふまるさんえん', mode: 2, romaji: 'bonopurazanfumarusanen' },
  { term: '急性気管支炎', reading: 'きゅうせいきかんしえん', mode: 1, romaji: 'kyuuseikikanshien' },
  { term: '逆流性食道炎', reading: 'ぎゃくりゅうせいしょくどうえん', mode: 1, romaji: 'gyakuryuuseishokudouen' },
  { term: '高血圧症', reading: 'こうけつあつしょう', mode: 1, romaji: 'kouketsuatsushou' },
  { term: '脂質異常症', reading: 'ししついじょうしょう', mode: 1, romaji: 'shishitsuijoushou' },
  { term: '２型糖尿病', reading: 'にがたとうにょうびょう', mode: 1, romaji: 'nigatatounyoubyou' },
  { term: '帯状疱疹', reading: 'たいじょうほうしん', mode: 1, romaji: 'taijouhoushin' },
  { term: '嚥下障害', reading: 'えんげしょうがい', mode: 1, romaji: 'engeshougai' },
  { term: '誤嚥性肺炎', reading: 'ごえんせいはいえん', mode: 1, romaji: 'goenseihaien' }
];

export function buildMedTermsCatalog(): MedTermRecord[] {
  return PRESET_MEDICAL_TERMS.map((item) => {
    const hash = fnv1a32(item.term);
    const romajiTrimmed = item.romaji.slice(0, 25);
    return {
      term: item.term,
      reading: item.reading,
      hash,
      mode: item.mode,
      len: romajiTrimmed.length,
      romaji: romajiTrimmed,
    };
  }).sort((a, b) => a.hash - b.hash);
}

// 32バイト med_terms.bin バイナリ生成
export function generateMedTermsBinary(records: MedTermRecord[]): Uint8Array {
  const buffer = new ArrayBuffer(records.length * 32);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  records.forEach((rec, idx) => {
    const offset = idx * 32;
    view.setUint32(offset, rec.hash, true);           // 4B: FNV-1a hash LE
    view.setUint8(offset + 4, rec.mode);              // 1B: mode
    view.setUint8(offset + 5, rec.len);               // 1B: length
    
    // 26B: Romaji null-padded
    const romajiBytes = new TextEncoder().encode(rec.romaji);
    for (let j = 0; j < 26; j++) {
      uint8[offset + 6 + j] = j < romajiBytes.length ? romajiBytes[j] : 0;
    }
  });

  return new Uint8Array(buffer);
}
