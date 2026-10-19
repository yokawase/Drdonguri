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
  category: 'vital' | 'abbreviation' | 'drug' | 'finding' | 'homophone' | 'dosage';
}

export interface MedicalSpeechDecodeResult {
  rawText: string;
  decodedText: string;
  corrections: DecodedCorrection[];
  detectedCategories: string[];
}

/**
 * 1. 音声認識特有の医学的同音異義語・誤字脱字辞書 (Homophone & Speech Recognition Error Map)
 */
const HOMOPHONE_RULES: { pattern: RegExp; replacement: string; desc: string }[] = [
  // 肝・胆・膵
  { pattern: /アルコール性\s*換気機能障害/g, replacement: 'アルコール性肝機能障害', desc: '肝機能障害' },
  { pattern: /換気機能障害/g, replacement: '肝機能障害', desc: '肝機能障害' },
  { pattern: /かんきのうしょうがい/g, replacement: '肝機能障害', desc: '肝機能障害' },
  { pattern: /かんこうへん/g, replacement: '肝硬変', desc: '肝硬変' },
  { pattern: /脂肪間/g, replacement: '脂肪肝', desc: '脂肪肝' },
  { pattern: /胆石称/g, replacement: '胆石症', desc: '胆石症' },
  { pattern: /たんせきしょう/g, replacement: '胆石症', desc: '胆石症' },
  { pattern: /すいえん/g, replacement: '膵炎', desc: '膵炎' },

  // 診察所見・カルテ用語
  { pattern: /身体初見/g, replacement: '身体所見', desc: '身体所見' },
  { pattern: /検査初見/g, replacement: '検査所見', desc: '検査所見' },
  { pattern: /心電図初見/g, replacement: '心電図所見', desc: '心電図所見' },
  { pattern: /内視鏡初見/g, replacement: '内視鏡所見', desc: '内視鏡所見' },
  { pattern: /エコー初見/g, replacement: 'エコー所見', desc: 'エコー所見' },
  { pattern: /画像初見/g, replacement: '画像所見', desc: '画像所見' },
  { pattern: /特記初見/g, replacement: '特記所見', desc: '特記所見' },
  { pattern: /臨床初見/g, replacement: '臨床所見', desc: '臨床所見' },
  { pattern: /特記事項初見/g, replacement: '特記事項所見', desc: '特記事項所見' },

  // 循環器・症候
  { pattern: /大導寺|大どうじ|たいどうじ/g, replacement: '体動時', desc: '体動時' },
  { pattern: /全協部|前協部|ぜんきょうぶ/g, replacement: '前胸部', desc: '前胸部' },
  { pattern: /胸部あっぱくかん/g, replacement: '胸部圧迫感', desc: '胸部圧迫感' },
  { pattern: /こうはいぶつう/g, replacement: '後背部痛', desc: '後背部痛' },
  { pattern: /背部通/g, replacement: '背部痛', desc: '背部痛' },
  { pattern: /放射痛|ほうさんつう/g, replacement: '放散痛', desc: '放散痛' },
  { pattern: /きょうぶこうやくかん/g, replacement: '胸部絞扼感', desc: '胸部絞扼感' },
  { pattern: /きょうぶこうやくつう/g, replacement: '胸部絞扼痛', desc: '胸部絞扼痛' },
  { pattern: /しんざつおんなし/g, replacement: '心雑音なし', desc: '心雑音なし' },
  { pattern: /しんおんじゅん/g, replacement: '心音純', desc: '心音純' },
  { pattern: /しんおんせい/g, replacement: '心音整', desc: '心音整' },
  { pattern: /きそくただしい/g, replacement: '規則正しい', desc: '規則正しい' },
  { pattern: /きざこきゅう/g, replacement: '起坐呼吸', desc: '起坐呼吸' },
  { pattern: /かたいふしゅ/g, replacement: '下腿浮腫', desc: '下腿浮腫' },
  { pattern: /かたいふしゅなし/g, replacement: '下腿浮腫なし', desc: '下腿浮腫なし' },

  // 内視鏡・消化器
  { pattern: /観桜病変|かんおうびょうへん/g, replacement: '陥凹病変', desc: '陥凹病変' },
  { pattern: /不整観桜|ふせいかんおう/g, replacement: '不整陥凹', desc: '不整陥凹' },
  { pattern: /協会明瞭|きょうかいめいりょう/g, replacement: '境界明瞭', desc: '境界明瞭' },
  { pattern: /協会不明瞭|きょうかいふめいりょう/g, replacement: '境界不明瞭', desc: '境界不明瞭' },
  { pattern: /前提部|ぜんていぶ/g, replacement: '前庭部', desc: '前庭部' },
  { pattern: /威嚇部|いかくぶ/g, replacement: '胃角部', desc: '胃角部' },
  { pattern: /いうもんぶ/g, replacement: '幽門部', desc: '幽門部' },
  { pattern: /ふんもんぶ/g, replacement: '噴門部', desc: '噴門部' },
  { pattern: /いそうぶ/g, replacement: '胃底部', desc: '胃底部' },
  { pattern: /たいぶしょうわん/g, replacement: '体部小弯', desc: '体部小弯' },
  { pattern: /たいぶだいわん/g, replacement: '体部大弯', desc: '体部大弯' },
  { pattern: /びらんせいいえん/g, replacement: 'びらん性胃炎', desc: 'びらん性胃炎' },

  // 呼吸器・感染症
  { pattern: /呼吸空|こきゅうくう/g, replacement: '呼吸苦', desc: '呼吸苦' },
  { pattern: /こきゅうこんなん/g, replacement: '呼吸困難', desc: '呼吸困難' },
  { pattern: /こきゅうこんなんかん/g, replacement: '呼吸困難感', desc: '呼吸困難感' },
  { pattern: /咽頭ほっせき/g, replacement: '咽頭発赤', desc: '咽頭発赤' },
  { pattern: /いんとうほっせき/g, replacement: '咽頭発赤', desc: '咽頭発赤' },
  { pattern: /扁桃はくたい|へんとうはくたい/g, replacement: '扁桃白苔', desc: '扁桃白苔' },
  { pattern: /扁桃はくたいなし/g, replacement: '扁桃白苔なし', desc: '扁桃白苔なし' },
  { pattern: /頸部リンパ節しゅちょう/g, replacement: '頸部リンパ節腫脹', desc: '頸部リンパ節腫脹' },
  { pattern: /けいぶりんぱせつしゅちょう/g, replacement: '頸部リンパ節腫脹', desc: '頸部リンパ節腫脹' },
  { pattern: /リンパ節主張/g, replacement: 'リンパ節腫脹', desc: 'リンパ節腫脹' },
  { pattern: /呼吸音せい/g, replacement: '呼吸音清', desc: '呼吸音清' },
  { pattern: /こきゅうおんせい/g, replacement: '呼吸音清', desc: '呼吸音清' },
  { pattern: /ラ音聴取せず|らおんちょうしゅせず/g, replacement: 'ラ音聴取せず', desc: 'ラ音聴取せず' },
  { pattern: /しっせいらおん/g, replacement: '湿性ラ音', desc: '湿性ラ音' },
  { pattern: /かんせいらおん/g, replacement: '乾性ラ音', desc: '乾性ラ音' },
  { pattern: /ばちゆび/g, replacement: 'バチ状指', desc: 'バチ状指' },

  // 一般診療・用法
  { pattern: /真移植後|まいしょくご/g, replacement: '毎食後', desc: '毎食後' },
  { pattern: /あさしょくご/g, replacement: '朝食後', desc: '朝食後' },
  { pattern: /ゆうしょくご/g, replacement: '夕食後', desc: '夕食後' },
  { pattern: /ちゅうしょくご/g, replacement: '昼食後', desc: '昼食後' },
  { pattern: /しょくぜん/g, replacement: '食前', desc: '食前' },
  { pattern: /しょくかん/g, replacement: '食間', desc: '食間' },
  { pattern: /しゅうしんぜん/g, replacement: '就寝前', desc: '就寝前' },
  { pattern: /ねるまえ/g, replacement: '就寝前', desc: '就寝前' },
  { pattern: /とんぷく|とんよう/g, replacement: '頓用', desc: '頓用' },
  { pattern: /はつねつあり/g, replacement: '発熱あり', desc: '発熱あり' },
  { pattern: /せきあり/g, replacement: '咳嗽あり', desc: '咳嗽あり' },
  { pattern: /たんあり/g, replacement: '喀痰あり', desc: '喀痰あり' },
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
  const bpRegex1 = /(?:BP|ビーピー|血圧|けつあつ)[:：\s]*([0-9]{2,3})\s*(?:の|対|\/|\s)\s*([0-9]{2,3})(?:\s*ミリ|mmHg)?/gi;
  result = result.replace(bpRegex1, (_match, sys, dia) => {
    const formatted = `BP ${sys}/${dia} mmHg`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // HR / PR: 脈拍 / 心拍 / ハートレート / パルス
  const hrRegex = /(?:HR|PR|心拍数?|脈拍数?|ハートレート|パルス)[:：\s]*([0-9]{2,3})(?:\s*回|回\/分|bpm)?(?:\s*(整|不整|せい|ふせい))?/gi;
  result = result.replace(hrRegex, (_match, rate, rhythm) => {
    const rhythmStr = rhythm ? (rhythm === 'ふせい' || rhythm === '不整' ? ' (不整)' : ' (整)') : '';
    const formatted = `HR ${rate} bpm${rhythmStr}`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // SpO2: サチュレーション / エスピーオーツー
  const spo2Regex = /(?:SpO2|エスピーオーツー|サチュレーション|サツ)[:：\s]*([0-9]{2,3})\s*(?:%|パーセント)?(?:\s*(?:ルームエアー?|へいや|ルーム|room|ra))?/gi;
  result = result.replace(spo2Regex, (_match, val) => {
    const hasRoom = /(?:ルーム|へいや|room|ra)/i.test(_match);
    const formatted = hasRoom ? `SpO2 ${val}% (room air)` : `SpO2 ${val}%`;
    corrections.push({ original: _match, corrected: formatted, category: 'vital' });
    return formatted;
  });

  // BT: 体温 / ビーティー / ボディテンパー
  const btRegex = /(?:BT|ビーティー|体温|たいおん)[:：\s]*([0-9]{2})(?:度|\.|\s)([0-9])(?:分|度|℃)?/gi;
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

  // 4. 音声認識特有の誤字・同音異義語の補正
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
