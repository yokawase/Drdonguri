import React, { useState, useEffect, useRef } from 'react';
import { 
  triggerMacScreenFlash, 
  playMacBeep, 
  playSosumi 
} from '../utils/macAudio';
import { LATEST_FIRMWARE_VERSION } from '../data/firmwareSource';
import { APP_VERSION } from '../version';
import { AdaptiveMode, DeviceType } from '../hooks/useAdaptiveLayout';
import { AdaptiveModeSwitcher } from './AdaptiveModeSwitcher';
import { Menu, X, Smartphone, Tablet, Monitor } from 'lucide-react';

interface MacMenuBarProps {
  activeTab: 'input' | 'dongle' | 'firmware';
  setActiveTab: (tab: 'input' | 'dongle' | 'firmware') => void;
  isBleConnected: boolean;
  isVirtualMode: boolean;
  onConnectBle: () => void;
  onToggleVirtualMode: () => void;
  onNewChart: () => void;
  onInsertSoap: () => void;
  onOpenCoprocessor?: () => void;
  onOpenMedicalSearch?: () => void;
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
  deviceType?: DeviceType;
  adaptiveMode?: AdaptiveMode;
  onSelectAdaptiveMode?: (mode: AdaptiveMode) => void;
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
  onOpenCoprocessor,
  onOpenMedicalSearch,
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
  deviceType = 'desktop',
  adaptiveMode = 'auto',
  onSelectAdaptiveMode,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    setIsMobileMenuOpen(false);
  };

  const isMobile = deviceType === 'mobile';
  const isTablet = deviceType === 'tablet';

  // =========================================================================
  // モバイル用メニューバー (スリム＆タッチ最適化)
  // =========================================================================
  if (isMobile) {
    return (
      <>
        <div
          ref={menuBarRef}
          className="sticky top-0 z-50 h-9 bg-white border-b-2 border-black flex items-center justify-between px-2 text-xs select-none shadow-[0_1px_0_#000]"
          style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
        >
          {/* 左:  ロゴ & アプリ名 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                playMacBeep();
                onOpenAbout();
              }}
              className="px-1 font-bold text-sm cursor-pointer hover:bg-black hover:text-white"
              title="この Mac について..."
            >
              
            </button>
            <span className="font-bold text-xs">Dr.Dongly</span>
            <span className="text-[9px] bg-slate-100 border border-black px-1 font-mono font-bold">v{APP_VERSION}</span>
          </div>

          {/* 中央: ★ 最前面の目立つ BLE接続ボタン！ */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                playMacBeep();
                onConnectBle();
              }}
              className={`px-2.5 py-0.5 text-xs font-bold border-2 border-black shadow-[1.5px_1.5px_0_#000] cursor-pointer flex items-center gap-1 transition-all ${
                isBleConnected
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-sky-600 text-white animate-pulse hover:bg-sky-700 ring-2 ring-sky-300'
              }`}
              title={isBleConnected ? 'BLE接続完了 (タップで切断・確認)' : '今すぐどんぐり君とBLE接続'}
            >
              <span>{isBleConnected ? '🟢' : '⚡'}</span>
              <span>{isBleConnected ? 'BLE接続中' : 'BLE接続'}</span>
            </button>
          </div>

          {/* 右: 医療検索 ＆ アダプティブ切替 ＆ ハンバーガーメニュー */}
          <div className="flex items-center gap-1">
            {onOpenMedicalSearch && (
              <button
                onClick={() => {
                  playMacBeep();
                  onOpenMedicalSearch();
                }}
                className="px-1.5 py-0.5 border border-black bg-yellow-50 hover:bg-black hover:text-white shadow-[1px_1px_0_#000] font-bold text-xs cursor-pointer flex items-center gap-0.5"
                title="医療データ検索 (Minds 111疾患・医薬品・病名)"
              >
                <span>📚</span>
                <span className="hidden xs:inline">検索</span>
              </button>
            )}

            {onSelectAdaptiveMode && (
              <AdaptiveModeSwitcher
                mode={adaptiveMode}
                deviceType={deviceType}
                onSelectMode={onSelectAdaptiveMode}
                compact
              />
            )}

            <button
              onClick={() => {
                playMacBeep();
                setIsMobileMenuOpen(!isMobileMenuOpen);
              }}
              className="flex items-center gap-0.5 border border-black bg-white active:bg-black active:text-white px-1.5 py-0.5 shadow-[1px_1px_0_#000] font-bold text-xs cursor-pointer"
              title="メニューを開く"
            >
              {isMobileMenuOpen ? <X className="w-3 h-3" /> : <Menu className="w-3 h-3" />}
              <span>{isMobileMenuOpen ? '閉' : '三'}</span>
            </button>
          </div>
        </div>

        {/* モバイル用 フルスクリーンメニュー ドロワー */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 top-9 z-40 bg-black/60 backdrop-blur-none flex flex-col p-2.5 overflow-y-auto animate-in fade-in select-none">
            <div className="mac-window bg-white border-2 border-black p-3 space-y-3 shadow-[4px_4px_0_#000] my-auto max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b-2 border-black pb-1.5 font-bold text-xs">
                <span> System 7 アダプティブメニュー v{APP_VERSION}</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="px-2 py-0.2 border border-black text-xs hover:bg-black hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* ★ 最上部: わかりやすい大型 BLE接続バナーボタン */}
              <div className="p-2 border-2 border-black bg-slate-50 shadow-[2px_2px_0_#000] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>🌰 どんぐり君 (AtomS3U / T-Dongle)</span>
                  <span
                    className={`px-1.5 py-0.2 border border-black text-[10px] font-bold ${
                      isBleConnected ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {isBleConnected ? '● BLE接続済み' : '○ 未接続'}
                  </span>
                </div>
                <button
                  onClick={() => handleItemClick(onConnectBle)}
                  className={`w-full py-2 px-3 border-2 border-black font-bold text-xs flex items-center justify-center gap-2 shadow-[2px_2px_0_#000] cursor-pointer transition-all ${
                    isBleConnected
                      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                      : 'bg-sky-600 text-white hover:bg-sky-700 animate-pulse text-sm ring-2 ring-sky-300'
                  }`}
                >
                  <span>{isBleConnected ? '🟢 BLE切断・状態確認' : '⚡ 今すぐ実機BLE接続'}</span>
                </button>
              </div>

              {/* クイックアクション */}
              <div className="space-y-1">
                <div className="text-[10px] text-gray-500 font-bold">📄 カルテ・入力操作</div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {onOpenMedicalSearch && (
                    <button
                      onClick={() => handleItemClick(() => { setActiveTab('input'); onOpenMedicalSearch(); })}
                      className="mac-btn text-left p-1.5 flex items-center gap-1 col-span-2 bg-yellow-100 border-black font-bold"
                    >
                      <span>📚 医療データ検索 (Minds 111CQ / 医薬品 / 病名)</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleItemClick(() => { setActiveTab('input'); onNewChart(); })}
                    className="mac-btn text-left p-1.5 flex items-center gap-1"
                  >
                    <span>📄 新規カルテ</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(() => { setActiveTab('input'); onOpenTemplates(); })}
                    className="mac-btn text-left p-1.5 flex items-center gap-1"
                  >
                    <span>🔖 テンプレート</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(() => { setActiveTab('input'); onOpenAiAssist(); })}
                    className="mac-btn text-left p-1.5 flex items-center gap-1"
                  >
                    <span>🤖 AIスマート整形</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(() => { setActiveTab('input'); onOpenOcr(); })}
                    className="mac-btn text-left p-1.5 flex items-center gap-1"
                  >
                    <span>📷 カメラOCR</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(() => { setActiveTab('input'); onTransmit(); })}
                    className="mac-btn text-left p-1.5 flex items-center gap-1 col-span-2 bg-black text-white font-bold"
                  >
                    <span>⚡ カルテへ送信 (Transmit)</span>
                  </button>
                </div>
              </div>

              {/* ドングル・通信制御 */}
              <div className="space-y-1 border-t border-black/20 pt-2">
                <div className="text-[10px] text-gray-500 font-bold">🌰 どんぐり君 (AtomS3U) 制御</div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    onClick={() => handleItemClick(onConnectBle)}
                    className="mac-btn text-left p-1.5 font-bold"
                  >
                    <span>{isBleConnected ? '● BLE 切断' : '○ BLE 接続'}</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(onToggleVirtualMode)}
                    className="mac-btn text-left p-1.5"
                  >
                    <span>仮想: {isVirtualMode ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(onPressDongleBtn)}
                    className="mac-btn text-left p-1.5 col-span-2 bg-yellow-50 border-black font-bold"
                  >
                    <span>🔘 本体正面ボタン押下</span>
                  </button>
                </div>
              </div>

              {/* System 7 デスクアクセサリ */}
              <div className="space-y-1 border-t border-black/20 pt-2">
                <div className="text-[10px] text-gray-500 font-bold"> デスクアクセサリ (DA)</div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    onClick={() => handleItemClick(onOpenCalculator)}
                    className="mac-btn text-left p-1.5"
                  >
                    <span>🧮 計算機 (eGFR)</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(onOpenScrapbook)}
                    className="mac-btn text-left p-1.5"
                  >
                    <span>📋 スクラップ</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(onOpenAbout)}
                    className="mac-btn text-left p-1.5"
                  >
                    <span>ℹ️ このMacについて</span>
                  </button>
                  <button
                    onClick={() => handleItemClick(onOpenBombAlert)}
                    className="mac-btn text-left p-1.5 text-red-700"
                  >
                    <span>💣 爆弾アラート</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-black/20 pt-2 flex items-center justify-between text-[10px] text-gray-500">
                <span>時計: {currentTime}</span>
                <button
                  onClick={() => handleItemClick(() => setIsMonoClassic(!isMonoClassic))}
                  className="underline hover:text-black"
                >
                  {isMonoClassic ? '白黒 1bit' : 'カラー表示'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // =========================================================================
  // PC / タブレット用メニューバー (Classic System 7 フルメニュー)
  // =========================================================================
  return (
    <div
      ref={menuBarRef}
      className={`sticky top-0 z-50 ${isTablet ? 'h-7' : 'h-6'} bg-white border-b border-black flex items-center justify-between px-2 text-xs select-none shadow-[0_1px_0_#000]`}
      style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
    >
      {/* 左側: メニュー項目一覧 */}
      <div className="flex items-center gap-0">
        {/*  Apple マーク */}
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
            <div className="absolute top-6 left-0 min-w-[190px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onInsertSoap)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between font-bold"
              >
                <span>SOAP雛形を挿入</span>
                <span className="text-[10px]">⌘S</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenTemplates)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                定型文ライブラリ...
              </button>
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(onEmptyTrash)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer text-red-600"
              >
                全選択消去 (Clear All)
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
            <div className="absolute top-6 left-0 min-w-[260px] bg-white border border-black shadow-[2px_2px_0_#000] py-1 z-50">
              <button
                onClick={() => handleItemClick(onOpenAiAssist)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer font-bold flex justify-between"
              >
                <span>🤖 AIスマート推敲・要約 (WebLLM)</span>
                <span className="text-[10px]">Qwen</span>
              </button>
              <button
                onClick={() => handleItemClick(onOpenOcr)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer flex justify-between"
              >
                <span>📷 カメラOCR (処方箋スキャン)</span>
                <span className="text-[10px]">Local</span>
              </button>
              {onOpenCoprocessor && (
                <button
                  onClick={() => handleItemClick(onOpenCoprocessor)}
                  className="w-full text-left px-3 py-1 bg-yellow-50 hover:bg-black hover:text-white cursor-pointer font-bold flex justify-between border-y border-yellow-300/40 my-0.5"
                >
                  <span>📥 医療双方向エッジコプロセッサ</span>
                  <span className="text-[10px] bg-black text-white px-1">v19.1</span>
                </button>
              )}
              <div className="border-b border-black my-1 border-dotted" />
              <button
                onClick={() => handleItemClick(onOpenImeBoost)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                IME打鍵精度ブースト設定...
              </button>
              <button
                onClick={() => handleItemClick(onOpenPreprocessor)}
                className="w-full text-left px-3 py-1 hover:bg-black hover:text-white cursor-pointer"
              >
                医学用語前処理フィルター...
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

      {/* 右側: アダプティブ切替 ＆ アプリ名 ＆ 時計 ＆ BLEステータス */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* アダプティブモード切替スイッチ */}
        {onSelectAdaptiveMode && (
          <AdaptiveModeSwitcher
            mode={adaptiveMode}
            deviceType={deviceType}
            onSelectMode={onSelectAdaptiveMode}
          />
        )}

        {/* 医療データ検索ボタン (Classic Mac style) */}
        {onOpenMedicalSearch && (
          <button
            onClick={() => {
              playMacBeep();
              onOpenMedicalSearch();
            }}
            className="hidden sm:flex items-center gap-1 border border-black px-2 py-0.5 bg-yellow-50 hover:bg-black hover:text-white shadow-[1px_1px_0_#000] cursor-pointer font-bold text-[10px]"
            title="Minds 111疾患・検査値・診療行為・腎機能減量・医薬品・病名を検索"
          >
            <span>📚</span>
            <span>医療データ検索</span>
          </button>
        )}

        {/* 実機BLE接続ボタン (1-bit Mac style ＆ ワンクリックでBLE接続開始) */}
        <button
          onClick={() => {
            playMacBeep();
            onConnectBle();
          }}
          className={`flex items-center gap-1.5 border border-black px-2 py-0.5 shadow-[1px_1px_0_#000] cursor-pointer font-bold transition-all ${
            isBleConnected
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-sky-600 text-white hover:bg-sky-700 animate-pulse ring-1 ring-sky-300'
          }`}
          title={isBleConnected ? 'BLE接続中 (クリックで切断・確認)' : 'クリックして今すぐ実機BLE接続'}
        >
          <span>{isBleConnected ? '🟢' : '⚡'}</span>
          <span className="text-[10px]">
            {isBleConnected ? 'BLE: 実機接続中' : '実機BLE接続'}
          </span>
        </button>

        {/* アクティブアプリ (Macintosh右上アイコン) */}
        <div className="hidden md:flex items-center gap-1">
          <span className="font-bold">Dr.Dongly v{APP_VERSION}</span>
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
