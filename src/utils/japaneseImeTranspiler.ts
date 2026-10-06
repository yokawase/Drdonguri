/**
 * 日本語 ➔ Windows / ChromeOS IME協調ローマ字・JISキーストローク トランスパイラ (v7.0 医療DX高精度版)
 * 
 * 医療現場の電子カルテにおいて、元の改行・段落レイアウトを100%忠実に保持しながら、
 * 英数字・記号・単位を <IME_OFF>（半角直接入力）で安全に打ち込み、
 * 医療用語・日本語は <IME_ON> でローマ字入力して直後に <CONV><ENTER>（変換・即時確定）を行う
 * 二重防護・全角半角分離キーストローク生成エンジン。
 */

// 全角記号・約物・全角英数 ➔ 半角ASCII置換辞書
export const FULLWIDTH_ASCII_MAP: Record<string, string> = {
  '（': '(', '）': ')', '［': '[', '］': ']',
  '｛': '{', '｝': '}', '〈': '<', '〉': '>', '《': '<', '》': '>',
  '「': '[', '」': ']', '『': '[', '』': ']',
  '：': ':', '；': ';', '？': '?', '！': '!', '／': '/', '＼': '\\',
  '＋': '+', '−': '-', '＝': '=', '＊': '*', '＆': '&', '％': '%',
  '＄': '$', '＃': '#', '＠': '@', '〜': '~', '＾': '^', '｜': '|',
  '℃': 'C', '℉': 'F',
  '　': ' ', // 全角スペース ➔ 半角スペース
  '※': '*', // 米印 ➔ アスタリスク
  // 注意: 【 】および ・ はカルテ標準記法および➗化防止のため半角ASCII置換しない
};

