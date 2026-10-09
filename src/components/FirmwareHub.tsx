import React, { useState } from 'react';
import { 
  FileCode, 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  Terminal, 
  ShieldCheck, 
  Cpu
} from 'lucide-react';
import { 
  LATEST_FIRMWARE_VERSION, 
  FIRMWARE_RELEASE_TITLE, 
  FIRMWARE_RELEASE_DATE,
  COMPILE_PIPELINE_SH_SOURCE,
  COMPILE_PIPELINE_PY_SOURCE,
  PARTITIONS_8MB_CSV_SOURCE,
  FLASH_ATOMS3U_PS1_SOURCE
} from '../data/firmwareSource';
import { playMacBeep } from '../utils/macAudio';

interface FirmwareHubProps {
  mainCppCode: string;
  platformioIniCode: string;
  onClose?: () => void;
}

export const FirmwareHub: React.FC<FirmwareHubProps> = ({
  mainCppCode,
  platformioIniCode,
  onClose,
}) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'main' | 'ini' | 'pipeline' | 'py' | 'part' | 'ps1'>('main');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    let textToCopy = mainCppCode;
    if (activeCodeTab === 'pipeline') textToCopy = COMPILE_PIPELINE_SH_SOURCE;
    else if (activeCodeTab === 'py') textToCopy = COMPILE_PIPELINE_PY_SOURCE;
    else if (activeCodeTab === 'part') textToCopy = PARTITIONS_8MB_CSV_SOURCE;
    else if (activeCodeTab === 'ini') textToCopy = platformioIniCode;
    else if (activeCodeTab === 'ps1') textToCopy = FLASH_ATOMS3U_PS1_SOURCE;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    playMacBeep();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    playMacBeep();
  };

  return (
    <div className="space-y-4" style={{ fontFamily: "'DotGothic16', 'Monaco', monospace" }}>
      {/* ========================================================================= */}
      {/* ★ SYSTEM 7 ウィンドウ: ファームウェア v10.0 */}
      {/* ========================================================================= */}
      <div className="mac-window w-full">
        {/* ウィンドウ タイトルバー */}
        <div className="h-6 mac-title-stripes border-b border-black flex items-center justify-between px-2 select-none">
          <button
            onClick={() => {
              playMacBeep();
              if (onClose) onClose();
            }}
            className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] active:bg-black cursor-pointer flex items-center justify-center shrink-0"
            title="閉じる"
          />

          <div className="bg-white border border-black px-2 sm:px-3 py-0.2 font-bold text-xs tracking-wider flex items-center gap-1 sm:gap-2 truncate min-w-0">
            <span className="truncate">ファームウェア {LATEST_FIRMWARE_VERSION}</span>
          </div>

          <div className="w-3.5 h-3.5 border border-black bg-white shadow-[1px_1px_0_#000] flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 border border-black" />
          </div>
        </div>

        {/* ウィンドウ内部 */}
        <div className="p-3 bg-white space-y-3">
          {/* リリース情報ヘッダー */}
          <div className="border border-black p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-sm">
                DrVoice どんぐり君 AtomS3U ファームウェア {FIRMWARE_RELEASE_TITLE}
              </div>
              <div className="text-gray-700 text-xs mt-0.5">
                リリース日: {FIRMWARE_RELEASE_DATE} | 対象: M5Stack AtomS3U (ESP32-S3FN8 / 8MB Flash / No PSRAM)
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload('platformio.ini', platformioIniCode)}
                className="mac-btn"
              >
                <span>platformio.ini 保存</span>
              </button>
              <button
                onClick={() => handleDownload('main.cpp', mainCppCode)}
                className="mac-btn font-bold"
              >
                <span>main.cpp 保存</span>
              </button>
            </div>
          </div>

          {/* ハードウェア制約と6大監査要件 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">1. 完全ゼロインストール単一HID</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                ARDUINO_USB_MODE=0, CDC=0 で常駐ソフト・ドライバ不要。純粋USBキーボードとして動作。
              </p>
            </div>
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">2. JIS 109 IME生HID送出</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                変換キー(0x8A)・無変換キー(0x8B)を生HID直撃送出し、全角半角のIME誤変換を根絶。
              </p>
            </div>
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">3. PSRAM非搭載 (8MB Flash)</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                BOARD_HAS_PSRAM厳禁。AtomS3Uの実機仕様ESP32-S3FN8に完全適合。
              </p>
            </div>
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">4. パケットスロット & CRC16</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                順序不同受信対応・2バイトSessionID・CRC16・未着ビットマップ再送プロトコル。
              </p>
            </div>
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">5. 物理ボタン誤爆防止 (エッジ検知)</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                受信完了時は黄色LED待機。医師が本体正面ボタン(GPIO 41)を押下した瞬間のみ打鍵。
              </p>
            </div>
            <div className="border border-black p-2 bg-white">
              <div className="font-bold">6. 医療情報セキュア消去</div>
              <p className="text-[11px] text-gray-700 mt-0.5">
                volatileポインタによるメモリ完全ゼロクリアおよびFreeRTOSキューの完全排出。
              </p>
            </div>
          </div>

          {/* コード閲覧タブ ＆ ソースコードビューア */}
          <div className="border border-black p-2.5 bg-white space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('main');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'main' ? 'bg-black text-white' : ''}`}
                >
                  main.cpp (本体ファーム)
                </button>
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('pipeline');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'pipeline' ? 'bg-black text-white' : ''}`}
                >
                  compile_pipeline.sh (辞書パイプライン)
                </button>
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('py');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'py' ? 'bg-black text-white' : ''}`}
                >
                  compile_pipeline.py (二分探索コンパイラ)
                </button>
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('part');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'part' ? 'bg-black text-white' : ''}`}
                >
                  partitions_8MB.csv (5.87MB SPIFFS)
                </button>
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('ini');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'ini' ? 'bg-black text-white' : ''}`}
                >
                  platformio.ini
                </button>
                <button
                  onClick={() => {
                    playMacBeep();
                    setActiveCodeTab('ps1');
                  }}
                  className={`mac-btn text-xs ${activeCodeTab === 'ps1' ? 'bg-black text-white' : ''}`}
                >
                  flash_atoms3u.ps1 (Win書込)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="mac-btn text-xs font-bold"
                >
                  <span>{copied ? 'コピー完了 ✓' : 'コードをコピー'}</span>
                </button>
                <button
                  onClick={() => {
                    let fn = 'main.cpp';
                    let ct = mainCppCode;
                    if (activeCodeTab === 'pipeline') { fn = 'compile_pipeline.sh'; ct = COMPILE_PIPELINE_SH_SOURCE; }
                    else if (activeCodeTab === 'py') { fn = 'compile_pipeline.py'; ct = COMPILE_PIPELINE_PY_SOURCE; }
                    else if (activeCodeTab === 'part') { fn = 'partitions_8MB.csv'; ct = PARTITIONS_8MB_CSV_SOURCE; }
                    else if (activeCodeTab === 'ini') { fn = 'platformio.ini'; ct = platformioIniCode; }
                    else if (activeCodeTab === 'ps1') { fn = 'flash_atoms3u.ps1'; ct = FLASH_ATOMS3U_PS1_SOURCE; }
                    handleDownload(fn, ct);
                  }}
                  className="mac-btn text-xs"
                >
                  <span>保存 ↵</span>
                </button>
              </div>
            </div>

            {/* Monaco モノスペース ソースコード */}
            <div
              className="h-80 overflow-y-auto border border-black p-2.5 bg-white text-xs font-mono select-text shadow-[inset_1px_1px_0_#000]"
              style={{ fontFamily: "'Monaco', 'Courier New', monospace", lineHeight: '1.5' }}
            >
              <pre className="whitespace-pre">
                {activeCodeTab === 'main'
                  ? mainCppCode
                  : activeCodeTab === 'pipeline'
                  ? COMPILE_PIPELINE_SH_SOURCE
                  : activeCodeTab === 'py'
                  ? COMPILE_PIPELINE_PY_SOURCE
                  : activeCodeTab === 'part'
                  ? PARTITIONS_8MB_CSV_SOURCE
                  : activeCodeTab === 'ini'
                  ? platformioIniCode
                  : FLASH_ATOMS3U_PS1_SOURCE}
              </pre>
            </div>
          </div>

          {/* Adafruit WebSerial ESPTool ステップ・バイ・ステップ書き込みガイド */}
          <div className="border border-black p-3 bg-white text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black pb-2">
              <div>
                <div className="font-bold text-sm">Adafruit WebSerial ESPTool による書き込み手順 (ステップ・バイ・ステップ)</div>
                <div className="text-[11px] text-gray-600 mt-0.5">
                  Chromebook (Crostini) やドライバ不要のブラウザ完結型書き込み手順
                </div>
              </div>
              <a
                href="https://adafruit.github.io/Adafruit_WebSerial_ESPTool/"
                target="_blank"
                rel="noopener noreferrer"
                className="mac-btn font-bold inline-flex items-center gap-1 shrink-0"
              >
                <span>Adafruit WebSerial ESPTool を開く ↗</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="space-y-2 text-[11px] leading-relaxed">
              <div className="border border-black p-2 bg-slate-50 space-y-1">
                <div className="font-bold text-black">
                  【ステップ 1】AtomS3U を「ROMブートローダモード (Download Mode)」にする
                </div>
                <p className="text-gray-700">
                  AtomS3U は通常、純粋な USB-HID キーボードとして動作するため、そのまま挿してもシリアルポート（COM / ttyACM）が現れません。
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-800 pl-1 font-mono">
                  <li>AtomS3U を PC の USB ポートから抜きます。</li>
                  <li><strong>本体正面のプッシュスイッチ（四角い画面部分 / GPIO 41）を指で押し続けます</strong>。</li>
                  <li><strong>ボタンを押したまま</strong>、PC の USB ポートに差し込みます。</li>
                  <li>挿したあと 1 秒待ってから指を離します。（※LEDは消灯または薄暗い状態になります）</li>
                  <li>これで ESP32-S3 のハードウェア ROM ブートローダが起動し、シリアルポートとして認識されます。</li>
                </ol>
              </div>

              <div className="border border-black p-2 bg-white space-y-1">
                <div className="font-bold text-black">
                  【ステップ 2】WebSerial ESPTool で接続する
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-800 pl-1 font-mono">
                  <li>Chrome / Edge ブラウザで Adafruit WebSerial ESPTool を開きます。</li>
                  <li>画面右上の <strong>Baud Rate</strong> を <code className="bg-slate-100 px-1 border border-black/20">921600</code> または <code className="bg-slate-100 px-1 border border-black/20">460800</code> に設定します。</li>
                  <li>「<strong>Connect</strong>」ボタンをクリックします。</li>
                  <li>ブラウザのポップアップから「<strong>USB JTAG/serial debug unit</strong>」または「<strong>ESP32-S3</strong>」を選択して「接続」を押します。</li>
                  <li>ターミナル画面に <code className="bg-slate-100 px-1 border border-black/20">Chip: ESP32-S3</code> と表示されれば接続成功です！</li>
                </ol>
              </div>

              <div className="border border-black p-2 bg-slate-50 space-y-1">
                <div className="font-bold text-black">
                  【ステップ 3】バイナリファイルとオフセットアドレス（Flash Address）の指定
                </div>
                <p className="text-gray-700">
                  PlatformIO または Arduino IDE でビルドしたバイナリファイルを指定します。
                </p>
                <div className="border border-black bg-white p-2 font-mono text-[10px] space-y-1">
                  <div className="font-bold text-black border-b border-black/20 pb-0.5">
                    推奨メモリマップ (ESP32-S3FN8 8MB Flash):
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>1. bootloader.bin (ブートローダ)</span>
                    <span className="font-bold">Offset: 0x0000</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-t border-dotted border-black/20">
                    <span>2. partitions.bin (パーティション表)</span>
                    <span className="font-bold">Offset: 0x8000</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-t border-dotted border-black/20">
                    <span>3. boot_app0.bin (OTAデータ / 任意)</span>
                    <span className="font-bold">Offset: 0xe000</span>
                  </div>
                  <div className="flex justify-between py-0.5 border-t border-dotted border-black/20">
                    <span>4. firmware.bin (本体スケッチ)</span>
                    <span className="font-bold">Offset: 0x10000</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-600 mt-1">
                  ※Arduino IDE の「スケッチ」→「コンパイルしたバイナリをエクスポート」で生成される <strong>merged.bin</strong>（結合バイナリ）を使用する場合は、ファイル1つのみを選択し、Offset を <code className="bg-white px-1 border border-black/20 font-bold">0x0</code> にするだけで一括書き込み可能です。
                </div>
              </div>

              <div className="border border-black p-2 bg-white space-y-1">
                <div className="font-bold text-black">
                  【ステップ 4】書き込み（Program）と再起動
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-gray-800 pl-1 font-mono">
                  <li>「<strong>Program</strong>」ボタンをクリックします。</li>
                  <li>消去（Erasing）と書き込み進捗バー（Writing at 0x... xx%）が進みます。</li>
                  <li><code className="bg-slate-100 px-1 border border-black/20">Leaving... Finished successfully.</code> と表示されれば書き込み完了です！</li>
                  <li>AtomS3U を一度 USB ポートから引き抜き、<strong>ボタンを押さずに再度差し込みます</strong>。</li>
                  <li>本体 LED が <strong>青色（起動）</strong> から <strong>緑色（BLE接続待機）</strong> に点灯し、Windows/Mac で「HID キーボード」としてマウントされれば通常稼働開始です！</li>
                </ol>
              </div>
            </div>
          </div>

          {/* ★ 選択肢 B【オンデバイス完結型】：AtomS3U の SPIFFS 辞書を完全稼働させる */}
          <div className="border-2 border-black p-3 bg-amber-50/40 text-xs space-y-3 shadow-[2px_2px_0_#000]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black pb-2">
              <div>
                <div className="font-bold text-sm text-black flex items-center gap-1.5">
                  <span>💾 選択肢 B【オンデバイス完結型】：AtomS3U の SPIFFS 辞書を完全稼働</span>
                  <span className="text-[10px] bg-black text-white px-1.5 py-0.2">v12.0 実装済み</span>
                </div>
                <div className="text-[11px] text-gray-700 mt-0.5">
                  厚労省マスター約5万語（医薬品・傷病名）＋難読単漢字を 5.87MB SPIFFS Flash に格納し、オンデバイス二分探索で高速展開
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload('compile_pipeline.sh', COMPILE_PIPELINE_SH_SOURCE)}
                  className="mac-btn font-bold inline-flex items-center gap-1 shrink-0"
                >
                  <span>compile_pipeline.sh 保存 ↵</span>
                </button>
                <button
                  onClick={() => handleDownload('compile_pipeline.py', COMPILE_PIPELINE_PY_SOURCE)}
                  className="mac-btn inline-flex items-center gap-1 shrink-0"
                >
                  <span>compile_pipeline.py 保存 ↵</span>
                </button>
              </div>
            </div>

            {/* 仕組み・メリット・課題 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
              <div className="border border-black p-2 bg-white space-y-1">
                <div className="font-bold text-black border-b border-black/10 pb-0.5">⚙️ 仕組み</div>
                <p className="text-gray-700 leading-relaxed">
                  <code>compile_pipeline.py</code> で生成した <code>med_terms.bin</code>（厚労省マスター約5万語、32バイト固定長）を PlatformIO（<code>pio run -t uploadfs</code>）で AtomS3U の Flash に書き込み、ファームウェア内で FNV-1a ハッシュ二分探索を実行してローマ字展開します。
                </p>
              </div>
              <div className="border border-black p-2 bg-white space-y-1">
                <div className="font-bold text-emerald-800 border-b border-black/10 pb-0.5">✅ メリット</div>
                <p className="text-gray-700 leading-relaxed">
                  AtomS3U 単体で医療用語マスターを保持できるため、スマホ側の辞書データや通信トランスパイル負荷がゼロになり、完全スタンドアロンで電子カルテへの打鍵が可能になります。
                </p>
              </div>
              <div className="border border-black p-2 bg-white space-y-1">
                <div className="font-bold text-amber-900 border-b border-black/10 pb-0.5">⚠️ 課題・運用制約</div>
                <p className="text-gray-700 leading-relaxed">
                  辞書の追加・更新のたびに、PC と AtomS3U を有線接続して PlatformIO でファイルシステムを再フラッシュ（<code>uploadfs</code>）する必要があります。
                </p>
              </div>
            </div>

            {/* PlatformIO コマンド手順 */}
            <div className="border border-black bg-black text-white p-2.5 font-mono text-[11px] space-y-1 select-text">
              <div className="text-gray-400"># [A] 辞書バイナリ生成 (raw_data/y.zip, b.zip から med_terms.bin を生成)</div>
              <div className="text-green-400">chmod +x compile_pipeline.sh && ./compile_pipeline.sh</div>
              <div className="text-gray-400 pt-1"># [B] AtomS3U の SPIFFS 領域（5.87MB）へ辞書イメージを書き込み</div>
              <div className="text-green-400">pio run -e m5stack-atoms3u --target uploadfs</div>
              <div className="text-gray-400 pt-1"># [C] ファームウェア本体のコンパイル＆書き込み</div>
              <div className="text-green-400">pio run -e m5stack-atoms3u --target upload</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
