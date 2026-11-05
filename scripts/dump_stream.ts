import { buildTransmissionSession } from '../src/utils/packetBuilder';
import { DispatchMode } from '../src/types';

const text = `【心電図所見】労作性狭心症・心筋虚血 (V4〜V6 水平型ST低下 ＆ 陰性T波)
・典型所見: 労作時の胸部圧迫感・息切れ・動悸発作に一致した左側胸部誘導（V4〜V6）およびI, aVLでの 0.1mV (1mm) 以上の水平型（Horizontal）または下降型（Down-sloping）ST低下、対称性陰性T波。
・臨床判断: 12誘導ECG: V4-V6にて水平型ST低下(-2.0mm)およびT波陰転化。労作性狭心症・心筋虚血疑い。トロポニン・BNP測定および冠動脈CT/循環器対診。
・鑑別疾患: 非ST上昇型心筋梗塞（NSTEMI: トロポニン陽性）、左室肥大に伴うストレイン型ST-T変化、ジギタリス効果（盆状ST低下）、低カリウム血症`;

const session = buildTransmissionSession(text, DispatchMode.MODE_HYBRID_UNICODE);
process.stdout.write(session.rawText);