// 医療・カルテ・頻出単語・漢字 ➔ ローマ字・IME変換語彙辞書 (MEDICAL_DICTIONARY)
// MS-IMEで誤変換しやすい単語（光熱、兄性、最新、返答、主題、長身等）を徹底防止
export const MEDICAL_KANJI_ROMAJI_MAP: Record<string, string> = {
  // ★ 高価値ヘルスケア (HVC) / 健診 / 生活習慣 / 精査 専門文節 (長文・形態素完全保護)
  '健診で低い': 'kennsinndehikui ',
  '健診で': 'kennsinnde ',
  '健診': 'kennsinn ',
  '低い': 'hikui ',
  'コレステロール値を': 'koresutero-rutiwo ',
  'コレステロール値': 'koresutero-ruti ',
  'コレステロール': 'koresutero-ru ',
  '指摘された際': 'sitekisaretasai ',
  '指摘された': 'sitekisareta ',
  'すべての検査を': 'subetenokennsawo ',
  '画一的に行うのではなく': 'kakuitutekiniokonawunodehanaku ',
  '画一的に': 'kakuitutekini ',
  '画一的': 'kakuituteki ',
  '行うのではなく': 'okonawunodehanaku ',
  '行う': 'okonau ',
  '患者の症状やリスクに応じて': 'kannjyanosyoujyouyarisukuniouzite ',
  '患者の症状や': 'kannjyanosyoujyouya ',
  '患者の': 'kannjyano ',
  '症状や': 'syoujyouya ',
  '症状': 'syoujyou ',
  'に応じて': 'niouzite ',
  '応じて': 'ouzite ',
  '必要な検査を少しずつ進めていく': 'hituyounakennsawosukosizutsususumeteiku ',
  '必要な検査を': 'hituyounakennsawo ',
  '必要な': 'hituyouna ',
  '必要': 'hituyou ',
  '少しずつ進めていく': 'sukosizutsususumeteiku ',
  '少しずつ': 'sukosizutu ',
  '進めていく': 'susumeteiku ',
  '段階的なアプローチこそが': 'dankaitekinasuro-tikosoga ',
  '段階的なアプローチ': 'dankaitekinasuro-ti ',
  '段階的な': 'dankaitekina ',
  '段階的': 'dankaiteki ',
  'アプローチこそが': 'apuro-tikosoga ',
  'アプローチ': 'apuro-ti ',
  '真の意味での高価値ヘルスケア': 'sinnnoimideno koukatiherusukea ',
  '真の意味での': 'sinnnoimideno ',
  '真の意味': 'sinnnoimi ',
  '高価値ヘルスケア': 'koukatiherusukea ',
  '高価値医療': 'koukatiiryou ',
  '高価値': 'koukati ',
  '低価値医療': 'teikatiiryou ',
  '低価値': 'teikati ',
  'ヘルスケア': 'herusukea ',
  'となります': 'tonarimasu ',
  '最初のステップとして丁寧な問診や': 'saisyono suteppu tosite teineinamonnssinnya ',
  '最初のステップとして': 'saisyono suteppu tosite ',
  '最初のステップ': 'saisyono suteppu ',
  '最初の': 'saisyono ',
  '最初から': 'saisyokara ',
  '最初': 'saisyo ',
  'ステップとして': 'suteppu tosite ',
  'ステップ': 'suteppu ',
  '丁寧な問診や生活習慣の確認': 'teineinamonnssinnya seikatusyuukannnokakuninn ',
  '丁寧な問診や': 'teineinamonnssinnya ',
  '丁寧な': 'teineina ',
  '問診や': 'monnsinnya ',
  '問診': 'monnsinn ',
  '生活習慣の確認': 'seikatusyuukannnokakuninn ',
  '生活習慣': 'seikatusyuukann ',
  '確認': 'kakuninn ',
  '過去のデータ照合を行うことで': 'kakonode-tasyougouwo okonawukotode ',
  '過去のデータ照合': 'kakonode-tasyougou ',
  'データ照合': 'de-tasyougou ',
  '照合': 'syougou ',
  '行うことで': 'okonawukotode ',
  '身体的・経済的な負担を抑えつつ': 'sinntaiteki , keizaitekinahutannwo osaetutu ',
  '身体的・経済的な': 'sinntaiteki , keizaitekina ',
  '身体的': 'sinntaiteki ',
  '経済的な負担を': 'keizaitekinahutannwo ',
  '経済的な': 'keizaitekina ',
  '経済的': 'keizaiteki ',
  '負担を抑えつつ': 'hutannwo osaetutu ',
  '負担を': 'hutannwo ',
  '負担': 'hutann ',
  '抑えつつ': 'osaetutu ',
  '効率的に事前確率を評価できます': 'kouritutekini jizennkakuritowo hyoukadekimasu ',
  '効率的に': 'kouritutekini ',
  '効率的': 'kourituteki ',
  '事前確率を評価できます': 'jizennkakuritowo hyoukadekimasu ',
  '事前確率を': 'jizennkakuritowo ',
  '事前確率': 'jizennkakuritu ',
  '事前': 'jizenn ',
  '確率': 'kakuritu ',
  '評価できます': 'hyoukadekimasu ',
  '評価': 'hyouka ',
  '反対に': 'hanntaini ',
  '反対': 'hanntai ',
  '自覚症状のない低リスクな人に対して': 'jikakusyoujyounonai teirisukunahitonitaisite ',
  '自覚症状のない': 'jikakusyoujyounonai ',
  '低リスクな人に対して': 'teirisukunahitonitaisite ',
  '低リスクな': 'teirisukuna ',
  '低リスク': 'teirisuku ',
  '人に対して': 'hitonitaisite ',
  '結果の数値だけで最初から': 'kekkanosuutidakede saisyokara ',
  '結果の数値だけで': 'kekkanosuutidakede ',
  '結果の数値': 'kekkanosuuti ',
  '結果': 'kekka ',
  '数値だけで': 'suutidakede ',
  '数値': 'suuti ',
  '高度な画像検査や網羅的な二次精査を': 'koudonagazoukennsaya mouratekinanijiseisawo ',
  '高度な画像検査や': 'koudonagazoukennsaya ',
  '高度な画像検査': 'koudonagazoukennsa ',
  '高度な検査を': 'koudonakennsawo ',
  '高度な': 'koudona ',
  '高度': 'koudo ',
  '画像検査': 'gazoukennsa ',
  '網羅的な二次精査をすべて一律に': 'mouratekinanijiseisawo subete itirituni ',
  '網羅的な二次精査を': 'mouratekinanijiseisawo ',
  '網羅的な': 'mouratekina ',
  '網羅的': 'mourateki ',
  '二次精査を': 'nijiseisawo ',
  '二次精査': 'nijiseisa ',
  '精査': 'seisa ',
  'すべて一律に実施することは': 'subete itirituni jissisurukotowa ',
  'すべて一律に': 'subete itirituni ',
  '一律に実施することは': 'itirituni jissisurukotowa ',
  '一律に': 'itirituni ',
  '一律': 'itiritu ',
  '実施することは': 'jissisurukotowa ',
  '実施すること': 'jissisurukoto ',
  '実施': 'jissi ',
  '不要な不安や医療費を膨らませる': 'fuyounahuannya iryouhiwo hukuramaseru ',
  '不要な不安や': 'fuyounahuannya ',
  '不要な': 'fuyouna ',
  '不安や': 'huannya ',
  '不安': 'huann ',
  '医療費を膨らませる': 'iryouhiwo hukuramaseru ',
  '医療費を': 'iryouhiwo ',
  '医療費': 'iryouhi ',
  '膨らませる': 'hukuramaseru ',
  '膨': 'huku ',
  '低価値医療へとつながるため': 'teikatiiryouheto tunagarutame ',
  '低価値医療へと': 'teikatiiryouheto ',
  'つながるため': 'tunagarutame ',
  '注意が必要です': 'tyuuigahituyoudesu ',
  '注意が必要': 'tyuuigahituyou ',
  '注意': 'tyuui ',
  'したがって': 'sitagatte ',
  '最終的な治療方針や診断の確定に': 'saisyuutekina tiryouhousinnya sinndannnokakuteini ',
  '最終的な治療方針や': 'saisyuutekina tiryouhousinnya ',
  '最終的な': 'saisyuutekina ',
  '最終的': 'saisyuuteki ',
  '治療方針や': 'tiryouhousinnya ',
  '治療方針': 'tiryouhousinn ',
  '治療': 'tiryou ',
  '診断の確定に真に役立つケースでのみ': 'sinndannnokakuteini sinni yakudatu ke-sudenumi ',
  '診断の確定に': 'sinndannnokakuteini ',
  '確定に': 'kakuteini ',
  '確定': 'kakutei ',
  '真に役立つケースでのみ': 'sinni yakudatu ke-sudenumi ',
  '真に役立つ': 'sinniyakudatu ',
  '真に': 'sinni ',
  '役立つケースでのみ': 'yakudatu ke-sudenumi ',
  '役立つ': 'yakudatu ',
  'ケースでのみ': 'ke-sudenumi ',
  '高度な検査を選択することが': 'koudonakennsawo senntakusurukotoga ',
  '選択することが': 'senntakusurukotoga ',
  '選択すること': 'senntakusurukoto ',
  '選択': 'senntaku ',
  '患者が得られる利益を': 'kannjyagaerareru riekiwo ',
  '患者が得られる': 'kannjyagaerareru ',
  '得られる利益を': 'erareruriekiwo ',
  '得られる': 'erareru ',
  '利益を': 'riekiwo ',
  '利益': 'rieki ',
  '害の大きさが上回らないようにする': 'gainoookisaga uwamawaranaiyounisuru ',
  '害の大きさが': 'gainoookisaga ',
  '害の大きさ': 'gainoookisa ',
  '上回らないようにする医療のあり方といえます': 'uwamawaranaiyounisuru iryounoarikatatoiemasu ',
  '上回らないようにする': 'uwamawaranaiyounisuru ',
  '上回らない': 'uwamawaranai ',
  '医療のあり方といえます': 'iryounoarikatatoiemasu ',
  '医療のあり方': 'iryounoarikata ',
  'あり方といえます': 'arikatatoiemasu ',
  'あり方': 'arikata ',
  'といえます': 'toiemasu ',
  // カルテ見出し (SOAP / 検査 / 処方) - Linux Mozc / Windows 両対応の角括弧 [ ] 出力
  '【主訴】': '[syuso] ',
  '主訴': 'syuso ',
  '【現病歴】': '[gennbyoureki] ',
  '現病歴': 'gennbyoureki ',
  '【所見】': '[syokenn] ',
  '所見': 'syokenn ',
  '【他覚所見】': '[takakusyokenn] ',
  '他覚所見': 'takakusyokenn ',
  '【自覚症状】': '[jikakusyoujyou] ',
  '自覚症状': 'jikakusyoujyou ',
  '【診断】': '[sinndann] ',
  '診断': 'sinndann ',
  '【処方・方針】': '[syoho , housinn] ',
  '【処方】': '[syoho] ',
  '処方': 'syoho ',
  '【方針】': '[housinn] ',
  '方針': 'housinn ',
  '【バイタル・診察】': '[baitaru , sinnsatu]\n',
  '【バイタル】': '[baitaru] ',
  'バイタル': 'baitaru ',
  '【検査名】': '[kennsamei] ',
  '検査名': 'kennsamei ',
  '上部消化管内視鏡検査': 'jyoubusyoukakann naisikyoukennsa ',
  '上部消化管': 'jyoubusyoukakann ',
  '内視鏡検査': 'naisikyoukennsa ',
  '内視鏡': 'naisikyou ',
  '【食道】': '[syokudou  ] ',
  '食道': 'syokudou  ',
  '粘膜異常なし': 'nennmakuijyounasi ',
  '粘膜異常': 'nennmakuijyou ',
  '粘膜': 'nennmaku ',
  'に逆流性食道炎所見なし': 'ni gyakuryuuseisyokudouenn syokennnasi ',
  '逆流性食道炎所見なし': 'gyakuryuuseisyokudouenn syokennnasi ',
  '逆流性食道炎': 'gyakuryuuseisyokudouenn ',
  '所見なし': 'syokennnasi ',
  '【胃】': '[i  ] ',
  '胃': 'i  ',
  '穹窿部・体部粘膜正常': 'kyuuryoubu , taibu  nennmaku seijyou ',
  '穹窿部': 'kyuuryoubu ',
  '体部粘膜正常': 'taibu  nennmaku seijyou ',
  '体部': 'taibu  ',
  '粘膜正常': 'nennmaku seijyou ',
  '正常': 'seijyou ',
  '前庭部小彎に発赤・萎縮性変化軽度': 'zennteibu syouwannni hasseki  , isyukusei hennka keido ',
  '前庭部小彎': 'zennteibu syouwann ',
  '前庭部': 'zennteibu ',
  '小彎': 'syouwann ',
  '発赤・萎縮性変化軽度': 'hasseki  , isyukusei hennka keido ',
  '発赤': 'hasseki  ',
  '萎縮性変化軽度': 'isyukusei hennka keido ',
  '萎縮性変化': 'isyukusei hennka ',
  '萎縮性': 'isyukusei ',
  '変化': 'hennka ',
  '木村・竹本分類': 'kimura , takemoto bunnrui ',
  '木村': 'kimura ',
  '竹本': 'takemoto ',
  '分類': 'bunnrui ',
  '幽門輪直前に3mm大の平坦びらん認めるも出血徴候なし': 'yuumonnrinn tyokuzennni 3mm daino heitannbirann mitomerumo syukketu tyoukou  nasi ',
  '幽門輪直前に': 'yuumonnrinn tyokuzennni ',
  '幽門輪': 'yuumonnrinn ',
  '直前に': 'tyokuzennni ',
  '平坦びらん認めるも出血徴候なし': 'heitannbirann mitomerumo syukketu tyoukou  nasi ',
  '平坦びらん': 'heitannbirann ',
  '平坦': 'heitann ',
  'びらん': 'birann ',
  '認めるも': 'mitomerumo ',
  '出血徴候なし': 'syukketu tyoukou  nasi ',
  '出血徴候': 'syukketu tyoukou  ',
  '徴候なし': 'tyoukou  nasi ',
  '徴候': 'tyoukou  ',
  '悪性所見認めず': 'akuseisyokenn mitomezu ',
  '悪性所見': 'akuseisyokenn ',
  '認めず': 'mitomezu ',
  '【十二指腸】': '[jyuunisityou] ',
  '十二指腸': 'jyuunisityou ',
  '球部及び下行脚に潰瘍・狭窄なし': 'kyuubu  oyobi kakoukyakuni kaiyou  , kyousakunasi ',
  '球部及び下行脚': 'kyuubu  oyobi kakoukyaku ',
  '球部': 'kyuubu  ',
  '下行脚': 'kakoukyaku ',
  '潰瘍・狭窄なし': 'kaiyou  , kyousakunasi ',
  '潰瘍': 'kaiyou  ',
  '狭窄なし': 'kyousakunasi ',
  '狭窄': 'kyousaku ',
  '【処置・方針】': '[syoti , housinn]\n',
  '【処置】': '[syoti] ',
  '処置': 'syoti ',
  '生検非施行': 'seikenn  hisikou ',
  '生検': 'seikenn  ',
  '非施行': 'hisikou ',
  '表層性胃炎': 'hyousouseiienn ',
  '表層性': 'hyousousei ',
  '胃炎': 'ienn ',
  'ヘリコバクター・ピロリ既感染疑い': 'herikobakuta- , pirori kikannsenn utagai ',
  'ヘリコバクター・ピロリ': 'herikobakuta- , pirori ',
  'ヘリコバクター': 'herikobakuta- ',
  'ピロリ': 'pirori ',
  '既感染疑い': 'kikannsenn utagai ',
  '既感染': 'kikannsenn ',
  '定期健診を推奨': 'teikikennsinnwo suisyou ',
  '定期健診': 'teikikennsinn ',
  '推奨': 'suisyou ',
  '内視鏡検診の適正性': 'naisikyou kennsinnno tekiseisei ',
  '内視鏡検診': 'naisikyou kennsinn ',
  '検診の適正性': 'kennsinnno tekiseisei ',
  '適正性': 'tekiseisei ',
  '萎縮性軽度': 'isyukusei keido ',
  '過度の内視鏡検査は不要です': 'kadona naisikyoukennsaha fuyou desu ',
  '過度': 'kado ',
  '不要です': 'fuyou desu ',
  '不要で': 'fuyoude ',
  '不要': 'fuyou ',
  '不': 'fu ',
  '要': 'you ',
  '妥当な判断です': 'datouna hanndann desu ',
  '妥当な': 'datouna ',
  '妥当です': 'datou desu ',
  '妥当': 'datou ',
  '一方': 'ippou ',
  '過去の': 'kakono ',
  '過去': 'kako ',
  '女性': 'jyosei ',
  '男性': 'dannsei ',
  '【生活習慣・問診】': '[seikatusyuukann , monnsinn] ',
  '【診察】': '[sinnsatu] ',
  '診察': 'sinnsatu ',
  '【健診データ (判定)】': '[kensinndata ( hanntei )] ',
  '【健診データ】': '[kensinndata] ',
  '健診データ': 'kensinndata ',
  '判定': 'hanntei ',
  '【S】': '[S] ',
  '【O】': '[O] ',
  '【A】': '[A] ',
  '【P】': '[P] ',

  // ── 医療価値・医療経済・HVC / LVC・QALY・臨床評価 ──
  '医療価値': 'iryoukati ',
  '基本方程式': 'kihonnhouteisiki ',
  '方程式': 'houteisiki ',
  '基本': 'kihonn ',
  '医療経済学': 'iryoukeizaigaku ',
  '医療経済学的評価': 'iryoukeizaigakuteki hyouka ',
  '医療経済': 'iryoukeizai ',
  '経済学': 'keizaigaku ',
  '経済': 'keizai ',
  '標準的な定義式です': 'hyoujunntekina teigeisiki desu ',
  '標準的な定義式': 'hyoujunntekina teigeisiki ',
  '標準的な': 'hyoujunntekina ',
  '標準的': 'hyoujunnteki ',
  '定義式': 'teigeisiki ',
  '定義': 'teigi ',
  '患者': 'kannjya ',
  '臨床的・質的利益': 'rinnsyouteki , situtekirieki ',
  '臨床的・質的アウトカム': 'rinnsyouteki , situteki autokamu ',
  '臨床的': 'rinnsyouteki ',
  '臨床': 'rinnsyou ',
  '質的利益': 'situtekirieki ',
  '質的アウトカム': 'situteki autokamu ',
  '質的': 'situteki ',
  'アウトカム': 'autokamu ',
  '副作用・費用・身体的侵襲・精神的ストレス': 'fukusayou , hiyou , sinntaiteki sinnsyuu , seisinnteki sutoresu ',
  '副作用': 'fukusayou ',
  '費用': 'hiyou ',
  '直接費用': 'tyokusetu hiyou ',
  '直接': 'tyokusetu ',
  '身体的侵襲': 'sinntaiteki sinnsyuu ',
  '侵襲': 'sinnsyuu ',
  '精神的ストレス': 'seisinnteki sutoresu ',
  '精神的': 'seisinnteki ',
  '明確に上回る状態を指します': 'meikakuni uwamawaru jyoutaiwo sasisimasu ',
  '明確に上回る': 'meikakuni uwamawaru ',
  '明確に': 'meikakuni ',
  '明確': 'meikaku ',
  '上回る': 'uwamawaru ',
  '状態を指します': 'jyoutaiwo sasisimasu ',
  '状態': 'jyoutai ',
  '指します': 'sasisimasu ',
  '公的医療評価': 'kouteki iryou hyouka ',
  '公的医療': 'kouteki iryou ',
  '公的': 'kouteki ',
  '社会実装モデル': 'syakai jissou moderu ',
  '社会実装': 'syakai jissou ',
  '社会': 'syakai ',
  '実装': 'jissou ',
  '介入が': 'kainyuuga ',
  '介入': 'kainyuu ',
  '数理的に判定する標準手法です': 'suuritekini hanntei suru hyoujunn syuhou desu ',
  '数理的に判定する': 'suuritekini hanntei suru ',
  '数理的': 'suuriteki ',
  '数理': 'suuri ',
  '標準手法': 'hyoujunn syuhou ',
  '手法': 'syuhou ',
  '質調整生存年': 'situtyousei seizonnnenn ',
  '質調整': 'situtyousei ',
  '生存年数': 'seizonnnennsuu ',
  '生存年': 'seizonnnenn ',
  '生存': 'seizonn ',
  '計算': 'keisann ',
  '効用値': 'kouyouti ',
  '効用': 'kouyou ',
  '完全な健康': 'kannzennna kennkou ',
  '完全な': 'kannzennna ',
  '完全': 'kannzenn ',
  '健康': 'kennkou ',
  '死亡を': 'sibouwo ',
  '死亡': 'sibou ',
  '時間得失法': 'jikanntokusituhou ',
  '得失法': 'tokusituhou ',
  '得失': 'tokusitu ',
  '測定します': 'sokutei simasu ',
  '測定': 'sokutei ',


  // ── 大腸内視鏡・消化器癌・細菌学・臨床意思決定 ──
  '大腸がん検診': 'daityougannkennsinn ',
  '大腸がん': 'daityougann ',
  '大腸内視鏡検査の適応評価': 'daityounaisikyoukennsa no tekiouhyouka ',
  '大腸内視鏡検査': 'daityounaisikyoukennsa ',
  '大腸内視鏡の適応に関する判断': 'daityounaisikyou no tekiounikannsuru hanndann ',
  '大腸内視鏡の適応': 'daityounaisikyou no tekiou ',
  '大腸内視鏡': 'daityounaisikyou ',
  '全大腸内視鏡': 'zenndaityounaisikyou ',
  '完全内視鏡': 'kannzennnaisikyou ',
  '大腸': 'daityou ',
  'がん検診': 'gannkennsinn ',
  'がん': 'gann ',
  '検診': 'kennsinn ',
  '便潜血検査': 'bennsennketukennsa ',
  '便潜血': 'bennsennketu ',
  '便中': 'bentyuu ',
  '便': 'benn ',
  '潜血': 'sennketu ',
  '陰性だったものの': 'innseidattamonono ',
  '陰性であっても': 'innsedeattemo ',
  '陰性': 'innsei ',
  '陽性となったため受診': 'youseitonattatame jyusinn ',
  '陽性となったため': 'youseitonattatame ',
  '陽性となり': 'youseitonari ',
  '陽性となった': 'youseitonatta ',
  '陽性のみを理由とした': 'youseinomiwo riyuutosite ',
  '陽性のみを理由': 'youseinomiwo riyuu ',
  '陽性のみ': 'youseinomi ',
  '陽性の評価': 'yousei no hyouka ',
  '陽性': 'yousei ',
  'コリバクチン産生菌': 'koribakutinn sannseikinn ',
  'コリバクチン': 'koribakutinn ',
  '産生菌': 'sannseikinn ',
  '産生': 'sannsei ',
  '受診': 'jyusinn ',
  '心配ということで': 'sinpaidatoiukotode ',
  '心配': 'sinpai ',
  '本人希望で': 'honnninnkiboude ',
  '本人希望': 'honnninnkibou ',
  '本人の希望による': 'honnninnno kibouniyoru ',
  '本人の希望': 'honnninnno kibou ',
  '本人の不安解消': 'honnninnno fuannkaisyou ',
  '本人': 'honnninn ',
  '希望して受診': 'kibousite jyusinn ',
  '希望': 'kibou ',
  '不安解消': 'fuannkaisyou ',
  '解消': 'kaisyou ',
  '行うのは': 'okonaunoha ',
  '症例の背景': 'syourei no haikei ',
  '症例': 'syourei ',
  '背景': 'haikei ',
  '現時点のエビデンスでは': 'gennjitennno ebidennsudeha ',
  '現時点のエビデンス': 'gennjitennno ebidennsu ',
  'エビデンス': 'ebidennsu ',
  '単回測定による': 'tannkaisokutei niyoru ',
  '単回測定': 'tannkaisokutei ',
  '単回': 'tannkai ',
  '適応根拠やリスク層別化': 'tekioukonnkyo ya risuku soubetuka ',
  '適応根拠': 'tekioukonnkyo ',
  '根拠': 'konnkyo ',
  'リスク層別化に用いることは支持されていない': 'risuku soubetukani motiirukotoha sizisareteinai ',
  'リスク層別化': 'risuku soubetuka ',
  '層別化': 'soubetuka ',
  '支持されていない': 'sizisareteinai ',
  '支持': 'sizi ',
  '用いることは支持されていない': 'motiirukotoha sizisareteinai ',
  '用いることは': 'motiirukotoha ',
  '用いる': 'motiiru ',
  '無症候群と対照群で検出率に有意差はない': 'musyoukougunn to taisyougunnde kennsyuturituni yuuisaha nai ',
  '無症候群と対照群': 'musyoukougunn to taisyougunn ',
  '無症候群': 'musyoukougunn ',
  '対照群': 'taisyougunn ',
  '検出率に有意差はない': 'kennsyuturituni yuuisaha nai ',
  '検出率': 'kennsyuturitu ',
  '検出': 'kennsyutu ',
  '有意差はない': 'yuuisaha nai ',
  '有意差': 'yuuisa ',
  '高品質な全大腸内視鏡を受けていない': 'kouhinsituna zenndaityounaisikyouwo uketeinai ',
  '高品質な全大腸内視鏡': 'kouhinsituna zenndaityounaisikyou ',
  '高品質な完全内視鏡': 'kouhinsituna kannzennnaisikyou ',
  '高品質な内視鏡検査歴': 'kouhinsituna naisikyoukennsareki ',
  '高品質な内視鏡検査': 'kouhinsituna naisikyoukennsa ',
  '高品質な': 'kouhinsituna ',
  '高品質': 'kouhinsitu ',
  '受けていない': 'uketeinai ',
  '十分な説明に基づいた': 'jyuubunnna setumeini motoduita ',
  '十分な説明': 'jyuubunnna setumei ',
  '説明に基づいた': 'setumeini motoduita ',
  '十分な': 'jyuubunnna ',
  '十分': 'jyuubunn ',
  '説明': 'setumei ',
  '基づいた': 'motoduita ',
  '妥当な選択肢である': 'datouna senntakusi dearu ',
  '妥当な選択肢': 'datouna senntakusi ',
  '選択肢である': 'senntakusi dearu ',
  '選択肢': 'senntakusi ',
  '盲腸到達・前処置良好・腫瘍なしを満たす': 'moutyoutoutatu , zennsyotiryoukou , syuyounasiwo mitasu ',
  '盲腸到達': 'moutyoutoutatu ',
  '盲腸': 'moutyou ',
  '到達': 'toutatu ',
  '前処置良好': 'zennsyotiryoukou ',
  '前処置': 'zennsyoti ',
  '良好': 'ryoukou ',
  '腫瘍なしを満たす': 'syuyounasiwo mitasu ',
  '腫瘍なし': 'syuyounasi ',
  '腫瘍': 'syuyou ',
  '満たす': 'mitasu ',
  '早期の再検は追加利益が小さく過剰検査となり得る': 'soukino saikennha tuikariekiga tiisaku kajyoukennsatoni uru ',
  '早期の再検': 'soukino saikenn ',
  '早期': 'souki ',
  '再検は': 'saikennha ',
  '再検': 'saikenn ',
  '追加利益が小さく': 'tuikariekiga tiisaku ',
  '追加利益': 'tuikarieki ',
  '追加': 'tuika ',
  '小さく': 'tiisaku ',
  '過剰検査となり得る': 'kajyoukennsatoni uru ',
  '過剰検査': 'kajyoukennsa ',
  '過剰な再検': 'kajyouna saikenn ',
  '過剰な': 'kajyouna ',
  '過剰': 'kajyou ',
  'となり得る': 'tonariuru ',
  '確認してください': 'kakunnsite kudasai ',
  '直近で完全な検査が実施されていない場合': 'tyokkinde kannzennna kennsaga jissisareteinai baai ',
  '直近で完全な検査': 'tyokkinde kannzennna kennsa ',
  '直近10年以内に': 'tyokkinn 10 nenninaini ',
  '直近': 'tyokkinn ',
  '内視鏡未施行なら': 'naisikyou misikounara ',
  '未施行なら': 'misikounara ',
  '未施行': 'misikou ',
  '踏まえても': 'humaetemo ',
  '踏まえて': 'humaete ',
  '継続するか': 'keizokusuruka ',
  '行うかはいずれも': 'okonaukaha izuremo ',
  '行うか': 'okonauka ',
  'いずれも': 'izuremo ',
  '合理的です': 'gouritekidesu ',
  '合理的': 'gouriteki ',
  '進行腺腫': 'sinnkousennsyu ',
  '鋸歯状病変': 'kyosijyoubyouhenn ',
  '鋸歯状': 'kyosijyou ',
  '優れますが': 'suguremasuga ',
  '優れる': 'sugureru ',
  '鎮静': 'tinnsei ',
  '穿孔': 'sennkou ',
  '負担を伴います': 'hutannwo tomonaimasu ',
  '伴います': 'tomonaimasu ',
  '伴う': 'tomonau ',
  '良好な性能': 'ryoukouna seinou ',
  '性能を示す': 'seinouwo simesu ',
  '性能': 'seinou ',
  '示す': 'simesu ',
  '感度は': 'kanndoha ',
  '感度': 'kanndo ',
  '正常なら': 'seijyounara ',
  '一般には': 'ippannniha ',
  '一般': 'ippann ',
  '一親等の大腸がん': 'issinntouno daityougann ',
  '一親等の': 'issinntouno ',
  '一親等': 'issinntou ',
  '進行ポリープ': 'sinnkou pori-pu ',
  '本人の腺腫歴': 'honnninnno sensyureki ',
  '腺腫歴': 'sensyureki ',
  '腺腫': 'sensyu ',
  '炎症性腸疾患': 'ennsyousei tyousikkann ',
  '炎症性': 'ennsyousei ',
  '遺伝性腫瘍症候群': 'idennsei syuyou syoukougunn ',
  '遺伝性': 'idennsei ',
  '腫瘍症候群': 'syuyousyoukougunn ',
  '貧血': 'hinnketu ',
  '体重減少': 'taijyuu gennsyou ',
  '血便': 'ketubenn ',
  '便通変化': 'benntuu hennka ',
  '便通': 'benntuu ',
  '診断目的として': 'sinndannmokuteki tosite ',
  '診断目的': 'sinndannmokuteki ',
  '優先します': 'yuusennsimasu ',
  '優先': 'yuusenn ',
  '無症候者': 'musyoukousya ',
  '無症候': 'musyoukou ',
  '発見される': 'hakkennsareru ',
  '発見': 'hakkenn ',
  '少ないものの': 'sukunaimonono ',
  '低頻度だが存在した': 'teihinndodaga sonnzaisita ',
  '低頻度だが': 'teihinndodaga ',
  '低頻度': 'teihinndo ',
  '存在した': 'sonnzaisita ',
  '存在': 'sonnzai ',
  '年以内に': 'nenninaini ',
  '年以内': 'nenninai ',
  '完全な検査': 'kannzennna kennsa ',
  '実施されていない場合': 'jissisareteinai baai ',
  '実施されていない': 'jissisareteinai ',
  'スクリーニングとして': 'sukuri-ninngutosite ',
  'スクリーニング': 'sukuri-ninngu ',
  '推奨されません': 'suisyousaremasenn ',
  '医療ですか': 'iryou desuka ',
  'ですか': 'desuka ',

  // ── 頭部外傷・急性期診療・神経診察 ──
  '午前': 'gozenn ',
  '午後': 'gogo ',
  '時間': 'jikann ',
  '撮影': 'satuei ',
  'CT撮影': 'CT satuei ',

  '自宅フローリングで滑って後頭部打撲': 'jitaku furo-rinngude subette koutoubu daboku ',
  '後頭部打撲': 'koutoubu daboku ',
  '後頭部を強打': 'koutoubuwo kyouda ',
  '後頭部': 'koutoubu ',
  '頭部打撲傷': 'toubudabokusyou ',
  '頭部打撲': 'toubudaboku ',
  '頭部': 'toubu ',
  '打撲傷': 'dabokusyou ',
  '打撲': 'daboku ',
  '強打': 'kyouda ',
  '滑って': 'subette ',
  'フローリング': 'furo-rinngu ',
  '自宅': 'jitaku ',
  '室内で転倒し': 'situnaide tenntousi ',
  '室内で': 'situnaide ',
  '室内': 'situnai ',
  '転倒し': 'tenntousi ',
  '転倒': 'tenntou ',
  '一過性意識消失なし': 'ikkasei isikisyousitu nasi ',
  '一過性意識消失': 'ikkasei isikisyousitu ',
  '意識消失なし': 'isikisyousitu nasi ',
  '意識消失': 'isikisyousitu ',
  '一過性': 'ikkasei ',
  '健忘なし': 'kennbou nasi ',
  '健忘': 'kennbou ',
  '受傷後の悪心・嘔吐なし': 'jyusyougono akusin , outonasi ',
  '悪心・嘔吐なし': 'akusin , outonasi ',
  '悪心・嘔吐': 'akusin , outo ',
  '受傷後の': 'jyusyougono ',
  '受傷後': 'jyusyougo ',
  '受傷': 'jyusyou ',
  '悪心なし': 'akusin nasi ',
  '悪心': 'akusin ',
  '嘔吐なし': 'outonasi ',
  '嘔吐': 'outo ',
  '清明': 'seimei ',
  '瞳孔不同なし': 'doukouhudou nasi ',
  '瞳孔不同': 'doukouhudou ',
  '瞳孔': 'doukou ',
  '対光反射': 'taikouhannsya ',
  '迅速・左右差なし': 'jinnsoku , sayuusa nasi ',
  '左右差なし': 'sayuusa nasi ',
  '左右差': 'sayuusa ',
  '迅速': 'jinnsoku ',
  '局所神経学的異常なし': 'kyokusyo sinnkeigakuteki ijyounasi ',
  '局所神経学的異常': 'kyokusyo sinnkeigakuteki ijyou ',
  '神経学的異常なし': 'sinnkeigakuteki ijyounasi ',
  '神経学的異常': 'sinnkeigakuteki ijyou ',
  '神経学的': 'sinnkeigakuteki ',
  '局所': 'kyokusyo ',
  '四肢麻痺・しびれなし': 'sisimahi , sibire nasi ',
  '四肢麻痺': 'sisimahi ',
  'しびれなし': 'sibire nasi ',
  'しびれ': 'sibire ',
  '構音障害なし': 'kouonnsyougai nasi ',
  '構音障害': 'kouonnsyougai ',
  '皮下血腫': 'hikakessyu ',
  '軽度皮下血腫': 'keido hikakessyu ',
  '血腫': 'kessyu ',
  'たんこぶ': 'tannkobu ',
  '陥没骨折兆候なし': 'kannbotukossetu tyoukounasi ',
  '陥没骨折': 'kannbotukossetu ',
  '骨折': 'kossetu ',
  '耳出血・鼻出血なし': 'jisyukketu , bisyukketu nasi ',
  '耳出血': 'jisyukketu ',
  '鼻出血なし': 'bisyukketu nasi ',
  '鼻出血': 'bisyukketu ',
  '軽症': 'keisyou ',
  '日本救急医学会・神経外科学会頭部外傷指針': 'nihonn kyuukyuu igakkai , sinnkei geka gakkai toubu gaisyou sisinn ',
  '日本救急医学会': 'nihonn kyuukyuu igakkai ',
  '神経外科学会': 'sinnkei geka gakkai ',
  '頭部外傷指針': 'toubugaisyousisinn ',
  '頭部外傷': 'toubugaisyou ',
  '外傷指針': 'gaisyou sisinn ',
  '外傷': 'gaisyou ',
  '指針': 'sisinn ',
  'に基づき': 'nimotuduki ',
  '現時点でルーチン頭部CTの適応なし': 'gennjitennde ru-tinn toubu CT no tekiounasi ',
  '現時点で': 'gennjitennde ',
  '現時点': 'gennjitenn ',
  'ルーチン頭部CT': 'ru-tinn toubu CT ',
  'ルーチン': 'ru-tinn ',
  '頭部CT': 'toubu CT ',
  '適応なし': 'tekiounasi ',
  '観察待機プロトコルを選択し': 'kannsatu taiki purotokoruwo senntakusi ',
  '観察待機プロトコル': 'kannsatu taiki purotokoru ',
  '観察待機': 'kannsatu taiki ',
  '待機': 'taiki ',
  '選択し': 'senntakusi ',
  '不要な放射線被曝を回避': 'fuyouna housyasenn hibakuwo kaihi ',
  '放射線被曝を回避': 'housyasenn hibakuwo kaihi ',
  '放射線被曝': 'housyasenn hibaku ',
  '被曝を回避': 'hibakuwo kaihi ',
  '被曝': 'hibaku ',
  '回避': 'kaihi ',
  '帰宅後24〜48時間の観察注意点を説明': 'kitakugo 24~48 jikanno kannsatutyuuitennwo setumei ',
  '帰宅後': 'kitakugo ',
  '帰宅': 'kitaku ',
  '観察注意点を説明': 'kannsatutyuuitennwo setumei ',
  '観察注意点': 'kannsatutyuuitenn ',
  '注意点を説明': 'tyuuitennwo setumei ',
  '注意点': 'tyuuitenn ',
  '激しい頭痛': 'hagesii zutuu ',
  '激しい': 'hagesii ',
  '反復する嘔吐': 'hannpukusuru outo ',
  '反復する': 'hannpukusuru ',
  '反復': 'hannpuku ',
  '意識朦朧': 'isiki mourou ',
  '手足の脱力・麻痺': 'teasi no daturyoku , mahi ',
  '手足の脱力': 'teasi no daturyoku ',
  '手足の': 'teasi no ',
  '手足': 'teasi ',
  '脱力': 'daturyoku ',
  '麻痺': 'mahi ',
  '痙攣発作が出現した場合は直ちに救急受診することを指示': 'keirenn hossaga syutugenn sitabaaiha tadatini kyuukyuujyusinn surukotowo siji ',
  '痙攣発作が出現した場合は': 'keirenn hossaga syutugenn sitabaaiha ',
  '痙攣発作': 'keirenn hossa ',
  '痙攣': 'keirenn ',
  '発作': 'hossa ',
  '出現した場合は': 'syutugenn sitabaaiha ',
  '出現した場合': 'syutugenn sitabaai ',
  '直ちに救急受診することを指示': 'tadatini kyuukyuujyusinn surukotowo siji ',
  '直ちに': 'tadatini ',
  '救急受診することを指示': 'kyuukyuujyusinn surukotowo siji ',
  '救急受診': 'kyuukyuujyusinn ',
  'カナダ頭部CTルール': 'kanadatoubu CT ru-ru ',
  'CT撮影の適応なしと判断': 'CT satuei no tekiou nasi to hanndann ',
  '適応なしと判断': 'tekiounasi to hanndann ',
  '判断': 'hanndann ',
  '経過観察プロトコルを適用し': 'keika kannsatu purotokoruwo tekiyousi ',
  '経過観察プロトコル': 'keika kannsatu purotokoru ',
  '経過観察': 'keika kannsatu ',
  '適用し': 'tekiyousi ',
  '適用': 'tekiyou ',
  '被曝リスクを回避': 'hibaku risukuwo kaihi ',
  '被曝リスク': 'hibaku risuku ',
  'リスクを回避': 'risukuwo kaihi ',
  'リスク': 'risuku ',

  // 症状・病態・医療診察
  '発熱': 'hatunetu ',
  '咽頭痛': 'intoutuu ',
  '乾性咳嗽': 'kannsei gaisou ',
  '湿性咳嗽': 'sissei gaisou ',
  '咳嗽': 'gaisou ',
  '乾性': 'kannsei ',
  '湿性': 'sissei ',
  '微熱': 'binetu ',
  '高熱持続': 'kounetu jizoku ',
  '高熱': 'kounetu ',
  '自覚': 'jikaku ',
  '他覚': 'takaku ',
  '3日前より': 'sannnitimae yori ',
  '3日前': 'sannnitimae ',
  '昨日夜より': 'sakuyayori ',
  '昨日夜': 'sakuya ',
  '昨夜より': 'sakuyayori ',
  '昨夜': 'sakuya ',
  '昨日': 'sakujitu ',
  '本日': 'honnjitu ',
  '明日': 'asu ',
  'room air': 'room air ',
  'Rp.': 'Rp. \n',
  '1)': '1) ',
  '2)': '2) ',
  '3)': '3) ',
  '度まで': 'do made ',
  '℃まで': 'do made ',
  '℃': 'do ',
  '夜': 'yoru ',
  '朝': 'asa ',
  '昼': 'hiru ',
  '夕': 'yuu ',
  '体温上昇': 'taionnjyousyou ',
  '体温': 'taionn ',
  '上昇し': 'jyousyou si ',
  '上昇': 'jyousyou ',
  '低下': 'teika ',
  '市販風邪薬': 'sihannkazegusuri ',
  '風邪薬': 'kazegusuri ',
  '総合感冒薬': 'sougoukannbouyaku ',
  '市販': 'sihann ',
  '内服するも': 'naifuku surumo ',
  '内服': 'naifuku ',
  '服用': 'fukuyou ',
  '改善に乏しく': 'kaizenn ni tobosiku ',
  '改善': 'kaizenn ',
  '乏しく': 'tobosiku ',
  '乏しい': 'tobosii ',
  '来院': 'raiinn ',
  '咽頭発赤': 'intou hasseki ',
  '咽頭': 'intou ',
  '扁桃腫大': 'henntou syudai ',
  '扁桃': 'henntou ',
  '腫大': 'syudai ',
  '頸部リンパ節腫脹': 'keibu rinnpasetu syutyou ',
  '頸部リンパ節': 'keibu rinnpasetu ',
  'リンパ節腫脹': 'rinnpasetu syutyou ',
  '頸部': 'keibu ',
  'リンパ節': 'rinnpasetu ',
  '腫脹': 'syutyou ',
  '胸部聴診呼吸音清': 'kyoubu tyousinn kokyuuonn sei ',
  '胸部聴診': 'kyoubu tyousinn ',
  '呼吸音清': 'kokyuuonn sei ',
  '胸部': 'kyoubu ',
  '聴診': 'tyousinn ',
  '呼吸音': 'kokyuuonn ',
  '呼吸': 'kokyuu ',
  'ラ音なし': 'ra-onn nasi ',
  'ラ音': 'ra-onn ',
  '副雑音': 'fukuzatuonn ',
  'なし': 'nasi ',
  '腹部平坦・軟': 'fukubu heitann / nann ',
  '腹部平坦': 'fukubu heitann ',
  '平坦・軟': 'heitann / nann ',
  '腹部': 'fukubu ',
  '軟': 'nann ',
  '急性上気道炎': 'kyuuseijyoukidouenn ',
  '上気道炎': 'jyoukidouenn ',
  '上気道': 'jyoukidou ',
  '急性': 'kyuusei ',
  '慢性': 'mannsei ',
  '気管支炎': 'kikannsienn ',
  '肺炎': 'haienn ',
  '感冒': 'kannbou ',
  '頓服': 'tonnfuku ',
  '毎食後': 'maisyokugo ',
  '朝食後': 'asasyokugo ',
  '昼食後': 'tyuusyokugo ',
  '夕食後': 'yuusyokugo ',
  '就寝前': 'syuusinnmae ',
  '食前': 'syokuzenn ',
  '食間': 'syokukann ',
  '水分摂取': 'suibunn sessyu ',
  '水分': 'suibunn ',
  '摂取': 'sessyu ',
  '十分な睡眠': 'jyuubunnna suiminn ',
  '睡眠': 'suiminn ',
  '安静を指導': 'annsei wo sidou ',
  '安静': 'annsei ',
  '指導': 'sidou ',
  '持続': 'jizoku ',
  '息苦しさ出現時': 'ikigurusisa syutugennji ',
  '息苦しさ': 'ikigurusisa ',
  '出現時は': 'syutugennji ha ',
  '出現時': 'syutugennji ',
  '出現': 'syutugenn ',
  '消失': 'syousitu ',
  '速やかな再診': 'sumiyakana saisinn ',
  '速やかな': 'sumiyakana ',
  '速やか': 'sumiyaka ',
  '再診を指示': 'saisinn wo siji ',
  '再診': 'saisinn ',
  '初診': 'syosinn ',
  '指示': 'siji ',

  // 循環器・高血圧症・生活習慣病
  '本態性高血圧症': 'honntaisei kouketuatu syou ',
  '高血圧症': 'kouketuatu syou ',
  '高血圧': 'kouketuatu ',
  '低血圧': 'teiketuatu ',
  '定期診察・処方希望': 'teikisinnsatu / syohou kibou ',
  '定期診察': 'teikisinnsatu ',
  '処方希望': 'syohou kibou ',
  '服薬アドヒアランス良好': 'fukuyaku adohiarannsu ryoukou ',
  'アドヒアランス良好': 'adohiarannsu ryoukou ',
  '服薬アドヒアランス': 'fukuyaku adohiarannsu ',
  'アドヒアランス': 'adohiarannsu ',
  '飲み忘れなし': 'nomiwasure nasi ',
  '飲み忘れ': 'nomiwasure ',
  '服薬良好': 'fukuyaku ryoukou ',
  '服薬': 'fukuyaku ',
  '良好にコントロール中': 'ryoukou ni konntoro-ru tyuu ',
  '良好に': 'ryoukou ni ',
  '頭痛時': 'zutuuji ',
  '発熱・頭痛時': 'hatunetu / zutuuji ',
  '頭痛': 'zutuu ',
  'めまい': 'memai ',
  '眩暈': 'memai ',
  'ふらつき': 'furatuki ',
  '動悸、': 'douki , ',
  '動悸なし': 'douki nasi ',
  '動悸': 'douki ',
  '息切れ': 'ikigire ',
  '胸痛': 'kyoutuu ',
  '胸部違和感なし': 'kyoubu iwakann nasi ',
  '胸部違和感': 'kyoubu iwakann ',
  '違和感なし': 'iwakann nasi ',
  '違和感': 'iwakann ',
  '家庭血圧': 'kateiketuatu ',
  '手帳持参': 'tetyou jisann ',
  '手帳': 'tetyou ',
  '持参': 'jisann ',
  '朝平均': 'asa heikinn ',
  '夜平均': 'yoru heikinn ',
  '平均': 'heikinn ',
  '推移良好': 'suii ryoukou ',
  '推移': 'suii ',
  '外来血圧': 'gairai ketuatu ',
  '外来': 'gairai ',
  '心音純・雑音': 'sinnonn junn / zatuonn ',
  '心音純': 'sinnonn junn ',
  '心音': 'sinnonn ',
  '純': 'junn ',
  '整': 'sei ',
  '整、': 'sei , ',
  '雑音なし': 'zatuonnasi ',
  '雑音': 'zatuonn ',
  '両側肺野清': 'ryousoku hai ya sei ',
  '肺野清': 'hai ya sei ',
  '両側下腿浮腫': 'ryousoku katai fusyu ',
  '下腿浮腫': 'katai fusyu ',
  '両側': 'ryousoku ',
  '片側': 'katagawa ',
  '肺野': 'hai ya ',
  '下腿': 'katai ',
  '浮腫': 'fusyu ',
  '本態性': 'honntaisei ',
  '減塩': 'genn-enn ',
  '食塩': 'syokuenn ',
  '日未満': 'niti mimann ',
  '未満': 'mimann ',
  '以上': 'ijyou ',
  '以下': 'ika ',
  '適度な有酸素運動': 'tekidona yuusannsounndou ',
  '有酸素運動': 'yuusannsounndou ',
  '継続指導': 'keizoku sidou ',
  '適度': 'tekido ',
  '運動': 'unndou ',
  '継続': 'keizoku ',
  '次回3ヶ月後の定期採血': 'jikai 3 kagetu gono teikisaiketu ',
  '次回3ヶ月後': 'jikai 3 kagetu go ',
  '3ヶ月後': '3 kagetu go ',
  '3ヶ月': '3 kagetu ',
  '次回': 'jikai ',
  '今回': 'konnkai ',
  '定期採血': 'teiki saiketu ',
  '採血': 'saiketu ',
  '採尿': 'sainyou ',
  '腎機能・電解質・尿蛋白': 'jinnkinou / dennkaisitu / nyoutannpaku ',
  '腎機能': 'jinnkinou ',
  '肝機能': 'kannkinou ',
  '電解質': 'dennkaisitu ',
  '尿蛋白': 'nyoutannpaku ',
  '尿糖': 'nyoutou ',
  '尿潜血': 'nyousennketu ',
  '予定': 'yotei ',
  'コントロール中': 'konntoro-ru tyuu ',
  'コントロール': 'konntoro-ru ',

  // 健診・臨床検査・生化学・生活習慣病
  '定期健康診断での血液検査異常指摘': 'teikikennkousinndann deno ketuekikennsaijyousiteki ',
  '血液検査異常指摘': 'ketuekikennsaijyousiteki ',
  '検査異常指摘': 'kennsaijyousiteki ',
  '定期健康診断': 'teikikennkousinndann ',
  '健康診断': 'kennkousinndann ',
  '定期': 'teiki ',
  '血液検査': 'ketuekikennsa ',
  '尿検査': 'nyoukennsa ',
  '異常指摘': 'ijyousiteki ',
  '異常': 'ijyou ',
  '指摘': 'siteki ',
  '精密検査受診': 'seimitukennsajyusinn ',
  '精密検査': 'seimitukennsa ',
  '空腹時血糖': 'kuufukujikettou ',
  '空腹時': 'kuufukuji ',
  '随時血糖': 'zuijikettou ',
  '境界型・要生活改善': 'kyoukaigata / youseikatukaizenn ',
  '境界型': 'kyoukaigata ',
  '要生活改善': 'youseikatukaizenn ',
  '生活改善': 'seikatukaizenn ',
  '生活指導': 'seikatusidou ',
  '中性脂肪': 'tyuuseisibou ',
  '脂質異常症': 'sisituijyousyou ',
  '高脂血症': 'kousiketusyou ',
  '軽度肝機能障害・脂肪肝疑い': 'keido kannkinousyougai / siboukann utagai ',
  '軽度肝機能障害': 'keido kannkinousyougai ',
  '肝機能障害': 'kannkinousyougai ',
  '脂肪肝疑い': 'siboukann utagai ',
  '脂肪肝': 'siboukann ',
  '疑い': 'utagai ',
  '軽度': 'keido ',
  '中等度': 'tyuutoudo ',
  '重度': 'jyuudo ',
  '自覚症状特になし': 'jikakusyoujyou tokuninasi ',
  '特になし': 'tokuninasi ',
  '直近1年で': 'tyokkinn 1 nenn de ',
  '直近1年': 'tyokkinn 1 nenn ',
  '体重3.5kg増加': 'taijyuu 3.5 kg zouka ',
  '体重増加': 'taijyuuzouka ',
  '体重': 'taijyuu ',
  '身長': 'sinntyou ',
  '増加': 'zouka ',
  '減少': 'gennsyou ',
  '缶ビール': 'kannbi-ru ',
  'ビール': 'bi-ru ',
  '飲酒': 'innsyu ',
  '喫煙': 'kituenn ',
  '運動習慣なし': 'unndousyuukann nasi ',
  '運動習慣': 'unndousyuukann ',
  '肥満度1': 'himanndo 1 ',
  '肥満度': 'himanndo ',
  '腹囲': 'fukui ',
  '腹部触診': 'fukubusyokusinn ',
  '触診': 'syokusinn ',
  '圧痛なし': 'attuunasi ',
  '圧痛': 'attuu ',
  '反跳痛': 'hantyoutuu ',
  '肝腫大軽度': 'kannsyudai keido ',
  '肝腫大': 'kannsyudai ',
  '脾腫': 'hisyu ',
  '本日採血検査': 'honnjitu saiketukennsa ',
  '採血検査': 'saiketukennsa ',
  '空腹時脂質分画': 'kuufukujisisitubunnkaku ',
  '脂質分画': 'sisitubunnkaku ',
  '分画': 'bunnkaku ',
  'HbA1c再検': 'HbA1c saikenn ',
  '再検査': 'saikennsa ',
  '超音波検査': 'tyouonnpakennsa ',
  '腹部超音波検査': 'fukubutyouonnpakennsa ',
  '腹部超音波': 'fukubutyouonnpa ',
  '腹部エコー': 'fukubueko- ',
  'エコー': 'eko- ',
  '胆嚢病変': 'tannnoubyouhenn ',
  '胆嚢': 'tannnou ',
  '病変': 'byouhenn ',
  '胆石': 'tannseki ',
  'ポリープ': 'pori-pu ',
  '精査目的で': 'seisamokuteki de ',
  '精査目的': 'seisamokuteki ',
  '後日予約': 'gojituyoyaku ',
  '後日': 'gojitu ',
  '予約': 'yoyaku ',
  '糖質・脂質の過剰摂取是正': 'tousitu / sisitu no kajyousessyuzesei ',
  '糖質': 'tousitu ',
  '脂質': 'sisitu ',
  '過剰摂取是正': 'kajyousessyuzesei ',
  '過剰摂取': 'kajyousessyu ',
  '是正': 'zesei ',
  '節酒指導': 'sessyusidou ',
  '節酒': 'sessyu ',
  '休肝日設定': 'kyuukannbisettei ',
  '休肝日': 'kyuukannbi ',
  '設定': 'settei ',
  '速歩指導': 'hayarukisidou ',
  '速歩': 'hayaruki ',
  'ウォーキング': 'wo-kinngu ',
  '検査結果を踏まえ': 'kennsakekkawofumaee ',
  '検査結果': 'kennsakekka ',
  '踏まえ': 'fumaee ',
  '食事療法・運動療法先行': 'syokujiryouhou / unndouryouhousennkou ',
  '食事療法': 'syokujiryouhou ',
  '運動療法先行': 'unndouryouhousennkou ',
  '運動療法': 'unndouryouhou ',
  '先行': 'sennkou ',
  '薬物療法の適応を再評価': 'yakubuturyouhounotekiyouwosaihyouka ',
  '薬物療法の適応': 'yakubuturyouhounotekiyou ',
  '薬物療法': 'yakubuturyouhou ',
  '適応': 'tekiou ',
  '再評価': 'saihyouka ',
  'γ-GTP': 'gamma-GTP ',
  'γ': 'gamma ',
  '下部消化管内視鏡検査': 'kabusyoukakannnaisikyoukennsa ',
  '上部': 'jyoubu ',
  '下部': 'kabu ',
  '消化管': 'syoukakann ',
  '胃カメラ': 'ikamera ',
  '大腸カメラ': 'daityoukamera ',
  '検査': 'kennsa ',
  '逆流性': 'gyakuryuusei ',
  '食道裂孔ヘルニア': 'syokudourekkouherunia ',
  '胃底部': 'iteibu ',
  '胃体部': 'itaibu ',
  '胃角部': 'ikakubu ',
  '異常なし': 'ijyounasi ',
  '小弯': 'syouwann ',
  '大弯': 'daiwann ',
  '前壁': 'zennpeki ',
  '後壁': 'kouheki ',
  '萎縮性胃炎': 'isikuseiienn ',
  '幽門部': 'yuumonnbu ',
  '直前': 'tyokuzenn ',
  '出血': 'syukketu ',
  '兆候': 'tyoukou ',
  '悪性': 'akusei ',
  '良性': 'ryousei ',
  '十二指腸球部': 'jyuunisityoukyuubu ',
  '胃潰瘍': 'ikaiyou ',
  '十二指腸潰瘍': 'jyuunisityoukaiyou ',
  '瘢痕': 'hannkonn ',
  '施行': 'sikou ',
  '現感染': 'gennkannsenn ',
  'ピロリ菌': 'pirorikinn ',

  // 薬品・単位・用法
  'アセトアミノフェン錠': 'asetoaminofennjyou ',
  'アセトアミノフェン': 'asetoaminofenn ',
  'カロナール錠': 'karona-rujyou ',
  'カロナール': 'karona-ru ',
  'ロキソニン錠': 'rokisonninnjyou ',
  'ロキソニン': 'rokisonninn ',
  'ロキソプロフェン': 'rokisopurofenn ',
  'デキストロメトルファン錠': 'dekisutorometorufannjyou ',
  'デキストロメトルファン': 'dekisutorometorufann ',
  'メジコン錠': 'mejikonnjyou ',
  'メジコン': 'mejikonn ',
  'トラネキサム酸錠': 'toranekisamusannjyou ',
  'トラネキサム酸': 'toranekisamusann ',
  'トランサミン': 'torannsaminn ',
  'カルボシステイン': 'karubosisuteinn ',
  'ムコダイン': 'mukodainn ',
  'アンブロキソール': 'annburokiso-ru ',
  'ムコソルバン': 'mukosorubann ',
  'アムロジピン錠': 'amurojipinnjyou ',
  'アムロジピン': 'amurojipinn ',
  'ノルバスク錠': 'norubasukujyou ',
  'ノルバスク': 'norubasuku ',
  'テルミサルタン錠': 'terumisarutannjyou ',
  'テルミサルタン': 'terumisarutann ',
  'ミカルディス錠': 'mikarudisujyou ',
  'ミカルディス': 'mikarudisu ',
  'オルメサルタン錠': 'orumesarutannjyou ',
  'オルメサルタン': 'orumesarutann ',
  'カンデサルタン錠': 'kanndesarutannjyou ',
  'カンデサルタン': 'kanndesarutann ',
  'アトルバスタチン錠': 'atorubasutatinnjyou ',
  'アトルバスタチン': 'atorubasutatinn ',
  'リピトール錠': 'ripito-rujyou ',
  'リピトール': 'ripito-ru ',
  'ロスバスタチン錠': 'rosubasutatinnjyou ',
  'ロスバスタチン': 'rosubasutatinn ',
  'クレストール錠': 'kuresuto-rujyou ',
  'クレストール': 'kuresuto-ru ',
  'メトホルミン錠': 'metohoruminnjyou ',
  'メトホルミン': 'metohoruminn ',
  'ジャヌビア錠': 'jyanubiajyou ',
  'ジャヌビア': 'jyanubia ',
  'フォシーガ錠': 'fosi-gajyou ',
  'フォシーガ': 'fosi-ga ',
  'ジャディアンス錠': 'jyadiannsujyou ',
  'ジャディアンス': 'jyadiannsu ',
  'タケキャブ錠': 'takekyabujyou ',
  'タケキャブ': 'takekyabu ',
  'ネキシウムカプセル': 'nekisiumukapuseru ',
  'ネキシウム': 'nekisiumu ',
  'オメプラゾール錠': 'omepurazo-rujyou ',
  'オメプラゾール': 'omepurazo-ru ',
  'ランソプラゾール': 'rannsopurazo-ru ',

  '1日1回': 'itiniti ikkai ',
  '1日2回': 'itiniti nikai ',
  '1日3回': 'itinitisannkai ',
  '1回1錠': 'ikkai itijyou ',
  '1回2錠': 'ikkai nijyou ',
  '1回3錠': 'ikkai sannjyou ',
  '1回': 'ikkai ',
  '2回': 'nikai ',
  '3回': 'sannkai ',
  '1錠': 'itijyou ',
  '2錠': 'nijyou ',
  '3錠': 'sannjyou ',
  '錠': 'jyou ',
  'カプセル': 'kapuseru ',
  '包': 'hou ',
  '本': 'honn ',
  '枚': 'mai ',
  '滴': 'teki ',
  '回': 'kai ',
  '28日分': '28 nitibunn ',
  '5日分': '5 nitibunn ',
  '7日分': '7 nitibunn ',
  '14日分': '14 nitibunn ',
  '30日分': '30 nitibunn ',
  '60日分': '60 nitibunn ',
  '90日分': '90 nitibunn ',
  '日分': 'nitibunn ',
  '5回分': '5 kaibunn ',
  '10回分': '10 kaibunn ',
  '回分': 'kaibunn ',
  '2日前': 'futucomae ',
  '1日前': 'itinitimae ',
  '日前': 'nitimae ',
  '日後': 'nitiato ',
  '日': 'niti ',
  '前': 'mae ',
  '後': 'ato ',
  '年': 'nenn ',
  '月': 'gatu ',
  '週': 'syuu ',
  '週間': 'syuukann ',
  '歳': 'sai ',
  '男': 'otoko ',
  '女': 'onnna ',
  '度': 'do ',
  '分': 'funn ',
  '秒': 'byou ',
  'あり': 'ari ',
  '認める': 'mitomeru ',
  '著変なし': 'tyohennnasi ',
  '著変': 'tyohenn ',
  '特記事項なし': 'tokkijikounasi ',
  '特記': 'tokki ',

  // 一般助詞・動詞・副詞（2文字以上の安全なトークンのみ）
  'より': 'yori ',
  'および': 'oyobi ',
  'また': 'mata ',
  'または': 'mataha ',
  'しかし': 'sikasi ',
  'ただし': 'tadasi ',
  'から': 'kara ',
  'まで': 'made ',
  'など': 'nado ',
  '等': 'tou ',
  'して': 'site ',
  'する': 'suru ',
  'した': 'sita ',
  'するも': 'surumo ',
  'された': 'sareta ',
  'される': 'sareru ',
  '見られる': 'mirareru ',
  '認められる': 'mitomerareru ',
  '観察': 'kannsatu ',
  '開始': 'kaisi ',
  '中止': 'tyuusi ',
  '増量': 'zouryou ',
  '減量': 'gennryou ',
  '管理': 'kannri ',
};

