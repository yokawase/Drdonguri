// =============================================================================
// File: tests/keyStrokeCompiler.test.ts
// 説明: 長単位結合オートマトン（Sudachi Mode C思想）および
//       v20.1 HYBRIDキーストローク（[Z][K][H][A] ＋ 11ms遅延）の単体テスト
// =============================================================================

import { describe, it, expect, beforeAll } from 'vitest';
import {
  KeyStrokeCompiler,
  kanaToNormalizedRomaji,
  katakanaToRomaji,
  keyStrokeCompiler,
  ensureLexiconLoaded,
} from '../src/services/KeyStrokeCompiler';
import { preprocessMedicalText } from '../src/utils/medicalTextPreprocessor';

describe('長単位結合オートマトン (Sudachi Mode C) ＆ v20.1 HYBRIDキーストローク', () => {
  const compiler = new KeyStrokeCompiler();

  beforeAll(async () => {
    await ensureLexiconLoaded();
  });

  describe('1. 臨床テキストにおけるタグ生成実例（100%完全一致検証）', () => {
    it('ユーザー提示の臨床文章が指定のペイロードと1文字の狂いもなく完全一致すること', () => {
      const input = '先週から背中が疼痛あり、体を動かすと体動時疼痛増悪。アルコール性肝機能障害の疑い。γ-GTPが200台。';
      const expected =
        '[Z]sensyuu[/Z][H]kara[/H][Z]senaka[/Z][H]ga[/H][Z]toutuuari[/Z][H]、[/H][Z]karada[/Z][H]wo[/H][Z]ugoka[/Z][H]suto[/H][Z]taidou[/Z][Z]ji[/Z][Z]toutuu[/Z][Z]zouaku[/Z][H]。[/H] [K]aruko-ru[/K][Z]seikankinousyougai[/Z][Z]noutagai[/Z][H]。[/H] [A]γ-GTP[/A][H]ga[/H][Z]200dai[/Z][H]。[/H]';

      const res = compiler.compileText(input, { includeImeReset: false });

      expect(res.streamText).toBe(expected);
      // ALT codesが0件であることを保証
      expect(res.altCount).toBe(0);
      expect(res.streamText.includes('[ALT]')).toBe(false);
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
      expect(res.streamText).toBe('[Z]migikahukubutuu[/Z][H]ari[/H][H]。[/H] [Z]kyuuseityuusyuien[/Z][H]ha[/H][Z]hiteiteki[/Z][H]。[/H] [Z]hatunetu[/Z][H]nashi[/H][H]。[/H]');
    });

    it('処方・用法（カロナール錠500mg 1回1錠 疼痛時頓服）', () => {
      const input = 'カロナール錠500mg 1回1錠 疼痛時頓服。';
      const res = compiler.compileText(input, { includeImeReset: false });
      expect(res.streamText).toBe('[K]karona-ru[/K][Z]jyou[/Z][A]500mg[/A] [Z]1kai[/Z][Z]1jyou[/Z] [Z]toutuuji[/Z][Z]tonnpuku[/Z][H]。[/H]');
    });

    it('術後・経過（術後経過良好。創部感染なし。）', () => {
      const input = '術後経過良好。創部感染なし。';
      const res = compiler.compileText(input, { includeImeReset: false });
      expect(res.streamText).toBe('[Z]jutugo[/Z][Z]keikaryoukou[/Z][H]。[/H] [Z]soubu[/Z][Z]kansenn[/Z][H]nashi[/H][H]。[/H]');
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

      // 最適チャンク分解およびヘボン式によりMS-IME日常語誤爆を完全回避すること (GタグSpace2回依存全廃)
      expect(res.streamText).toContain('[Z]naishikyou[/Z][Z]shoken[/Z]'); // 内視鏡所見 (ヘボン式・Space1回)
      expect(res.streamText).toContain('[Z]soukiigan[/Z]'); // 早期胃癌
      expect(res.streamText).toContain('[Z]kannougata[/Z]'); // 陥凹型
      expect(res.streamText).toContain('[Z]henennnennmaku[/Z]'); // 辺縁粘膜
      expect(res.streamText).toContain('[Z]hidasyuutyuu[/Z]'); // ひだ集中
      expect(res.streamText).toContain('[Z]kyoukaimeiryou[/Z]'); // 境界明瞭
      expect(res.streamText).toContain('[Z]taishoku[/Z]'); // 褪色
      expect(res.streamText).toContain('[Z]bisaikekkan[/Z][Z]koutikuijyou[/Z]'); // 微細血管構築異常
      expect(res.streamText).toContain('[Z]tozetu[/Z]'); // 途絶
      expect(res.streamText).toContain('[Z]kambetushikkan[/Z]'); // 鑑別疾患
      expect(res.streamText).toContain('[Z]ikaiyou[/Z]'); // 胃潰瘍
      expect(res.streamText).toContain('[Z]shoukaseikaiyou[/Z]'); // 消化性潰瘍
      expect(res.streamText).toContain('[Z]hankonki[/Z]'); // 瘢痕期
      expect(res.streamText).toContain('[Z]iryouseipori-pu[/Z]'); // 胃良性ポリープ
      expect(res.streamText).toContain('[Z]tenkei[/Z][Z]shoken[/Z]'); // 典型所見
      expect(res.streamText).toContain('[Z]ikakubu[/Z][Z]shouwan[/Z]'); // 胃角部小弯
      expect(res.streamText).toContain('[Z]zenteibu[/Z]'); // 前庭部
      expect(res.streamText).toContain('[Z]asai[/Z]'); // 浅い
      expect(res.streamText).toContain('[Z]fusei[/Z][Z]kannou[/Z][Z]byouhen[/Z]'); // 不整陥凹病変
      expect(res.streamText).toContain('[Z]seisayou[/Z]'); // 精査要
      expect(res.streamText).toContain('[Z]rinshouhandan[/Z]'); // 臨床判断
      expect(res.streamText).toContain('[Z]soukiigan[/Z][Z]utagai[/Z]'); // 早期胃癌疑い
      expect(res.streamText).toContain('[Z]mansei[/Z][Z]ishukusei[/Z][Z]ien[/Z]'); // 慢性萎縮性胃炎
      expect(res.streamText).toContain('[Z]genkyokusei[/Z][H]biran[/H]'); // 限局性びらん
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

      // 最適チャンク分解＆ヘボン式標準打鍵による100%正当変換の検証 (Gタグ廃止)
      expect(res.streamText).toContain('[Z]kyou[/Z]'); // 今日
      expect(res.streamText).toContain('[H]yokattadesu[/H]'); // よかったです（一括Enter確定）
      expect(res.streamText).toContain('[Z]53sai[/Z]'); // 53歳 (法則②: 密結合打鍵)
      expect(res.streamText).toContain('[Z]shusou[/Z]'); // 首相
      expect(res.streamText).toContain('[Z]tokidoki[/Z]'); // 時々 (踊り字々処理)
      expect(res.streamText).toContain('[Z]hutsuu[/Z]'); // 普通
      expect(res.streamText).toContain('[Z]touinjushin[/Z]'); // 当院受診
      expect(res.streamText).toContain('[Z]chuusei[/Z]'); // 中性
      expect(res.streamText).toContain('[Z]rigakushoken[/Z]'); // 理学所見
      expect(res.streamText).toContain('[K]baitaru[/K][Z]tokki[/Z][H]nashi[/H]'); // バイタル特記なし
      expect(res.streamText).toContain('[Z]taidou[/Z][Z]ji[/Z][Z]haibutsuu[/Z]'); // 体動時背部痛 (大導寺誤爆を完全防止)
      expect(res.streamText).toContain('[Z]kinkimmakusei[/Z][Z]toutuu[/Z]'); // 筋筋膜性疼痛
      expect(res.streamText).toContain('[Z]naizoushikkan[/Z]'); // 内臓疾患
      expect(res.streamText).toContain('[Z]jogaiyou[/Z]'); // 除外要
      expect(res.streamText).toContain('[Z]chintuuyakushohou[/Z]'); // 鎮痛薬処方
      expect(res.streamText).toContain('[Z]saiken[/Z]'); // 再検
      expect(res.streamText).toContain('[Z]ensyouhannou[/Z]'); // 炎症反応
      expect(res.streamText).toContain('[Z]fukubuchouonpa[/Z][Z]seisakentou[/Z]'); // 腹部超音波精査検討
    });

    it('9. 医療提供体制・医療経済学・学術所見（Mozc＋医療辞書形態素解析・ヘボン式・動的一体化による100%正当変換検証）', () => {
      const academicText =
        '現代の医療提供体制において、医療費抑制を志向する国家財政政策、医療機関の財務的困窮、' +
        'そして臨床現場における低価値医療（Low-Value Care: LVC）の蔓延は、' +
        '個別の事象ではなく構造的に連結した一連の病理学的連鎖として捉える必要がある。' +
        '人口構造の急激な高齢化と社会保障給付費の膨張を背景とした公定価格の抑制や病床削減圧力というマクロ的環境は、' +
        '経営基盤の脆弱な中小病院のキャッシュフローを急速に枯渇させている。' +
        '銀行融資が途絶した医療機関が延命策として頼る診療報酬債権ファクタリングや外部再生資本の介入というメゾ的変容は、' +
        '医療機関の自律的ガバナンスを形骸化させ、資本回収を最優先とする経営管理を現場に持ち込む。' +
        'その結果として、現場の医療従事者には出来高点数を極大化するための診療圧力や過度なコスト削減が課され、' +
        '医学的蓋然性を欠くLVCの過剰提供と医療倫理の崩壊というミクロ的破綻へと至る。' +
        '本稿では、医療経済学、保健政策学、病院組織論、および生命倫理学の知見を統合し、' +
        'この三層連鎖が生み出す構造的病理を解明するとともに、制度改革に向けた学術的論点を提示する。';

      const res = compiler.compileText(academicText, { includeImeReset: false });

      // 過去に発生していた奇怪な誤変換キメラ文字列（亭友、国言え、級月日、工程値書く、出ライタ化、ち県、絵に後作、つる炎、山荘、字ちコミむ等）の完全根絶
      expect(res.streamText).not.toContain('teitomo'); // 提供（亭友）
      expect(res.streamText).not.toContain('kokuie'); // 国家（国言え）
      expect(res.streamText).not.toContain('kyuutukihi'); // 給付費（級月日）
      expect(res.streamText).not.toContain('deraitaka'); // 出来高（出ライタ化）
      expect(res.streamText).not.toContain('enikousaku'); // 延命策（絵に後作）
      expect(res.streamText).not.toContain('tsuruen'); // 蔓延（つる炎）
      expect(res.streamText).not.toContain('jitikomu'); // 持ち込む（字ちコミむ）
      expect(res.streamText).not.toContain('juukotomono'); // 従事者（中こともの）

      // ヘボン式・動的活用語尾一体化（志向する、過度な、課され、本稿では）による正しい打鍵検証
      expect(res.streamText).toContain('[Z]gendai[/Z]'); // 現代
      expect(res.streamText).toContain('[Z]iryouteikyoutaisei[/Z]'); // 医療提供体制 (長単位結合)
      expect(res.streamText).toContain('[Z]iryouhi[/Z]'); // 医療費
      expect(res.streamText).toContain('[Z]shikou[/Z][H]suru[/H]'); // 志向する (サ変分離で確実確定)
      expect(res.streamText).toContain('[Z]iryoukikann[/Z]'); // 医療機関
      expect(res.streamText).toContain('[Z]zaimuteki[/Z][Z]konkyuu[/Z]'); // 財務的困窮
      expect(res.streamText).toContain('[Z]teikatiiryou[/Z]'); // 低価値医療
      expect(res.streamText).toContain('[A]Low-Value[/A]'); // 英数字直接
      expect(res.streamText).toContain('[Z]mannenn[/Z]'); // 蔓延
      expect(res.streamText).toContain('[Z]kobetsu[/Z]'); // 個別
      expect(res.streamText).toContain('[Z]jishou[/Z]'); // 事象
      expect(res.streamText).toContain('[Z]kouzouteki[/Z]'); // 構造的
      expect(res.streamText).toContain('[Z]renketsu[/Z][H]shita[/H]'); // 連結した
      expect(res.streamText).toContain('[Z]ichirenn[/Z]'); // 一連
      expect(res.streamText).toContain('[Z]byourigaku[/Z][Z]teki[/Z][Z]rensa[/Z]'); // 病理学的連鎖
      expect(res.streamText).toContain('[Z]toraeru[/Z]'); // 捉える
      expect(res.streamText).toContain('[Z]jinkou[/Z][Z]kouzou[/Z]'); // 人口構造
      expect(res.streamText).toContain('[Z]kyuugeki[/Z][H]na[/H]'); // 急激な
      expect(res.streamText).toContain('[Z]koureika[/Z]'); // 高齢化
      expect(res.streamText).toContain('[Z]kyuufu[/Z][Z]hi[/Z]'); // 給付費
      expect(res.streamText).toContain('[Z]bouchou[/Z]'); // 膨張
      expect(res.streamText).toContain('[Z]haikei[/Z]'); // 背景
      expect(res.streamText).toContain('[Z]koutei[/Z][Z]kakaku[/Z]'); // 公定価格
      expect(res.streamText).toContain('[Z]byoushou[/Z][Z]sakugenn[/Z][Z]atsuryoku[/Z]'); // 病床削減圧力
      expect(res.streamText).toContain('[K]makuro[/K]'); // マクロ
      expect(res.streamText).toContain('[Z]keieikibann[/Z]'); // 経営基盤
      expect(res.streamText).toContain('[Z]zeijaku[/Z][H]na[/H]'); // 脆弱な
      expect(res.streamText).toContain('[Z]chuushou[/Z][Z]byouinn[/Z]'); // 中小病院
      expect(res.streamText).toContain('[Z]kyuusoku[/Z]'); // 急速
      expect(res.streamText).toContain('[Z]kokatsu[/Z]'); // 枯渇
      expect(res.streamText).toContain('[Z]ginkouyuushi[/Z]'); // 銀行融資
      expect(res.streamText).toContain('[Z]tozetu[/Z]'); // 途絶
      expect(res.streamText).toContain('[Z]enmei[/Z][Z]saku[/Z]'); // 延命策
      expect(res.streamText).toContain('[Z]shinryouhoushuu[/Z][Z]saikenn[/Z]'); // 診療報酬債権
      expect(res.streamText).toContain('[Z]gaibu[/Z][Z]saisei[/Z][Z]shihonn[/Z]'); // 外部再生資本
      expect(res.streamText).toContain('[Z]kainyuu[/Z]'); // 介入
      expect(res.streamText).toContain('[K]mezo[/K]'); // メゾ
      expect(res.streamText).toContain('[Z]hennyou[/Z]'); // 変容
      expect(res.streamText).toContain('[Z]jiritsuteki[/Z][K]gabanansu[/K]'); // 自律的ガバナンス
      expect(res.streamText).toContain('[Z]keigai[/Z]'); // 形骸化
      expect(res.streamText).toContain('[Z]shihonn[/Z][Z]kaishuu[/Z]'); // 資本回収
      expect(res.streamText).toContain('[Z]saiyuusenn[/Z]'); // 最優先
      expect(res.streamText).toContain('[Z]keieikanri[/Z]'); // 経営管理
      expect(res.streamText).toContain('[Z]mochikomu[/Z]'); // 持ち込む
      expect(res.streamText).toContain('[Z]iryou[/Z][Z]juuji[/Z][Z]sya[/Z]'); // 医療従事者
      expect(res.streamText).toContain('[Z]dekidaka[/Z][Z]tensuu[/Z]'); // 出来高点数
      expect(res.streamText).toContain('[Z]kyokudai[/Z][Z]kasu[/Z]'); // 極大化する
      expect(res.streamText).toContain('[Z]shinryou[/Z][Z]atsuryoku[/Z]'); // 診療圧力
      expect(res.streamText).toContain('[Z]kado[/Z][H]na[/H]'); // 過度な
      expect(res.streamText).toContain('[K]kosuto[/K]'); // コスト
      expect(res.streamText).toContain('[Z]sakugenn[/Z]'); // 削減
      expect(res.streamText).toContain('[Z]kasa[/Z][H]re[/H]'); // 課され
      expect(res.streamText).toContain('[Z]igakuteki[/Z][Z]gaizensei[/Z]'); // 医学的蓋然性
      expect(res.streamText).toContain('[Z]kaku[/Z]'); // 欠く
      expect(res.streamText).toContain('[Z]kajyou[/Z][Z]teikyou[/Z]'); // 過剰提供
      expect(res.streamText).toContain('[Z]iryou[/Z][Z]rinri[/Z]'); // 医療倫理
      expect(res.streamText).toContain('[Z]houkai[/Z]'); // 崩壊
      expect(res.streamText).toContain('[K]mikuro[/K]'); // ミクロ
      expect(res.streamText).toContain('[Z]hatann[/Z]'); // 破綻
      expect(res.streamText).toContain('[Z]honkou[/Z]'); // 本稿
      expect(res.streamText).toContain('[Z]iryoukeizaigaku[/Z]'); // 医療経済学
      expect(res.streamText).toContain('[Z]hokenn[/Z][Z]seisaku[/Z][Z]gaku[/Z]'); // 保健政策学
      expect(res.streamText).toContain('[Z]byouinn[/Z][Z]soshiki[/Z][Z]ron[/Z]'); // 病院組織論
      expect(res.streamText).toContain('[Z]seimei[/Z][Z]rinrigaku[/Z]'); // 生命倫理学
      expect(res.streamText).toContain('[Z]chikenn[/Z]'); // 知見
      expect(res.streamText).toContain('[Z]tougou[/Z]'); // 統合
      expect(res.streamText).toContain('[Z]sansou[/Z][Z]rensa[/Z]'); // 三層連鎖
      expect(res.streamText).toContain('[Z]umidasu[/Z]'); // 生み出す
      expect(res.streamText).toContain('[Z]kouzouteki[/Z][Z]byouri[/Z]'); // 構造的病理
      expect(res.streamText).toContain('[Z]kaimei[/Z][H]suru[/H]'); // 解明する
      expect(res.streamText).toContain('[Z]seido[/Z][Z]kaikaku[/Z]'); // 制度改革
      expect(res.streamText).toContain('[Z]gakujutsuteki[/Z][Z]rontenn[/Z]'); // 学術的論点
      expect(res.streamText).toContain('[Z]teiji[/Z][H]suru[/H]'); // 提示する
    });

    it('10. 診療情報提供書・サマリーにおける5大誤変換防止法則（電カルIMEコントロール）の検証', () => {
      const referralDraft =
        '【診療情報提供書 / 退院時サマリードラフト】\n' +
        '拝啓時下ますご清祥のこととお慶び申し上げます。平素より格別のご高配を賜り厚く御礼申し上げます。\n' +
        '今般、下記患者様につきまして専門的精査・加療をお願いしたくご紹介申し上げます。\n' +
        '60歳男。健診SLX41.8、正常38以下。';

      const res = compiler.compileText(referralDraft, { includeImeReset: false });

      // 【法則①: 最長一致キラー】専門的精査が「接門 適正さ」に化けないよう医療境界で確定
      expect(res.streamText).toContain('[Z]semmonteki[/Z][Z]seisa[/Z]');
      expect(res.streamText).not.toContain('semmontekiseisa'); // 誤爆最長一致の禁止

      // 【法則②: 密結合打鍵】「60差異」誤爆を防ぐ数詞＋助数詞の一体変換
      expect(res.streamText).toContain('[Z]60sai[/Z]');
      expect(res.streamText).not.toContain('[A]60[/A][Z]sai[/Z]'); // 分離禁止

      // 【法則③: 長単位コロケーション打鍵】「熱くお礼」格下げ防止・手紙格式漢字の召喚
      expect(res.streamText).toContain('[Z]atsukuonrei[/Z][Z]moushiagemasu[/Z]');
      expect(res.streamText).toContain('[H]nokototo[/H][Z]oyorokobi[/Z][Z]moushiagemasu[/Z]');

      // 【法則④: 公的レジストリ複合語打鍵】「診療情報提供所」タイポの根絶
      expect(res.streamText).toContain('[Z]shinryoujouhouteikyousho[/Z]');
      expect(res.streamText).not.toContain('shinryoujouhouteikyoujo'); // 「所」の禁止

      // 【法則⑤: 同音異義語コントロール】MS-IME第2候補「健診」の[G]Space2回直接確定
      expect(res.streamText).toContain('[G]kennsinn[/G]');
    });
  });
});


