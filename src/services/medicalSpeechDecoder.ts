/**
 * =============================================================================
 * DrVoice どんぐり君！ (Dr.Dongly)
 * 医療音声認識 専門用語・略語・医薬品・バイタル自動解読エンジン (Medical Speech Decoder)
 * =============================================================================
 * 
 * ブラウザ標準の Web Speech API (Google/Apple汎用音声認識) が出力する
 * 一般用語・同音異義語・カタカナ読み・口頭発音を、臨床現場で真に使われる
 * 正確な医学用語・英語略語・薬品名・バイタル表記へミリ秒単位でリアルタイム解読・変換する。
 */

export interface DecodedCorrection {
  original: string;
  corrected: string;
  category: 'vital' | 'abbreviation' | 'drug' | 'finding' | 'homophone' | 'dosage' | 'section';
}

export interface SpeechToken {
  text: string;
  isDecoded: boolean;
  category?: 'vital' | 'abbreviation' | 'drug' | 'finding' | 'homophone' | 'dosage' | 'section';
  original?: string;
}

export interface MedicalSpeechDecodeResult {
  rawText: string;
  decodedText: string;
  corrections: DecodedCorrection[];
  detectedCategories: string[];
}

/**
 * 医師向け音声入力 リアルタイム解読例文クイックチップス
 */
/**
 * 医師向け音声入力 リアルタイム解読例文クイックチップス
 */
export const SPEECH_SAMPLE_CHIPS = [
  { label: '🫀 BP 140/90', speech: 'ビーピー 140の90' },
  { label: '🫀 HR 112 (不整)', speech: '脈拍 112 ふせい' },
  { label: '🫀 SpO2 97% (room)', speech: 'サチュレーション 97 パーセント ルーム' },
  { label: '🔬 心房細動 (Af)', speech: 'しんぼうさいどう エーエフ' },
  { label: '🔬 HbA1c 7.8%', speech: 'ヘモグロビンエーワンシー 7.8 パーセント' },
  { label: '🔬 CRP 4.2', speech: 'シーアールピー 4.2' },
  { label: '💊 ニトロペン', speech: 'ニトロペン 頓用' },
  { label: '💊 アムロジピン処方', speech: 'アムロジピン 1てぃー 1くす 朝食後 14にちぶん' },
  { label: '✨ 体動時・放散痛', speech: '誕生日に胸部圧迫感、左肩へのオーソン 2あり' },
  { label: '📑 【主訴】見出し', speech: '主訴 労作時の息切れ' },
];

/**
 * 1. ORCA / DMiME 医療辞書 ＆ 臨床特化語彙に基づく
 *    音声認識特有の音響同音異義語・誤字脱字解読辞書 (Homophone & Acoustic Recognition Map)
 */
