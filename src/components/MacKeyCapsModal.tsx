import React, { useState } from 'react';
import { playMacBeep, playKeyClick } from '../utils/macAudio';

interface MacKeyCapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

export const MacKeyCapsModal: React.FC<MacKeyCapsModalProps> = ({
  isOpen,
  onClose,
  onInsertText,
}) => {
  const [selectedKey, setSelectedKey] = useState<{
    keyName: string;
    hidCode: string;
    role: string;
    sample: string;
  }>({
    keyName: '変換 (Henkan)',
    hidCode: '0x8A (Windows JIS Henkan)',
    role: 'AtomS3UがWindows電子カルテ端末のIMEを「かな日本語入力モード」に確実に強制ONします (<IME_ON>)',
    sample: '<IME_ON>',
  });

  if (!isOpen) return null;

  const KEY_DEFINITIONS = [
    {
      keyName: '変換 (Henkan)',
      hidCode: '0x8A',
      role: 'AtomS3UがWindows電子カルテ端末のIMEを「かな日本語入力モード」に確実に強制ONします (<IME_ON>)',
      sample: '<IME_ON>',
    },
    {
      keyName: '無変換 (Muhenkan)',
      hidCode: '0x8B',
      role: 'AtomS3UがWindows IMEをOFFにし、患者IDや半角英数を直接生ASCII入力するモードへ切替えます (<IME_OFF>)',
      sample: '<IME_OFF>',
    },
    {
      keyName: 'Space (空白 / 変換)',
      hidCode: '0x2C (HID 44)',
      role: 'ローマ字列送出後にSpaceキーを打鍵してWindows IMEの漢字変換候補を呼び出します (<CONV>)',
      sample: 'tou nyou byou <CONV>',
    },
    {
      keyName: 'Return (確定 / 改行)',
      hidCode: '0x28 (HID 40)',
      role: '変換候補の確定（初回）およびカルテ行の改行（確定後）を行います (<ENTER>)',
      sample: '<ENTER>',
    },
    {
      keyName: 'F5 (単漢字直撃)',
      hidCode: '0x3E (HID 62)',
      role: '「嚥」「瘻」「腱」などの難読医療漢字をUnicode 4桁コード＋F5打鍵で誤変換なく1発入力します',
      sample: '<F5:54BD>',
    },
    {
      keyName: 'F7 (全角カタカナ)',
      hidCode: '0x40 (HID 64)',
      role: '薬品名や病名のカタカナ語を一発で全角カタカナに強制変換します ([F7])',
      sample: 'karute[F7][ENTER]',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[480px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-3 text-xs select-none"
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
            <span className="font-bold"> キー配列 (Key Caps DA) - JIS 109 & USB-HID</span>
          </div>
          <span className="text-[10px] text-gray-600">Desk Accessory</span>
        </div>

        {/* キーボード風ビジュアル選択 */}
        <div className="border border-black p-2 bg-slate-50 mb-3 space-y-1.5">
          <div className="text-[11px] font-bold text-gray-700">
            AtomS3U 特殊打鍵・HID制御コード一覧:
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {KEY_DEFINITIONS.map((kd) => (
              <button
                key={kd.keyName}
                onClick={() => {
                  playKeyClick();
                  setSelectedKey(kd);
                }}
                className={`p-1.5 border border-black text-center cursor-pointer ${
                  selectedKey.keyName === kd.keyName
                    ? 'bg-black text-white font-bold'
                    : 'bg-white hover:bg-slate-200 text-black'
                }`}
              >
                <div className="font-bold truncate text-[11px]">{kd.keyName}</div>
                <div className="text-[9px] font-mono opacity-80">{kd.hidCode}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 選択したキーの詳細インスペクション */}
        <div className="border border-black p-2.5 bg-white space-y-2 mb-3">
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">キー名称:</span>
            <span>{selectedKey.keyName}</span>
          </div>
          <div className="flex justify-between border-b border-black/20 pb-1">
            <span className="font-bold">生HIDコード:</span>
            <span className="font-mono">{selectedKey.hidCode}</span>
          </div>
          <div className="space-y-1">
            <div className="font-bold">医療カルテ打鍵における責務:</div>
            <div className="text-[11px] text-gray-800 leading-relaxed bg-slate-50 p-1.5 border border-black/20">
              {selectedKey.role}
            </div>
          </div>
        </div>

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
              onClick={() => {
                playMacBeep();
                onInsertText(selectedKey.sample);
                onClose();
              }}
              className="px-3 py-1 border border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer"
            >
              タグ「{selectedKey.sample}」をカルテに挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
