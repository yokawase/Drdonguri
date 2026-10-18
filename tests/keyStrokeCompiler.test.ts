// =============================================================================
// File: tests/keyStrokeCompiler.test.ts
// 説明: 長単位結合オートマトン（Sudachi Mode C思想）および
//       v20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）の単体テスト
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  KeyStrokeCompiler,
  kanaToNormalizedRomaji,
  katakanaToRomaji,
  keyStrokeCompiler,
} from '../src/services/KeyStrokeCompiler';
import { preprocessMedicalText } from '../src/utils/medicalTextPreprocessor';

describe('長単位結合オートマトン (Sudachi Mode C) ＆ v20.1 HYBRIDキーストローク', () => {
  const compiler = new KeyStrokeCompiler();

  describe('1. 臨床テキストにおけるタグ生成実例（100%完全一致検証）', () => {
    it('ユーザー提示の臨床文章が指定のペイロードと1文字の狂いもなく完全一致すること', () => {
      const input = '先週から背中が疼痛あり、体を動かすと体動時疼痛増悪。アルコール性肝機能障害の疑い。γ-GTPが200台。';
      const expected =
        '[Z]sensyuu[/Z][H]kara[/H][Z]senaka[/Z][H]ga[/H][Z]toutuu[/Z][H]ari[/H][H]、[/H] [Z]karada[/Z][H]wo[/H][Z]ugoka[/Z][H]suto[/H][Z]taidou[/Z][Z]ji[/Z][Z]toutuu[/Z][Z]zouaku[/Z][H]。[/H] [K]aruko-ru[/K][Z]seikankinousyougai[/Z][H]no[/H][Z]utagai[/Z][H]。[/H] [A]γ-GTP[/A][H]ga[/H][A]200[/A][Z]dai[/Z][H]。[/H]';

      const res = compiler.compileText(input, { includeImeReset: false });

      expect(res.streamText).toBe(expected);
      // ALT codesが0件であることを保証
      expect(res.altCount).toBe(0);
      expect(res.streamText.includes('[ALT]')).toBe(false);
      // タグカウントの整合性
      expect(res.zCount).toBe(12); // sensyuu, senaka, toutuu, karada, ugoka, taidou, ji, toutuu, zouaku, seikankinousyougai, utagai, dai
      expect(res.kCount).toBe(1);  // aruko-ru
      expect(res.hCount).toBe(11); // kara, ga, ari, 、(読点), wo, suto, 。(句点), no, 。(句点), ga, 。(句点)
      expect(res.aCount).toBe(2);  // γ-GTP, 200
    });
  });

  describe('2. 誤変換根絶メカニズム（単漢字分割の防止・接尾辞融合・語幹分離）', () => {
    it('「背中」が「肺中」にならず、長単位熟語として [Z]senaka[/Z] と出力されること', () => {
      const res = compiler.compileText('背中', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]senaka[/Z]');
      expect(res.streamText).not.toContain('hai');
      expect(res.streamText).not.toContain('chuu');
    });

    it('「増悪」が「笛悪」にならず、長単位熟語として [Z]zouaku[/Z] と出力されること', () => {
      const res = compiler.compileText('増悪', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]zouaku[/Z]');
      expect(res.streamText).not.toContain('fue');
    });

    it('「体動時」が「大導寺」にならず、自立語単位で [Z]taidou[/Z][Z]ji[/Z] と分離出力されること', () => {
      const res = compiler.compileText('体動時', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]taidou[/Z][Z]ji[/Z]');
      expect(res.streamText).not.toContain('[H]ji[/H]');
      expect(res.streamText).not.toBe('[Z]taidouji[/Z]'); // 大導寺誤爆を完全防止
    });

    it('「動かすと」が語幹 [Z]ugoka[/Z] と 活用語尾＋助詞 [H]suto[/H] に分離されること', () => {
      const res = compiler.compileText('動かすと', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]ugoka[/Z][H]suto[/H]');
    });

    it('「アルコール性肝機能障害」が外来語 [K]aruko-ru[/K] と長単位熟語 [Z]seikankinousyougai[/Z] に正しく結合されること', () => {
      const res = compiler.compileText('アルコール性肝機能障害', { includeImeReset: false });
      expect(res.streamText).toBe('[K]aruko-ru[/K][Z]seikankinousyougai[/Z]');
      expect(res.streamText).not.toContain('[Z]sei[/Z]');
    });
  });

  describe('3. ALT codes 永久排除の検証', () => {
    it('どの入力に対しても [ALT] タグは一切生成されないこと', () => {
      const inputs = [
        '胃癌の疑いにて精査。',
        'カロナール錠500mgを処方。',
        '高血圧症および脂質異常症の既往あり。',
        '右下腹部痛あり。急性虫垂炎は否定的。'
      ];

      for (const text of inputs) {
        const res = compiler.compileText(text);
        expect(res.altCount).toBe(0);
        expect(res.streamText).not.toContain('[ALT]');
      }
    });
  });

  describe('4. 臨床頻出パターンの長単位結合検証', () => {
    it('否定モダリティ文（右下腹部痛、急性虫垂炎、否定的、発熱なし）', () => {
      const input = '右下腹部痛あり。急性虫垂炎は否定的。発熱なし。';
      const res = compiler.compileText(input, { includeImeReset: false });
      expect(res.streamText).toBe('[Z]migikahukubutuu[/Z][H]ari[/H][H]。[/H] [Z]kyuuseityuusyuien[/Z][H]ha[/H][Z]hiteiteki[/Z][H]。[/H] [Z]hatunetu[/Z][H]nasi[/H][H]。[/H]');
    });

    it('処方・用法（カロナール錠500mg 1回1錠 疼痛時頓服）', () => {
      const input = 'カロナール錠500mg 1回1錠 疼痛時頓服。';
      const res = compiler.compileText(input, { includeImeReset: false });
      expect(res.streamText).toBe('[K]karona-ru[/K][Z]jyou[/Z][A]500mg[/A] [A]1[/A][Z]kai[/Z][A]1[/A][Z]jyou[/Z] [Z]toutuuji[/Z][Z]tonnpuku[/Z][H]。[/H]');
    });

    it('術後・経過（術後経過良好。創部感染なし。）', () => {
      const input = '術後経過良好。創部感染なし。';
      const res = compiler.compileText(input, { includeImeReset: false });
      expect(res.streamText).toBe('[Z]jutugo[/Z][Z]keikaryoukou[/Z][H]。[/H] [Z]soubu[/Z][Z]kansenn[/Z][H]nasi[/H][H]。[/H]');
    });
  });

  describe('5. かな/カナ ➔ ローマ字正規化変換', () => {
    it('薬品名・一般語が正しくローマ字化されること', () => {
      expect(kanaToNormalizedRomaji('アルコール')).toBe('aruko-ru');
      expect(kanaToNormalizedRomaji('たいどうじ')).toBe('taidouji');
      expect(kanaToNormalizedRomaji('せなか')).toBe('senaka');
      expect(kanaToNormalizedRomaji('ぞうあく')).toBe('zouaku');
      expect(katakanaToRomaji('カロナール')).toBe('karona-ru');
    });
  });

  describe('6. ユーザー提示の実機SOAPカルテ臨床文（100%完全検証）', () => {
    it('SOAP全行が前処理および長単位オートマトンを経て安全かつ正確にタグ付けされること', () => {
      const rawSoap =
        '【S】3日前より38.2℃の発熱、咽頭痛、乾性咳嗽あり。市販総合感冒薬内服するも改善乏しく来院。\n' +
        '【O】BT 37.8℃, PR 82bpm, BP 124/76mmHg, SpO2 98%(room air)\n' +
        '咽頭発赤(+), 扁桃腫大(-), 呼吸音清, 腹部平坦・軟\n' +
        '【A】急性上気道炎 (感冒)\n' +
        '【P】対症療法 (アセトアミノフェン錠500mg 1回1錠 頓服, デキストロメトルファン錠15mg 1回1錠 毎食後 5日分)\n' +
        '水分摂取励行、発熱持続時は再診指示。';

      const preprocessed = preprocessMedicalText(rawSoap);
      const res = compiler.compileText(preprocessed.processedText, { includeImeReset: false });

      // 1. ALT codesは完全に0件
      expect(res.altCount).toBe(0);
      expect(res.streamText).not.toContain('[ALT]');

      // 2. 医療頻出難読・複合語がすべて適切なタグでカバーされていること
      expect(res.streamText).toContain('[Z]kannsei[/Z][Z]gaisou[/Z]'); // 乾性咳嗽
      expect(res.streamText).toContain('[Z]inntou[/Z][Z]hosseki[/Z]'); // 咽頭発赤
      expect(res.streamText).toContain('[Z]henntou[/Z][Z]syudai[/Z]'); // 扁桃腫大
      expect(res.streamText).toContain('[Z]kokyuuonn[/Z][Z]sei[/Z]'); // 呼吸音清
      expect(res.streamText).toContain('[Z]hukubu[/Z][Z]heitann[/Z]'); // 腹部平坦
      expect(res.streamText).toContain('[Z]kyuusei[/Z][Z]jyoukidouenn[/Z]'); // 急性上気道炎
      expect(res.streamText).toContain('[K]asetoaminofuxenn[/K]'); // アセトアミノフェン
      expect(res.streamText).toContain('[K]dekisutorometorufuxann[/K]'); // デキストロメトルファン
      expect(res.streamText).toContain('[Z]maisyoku[/Z][Z]ato[/Z]'); // 毎食後（真移植後防止の分割）
      expect(res.streamText).toContain('[Z]suibunn[/Z][Z]sessyu[/Z][Z]reikou[/Z]'); // 水分摂取励行
      expect(res.streamText).toContain('[Z]saisinn[/Z][Z]siji[/Z]'); // 再診指示
      expect(res.streamText).toContain('[Z]sihann[/Z][Z]sougou[/Z][Z]kannbouyaku[/Z][Z]naihuku[/Z]'); // 市販総合感冒薬内服

      // 3. 【】および・の正常タグ化
      expect(res.streamText).toContain('[A]【[/A]');
      expect(res.streamText).toContain('[A]】[/A]');
      expect(res.streamText).toContain('[H]・[/H]');

      // 4. 改行が安全な[ENTER]タグにコンパイルされていること
      expect(res.streamText).toContain('[ENTER]');
    });
  });

  describe('7. 内視鏡・消化器臨床所見（ユーザー提示症例完全適合）', () => {
    it('内視鏡所見・早期胃癌・微細血管構築異常等の全語彙が正しく音読み・専門語としてコンパイルされること', () => {
      const text =
        '【内視鏡所見】早期胃癌 (0-IIc型: 陥凹型早期胃癌)\n' +
        '辺縁粘膜のひだ集中・途読\n' +
        '境界明瞭な発赤・褪色\n' +
        'NBI拡大内視鏡における微細血管構築異常\n' +
        'ひだ集中・途絶\n' +
        '鑑別疾患: 胃潰瘍（消化性潰瘍）瘢痕期\n' +
        '胃良性ポリープ\n' +
        '典型所見: 胃角部小弯〜前庭部の浅い不整陥凹病変（精査要）\n' +
        '臨床判断: 内視鏡所見: 胃角部小弯に約15mmの境界明瞭な不整陥凹病変(0-IIc)（精査要）\n' +
        '早期胃癌疑い（精査要）\n' +
        '慢性萎縮性胃炎の限局性びらん（精査要）\n' +
        'ESD適応精査';

      const res = compiler.compileText(text, { includeImeReset: false });

      // 単漢字訓読みキメラ結合（ないし鏡、ところ県、い潰すよう、花時等）が完全根絶されていること
      expect(res.streamText).not.toContain('kagami');
      expect(res.streamText).not.toContain('tokoroken');
      expect(res.streamText).not.toContain('tsubusu');
      expect(res.streamText).not.toContain('hanatoki');

      // 最適チャンク分解および [G] タグ（Space 2回 ➔ Enter確定）でMS-IME第1候補の日常語誤爆を完全回避すること
      expect(res.streamText).toContain('[Z]naishikyou[/Z][G]syoken[/G]'); // 内視鏡所見 (所見をSpace 2回で確定し「初見」誤爆を排除)
      expect(res.streamText).toContain('[Z]souki[/Z][G]igan[/G]'); // 早期胃癌 (胃癌をSpace 2回で確定し「早期胃がん」誤爆を排除)
      expect(res.streamText).toContain('[G]kannou[/G][Z]gata[/Z]'); // 陥凹型 (「観桜」誤爆を排除)
      expect(res.streamText).toContain('[Z]hennenn[/Z][Z]nennmaku[/Z]'); // 辺縁粘膜 (nennmaku で「熱膜」誤爆を排除)
      expect(res.streamText).toContain('[Z]hidasyuutyuu[/Z]'); // ひだ集中
      expect(res.streamText).toContain('[G]kyoukai[/G][Z]meiryou[/Z]'); // 境界明瞭 (境界をSpace 2回で確定し「協会」誤爆を排除)
      expect(res.streamText).toContain('[G]taisyoku[/G]'); // 褪色 (Space 2回で確定し「退職」誤爆を排除)
      expect(res.streamText).toContain('[Z]bisai[/Z][Z]kekkan[/Z][Z]koutiku[/Z][G]ijyou[/G]'); // 微細血管構築異常 (「構築以上」誤爆を排除)
      expect(res.streamText).toContain('[Z]tozetu[/Z]'); // 途絶
      expect(res.streamText).toContain('[Z]kambetusikkan[/Z]'); // 鑑別疾患
      expect(res.streamText).toContain('[Z]i[/Z][Z]kaiyou[/Z]'); // 胃潰瘍 (「い潰すよう」誤爆を排除)
      expect(res.streamText).toContain('[Z]syoukasei[/Z][Z]kaiyou[/Z]'); // 消化性潰瘍
      expect(res.streamText).toContain('[Z]hankonn[/Z][Z]ki[/Z]'); // 瘢痕期 (「半今期」誤爆を排除)
      expect(res.streamText).toContain('[Z]i[/Z][Z]ryousei[/Z][K]pori-pu[/K]'); // 胃良性ポリープ (ryousei で「医療雨製」誤爆を排除)
      expect(res.streamText).toContain('[Z]tenkei[/Z][G]syoken[/G]'); // 典型所見 (所見をSpace 2回で確定し「初見」誤爆を排除)
      expect(res.streamText).toContain('[G]ikaku[/G][Z]bu[/Z][Z]syouwann[/Z]'); // 胃角部小弯 (「威嚇武将ワン」誤爆を排除)
      expect(res.streamText).toContain('[G]zentei[/G][Z]bu[/Z]'); // 前庭部 (「前提部」誤爆を排除)
      expect(res.streamText).toContain('[Z]asai[/Z]'); // 浅い
      expect(res.streamText).toContain('[Z]fusei[/Z][G]kannou[/G][Z]byouhenn[/Z]'); // 不整陥凹病変 (「不正観桜病変」誤爆を排除)
      expect(res.streamText).toContain('[Z]seisa[/Z][Z]you[/Z]'); // 精査要 (「正作用」誤爆を排除)
      expect(res.streamText).toContain('[Z]rinsyou[/Z][Z]hanndann[/Z]'); // 臨床判断
      expect(res.streamText).toContain('[Z]souki[/Z][G]igan[/G][Z]utagai[/Z]'); // 早期胃癌疑い (utagai で「疑うぃ」誤爆を排除)
      expect(res.streamText).toContain('[Z]mansei[/Z][Z]isyukusei[/Z][Z]ienn[/Z]'); // 慢性萎縮性胃炎
      expect(res.streamText).toContain('[Z]gennkyokusei[/Z][H]biran[/H]'); // 限局性びらん
      expect(res.streamText).toContain('[A]ESD[/A][Z]tekiouseisa[/Z]'); // ESD適応精査
    });

    it('8. 急性腹痛・背部痛・内科臨床所見（ユーザー提示症例完全適合・100%変換率検証）', () => {
      const text =
        '【S】\n' +
        '・今日は今日はよかったです53歳53歳 男性53歳 男性首相 腹痛昨日から時々時々普通に出現当院受診し急性急性 中性 疑い\n\n' +
        '【O】\n' +
        '・理学所見・バイタル特記なし\n\n' +
        '【A】\n' +
        '・体動時背部痛（筋筋膜性疼痛疑い・内臓疾患の除外要）\n\n' +
        '【P】\n' +
        '・対症療法（鎮痛薬処方・安静指導）\n' +
        '・血液検査（肝機能再検・炎症反応）および腹部超音波精査検討';

      const res = compiler.compileText(text, { includeImeReset: false });

      // 誤爆ローマ字（大導寺、セブ、す字幕、女外用、初歩、債権、版王、太織、突起、受信、中世、首そう等）が完全根絶されていること
      expect(res.streamText).not.toContain('imanichi'); // 今日（いまにち）
      expect(res.streamText).not.toContain('futoori'); // 普通（太織）
      expect(res.streamText).not.toContain('kubisou'); // 首相（首そう）
      expect(res.streamText).not.toContain('taidouji'); // 体動時（大導寺）
      expect(res.streamText).not.toContain('sebutuu'); // 背部痛（セブ通）
      expect(res.streamText).not.toContain('sujisuji'); // 筋筋膜（すじすじ）
      expect(res.streamText).not.toContain('josoto'); // 除外（女外）
      expect(res.streamText).not.toContain('ennsyouhan[/Z][Z]ou'); // 炎症反応（炎症版王）

      // 最適チャンク分解＆[G]タグ（第2候補確定）による100%正当変換の検証
      expect(res.streamText).toContain('[Z]kyou[/Z]'); // 今日
      expect(res.streamText).toContain('[H]yokattadesu[/H]'); // よかったです（一括Enter確定）
      expect(res.streamText).toContain('[A]53[/A][G]sai[/G]'); // 53歳 (Space 2回で「差異」誤爆排除)
      expect(res.streamText).toContain('[Z]syusou[/Z]'); // 首相
      expect(res.streamText).toContain('[Z]tokidoki[/Z]'); // 時々 (踊り字々処理)
      expect(res.streamText).toContain('[Z]hutsuu[/Z]'); // 普通
      expect(res.streamText).toContain('[G]jyusinn[/G]'); // 受診 (Space 2回で「受信」誤爆排除)
      expect(res.streamText).toContain('[G]tyuusei[/G]'); // 中性 (Space 2回で「中世」誤爆排除)
      expect(res.streamText).toContain('[Z]rigaku[/Z][G]syoken[/G]'); // 理学所見 (Space 2回で「初見」誤爆排除)
      expect(res.streamText).toContain('[K]baitaru[/K][G]tokki[/G][H]nasi[/H]'); // バイタル特記なし (Space 2回で「突起」誤爆排除)
      expect(res.streamText).toContain('[Z]taidou[/Z][Z]ji[/Z]'); // 体動時 (「大導寺」誤爆排除)
      expect(res.streamText).toContain('[Z]haibu[/Z][Z]tuu[/Z]'); // 背部痛 (「セブ通」誤爆排除)
      expect(res.streamText).toContain('[Z]kinkimmakusei[/Z][Z]toutuu[/Z]'); // 筋筋膜性疼痛 (「筋す字幕」誤爆排除)
      expect(res.streamText).toContain('[G]naizou[/G][Z]sikkan[/Z]'); // 内臓疾患 (Space 2回で「内蔵」誤爆排除)
      expect(res.streamText).toContain('[Z]jyogai[/Z][Z]you[/Z]'); // 除外要 (「女外用」誤爆排除)
      expect(res.streamText).toContain('[Z]chintuuyaku[/Z][G]syoho[/G]'); // 鎮痛薬処方 (Space 2回で「初歩」誤爆排除)
      expect(res.streamText).toContain('[Z]sai[/Z][Z]kenn[/Z]'); // 再検 (「債権」誤爆排除)
      expect(res.streamText).toContain('[Z]ennsyou[/Z][G]hannnou[/G]'); // 炎症反応 (Space 2回 & hannnouで「版王」誤爆排除)
      expect(res.streamText).toContain('[Z]hukubu[/Z][Z]tyouonnpa[/Z]'); // 腹部超音波
      expect(res.streamText).toContain('[Z]seisa[/Z][Z]kentou[/Z]'); // 精査検討
    });
  });
});