const HOMOPHONE_RULES: { pattern: RegExp; replacement: string; desc: string }[] = [
  // 循環器・急性症候 (★ ORCA/DMiME 臨床重要語彙 & 音響エイリアス完全網羅)
  {
    // 「たいどうじ」の音響誤爆: 誕生日、大道寺、大導寺、タイ料理、たいどうとき、隊動時など
    pattern: /(?:誕生[日び]|大[道導堂東]寺|タイ料理|大どうじ|たいどうじ|たいどうとき|泰童子|態童子|隊動[寺時]|タイ童子)/g,
    replacement: '体動時',
    desc: '体動時',
  },
  {
    // 「ほうさんつう」の音響誤爆: ホウ三2、オーソン 2、放射痛、鳳山通、ほうさん痛、オーソン2、オオソンツーなど
    pattern: /(?:(?:ホウ|ほう|宝|鳳)[三3サンさん]?\s*[2２にツー][ー〜]?|(?:オーソン|おーそん|オオソン)\s*(?:[2２にツー][ー〜]?|[2２にツー])?|放射痛|ほうさんつう|ほうさん通|鳳山通|宝山痛|崩壊痛|ほうさん痛|ホウサン\s*[2２にツー][ー〜]?|ホーサン\s*[2２にツー][ー〜]?|ほうさん\s*[2２にツー][ー〜]?)/gi,
    replacement: '放散痛',
    desc: '放散痛',
  },
  { pattern: /全協部|前協部|ぜんきょうぶ|前強部|前経部/g, replacement: '前胸部', desc: '前胸部' },
  { pattern: /胸部あっぱくかん|胸部圧迫感|局圧迫感|京部圧迫感|きょうぶあっぱくかん/g, replacement: '胸部圧迫感', desc: '胸部圧迫感' },
  { pattern: /こうはいぶつう|甲肺部痛|後背普通/g, replacement: '後背部痛', desc: '後背部痛' },
  { pattern: /背部通|はいぶつう|牌部痛/g, replacement: '背部痛', desc: '背部痛' },
  { pattern: /心窩部痛|しんかぶつう|進化部痛|心下部痛|新株通/g, replacement: '心窩部痛', desc: '心窩部痛' },
  { pattern: /きょうぶこうやくかん|胸部絞扼感|京都公約館|胸部公約官|胸部契約感|胸部光約款/g, replacement: '胸部絞扼感', desc: '胸部絞扼感' },
  { pattern: /きょうぶこうやくつう|胸部絞扼痛|胸部公約痛|京都公約通/g, replacement: '胸部絞扼痛', desc: '胸部絞扼痛' },
  { pattern: /労作時|ろうさくじ|労作寺|老作時|労作じ/g, replacement: '労作時', desc: '労作時' },
  { pattern: /安静時|あんせいじ|安静寺|安西寺/g, replacement: '安静時', desc: '安静時' },
  { pattern: /しんざつおんなし|心雑音なし|心雑女し|新雑音なし/g, replacement: '心雑音なし', desc: '心雑音なし' },
  { pattern: /しんおんじゅん|心音純|新温泉|心温純|新音純|心音準/g, replacement: '心音純', desc: '心音純' },
  { pattern: /しんおんせい|心音整|新音声|心温整|新音整|心音清/g, replacement: '心音整', desc: '心音整' },
  { pattern: /きそくただしい/g, replacement: '規則正しい', desc: '規則正しい' },
  { pattern: /きざこきゅう|起坐呼吸|記者呼吸|木佐呼吸|貴社呼吸|きざ呼吸/g, replacement: '起坐呼吸', desc: '起坐呼吸' },
  { pattern: /かたいふしゅなし|下腿浮腫なし|家庭浮腫なし|固い浮腫なし/g, replacement: '下腿浮腫なし', desc: '下腿浮腫なし' },
  { pattern: /かたいふしゅ|下腿浮腫|家庭浮腫|固い浮腫|家体浮腫/g, replacement: '下腿浮腫', desc: '下腿浮腫' },

  // 呼吸器・聴診・感染症 (★ ORCA/DMiME 臨床重要語彙)
  { pattern: /乾性咳嗽|かんせいがいそう|感性外相|完成概況|乾性外装|乾性改装|乾性がいそう/g, replacement: '乾性咳嗽', desc: '乾性咳嗽' },
  { pattern: /湿性咳嗽|しっせいがいそう|姿勢外相|市政概況|湿性外装|湿性がいそう/g, replacement: '湿性咳嗽', desc: '湿性咳嗽' },
  { pattern: /湿性ラ音|しっせいらおん|姿勢論|市政論|湿性雷音|湿性乱音/g, replacement: '湿性ラ音', desc: '湿性ラ音' },
  { pattern: /乾性ラ音|かんせいらおん|感性論|歓声論|乾性雷音/g, replacement: '乾性ラ音', desc: '乾性ラ音' },
  { pattern: /ラ音聴取せず|らおんちょうしゅせず|来恩徴取せず|ラ音聴取シズ/g, replacement: 'ラ音聴取せず', desc: 'ラ音聴取せず' },
  { pattern: /呼吸音清|呼吸音せい|こきゅうおんせい|呼吸音声|呼吸温存|呼吸温泉/g, replacement: '呼吸音清', desc: '呼吸音清' },
  { pattern: /呼吸空|こきゅうくう|呼吸苦|呼吸区|呼吸苦労/g, replacement: '呼吸苦', desc: '呼吸苦' },
  { pattern: /こきゅうこんなん|呼吸困難|呼吸混濁|呼吸紺野/g, replacement: '呼吸困難', desc: '呼吸困難' },
  { pattern: /こきゅうこんなんかん|呼吸困難感/g, replacement: '呼吸困難感', desc: '呼吸困難感' },
  { pattern: /咽頭発赤|咽頭ほっせき|いんとうほっせき|引当発赤|陰等発赤/g, replacement: '咽頭発赤', desc: '咽頭発赤' },
  { pattern: /扁桃白苔|扁桃はくたい|へんとうはくたい|偏向白帯|扁桃薄帯/g, replacement: '扁桃白苔', desc: '扁桃白苔' },
  { pattern: /扁桃はくたいなし|扁桃白苔なし/g, replacement: '扁桃白苔なし', desc: '扁桃白苔なし' },
  { pattern: /扁桃肥大|へんとうひだい|返答肥大|偏向肥大/g, replacement: '扁桃肥大', desc: '扁桃肥大' },
  { pattern: /頸部リンパ節腫脹|頸部リンパ節しゅちょう|けいぶりんぱせつしゅちょう|警部リンパ節主張|競馬リンパ節市長|リンパ節主張/g, replacement: '頸部リンパ節腫脹', desc: '頸部リンパ節腫脹' },
  { pattern: /ばちゆび|ばちじょうゆび|バチ状指|罰指|蜂指/g, replacement: 'バチ状指', desc: 'バチ状指' },

  // 内視鏡・消化器 (★ ORCA/DMiME 臨床重要語彙)
  { pattern: /観桜病変|かんおうびょうへん|陥凹病変|観光病変|寒桜病変|感応病変/g, replacement: '陥凹病変', desc: '陥凹病変' },
  { pattern: /不整観桜|ふせいかんおう|不整陥凹|不正観桜|不正感応/g, replacement: '不整陥凹', desc: '不整陥凹' },
  { pattern: /協会明瞭|きょうかいめいりょう|境界明瞭|今日買い明瞭/g, replacement: '境界明瞭', desc: '境界明瞭' },
  { pattern: /協会不明瞭|きょうかいふめいりょう|境界不明瞭|今日買い不明瞭/g, replacement: '境界不明瞭', desc: '境界不明瞭' },
  { pattern: /前提部|ぜんていぶ|前庭部|前程部/g, replacement: '前庭部', desc: '前庭部' },
  { pattern: /威嚇部|いかくぶ|胃角部|胃各部/g, replacement: '胃角部', desc: '胃角部' },
  { pattern: /いうもんぶ|幽門部|ゆうもんぶ|有門部/g, replacement: '幽門部', desc: '幽門部' },
  { pattern: /ふんもんぶ|噴門部|分門部|憤門部/g, replacement: '噴門部', desc: '噴門部' },
  { pattern: /いそうぶ|胃底部|いていぶ|胃低部/g, replacement: '胃底部', desc: '胃底部' },
  { pattern: /たいぶしょうわん|体部小弯|体部少湾|大砲消炎/g, replacement: '体部小弯', desc: '体部小弯' },
  { pattern: /たいぶだいわん|体部大弯|体部大湾|大砲大炎/g, replacement: '体部大弯', desc: '体部大弯' },
  { pattern: /びらんせいいえん|びらん性胃炎|美乱性胃炎|避難性胃炎/g, replacement: 'びらん性胃炎', desc: 'びらん性胃炎' },
  { pattern: /微細血管構築異常|微細血管高築異常|鼻腔血管構築異常/g, replacement: '微細血管構築異常', desc: '微細血管構築異常' },

  // 肝・胆・膵
  { pattern: /アルコール性\s*換気機能障害/g, replacement: 'アルコール性肝機能障害', desc: '肝機能障害' },
  { pattern: /換気機能障害|かんきのうしょうがい/g, replacement: '肝機能障害', desc: '肝機能障害' },
  { pattern: /かんこうへん|観光編|敢行編/g, replacement: '肝硬変', desc: '肝硬変' },
  { pattern: /脂肪間|しぼうかん|志望館/g, replacement: '脂肪肝', desc: '脂肪肝' },
  { pattern: /胆石称|たんせきしょう|探石症/g, replacement: '胆石症', desc: '胆石症' },
  { pattern: /すいえん|水煙|水炎/g, replacement: '膵炎', desc: '膵炎' },

  // 診察所見・カルテ用語
  { pattern: /身体初見|しんたいしょけん/g, replacement: '身体所見', desc: '身体所見' },
  { pattern: /検査初見|けんさしょけん/g, replacement: '検査所見', desc: '検査所見' },
  { pattern: /心電図初見/g, replacement: '心電図所見', desc: '心電図所見' },
  { pattern: /内視鏡初見/g, replacement: '内視鏡所見', desc: '内視鏡所見' },
  { pattern: /エコー初見/g, replacement: 'エコー所見', desc: 'エコー所見' },
  { pattern: /画像初見/g, replacement: '画像所見', desc: '画像所見' },
  { pattern: /特記初見/g, replacement: '特記所見', desc: '特記所見' },
  { pattern: /臨床初見/g, replacement: '臨床所見', desc: '臨床所見' },
  { pattern: /特記事項初見/g, replacement: '特記事項所見', desc: '特記事項所見' },
  { pattern: /理学初見|りがくしょけん/g, replacement: '理学所見', desc: '理学所見' },

  // 一般診療・用法・症状
  { pattern: /真移植後|まいしょくご|埋植後/g, replacement: '毎食後', desc: '毎食後' },
  { pattern: /あさしょくご|麻殖後/g, replacement: '朝食後', desc: '朝食後' },
  { pattern: /ゆうしょくご|遊職後/g, replacement: '夕食後', desc: '夕食後' },
  { pattern: /ちゅうしょくご|忠職後/g, replacement: '昼食後', desc: '昼食後' },
  { pattern: /しょくぜん|職前/g, replacement: '食前', desc: '食前' },
  { pattern: /しょくかん|職棺|職管/g, replacement: '食間', desc: '食間' },
  { pattern: /しゅうしんぜん|ねるまえ|終身前/g, replacement: '就寝前', desc: '就寝前' },
  { pattern: /とんぷく|とんよう|呑用|豚用/g, replacement: '頓用', desc: '頓用' },
  { pattern: /はつねつあり/g, replacement: '発熱あり', desc: '発熱あり' },
  { pattern: /せきあり|席あり/g, replacement: '咳嗽あり', desc: '咳嗽あり' },
  { pattern: /たんあり|炭あり/g, replacement: '喀痰あり', desc: '喀痰あり' },
  { pattern: /おうとあり/g, replacement: '嘔吐あり', desc: '嘔吐あり' },
  { pattern: /おしんあり/g, replacement: '悪心あり', desc: '悪心あり' },
  { pattern: /げりあり/g, replacement: '下痢あり', desc: '下痢あり' },
  { pattern: /べんぴあり/g, replacement: '便秘あり', desc: '便秘あり' },
];

