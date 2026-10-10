import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileText, 
  Cpu, 
  FileCode, 
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check
} from 'lucide-react';
import { MacMenuBar } from './components/MacMenuBar';
import { MacDesktopIcons } from './components/MacDesktopIcons';
import { AboutMacModal } from './components/AboutMacModal';
import { MacCalculatorModal } from './components/MacCalculatorModal';
import { MacScrapbookModal } from './components/MacScrapbookModal';
import { MacKeyCapsModal } from './components/MacKeyCapsModal';
import { MacSoundControlModal } from './components/MacSoundControlModal';
import { MacBombDialog } from './components/MacBombDialog';
import { InputPane } from './components/InputPane';
import { DongleConsole } from './components/DongleConsole';
import { FirmwareHub } from './components/FirmwareHub';
import { VirtualDongleSimulator, LED_DEFINITIONS } from './utils/virtualDongle';
import { BleDongleManager, bleManager } from './utils/webBluetooth';
import { buildTransmissionSession, PreparedSession } from './utils/packetBuilder';
import { 
  SystemState, 
  LedStatus, 
  DispatchMode, 
  SessionTransmissionStatus, 
  CommunicationLogEntry 
} from './types';
import { MAIN_CPP_SOURCE, PLATFORMIO_INI_SOURCE, LATEST_FIRMWARE_VERSION } from './data/firmwareSource';
import { APP_NAME, APP_VERSION, FULL_VERSION_LABEL, getFormattedBuildDate } from './version';
import { 
  triggerMacScreenFlash, 
  playMacBeep, 
  playSosumi, 
  playStartupChime,
  playTrashSound
} from './utils/macAudio';
import { useAdaptiveLayout } from './hooks/useAdaptiveLayout';

const STORAGE_KEY_BUFFER = 'drvoice_dispatcher_buf';

