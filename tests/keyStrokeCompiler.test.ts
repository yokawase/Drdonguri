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
        '[Z]sensyuu[/Z][H]kara[/H][Z]senaka[/Z][H]ga[/H][Z]toutuu[/Z][H]ari[/H][H]、[/H] [Z]karada[/Z][H]wo[/H][Z]ugoka[/Z][H]suto[/H][Z]taidouji[/Z][Z]toutuu[/Z][Z]zouaku[/Z][H]。[/H] [K]aruko-ru[/K][Z]seikankinousyougai[/Z][H]no[/H][Z]utagawi[/Z][H]。[/H] [A]γ-GTP[/A][H]ga[/H][A]200[/A][Z]dai[/Z][H]。[/H]';

      const res = compiler.compileText(input, { includeImeReset: false });

      expect(res.streamText).toBe(expected);
      // ALT codesが0件であることを保証
      expect(res.altCount).toBe(0);
      expect(res.streamText.includes('[ALT]')).toBe(false);
      // タグカウントの整合性
      expect(res.zCount).toBe(11); // sensyuu, senaka, toutuu, karada, ugoka, taidouji, toutuu, zouaku, seikankinousyougai, utagawi, dai
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

    it('「体動時」が「体動じ」にならず、接尾辞「時」が自立語と完全融合して [Z]taidouji[/Z] となること', () => {
      const res = compiler.compileText('体動時', { includeImeReset: false });
      expect(res.streamText).toBe('[Z]taidouji[/Z]');
      expect(res.streamText).not.toContain('[H]ji[/H]');
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

      // 正しい医療専門ローマ字で一括出力されていること
      expect(res.streamText).toContain('[Z]naishikyousyoken[/Z]'); // 内視鏡所見
      expect(res.streamText).toContain('[Z]soukiigan[/Z]'); // 早期胃癌
      expect(res.streamText).toContain('[Z]kannougata[/Z]'); // 陥凹型
      expect(res.streamText).toContain('[Z]hennennnemmaku[/Z]'); // 辺縁粘膜
      expect(res.streamText).toContain('[Z]hidasyuutyuu[/Z]'); // ひだ集中
      expect(res.streamText).toContain('[Z]kyoukaimeiryou[/Z]'); // 境界明瞭
      expect(res.streamText).toContain('[Z]taisyoku[/Z]'); // 褪色
      expect(res.streamText).toContain('[Z]bisaikekkankoutikuijyou[/Z]'); // 微細血管構築異常
      expect(res.streamText).toContain('[Z]tozetu[/Z]'); // 途絶
      expect(res.streamText).toContain('[Z]kambetusikkan[/Z]'); // 鑑別疾患
      expect(res.streamText).toContain('[Z]ikaiyou[/Z]'); // 胃潰瘍
      expect(res.streamText).toContain('[Z]syoukaseikaiyou[/Z]'); // 消化性潰瘍
      expect(res.streamText).toContain('[Z]hankonnki[/Z]'); // 瘢痕期
      expect(res.streamText).toContain('[Z]iryouuseipori-pu[/Z]'); // 胃良性ポリープ
      expect(res.streamText).toContain('[Z]tenkeisyoken[/Z]'); // 典型所見
      expect(res.streamText).toContain('[Z]ikakubusyouwann[/Z]'); // 胃角部小弯
      expect(res.streamText).toContain('[Z]zenteibu[/Z]'); // 前庭部
      expect(res.streamText).toContain('[Z]asai[/Z]'); // 浅い
      expect(res.streamText).toContain('[Z]fuseikannoubyouhenn[/Z]'); // 不整陥凹病変
      expect(res.streamText).toContain('[Z]rinsyouhanndann[/Z]'); // 臨床判断
      expect(res.streamText).toContain('[Z]manseiisyukuseiienn[/Z]'); // 慢性萎縮性胃炎
      expect(res.streamText).toContain('[Z]gennkyokusei[/Z]'); // 限局性
      expect(res.streamText).toContain('[Z]biran[/Z]'); // びらん
      expect(res.streamText).toContain('[Z]tekiouseisa[/Z]'); // 適応精査
    });
  });
});