/**
 * 2. 頻出医学英語略語・検査名解読辞書 (Clinical Abbreviations & Lab Names)
 */
const ABBREVIATION_RULES: { pattern: RegExp; replacement: string; desc: string }[] = [
  // 循環器不整脈・虚血
  { pattern: /(?:心房細動|しんぼうさいどう)?\s*(?:エーエフ|エーフィブ|afib)(?![ァ-ヴーa-zA-Z0-9])/gi, replacement: '心房細動 (Af)', desc: '心房細動 (Af)' },
  { pattern: /心房そどう|エーエフエル|afl\b/gi, replacement: '心房粗動 (AFL)', desc: '心房粗動 (AFL)' },
  { pattern: /しんしつひんぱく|ブイティー|vt\b/gi, replacement: '心室頻拍 (VT)', desc: '心室頻拍 (VT)' },
  { pattern: /しんしつさいどう|ブイエフ|vf\b/gi, replacement: '心室細動 (VF)', desc: '心室細動 (VF)' },
  { pattern: /きがいしゅうしく|ピーブイシー|pvc\b/gi, replacement: '心室期外収縮 (PVC)', desc: '心室期外収縮 (PVC)' },
  { pattern: /ピーエーシー|pac\b/gi, replacement: '上室期外収縮 (PAC)', desc: '上室期外収縮 (PAC)' },
  { pattern: /エスティーていか|エスティー低下|stていか/gi, replacement: 'ST低下', desc: 'ST低下' },
  { pattern: /エスティーじょうしょう|エスティー上昇|stじょうしょう/gi, replacement: 'ST上昇', desc: 'ST上昇' },
  { pattern: /ステミ|stemi\b/gi, replacement: 'STEMI (ST上昇型心筋梗塞)', desc: 'STEMI' },
  { pattern: /ノンスティーミ|nstemi\b/gi, replacement: 'NSTEMI (非ST上昇型心筋梗塞)', desc: 'NSTEMI' },
  { pattern: /エーシーエス|acs\b/gi, replacement: 'ACS (急性冠症候群)', desc: 'ACS' },
  { pattern: /エイチエフ|しんふぜん/gi, replacement: '心不全 (HF)', desc: '心不全 (HF)' },
  { pattern: /左室肥大|エルブイエイチ|lvh\b/gi, replacement: '左室肥大 (LVH)', desc: '左室肥大 (LVH)' },
  { pattern: /キャグ|シーエージー|cag\b/gi, replacement: '冠動脈造影 (CAG)', desc: 'CAG' },
  { pattern: /ピーシーアイ|pci\b/gi, replacement: '経皮的冠動脈インターベンション (PCI)', desc: 'PCI' },

  // 全身・慢性疾患略語
  { pattern: /シーケーディー|ckd\b/gi, replacement: 'CKD (慢性腎臓病)', desc: 'CKD' },
  { pattern: /シーオーピーディー|copd\b/gi, replacement: 'COPD (慢性閉塞性肺疾患)', desc: 'COPD' },
  { pattern: /ディーエム|とうにょうびょう/gi, replacement: '糖尿病 (DM)', desc: 'DM' },
  { pattern: /こうけつあつ|エイチティー/gi, replacement: '高血圧症 (HT)', desc: 'HT' },
  { pattern: /ししついじょうしょう|ディーエル/gi, replacement: '脂質異常症 (DL)', desc: 'DL' },
  { pattern: /ジーイーアールディー|ガード|gerd\b/gi, replacement: '胃食道逆流症 (GERD)', desc: 'GERD' },

  // 血液・生化学・バイオマーカー
  { pattern: /シーアールピー|crp\b/gi, replacement: 'CRP', desc: 'CRP' },
  { pattern: /ダブリュービーシー|白血球数?|wbc\b/gi, replacement: 'WBC', desc: 'WBC' },
  { pattern: /アールビーシー|赤血球数?|rbc\b/gi, replacement: 'RBC', desc: 'RBC' },
  { pattern: /ヘモグロビンエーワンシー|エイチビーエーワンシー|hba1c\b/gi, replacement: 'HbA1c', desc: 'HbA1c' },
  { pattern: /ヘモグロビン|エイチビー|hb\b/gi, replacement: 'Hb', desc: 'Hb' },
  { pattern: /血小板数?|ピーエルティー|plt\b/gi, replacement: 'Plt', desc: 'Plt' },
  { pattern: /ビーエヌピー|bnp\b/gi, replacement: 'BNP', desc: 'BNP' },
  { pattern: /エヌティープロビーエヌピー|nt-probnp\b/gi, replacement: 'NT-proBNP', desc: 'NT-proBNP' },
  { pattern: /イージーエフアール|イーゲーエフアール|egfr\b/gi, replacement: 'eGFR', desc: 'eGFR' },
  { pattern: /クレアチニン|シーアールイー|cre\b/gi, replacement: 'Cre', desc: 'Cre' },
  { pattern: /ビーユーエヌ|尿素窒素|bun\b/gi, replacement: 'BUN', desc: 'BUN' },
  { pattern: /アスカル|エーエスティ|ast\b/gi, replacement: 'AST', desc: 'AST' },
  { pattern: /エーエルティー|alt\b/gi, replacement: 'ALT', desc: 'ALT' },
  { pattern: /ガンマジ―ティーピー|ガンマジーティー|γ-gtp|ggtp\b/gi, replacement: 'γ-GTP', desc: 'γ-GTP' },
  { pattern: /エルディーエル|悪玉コレステロール|ldl(?:-c)?\b/gi, replacement: 'LDL-C', desc: 'LDL-C' },
  { pattern: /エイチディーエル|善玉コレステロール|hdl(?:-c)?\b/gi, replacement: 'HDL-C', desc: 'HDL-C' },
  { pattern: /中性脂肪|トリグリセリド|tg\b/gi, replacement: 'TG', desc: 'TG' },
  { pattern: /尿酸値?|ユーエー|ua\b/gi, replacement: 'UA', desc: 'UA' },
  { pattern: /トロポニンティー|トロポニンt\b/gi, replacement: 'トロポニンT', desc: 'トロポニンT' },
  { pattern: /トロポニンアイ|トロポニンi\b/gi, replacement: 'トロポニンI', desc: 'トロポニンI' },
  { pattern: /シーケーエムビー|ck-mb\b/gi, replacement: 'CK-MB', desc: 'CK-MB' },
  { pattern: /ディーダイマー|dダイマー|d-dimer\b/gi, replacement: 'Dダイマー', desc: 'Dダイマー' },
  { pattern: /ピーティーアイエヌアール|pt-inr\b/gi, replacement: 'PT-INR', desc: 'PT-INR' },
];

