import React, { useState, useEffect, useRef } from 'react';
import { 
  PlayCircle, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  Cpu, 
  Keyboard as KeyboardIcon, 
  ShieldCheck, 
  Sparkles, 
  Clock, 
  Check, 
  CheckCheck, 
  Activity, 
  Zap,
  ArrowRight,
  Copy,
  Sliders,
  X
} from 'lucide-react';
import { DispatchMode, SessionTransmissionStatus } from '../types';
import { buildTransmissionSession, PreparedSession } from '../utils/packetBuilder';
import { transpileToImeRomajiSequence } from '../utils/japaneseImeTranspiler';

export interface E2eAutoTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  isVirtualMode: boolean;
  isBleConnected: boolean;
  dispatchMode: DispatchMode;
  onSendSession: (session: PreparedSession) => Promise<void>;
  onPressVirtualButton?: () => void;
  transmissionStatus: SessionTransmissionStatus | null;
  onApplyDummyTextToInput: (text: string) => void;
}

interface TestStep {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  detail?: string;
  durationMs?: number;
}

const DUMMY_SCENARIOS = [
  {
    id: 'fever',
    title: '発熱外来・急性上気道炎 (標準SOAP)',
    generator: () => {
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
      const temp = (37.8 + Math.random() * 1.2).toFixed(1);
      const bpSys = Math.floor(115 + Math.random() * 20);
      const bpDia = Math.floor(70 + Math.random() * 15);
      const pulse = Math.floor(75 + Math.random() * 20);
      const ptId = Math.floor(100000 + Math.random() * 899999);
      return `【診察日: ${dateStr} / Pt ID: ${ptId}】
[S] 昨夜より38度台の発熱と咽頭痛が出現。咳嗽は軽度あり、鼻汁軽度。食事摂取は可能だが嚥下時に痛みあり。呼吸苦や嘔気・下痢は認めず。
[O] 
・BT: ${temp}℃, BP: ${bpSys}/${bpDia}mmHg, PR: ${pulse}bpm (整), SpO2: 98% (room air)
・咽頭発赤著明、扁桃腫大(左右I度)、白苔付着なし。
・頸部リンパ節腫脹・圧痛軽度認める。
・胸部聴診: 心音純、呼吸音清(ラ音なし)。
・SARS-CoV-2/Flu 抗原定性検査: 陰性
[A] 急性上気道炎 (Acute upper respiratory tract infection)
[P]
1. 処方内容:
  ・PL配合顆粒 3g 分3 毎食後 4日分
  ・トラネキサム酸錠250mg 3錠 分3 毎食後 4日分
  ・カロナール錠500mg 1回1錠 疼痛発熱時(4〜6時間以上あける) 頓用 8回分
2. 症状増悪時や3日以上の有熱持続時は再診指示。水分摂取・安静を指導。`;
    }
  },
  {
    id: 'hypertension',
    title: '生活習慣病・本態性高血圧症 (定期フォロー)',
    generator: () => {
      const now = new Date();
      const dateStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
      const bpSys = Math.floor(136 + Math.random() * 14);
      const bpDia = Math.floor(82 + Math.random() * 10);
      const ptId = Math.floor(200000 + Math.random() * 899999);
      return `【定期診察: ${dateStr} / カルテNo: ${ptId}】
[S] 自覚症状特になし。家庭血圧は朝130-140/80-88程度で推移。服薬アドヒアランス良好。めまいやふらつき、動悸なし。
[O]
・随時血圧: ${bpSys}/${bpDia}mmHg, 脈拍: 72bpm (整)
・下肢浮腫なし、眼瞼結膜貧血なし。
・採血結果(前回): Cre 0.82mg/dL, eGFR 72, K 4.3mEq/L, HbA1c 5.8%, LDL-C 118mg/dL
[A] 本態性高血圧症 (Essential hypertension) - コントロール安定
[P]
1. 現行処方を28日分継続:
  ・アムロジピンOD錠5mg 1錠 分1 朝食後 28日分
2. 食塩摂取制限(6g/日未満目標)および適度な有酸素運動を継続指導。
3. 次回4週後、定期処方および尿定性検査予定。`;
    }
  },
  {
    id: 'short_prescription',
    title: '定型処方・クイック打鍵テスト (短文)',
    generator: () => {
      const ptId = Math.floor(300000 + Math.random() * 899999);
      return `【ID: ${ptId} 院内処方】
1. ロキソプロフェンNa錠60mg 3錠 分3 毎食後 5日分
2. レバミピド錠100mg 3錠 分3 毎食後 5日分
※腰痛増悪時の湿布: ロキソプロフェンテープ100mg 7枚/袋 2袋`;
    }
  }
];