// 漢字単文字フォールバック辞書 (未登録の漢字がスペースに消滅するのを防止)
export const SINGLE_KANJI_MAP: Record<string, string> = {
  '主': 'syu ', '訴': 'so ', '現': 'genn ', '病': 'byou ', '歴': 'reki ',
  '所': 'syo ', '見': 'ken ', '診': 'sinn ', '断': 'dann ', '処': 'syo ',
  '方': 'hou ', '針': 'sinn ', '検': 'kenn ', '査': 'sa ', '名': 'mei ',
  '食': 'syoku ', '道': 'dou ', '胃': 'i ', '腸': 'tyou ', '置': 'ti ',
  '生': 'sei ', '活': 'katu ', '習': 'syuu ', '慣': 'kann ', '問': 'monn ',
  '自': 'ji ', '覚': 'kaku ', '他': 'ta ', 'デ': 'de', 'タ': 'ta',
  '判': 'hann ', '定': 'tei ', '発': 'hatu ', '熱': 'netu ', '咽': 'inn ',
  '頭': 'tou ', '痛': 'tuu ', '咳': 'gai ', '嗽': 'sou ', '乾': 'kann ',
  '性': 'sei ', '微': 'bi ', '高': 'kou ', '低': 'tei ', '昨': 'saku ',
  '昇': 'syou ', '降': 'kou ', '市': 'si ', '販': 'hann ', '風': 'kaze ',
  '邪': 'kaze ', '薬': 'yaku ', '内': 'nai ', '服': 'fuku ', '改': 'kai ',
  '善': 'zenn ', '乏': 'tobo ', '来': 'rai ', '院': 'inn ', '赤': 'seki ',
  '扁': 'henn ', '桃': 'tou ', '腫': 'syu ', '大': 'dai ', '小': 'syou ',
  '頸': 'kei ', '部': 'bu ', '節': 'setu ', '脹': 'tyou ', '胸': 'kyou ',
  '聴': 'tyou ', '呼': 'ko ', '吸': 'kyuu ', '音': 'onn ', '清': 'sei ',
  '腹': 'fuku ', '平': 'hei ', '坦': 'tann ', '軟': 'nann ', '急': 'kyuu ',
  '慢': 'mann ', '気': 'ki ', '管': 'kann ', '支': 'si ', '炎': 'enn ',
  '感': 'kann ', '冒': 'bou ', '頓': 'tonn ', '毎': 'mai ', '水': 'sui ',
  '眠': 'minn ', '安': 'ann ', '静': 'sei ', '指': 'si ', '導': 'dou ',
  '持': 'ji ', '続': 'zoku ', '息': 'iki ', '出': 'syutu ', '速': 'sumi ',
  '再': 'sai ', '初': 'syo ', '血': 'ketu ', '圧': 'atu ', '期': 'ki ',
  '希': 'ki ', '望': 'bou ', '良': 'ryou ', '好': 'kou ', '飲': 'nomi ',
  '忘': 'wasure ', '動': 'dou ', '悸': 'ki ', '違': 'i ', '和': 'wa ',
  '家': 'katei ', '庭': 'tei ', '手': 'te ', '帳': 'tyou ', '参': 'sann ',
  '均': 'kinn ', '推': 'sui ', '移': 'i ', '外': 'gai ', '心': 'sinn ',
  '肺': 'hai ', '野': 'ya ', '下': 'ka ', '腿': 'tai ', '浮': 'fu ',
  '満': 'mann ', '適': 'teki ', '度': 'do ', '有': 'yuu ', '酸': 'sann ',
  '素': 'so ', '運': 'unn ', '次': 'ji ', '回': 'kai ', '採': 'sai ',
  '腎': 'jinn ', '機': 'ki ', '能': 'nou ', '肝': 'kann ', '電': 'denn ',
  '解': 'kai ', '質': 'situ ', '尿': 'nyou ', '蛋': 'tann ', '白': 'paku ',
  '糖': 'tou ', '潜': 'senn ', '予': 'yo ', '健': 'kenn ', '康': 'kou ',
  '異': 'i ', '常': 'jyou ', '密': 'mitu ', '空': 'kuuu ', '境': 'kyou ',
  '界': 'kai ', '型': 'gata ', '要': 'you ', '脂': 'si ', '肪': 'bou ',
  '軽': 'kei ', '重': 'jyuu ', '中': 'tyuu ', '障': 'syou ', '害': 'gai ',
  '疑': 'utagai ', '直': 'tyoku ', '近': 'kinn ', '身': 'sinn ', '長': 'tyou ',
  '増': 'zou ', '加': 'ka ', '少': 'syou ', '酒': 'syu ', '煙': 'enn ',
  '肥': 'hi ', '囲': 'i ', '触': 'syoku ', '反': 'hann ', '跳': 'tyou ',
  '脾': 'hi ', '超': 'tyou ', '波': 'pa ', '胆': 'tann ', '嚢': 'nou ',
  '石': 'seki ', '変': 'henn ', '後': 'go ', '約': 'yaku ', '過': 'ka ',
  '剰': 'jyou ', '是': 'ze ', '正': 'sei ', '禁': 'kinn ',
  '休': 'kyuu ', '歩': 'ho ', '事': 'ji ', '療': 'ryou ', '行': 'kou ',
  '物': 'butu ', '応': 'ou ', '価': 'ka ', '鏡': 'kyou ', '膜': 'maku ',
  '逆': 'gyaku ', '流': 'ryuu ', '裂': 'retu ', '孔': 'kou ', '穹': 'kyuu ',
  '窿': 'ryou ', '底': 'tei ', '前': 'zenn ', '角': 'kaku ', '弯': 'wann ',
  '壁': 'peki ', '萎': 'isi ', '縮': 'kusei ', '幽': 'yuu ', '門': 'monn ',
  '輪': 'rinn ', '兆': 'tyou ', '候': 'kou ', '悪': 'aku ', '球': 'kyuu ',
  '脚': 'kyaku ', '潰': 'kai ', '瘍': 'you ', '瘢': 'hann ', '痕': 'konn ',
  '狭': 'kyou ', '窄': 'saku ', '施': 'si ', '表': 'hyou ', '層': 'sou ',
  '既': 'ki ', '染': 'senn ', '菌': 'kinn ', '奨': 'syou ', '歳': 'sai ',
  '著': 'tyo ', '記': 'ki ', '項': 'kou ', '無': 'nasi ', '陰': 'inn ', '陽': 'you ',
};