/**
 * 3. 頻出医薬品・商品名・一般名 音声解読辞書 (Pharmaceuticals & Generic Names)
 */
const DRUG_RULES: { pattern: RegExp; replacement: string; desc: string }[] = [
  // 循環器・降圧薬・抗血栓薬
  { pattern: /ニトロペン(?:舌下錠)?|ニトログリセリン舌下/gi, replacement: 'ニトロペン舌下錠0.3mg', desc: 'ニトロペン舌下錠' },
  { pattern: /アムロジピン|ノルバスク/gi, replacement: 'アムロジピン錠', desc: 'アムロジピン' },
  { pattern: /アトルバスタチン|リピトール/gi, replacement: 'アトルバスタチン錠', desc: 'アトルバスタチン' },
  { pattern: /ロスバスタチン|クレストール/gi, replacement: 'ロスバスタチン錠', desc: 'ロスバスタチン' },
  { pattern: /ピタバスタチン|リバロ/gi, replacement: 'ピタバスタチン錠', desc: 'ピタバスタチン' },
  { pattern: /バイアスピリン|アスピリン腸溶/gi, replacement: 'バイアスピリン錠100mg', desc: 'バイアスピリン' },
  { pattern: /クロピドグレル|プラビックス/gi, replacement: 'クロピドグレル錠', desc: 'クロピドグレル' },
  { pattern: /エフィエント|プラスグレル/gi, replacement: 'エフィエント錠', desc: 'エフィエント' },
  { pattern: /ビソプロロール|メインテート/gi, replacement: 'ビソプロロールフマル酸塩錠', desc: 'ビソプロロール' },
  { pattern: /カルベジロール|アーチスト/gi, replacement: 'カルベジロール錠', desc: 'カルベジロール' },
  { pattern: /オルメテック|オルメサルタン/gi, replacement: 'オルメサルタン錠', desc: 'オルメサルタン' },
  { pattern: /アジルバ|アジルサルタン/gi, replacement: 'アジルバ錠', desc: 'アジルバ' },
  { pattern: /テルミサルタン|ミカルディス/gi, replacement: 'テルミサルタン錠', desc: 'テルミサルタン' },
  { pattern: /カンデサルタン|ブロプレス/gi, replacement: 'カンデサルタン錠', desc: 'カンデサルタン' },
  { pattern: /バルサルタン|ディオバン/gi, replacement: 'バルサルタン錠', desc: 'バルサルタン' },
  { pattern: /エンレスト|サクビトリルバルサルタン/gi, replacement: 'エンレスト錠', desc: 'エンレスト' },
  { pattern: /エリキュース|アピキサバン/gi, replacement: 'エリキュース錠', desc: 'エリキュース' },
  { pattern: /リクシアナ|エドキサバン/gi, replacement: 'リクシアナ錠', desc: 'リクシアナ' },
  { pattern: /イグザレルト|リバーロキサバン/gi, replacement: 'イグザレルト錠', desc: 'イグザレルト' },
  { pattern: /プラザキサ|ダビガトラン/gi, replacement: 'プラザキサカプセル', desc: 'プラザキサ' },
  { pattern: /ワーファリン|ワルファリン/gi, replacement: 'ワルファリン錠', desc: 'ワルファリン' },
  { pattern: /ラシックス|フロセミド/gi, replacement: 'フロセミド錠', desc: 'フロセミド' },
  { pattern: /アルダクトン|スピロノラクトン/gi, replacement: 'スピロノラクトン錠', desc: 'スピロノラクトン' },

  // 糖尿病薬 (SGLT2阻害薬・DPP-4阻害薬・GLP-1等)
  { pattern: /フォシーガ|ダパグリフロジン/gi, replacement: 'フォシーガ錠10mg', desc: 'フォシーガ' },
  { pattern: /ジャディアンス|エンパグリフロジン/gi, replacement: 'ジャディアンス錠10mg', desc: 'ジャディアンス' },
  { pattern: /カナグル|カナグリフロジン/gi, replacement: 'カナグル錠100mg', desc: 'カナグル' },
  { pattern: /ジャヌビア|シタグリプチン/gi, replacement: 'ジャヌビア錠50mg', desc: 'ジャヌビア' },
  { pattern: /トラゼンタ|リナグリプチン/gi, replacement: 'トラゼンタ錠5mg', desc: 'トラゼンタ' },
  { pattern: /メトグルコ|メトホルミン/gi, replacement: 'メトホルミン塩酸塩錠', desc: 'メトホルミン' },
  { pattern: /アマリール|グリメピリド/gi, replacement: 'グリメピリド錠', desc: 'グリメピリド' },

  // 解熱鎮痛薬・感冒処方・抗生剤
  { pattern: /カロナール|アセトアミノフェン/gi, replacement: 'アセトアミノフェン錠', desc: 'アセトアミノフェン' },
  { pattern: /ロキソニン|ロキソプロフェン/gi, replacement: 'ロキソプロフェンNa錠60mg', desc: 'ロキソプロフェン' },
  { pattern: /セレコックス|セレコキシブ/gi, replacement: 'セレコキシブ錠100mg', desc: 'セレコキシブ' },
  { pattern: /トランサミン|トラネキサム酸/gi, replacement: 'トラネキサム酸錠250mg', desc: 'トラネキサム酸' },
  { pattern: /メジコン|デキストロメトルファン/gi, replacement: 'デキストロメトルファン臭化水素酸塩錠15mg', desc: 'デキストロメトルファン' },
  { pattern: /ムコダイン|カルボシステイン/gi, replacement: 'カルボシステイン錠500mg', desc: 'カルボシステイン' },
  { pattern: /ムコソルバン|アンブロキソール/gi, replacement: 'アンブロキソール塩酸塩錠15mg', desc: 'アンブロキソール' },
  { pattern: /クラビット|レボフロキサシン/gi, replacement: 'レボフロキサシン錠500mg', desc: 'レボフロキサシン' },
  { pattern: /オーグメンチン|アモキシシリンクラブラン酸/gi, replacement: 'オーグメンチン配合錠', desc: 'オーグメンチン' },
  { pattern: /サワシリン|アモキシシリン/gi, replacement: 'アモキシシリンカプセル250mg', desc: 'アモキシシリン' },

  // 消化器薬・その他
  { pattern: /タケキャブ|ボノプラザン/gi, replacement: 'タケキャブ錠20mg', desc: 'タケキャブ' },
  { pattern: /ネキシウム|エソメプラゾール/gi, replacement: 'ネキシウムカプセル20mg', desc: 'ネキシウム' },
  { pattern: /パリエット|ラベプラゾール/gi, replacement: 'ラベプラゾールNa錠10mg', desc: 'ラベプラゾール' },
  { pattern: /マグミット|酸化マグネシウム/gi, replacement: '酸化マグネシウム錠330mg', desc: '酸化マグネシウム' },
  { pattern: /モビコール/gi, replacement: 'モビコール配合散', desc: 'モビコール' },
];

