import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  HelpCircle, 
  Cpu, 
  Keyboard as KeyboardIcon, 
  FileText, 
  Activity, 
  Sparkles, 
  Zap, 
  RefreshCw, 
  Sliders, 
  Info,
  Check,
  RotateCcw,
  Copy
} from 'lucide-react';
import { playMacBeep } from '../utils/macAudio';
import { BleDongleManager } from '../utils/webBluetooth';
import { 
  HIL_TEST_PRESETS, 
  HilTestPreset, 
  compileTextToAltNumpad, 
  encodeCharToAltNumpadUnicode, 
  encodeCharToAltNumpadCp932 
} from '../utils/altNumpadCompiler';

export interface AltNumpadHilModalProps {
  isOpen: boolean;
  onClose: () => void;
  bleManager: BleDongleManager | null;
  isBleConnected: boolean;
  onConnectBle: () => Promise<void>;
}

export const AltNumpadHilModal: React.FC<AltNumpadHilModalProps> = ({
  isOpen,
  onClose,
  bleManager,
  isBleConnected,
  onConnectBle,
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom' | 'matrix' | 'guide'>('presets');
  const [customText, setCustomText] = useState('胃癌の精査目的にて受診。');
  const [encodingMode, setEncodingMode] = useState<'unicode' | 'cp932'>('cp932');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [testLogs, setTestLogs] = useState<{ id: string; time: string; text: string; status: 'sent' | 'ack' | 'error'; detail?: string }[]>([]);
  
  // マトリクス検証記録
  const [matrixResults, setMatrixResults] = useState<Record<string, 'pass' | 'partial' | 'fail' | 'none'>>({
    'notepad_ime_off': 'none',
    'notepad_ime_on': 'none',
    'ehr_soap_free': 'none',
    'ehr_memo': 'none',
    'ehr_search_box': 'none',
  });

  const [copiedLog, setCopiedLog] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  const handleCopyLogs = async () => {
    if (testLogs.length === 0) return;
    const text = testLogs.map(l => `[${l.time}] (${l.status.toUpperCase()}) ${l.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLog(true);
      setTimeout(() => setCopiedLog(false), 2000);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  const handleCopyPayload = async () => {
    const preview = compileTextToAltNumpad(customText, { mode: encodingMode });
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch (e) {
      console.error('Payload copy failed', e);
    }
  };

  /**
   * Alt+Numpad ストリームを安全なBLEパケットサイズ（約120〜160バイト）に分割して逐次送信
   */
  const sendAltStreamChunks = async (
    targetBleManager: BleDongleManager,
    compiledText: string,
    label: string
  ): Promise<void> => {
    // [ALT]...[/ALT], [A]...[/A], 改行, [ENTER] 単位でトークン分割
    const tokenRegex = /(\[ALT\][0-9+]+\[\/ALT\]|\[A\].*?\[\/A\]|<ALT>[0-9+]+<\/ALT>|<A>.*?<\/A>|\[ENTER\]|<ENTER>|\[ALT_ENTER\]|<ALT_ENTER>|\r\n|\n|.)/gs;
    const tokens = compiledText.match(tokenRegex) || [compiledText];

    const chunks: string[] = [];
    let currentChunk = '';

    for (const token of tokens) {
      if ((currentChunk + token).length > 150 && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = token;
      } else {
        currentChunk += token;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    const timeStr = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    setTestLogs(prev => [
      ...prev.slice(-30),
      { id: Math.random().toString(), time: timeStr, text: `${label} (全${chunks.length}パケット・${compiledText.length}B 送出開始)`, status: 'sent' }
    ]);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      await targetBleManager.sendData(chunk);
      // マイコン側打鍵とキューの安定化のため微小インターバル
      if (i < chunks.length - 1) {
        await new Promise(r => setTimeout(r, 40));
      }
    }
  };

  useEffect(() => {
    if (!bleManager) return;
    const remove = bleManager.addAckListener((event) => {
      if (
        event.ackType === 'ALT_NUMPAD_DIRECT_SENT' || 
        event.ackType === 'ALT_NUMPAD_SENT' || 
        event.ackType === 'ALT_STREAM_SENT'
      ) {
        const timeStr = new Date().toLocaleTimeString('ja-JP', { hour12: false });
        setTestLogs(prev => [
          ...prev.slice(-30),
          { id: Math.random().toString(), time: timeStr, text: `ACK着弾: ${event.ackType} (${event.detail || '完了'})`, status: 'ack' }
        ]);
      }
    });
    return remove;
  }, [bleManager]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [testLogs]);

  if (!isOpen) return null;

  // プリセット送信ハンドラ
  const handleSendPreset = async (preset: HilTestPreset) => {
    playMacBeep();
    if (!isBleConnected || !bleManager) {
      alert('T-Dongle-S3 (どんぐり君) とBLE未接続です。「BLE接続」を行ってください。');
      return;
    }

    setSendingId(preset.id);
    const timeStr = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    
    try {
      if (preset.category === 'sentence') {
        // 短文フレーズはAlt+Numpadストリームとしてコンパイルして安全チャンク送信
        const cleanText = preset.code.replace('SENTENCE:', '');
        const compiled = compileTextToAltNumpad(cleanText, { mode: encodingMode });
        await sendAltStreamChunks(bleManager, compiled, `短文プリセット: ${cleanText}`);
      } else if (preset.code.includes(',')) {
        // 連続Altコード (熟語)
        const codes = preset.code.split(',');
        let stream = '';
        for (const c of codes) {
          stream += `[ALT]${c}[/ALT]`;
        }
        await sendAltStreamChunks(bleManager, stream, `熟語連続Alt: ${preset.name}`);
      } else {
        // 単発Altコード
        setTestLogs(prev => [
          ...prev.slice(-30),
          { id: Math.random().toString(), time: timeStr, text: `単発Alt送出: ${preset.name} (Code: ${preset.code})`, status: 'sent' }
        ]);
        await bleManager.sendAltNumpadDirect(preset.code);
      }
    } catch (err: any) {
      setTestLogs(prev => [
        ...prev.slice(-30),
        { id: Math.random().toString(), time: timeStr, text: `エラー: ${err?.message || err}`, status: 'error' }
      ]);
    } finally {
      setTimeout(() => setSendingId(null), 300);
    }
  };

  // 自由入力Alt送信ハンドラ
  const handleSendCustomText = async () => {
    playMacBeep();
    if (!isBleConnected || !bleManager) {
      alert('T-Dongle-S3 (どんぐり君) とBLE未接続です。');
      return;
    }

    const compiled = compileTextToAltNumpad(customText, { mode: encodingMode });
    setSendingId('custom');
    try {
      await sendAltStreamChunks(bleManager, compiled, `自由文Alt送出: "${customText}"`);
    } catch (err: any) {
      const timeStr = new Date().toLocaleTimeString('ja-JP', { hour12: false });
      setTestLogs(prev => [
        ...prev.slice(-30),
        { id: Math.random().toString(), time: timeStr, text: `エラー: ${err?.message || err}`, status: 'error' }
      ]);
    } finally {
      setTimeout(() => setSendingId(null), 400);
    }
  };

  const compiledCustomPreview = compileTextToAltNumpad(customText, { mode: encodingMode });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs">
      <div className="bg-neutral-100 border-2 border-black shadow-[6px_6px_0_#000] w-full max-w-4xl max-h-[92vh] flex flex-col font-mono text-xs text-neutral-900">
        
        {/* レトロMac風 タイトルバー */}
        <div className="bg-neutral-200 border-b-2 border-black px-2 py-1.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 bg-amber-400 border border-black flex items-center justify-center shadow-[1px_1px_0_#000]">
              <Zap className="w-2.5 h-2.5 text-black" />
            </div>
            <span className="font-bold text-sm tracking-tight">
              100%決定論 日本語転送システム HIL実機テストベンチ (Alt Numpad)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* BLE接続ステータスインジケーター */}
            <div className={`px-2 py-0.5 border border-black font-bold flex items-center gap-1 ${
              isBleConnected ? 'bg-emerald-200 text-emerald-950' : 'bg-rose-200 text-rose-950'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isBleConnected ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
              <span>{isBleConnected ? 'BLE接続中 (ESP32-S3)' : 'BLE未接続'}</span>
            </div>

            {!isBleConnected && (
              <button
                type="button"
                onClick={onConnectBle}
                className="bg-blue-600 text-white hover:bg-blue-700 px-2 py-0.5 border border-black font-bold shadow-[1px_1px_0_#000] cursor-pointer"
              >
                接続
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1 border border-black bg-white hover:bg-black hover:text-white transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* サマリーアラートバナー */}
        <div className="bg-amber-100/80 border-b border-black p-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            <Info className="w-4 h-4 text-amber-800 shrink-0" />
            <div>
              <span className="font-bold text-amber-950">F5キー画面リロード事故を完全根絶:</span>
              <span className="text-amber-900 ml-1">
                Windows OS標準の「Alt + テンキー (Alt Numpad)」ハードウェアスキャンコードを直接注入し、IMEのON/OFFに関わらず100%決定論で漢字を着弾させます。
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            <span className="text-[10px] text-gray-600">エンコード方式:</span>
            <select
              value={encodingMode}
              onChange={(e) => setEncodingMode(e.target.value as 'unicode' | 'cp932')}
              className="bg-white border border-black px-1.5 py-0.5 text-[11px] font-bold"
            >
              <option value="cp932">CP932 / SJIS (Windows標準・推奨★)</option>
              <option value="unicode">Unicode 10進 (EnableHexNumpad要)</option>
            </select>
          </div>
        </div>

        {/* タブナビゲーション */}
        <div className="flex border-b-2 border-black bg-neutral-200">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-2 font-bold border-r border-black flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'presets' ? 'bg-white border-b-2 border-b-white -mb-0.5 shadow-[0_-1px_0_#000]' : 'hover:bg-neutral-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>臨床語句プリセット (Step 2)</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-3 py-2 font-bold border-r border-black flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'custom' ? 'bg-white border-b-2 border-b-white -mb-0.5 shadow-[0_-1px_0_#000]' : 'hover:bg-neutral-300'
            }`}
          >
            <KeyboardIcon className="w-3.5 h-3.5 text-purple-600" />
            <span>自由文 Alt打鍵ストリーム</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-2 font-bold border-r border-black flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'matrix' ? 'bg-white border-b-2 border-b-white -mb-0.5 shadow-[0_-1px_0_#000]' : 'hover:bg-neutral-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>合否判定マトリクス (Step 5)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-2 font-bold flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'guide' ? 'bg-white border-b-2 border-b-white -mb-0.5 shadow-[0_-1px_0_#000]' : 'hover:bg-neutral-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-neutral-600" />
            <span>HIL検証手順ガイド (Step 3/4)</span>
          </button>
        </div>

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          
          {/* TAB 1: プリセット */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-neutral-800 mb-1 flex items-center justify-between">
                  <span>仕様書指定 臨床単漢字 & CP932コード</span>
                  <span className="text-[10px] text-gray-500 font-normal">※タップでドングルからPCへ即座に打鍵されます</span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HIL_TEST_PRESETS.map((p) => {
                    const isSending = sendingId === p.id;
                    const isCp = p.category === 'cp932';
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSendPreset(p)}
                        disabled={isSending}
                        className={`p-2 border border-black text-left flex flex-col justify-between transition-all cursor-pointer shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 ${
                          isSending ? 'bg-amber-200' : isCp ? 'bg-neutral-50 hover:bg-neutral-100' : 'bg-blue-50/50 hover:bg-blue-100/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-neutral-900">{p.name}</span>
                          <span className={`text-[9px] px-1 border border-black font-bold ${isCp ? 'bg-amber-200 text-amber-950' : 'bg-blue-200 text-blue-950'}`}>
                            {isCp ? 'CP932' : 'Unicode'}
                          </span>
                        </div>
                        <div className="text-[10px] text-neutral-600 mt-1 line-clamp-1">{p.description}</div>
                        <div className="mt-2 flex items-center justify-between border-t border-black/20 pt-1 text-[10px] text-neutral-700">
                          <span className="font-mono font-bold text-blue-900">Code: {p.code}</span>
                          <span className="flex items-center gap-0.5 font-bold text-neutral-800">
                            <Send className="w-2.5 h-2.5" /> 送信
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 複合語・短文 */}
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-neutral-800 mb-1">
                  臨床熟語 & 処方短文 (連続Alt打鍵ストリームテスト)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {HIL_TEST_PRESETS.filter(p => p.category === 'compound' || p.category === 'sentence').map((p) => {
                    const isSending = sendingId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSendPreset(p)}
                        disabled={isSending}
                        className={`p-2 border border-black text-left flex items-center justify-between transition-all cursor-pointer shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 ${
                          isSending ? 'bg-amber-200' : 'bg-white hover:bg-emerald-50'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-xs text-neutral-900">{p.name}</div>
                          <div className="text-[10px] text-neutral-600">{p.description}</div>
                        </div>
                        <span className="px-2 py-1 bg-emerald-600 text-white font-bold border border-black flex items-center gap-1 shadow-[1px_1px_0_#000] shrink-0 ml-2">
                          <Play className="w-2.5 h-2.5 fill-current" /> 打鍵
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 自由文 Alt打鍵 */}
          {activeTab === 'custom' && (
            <div className="space-y-3">
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000] space-y-2">
                <div className="font-bold text-neutral-800 flex items-center justify-between">
                  <span>カルテ自由入力テキスト ➔ Alt+Numpad 100%決定論変換</span>
                  <span className="text-[10px] text-gray-500">漢字・かな・カタカナをすべて1文字ずつAltコード化</span>
                </div>

                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  rows={3}
                  className="w-full p-2 border border-black font-sans text-xs focus:outline-hidden bg-neutral-50"
                  placeholder="任意の日本語を入力してください（例: 胃癌、急性上気道炎、カロナール錠500mg）"
                />

                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-neutral-600 font-mono">
                    文字数: {Array.from(customText).length} 文字
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCustomText}
                    disabled={sendingId === 'custom'}
                    className="px-4 py-1.5 bg-black text-white hover:bg-neutral-800 font-bold border border-black flex items-center gap-1.5 shadow-[2px_2px_0_#444] cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>この内容をAlt+テンキーで直接打鍵 (HIL送信)</span>
                  </button>
                </div>
              </div>

              {/* リアルタイムコンパイルプレビュー */}
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-neutral-800 mb-1 flex items-center justify-between">
                  <span>ドングル送出ペイロード プレビュー ([ALT]コード[/ALT])</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-blue-700 font-bold">
                      {encodingMode === 'unicode' ? 'Mode: Unicode 10進' : 'Mode: CP932 (先頭0付き)'}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPayload}
                      disabled={!compiledCustomPreview}
                      className={`text-[9px] px-1.5 py-0.5 border border-black flex items-center gap-1 cursor-pointer transition-colors shadow-[1px_1px_0_#000] ${
                        copiedPayload ? 'bg-emerald-600 text-white font-bold' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                      }`}
                      title="ペイロード文字列をコピー"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      <span>{copiedPayload ? 'コピー完了 ✓' : 'ペイロードコピー'}</span>
                    </button>
                  </div>
                </div>
                <div className="p-2 bg-neutral-900 text-emerald-400 font-mono text-[11px] border border-black overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                  {compiledCustomPreview || '(入力テキストがありません)'}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 合否判定マトリクス */}
          {activeTab === 'matrix' && (
            <div className="space-y-3">
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-neutral-800 mb-2">
                  Step 5: 合否判定マトリクス & トラブルシューティング
                </div>

                <div className="border border-black overflow-hidden">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-neutral-200 border-b border-black text-left">
                        <th className="p-1.5 border-r border-black">現象・テスト結果</th>
                        <th className="p-1.5 border-r border-black">推定原因</th>
                        <th className="p-1.5 border-r border-black">次の対処アクション</th>
                        <th className="p-1.5 text-center">判定</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/20">
                      <tr className="bg-emerald-50/60">
                        <td className="p-1.5 border-r border-black font-bold text-emerald-950">
                          ◎ 100%正しく漢字が出る<br/>(IME ON/OFF問わず)
                        </td>
                        <td className="p-1.5 border-r border-black">Alt+Numpadの完全適合</td>
                        <td className="p-1.5 border-r border-black text-emerald-900">
                          採用確定。F5依存を完全廃止し、本番の imePrecisionCompiler をAlt+Numpad出力に全面切り替え。
                        </td>
                        <td className="p-1.5 text-center">
                          <span className="px-1.5 py-0.5 bg-emerald-600 text-white font-bold border border-black text-[10px]">PASS</span>
                        </td>
                      </tr>

                      <tr className="bg-amber-50/60">
                        <td className="p-1.5 border-r border-black font-bold text-amber-950">
                          ▲ 別の文字（欧文記号等）が出る
                        </td>
                        <td className="p-1.5 border-r border-black">
                          Windowsの入力言語設定が「Unicode直接」ではなく「OEM/ANSIコードページ」を参照している。
                        </td>
                        <td className="p-1.5 border-r border-black text-amber-900">
                          PWA側の変換テーブルを「Unicode 10進」から「CP932（Shift_JIS）10進（先頭0付き）」へ変更して再テスト。
                        </td>
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => setEncodingMode('cp932')}
                            className="px-1 py-0.5 bg-amber-400 text-amber-950 font-bold border border-black hover:bg-amber-500 cursor-pointer text-[10px]"
                          >
                            CP932へ切替
                          </button>
                        </td>
                      </tr>

                      <tr className="bg-rose-50/60">
                        <td className="p-1.5 border-r border-black font-bold text-rose-950">
                          × 数字（24771等）がそのまま並ぶ
                        </td>
                        <td className="p-1.5 border-r border-black">
                          KEY_LEFT_ALT の認識が外れている、またはテンキーコードではなくメインキーボードの数字が送られている。
                        </td>
                        <td className="p-1.5 border-r border-black text-rose-900">
                          ファームウェア側で KEYBOARD_MODIFIER_LEFTALT 保持時間（ウェイト）を 15ms ➔ 25ms に延長。
                        </td>
                        <td className="p-1.5 text-center text-rose-700 font-bold">RETRY</td>
                      </tr>

                      <tr className="bg-neutral-50">
                        <td className="p-1.5 border-r border-black font-bold text-neutral-800">
                          × 入力途中で文字が消える
                        </td>
                        <td className="p-1.5 border-r border-black">電カル側のキーリピート監視による取りこぼし。</td>
                        <td className="p-1.5 border-r border-black text-neutral-700">各キー打鍵間の delay(12) を delay(15) に拡大。</td>
                        <td className="p-1.5 text-center text-neutral-600 font-bold">DELAY</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 端末別テストチェックリスト */}
              <div className="bg-white border border-black p-2.5 shadow-[2px_2px_0_#000]">
                <div className="font-bold text-neutral-800 mb-2">手元DynaBook ＆ 電カル端末 検証チェックシート</div>
                <div className="space-y-1.5">
                  {[
                    { id: 'notepad_ime_off', title: 'DynaBook メモ帳 (notepad.exe) - IME OFF (半角英数「A」)', desc: '「胃」(24771) 送信で「胃」が直接画面に出ること' },
                    { id: 'notepad_ime_on', title: 'DynaBook メモ帳 (notepad.exe) - IME ON (ひらがな「あ」)', desc: 'IMEがONでも未確定にならず直接確定着弾すること' },
                    { id: 'ehr_soap_free', title: '電カル自由記述ペイン (SOAP経過記録欄)', desc: 'F5リロードが絶対に発火せず、カーソル位置に文字が入ること' },
                    { id: 'ehr_memo', title: '電カル付属メモ帳 / 付箋欄', desc: '文字化けなく着弾すること' },
                    { id: 'ehr_search_box', title: '電カル1行検索ボックス (処方/病名検索枠)', desc: 'ダイアログ暴発やフォーカス逸脱がないこと' }
                  ].map((chk) => {
                    const current = matrixResults[chk.id];
                    return (
                      <div key={chk.id} className="p-2 border border-black flex items-center justify-between bg-neutral-50">
                        <div>
                          <div className="font-bold text-xs text-neutral-900">{chk.title}</div>
                          <div className="text-[10px] text-gray-600">{chk.desc}</div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => setMatrixResults(prev => ({ ...prev, [chk.id]: 'pass' }))}
                            className={`px-2 py-0.5 border border-black font-bold text-[10px] cursor-pointer ${
                              current === 'pass' ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-neutral-200'
                            }`}
                          >
                            合格 ◎
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixResults(prev => ({ ...prev, [chk.id]: 'partial' }))}
                            className={`px-2 py-0.5 border border-black font-bold text-[10px] cursor-pointer ${
                              current === 'partial' ? 'bg-amber-400 text-amber-950' : 'bg-white hover:bg-neutral-200'
                            }`}
                          >
                            一部 ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatrixResults(prev => ({ ...prev, [chk.id]: 'fail' }))}
                            className={`px-2 py-0.5 border border-black font-bold text-[10px] cursor-pointer ${
                              current === 'fail' ? 'bg-rose-600 text-white' : 'bg-white hover:bg-neutral-200'
                            }`}
                          >
                            不合格 ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 検証手順ガイド */}
          {activeTab === 'guide' && (
            <div className="bg-white border border-black p-3 shadow-[2px_2px_0_#000] space-y-3 leading-relaxed text-neutral-800">
              <div className="font-bold text-sm text-neutral-900 border-b border-black pb-1">
                Windows 電子カルテ端末 & DynaBook HIL実機検証手順書
              </div>

              <div className="space-y-2">
                <div className="font-bold text-blue-900">Step 3: 手元DynaBookでの事前ベンチマーク (Notepad.exe)</div>
                <ol className="list-decimal list-inside pl-1 space-y-1 text-[11px] text-neutral-700">
                  <li><strong>ドングル接続:</strong> T-Dongle-S3 をPCのUSBポートに挿入（USB-HIDとして認識確認）。</li>
                  <li><strong>スマホPWA起動:</strong> スマホで本アプリを開き、右上または上部バーの「接続」をタップしてBLE接続。</li>
                  <li><strong>メモ帳（notepad.exe）を起動:</strong> メモ帳を開き、カーソルを置く。</li>
                  <li><strong>【重要】IMEモードを「半角英数（OFF）」に手動設定:</strong> タスクバーのIMEアイコンが「A」の状態にする。</li>
                  <li><strong>テスト送信の実行:</strong> 「臨床語句プリセット」タブから <code>「胃」 (Unicode: 24771)</code> をタップ送信。</li>
                  <li><strong>反転検証:</strong> IMEモードを「ひらがな（ON: あ）」にして再送信。未確定文字列にならず直接確定するか確認。</li>
                </ol>
              </div>

              <div className="space-y-2 pt-2 border-t border-black/20">
                <div className="font-bold text-purple-900">Step 4: 電子カルテ端末での本番ペインHILテスト</div>
                <ol className="list-decimal list-inside pl-1 space-y-1 text-[11px] text-neutral-700">
                  <li><strong>ドングル接続:</strong> 病院の電カル端末（富士通、PHC、ソフトウェア・サービス等）のUSBポートに挿す。</li>
                  <li><strong>被疑ペインの選定とフォーカス:</strong>
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5 text-gray-600">
                      <li>Test A（自由記述ペイン）: 経過記録・SOAP入力欄にカーソルを合わせる。</li>
                      <li>Test B（電カル付属メモ帳）: カルテ画面上の付箋・メモ欄にカーソルを合わせる。</li>
                      <li>Test C（1行検索ボックス）: 処方検索・病名検索枠にカーソルを合わせる。</li>
                    </ul>
                  </li>
                  <li><strong>安全性の確認:</strong>
                    <ul className="list-disc list-inside pl-4 mt-0.5 space-y-0.5 text-gray-600">
                      <li>F5キー事故のゼロ確認: カルテ画面全体がリロード（再読込）されないこと。</li>
                      <li>フォーカス維持: 別ダイアログやIMEパッドがポップアップしてフォーカスが外れないこと。</li>
                    </ul>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* リアルタイム打鍵ログ */}
          <div className="bg-neutral-900 border border-black p-2 text-white">
            <div className="flex items-center justify-between border-b border-neutral-700 pb-1 mb-1.5">
              <span className="font-bold text-[10px] text-neutral-400 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400" /> HIL打鍵通信ログ
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={testLogs.length === 0}
                  className={`text-[9px] px-1.5 py-0.5 border border-neutral-600 flex items-center gap-1 cursor-pointer transition-colors ${
                    copiedLog ? 'bg-emerald-600 text-white font-bold' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                  }`}
                  title="通信ログをクリップボードにコピー"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>{copiedLog ? 'コピー完了 ✓' : 'ログコピー'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTestLogs([])}
                  className="text-[9px] text-neutral-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> クリア
                </button>
              </div>
            </div>
            
            <div className="h-24 overflow-y-auto space-y-1 font-mono text-[10px]">
              {testLogs.length === 0 ? (
                <div className="text-neutral-500 italic">待機中: プリセットまたは自由文を送信するとここに通信ログが出力されます</div>
              ) : (
                testLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5">
                    <span className="text-neutral-500 shrink-0">[{log.time}]</span>
                    <span className={
                      log.status === 'ack' ? 'text-emerald-400 font-bold' :
                      log.status === 'error' ? 'text-rose-400 font-bold' :
                      'text-sky-300'
                    }>
                      {log.text}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>

        {/* モーダルフッター */}
        <div className="bg-neutral-200 border-t-2 border-black px-3 py-2 flex items-center justify-between select-none">
          <div className="text-[11px] text-neutral-700">
            <span>物理打鍵エンジン: </span>
            <span className="font-bold text-black">TinyUSB Composite HID + Virtual Printer</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1 bg-white hover:bg-neutral-100 border border-black font-bold shadow-[1px_1px_0_#000] cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
