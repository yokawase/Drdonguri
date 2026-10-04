import React from 'react';
import { playSosumi, playMacBeep, playTrashSound, triggerMacScreenFlash } from '../utils/macAudio';

interface MacBombDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmRestart: () => void;
  title?: string;
  message?: string;
  errorCode?: string;
}

export const MacBombDialog: React.FC<MacBombDialogProps> = ({
  isOpen,
  onClose,
  onConfirmRestart,
  title = 'カルテ内容の全消去 (Empty Trash)',
  message = '入力中のカルテテキストをすべて消去してゴミ箱を空にしますか？\n消去されたテキストは元に戻せません。',
  errorCode = 'ID = 02 (Address Error)',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[420px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-4 text-xs select-none"
        style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
      >
        <div className="flex items-start gap-4 mb-4">
          {/* System 7 伝統の爆弾アイコン (Bomb bitmap) */}
          <div className="w-12 h-12 border-2 border-black bg-white flex flex-col items-center justify-center shadow-[1px_1px_0_#000] shrink-0 p-1">
            <div className="text-2xl leading-none">💣</div>
            <div className="text-[8px] font-bold mt-0.5">ALERT</div>
          </div>

          <div className="space-y-1.5 flex-1">
            <div className="font-bold text-sm text-black">{title}</div>
            <div className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap">
              {message}
            </div>
            <div className="text-[9px] font-mono text-gray-500 pt-1">
              エラーコード: {errorCode}
            </div>
          </div>
        </div>

        {/* ボタン列 (System 7 伝統のダブルボーダーデフォルトボタン) */}
        <div className="flex items-center justify-end gap-3 border-t border-black pt-3">
          <button
            onClick={() => {
              playMacBeep();
              onClose();
            }}
            className="px-4 py-1.5 border border-black bg-white hover:bg-black hover:text-white cursor-pointer font-medium"
          >
            キャンセル
          </button>

          <div className="p-0.5 border border-black">
            <button
              onClick={() => {
                triggerMacScreenFlash();
                playTrashSound();
                playSosumi();
                onConfirmRestart();
                onClose();
              }}
              className="px-4 py-1.5 border border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer"
            >
              消去実行 ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
