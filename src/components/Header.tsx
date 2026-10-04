import React, { useState } from 'react';
import { Bluetooth, BluetoothConnected, Cpu } from 'lucide-react';
import { LATEST_FIRMWARE_VERSION } from '../data/firmwareSource';
import { bleManager } from '../utils/webBluetooth';

interface HeaderProps {
  activeTab: 'input' | 'dongle' | 'firmware';
  setActiveTab: (tab: 'input' | 'dongle' | 'firmware') => void;
  isBleConnected: boolean;
  isVirtualMode: boolean;
  onConnectBle: () => void;
  onToggleVirtualMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isBleConnected,
  isVirtualMode,
  onConnectBle,
  onToggleVirtualMode,
}) => {
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setActiveTab('input'); }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <span className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-bold shadow-sm">
              Dr
            </span>
            <span>DrVoice どんぐり君！</span>
          </a>
        </div>

        {/* Zone 2: 3 clean text navigation links (実機完結型) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('input')}
            className={`transition-colors pb-0.5 border-b-2 cursor-pointer ${
              activeTab === 'input'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            カルテ作成・送信
          </button>
          <button
            onClick={() => setActiveTab('dongle')}
            className={`transition-colors pb-0.5 border-b-2 cursor-pointer ${
              activeTab === 'dongle'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            どんぐり君 (AtomS3U) 制御
          </button>
          <button
            onClick={() => setActiveTab('firmware')}
            className={`transition-colors pb-0.5 border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'firmware'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <span>ファームウェア {LATEST_FIRMWARE_VERSION}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              最新
            </span>
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2">
          {/* 緊急NumLock解除ボタン */}
          <button
            onClick={async () => {
              try {
                if (isBleConnected) {
                  await bleManager.sendNumUnlock();
                }
              } catch (e) {
                console.error(e);
              }
              setShowUnlockModal(true);
            }}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-800 font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs cursor-pointer"
            title="ノートPCのKキーが2になるテンキー固定を解除します"
          >
            <span>🚨 テンキー固定解除</span>
          </button>

          {/* Direct firmware download for local flashing */}
          <a
            href="/api/firmware/main.cpp"
            download="main.cpp"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-sky-300 bg-sky-50 text-sky-800 font-medium hover:bg-sky-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shadow-xs"
            title="AtomS3U書き込み用最新 main.cpp を直接ダウンロード"
          >
            <Cpu className="w-3.5 h-3.5 text-sky-600" />
            <span>📥 FW取得 (main.cpp)</span>
          </a>

          {isVirtualMode ? (
            <button
              onClick={onToggleVirtualMode}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 font-medium hover:bg-amber-100 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="実機BLEモードに切り替え"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-600" />
              <span>仮想モード動作中</span>
            </button>
          ) : (
            <button
              onClick={onToggleVirtualMode}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              title="仮想ドングルモードに切り替え"
            >
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <span>仮想モード</span>
            </button>
          )}

          <button
            onClick={onConnectBle}
            disabled={isVirtualMode}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              isBleConnected
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                : isVirtualMode
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm'
            }`}
          >
            {isBleConnected ? (
              <>
                <BluetoothConnected className="w-3.5 h-3.5" />
                <span>BLE接続中</span>
              </>
            ) : (
              <>
                <Bluetooth className="w-3.5 h-3.5" />
                <span>実機BLE接続</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ★ テンキー固定解除モーダル */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span className="text-red-600">🚨</span> ノートPC テンキー固定 (NumLock) 解除手順
              </h3>
              <button
                onClick={() => setShowUnlockModal(false)}
                className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                <strong>【信号送出】</strong> AtomS3UよりNumLock解除シグナル（HID Usage 0x53）を送信しました。
                メモ帳などで「K」キーを押してアルファベットが入力できるかご確認ください。
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="font-bold text-slate-900">■ ノートPC本体で「Kを押すと2が出る」場合の物理解除</div>
                <p>
                  キーボード上の <strong>[Fn] + [NumLock]</strong>（または [Shift] + [NumLock]）を1回押してください。
                  <span className="text-[11px] text-slate-500 block">※キーボードの「Insert」「F11」「F12」などに「NumLk」と小さく印刷されています。</span>
                </p>
                <div className="font-bold text-slate-900 pt-1">■ Windowsスクリーンキーボードで解除する場合</div>
                <p>
                  <strong>[Windowsキー] + [R]</strong> を押し、<strong>osk</strong> と入力してEnter ➔ 画面上の <strong>[NumLock]</strong> キーをクリックして消灯させます。
                </p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1 text-amber-900">
                <div className="font-bold">■ 「qを押すと『た』が出る（かな入力）」場合</div>
                <p>
                  キーボードの <strong>[Alt] + [カタカナ/ひらがな]</strong> または <strong>[Ctrl] + [Shift] + [Caps Lock]</strong> を押して「ローマ字入力」に戻してください。
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowUnlockModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                了解 (OK)
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