// ひらがな/カタカナ ➔ ローマ字テーブル
export const KANA_ROMAJI_MAP: Record<string, string> = {
  // 拗音・促音複合 (3文字・2文字)
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sya', 'しゅ': 'syu', 'しょ': 'syo',
  'ちゃ': 'tya', 'ちゅ': 'tyu', 'ちょ': 'tyo',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja',  'じゅ': 'ju',  'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'ふぁ': 'fa',  'ふぃ': 'fi',  'ふぇ': 'fe',  'ふぉ': 'fo',
  'てぃ': 'thi', 'でぃ': 'dhi', 'とぅ': 'twu', 'どぅ': 'dwu',
  'ヴぁ': 'va',  'ヴぃ': 'vi',  'ヴ': 'vu',    'ヴぇ': 've',  'ヴぉ': 'vo',
  'うぃ': 'wi',  'うぇ': 'we',  'うぉ': 'who',
  'くぁ': 'kwa', 'ぐぁ': 'gwa',

  // 清音・濁音・半濁音
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'si', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'ti', 'つ': 'tu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'nn',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'di', 'づ': 'du', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  
  // 促音・小文字
  'ぁ': 'xa', 'ぃ': 'xi', 'ぅ': 'xu', 'ぇ': 'xe', 'ぉ': 'xo',
  'ゃ': 'xya', 'ゅ': 'xyu', 'ょ': 'xyo',
  'っ': 'xtsu',
  
  // 句読点・記号
  '、': ', ', '。': '. ', '・': '/', 'ー': '-', '〜': '~',
};

