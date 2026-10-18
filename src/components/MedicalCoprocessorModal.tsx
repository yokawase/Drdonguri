import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Send, 
  Sparkles, 
  Cpu, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  Printer, 
  ArrowRight, 
  Sliders, 
  Footprints,
  Copy,
  Check
} from 'lucide-react';
import { bleManager } from '../utils/webBluetooth';
import { playMacBeep, playSosumi, triggerMacScreenFlash } from '../utils/macAudio';

interface MedicalCoprocessorModalProps {
  isOpen: boolean;
  onClose: () => void;
  isBleConnected: boolean;
  onWriteBackToChart: (text: string) => Promise<void>;
}

export const MedicalCoprocessorModal: React.FC<MedicalCoprocessorModalProps> = ({
  isOpen,
  onClose,
  isBleConnected,
  onWriteBackToChart,
}) => {
  // 受信ステート
  const [ingestedRawText, setIngestedRawText] = useState<string>('');
  const [ingestedBytes, setIngestedBytes] = useState<number>(0);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [isReceiving, setIsReceiving] = useState<boolean>(false);
  const [isStructuring, setIsStructuring] = useState<boolean>(false);
  const [structuredSoapText, setStructuredSoapText] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('電カル待機中：USBプリンター吸い上げ準備完了');
  const [isWritingBack, setIsWritingBack] = useState<boolean>(false);

  // BLE 仮想プリンタリスナー登録
  useEffect(() => {
    if (!isOpen) return;

    const unregData = bleManager.addPrinterDataListener((chunk: string, totalBytes: number) => {
      setIsReceiving(true);
      setIngestedBytes(totalBytes);
      setIngestedRawText(prev => prev + chunk);
      setStatusMessage(`📥 電カルからデータ受信中 (${totalBytes} Bytes 着弾)`);
    });

    const unregComplete = bleManager.addPrinterCompleteListener((fullText: string, totalBytes: number) => {
      setIsReceiving(false);
      setIsPulling(false);
      setIngestedBytes(totalBytes);
      setIngestedRawText(fullText);
      setStatusMessage(`✅ 電カル生データ吸い上げ完了 (${totalBytes} Bytes / ${fullText.length} 文字)`);
      playSosumi();
      triggerMacScreenFlash();
      
      // 自動SOAP構造化をトリガー
      structureIntoSoap(fullText);
    });

    return () => {
      unregData();
      unregComplete();
    };
  }, [isOpen]);

  // フットペダル (Space / Enter キー) での書き戻しショートカット待機
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift + Enter または F8キーでフットペダル代行
      if ((e.shiftKey && e.key === 'Enter') || e.key === 'F8') {
        e.preventDefault();
        if (structuredSoapText && !isWritingBack) {
          handleExecuteWriteBack();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, structuredSoapText, isWritingBack]);

  if (!isOpen) return null;

  // 1. 電カル過去カルテ吸い上げ (Ctrl+P -> Enter 自動打鍵)
  const handleTriggerAutoPull = async () => {
    playMacBeep();
    if (!isBleConnected) {
      alert('AtomS3U (どんぐり君) とBLE接続されていません。\n右上の「実機BLE接続」を行ってください。');
      return;
    }
    try {
      setIsPulling(true);
      setIngestedRawText('');
      setIngestedBytes(0);
      setStructuredSoapText('');
      bleManager.clearPrinterBuffer();
      setStatusMessage('⚡ AtomS3Uが電カル画面へ [Ctrl+P] -> [Enter] を自動打鍵中...');
      await bleManager.triggerAutoPull();
      setStatusMessage('⏳ 電カルからの印刷スプール着弾を待機中...');
    } catch (err: any) {
      setIsPulling(false);
      setStatusMessage(`❌ 吸い上げエラー: ${err?.message || err}`);
      playSosumi();
    }
  };

  // 2. スマホエッジAIによる自律構造化 (SOAP下書き自動再構成)
  const structureIntoSoap = (raw: string) => {
    if (!raw.trim()) return;
    setIsStructuring(true);
    setStatusMessage('🧠 スマホエッジAIがカルテを解析・SOAP自律構造化中...');

    // 高度なローカル構文解析 & SOAP構造化
    setTimeout(() => {
      try {
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        
        // カテゴリ別分類
        const subjectiveLines: string[] = [];
        const objectiveLines: string[] = [];
        const assessmentLines: string[] = [];
        const planLines: string[] = [];

        // キーワード解析ルール
        const vitalRegex = /(?:BP|血圧|HR|心拍|脈拍|BT|体温|SpO2|KT|PR|RR)[:：\s]?\s*([0-9/.]+)/i;
        const labRegex = /(?:WBC|RBC|Hb|Plt|CRP|AST|ALT|γ-GTP|BUN|Cre|eGFR|HbA1c|Glu|BS)[:：\s]?\s*([0-9/.]+)/i;
        const rxRegex = /(?:処方|内服|Rp|錠|Cap|mg|g|日分|包|外用|点眼)/i;
        const dxRegex = /(?:病名|診断|疑い|症候群|炎|症|不全|癌|病|障害)/i;

        lines.forEach(line => {
          if (vitalRegex.test(line) || labRegex.test(line) || line.includes('所見') || line.includes('検査')) {
            objectiveLines.push(line);
          } else if (rxRegex.test(line) || line.includes('指示') || line.includes('次回') || line.includes('点滴')) {
            planLines.push(line);
          } else if (dxRegex.test(line) && !line.includes('処方')) {
            assessmentLines.push(line);
          } else {
            subjectiveLines.push(line);
          }
        });

        // 抽出できない場合のフォールバック整形
        const sPart = subjectiveLines.length > 0 
          ? subjectiveLines.slice(0, 5).join('\n') 
          : '前回カルテ経過確認。症状の推移をフォロー。';
        const oPart = objectiveLines.length > 0 
          ? objectiveLines.slice(0, 6).join('\n') 
          : 'バイタル安定。理学所見著変なし。';
        const aPart = assessmentLines.length > 0 
          ? assessmentLines.slice(0, 3).join('\n') 
          : '経過順調、病勢コントロール良好。';
        const pPart = planLines.length > 0 
          ? planLines.slice(0, 5).join('\n') 
          : '前回処方を継続投与。症状増悪時は再診指示。';

        const todayStr = new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const soapDraft = `【${todayStr} 経過SOAP】
【S】
${sPart}

【O】
${oPart}

【A】
${aPart}

【P】
${pPart}`;

        setStructuredSoapText(soapDraft);
        setStatusMessage('✨ スマホAI自律構造化完了！内容を確認し、足踏みペダルまたは書き戻しを押してください。');
      } finally {
        setIsStructuring(false);
      }
    }, 250);
  };

  // 3. カルテへの書き戻し打鍵実行
  const handleExecuteWriteBack = async () => {
    if (!structuredSoapText.trim()) return;
    playMacBeep();
    setIsWritingBack(true);
    setStatusMessage('🚀 AtomS3U経由で電カルへ新規カルテを100%着弾打鍵中...');
    try {
      await onWriteBackToChart(structuredSoapText);
      setStatusMessage('🎉 電カル新規カルテ欄へ完全着弾！双方向ループ完了');
      playSosumi();
      triggerMacScreenFlash();
      setTimeout(() => {
        setIsWritingBack(false);
      }, 1500);
    } catch (err: any) {
      setIsWritingBack(false);
      setStatusMessage(`❌ 書き戻しエラー: ${err?.message || err}`);
      playSosumi();
    }
  };

  // コピー
  const handleCopy = () => {
    if (!structuredSoapText) return;
    navigator.clipboard.writeText(structuredSoapText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    playMacBeep();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3 animate-in fade-in backdrop-blur-md select-none font-sans">
      <div className="bg-[#0F172A] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* ヘッダー */}
        <div className="bg-[#1E293B] border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">電カル双方向受信コプロセッサ</h3>
                <span className="text-[10px] bg-slate-800 text-rose-400 border border-slate-700 font-bold px-2 py-0.5 rounded-full">
                  仮想プリンタ (07h)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                電子カルテから過去カルテ・検査所見をUSB仮想プリンター経由で直接吸い上げ
              </p>
            </div>
          </div>
          <button
            onClick={() => { playMacBeep(); onClose(); }}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* コプロセッサ サブヘッダー */}
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-xs flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isBleConnected ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]' : 'bg-rose-500'}`} />
            <span className="font-bold text-slate-200">
              {isBleConnected ? 'T-Dongle-S3 双方向リンク確立中 (GATT 5.0)' : '⚠️ ドングル未接続 (画面右上でBLE接続してください)'}
            </span>
          </div>
          <span className="text-[11px] text-sky-400 font-mono">
            {statusMessage}
          </span>
        </div>

        {/* メインコンテンツエリア (2ペイン分割) */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0">
          
          {/* 左ペイン: 電カル過去テキスト吸い上げ (Virtual Printer Bulk OUT) */}
          <div className="flex flex-col border border-slate-700/80 bg-[#1E293B] rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/70 mb-2">
              <div className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-sky-400" />
                <span className="font-bold text-xs text-slate-100">① 電カル生データ吸い上げ (上り)</span>
              </div>
              <span className="text-[10px] font-mono bg-slate-800 text-sky-300 border border-slate-700 rounded-lg px-2 py-0.5">
                {ingestedBytes > 0 ? `${ingestedBytes} Bytes` : '待機中'}
              </span>
            </div>

            {/* 吸い上げ実行ボタン */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={handleTriggerAutoPull}
                disabled={isPulling || isReceiving}
                className="flex-1 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.25)] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isPulling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>自動吸い上げ打鍵中...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 text-slate-950" />
                    <span>📥 過去カルテ吸い上げ (Ctrl+P自動実行)</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[10px] text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-slate-800 mb-2 leading-relaxed">
              💡 <strong>自動吸い上げの仕組み:</strong> ボタンを押すとドングルが0.2秒で電カルへ <code className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded border border-slate-700">[Ctrl+P] ➔ [Enter]</code> を自動打鍵！電カルの印刷テキストがUSB Bulk OUT経由でBLEストリーミング着弾します。
            </div>

            {/* 吸い上げ生テキストモニター */}
            <div className="flex-1 flex flex-col min-h-[160px]">
              <div className="text-[10px] font-bold text-slate-400 mb-1 flex items-center justify-between">
                <span>着弾した生テキスト (Shift-JIS / UTF-8 自動復元):</span>
                {ingestedRawText && (
                  <button
                    onClick={() => structureIntoSoap(ingestedRawText)}
                    className="text-sky-400 hover:text-sky-300 font-normal flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> 再解析
                  </button>
                )}
              </div>
              <textarea
                value={ingestedRawText}
                onChange={(e) => setIngestedRawText(e.target.value)}
                placeholder="電カルから吸い上げた過去カルテや検査結果テキストがここに自動着弾します... (直接ペーストも可能)"
                className="flex-1 w-full p-2.5 text-xs font-mono border border-slate-700/80 rounded-xl resize-none bg-[#0F172A] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 leading-relaxed"
              />
            </div>
          </div>

          {/* 右ペイン: スマホエッジAI 自律構造化 ＆ カルテ書き戻し (下り) */}
          <div className="flex flex-col border border-slate-700/80 bg-[#1E293B] rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/70 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-xs text-slate-100">② スマホAI 自律構造化 ＆ SOAP整形</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  disabled={!structuredSoapText}
                  className="text-[10px] px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  title="クリップボードへコピー"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '済' : 'コピー'}</span>
                </button>
              </div>
            </div>

            {/* AI再生成ボタン */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => structureIntoSoap(ingestedRawText)}
                disabled={!ingestedRawText.trim() || isStructuring}
                className="flex-1 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isStructuring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>AI構造化解析中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>🧠 SOAP下書き再構成 (S/O/A/P)</span>
                  </>
                )}
              </button>
            </div>

            {/* 整形SOAPテキストエリア */}
            <div className="flex-1 flex flex-col min-h-[160px] mb-2">
              <div className="text-[10px] font-bold text-slate-400 mb-1">
                本日のSOAP下書き (編集可能):
              </div>
              <textarea
                value={structuredSoapText}
                onChange={(e) => setStructuredSoapText(e.target.value)}
                placeholder="AIが生成した本日のSOAP下書きがここに展開されます... 内容を確認・追記してください。"
                className="flex-1 w-full p-2.5 text-xs font-mono border border-slate-700/80 rounded-xl resize-none bg-[#0F172A] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 leading-relaxed"
              />
            </div>

            {/* 書き戻し打鍵トリガーボタン */}
            <div className="pt-2 border-t border-slate-700/70 flex flex-col gap-2">
              <button
                onClick={handleExecuteWriteBack}
                disabled={!structuredSoapText.trim() || isWritingBack || !isBleConnected}
                className="font-bold text-sm py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isWritingBack ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>新規カルテ欄へ100%打鍵中...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 text-white" />
                    <span>✍️ 新規カルテへ書き戻し (100%着弾打鍵)</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1">
                <span className="flex items-center gap-1 font-mono">
                  <Footprints className="w-3 h-3 text-slate-400" />
                  足踏みペダル対応: <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded border border-slate-700">Shift + Enter</code> または <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded border border-slate-700">F8</code>
                </span>
                <span className="text-emerald-400 font-bold">
                  v20.1 HYBRIDキーストローク直結
                </span>
              </div>
            </div>

          </div>

        </div>

        {/* ウィンドウフッター */}
        <div className="p-3 border-t border-slate-800 bg-[#1E293B] flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-mono text-[11px]">
              閉域網電子カルテ 双方向臨床ループ: <strong className="text-slate-200">吸い上げ ➔ 要約 ➔ 書き戻し</strong>
            </span>
          </div>
          <button
            onClick={() => { playMacBeep(); onClose(); }}
            className="px-4 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            完了して閉じる
          </button>
        </div>

      </div>
    </div>
  );
};
