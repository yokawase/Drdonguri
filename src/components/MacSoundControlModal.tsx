import React from 'react';
import { 
  playMacBeep, 
  playSosumi, 
  playStartupChime, 
  playWildEep, 
  playQuack, 
  playTrashSound, 
  playKeyClick,
  triggerMacScreenFlash 
} from '../utils/macAudio';

interface MacSoundControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MacSoundControlModal: React.FC<MacSoundControlModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const SOUND_LIST = [
    { name: 'Simple Beep', desc: '750Hz 矩形波・高速減衰 (Macintosh 伝統のビープ音)', play: playMacBeep },
    { name: 'Sosumi', desc: 'Jim Reekes氏が作曲した名作コード (D5-A5-D6)', play: playSosumi },
    { name: 'Startup Chime', desc: 'クラシック Macintosh 起動音 (C Major 9th コード)', play: playStartupChime },
    { name: 'Wild Eep', desc: 'ピッチベンド・ノスタルジックアラート音', play: playWildEep },
    { name: 'Quack', desc: '愛嬌のあるカモの鳴き声風アラート音', play: playQuack },
    { name: 'Trash Crumple', desc: '紙くずをゴミ箱に丸めて捨てる音', play: playTrashSound },
    { name: 'Key Clack', desc: 'メカニカルキーボード打鍵音', play: playKeyClick },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-[1px]">
      <div
        className="w-full max-w-[400px] bg-white border-2 border-black shadow-[4px_4px_0_#000] p-3 text-xs select-none"
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
            <span className="font-bold"> サウンド操作盤 (Sound Control Panel)</span>
          </div>
          <span className="text-[10px] text-gray-600">Control Panel</span>
        </div>

        <div className="mb-2 text-[11px] text-gray-700">
          Macintosh Classic II / System 7 伝統の警告音テスト:
        </div>

        {/* サウンド一覧リスト */}
        <div className="border border-black bg-white p-1 space-y-1 mb-3 max-h-60 overflow-y-auto shadow-inner">
          {SOUND_LIST.map((snd) => (
            <div
              key={snd.name}
              className="flex items-center justify-between p-1.5 border border-black/20 hover:border-black hover:bg-slate-100 transition-colors"
            >
              <div>
                <div className="font-bold">{snd.name}</div>
                <div className="text-[10px] text-gray-600">{snd.desc}</div>
              </div>
              <button
                onClick={() => {
                  snd.play();
                }}
                className="px-2 py-0.5 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer text-[10px] shrink-0 ml-2"
              >
                再生 ▶
              </button>
            </div>
          ))}
        </div>

        {/* ビジュアルビープ (画面フラッシュ) */}
        <div className="border border-black p-2 bg-slate-50 mb-3 flex items-center justify-between">
          <div>
            <div className="font-bold">画面フラッシュ (Visual Beep)</div>
            <div className="text-[10px] text-gray-600">音が出せない夜間病棟などで画面を白黒反転</div>
          </div>
          <button
            onClick={() => {
              triggerMacScreenFlash();
              playMacBeep();
            }}
            className="px-2 py-1 border border-black bg-white hover:bg-black hover:text-white font-bold cursor-pointer text-[10px]"
          >
            テスト
          </button>
        </div>

        {/* 下部閉じるボタン */}
        <div className="flex justify-end border-t border-black pt-2">
          <div className="p-0.5 border border-black">
            <button
              onClick={() => {
                playMacBeep();
                onClose();
              }}
              className="px-4 py-1 border border-black bg-black text-white hover:bg-gray-800 font-bold cursor-pointer"
            >
              閉じる ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