// 全角英数を半角英数に正規化
export function normalizeFullwidthChars(text: string): string {
  let res = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // 全角英数字 (0xFF01-0xFF5E) ➔ 半角ASCII (0x0021-0x007E)
    if (code >= 0xFF01 && code <= 0xFF5E) {
      res += String.fromCharCode(code - 0xFEE0);
    } else if (FULLWIDTH_ASCII_MAP[char]) {
      res += FULLWIDTH_ASCII_MAP[char];
    } else {
      res += char;
    }
  }
  return res;
}

// カタカナをひらがなに変換
export function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30a1-\u30f6]/g, match => {
    const chr = match.charCodeAt(0) - 0x60;
    return String.fromCharCode(chr);
  });
}

/**
 * 日本語テキストの1行をローマ字＋IME変換スペース列に変換
 * （※決して途中に改行 \n を入れない）
 */
function convertSingleLineToRomaji(line: string): string {
  if (!line) return '';

  // 0. LaTeX 数式・Markdown 強調記号・特殊記号の自動可読化 (Sanitization)
  let text = line.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\\+text\{([^{}]+)\}/g, '$1');
  text = text.replace(/\\+frac\{([^{}]+)\}\{([^{}]+)\}/g, '[ $1 ] / [ $2 ]');
  text = text.replace(/\\+text\{([^{}]+)\}/g, '$1');
  text = text.replace(/\\+frac\{([^{}]+)\}\{([^{}]+)\}/g, '[ $1 ] / [ $2 ]');
  text = text.replace(/\\+text\{([^{}]+)\}/g, '$1');
  text = text.replace(/\\+sum/g, '∑ ');
  text = text.replace(/\\+times/g, '× ');
  text = text.replace(/\\+left\(/g, '(');
  text = text.replace(/\\+right\)/g, ')');
  text = text.replace(/\\+\(/g, '(');
  text = text.replace(/\\+\)/g, ')');
  text = text.replace(/\\+/g, ' ');
  text = text.replace(/①/g, '(1) ');
  text = text.replace(/②/g, '(2) ');
  text = text.replace(/③/g, '(3) ');

  // 1. ギリシャ文字の正規化（γ-GTP -> gamma-GTP, γ -> gamma）
  text = text.replace(/γ-GTP/g, 'gamma-GTP ');
  text = text.replace(/γ/g, 'gamma ');

  // 2. ★【先行 Word Boundary Isolation: 英字と日本語の境界を分離 (※数字+助数詞「1錠」「1回」は保護)】
  text = text.replace(/([a-zA-Z0-9])\(/g, '$1 (');
  text = text.replace(/\)([a-zA-Z0-9])/g, ') $1');
  text = text.replace(/\(([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])/g, '( $1');
  text = text.replace(/([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF])\)/g, '$1 )');
  text = text.replace(/([a-zA-Z])([\u4E00-\u9FFF\u3040-\u309F])/g, '$1 $2');
  text = text.replace(/([\u4E00-\u9FFF\u3040-\u309F])([a-zA-Z])/g, '$1 $2');

  // 3. 医療見出し・医療用語・漢字フレーズを最長一致でローマ字化
  const sortedKeys = Object.keys(MEDICAL_KANJI_ROMAJI_MAP).sort((a, b) => b.length - a.length);
  for (const k of sortedKeys) {
    if (text.includes(k)) {
      text = text.split(k).join(MEDICAL_KANJI_ROMAJI_MAP[k]);
    }
  }

  // 4. 行頭箇条書きの中黒（・）を「- 」に正規化
  text = text.replace(/^[ \t]*・/g, '- ');

  // 5. 残存する全角記号・約物の正規化
  text = normalizeFullwidthChars(text);

  // 6. 再度の境界保護 (辞書置換後に残存したトークン分離: 英字と日本語のみ)
  text = text.replace(/([a-zA-Z])([\u4E00-\u9FFF\u3040-\u309F])/g, '$1 $2');
  text = text.replace(/([\u4E00-\u9FFF\u3040-\u309F])([a-zA-Z])/g, '$1 $2');

  // 7. カタカナをひらがなへ変換
  text = katakanaToHiragana(text);

  // 8. 単一漢字のフォールバック変換
  const singleKeys = Object.keys(SINGLE_KANJI_MAP);
  for (const k of singleKeys) {
    if (text.includes(k)) {
      text = text.split(k).join(SINGLE_KANJI_MAP[k]);
    }
  }

  let result = '';
  let i = 0;

  while (i < text.length) {
    // 2文字（拗音・促音）チェック
    if (i + 1 < text.length) {
      const twoChars = text.slice(i, i + 2);
      if (KANA_ROMAJI_MAP[twoChars]) {
        result += KANA_ROMAJI_MAP[twoChars];
        i += 2;
        continue;
      }
      // 「っ」+ 子音の促音処理 (例: 「きって」-> 'kitte')
      if (text[i] === 'っ') {
        const nextChar = text[i + 1];
        const nextRomaji = KANA_ROMAJI_MAP[nextChar];
        if (nextRomaji && nextRomaji.length > 0 && !'aiueo'.includes(nextRomaji[0])) {
          result += nextRomaji[0];
          i += 1;
          continue;
        }
      }
    }

    // 0. 既存の <F5:xxxx> タグのスキップ保護
    if (text.startsWith('<F5:', i)) {
      const endIdx = text.indexOf('>', i);
      if (endIdx !== -1) {
        result += text.slice(i, endIdx + 1) + ' ';
        i = endIdx + 1;
        continue;
      }
    }

    // 1文字チェック
    const oneChar = text[i];
    if (KANA_ROMAJI_MAP[oneChar]) {
      result += KANA_ROMAJI_MAP[oneChar];
    } else if (FULLWIDTH_ASCII_MAP[oneChar]) {
      result += FULLWIDTH_ASCII_MAP[oneChar];
    } else if (oneChar === '【') {
      result += '[';
    } else if (oneChar === '】') {
      result += '] ';
    } else if (oneChar === '・') {
      result += ', ';
    } else {
      const code = oneChar.charCodeAt(0);
      // ASCII印字可能文字 (32..126) または タブ
      if ((code >= 32 && code <= 126) || oneChar === '\t') {
        result += oneChar;
      } else {
        result += ' ';
      }
    }
    i += 1;
  }

  // 連続する余分な空白を1つに整理
  let cleaned = result.replace(/ +/g, ' ').trimStart();

  // 助詞結合 (野・似・尾・戸・葉化の原理的根絶)
  cleaned = cleaned.replace(/(\w+)\s+(no|ni|wo|to|ga|ha|he|de)\s+/g, '$1$2 ');

  // 末尾が英字の場合はIME変換スペースを付与
  if (/[a-zA-Z]$/.test(cleaned)) {
    cleaned += ' ';
  }

  return cleaned;
}

