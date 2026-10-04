import React, { useState, useEffect, useRef } from 'react';
import { 
  triggerMacScreenFlash, 
  playMacBeep, 
  playSosumi 
} from '../utils/macAudio';
import { LATEST_FIRMWARE_VERSION } from '../data/firmwareSource';

interface MacMenuBarProps {
  activeTab: 'input' | 'dongle' | 'firmware';
  setActiveTab: (tab: 'input' | 'dongle' | 'firmware') => void;
  isBleConnected: boolean;
  isVirtualMode: boolean;
  onConnectBle: () => void;
  onToggleVirtualMode: () => void;
  onNewChart: () => void;
  onInsertSoap: () => void;
  onOpenTemplates: () => void;
  onOpenAiAssist: () => void;
  onOpenOcr: () => void;
  onOpenCds: () => void;
  onOpenImeBoost: () => void;
  onOpenPreprocessor: () => void;
  onOpenAbout: () => void;
  onOpenCalculator: () => void;
  onOpenScrapbook: () => void;
  onOpenKeyCaps: () => void;
  onOpenSoundControl: () => void;
  onOpenBombAlert: () => void;
  onTransmit: () => void;
  onPressDongleBtn: () => void;
  onWipeRam: () => void;
  onEmptyTrash: () => void;
  isMonoClassic: boolean;
  setIsMonoClassic: (mono: boolean) => void;
}

