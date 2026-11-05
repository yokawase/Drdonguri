import { buildTransmissionSession } from '../src/utils/packetBuilder';
import { DispatchMode } from '../src/types';

const text = `【心電図所見】労作性狭心症・心筋虚血 (V4〜V6 水平型ST低下 ＆ 陰性T波)
・典型所見: 労作時の胸部圧迫感・息切れ・動悸発作に一致した左側胸部誘導（V4〜V6）およびI, aVLでの 0.1mV (1mm) 以上の水平型（Horizontal）または下降型（Down-sloping）ST低下、対称性陰性T波。
・臨床判断: 12誘導ECG: V4-V6にて水平型ST低下(-2.0mm)およびT波陰転化。労作性狭心症・心筋虚血疑い。トロポニン・BNP測定および冠動脈CT/循環器対診。
・鑑別疾患: 非ST上昇型心筋梗塞（NSTEMI: トロポニン陽性）、左室肥大に伴うストレイン型ST-T変化、ジギタリス効果（盆状ST低下）、低カリウム血症`;

const session = buildTransmissionSession(text, DispatchMode.MODE_HYBRID_UNICODE);
const s = session.rawText;
console.log('Stream length:', s.length);

let i = 0;
const length = s.length;
const tokens: Array<{ type: string; val: string }> = [];

while (i < length) {
  if (s.startsWith('[IME_RESET]', i)) {
    tokens.push({ type: 'IME_RESET', val: '' });
    i += 11;
    continue;
  }
  if (s.startsWith('[Z]', i)) {
    i += 3;
    let romaji = '';
    while (i < length) {
      if (s.startsWith('[/Z]', i)) {
        i += 4;
        break;
      }
      if (s.startsWith('[/', i) || s[i] === '\n' || s[i] === '\r') {
        break;
      }
      romaji += s[i++];
    }
    tokens.push({ type: 'Z', val: romaji });
    continue;
  }
  if (s.startsWith('[K]', i)) {
    i += 3;
    let romaji = '';
    while (i < length) {
      if (s.startsWith('[/K]', i)) {
        i += 4;
        break;
      }
      if (s.startsWith('[/', i) || s[i] === '\n' || s[i] === '\r') {
        break;
      }
      romaji += s[i++];
    }
    tokens.push({ type: 'K', val: romaji });
    continue;
  }
  if (s.startsWith('[H]', i)) {
    i += 3;
    let romaji = '';
    while (i < length) {
      if (s.startsWith('[/H]', i)) {
        i += 4;
        break;
      }
      if (s.startsWith('[/', i) || s[i] === '\n' || s[i] === '\r') {
        break;
      }
      romaji += s[i++];
    }
    tokens.push({ type: 'H', val: romaji });
    continue;
  }
  if (s.startsWith('[A]', i)) {
    i += 3;
    let ascii = '';
    while (i < length) {
      if (s.startsWith('[/A]', i)) {
        i += 4;
        break;
      }
      if (s.startsWith('[/', i) || s[i] === '\n' || s[i] === '\r') {
        break;
      }
      ascii += s[i++];
    }
    tokens.push({ type: 'A', val: ascii });
    continue;
  }
  if (s.startsWith('[ENTER]', i)) {
    tokens.push({ type: 'ENTER', val: '\n' });
    i += 7;
    continue;
  }
  tokens.push({ type: 'CHAR', val: s[i++] });
}

console.log('Total tokens parsed:', tokens.length);
tokens.forEach((t, idx) => {
  if (t.val.includes('suiheigata') || t.val.includes('ECG')) {
    console.log(`Token ${idx}: [${t.type}] ${t.val}`);
  }
});
