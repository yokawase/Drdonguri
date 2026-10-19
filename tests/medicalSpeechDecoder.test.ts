import { describe, it, expect } from 'vitest';
import {
  decodeMedicalSpeech,
  getDecodedSpeechTokens,
  SPEECH_SAMPLE_CHIPS,
} from '../src/services/medicalSpeechDecoder';
import { normalizeMedicalSpeechTerms } from '../src/utils/chartTextCleaner';

describe('医療音声認識 専門用語・略語・医薬品・バイタル自動解読エンジン (medicalSpeechDecoder)', () => {
  describe('1. バイタルサインの自動解読・構造化', () => {
    it('血圧「ビーピー 140の90」を「BP 140/90 mmHg」に解読すること', () => {
      const res = decodeMedicalSpeech('患者のビーピー 140の90 でした');
      expect(res.decodedText).toContain('BP 140/90 mmHg');
      expect(res.detectedCategories).toContain('バイタルサイン');
    });

    it('血圧「血圧 128 82」を「BP 128/82 mmHg」に解読すること', () => {
      const res = decodeMedicalSpeech('血圧 128 82');
      expect(res.decodedText).toContain('BP 128/82 mmHg');
    });

    it('心拍・脈拍「ハートレート 84 整」を「HR 84 bpm (整)」に解読すること', () => {
      const res = decodeMedicalSpeech('ハートレート 84 整');
      expect(res.decodedText).toContain('HR 84 bpm (整)');
    });

    it('心拍・脈拍「脈拍 112 ふせい」を「HR 112 bpm (不整)」に解読すること', () => {
      const res = decodeMedicalSpeech('脈拍 112 ふせい');
      expect(res.decodedText).toContain('HR 112 bpm (不整)');
    });

    it('SpO2「サチュレーション 97 パーセント ルーム」を「SpO2 97% (room air)」に解読すること', () => {
      const res = decodeMedicalSpeech('サチュレーション 97 パーセント ルーム');
      expect(res.decodedText).toContain('SpO2 97% (room air)');
    });

    it('体温「体温 38度2分」を「BT 38.2 ℃」に解読すること', () => {
      const res = decodeMedicalSpeech('体温 38度2分あり');
      expect(res.decodedText).toContain('BT 38.2 ℃');
    });
  });

  describe('2. 音声同音異義語・誤字脱字の自動補正', () => {
    it('「アルコール性換気機能障害」を「アルコール性肝機能障害」に補正すること', () => {
      const res = decodeMedicalSpeech('以前からアルコール性換気機能障害を指摘');
      expect(res.decodedText).toContain('アルコール性肝機能障害');
      expect(res.detectedCategories).toContain('医学同音異義語');
    });

    it('「身体初見」「検査初見」「心電図初見」を「身体所見」「検査所見」「心電図所見」に補正すること', () => {
      const res = decodeMedicalSpeech('身体初見および心電図初見に異常なし');
      expect(res.decodedText).toContain('身体所見');
      expect(res.decodedText).toContain('心電図所見');
    });

    it('「大導寺」「全協部」「放射痛」を「体動時」「前胸部」「放散痛」に補正すること', () => {
      const res = decodeMedicalSpeech('大導寺に前協部痛と左肩への放射痛あり');
      expect(res.decodedText).toContain('体動時');
      expect(res.decodedText).toContain('前胸部');
      expect(res.decodedText).toContain('放散痛');
    });

    it('「内視鏡初見 観桜病変 協会明瞭 威嚇部」を「内視鏡所見 陥凹病変 境界明瞭 胃角部」に補正すること', () => {
      const res = decodeMedicalSpeech('内視鏡初見にて観桜病変あり協会明瞭威嚇部');
      expect(res.decodedText).toContain('内視鏡所見');
      expect(res.decodedText).toContain('陥凹病変');
      expect(res.decodedText).toContain('境界明瞭');
      expect(res.decodedText).toContain('胃角部');
    });

    it('「呼吸空」「いんとうほっせき」「へんとうはくたい」「けいぶりんぱせつしゅちょう」を補正すること', () => {
      const res = decodeMedicalSpeech('呼吸空なし、いんとうほっせき軽度、へんとうはくたいなし、けいぶりんぱせつしゅちょうなし');
      expect(res.decodedText).toContain('呼吸苦なし');
      expect(res.decodedText).toContain('咽頭発赤');
      expect(res.decodedText).toContain('扁桃白苔なし');
      expect(res.decodedText).toContain('頸部リンパ節腫脹なし');
    });
  });

  describe('3. 頻出医学英語略語・検査項目名の解読', () => {
    it('「エーエフ」「エスティーていか」「ステミ」を「心房細動 (Af)」「ST低下」「STEMI」に解読すること', () => {
      const res = decodeMedicalSpeech('心電図でエーエフおよびV4からV6にエスティーていかを認める。ステミ疑い');
      expect(res.decodedText).toContain('心房細動 (Af)');
      expect(res.decodedText).toContain('ST低下');
      expect(res.decodedText).toContain('STEMI');
      expect(res.detectedCategories).toContain('医学略語・検査');
    });

    it('血液生化学「シーアールピー」「ダブリュービーシー」「ヘモグロビンエーワンシー」を解読すること', () => {
      const res = decodeMedicalSpeech('採血結果 シーアールピー 0.2 ダブリュービーシー 6400 ヘモグロビンエーワンシー 6.5');
      expect(res.decodedText).toContain('CRP');
      expect(res.decodedText).toContain('WBC');
      expect(res.decodedText).toContain('HbA1c');
    });

    it('循環器バイオマーカー「トロポニンティー」「シーケーエムビー」「ビーエヌピー」を解読すること', () => {
      const res = decodeMedicalSpeech('トロポニンティー陰性 シーケーエムビー正常 ビーエヌピー 45');
      expect(res.decodedText).toContain('トロポニンT');
      expect(res.decodedText).toContain('CK-MB');
      expect(res.decodedText).toContain('BNP');
    });
  });

  describe('4. 頻出医薬品・商品名・一般名および処方用法の解読', () => {
    it('循環器薬「ニトロペン」「アムロジピン」「アトルバスタチン」「バイアスピリン」を解読すること', () => {
      const res = decodeMedicalSpeech('処方 ニトロペン頓用 アムロジピン アトルバスタチン バイアスピリン');
      expect(res.decodedText).toContain('ニトロペン舌下錠0.3mg');
      expect(res.decodedText).toContain('アムロジピン錠');
      expect(res.decodedText).toContain('アトルバスタチン錠');
      expect(res.decodedText).toContain('バイアスピリン錠100mg');
      expect(res.detectedCategories).toContain('医薬品マスター');
    });

    it('用法「1てぃー 1くす 朝食後」「7にちぶん」「とんよう」を正規化すること', () => {
      const res = decodeMedicalSpeech('アムロジピン 1てぃー 1くす 朝食後 14にちぶん ニトロペン とんよう');
      expect(res.decodedText).toContain('1T 1x');
      expect(res.decodedText).toContain('14日分');
      expect(res.decodedText).toContain('頓用');
    });

    it('糖尿病薬・解熱鎮痛薬「フォシーガ」「カロナール」「ロキソニン」を解読すること', () => {
      const res = decodeMedicalSpeech('フォシーガ カロナール ロキソニン処方');
      expect(res.decodedText).toContain('フォシーガ錠10mg');
      expect(res.decodedText).toContain('アセトアミノフェン錠');
      expect(res.decodedText).toContain('ロキソプロフェンNa錠60mg');
    });
  });

  describe('5. カルテセクション見出しの自動展開', () => {
    it('音声で「主訴」「現病歴」「アセスメント」「プラン」と発話した際に見出しを展開すること', () => {
      const res = decodeMedicalSpeech('主訴 前胸部圧迫感 現病歴 3日前より出現 アセスメント 労作性狭心症 プラン 心電図検査');
      expect(res.decodedText).toContain('【主訴】');
      expect(res.decodedText).toContain('【現病歴】');
      expect(res.decodedText).toContain('【アセスメント】');
      expect(res.decodedText).toContain('【プラン】');
    });
  });

  describe('6. chartTextCleaner (normalizeMedicalSpeechTerms) との統合', () => {
    it('normalizeMedicalSpeechTerms 経由でも同等に解読・変換されること', () => {
      const text = '主訴 大導寺の前協部痛 ビーピー 150の90 エスティーていかあり ニトロペン処方';
      const normalized = normalizeMedicalSpeechTerms(text);
      expect(normalized).toContain('【主訴】');
      expect(normalized).toContain('体動時');
      expect(normalized).toContain('前胸部');
      expect(normalized).toContain('BP 150/90 mmHg');
      expect(normalized).toContain('ST低下');
      expect(normalized).toContain('ニトロペン舌下錠0.3mg');
    });
  });

  describe('7. リアルタイムUIトークン分割と例文チップス', () => {
    it('getDecodedSpeechTokens で通常文字列と解読ハイライトトークンが正しく分割されること', () => {
      const { tokens, result } = getDecodedSpeechTokens('大導寺に胸部圧迫感 ビーピー 140の90');
      expect(result.decodedText).toContain('体動時');
      expect(result.decodedText).toContain('BP 140/90 mmHg');

      const decodedTokens = tokens.filter((t) => t.isDecoded);
      expect(decodedTokens.length).toBeGreaterThanOrEqual(2);
      expect(decodedTokens.some((t) => t.text === '体動時' && t.category === 'homophone')).toBe(true);
      expect(decodedTokens.some((t) => t.text === 'BP 140/90 mmHg' && t.category === 'vital')).toBe(true);
    });

    it('SPEECH_SAMPLE_CHIPS が臨床例文を定義していること', () => {
      expect(SPEECH_SAMPLE_CHIPS.length).toBeGreaterThanOrEqual(5);
      expect(SPEECH_SAMPLE_CHIPS[0]).toHaveProperty('label');
      expect(SPEECH_SAMPLE_CHIPS[0]).toHaveProperty('speech');
    });
  });
});

