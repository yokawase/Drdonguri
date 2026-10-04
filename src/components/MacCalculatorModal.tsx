import React, { useState } from 'react';
import { playMacBeep, playKeyClick } from '../utils/macAudio';

interface MacCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

export const MacCalculatorModal: React.FC<MacCalculatorModalProps> = ({
  isOpen,
  onClose,
  onInsertText,
}) => {
  // モード: 普通電卓 / eGFR / BMI / Ccr
  const [calcMode, setCalcMode] = useState<'standard' | 'egfr' | 'bmi' | 'ccr'>('standard');

  // 普通電卓のステート
  const [display, setDisplay] = useState<string>('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);

  // 臨床計算ステート
  const [age, setAge] = useState<number>(65);
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [cr, setCr] = useState<number>(0.9);
  const [height, setHeight] = useState<number>(165);
  const [weight, setWeight] = useState<number>(60);

  if (!isOpen) return null;

  // 普通電卓のロジック
  const handleDigit = (digit: string) => {
    playKeyClick();
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const handleDecimal = () => {
    playKeyClick();
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOp = (nextOp: string) => {
    playMacBeep();
    const inputValue = parseFloat(display);
    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (op) {
      const current = prevValue;
      let newValue = current;
      if (op === '+') newValue = current + inputValue;
      else if (op === '-') newValue = current - inputValue;
      else if (op === '×' || op === '*') newValue = current * inputValue;
      else if (op === '÷' || op === '/') newValue = inputValue !== 0 ? current / inputValue : 0;
      setPrevValue(newValue);
      setDisplay(String(Number(newValue.toFixed(6))));
    }
    setWaitingForOperand(true);
    setOp(nextOp);
  };

  const handleEqual = () => {
    playMacBeep();
    if (op === null || prevValue === null) return;
    const inputValue = parseFloat(display);
    let result = prevValue;
    if (op === '+') result = prevValue + inputValue;
    else if (op === '-') result = prevValue - inputValue;
    else if (op === '×' || op === '*') result = prevValue * inputValue;
    else if (op === '÷' || op === '/') result = inputValue !== 0 ? prevValue / inputValue : 0;
    
    setDisplay(String(Number(result.toFixed(6))));
    setPrevValue(null);
    setOp(null);
    setWaitingForOperand(true);
  };

  const handleClear = () => {
    playMacBeep();
    setDisplay('0');
    setPrevValue(null);
    setOp(null);
    setWaitingForOperand(false);
  };

  // eGFR計算 (日本腎臓学会推算式)
  // 男性: 194 × Cr^(-1.094) × Age^(-0.287)
  // 女性: 194 × Cr^(-1.094) × Age^(-0.287) × 0.739
  const calcEgfr = (): { egfr: number; stage: string } => {
    if (cr <= 0 || age <= 0) return { egfr: 0, stage: '判定不能' };
    const base = 194 * Math.pow(cr, -1.094) * Math.pow(age, -0.287);
    const finalVal = gender === 'female' ? base * 0.739 : base;
    const rounded = Math.round(finalVal * 10) / 10;
    
    let stage = 'G1: 正常/高値 (>=90)';
    if (rounded < 15) stage = 'G5: 末期腎不全 (<15)';
    else if (rounded < 30) stage = 'G4: 高度低下 (15-29)';
    else if (rounded < 45) stage = 'G3b: 中等度〜高度低下 (30-44)';
    else if (rounded < 60) stage = 'G3a: 軽度〜中等度低下 (45-59)';
    else if (rounded < 90) stage = 'G2: 正常または軽度低下 (60-89)';

    return { egfr: rounded, stage };
  };

  // BMI計算
  const calcBmi = (): { bmi: number; idealWeight: number; evalStr: string } => {
    const hMeter = height / 100;
    if (hMeter <= 0) return { bmi: 0, idealWeight: 0, evalStr: '判定不能' };
    const bmiVal = Math.round((weight / (hMeter * hMeter)) * 10) / 10;
    const idealW = Math.round(hMeter * hMeter * 22 * 10) / 10;

    let evalStr = '普通体重 (18.5〜25未満)';
    if (bmiVal < 18.5) evalStr = '低体重 (やせ: <18.5)';
    else if (bmiVal >= 35) evalStr = '肥満4度 (>=35)';
    else if (bmiVal >= 30) evalStr = '肥満2〜3度 (30〜35未満)';
    else if (bmiVal >= 25) evalStr = '肥満1度 (25〜30未満)';

    return { bmi: bmiVal, idealWeight: idealW, evalStr };
  };

  // Cockcroft-Gault Ccr計算
  // 男性: (140 - Age) * Weight / (72 * Cr)
  // 女性: 男性 * 0.85
  const calcCcr = (): number => {
    if (cr <= 0) return 0;
    const val = ((140 - age) * weight) / (72 * cr);
    const finalVal = gender === 'female' ? val * 0.85 : val;
    return Math.round(finalVal * 10) / 10;
  };

  // カルテへ転送
  const handleInsertClinicalResult = () => {
    playMacBeep();
    if (calcMode === 'standard') {
      onInsertText(`【計算結果】 ${display}\n`);
    } else if (calcMode === 'egfr') {
      const { egfr, stage } = calcEgfr();
      onInsertText(
        `【腎機能評価】\n` +
        `年齢: ${age}歳 (${gender === 'male' ? '男性' : '女性'}), 血清Cr: ${cr} mg/dL\n` +
        `eGFR: ${egfr} mL/min/1.73m² (CKD病期: ${stage})\n`
      );
    } else if (calcMode === 'bmi') {
      const { bmi, idealWeight, evalStr } = calcBmi();
      onInsertText(
        `【体格指標 (BMI)】\n` +
        `身長: ${height} cm, 体重: ${weight} kg\n` +
        `BMI: ${bmi} kg/m² (${evalStr}), 標準体重(BMI22): ${idealWeight} kg\n`
      );
    } else if (calcMode === 'ccr') {
      const ccr = calcCcr();
      onInsertText(
        `【クレアチニンクリアランス推算 (Cockcroft-Gault)】\n` +
        `年齢: ${age}歳, 体重: ${weight} kg, 血清Cr: ${cr} mg/dL (${gender === 'male' ? '男性' : '女性'})\n` +
        `推算Ccr: ${ccr} mL/min\n`
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[340px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-3 text-xs select-none"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        {/* System 7 タイトルバー */}
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
            <span className="font-bold"> 計算機 (Calculator DA)</span>
          </div>
          <span className="text-[10px] text-gray-600">Desk Accessory</span>
        </div>

        {/* タブ切替 */}
        <div className="grid grid-cols-4 gap-1 mb-2 border-b border-black pb-1.5 text-[10px]">
          <button
            onClick={() => {
              playMacBeep();
              setCalcMode('standard');
            }}
            className={`py-0.5 text-center cursor-pointer border border-black ${
              calcMode === 'standard' ? 'bg-black text-white font-bold' : 'bg-white hover:bg-slate-100'
            }`}
          >
            普通電卓
          </button>
          <button
            onClick={() => {
              playMacBeep();
              setCalcMode('egfr');
            }}
            className={`py-0.5 text-center cursor-pointer border border-black ${
              calcMode === 'egfr' ? 'bg-black text-white font-bold' : 'bg-white hover:bg-slate-100'
            }`}
          >
            eGFR
          </button>
          <button
            onClick={() => {
              playMacBeep();
              setCalcMode('bmi');
            }}
            className={`py-0.5 text-center cursor-pointer border border-black ${
              calcMode === 'bmi' ? 'bg-black text-white font-bold' : 'bg-white hover:bg-slate-100'
            }`}
          >
            BMI
          </button>
          <button
            onClick={() => {
              playMacBeep();
              setCalcMode('ccr');
            }}
            className={`py-0.5 text-center cursor-pointer border border-black ${
              calcMode === 'ccr' ? 'bg-black text-white font-bold' : 'bg-white hover:bg-slate-100'
            }`}
          >
            Ccr
          </button>
        </div>

        {/* 1. 普通電卓モード */}
        {calcMode === 'standard' && (
          <div>
            {/* 1ビット液晶ディスプレイ */}
            <div className="border-2 border-black bg-white p-2 mb-2 text-right font-mono text-xl font-bold tracking-wider overflow-x-auto shadow-inner">
              {display}
            </div>

            {/* ボタン配列 */}
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              <button
                onClick={handleClear}
                className="col-span-2 py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                C (Clear)
              </button>
              <button
                onClick={() => handleOp('÷')}
                className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                ÷
              </button>
              <button
                onClick={() => handleOp('×')}
                className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                ×
              </button>

              {['7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => handleOp('-')}
                className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                -
              </button>

              {['4', '5', '6'].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => handleOp('+')}
                className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                +
              </button>

              {['1', '2', '3'].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
                >
                  {d}
                </button>
              ))}
              <button
                onClick={handleEqual}
                className="row-span-2 py-1.5 border-2 border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer flex items-center justify-center text-base"
              >
                =
              </button>

              <button
                onClick={() => handleDigit('0')}
                className="col-span-2 py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                0
              </button>
              <button
                onClick={handleDecimal}
                className="py-1.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer"
              >
                .
              </button>
            </div>
          </div>
        )}

        {/* 2. 臨床 eGFR 計算機 */}
        {calcMode === 'egfr' && (
          <div className="space-y-2 mb-3">
            <div className="border border-black p-2 space-y-1.5 bg-slate-50 text-[11px]">
              <div className="flex justify-between items-center">
                <span>性別:</span>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={gender === 'male'}
                      onChange={() => setGender('male')}
                    />
                    <span>男性</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={gender === 'female'}
                      onChange={() => setGender('female')}
                    />
                    <span>女性</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span>年齢 (歳):</span>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="w-16 border border-black px-1 py-0.5 text-right bg-white"
                />
              </div>

              <div className="flex justify-between items-center">
                <span>血清Cr (mg/dL):</span>
                <input
                  type="number"
                  step="0.01"
                  value={cr}
                  onChange={(e) => setCr(Number(e.target.value))}
                  className="w-16 border border-black px-1 py-0.5 text-right bg-white font-bold"
                />
              </div>
            </div>

            {/* 結果サマリー */}
            {(() => {
              const { egfr, stage } = calcEgfr();
              return (
                <div className="border-2 border-black p-2 bg-white text-center">
                  <div className="text-[10px] text-gray-600">推算糸球体濾過量 (eGFR)</div>
                  <div className="text-2xl font-bold font-mono my-0.5">{egfr}</div>
                  <div className="text-[10px] text-gray-500">mL/min/1.73m²</div>
                  <div className="border-t border-black/30 mt-1 pt-1 font-bold text-[11px] text-black">
                    {stage}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* 3. BMI 計算機 */}
        {calcMode === 'bmi' && (
          <div className="space-y-2 mb-3">
            <div className="border border-black p-2 space-y-1.5 bg-slate-50 text-[11px]">
              <div className="flex justify-between items-center">
                <span>身長 (cm):</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                  className="w-16 border border-black px-1 py-0.5 text-right bg-white"
                />
              </div>
              <div className="flex justify-between items-center">
                <span>体重 (kg):</span>
                <input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                  className="w-16 border border-black px-1 py-0.5 text-right bg-white font-bold"
                />
              </div>
            </div>

            {(() => {
              const { bmi, idealWeight, evalStr } = calcBmi();
              return (
                <div className="border-2 border-black p-2 bg-white text-center">
                  <div className="text-[10px] text-gray-600">Body Mass Index (BMI)</div>
                  <div className="text-2xl font-bold font-mono my-0.5">{bmi}</div>
                  <div className="text-[10px] text-gray-500">kg/m² (標準: {idealWeight} kg)</div>
                  <div className="border-t border-black/30 mt-1 pt-1 font-bold text-[11px]">
                    {evalStr}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* 4. Ccr (Cockcroft-Gault) */}
        {calcMode === 'ccr' && (
          <div className="space-y-2 mb-3">
            <div className="border border-black p-2 space-y-1.5 bg-slate-50 text-[11px]">
              <div className="flex justify-between items-center">
                <span>性別 / 年齢:</span>
                <span>
                  {gender === 'male' ? '男' : '女'} / {age}歳
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>体重 / Cr:</span>
                <span>
                  {weight}kg / {cr}mg/dL
                </span>
              </div>
            </div>

            <div className="border-2 border-black p-2 bg-white text-center">
              <div className="text-[10px] text-gray-600">Cockcroft-Gault 推算Ccr</div>
              <div className="text-2xl font-bold font-mono my-0.5">{calcCcr()}</div>
              <div className="text-[10px] text-gray-500">mL/min (腎機能投与設計基準)</div>
            </div>
          </div>
        )}

        {/* 下部ボタン */}
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
              onClick={handleInsertClinicalResult}
              className="px-3 py-1 border border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer"
            >
              カルテに挿入 ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