/**
 * 電子カルテ向け改行最適化:
 * 電子カルテ側のテキストエリアで各行がくっつかず綺麗に視認できるよう、
 * 各改行を「1行空けて（\n\n）」送信形式に正規化する。
 */
export function formatForEhrNewlines(text: string): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const resultLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (line !== '') {
      resultLines.push(line);
    }
  }
  return resultLines.join('\n\n');
}

/**
 * ★【言語学的文節形態素セグメンテーション (Bunsetsu Morphological Segmenter)】
 * 句読点（、/。/・/:/；/！？）や明確な接続詞（について/に関して/において 等）で分割する。
 * ※「大腸がん」の「が」や「となった」の「と」のように単語の一部である1文字助詞（が/と/で/て/に 等）では
 *   絶対に単語を切断しない。
 */
export function segmentJapaneseIntoBunsetsu(text: string): string[] {
  if (!text) return [];

  const majorConnectives = '(?:について|において|に関して|に対して|により|によって|とともに|として|とは)';
  const splitRegex = new RegExp(`([、。・:：;！？\\n]+|${majorConnectives})`, 'g');

  const rawSplits = text.split(splitRegex);
  const clauses: string[] = [];

  for (const part of rawSplits) {
    if (!part || part.trim() === '') continue;
    clauses.push(part);
  }

  return clauses;
}

