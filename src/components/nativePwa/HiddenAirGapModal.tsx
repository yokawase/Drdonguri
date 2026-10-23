import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface HiddenAirGapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HiddenAirGapModal: React.FC<HiddenAirGapModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border-2 border-emerald-500/60 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-950 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  Hidden On-Premise Mode
                </span>
                <span className="text-[10px] font-mono text-amber-300">
                  3省2ガイドライン完全準拠
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-1">
                T-Dongle-S3 閉域Wi-Fi エアギャップ遮断構成
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
          >
            ✕ 閉じる
          </button>
        </div>

        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed space-y-2">
          <p className="font-bold text-emerald-300">
            🔒 なぜあえて T-Dongle-S3 の Wi-Fi に接続するのか？（3省2ガイドライン遵守の黄金律）
          </p>
          <p>
            スマホ・タブレットのWi-Fi接続先を、インターネットルーターではなくあえて
            <strong className="text-white"> T-Dongle-S3 内蔵の閉域アクセスポイント（SoftAP）</strong>
            に切り替えることで、端末のルーティングが物理的に外部インターネットから完全遮断（エアギャップ隔離）されます。
          </p>
          <p>
            これにより、厚労省・経産省・総務省の<strong className="text-emerald-300">「医療情報システムの安全管理に関するガイドライン（3省2ガイドライン）」</strong>が求める「外部ネットワークへの患者情報漏洩ゼロ」をハードウェアレベルで100%証明できる<strong className="text-amber-300">完全オフライン・オンプレミス医療支援デバイス</strong>として機能します。
          </p>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="font-bold text-slate-300 flex items-center justify-between">
            <span>📡 T-Dongle-S3 閉域SoftAP 接続手順（監査・高セキュリティ運用時）</span>
            <span className="text-[10px] font-mono text-slate-500">※通常はBLEのみで全機能稼働</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300 font-mono text-[11px]">
            <li>
              スマホのWi-Fi設定で SSID: <span className="text-amber-300 font-bold">Drdonguri-Atlas-Direct</span> を選択
            </li>
            <li>
              パスワード: <span className="text-amber-300 font-bold">donguri-medical-s3</span> を入力して接続
            </li>
            <li>
              インターネット未接続の閉域網（<span className="text-sky-300">http://192.168.4.1</span>）が確立され、32GB MicroSD内のMindsガイドライン原本PDF・PMDA添付文書・臨床アトラスWebPが外部通信ゼロで直接ストリーミング供給されます。
            </li>
          </ol>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            了解して戻る
          </button>
        </div>
      </div>
    </div>
  );
};