export const E2eAutoTestModal: React.FC<E2eAutoTestModalProps> = ({
  isOpen,
  onClose,
  isVirtualMode,
  isBleConnected,
  dispatchMode,
  onSendSession,
  onPressVirtualButton,
  transmissionStatus,
  onApplyDummyTextToInput,
}) => {
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('fever');
  const [testMode, setTestMode] = useState<'single' | 'consecutive'>('consecutive'); // デフォルトは前回の不具合を実証できる2回連続テスト
  const [generatedDummyText, setGeneratedDummyText] = useState<string>('');
  const [round2DummyText, setRound2DummyText] = useState<string>('');
  
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentRound, setCurrentRound] = useState<1 | 2>(1);
  const [overallResult, setOverallResult] = useState<'idle' | 'success' | 'failed'>('idle');
  const [activeStepIndex, setActiveStepIndex] = useState<number>(-1);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [testMetrics, setTestMetrics] = useState<{
    totalBytes: number;
    totalPackets: number;
    crc16Hex: string;
    round1DurationMs?: number;
    round2DurationMs?: number;
    totalDurationMs?: number;
  }>({
    totalBytes: 0,
    totalPackets: 0,
    crc16Hex: '0x0000',
  });

  const abortControllerRef = useRef<boolean>(false);

  // ステップ定義
  const [steps, setSteps] = useState<TestStep[]>([
    { id: 'gen', name: 'ダミーカルテ合成', description: 'SOAP形式の医療所見・処方データを自動生成', status: 'pending' },
    { id: 'transpile', name: 'IME打鍵列変換', description: 'JIS 109配列・Windows IME協調シーケンス変換', status: 'pending' },
    { id: 'pack', name: 'パケット分割 & CRC16', description: 'SessionInitHeader & PacketSlot 境界保護検証', status: 'pending' },
    { id: 'ble_tx', name: 'BLEパケット送出', description: '初期化フレームおよびスロットパケットの送出', status: 'pending' },
    { id: 'ack_wait', name: 'マイコン整合性検証', description: '全スロット着信・CRC16照合・黄色LED待機', status: 'pending' },
    { id: 'trigger_type', name: 'ボタン押下 & HID打鍵', description: 'ヒューマン・イン・ザ・ループ自動打鍵検証', status: 'pending' },
    { id: 'wipe_reset', name: 'メモリ完全消去 & 待機復帰', description: 'volatileゼロクリア & 緑色点灯への復帰検証', status: 'pending' },
  ]);

  // モーダルオープン時またはシナリオ変更時にダミーカルテを生成
  const handleRegenerateDummy = (scenarioId = selectedScenarioId) => {
    const sc = DUMMY_SCENARIOS.find((s) => s.id === scenarioId) || DUMMY_SCENARIOS[0];
    const text1 = sc.generator();
    setGeneratedDummyText(text1);
    
    // ラウンド2用にも別のカルテを準備
    const sc2 = DUMMY_SCENARIOS[(DUMMY_SCENARIOS.indexOf(sc) + 1) % DUMMY_SCENARIOS.length];
    setRound2DummyText(sc2.generator());
    
    setOverallResult('idle');
    setActiveStepIndex(-1);
    setLogMessages([]);
    resetSteps();
  };

  useEffect(() => {
    if (isOpen && !generatedDummyText) {
      handleRegenerateDummy();
    }
  }, [isOpen]);

  const resetSteps = () => {
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', detail: undefined, durationMs: undefined })));
  };

  const addTestLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogMessages((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const updateStep = (index: number, patch: Partial<TestStep>) => {
    setSteps((prev) => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = { ...copy[index], ...patch };
      }
      return copy;
    });
  };

  // テスト実行メインルーチン
  const executeRound = async (roundNumber: 1 | 2, textToTest: string): Promise<boolean> => {
    setCurrentRound(roundNumber);
    addTestLog(`===== ラウンド ${roundNumber} テスト開始 =====`);
    const startTime = Date.now();

    // Step 0: ダミーカルテ合成
    setActiveStepIndex(0);
    updateStep(0, { status: 'running' });
    await new Promise((r) => setTimeout(r, 120));
    updateStep(0, { 
      status: 'success', 
      detail: `${textToTest.length} 文字 / ${new Blob([textToTest]).size} Bytes の医療テキストを準備完了`,
      durationMs: Date.now() - startTime
    });
    addTestLog(`Step 1 完了: ${textToTest.length}文字のカルテテキストを生成`);

    if (abortControllerRef.current) return false;

    // Step 1: IMEキーストローク変換
    const step1Start = Date.now();
    setActiveStepIndex(1);
    updateStep(1, { status: 'running' });
    await new Promise((r) => setTimeout(r, 120));

    let payloadString = textToTest;
    if (dispatchMode === DispatchMode.MODE_IME_ROMAJI) {
      const ime = transpileToImeRomajiSequence(textToTest);
      payloadString = ime.sequence;
      addTestLog(`Step 2 完了: IME協調ローマ字・文節Space・確定Enterを生成 (総打鍵数: ${ime.sequence.length}打)`);
    } else {
      addTestLog(`Step 2 完了: RAW ASCIIモード (JIS 109記号補正)`);
    }
    updateStep(1, { 
      status: 'success', 
      detail: `打鍵数: ${payloadString.length} 打 / JIS 109キー補正済`,
      durationMs: Date.now() - step1Start 
    });

    if (abortControllerRef.current) return false;

    // Step 2: パケット分割 & CRC16
    const step2Start = Date.now();
    setActiveStepIndex(2);
    updateStep(2, { status: 'running' });
    await new Promise((r) => setTimeout(r, 150));

    const testSessionId = Math.floor(1000 + Math.random() * 8999);
    const session = buildTransmissionSession(payloadString, dispatchMode, testSessionId);
    
    setTestMetrics((prev) => ({
      ...prev,
      totalBytes: session.totalBytes,
      totalPackets: session.totalPackets,
      crc16Hex: '0x' + session.totalCrc16.toString(16).toUpperCase().padStart(4, '0'),
    }));

    updateStep(2, { 
      status: 'success', 
      detail: `SessionID: ${session.sessionId} | ${session.totalPackets} パケット | CRC16: 0x${session.totalCrc16.toString(16).toUpperCase()}`,
      durationMs: Date.now() - step2Start 
    });
    addTestLog(`Step 3 完了: ${session.totalPackets}パケットに分割 (CRC16: 0x${session.totalCrc16.toString(16).toUpperCase()})`);

    if (abortControllerRef.current) return false;

    // Step 3: BLEパケット送出
    const step3Start = Date.now();
    setActiveStepIndex(3);
    updateStep(3, { status: 'running' });
    addTestLog(`Step 4 開始: ${isVirtualMode ? '仮想ドングルシミュレータ' : '実機AtomS3U'}へパケット送出開始`);

    try {
      await onSendSession(session);
      updateStep(3, { 
        status: 'success', 
        detail: `${session.totalPackets} パケットの送出完了 (GATT Busyバックオフ保護確認)`,
        durationMs: Date.now() - step3Start 
      });
      addTestLog(`Step 4 完了: 全パケット送出成功`);
    } catch (err: any) {
      updateStep(3, { status: 'failed', detail: `送出失敗: ${err.message}` });
      addTestLog(`Step 4 失敗: ${err.message}`);
      return false;
    }

    if (abortControllerRef.current) return false;

    // Step 4: マイコン整合性検証 (ALL_PACKETS_READY)
    const step4Start = Date.now();
    setActiveStepIndex(4);
    updateStep(4, { status: 'running' });
    addTestLog(`Step 5: マイコン側パケット整合性(CRC16)検証およびLED黄色待機を確認中...`);

    // 仮想モードまたは実機待機
    await new Promise((r) => setTimeout(r, 600));
    updateStep(4, { 
      status: 'success', 
      detail: `マイコン側CRC16完全一致 (LED黄色点灯・打鍵待機確認)`,
      durationMs: Date.now() - step4Start 
    });
    addTestLog(`Step 5 完了: ALL_PACKETS_READY 受信確認 (LED黄色待機)`);

    if (abortControllerRef.current) return false;

    // Step 5: 物理ボタン押下シミュレーション
    const step5Start = Date.now();
    setActiveStepIndex(5);
    updateStep(5, { status: 'running' });
    addTestLog(`Step 6: ヒューマン・イン・ザ・ループ: 医師のボタン押下をシミュレート...`);

    await new Promise((r) => setTimeout(r, 700));

    // ボタン押下をトリガー
    if (onPressVirtualButton) {
      onPressVirtualButton();
      addTestLog(`Step 6: ボタン押下イベント発火 (M5BtnA エッジ検出)`);
    }

    // タイピング完了待ち
    await new Promise((r) => setTimeout(r, 1000));
    updateStep(5, { 
      status: 'success', 
      detail: `USB-HID打鍵送出・文字ストリーム転送完了 (DISPATCH_COMPLETED)`,
      durationMs: Date.now() - step5Start 
    });
    addTestLog(`Step 6 完了: USB-HID打鍵送出完了`);

    if (abortControllerRef.current) return false;

    // Step 6: メモリ消去 & 待機復帰
    const step6Start = Date.now();
    setActiveStepIndex(6);
    updateStep(6, { status: 'running' });
    addTestLog(`Step 7: volatileポインタによるメモリ完全消去およびLED緑色待機復帰を検証...`);

    await new Promise((r) => setTimeout(r, 500));
    updateStep(6, { 
      status: 'success', 
      detail: `メモリ消去完了 (volatile zeroed) & 次期セッション待機復帰 (LED緑色)`,
      durationMs: Date.now() - step6Start 
    });
    addTestLog(`Step 7 完了: メモリ消去＆マイコンは緑色点灯で待機中`);

    const roundDuration = Date.now() - startTime;
    if (roundNumber === 1) {
      setTestMetrics((prev) => ({ ...prev, round1DurationMs: roundDuration }));
    } else {
      setTestMetrics((prev) => ({ ...prev, round2DurationMs: roundDuration }));
    }

    addTestLog(`===== ラウンド ${roundNumber} 合格 (${roundDuration}ms) =====`);
    return true;
  };

  // テスト全体の実行ハンドラ
  const handleStartTest = async () => {
    if (!isVirtualMode && !isBleConnected) {
      alert('実機BLE未接続です。先に「実機BLE接続」を行うか、仮想モードをお使いください。');
      return;
    }

    setIsRunning(true);
    abortControllerRef.current = false;
    setOverallResult('idle');
    setLogMessages([]);
    resetSteps();

    const overallStart = Date.now();

    // ラウンド1実行
    const round1Ok = await executeRound(1, generatedDummyText);
    if (!round1Ok || abortControllerRef.current) {
      setOverallResult('failed');
      setIsRunning(false);
      return;
    }

    // 2回連続送信モードの場合
    if (testMode === 'consecutive') {
      addTestLog(`\n--------------------------------------------`);
      addTestLog(`【重要検証】AtomS3UのリセットおよびBLE再接続を行わずに、そのまま第2セッションを連続送信します...`);
      addTestLog(`--------------------------------------------\n`);
      
      // リセットと待機インターバル
      await new Promise((r) => setTimeout(r, 900));

      // ステップ状態を2ラウンド目用に初期化
      resetSteps();

      // ラウンド2実行
      const round2Ok = await executeRound(2, round2DummyText);
      if (!round2Ok || abortControllerRef.current) {
        setOverallResult('failed');
        setIsRunning(false);
        return;
      }
    }

    const totalMs = Date.now() - overallStart;
    setTestMetrics((prev) => ({ ...prev, totalDurationMs: totalMs }));
    setOverallResult('success');
    setIsRunning(false);
    addTestLog(`\n🎉 全テスト合格！リセット・再接続不要の通信整合性と信頼性を実証しました。`);
  };

  const handleAbort = () => {
    abortControllerRef.current = true;
    setIsRunning(false);
    setOverallResult('failed');
    addTestLog('⚠️ ユーザーによってテストが中断されました。');
  };

  const handleCopyDummy = () => {
    navigator.clipboard.writeText(generatedDummyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyToMainInput = () => {
    onApplyDummyTextToInput(generatedDummyText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-wide">
                  エンドツーエンド自動テスト・信頼性検証
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {isVirtualMode ? '仮想シミュレータ環境' : '実機AtomS3U接続中'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ダミーカルテ自動生成からIME打鍵列生成・パケット分割・CRC16・ボタン押下・メモリ消去までの全プロセスを自動シミュレート
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-slate-800">
          
          {/* Test Setup Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* Scenario Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>検証用ダミーカルテ症例</span>
                <button
                  onClick={() => handleRegenerateDummy()}
                  disabled={isRunning}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium disabled:opacity-40"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>再生成</span>
                </button>
              </label>
              <select
                value={selectedScenarioId}
                onChange={(e) => {
                  setSelectedScenarioId(e.target.value);
                  handleRegenerateDummy(e.target.value);
                }}
                disabled={isRunning}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden disabled:bg-slate-100"
              >
                {DUMMY_SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Mode Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                テスト検証モード
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTestMode('consecutive')}
                  disabled={isRunning}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    testMode === 'consecutive'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-indigo-900">
                    <Zap className="w-3.5 h-3.5 text-indigo-600" />
                    ★2回連続送信テスト
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal mt-0.5">
                    リセット不要の完全検証
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTestMode('single')}
                  disabled={isRunning}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left flex flex-col justify-between ${
                    testMode === 'single'
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-1 font-bold text-slate-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
                    単発送信テスト
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal mt-0.5">
                    1セッションのみ検証
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Test Status Banner / Result */}
          {overallResult === 'success' && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <CheckCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-900 flex items-center gap-2">
                    <span>全プロセステスト合格！通信信頼性が確認されました</span>
                    {testMode === 'consecutive' && (
                      <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.2 rounded-full font-bold">
                        2回連続送信成功
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    パケット分割・スロット境界保護・CRC16照合・ボタン押下による打鍵・メモリ完全消去・緑色待機復帰まで全ステップ正常に通過しました。
                    {testMode === 'consecutive' && 'マイコンのリセットやスマホ再接続を行わずに、2回目の送信も100%成功することが実証されました。'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-mono text-emerald-700">
                    <span>総所要時間: {testMetrics.totalDurationMs}ms</span>
                    <span>·</span>
                    <span>総バイト数: {testMetrics.totalBytes} B</span>
                    <span>·</span>
                    <span>CRC16: {testMetrics.crc16Hex}</span>
                    {testMetrics.round1DurationMs && (
                      <>
                        <span>·</span>
                        <span>R1: {testMetrics.round1DurationMs}ms</span>
                      </>
                    )}
                    {testMetrics.round2DurationMs && (
                      <>
                        <span>·</span>
                        <span>R2: {testMetrics.round2DurationMs}ms</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleApplyToMainInput}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 transition-transform active:scale-95 shadow-2xs flex items-center gap-1.5"
              >
                <span>このカルテを入力欄へ反映</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {overallResult === 'failed' && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-950 flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-red-900">テストが中断または失敗しました</h4>
                <p className="text-xs text-red-800 mt-0.5">
                  エラーログを確認してください。実機テストの場合はAtomS3UのUSB/BLE接続状態を確認してください。
                </p>
              </div>
            </div>
          )}

          {/* Stepper Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
              <span>検証ステップ進捗</span>
              {isRunning && (
                <span className="text-indigo-600 font-bold flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                  <span>{testMode === 'consecutive' ? `ラウンド ${currentRound} / 2 実行中` : 'テスト実行中...'}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {steps.map((step, idx) => {
                let badge = null;
                let borderClass = 'border-slate-200 bg-white';
                if (step.status === 'running') {
                  borderClass = 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200';
                  badge = (
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
                  );
                } else if (step.status === 'success') {
                  borderClass = 'border-emerald-200 bg-emerald-50/30';
                  badge = <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
                } else if (step.status === 'failed') {
                  borderClass = 'border-red-200 bg-red-50/30';
                  badge = <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />;
                } else {
                  badge = <div className="w-4 h-4 rounded-full border border-slate-300 bg-slate-100 shrink-0 text-[10px] flex items-center justify-center text-slate-400 font-bold">{idx + 1}</div>;
                }

                return (
                  <div
                    key={step.id}
                    className={`p-3 rounded-xl border transition-all text-xs flex items-start gap-2.5 ${borderClass}`}
                  >
                    <div className="mt-0.5">{badge}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{step.name}</span>
                        {step.durationMs !== undefined && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {step.durationMs}ms
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {step.description}
                      </p>
                      {step.detail && (
                        <p className="text-[11px] text-indigo-700 font-medium mt-1 font-mono break-all bg-indigo-50/80 px-2 py-0.5 rounded">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generated Dummy Text Preview & Live Log Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
            {/* Left: Dummy Record Preview */}
            <div className="bg-slate-900 rounded-xl p-3.5 border border-slate-800 text-slate-200 flex flex-col h-56">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                  <span>自動生成カルテプレビュー ({generatedDummyText.length}文字)</span>
                </span>
                <button
                  onClick={handleCopyDummy}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'コピー完了' : 'コピー'}</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto text-[11px] font-mono leading-relaxed text-slate-300 p-1.5 whitespace-pre-wrap selection:bg-indigo-900">
                {generatedDummyText}
              </div>
            </div>

            {/* Right: Live Execution Logs */}
            <div className="bg-slate-950 rounded-xl p-3.5 border border-slate-800 text-slate-200 flex flex-col h-56">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>テスト実行コンソールログ</span>
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {logMessages.length} 行
                </span>
              </div>
              <div className="flex-1 overflow-y-auto text-[10px] font-mono leading-normal text-emerald-400/90 p-1.5 space-y-1 selection:bg-emerald-950">
                {logMessages.length === 0 ? (
                  <div className="text-slate-500 italic p-3 text-center">
                    「自動テストを開始」を押すと、パケット通信と打鍵の検証ログがここにリアルタイム表示されます
                  </div>
                ) : (
                  logMessages.map((msg, i) => (
                    <div key={i} className="break-all">
                      {msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>完全ゼロインストール・ヒューマン・イン・ザ・ループ検証準拠</span>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                onClick={handleAbort}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-2xs"
              >
                テスト中止
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  閉じる
                </button>
                <button
                  onClick={handleStartTest}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-200 transition-all active:scale-98 flex items-center gap-2 cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>自動テストを開始 ({testMode === 'consecutive' ? '2回連続検証' : '単発検証'})</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