/**
 * 4. バイタルサイン表記の完全自動構造化 (Vitals Auto-Formatter)
 * 例:
 *  「ビーピー 140の80」 ➔ `BP 140/80 mmHg`
 *  「血圧 135 85」 ➔ `BP 135/85 mmHg`
 *  「脈拍 78」 ➔ `PR 78 bpm`
 *  「サチュレーション 98 パーセント ルーム」 ➔ `SpO2 98% (room air)`
 *  「体温 36度8分」 ➔ `BT 36.8 ℃`
 */
function decodeVitalSigns(text: string, corrections: DecodedCorrection[]): string {
  let result = text;

  // BP: 血圧 / ビーピー / BP 140の90 または 140/90
  const bpRegex1 = /(?:BP|ビーピー|血圧|けつあつ)(?:は|が|で|[:：\s])*([0-9]{2,3})\s*(?:の|対|\/|\s)\s*([0-9]{2,3})(?:\s*ミリ|mmHg)?/gi;
  result = result.replace(bpRegex1, (_match, sys, dia) => {
    const formatted = `BP ${sys}/${dia} mmHg`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // HR / PR: 脈拍 / 心拍 / ハートレート / パルス
  const hrRegex = /(?:HR|PR|心拍数?|脈拍数?|ハートレート|パルス)(?:は|が|で|[:：\s])*([0-9]{2,3})(?:\s*回|回\/分|bpm)?(?:\s*(整|不整|せい|ふせい))?/gi;
  result = result.replace(hrRegex, (_match, rate, rhythm) => {
    const rhythmStr = rhythm ? (rhythm === 'ふせい' || rhythm === '不整' ? ' (不整)' : ' (整)') : '';
    const formatted = `HR ${rate} bpm${rhythmStr}`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // SpO2: サチュレーション / エスピーオーツー
  const spo2Regex = /(?:SpO2|エスピーオーツー|サチュレーション|サツ)(?:は|が|で|[:：\s])*([0-9]{2,3})\s*(?:%|パーセント)?(?:\s*(?:ルームエアー?|へいや|ルーム|room|ra))?/gi;
  result = result.replace(spo2Regex, (_match, val) => {
    const hasRoom = /(?:ルーム|へいや|room|ra)/i.test(_match);
    const formatted = hasRoom ? `SpO2 ${val}% (room air)` : `SpO2 ${val}%`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // BT: 体温 / ビーティー / ボディテンパー
  const btRegex = /(?:BT|ビーティー|体温|たいおん)(?:は|が|で|[:：\s])*([0-9]{2})(?:度|\.|\s)([0-9])(?:分|度|℃)?/gi;
  result = result.replace(btRegex, (_match, integerPart, decimalPart) => {
    const formatted = `BT ${integerPart}.${decimalPart} ℃`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  return result;
}

/**
 * 5. 処方表記・用法用量の自動正規化 (Dosage & Prescription Formatter)
 * 例:
 *  「1てぃー 1くす 朝食後」 ➔ `1T 1x 朝食後`
 *  「2てぃー 2くす 朝夕食後」 ➔ `2T 2x 朝夕食後`
 *  「1ほう ぶんさん」 ➔ `1包 分3`
 */
function decodePrescriptionSyntax(text: string, corrections: DecodedCorrection[]): string {
  let result = text;

  // 1T 1x / 2T 2x
  result = result.replace(/([0-9]+)\s*(?:ティー|てぃー|T|錠)\s*([0-9]+)\s*(?:エックス|えっくす|クス|くす|X|x)/gi, (_m, t, x) => {
    const formatted = `${t}T ${x}x`;
    corrections.push({ original: _m, corrected: formatted, category: 'dosage' });
    return formatted;
  });

  // 1包 / 2包
  result = result.replace(/([0-9]+)\s*(?:ほう|ホウ|包)/g, (_m, h) => {
    return `${h}包`;
  });

  // 分1 / 分2 / 分3
  result = result.replace(/(?:ぶん|ブン|分)\s*([1-4１-４一二三四])/g, (_m, num) => {
    const map: Record<string, string> = { '1': '1', '１': '1', '一': '1', '2': '2', '２': '2', '二': '2', '3': '3', '３': '3', '三': '3', '4': '4', '４': '4', '四': '4' };
    const n = map[num] || num;
    return `分${n}`;
  });

  // 日数: 7日分 / 14日分 / 28日分
  result = result.replace(/([0-9]+)\s*(?:にちぶん|日分)/g, (_m, d) => {
    return `${d}日分`;
  });

  return result;
}

/**
 * 6. カルテ主要セクション見出しの自動展開 (Section Headers)
 */
function decodeSectionHeaders(text: string): string {
  return text
    .replace(/(?:^|\n|\s)(?:主訴|しゅそ)[:：\s]*/g, '\n【主訴】')
    .replace(/(?:^|\n|\s)(?:現病歴|げんびょうれき)[:：\s]*/g, '\n【現病歴】')
    .replace(/(?:^|\n|\s)(?:既往歴|きおうれき)[:：\s]*/g, '\n【既往歴】')
    .replace(/(?:^|\n|\s)(?:内服薬|ないふくやく|持参薬|服薬)[:：\s]*/g, '\n【内服薬】')
    .replace(/(?:^|\n|\s)(?:身体所見|診察所見|しんさつしょけん)[:：\s]*/g, '\n【身体所見】')
    .replace(/(?:^|\n|\s)(?:検査所見|検査結果|けんさしょけん)[:：\s]*/g, '\n【検査】')
    .replace(/(?:^|\n|\s)(?:アセスメント|評価|鑑別診断|あせすめんと)[:：\s]*/g, '\n【アセスメント】')
    .replace(/(?:^|\n|\s)(?:プラン|治療計画|治療方針|処方計画|ぷらん)[:：\s]*/g, '\n【プラン】');
}

/**
 * 臨床特化医療語彙 & ORCA/DMiME 医療辞書 代表的語彙マスター
 * 未知の誤認識パターンに対する動的音素ファジー照合用
 */
export interface ClinicalOrcaTerm {
  term: string;         // 正式臨床表記 (例: '体動時', '放散痛')
  phonetic: string;     // 正規化音素 (例: 'taidouji', 'housantsuu')
  desc: string;
}

export const CLINICAL_ORCA_TERMS: ClinicalOrcaTerm[] = [
  { term: '体動時', phonetic: 'taidouji', desc: '体動時' },
  { term: '放散痛', phonetic: 'housantsuu', desc: '放散痛' },
  { term: '労作時', phonetic: 'rousakuji', desc: '労作時' },
  { term: '安静時', phonetic: 'anseiji', desc: '安静時' },
  { term: '乾性咳嗽', phonetic: 'kanseigaisou', desc: '乾性咳嗽' },
  { term: '湿性咳嗽', phonetic: 'sisseigaisou', desc: '湿性咳嗽' },
  { term: '湿性ラ音', phonetic: 'sisseiraon', desc: '湿性ラ音' },
  { term: '乾性ラ音', phonetic: 'kanseiraon', desc: '乾性ラ音' },
  { term: '胸部圧迫感', phonetic: 'kyoubuappakukan', desc: '胸部圧迫感' },
  { term: '胸部絞扼感', phonetic: 'kyoubukouyakukan', desc: '胸部絞扼感' },
  { term: '胸部絞扼痛', phonetic: 'kyoubukouyakutsuu', desc: '胸部絞扼痛' },
  { term: '前胸部痛', phonetic: 'zenkyoubutsuu', desc: '前胸部痛' },
  { term: '心窩部痛', phonetic: 'shinkabutsuu', desc: '心窩部痛' },
  { term: '後背部痛', phonetic: 'kouhaibutsuu', desc: '後背部痛' },
  { term: '起坐呼吸', phonetic: 'kizakokyuu', desc: '起坐呼吸' },
  { term: '呼吸困難感', phonetic: 'kokyuukonnankan', desc: '呼吸困難感' },
  { term: '呼吸困難', phonetic: 'kokyuukonnan', desc: '呼吸困難' },
  { term: '呼吸苦', phonetic: 'kokyuuku', desc: '呼吸苦' },
  { term: '下腿浮腫', phonetic: 'kataifushu', desc: '下腿浮腫' },
  { term: '心音純', phonetic: 'shinonjun', desc: '心音純' },
  { term: '心音整', phonetic: 'shinonsei', desc: '心音整' },
  { term: '心室期外収縮', phonetic: 'shinshitsukigaishuushuku', desc: '心室期外収縮' },
  { term: '上室期外収縮', phonetic: 'joushitsukigaishuushuku', desc: '上室期外収縮' },
  { term: '心房細動', phonetic: 'shinbousaidou', desc: '心房細動' },
  { term: '咽頭発赤', phonetic: 'intouhosseki', desc: '咽頭発赤' },
  { term: '扁桃白苔', phonetic: 'hentouhakutai', desc: '扁桃白苔' },
  { term: '頸部リンパ節腫脹', phonetic: 'keiburinpasetsushuchou', desc: '頸部リンパ節腫脹' },
  { term: '陥凹病変', phonetic: 'kanoubyouhen', desc: '陥凹病変' },
  { term: '不整陥凹', phonetic: 'fuseikanou', desc: '不整陥凹' },
  { term: '境界明瞭', phonetic: 'kyoukaimeiryou', desc: '境界明瞭' },
  { term: '境界不明瞭', phonetic: 'kyoukaifumeiryou', desc: '境界不明瞭' },
  { term: '前庭部', phonetic: 'zenteibu', desc: '前庭部' },
  { term: '胃角部', phonetic: 'ikakubu', desc: '胃角部' },
  { term: '幽門部', phonetic: 'yuumonbu', desc: '幽門部' },
  { term: '噴門部', phonetic: 'funmonbu', desc: '噴門部' },
  { term: '体部小弯', phonetic: 'taibushouwan', desc: '体部小弯' },
  { term: '体部大弯', phonetic: 'taibudaiwan', desc: '体部大弯' },
  { term: 'びらん性胃炎', phonetic: 'biranseiien', desc: 'びらん性胃炎' },
  { term: '微細血管構築異常', phonetic: 'bisaikekkankouchikuijou', desc: '微細血管構築異常' },
  { term: '肝機能障害', phonetic: 'kankinoushougai', desc: '肝機能障害' },
  { term: '胆石症', phonetic: 'tansekishou', desc: '胆石症' },
  { term: '膵炎', phonetic: 'suien', desc: '膵炎' },
];

/**
 * ひらがな・カタカナ・アルファベット・数字から正規化音素（Hepburnローマ字）への変換
 */
function textToPhonetic(str: string): string {
  let hira = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x30A1 && code <= 0x30F6) {
      hira += String.fromCharCode(code - 0x60);
    } else {
      hira += str[i];
    }
  }

  // 数字の音素展開 (2 -> tsu, 3 -> san)
  hira = hira
    .replace(/[2２]/g, 'つー')
    .replace(/[3３]/g, 'さん')
    .replace(/[1１]/g, 'いち');

  const map: Record<string, string> = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja',  'じゅ': 'ju',  'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'を': 'o',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ー': '-',
  };

  let res = '';
  let i = 0;
  while (i < hira.length) {
    if (hira[i] === 'ん') {
      res += 'n';
      i++;
      continue;
    }
    if (hira[i] === 'っ') {
      if (i + 1 < hira.length) {
        const nextTwo = hira.slice(i + 1, i + 3);
        const nextOne = hira[i + 1];
        const nextRom = map[nextTwo] || map[nextOne] || '';
        if (nextRom) {
          res += nextRom[0];
          i++;
          continue;
        }
      }
      res += 'tsu';
      i++;
      continue;
    }
    const two = hira.slice(i, i + 2);
    if (map[two]) {
      res += map[two];
      i += 2;
      continue;
    }
    const one = hira[i];
    if (map[one]) {
      res += map[one];
      i++;
      continue;
    }
    if (/[a-zA-Z0-9]/.test(one)) {
      res += one.toLowerCase();
    }
    i++;
  }
  return res;
}

/**
 * 音響的混同を考慮した重み付きレーベンシュタイン類似度 (0.0 〜 1.0)
 */
function phoneticSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const d: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const c1 = s1[i - 1];
      const c2 = s2[j - 1];
      let cost = 1.0;
      if (c1 === c2) {
        cost = 0;
      } else {
        // 音響的混同グループ（調音点類似）
        if (('td'.includes(c1) && 'td'.includes(c2)) ||
            ('kg'.includes(c1) && 'kg'.includes(c2)) ||
            ('szj'.includes(c1) && 'szj'.includes(c2)) ||
            ('bp'.includes(c1) && 'bp'.includes(c2))) {
          cost = 0.25;
        } else if (('ao'.includes(c1) && 'ao'.includes(c2)) ||
                   ('iu'.includes(c1) && 'iu'.includes(c2))) {
          cost = 0.35;
        } else if ((c1 === 'h' || c2 === 'h') || (c1 === '-' || c2 === '-')) {
          cost = 0.3;
        }
      }
      d[i][j] = Math.min(
        d[i - 1][j] + 1.0,
        d[i][j - 1] + 1.0,
        d[i - 1][j - 1] + cost
      );
    }
  }

  const dist = d[len1][len2];
  const maxLen = Math.max(len1, len2);
  return Math.max(0, 1.0 - dist / maxLen);
}

const CLINICAL_CONTEXT_WORDS = [
  '胸部', '背部', '腹部', '呼吸', '心臓', '痛み', '疼痛', '増悪', '出現',
  '悪化', 'なし', 'あり', '左肩', '心窩部', '安静', '労作', '所見', '主訴',
  '現病歴', 'カルテ', '既往', '内服', '処方', '圧迫', '絞扼', 'ラ音', '咳嗽'
];

function hasClinicalContext(text: string): boolean {
  return CLINICAL_CONTEXT_WORDS.some(w => text.includes(w));
}

/**
 * 未知の誤認識フレーズに対する ORCA/DMiME 動的音素ファジー照合
 */
function decodeDynamicPhonetics(text: string, corrections: DecodedCorrection[]): string {
  const isClinical = hasClinicalContext(text);
  if (!isClinical && text.length < 5) {
    return text;
  }

  let result = text;

  for (const item of CLINICAL_ORCA_TERMS) {
    if (result.includes(item.term)) continue;

    const targetLen = item.term.length;
    const minChunk = Math.max(2, targetLen - 1);
    const maxChunk = targetLen + 4;

    for (let len = maxChunk; len >= minChunk; len--) {
      for (let pos = 0; pos <= result.length - len; pos++) {
        const chunk = result.substr(pos, len);
        if (chunk.includes(item.term) || chunk.trim().length === 0) continue;

        const chunkPhonetic = textToPhonetic(chunk);
        if (!chunkPhonetic || chunkPhonetic.length < 3) continue;

        const sim = phoneticSimilarity(chunkPhonetic, item.phonetic);
        const threshold = isClinical ? 0.68 : 0.85;

        if (sim >= threshold) {
          corrections.push({ original: chunk, corrected: item.term, category: 'finding' });
          result = result.slice(0, pos) + item.term + result.slice(pos + len);
          break;
        }
      }
    }
  }

  return result;
}

/**
 * メインエクスポート: 音声認識テキストを医学専門用語・略語・バイタル・医薬品へ高精度解読
 */
export function decodeMedicalSpeech(rawTranscript: string): MedicalSpeechDecodeResult {
  if (!rawTranscript || !rawTranscript.trim()) {
    return { rawText: '', decodedText: '', corrections: [], detectedCategories: [] };
  }

  const corrections: DecodedCorrection[] = [];
  const detectedCategoriesSet = new Set<string>();

  let text = rawTranscript;

  // 1. セクション見出しの音声展開
  const textWithHeaders = decodeSectionHeaders(text);
  if (textWithHeaders !== text) {
    detectedCategoriesSet.add('カルテ構成');
    text = textWithHeaders;
  }

  // 2. バイタルサイン・身体測定値の自動構造化
  const textWithVitals = decodeVitalSigns(text, corrections);
  if (textWithVitals !== text) {
    detectedCategoriesSet.add('バイタルサイン');
    text = textWithVitals;
  }

  // 3. 処方表記・用法用量の自動正規化
  const textWithPrescription = decodePrescriptionSyntax(text, corrections);
  if (textWithPrescription !== text) {
    detectedCategoriesSet.add('処方・用法用量');
    text = textWithPrescription;
  }

  // 4. 音声認識特有の誤字・同音異義語の補正 (ORCA/DMiME 臨床重要語彙 & 音響エイリアス)
  for (const rule of HOMOPHONE_RULES) {
    if (rule.pattern.test(text)) {
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, (match) => {
        corrections.push({ original: match, corrected: rule.replacement, category: 'homophone' });
        return rule.replacement;
      });
      detectedCategoriesSet.add('医学同音異義語');
    }
  }

  // 4.5. 未知の誤認識フレーズに対する ORCA/DMiME 動的音素ファジー照合
  const textWithPhonetics = decodeDynamicPhonetics(text, corrections);
  if (textWithPhonetics !== text) {
    detectedCategoriesSet.add('ORCA臨床音素照合');
    text = textWithPhonetics;
  }

  // 5. 頻出医学英語略語・検査項目名の解読
  for (const rule of ABBREVIATION_RULES) {
    if (rule.pattern.test(text)) {
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, (match) => {
        corrections.push({ original: match, corrected: rule.replacement, category: 'abbreviation' });
        return rule.replacement;
      });
      detectedCategoriesSet.add('医学略語・検査');
    }
  }

  // 6. 頻出医薬品・商品名・一般名への解読
  for (const rule of DRUG_RULES) {
    if (rule.pattern.test(text)) {
      rule.pattern.lastIndex = 0;
      text = text.replace(rule.pattern, (match) => {
        corrections.push({ original: match, corrected: rule.replacement, category: 'drug' });
        return rule.replacement;
      });
      detectedCategoriesSet.add('医薬品マスター');
    }
  }

  // 重複除去 & 連続空白整理
  text = text.replace(/[ 　]{2,}/g, ' ').trim();

  return {
    rawText: rawTranscript,
    decodedText: text,
    corrections,
    detectedCategories: Array.from(detectedCategoriesSet),
  };
}