export default function App() {
  // アダプティブレイアウト自動判定 ＆ 手動切替
  const {
    mode: adaptiveMode,
    deviceType,
    setMode: setAdaptiveMode,
    isLandscape,
    isMobile,
    isTablet,
    isDesktop
  } = useAdaptiveLayout();

  // ナビゲーションタブ: カルテ作成 / どんぐり君制御 / ファームウェア
  const [activeTab, setActiveTab] = useState<'input' | 'dongle' | 'firmware'>('input');

  // 入力テキスト (Local-first: 自動永続化)
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_BUFFER) || '';
    }
    return '';
  });

  const [dispatchMode, setDispatchMode] = useState<DispatchMode>(DispatchMode.MODE_HYBRID_UNICODE);

  // 接続＆ドングル稼働状態
  const [isVirtualMode, setIsVirtualMode] = useState<boolean>(true); // 初期値は仮想シミュレータ
  const [isBleConnected, setIsBleConnected] = useState<boolean>(false);
  const [isUsbMounted, setIsUsbMounted] = useState<boolean>(true);
  const [currentState, setCurrentState] = useState<SystemState>(SystemState.STATE_BLE_CONNECTED);
  const [ledStatus, setLedStatus] = useState<LedStatus>(LED_DEFINITIONS[SystemState.STATE_BLE_CONNECTED]);

  // 送信進捗・打鍵
  const [transmissionStatus, setTransmissionStatus] = useState<SessionTransmissionStatus | null>(null);
  const [isSending, setIsSending] = useState<boolean>(false);

  // リアルタイム通信ログ
  const [logs, setLogs] = useState<CommunicationLogEntry[]>([]);

  // System 7 Classic II モード (1ビットモノクロ)
  const [isMonoClassic, setIsMonoClassic] = useState<boolean>(true);

  //  この Mac について (About This Macintosh)
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  //  System 7 Desk Accessories
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [isScrapbookOpen, setIsScrapbookOpen] = useState<boolean>(false);
  const [isKeyCapsOpen, setIsKeyCapsOpen] = useState<boolean>(false);
  const [isSoundControlOpen, setIsSoundControlOpen] = useState<boolean>(false);
  const [isBombAlertOpen, setIsBombAlertOpen] = useState<boolean>(false);
  const [bombDialogConfig, setBombDialogConfig] = useState<{
    title: string;
    message: string;
    errorCode: string;
    action: () => void;
  }>({
    title: 'カルテ全消去 (Empty Trash)',
    message: '入力中のカルテテキストをすべて消去してゴミ箱を空にしますか？',
    errorCode: 'ID = 02',
    action: () => {},
  });

  // Desk Accessories モーダル連動
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCameraOcrOpen, setIsCameraOcrOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isImeBoostModalOpen, setIsImeBoostModalOpen] = useState(false);
  const [isPreprocessorModalOpen, setIsPreprocessorModalOpen] = useState(false);
  const [isCoprocessorModalOpen, setIsCoprocessorModalOpen] = useState(false);
  const [isMedicalSearchOpen, setIsMedicalSearchOpen] = useState(false);

  // 通知バナー
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    action?: {
      label: string;
      onClick?: () => void;
      href?: string;
    };
  } | null>(null);

  // 参照
  const virtualDongleRef = useRef<VirtualDongleSimulator | null>(null);
  const bleManagerRef = useRef<BleDongleManager | null>(null);

  // ログ追加
  const addLog = useCallback((direction: 'tx' | 'rx' | 'sys', tag: string, message: string, hex?: string) => {
    const entry: CommunicationLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      direction,
      tag,
      message,
      hex,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 150)]);
  }, []);

  // 起動時の初期化
  useEffect(() => {
    // 仮想ドングル
    const sim = new VirtualDongleSimulator();
    sim.setListener({
      onStateChange: (state, led) => {
        setCurrentState(state);
        setLedStatus(led);
      },
      onAckGenerated: (ackStr) => {
        setTransmissionStatus((prev) => (prev ? { ...prev, lastAck: ackStr } : null));
        if (ackStr.includes('ALL_PACKETS_READY')) {
          setTransmissionStatus((prev) => (prev ? { ...prev, status: 'waiting_button', progress: 100 } : null));
          playMacBeep();
        } else if (ackStr.includes('DISPATCH_STARTED')) {
          setTransmissionStatus((prev) => (prev ? { ...prev, status: 'typing' } : null));
        } else if (ackStr.includes('USB_REPORTS_SENT')) {
          setTransmissionStatus((prev) => (prev ? { ...prev, status: 'completed' } : null));
          setIsSending(false);
          triggerMacScreenFlash();
          playSosumi();

          setTimeout(() => {
            setTransmissionStatus((cur) => (cur?.status === 'completed' ? null : cur));
          }, 3500);
        }
      },
      onKeystroke: (_char, _acc) => {},
      onMemoryWiped: () => {
        addLog('sys', 'SECURE', 'AtomS3U メモリ完全消去 (volatile pointer zeroing)');
      },
      onLog: (direction, tag, msg) => {
        addLog(direction, tag, msg);
      },
    });

    virtualDongleRef.current = sim;
    addLog('sys', 'INIT', `${FULL_VERSION_LABEL} 仮想 AtomS3U ドングル初期化完了 (Build: ${getFormattedBuildDate()})`);

    // 実機BLEマネージャー (全モーダルと共有するシングルトン)
    const ble = bleManager;
    ble.setLogListener((dir, tag, msg, hex) => {
      addLog(dir, tag, msg, hex);
    });

    ble.addAckListener((event) => {
      if (event.ackType === 'ALL_PACKETS_READY') {
        setCurrentState(SystemState.STATE_READY_TO_TYPE);
        setLedStatus(LED_DEFINITIONS[SystemState.STATE_READY_TO_TYPE]);
        setTransmissionStatus((prev) => (prev ? { ...prev, status: 'waiting_button', progress: 100 } : null));
        playMacBeep();
      } else if (event.ackType === 'DISPATCH_STARTED') {
        setCurrentState(SystemState.STATE_TYPING);
        setLedStatus(LED_DEFINITIONS[SystemState.STATE_TYPING]);
        setTransmissionStatus((prev) => (prev ? { ...prev, status: 'typing' } : null));
      } else if (event.ackType === 'USB_REPORTS_SENT' || event.ackType === 'WIPED') {
        setCurrentState(SystemState.STATE_BLE_CONNECTED);
        setLedStatus(LED_DEFINITIONS[SystemState.STATE_BLE_CONNECTED]);
        setTransmissionStatus((prev) => (prev ? { ...prev, status: 'completed' } : null));
        setIsSending(false);

        if (event.ackType === 'USB_REPORTS_SENT') {
          triggerMacScreenFlash();
          playSosumi();
          addLog('sys', 'USB_DONE', '【USB打鍵完了】どんぐり君がWindows電子カルテPCへUSBキーストローク列を送出しました');
        }

        setBannerNotice({
          type: 'success',
          message: 'カルテ打鍵完了！どんぐり君は緑色点灯で待機中。続けて次のカルテを作成・送信できます。',
        });
        setTimeout(() => {
          setTransmissionStatus((cur) => (cur?.status === 'completed' ? null : cur));
        }, 3500);
      } else if (event.ackType === 'PHYSICAL_BTN_PRESSED') {
        addLog('sys', 'BTN', '★AtomS3U 本体正面ボタンの押下をリアルタイム検知！');
      } else if (event.ackType === 'USB_MOUNTED') {
        setIsUsbMounted(true);
        addLog('sys', 'USB', '実機AtomS3UがUSBキーボードとしてマウントされました');
      } else if (event.ackType === 'USB_UNMOUNTED') {
        setIsUsbMounted(false);
        addLog('sys', 'USB', '実機AtomS3UのUSB接続が外れました (紫点灯)');
      }
    });

    ble.setOnDisconnect(() => {
      setIsBleConnected(false);
      setCurrentState(SystemState.STATE_WAITING_BLE);
      setLedStatus(LED_DEFINITIONS[SystemState.STATE_WAITING_BLE]);
      setBannerNotice({
        type: 'info',
        message: 'AtomS3U とのBLE接続が切断されました。必要に応じて再接続してください。',
      });
    });
    bleManagerRef.current = ble;
  }, [addLog]);

  // 実機BLE接続
  const handleConnectBle = async () => {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      setBannerNotice({
        type: 'warning',
        message: 'プレビュー枠内（iframe）ではブラウザのセキュリティ制限によりBluetooth接続が制限されています。右のボタンから新しいタブで開くか、仮想モードをお使いください。',
        action: {
          label: '新しいタブで開く (実機BLE用)',
          href: window.location.href,
        },
      });
      addLog('sys', 'BLE_INFO', 'iframe制限を検知。実機BLE接続には別タブまたはスマートフォンをご使用ください。');
      return;
    }

    if (!bleManagerRef.current) return;
    try {
      setIsVirtualMode(false);
      setBannerNotice(null);
      playMacBeep();
      const ok = await bleManagerRef.current.connect();
      if (ok) {
        setIsBleConnected(true);
        setCurrentState(SystemState.STATE_BLE_CONNECTED);
        setLedStatus(LED_DEFINITIONS[SystemState.STATE_BLE_CONNECTED]);
        playStartupChime();
        setBannerNotice({
          type: 'success',
          message: 'AtomS3U (どんぐり君) との双方向BLE接続が確立しました！本体LED緑色点灯中。',
        });
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('DEVICE_CANCELLED') || errMsg.includes('User cancelled')) {
        setBannerNotice({
          type: 'info',
          message: 'デバイスの選択がキャンセルされました。',
        });
      } else {
        setBannerNotice({
          type: 'error',
          message: `Bluetooth接続エラー: ${errMsg}`,
        });
        addLog('sys', 'BLE_ERR', errMsg);
      }
    }
  };

  // 仮想モード切替
  const handleToggleVirtualMode = () => {
    playMacBeep();
    if (isBleConnected && bleManagerRef.current) {
      bleManagerRef.current.disconnect();
      setIsBleConnected(false);
    }
    const newVirtual = !isVirtualMode;
    setIsVirtualMode(newVirtual);
    if (newVirtual) {
      setCurrentState(SystemState.STATE_BLE_CONNECTED);
      setLedStatus(LED_DEFINITIONS[SystemState.STATE_BLE_CONNECTED]);
      addLog('sys', 'MODE', '仮想ドングルシミュレータに切り替えました。');
      setBannerNotice({
        type: 'info',
        message: '仮想ドングルシミュレータが動作中です。実機がなくても全機能をテストできます。',
      });
    } else {
      setCurrentState(SystemState.STATE_WAITING_BLE);
      setLedStatus(LED_DEFINITIONS[SystemState.STATE_WAITING_BLE]);
      addLog('sys', 'MODE', '実機BLE接続待機モードに切り替えました。');
      setBannerNotice(null);
    }
  };

  // セッション送信
  const handleSendSession = async (session: PreparedSession) => {
    setIsSending(true);
    setTransmissionStatus({
      sessionId: session.sessionId,
      totalPackets: session.totalPackets,
      totalBytes: session.totalBytes,
      totalCrc16: session.totalCrc16,
      mode: session.mode,
      slots: session.slotPackets.map((s) => ({
        seqNo: s.seqNo,
        received: false,
        length: s.payloadLen,
        crc16: s.chunkCrc16,
        preview: new TextDecoder().decode(s.payloadBytes).slice(0, 20),
      })),
      progress: 5,
      status: 'sending',
      startTime: Date.now(),
    });

    if (isVirtualMode) {
      const sim = virtualDongleRef.current;
      if (sim) {
        addLog('tx', 'INIT', `仮想初期化フレーム送出 (SID:${session.sessionId}, Pkts:${session.totalPackets}, Bytes:${session.totalBytes})`);
        sim.receiveInitFrame(session.initPacket);
        await new Promise((r) => setTimeout(r, 50));

        for (let i = 0; i < session.slotPackets.length; i++) {
          const slot = session.slotPackets[i];
          const pct = Math.floor(10 + ((i + 1) / session.slotPackets.length) * 80);
          setTransmissionStatus((prev) => (prev ? { ...prev, progress: pct } : null));

          addLog('tx', `SLOT#${i}`, `スロット #${i} 送出 (${slot.payloadLen}B, CRC:0x${slot.chunkCrc16.toString(16).toUpperCase()})`);
          sim.receiveSlotFrame(slot.fullPacket);
          await new Promise((r) => setTimeout(r, 40));
        }

        setTransmissionStatus((prev) => (prev ? { ...prev, progress: 100, status: 'waiting_button' } : null));
        setIsSending(false);
        playMacBeep();
      }
    } else {
      const ble = bleManagerRef.current;
      if (!ble) {
        setBannerNotice({ type: 'warning', message: 'BLEマネージャーが準備できていません。' });
        setIsSending(false);
        setTransmissionStatus(null);
        return;
      }

      try {
        await ble.transmitSession(session, (pct, stage) => {
          setTransmissionStatus((prev) => (prev ? { ...prev, progress: pct, lastAck: stage } : null));
        });
        setIsSending(false);
        setTransmissionStatus((prev) => (prev ? { ...prev, progress: 100, status: 'waiting_button' } : null));
        playMacBeep();
      } catch (err: any) {
        setTransmissionStatus((prev) => (prev ? { ...prev, status: 'failed', errorMessage: err.message } : null));
        setBannerNotice({ type: 'error', message: `パケット転送エラー: ${err.message}` });
        setIsSending(false);
      }
    }
  };

  // ボタン押下 (実機/仮想トリガー)
  const handlePressButton = async () => {
    playMacBeep();
    if (isVirtualMode) {
      virtualDongleRef.current?.pressPhysicalButton();
    } else {
      if (bleManagerRef.current && bleManagerRef.current.isConnected()) {
        try {
          addLog('tx', 'CMD', '画面から実機ドングルへ打鍵送出指示 (CMD:TRIGGER) を送信...');
          await bleManagerRef.current.sendRemoteTrigger();
        } catch (e: any) {
          addLog('sys', 'ERR', `リモート打鍵指示エラー: ${e.message}`);
        }
      }
    }
  };

  // 診断系
  const handleSendPing = async (): Promise<{ rttMs: number }> => {
    if (isVirtualMode) {
      await new Promise((r) => setTimeout(r, 15));
      addLog('sys', 'PING', '仮想ドングル Ping 応答完了 (RTT: 15ms)');
      return { rttMs: 15 };
    }
    if (bleManagerRef.current) return bleManagerRef.current.sendPing();
    throw new Error('BLE未接続です');
  };

  const handleSendWipe = async (): Promise<boolean> => {
    if (isVirtualMode) {
      virtualDongleRef.current?.secureWipeMessageContext();
      return true;
    }
    if (bleManagerRef.current) return bleManagerRef.current.sendWipe();
    throw new Error('BLE未接続です');
  };

  const handleSendLedTest = async (): Promise<boolean> => {
    if (isVirtualMode) {
      setLedStatus({ colorName: '赤色', hex: '#EF4444', rgb: [239, 68, 68], description: 'LEDテスト' });
      setTimeout(() => setLedStatus({ colorName: '緑色', hex: '#10B981', rgb: [16, 185, 129], description: 'LEDテスト' }), 150);
      setTimeout(() => setLedStatus({ colorName: '青色', hex: '#3B82F6', rgb: [59, 130, 246], description: 'LEDテスト' }), 300);
      setTimeout(() => setLedStatus(LED_DEFINITIONS[currentState]), 450);
      return true;
    }
    if (bleManagerRef.current) return bleManagerRef.current.sendLedTest();
    throw new Error('BLE未接続です');
  };

  const handleRequestStatus = async (): Promise<string> => {
    if (isVirtualMode) {
      return `仮想モード稼働中 (USB: ${isUsbMounted ? 'マウント済' : '未接続'}, State: ${currentState})`;
    }
    if (bleManagerRef.current) return bleManagerRef.current.requestStatus();
    throw new Error('BLE未接続です');
  };

  const handleRequestDictInfo = async (): Promise<string> => {
    if (isVirtualMode) {
      addLog('sys', 'DICT', '仮想 ドングル SPIFFS/Flash 辞書: med_terms.bin (48,920件) / kanji_yomi.bin (6,528文字) / minds_cds.bin (512B固定長 Mindsガイドライン) 正常マウント中');
      return 'SPIFFS_OK: 医薬品・傷病名マスター (med_terms.bin: 48,920件) / JIS全漢字音訓読み (kanji_yomi.bin: 6,528文字) / Minds臨床ガイドライン (minds_cds.bin: 512B固定長)';
    }
    if (bleManagerRef.current) {
      const resp = await bleManagerRef.current.requestDictInfo();
      addLog('rx', 'DICT_RESP', `実機 AtomS3U 辞書応答: ${resp}`);
      if (resp.startsWith('SPIFFS_OK')) {
        return `SPIFFS 正常稼働: ${resp}`;
      }
      return resp;
    }
    throw new Error('BLE未接続です');
  };

  const handleToggleUsbMounted = () => {
    if (virtualDongleRef.current && isVirtualMode) {
      const next = !isUsbMounted;
      setIsUsbMounted(next);
      virtualDongleRef.current.setUsbMounted(next);
      addLog('sys', 'USB', next ? 'USBキーボードがマウントされました。' : 'USBが抜去されました (紫点灯・送出拒絶)');
    }
  };

  // メニュー操作用ハンドラ
  const handleNewChart = () => {
    if (inputText.trim()) {
      if (confirm('新規カルテを作成しますか？現在の入力内容は消去されます。')) {
        setInputText('');
        localStorage.removeItem(STORAGE_KEY_BUFFER);
        playSosumi();
      }
    } else {
      setInputText('');
    }
    setActiveTab('input');
  };

  const handleInsertSoap = () => {
    const soap = `【主訴】\n3日前からの咳嗽と発熱。市販薬無効。\n\n【客観的所見】\nKT: 37.8℃, HR: 78bpm, BP: 122/78 mmHg, SpO2: 98%\n咽頭発赤あり、扁桃肥大なし。胸部ラ音なし。\n\n【評価】\n急性上気道炎 (疑い)\n\n【処方・方針】\n対症療法中心。解熱鎮痛薬処方。`;
    if (inputText.trim()) {
      if (confirm('現在の入力をSOAP形式で置き換えますか？（キャンセルで末尾追記）')) {
        setInputText(soap);
      } else {
        setInputText((prev) => `${prev}\n\n${soap}`);
      }
    } else {
      setInputText(soap);
    }
    setActiveTab('input');
    playMacBeep();
  };

  const handleEmptyTrash = () => {
    if (!inputText.trim()) {
      playMacBeep();
      setBannerNotice({
        type: 'info',
        message: 'ゴミ箱はすでに空です。消去するカルテテキストがありません。',
      });
      return;
    }
    setBombDialogConfig({
      title: 'カルテ全消去 (Empty Trash)',
      message: '入力中のカルテテキストをすべて消去してゴミ箱を空にしますか？\n消去されたテキストは元に戻せません。',
      errorCode: 'ID = 02 (Zero Wipe)',
      action: () => {
        setInputText('');
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_BUFFER);
        }
        playTrashSound();
        triggerMacScreenFlash();
        setBannerNotice({
          type: 'success',
          message: 'カルテテキストをゴミ箱へ全消去しました。',
        });
      },
    });
    setIsBombAlertOpen(true);
  };

  const handleTestBomb = () => {
    setBombDialogConfig({
      title: 'システムエラー (System Bomb Alert)',
      message: '深刻なエラーが発生しました。作業内容を保存してシステムを再起動することを推奨します。\n（※これはClassic Macオヤジ医師向けのノスタルジック演出テストです😊）',
      errorCode: 'ID = 01 (Bus Error)',
      action: () => {
        playSosumi();
        triggerMacScreenFlash();
      },
    });
    setIsBombAlertOpen(true);
  };

  const handleInsertSnippet = (snippet: string) => {
    setActiveTab('input');
    setInputText((prev) => {
      const next = prev ? (prev.endsWith('\n') ? prev + snippet : prev + '\n' + snippet) : snippet;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_BUFFER, next);
      }
      return next;
    });
    setBannerNotice({
      type: 'info',
      message: 'デスクアクセサリからカルテに挿入しました。',
    });
  };

  const handleTransmitDirect = () => {
    if (!inputText.trim()) {
      playMacBeep();
      return;
    }
    setActiveTab('input');
    const session = buildTransmissionSession(inputText, dispatchMode);
    handleSendSession(session);
  };

  return (
    <div
      className={`min-h-screen ${isMonoClassic ? 'classic-desktop' : 'bg-slate-100'} flex flex-col ${isMobile ? 'pb-20' : 'pb-16 md:pb-6'} select-none`}
      style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}
    >
      {/* ======================================================================= */}
      {/* 1. Macintosh System 7 Menu Bar (画面最上部メニューバー) */}
      {/* ======================================================================= */}
      <MacMenuBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isBleConnected={isBleConnected}
        isVirtualMode={isVirtualMode}
        onConnectBle={handleConnectBle}
        onToggleVirtualMode={handleToggleVirtualMode}
        onNewChart={handleNewChart}
        onInsertSoap={handleInsertSoap}
        onOpenCoprocessor={() => { setActiveTab('input'); setIsCoprocessorModalOpen(true); }}
        onOpenMedicalSearch={() => { setActiveTab('input'); setIsMedicalSearchOpen(true); }}
        onOpenTemplates={() => { setActiveTab('input'); setIsTemplateModalOpen(true); }}
        onOpenAiAssist={() => { setActiveTab('input'); setIsAiModalOpen(true); }}
        onOpenOcr={() => { setActiveTab('input'); setIsCameraOcrOpen(true); }}
        onOpenCds={() => { setActiveTab('input'); }}
        onOpenImeBoost={() => { setActiveTab('input'); setIsImeBoostModalOpen(true); }}
        onOpenPreprocessor={() => { setActiveTab('input'); setIsPreprocessorModalOpen(true); }}
        onOpenAbout={() => setIsAboutModalOpen(true)}
        onOpenCalculator={() => setIsCalculatorOpen(true)}
        onOpenScrapbook={() => setIsScrapbookOpen(true)}
        onOpenKeyCaps={() => setIsKeyCapsOpen(true)}
        onOpenSoundControl={() => setIsSoundControlOpen(true)}
        onOpenBombAlert={handleTestBomb}
        onTransmit={handleTransmitDirect}
        onPressDongleBtn={handlePressButton}
        onWipeRam={() => handleSendWipe()}
        onEmptyTrash={handleEmptyTrash}
        isMonoClassic={isMonoClassic}
        setIsMonoClassic={setIsMonoClassic}
        deviceType={deviceType}
        adaptiveMode={adaptiveMode}
        onSelectAdaptiveMode={setAdaptiveMode}
      />

      {/* ======================================================================= */}
      {/* 2. デスクトップ アイコン群 (右側: Macintosh HD, どんぐり君, FW, ゴミ箱) */}
      {/* ======================================================================= */}
      <MacDesktopIcons
        onOpenInput={() => setActiveTab('input')}
        onOpenDongle={() => setActiveTab('dongle')}
        onOpenFirmware={() => setActiveTab('firmware')}
        onOpenCoprocessor={() => { setActiveTab('input'); setIsCoprocessorModalOpen(true); }}
        onClearChart={handleEmptyTrash}
        hasChartContent={Boolean(inputText.trim())}
        deviceType={deviceType}
      />

      {/* ======================================================================= */}
      {/* 3. デスクトップ 作業領域 (メインウィンドウ) */}
      {/* ======================================================================= */}
      <main className={`flex-1 ${isMobile ? 'w-full px-1.5 py-1.5' : isTablet ? 'max-w-3xl w-full mx-auto px-3 py-2' : 'max-w-4xl w-full mx-auto px-4 py-3'} space-y-2.5 sm:space-y-3`}>
        {/* System 7 ウィンドウ切替タブ (Window Switcher - 横スクロール対応) */}
        <div className="flex items-center gap-1 border-b border-black pb-1 select-none text-xs overflow-x-auto whitespace-nowrap scrollbar-none">
          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
            }}
            className={`mac-btn shrink-0 ${activeTab === 'input' ? 'bg-black text-white font-bold' : ''}`}
          >
            <span>📄 カルテ送信</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('dongle');
            }}
            className={`mac-btn shrink-0 ${activeTab === 'dongle' ? 'bg-black text-white font-bold' : ''}`}
          >
            <span>🌰 どんぐり君</span>
            <span
              className="w-2 h-2 rounded-full border border-black inline-block ml-1"
              style={{ backgroundColor: ledStatus.hex }}
            />
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('firmware');
            }}
            className={`mac-btn shrink-0 ${activeTab === 'firmware' ? 'bg-black text-white font-bold' : ''}`}
          >
            <span>💾 FW {LATEST_FIRMWARE_VERSION}</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setIsCoprocessorModalOpen(true);
            }}
            className="mac-btn shrink-0 bg-yellow-100 hover:bg-yellow-200 border border-black font-bold flex items-center gap-1 text-xs shadow-[1px_1px_0_#000]"
            title="閉域網電カルから過去カルテを吸い上げ、スマホAIで要約し、書き戻す"
          >
            <span>📥 双方向コプロセッサ</span>
            <span className="text-[9px] bg-black text-white px-1 font-mono">v19.1</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
              setIsMedicalSearchOpen(true);
            }}
            className="mac-btn shrink-0 bg-emerald-50 hover:bg-emerald-100 border border-black font-bold flex items-center gap-1 text-xs shadow-[1px_1px_0_#000]"
            title="Minds 111疾患・検査値・診療行為・腎機能減量・医薬品・病名を即時検索"
          >
            <span>📚 医療データ検索</span>
          </button>
        </div>

        {/* System 7 スタイル アラート・通知バナー */}
        {bannerNotice && (
          <div className="bg-white border-2 border-black p-2.5 shadow-[3px_3px_0_#000] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">
                {bannerNotice.type === 'error' ? '⚠️' : bannerNotice.type === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span className="leading-relaxed">{bannerNotice.message}</span>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              {bannerNotice.action && bannerNotice.action.href && (
                <a
                  href={bannerNotice.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mac-btn font-bold inline-flex items-center gap-1"
                >
                  <span>{bannerNotice.action.label}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {bannerNotice.action && bannerNotice.action.onClick && (
                <button
                  onClick={bannerNotice.action.onClick}
                  className="mac-btn font-bold"
                >
                  {bannerNotice.action.label}
                </button>
              )}
              <button
                onClick={() => setBannerNotice(null)}
                className="mac-btn text-[10px] px-1.5 py-0.2"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* アクティブウィンドウのレンダリング */}
        {activeTab === 'input' && (
          <InputPane
            inputText={inputText}
            setInputText={setInputText}
            dispatchMode={dispatchMode}
            setDispatchMode={setDispatchMode}
            onSendSession={handleSendSession}
            transmissionStatus={transmissionStatus}
            isSending={isSending}
            isBleConnected={isBleConnected}
            isVirtualMode={isVirtualMode}
            onConnectBle={handleConnectBle}
            onPressVirtualButton={handlePressButton}
            onNavigateTab={setActiveTab}
            isAiModalOpen={isAiModalOpen}
            setIsAiModalOpen={setIsAiModalOpen}
            isCameraOcrOpen={isCameraOcrOpen}
            setIsCameraOcrOpen={setIsCameraOcrOpen}
            isTemplateModalOpen={isTemplateModalOpen}
            setIsTemplateModalOpen={setIsTemplateModalOpen}
            isImeBoostModalOpen={isImeBoostModalOpen}
            setIsImeBoostModalOpen={setIsImeBoostModalOpen}
            isPreprocessorModalOpen={isPreprocessorModalOpen}
            setIsPreprocessorModalOpen={setIsPreprocessorModalOpen}
            isCoprocessorModalOpen={isCoprocessorModalOpen}
            setIsCoprocessorModalOpen={setIsCoprocessorModalOpen}
            isMedicalSearchOpen={isMedicalSearchOpen}
            setIsMedicalSearchOpen={setIsMedicalSearchOpen}
            deviceType={deviceType}
            isLandscape={isLandscape}
          />
        )}

        {activeTab === 'dongle' && (
          <DongleConsole
            currentState={currentState}
            ledStatus={ledStatus}
            isUsbMounted={isUsbMounted}
            isBleConnected={isBleConnected}
            isVirtualMode={isVirtualMode}
            transmissionStatus={transmissionStatus}
            logs={logs}
            onPressButton={handlePressButton}
            onClearLogs={() => setLogs([])}
            onToggleUsbMounted={handleToggleUsbMounted}
            onSendPing={handleSendPing}
            onSendWipe={handleSendWipe}
            onSendLedTest={handleSendLedTest}
            onRequestStatus={handleRequestStatus}
            onRequestDictInfo={handleRequestDictInfo}
            onClose={() => setActiveTab('input')}
          />
        )}

        {activeTab === 'firmware' && (
          <FirmwareHub
            mainCppCode={MAIN_CPP_SOURCE}
            platformioIniCode={PLATFORMIO_INI_SOURCE}
            onClose={() => setActiveTab('input')}
          />
        )}
      </main>

      {/* ======================================================================= */}
      {/* 4. モバイル用 下部固定バー (Adaptive Touch Navigation) */}
      {/* ======================================================================= */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-black grid grid-cols-5 items-center h-12 pb-[env(safe-area-inset-bottom)] px-0.5 text-[10px] select-none shadow-[0_-1px_0_#000]">
          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer ${
              activeTab === 'input' ? 'bg-black text-white font-bold' : 'hover:bg-gray-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>カルテ</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
              setIsAiModalOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer hover:bg-gray-100"
          >
            <span className="text-xs">🤖</span>
            <span>AI整形</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
              setIsCameraOcrOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer hover:bg-gray-100"
          >
            <span className="text-xs">📷</span>
            <span>OCR</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('input');
              setIsCoprocessorModalOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer bg-yellow-50 hover:bg-yellow-100 font-bold"
          >
            <span className="text-xs">📥</span>
            <span>要約</span>
          </button>

          <button
            onClick={() => {
              playMacBeep();
              setActiveTab('dongle');
            }}
            className={`flex flex-col items-center justify-center gap-0.5 h-full cursor-pointer ${
              activeTab === 'dongle' ? 'bg-black text-white font-bold' : 'hover:bg-gray-100'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>ドングル</span>
          </button>
        </nav>
      )}

      {/* 常設フッター・バージョンステータスバー (デスクトップ/タブレット) */}
      {!isMobile && (
        <footer className="fixed bottom-0 left-0 right-0 h-6 bg-slate-200/95 border-t border-slate-300 backdrop-blur-xs px-3 flex items-center justify-between text-[11px] text-slate-600 select-none z-30">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-800">{FULL_VERSION_LABEL}</span>
            <span className="text-slate-400">|</span>
            <span>ビルド: {getFormattedBuildDate()}</span>
            <span className="text-slate-400">|</span>
            <span>AI: WebLLM (Qwen2.5) / 完全ローカルOCR</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full inline-block border border-slate-400"
                style={{ backgroundColor: ledStatus.hex }}
              />
              <span className="font-medium text-slate-700">
                {isBleConnected ? '実機BLE接続' : isVirtualMode ? '仮想ドングル' : 'BLE待機中'}
              </span>
            </span>
            <span className="text-slate-400">|</span>
            <span>AtomS3U 8MB (Zero-RAM SPIFFS)</span>
          </div>
        </footer>
      )}

      {/* ======================================================================= */}
      {/* ======================================================================= */}
      {/* 5. 「この Mac について (About This Macintosh)」モーダル */}
      {/* ======================================================================= */}
      <AboutMacModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        isVirtualMode={isVirtualMode}
        isBleConnected={isBleConnected}
      />

      {/* ======================================================================= */}
      {/* 6. System 7 Desk Accessories (計算機, スクラップブック, キー配列, サウンド操作盤) */}
      {/* ======================================================================= */}
      <MacCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        onInsertText={handleInsertSnippet}
      />

      <MacScrapbookModal
        isOpen={isScrapbookOpen}
        onClose={() => setIsScrapbookOpen(false)}
        onInsertText={handleInsertSnippet}
      />

      <MacKeyCapsModal
        isOpen={isKeyCapsOpen}
        onClose={() => setIsKeyCapsOpen(false)}
        onInsertText={handleInsertSnippet}
      />

      <MacSoundControlModal
        isOpen={isSoundControlOpen}
        onClose={() => setIsSoundControlOpen(false)}
      />

      {/* ======================================================================= */}
      {/* 7. System 7 爆弾 / 確認ダイアログ (Bomb Dialog) */}
      {/* ======================================================================= */}
      <MacBombDialog
        isOpen={isBombAlertOpen}
        onClose={() => setIsBombAlertOpen(false)}
        onConfirmRestart={bombDialogConfig.action}
        title={bombDialogConfig.title}
        message={bombDialogConfig.message}
        errorCode={bombDialogConfig.errorCode}
      />
    </div>
  );
}