export const MacMenuBar: React.FC<MacMenuBarProps> = ({
  activeTab,
  setActiveTab,
  isBleConnected,
  isVirtualMode,
  onConnectBle,
  onToggleVirtualMode,
  onNewChart,
  onInsertSoap,
  onOpenTemplates,
  onOpenAiAssist,
  onOpenOcr,
  onOpenCds,
  onOpenImeBoost,
  onOpenPreprocessor,
  onOpenAbout,
  onOpenCalculator,
  onOpenScrapbook,
  onOpenKeyCaps,
  onOpenSoundControl,
  onOpenBombAlert,
  onTransmit,
  onPressDongleBtn,
  onWipeRam,
  onEmptyTrash,
  isMonoClassic,
  setIsMonoClassic,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const menuBarRef = useRef<HTMLDivElement>(null);

  // 時計更新 (System 7 伝統の時刻表示)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const days = ['日', '月', '火', '水', '木', '金', '土'];
      const day = days[now.getDay()];
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const secs = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${day} ${hours}:${mins}:${secs}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (name: string) => {
    setOpenMenu((prev) => (prev === name ? null : name));
  };

  const handleItemClick = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  return (
    <div
      ref={menuBarRef}
      className="sticky top-0 z-50 h-6 bg-white border-b border-black flex items-center justify-between px-2 text-xs select-none shadow-[0_1px_0_#000]"
      style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
    >
      {/* 左側: メニュー項目一覧 */}
      <div className="flex items-center gap-0">
        {/*  Apple / どんぐり マーク */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('apple')}
            className={`px-2 py-0.5 font-bold cursor-pointer flex items-center justify-center ${
              openMenu === 'apple' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            
          </button>
          {openMenu === 'apple' && (
            <div className="absolute top-6 left-0 min-w-[240px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onOpenAbout)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer font-bold"
              >
                この Mac について...
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              
              {/* Desk Accessories */}
              <button
                onClick={() => handleItemClick(onOpenCalculator)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span> 計算機 (Calculator: eGFR/BMI)</span>
                <span className="text-[10px] text-gray-500">DA</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenScrapbook)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span> スクラップブック (Scrapbook)</span>
                <span className="text-[10px] text-gray-500">DA</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenKeyCaps)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span> キー配列 (Key Caps: JIS 109)</span>
                <span className="text-[10px] text-gray-500">DA</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenSoundControl)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span> サウンド操作盤 (Control Panel)</span>
                <span className="text-[10px] text-gray-500">DA</span>
              </button>

              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => setActiveTab('input'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                カルテ作成・送信 (SendText)
              </button>
              <button
                onClick={() => handleItemClick(() => setActiveTab('dongle'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                どんぐり君 (AtomS3U) インスペクター
              </button>
              <button
                onClick={() => handleItemClick(() => setActiveTab('firmware'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                ファームウェア {LATEST_FIRMWARE_VERSION}
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() =>
                  handleItemClick(() => {
                    playSosumi();
                    triggerMacScreenFlash();
                  })
                }
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                ビープ音と画面フラッシュ
              </button>
            </div>
          )}
        </div>

        {/* ファイル (File) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('file')}
            className={`px-2 py-0.5 cursor-pointer ${
              openMenu === 'file' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            ファイル
          </button>
          {openMenu === 'file' && (
            <div className="absolute top-6 left-0 min-w-[200px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onNewChart)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>新規カルテ</span>
                <span className="text-[10px]">⌘N</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenTemplates)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>テンプレートを開く...</span>
                <span className="text-[10px]">⌘T</span>
              </button>
              <button
                onClick={() => handleItemClick(onTransmit)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between font-bold"
              >
                <span>カルテ送信 (Transmit)</span>
                <span className="text-[10px]">⌘↩</span>
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => window.print())}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>印刷...</span>
                <span className="text-[10px]">⌘P</span>
              </button>
              <button
                onClick={() => handleItemClick(onEmptyTrash)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                入力内容をゴミ箱へ消去
              </button>
            </div>
          )}
        </div>

        {/* 編集 (Edit) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('edit')}
            className={`px-2 py-0.5 cursor-pointer ${
              openMenu === 'edit' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            編集
          </button>
          {openMenu === 'edit' && (
            <div className="absolute top-6 left-0 min-w-[180px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(() => document.execCommand('undo'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>元に戻す</span>
                <span className="text-[10px]">⌘Z</span>
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => document.execCommand('cut'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>カット</span>
                <span className="text-[10px]">⌘X</span>
              </button>
              <button
                onClick={() => handleItemClick(() => document.execCommand('copy'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>コピー</span>
                <span className="text-[10px]">⌘C</span>
              </button>
              <button
                onClick={() => handleItemClick(() => document.execCommand('paste'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>ペースト</span>
                <span className="text-[10px]">⌘V</span>
              </button>
              <button
                onClick={() => handleItemClick(() => document.execCommand('selectAll'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>すべて選択</span>
                <span className="text-[10px]">⌘A</span>
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(onEmptyTrash)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                カルテ全消去 (Clear)
              </button>
            </div>
          )}
        </div>

        {/* カルテ (Chart) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('chart')}
            className={`px-2 py-0.5 cursor-pointer font-medium ${
              openMenu === 'chart' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            カルテ
          </button>
          {openMenu === 'chart' && (
            <div className="absolute top-6 left-0 min-w-[240px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onInsertSoap)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer font-bold"
              >
                SOAP形式雛形を挿入
              </button>
              <button
                onClick={() => handleItemClick(onOpenAiAssist)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span>AI カルテ校正 (Desk Accessory)</span>
                <span className="text-[10px] bg-black text-white px-1">AI</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenOcr)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span>カメラ OCR 読取 (Desk Accessory)</span>
                <span className="text-[10px]">📷</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenCds)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex items-center justify-between"
              >
                <span>臨床判断支援 CDS (High Value Care)</span>
                <span className="text-[10px]">⚖</span>
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(onOpenImeBoost)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                IME 高精度コンパイラ設定...
              </button>
              <button
                onClick={() => handleItemClick(onOpenPreprocessor)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                医療用語・処方プリプロセッサ...
              </button>
            </div>
          )}
        </div>

        {/* どんぐり君 (Dongle) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('dongle')}
            className={`px-2 py-0.5 cursor-pointer font-medium ${
              openMenu === 'dongle' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            どんぐり君
          </button>
          {openMenu === 'dongle' && (
            <div className="absolute top-6 left-0 min-w-[240px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onConnectBle)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer font-bold flex justify-between"
              >
                <span>{isBleConnected ? '実機 BLE 切断' : '実機 BLE 接続 (AtomS3U)'}</span>
                <span>{isBleConnected ? '●' : '○'}</span>
              </button>
              <button
                onClick={() => handleItemClick(onToggleVirtualMode)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>仮想シミュレータ動作</span>
                <span>{isVirtualMode ? '✓' : ''}</span>
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(onPressDongleBtn)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                本体正面ボタン押下 (打鍵トリガー)
              </button>
              <button
                onClick={() => handleItemClick(onWipeRam)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer text-red-600 font-bold"
              >
                メモリ完全消去 (Wipe RAM)
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => setActiveTab('dongle'))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                どんぐり君コンソールを開く
              </button>
            </div>
          )}
        </div>

        {/* 特別 (Special) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('special')}
            className={`px-2 py-0.5 cursor-pointer ${
              openMenu === 'special' ? 'bg-black text-white' : 'hover:bg-black hover:text-white'
            }`}
          >
            特別
          </button>
          {openMenu === 'special' && (
            <div className="absolute top-6 left-0 min-w-[210px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onOpenBombAlert)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer font-bold flex justify-between"
              >
                <span>💣 爆弾アラート (Bomb Dialog)</span>
                <span className="text-[10px]">ID=02</span>
              </button>
              <button
                onClick={() =>
                  handleItemClick(() => {
                    triggerMacScreenFlash();
                    playMacBeep();
                  })
                }
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                画面フラッシュ & ビープ
              </button>
              <button
                onClick={() => handleItemClick(() => playSosumi())}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                Sosumi サウンド再生
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => setIsMonoClassic(!isMonoClassic))}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>Classic II 1ビット白黒モード</span>
                <span>{isMonoClassic ? '✓' : ''}</span>
              </button>
              <button
                onClick={() => handleItemClick(onEmptyTrash)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                ゴミ箱を空にする (Empty Trash)
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(() => window.location.reload())}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                再起動 (Restart)...
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 右側: アプリ名 ＆ 時計 ＆ BLEステータス */}
      <div className="flex items-center gap-3">
        {/* 実機BLE接続インジケータ (1-bit Mac style) */}
        <div className="hidden sm:flex items-center gap-1.5 border border-black px-1.5 py-0.2 bg-white">
          <span className="text-[10px]">
            {isBleConnected ? 'BLE: 実機接続中' : isVirtualMode ? 'BLE: 仮想シミュレータ' : 'BLE: 待機中'}
          </span>
          <span
            className={`w-2 h-2 rounded-full border border-black ${
              isBleConnected ? 'bg-black' : isVirtualMode ? 'bg-white' : 'bg-transparent'
            }`}
          />
        </div>

        {/* アクティブアプリ (Macintosh右上アイコン) */}
        <div className="flex items-center gap-1">
          <span className="font-bold hidden md:inline">DrVoice</span>
          <span className="text-sm">🌰</span>
        </div>

        {/* System 7 ライブクロック */}
        <div className="font-mono text-[11px] tracking-tight pl-1 border-l border-black">
          {currentTime || '12:00:00'}
        </div>
      </div>
    </div>
  );
};