/**
 * リアルタイムUI表示用: 解読テキストを通常テキストと解読ハイライトトークンに分割
 */
export function getDecodedSpeechTokens(rawTranscript: string): {
  tokens: SpeechToken[];
  result: MedicalSpeechDecodeResult;
} {
  const result = decodeMedicalSpeech(rawTranscript);
  const text = result.decodedText;

  if (!text || result.corrections.length === 0) {
    return {
      tokens: text ? [{ text, isDecoded: false }] : [],
      result,
    };
  }

  // 重複・包含を考慮して出現位置を検出
  interface MatchRange {
    start: number;
    end: number;
    correction: DecodedCorrection;
  }

  const matches: MatchRange[] = [];
  const visitedCorrections = new Set<DecodedCorrection>();

  // 各補正語の出現位置を検索（長いもの優先）
  const sortedCorrections = [...result.corrections].sort((a, b) => b.corrected.length - a.corrected.length);

  for (const c of sortedCorrections) {
    if (!c.corrected) continue;
    let searchIndex = 0;
    while (searchIndex < text.length) {
      const idx = text.indexOf(c.corrected, searchIndex);
      if (idx === -1) break;

      const endIdx = idx + c.corrected.length;
      // 既存のマッチと重複していないか検証
      const hasOverlap = matches.some((m) => Math.max(m.start, idx) < Math.min(m.end, endIdx));
      if (!hasOverlap) {
        matches.push({
          start: idx,
          end: endIdx,
          correction: c,
        });
        visitedCorrections.add(c);
      }
      searchIndex = endIdx;
    }
  }

  // 開始位置順にソート
  matches.sort((a, b) => a.start - b.start);

  const tokens: SpeechToken[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      tokens.push({
        text: text.slice(cursor, match.start),
        isDecoded: false,
      });
    }
    tokens.push({
      text: match.correction.corrected,
      isDecoded: true,
      category: match.correction.category,
      original: match.correction.original,
    });
    cursor = match.end;
  }

  if (cursor < text.length) {
    tokens.push({
      text: text.slice(cursor),
      isDecoded: false,
    });
  }

  return { tokens, result };
}

