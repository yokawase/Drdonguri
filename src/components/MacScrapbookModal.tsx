import React, { useState } from 'react';
import { playMacBeep, playKeyClick } from '../utils/macAudio';

interface MacScrapbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

interface ScrapbookItem {
  id: string;
  title: string;
  category: string;
  content: string;
}

const DEFAULT_SCRAPS: ScrapbookItem[] = [
  {
    id: '1',
    title: '頭頚部・胸部 正常所見',
    category: '身体診察 (PE)',
    content: 
      `【身体所見】\n` +
      `眼瞼結膜: 貧血なし、眼球結膜: 黄疸なし\n` +
      `咽頭発赤: なし、扁桃腫大: なし\n` +
      `頸部リンパ節: 触知せず\n` +
      `胸部: 心音整 (心雑音なし), 呼吸音清 (ラ音なし)\n` +
      `腹部: 平坦・軟、圧痛なし、筋性防御なし、腸雑音正常`,
  },
  {
    id: '2',
    title: '上気道炎・急性感冒セット',
    category: '急性期内科',
    content:
      `【S】数日前からの咽頭痛、鼻汁、乾性咳嗽。発熱37.4℃。\n` +
      `【O】咽頭軽度発赤あり、扁桃発赤・白苔なし。呼吸音清。\n` +
      `【A】急性上気道炎 (Common Cold)\n` +
      `【P】対症療法。\n` +
      `・アセトアミノフェン錠500mg 1回1錠 疼痛時 (最大1日3回)\n` +
      `・トラネキサム酸錠250mg 1回1錠 毎食後 5日分\n` +
      `高熱や呼吸苦出現時は再受診を指示。`,
  },
  {
    id: '3',
    title: '2型糖尿病 定期再診チェック',
    category: '慢性期疾患',
    content:
      `【S】口渇・多飲・多尿なし。低血糖症状なし。食事療法遵守。\n` +
      `【O】BP: 126/78 mmHg, HR: 72 bpm, BW: 64.2 kg\n` +
      `HbA1c: 6.8%, 空腹時血糖: 118 mg/dL, eGFR: 68.2 mL/min\n` +
      `足背動脈拍動良好、アキレス腱反射保たれる。\n` +
      `【A】2型糖尿病 (良好な血糖コントロール維持)\n` +
      `【P】現行処方継続。次回4週後再診、眼科受診状況確認。`,
  },
  {
    id: '4',
    title: '胸部X線 / 心電図 読影定型',
    category: '検査所見',
    content:
      `【検査所見】\n` +
      `・胸部単純X線 (立位PA): CTR 48%、肺野に明らかな活動性浸潤影・無気肺なし。肋骨横隔膜角(CP angle)鋭角、胸水貯留なし。\n` +
      `・12誘導心電図: Normal Sinus Rhythm (HR 68 bpm), 異常Q波なし, ST-T変化なし, QT延長なし。`,
  },
  {
    id: '5',
    title: '高血圧症 初診アセスメント',
    category: '循環器',
    content:
      `【S】健診で血圧高値を指摘され来院。頭痛・めまい・動悸なし。\n` +
      `【O】診察室血圧 152/94 mmHg (2回測定平均), HR 76 整\n` +
      `【A】本態性高血圧症 (初診未治療)\n` +
      `【P】\n` +
      `1. 家庭血圧測定の指示 (起床時・就寝前の1日2回記録手帳交付)\n` +
      `2. 減塩指導 (食塩6g/日未満目標)、有酸素運動推奨\n` +
      `3. 採血(生化・脂質・腎機能・尿検査)施行、2週後に再評価。`,
  },
  {
    id: '6',
    title: '指導管理料・生活習慣病療養計画',
    category: '指導管理',
    content:
      `【生活習慣病療養計画・指導】\n` +
      `病名: 脂質異常症・高血圧症\n` +
      `目標: LDL-C < 120 mg/dL、家庭血圧 < 125/75 mmHg\n` +
      `達成度: 食事運動療法継続中、体重横ばい、服薬アドヒアランス良好。\n` +
      `患者に病態と生活習慣改善の重要性を説明し療養計画書に同意受領。`,
  },
];

export const MacScrapbookModal: React.FC<MacScrapbookModalProps> = ({
  isOpen,
  onClose,
  onInsertText,
}) => {
  const [items, setItems] = useState<ScrapbookItem[]>(DEFAULT_SCRAPS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  if (!isOpen) return null;

  const currentItem = items[currentIndex] || items[0];

  const handlePrev = () => {
    playKeyClick();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const handleNext = () => {
    playKeyClick();
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  const handleInsert = () => {
    playMacBeep();
    if (currentItem) {
      onInsertText(currentItem.content + '\n');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[460px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-3 text-xs select-none"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        {/* タイトルバー */}
        <div className="flex items-center justify-between border-b border-black pb-2 mb-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="w-3.5 h-3.5 border border-black bg-white hover:bg-black hover:text-white flex items-center justify-center font-bold text-[9px] cursor-pointer"
              title="閉じる"
            >
              ×
            </button>
            <span className="font-bold"> スクラップブック (Scrapbook DA)</span>
          </div>
          <span className="text-[10px] text-gray-600">
            {currentIndex + 1} / {items.length}
          </span>
        </div>

        {/* ページめくりコントロール */}
        <div className="flex items-center justify-between border border-black bg-slate-50 px-2 py-1 mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="px-2 py-0.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              title="前のスクラップ"
            >
              ◀ 前
            </button>
            <button
              onClick={handleNext}
              className="px-2 py-0.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              title="次のスクラップ"
            >
              次 ▶
            </button>
          </div>
          <div className="font-bold truncate max-w-[240px]">
            [{currentItem.category}] {currentItem.title}
          </div>
        </div>

        {/* スクラップ本文プレビュー */}
        <div className="border border-black bg-white p-2.5 mb-3 h-52 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed shadow-inner">
          {currentItem.content}
        </div>

        {/* 下部アクションボタン */}
        <div className="flex items-center justify-between border-t border-black pt-2">
          <button
            onClick={() => {
              playMacBeep();
              onClose();
            }}
            className="px-3 py-1 border border-black bg-white hover:bg-black hover:text-white cursor-pointer"
          >
            閉じる
          </button>
          <div className="p-0.5 border border-black">
            <button
              onClick={handleInsert}
              className="px-4 py-1 border border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer"
            >
              カルテに貼り付け ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
