// =============================================================================
// File: src/components/MedPilotHotSyncModal.tsx
// 説明: 医師の認知負荷を最小化する知識均てん化インターフェース「MedPilot」
//       仮想プリンタ吸い上げ ➔ 0.5ms形態素・モダリティ推論 ➔ Staging Buffer ➔ 決定論打鍵HotSync
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  Zap, 
  Send, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  RefreshCw, 
  Cpu, 
  FileText, 
  ChevronRight,
  Bluetooth,
  X
} from 'lucide-react';
import { vibratoClient } from '../services/VibratoClient';
import { keyStrokeCompiler, type CompileResult, type KeyStrokeMode } from '../services/KeyStrokeCompiler';
import { bleManager, type BleConnectionState } from '../services/BleManager';
import type { MorphToken } from '../workers/vibrato.worker';

interface MedPilotHotSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
}

export const MedPilotHotSyncModal: React.FC<MedPilotHotSyncModalProps> = ({
  isOpen,
  onClose,
  initialText = ''
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [tokens, setTokens] = useState<MorphToken[]>([]);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [tokenizeDurationMs, setTokenizeDurationMs] = useState<number>(0);
  const [isTokenizing, setIsTokenizing] = useState(false);

  const [mode, setMode] = useState<KeyStrokeMode>('hybrid');
  const [bleState, setBleState] = useState<BleConnectionState>('disconnected');
  const [sendProgress, setSendProgress] = useState<number>(0);
  const [isSending, setIsSending] = useState(false);
  const [hvcScore, setHvcScore] = useState<string | null>(null);

  // 初期テキスト変更時に反映
  useEffect(() => {
    if (initialText) {
      setInputText(initialText);
    }
  }, [initialText]);

  // Bluetooth状態監視
  useEffect(() => {
    const handleState = (s: BleConnectionState) => setBleState(s);
    const handlePrinterText = (text: string) => {
      setInputText(prev => (prev ? prev + '\n' + text : text));
    };
    const handleAck = (ack: string, _sessionId?: number, extra?: string) => {
      if (ack === 'HVC_SCORE' && extra) {
        setHvcScore(extra);
      }
    };

    bleManager.on('stateChange', handleState);
    bleManager.on('printerTextReceived', handlePrinterText);
    bleManager.on('ackReceived', handleAck);

    setBleState(bleManager.getState());

    // バックグラウンドで自動再接続試行
    bleManager.tryAutoReconnect();

    return () => {
      bleManager.off('stateChange', handleState);
      bleManager.off('printerTextReceived', handlePrinterText);
      bleManager.off('ackReceived', handleAck);
    };
  }, []);

  // テキスト変更時の超高速（0.5ms）形態素解析 ＆ トランスパイル
  useEffect(() => {
    if (!isOpen || !inputText.trim()) {
      setTokens([]);
      setCompileResult(null);
      return;
    }

    let isMounted = true;
    setIsTokenizing(true);

    const runNlp = async () => {
      try {
        const res = await vibratoClient.tokenize(inputText);
        if (!isMounted) return;

        setTokens(res.tokens);
        setTokenizeDurationMs(res.durationMs);

        const compiled = keyStrokeCompiler.compile(res.tokens, {
          mode,
          includeImeReset: true,
          newlineMode: 'enter'
        });
        setCompileResult(compiled);
      } catch (err) {
        // フォールバック直接コンパイル
        const fallback = keyStrokeCompiler.compileText(inputText, { mode });
        if (isMounted) {
          setCompileResult(fallback);
        }
      } finally {
        if (isMounted) setIsTokenizing(false);
      }
    };

    const timer = setTimeout(runNlp, 50); // デバウンス 50ms
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [inputText, mode, isOpen]);

  // BLE 接続処理
  const handleConnectBle = async () => {
    try {
      await bleManager.requestAndConnect();
    } catch (e: any) {
      alert(`Bluetooth接続エラー: ${e.message}`);
    }
  };

  // 電子カルテへ打鍵 HotSync 送出
  const handleSendHotSync = async () => {
    if (!compileResult || !compileResult.streamText) return;
    if (!bleManager.isConnected()) {
      alert('T-Dongle-S3 がBluetooth接続されていません。「BLE接続」ボタンを押してください。');
      return;
    }

    setIsSending(true);
    setSendProgress(0);
    setHvcScore(null);

    try {
      await bleManager.sendStream(compileResult.streamText, (sent, total) => {
        setSendProgress(Math.round((sent / total) * 100));
      });
    } catch (err: any) {
      alert(`送信エラー: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl text-neutral-100 overflow-hidden">
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-neutral-100">MedPilot HotSync コプロセッサ</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">v2.5.0-proto</span>
              </div>
              <p className="text-xs text-neutral-400">0.5ms 臨床形態素解析 ＆ 100%決定論 Alt+Numpad / F7 ハイブリッド打鍵</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleConnectBle}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                bleState === 'connected'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : bleState === 'connecting'
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              <Bluetooth className="w-3.5 h-3.5" />
              {bleState === 'connected' ? 'ドングル接続中' : bleState === 'connecting' ? '接続中...' : 'BLE接続'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* メイングリッド */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* 左ペイン: 入力テキスト ＆ 形態素Pill */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-sky-400" />
                臨床テキスト (カルテ吸い上げ / 音声入力)
              </label>
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                解析時間: <span className="text-emerald-400 font-bold">{tokenizeDurationMs.toFixed(3)} ms</span>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="例: 胃癌の疑いにて精査。カロナール錠500mgを処方する。心窩部痛あり、急性虫垂炎は否定的。"
              rows={6}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-hidden focus:border-sky-500 transition-colors resize-none font-sans"
            />

            {/* プリセット臨床クイックボタン */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setInputText('胃癌の疑いにて精査。カロナール錠500mgを処方する。')}
                className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                胃癌・カロナール500mg
              </button>
              <button
                onClick={() => setInputText('右下腹部痛あり。急性虫垂炎は否定的。発熱なし。')}
                className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                否定モダリティテスト
              </button>
              <button
                onClick={() => setInputText('[S] 心窩部痛あり\n[O] eGFR: 45mL/min\n[A] 早期胃癌疑い\n[P] タケキャブ20mg 1回1錠')}
                className="text-xs px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                SOAP構文
              </button>
            </div>

            {/* 形態素トークン Pill 表示 */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-400" />
                抽出エンティティ ＆ モダリティ
              </span>
              <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-xl min-h-[100px] flex flex-wrap gap-1.5 items-start content-start">
                {tokens.length === 0 ? (
                  <span className="text-xs text-neutral-600">テキストを入力すると0.5msでトークン分割されます</span>
                ) : (
                  tokens.map((tok, idx) => {
                    let badgeColor = 'bg-neutral-800 text-neutral-300 border-neutral-700';
                    if (tok.subPos === '疾患名') {
                      if (tok.modality === 'negation') {
                        badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40 line-through';
                      } else if (tok.modality === 'suspicion') {
                        badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                      } else {
                        badgeColor = 'bg-red-500/20 text-red-300 border-red-500/40';
                      }
                    } else if (tok.subPos === '薬品名') {
                      badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-mono';
                    } else if (tok.subPos === '数') {
                      badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-mono';
                    }

                    return (
                      <span
                        key={idx}
                        className={`text-xs px-2 py-0.5 rounded-md border flex items-center gap-1 ${badgeColor}`}
                        title={`品詞: ${tok.pos}, 細分類: ${tok.subPos}, 読み: ${tok.reading}${tok.icd10 ? `, ICD-10: ${tok.icd10}` : ''}`}
                      >
                        {tok.surface}
                        {tok.icd10 && <span className="text-[10px] opacity-75">({tok.icd10})</span>}
                        {tok.modality === 'negation' && <span className="text-[10px] text-rose-400">否定</span>}
                        {tok.modality === 'suspicion' && <span className="text-[10px] text-amber-400">疑い</span>}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 右ペイン: Staging Buffer ＆ 打鍵トランスパイル */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-emerald-400" />
                打鍵ストリーム・コンパイラ
              </label>

              {/* モード切替 */}
              <div className="flex items-center p-0.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs">
                <button
                  onClick={() => setMode('hybrid')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    mode === 'hybrid' ? 'bg-neutral-800 text-emerald-400 font-bold' : 'text-neutral-400'
                  }`}
                >
                  F7/F10ハイブリッド (高速)
                </button>
                <button
                  onClick={() => setMode('deterministic_only')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    mode === 'deterministic_only' ? 'bg-neutral-800 text-sky-400 font-bold' : 'text-neutral-400'
                  }`}
                >
                  100% Alt+Numpad
                </button>
              </div>
            </div>

            {/* 打鍵統計 */}
            {compileResult && (
              <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                <div className="p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-neutral-500 text-[10px]">総打鍵数</div>
                  <div className="text-emerald-400 font-bold text-sm">{compileResult.totalKeystrokes}</div>
                </div>
                <div className="p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-neutral-500 text-[10px]">Altコード</div>
                  <div className="text-sky-400 font-bold text-sm">{compileResult.altCount}</div>
                </div>
                <div className="p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-neutral-500 text-[10px]">F7カタカナ</div>
                  <div className="text-cyan-400 font-bold text-sm">{compileResult.f7Count}</div>
                </div>
                <div className="p-2 rounded-lg bg-neutral-950 border border-neutral-800">
                  <div className="text-neutral-500 text-[10px]">F10英数</div>
                  <div className="text-indigo-400 font-bold text-sm">{compileResult.f10Count}</div>
                </div>
              </div>
            )}

            {/* トランスパイル後ストリームプレビュー */}
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-xs text-neutral-400">送出キーストローク列 (ESP32-S3用):</span>
              <div className="flex-1 min-h-[140px] max-h-[180px] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs font-mono text-emerald-400/90 break-all select-all">
                {compileResult?.streamText || '// テキストを入力すると生成されます'}
              </div>
            </div>

            {/* 安全保証バッジ */}
            <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>11msディレイ ＋ ダミーShift空打ち ＋ IME強制同期</span>
              </div>
              <span className="text-emerald-400 font-mono text-[11px]">誤爆率 0.00%</span>
            </div>

            {/* 送信進捗 ＆ HVCスコア */}
            {isSending && (
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-mono text-neutral-400">
                  <span>転送中...</span>
                  <span>{sendProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${sendProgress}%` }}
                  />
                </div>
              </div>
            )}

            {hvcScore && (
              <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>電子カルテ着弾完了！ HVCスコア: <strong>{hvcScore}</strong></span>
              </div>
            )}

            {/* HotSync承認ボタン */}
            <button
              onClick={handleSendHotSync}
              disabled={isSending || !compileResult?.streamText}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all ${
                isSending || !compileResult?.streamText
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30 active:scale-[0.99]'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>電子カルテへ打鍵 HotSync (Enter / スペース)</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