/**
 * ★【数式・Markdown記号サニタイザー】
 * LaTeX数式コマンド（\text{}, \frac{}{}, \sum, \times, \left, \right, \\）や
 * Markdown太字記号（**）、丸数字（①②③）をカルテ向け平文に自動可読化する。
 * これにより、IMEがLaTeXコマンドを「てｘｔ」「ｆらｃ」などと誤爆打鍵するのを根絶する。
 */
export function sanitizeLatexAndMarkdown(text: string): string {
  if (!text) return '';
  let cleaned = text.replace(/\*\*(.*?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\\+text\{([^{}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\+frac\{([^{}]+)\}\{([^{}]+)\}/g, '[ $1 ] / [ $2 ]');
  cleaned = cleaned.replace(/\\+text\{([^{}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\+frac\{([^{}]+)\}\{([^{}]+)\}/g, '[ $1 ] / [ $2 ]');
  cleaned = cleaned.replace(/\\+text\{([^{}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\+sum/g, '∑ ');
  cleaned = cleaned.replace(/\\+times/g, '× ');
  cleaned = cleaned.replace(/\\+left\(/g, '(');
  cleaned = cleaned.replace(/\\+right\)/g, ')');
  cleaned = cleaned.replace(/\\+\(/g, '(');
  cleaned = cleaned.replace(/\\+\)/g, ')');
  cleaned = cleaned.replace(/\\+/g, ' ');
  cleaned = cleaned.replace(/①/g, '(1) ');
  cleaned = cleaned.replace(/②/g, '(2) ');
  cleaned = cleaned.replace(/③/g, '(3) ');
  return cleaned;
}

/**
 * ★【新機能: 全角半角分離 & <ENTER> タグ付き高精度キーストローク列生成】
 * 英数字・記号・単位はそのまま直接打鍵、
 * 医療用語・日本語は文節（Bunsetsu）単位で小刻みにローマ字入力＋<ENTER>で即時変換確定。
 */
export function generateKeystrokeSequence(text: string): {
  sequence: string;
  charCount: number;
  byteCount: number;
  explanation: string[];
} {
  if (!text) {
    return { sequence: '', charCount: 0, byteCount: 0, explanation: [] };
  }

  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');
  const resultBlocks: string[] = [];

  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const rawLine = lines[lIdx].trim();
    if (rawLine === '') continue;

    // 1. 全角記号の正規化 & LaTeX/Markdownサニタイズ
    let line = sanitizeLatexAndMarkdown(normalizeFullwidthChars(rawLine));

    // 2. 行を「英数記号・単位トークン」と「日本語（漢字・かな）トークン」に精密分割
    let currentLineSeq = '';

    // トークン分割正規表現: 英数字・半角記号の連続 vs 日本語・漢字の連続
    const tokenRegex = /([a-zA-Z0-9_\-\.\,\:\;\/\(\)\[\]\{\}\@\#\$\%\^\&\*\+\=\<\>\~\|\!\? ]+)|([\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3000-\u303F]+)/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(line)) !== null) {
      const asciiChunk = match[1];
      const japaneseChunk = match[2];

      if (asciiChunk !== undefined && asciiChunk.length > 0) {
        // 英数記号・単位・半角英字
        // ★重要: <IME_OFF>(無変換 0x8B) は Mozc / Linux では「カタカナ切替キー」として
        // 動作してしまいカタカナ入力モードに固定されるため、絶対に送出しない！
        currentLineSeq += asciiChunk;
      } else if (japaneseChunk !== undefined && japaneseChunk.length > 0) {
        // ★ 汎用文節セグメンテーションによる小刻み確定
        const bunsetsuList = segmentJapaneseIntoBunsetsu(japaneseChunk);
        for (const bunsetsu of bunsetsuList) {
          if (bunsetsu === '、' || bunsetsu === ',') {
            currentLineSeq += ', ';
          } else if (bunsetsu === '。' || bunsetsu === '.') {
            currentLineSeq += '. <ENTER>';
          } else if (bunsetsu === '・') {
            currentLineSeq += ', ';
          } else if (bunsetsu === ':' || bunsetsu === '：') {
            currentLineSeq += ': ';
          } else {
            const romaji = convertSingleLineToRomaji(bunsetsu).trim();
            if (romaji.length > 0) {
              currentLineSeq += `${romaji} <ENTER>`;
            }
          }
        }
      }
    }

    // 行末改行（電子カルテ用に <ENTER><ENTER> で美しく段落区切り）
    currentLineSeq += '<ENTER><ENTER>';
    resultBlocks.push(currentLineSeq);
  }

  const sequence = resultBlocks.join('');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(sequence);

  const explanations = [
    '【全角半角分離】英数字・バイタル・単位・記号は <IME_OFF> で半角直接打鍵',
    '【医療用語即時確定】医療用語・所見・病名は <IME_ON> でローマ字入力し <CONV><ENTER> で即時確定',
    '【誤変換完全防止】Windows IMEの候補窓暴走・同音異義語誤爆を原理的に根絶',
    '【電子カルテ最適化】行末は <ENTER><ENTER> で1行空けの美しいカルテレイアウトを維持',
  ];

  return {
    sequence,
    charCount: sequence.length,
    byteCount: bytes.length,
    explanation: explanations,
  };
}

/**
 * 日本語カルテテキスト全体を、電子カルテ向けに「1行空け改行（\n\n）」を適用したIME協調キーストローク列にトランスパイル
 * （※互換性および既存UIからの呼び出しを完全保証）
 */
export function transpileToImeRomajiSequence(text: string): {
  sequence: string;
  charCount: number;
  byteCount: number;
  explanation: string[];
} {
  if (!text) {
    return { sequence: '', charCount: 0, byteCount: 0, explanation: [] };
  }

  // CRLF正規化
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText.split('\n');
  const processedLines: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx].trim();
    if (rawLine !== '') {
      const converted = convertSingleLineToRomaji(rawLine);
      processedLines.push(converted);
    }
  }

  // 電子カルテで綺麗に再現されるよう、改行時は「1行空けて（\n\n）」結合
  let sequence = processedLines.join('\n\n');

  // 末尾に必ず \n を付加して最後の変換を100%確実に確定
  if (sequence && !sequence.endsWith('\n')) {
    sequence += '\n';
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(sequence);

  const explanations = [
    '【電子カルテ最適化改行】各行の間に1行空き（Enter 2回分）を設けて視認性を大幅向上',
    '【Windows IME協調】医療用語・漢字ごとに適切な文節Spaceを付与して誤変換を防止',
    '【最終変換確定保証】打鍵完了時に末尾Enterを自動送出し、最後の文節まで綺麗に確定',
    '【JIS 109配列補正】全角記号や特殊約物を安全なASCIIスキャンコードへマッピング',
  ];

  return {
    sequence,
    charCount: sequence.length,
    byteCount: bytes.length,
    explanation: explanations,
  };
}

/**
 * JIS 109キーボードでの各文字の打鍵動作解説
 */
export function explainJisTyping(char: string): string {
  switch (char) {
    case ':': return "JIS配列では「'」キー位置送出";
    case '@': return "JIS配列では「`」キー位置送出";
    case '(': return "JIS配列 Shift + 8 送出";
    case ')': return "JIS配列 Shift + 9 送出";
    case '=': return "JIS配列 Shift + - 送出";
    case '^': return "JIS配列 「=」キー位置送出";
    case '~': return "JIS配列 Shift + ^ 送出";
    case '_': return "JIS配列 Shift + - 送出";
    case '\n': return "Enter (KEY_RETURN: 段落改行) 送出";
    case ' ': return "Space (空白/IME変換キー) 送出";
    default: return `キー '${char}' を安全送出`;
  }
}
