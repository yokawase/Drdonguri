/**
 * 端末環境自動判定 ＆ 推論バックエンド動的切り替えエンジン (WebGPU / WASM)
 *
 * 単一のソースコード（TypeScript）から、アプリ起動時に端末のハードウェア・ブラウザ機能を自動検査し、
 * - Android / PC Chrome・Edge 等で WebGPU アダプターが正常取得できる場合 -> 'webgpu' (fp16 / q4f16)
 * - iPhone / iPad (iOS WKWebView / Bluefy) 等で WebGPU 未対応・取得失敗の場合 -> 'wasm' (SIMD / q8 / q4)
 * へ動的に切り替える（フォールバックする）ハイブリッド推論基盤モジュール。
 */

export type InferenceBackend = 'webgpu' | 'wasm';
export type DevicePlatform = 'android' | 'ios' | 'desktop';
export type QuantizationDtype = 'fp16' | 'q4f16' | 'q4f32' | 'q8' | 'q4';

export interface InferenceEnvironmentInfo {
  backend: InferenceBackend;
  platform: DevicePlatform;
  isBluefy: boolean;
  hasShaderF16: boolean;
  recommendedDtype: QuantizationDtype;
  recommendedWhisperModel: 'Xenova/whisper-base' | 'Xenova/whisper-tiny';
  executionProviders: ('webgpu' | 'wasm')[];
  wasmConfig: {
    numThreads: number;
    simd: boolean;
  };
  badgeLabel: string;      // 例: "🟢 WebGPU (Android)" / "🔵 WASM (iOS)"
  shortBadgeLabel: string; // 例: "🟢 WebGPU" / "🔵 WASM (iOS)"
  detailDescription: string;
  probedAt: number;
}

/**
 * User-Agent およびタッチポイントから端末プラットフォーム (Android / iOS / Desktop) と Bluefy を判定
 */
export function detectDevicePlatform(customUa?: string): {
  platform: DevicePlatform;
  isBluefy: boolean;
} {
  const ua =
    customUa !== undefined
      ? customUa
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';

  const isBluefy = /Bluefy/i.test(ua);

  if (/Android/i.test(ua)) {
    return { platform: 'android', isBluefy };
  }

  // iPhone / iPad / iPod または iPadOS デスクトップモード (MacIntel + maxTouchPoints > 1) または Bluefy
  const isIosUa = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOsDesktopMode =
    typeof navigator !== 'undefined' &&
    /Macintosh|MacIntel/i.test(ua) &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;

  if (isIosUa || isIpadOsDesktopMode || isBluefy) {
    return { platform: 'ios', isBluefy };
  }

  return { platform: 'desktop', isBluefy: false };
}

/**
 * プラットフォームとバックエンドからUI表示用バッジ文字列を生成
 */
function buildBadgeLabels(
  backend: InferenceBackend,
  platform: DevicePlatform,
  isBluefy: boolean,
  hasShaderF16: boolean
): { badgeLabel: string; shortBadgeLabel: string; detailDescription: string } {
  if (backend === 'webgpu') {
    const platformName =
      platform === 'android' ? 'Android' : platform === 'ios' ? 'iOS' : 'PC';
    const f16Tag = hasShaderF16 ? 'FP16' : 'FP32';
    return {
      badgeLabel: `🟢 WebGPU (${platformName})`,
      shortBadgeLabel: `🟢 WebGPU (${platformName})`,
      detailDescription: `WebGPU シェーダー高速推論 (${f16Tag} / ${platformName})`,
    };
  }

  // WASM フォールバック時
  const platformName = isBluefy
    ? 'iOS/Bluefy'
    : platform === 'ios'
    ? 'iOS'
    : platform === 'android'
    ? 'Android'
    : 'CPU';

  return {
    badgeLabel: `🔵 WASM (${platformName})`,
    shortBadgeLabel: `🔵 WASM (${platform === 'ios' ? 'iOS' : platformName})`,
    detailDescription: `WebAssembly CPU SIMD 推論 (INT8 q8量子化 / ${platformName})`,
  };
}

/**
 * 初期状態の同期環境情報を構築 (起動直後のSSR/初期描画用)
 */
function createInitialEnvironment(): InferenceEnvironmentInfo {
  const { platform, isBluefy } = detectDevicePlatform();
  // iOS Bluefy (WKWebView) は WebGPU アダプター非対応または制限があるため初期値を wasm とする
  const likelyWebGpu =
    !isBluefy &&
    platform !== 'ios' &&
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    !!(navigator as any).gpu;

  const backend: InferenceBackend = likelyWebGpu ? 'webgpu' : 'wasm';
  const numThreads =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? Math.min(4, Math.max(1, navigator.hardwareConcurrency))
      : 4;

  const { badgeLabel, shortBadgeLabel, detailDescription } = buildBadgeLabels(
    backend,
    platform,
    isBluefy,
    false
  );

  return {
    backend,
    platform,
    isBluefy,
    hasShaderF16: false,
    recommendedDtype: backend === 'webgpu' ? 'fp16' : 'q8',
    recommendedWhisperModel:
      backend === 'webgpu' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny',
    executionProviders: backend === 'webgpu' ? ['webgpu'] : ['wasm'],
    wasmConfig: {
      numThreads,
      simd: true,
    },
    badgeLabel,
    shortBadgeLabel,
    detailDescription,
    probedAt: 0,
  };
}

let cachedEnv: InferenceEnvironmentInfo = createInitialEnvironment();
let probePromise: Promise<InferenceEnvironmentInfo> | null = null;
const listeners = new Set<(env: InferenceEnvironmentInfo) => void>();

function notifyListeners(env: InferenceEnvironmentInfo) {
  for (const listener of listeners) {
    try {
      listener(env);
    } catch (e) {
      console.warn('[Inference] Listener error:', e);
    }
  }
}

/**
 * 実行環境を検査し、最適な推論バックエンドを決定する
 * 1. Android / PC等でWebGPUが正常稼働し、実際にGPUアダプターが取得できる場合 -> 'webgpu'
 * 2. iPhone / iOS (WKWebView/Bluefy) 等で未対応・取得失敗の場合 -> 'wasm'
 */
export async function detectBestBackend(forceRecheck = false): Promise<InferenceBackend> {
  const env = await getInferenceEnvironment(forceRecheck);
  return env.backend;
}

/**
 * アプリ起動時に実行環境（WebGPU Adapter / shader-f16 / CPUスレッド数）を実機検査し、
 * 推論設定とUIバッジ情報を確定する
 */
export async function getInferenceEnvironment(
  forceRecheck = false
): Promise<InferenceEnvironmentInfo> {
  if (!forceRecheck && cachedEnv.probedAt > 0) {
    return cachedEnv;
  }

  if (!forceRecheck && probePromise) {
    return probePromise;
  }

  probePromise = (async () => {
    const { platform, isBluefy } = detectDevicePlatform();
    const numThreads =
      typeof navigator !== 'undefined' && navigator.hardwareConcurrency
        ? Math.min(4, Math.max(1, navigator.hardwareConcurrency))
        : 4;

    let detectedBackend: InferenceBackend = 'wasm';
    let hasShaderF16 = false;

    // 1. WebGPU APIの存在チェック ＆ 実GPUアダプター取得テスト
    if (
      typeof navigator !== 'undefined' &&
      'gpu' in navigator &&
      (navigator as any).gpu &&
      typeof (navigator as any).gpu.requestAdapter === 'function'
    ) {
      try {
        // 実際にGPUアダプターが要求できるかをテスト (ハング防止のため2.5秒タイムアウト付)
        const adapterPromise = (navigator as any).gpu.requestAdapter();
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 2500)
        );
        const adapter = await Promise.race([adapterPromise, timeoutPromise]);

        if (adapter) {
          detectedBackend = 'webgpu';
          hasShaderF16 = Boolean(adapter.features && adapter.features.has('shader-f16'));
          console.log(
            `[Inference] WebGPU is available (${platform}, shader-f16=${hasShaderF16}). Using WebGPU backend.`
          );
        } else {
          console.log(
            '[Inference] WebGPU adapter returned null. Falling back to WASM (CPU).'
          );
        }
      } catch (err) {
        console.warn('[Inference] WebGPU adapter request failed:', err);
      }
    } else {
      console.log('[Inference] WebGPU is unavailable. Falling back to WASM (CPU).');
    }

    const { badgeLabel, shortBadgeLabel, detailDescription } = buildBadgeLabels(
      detectedBackend,
      platform,
      isBluefy,
      hasShaderF16
    );

    const nextEnv: InferenceEnvironmentInfo = {
      backend: detectedBackend,
      platform,
      isBluefy,
      hasShaderF16,
      recommendedDtype:
        detectedBackend === 'webgpu' ? (hasShaderF16 ? 'fp16' : 'q4f32') : 'q8',
      recommendedWhisperModel:
        detectedBackend === 'webgpu' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny',
      executionProviders: detectedBackend === 'webgpu' ? ['webgpu'] : ['wasm'],
      wasmConfig: {
        numThreads,
        simd: true,
      },
      badgeLabel,
      shortBadgeLabel,
      detailDescription,
      probedAt: Date.now(),
    };

    cachedEnv = nextEnv;
    probePromise = null;
    notifyListeners(nextEnv);
    return nextEnv;
  })();

  return probePromise;
}

/**
 * 同期的に最新の推論環境情報を取得（React初期レンダリング用）
 */
export function getCachedInferenceEnvironment(): InferenceEnvironmentInfo {
  return cachedEnv;
}

/**
 * 推論環境情報の確定・変更を購読
 */
export function subscribeInferenceEnvironment(
  callback: (env: InferenceEnvironmentInfo) => void
): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * パターンA: Transformers.js（Whisper等の音声認識・軽量NLP）向けの最適パイプライン設定を取得
 */
export async function getTransformersPipelineOptions(
  task: 'automatic-speech-recognition' | 'feature-extraction' = 'automatic-speech-recognition'
): Promise<{
  device: InferenceBackend;
  dtype: 'fp16' | 'q8';
  modelId: string;
  wasm: { numThreads: number; simd: boolean };
}> {
  const env = await getInferenceEnvironment();
  return {
    device: env.backend,
    // WebGPU時はFP16、WASM(iPhone)時はCPU SIMDに最適なQ8(INT8)モデルを自動選択
    dtype: env.backend === 'webgpu' ? 'fp16' : 'q8',
    modelId:
      task === 'automatic-speech-recognition'
        ? env.recommendedWhisperModel
        : 'onnx-community/EmbeddingGemma-2-128d',
    wasm: env.wasmConfig,
  };
}

/**
 * パターンB: ONNX Runtime Web 向けの最適セッションオプションを取得
 */
export async function getOnnxSessionOptions(): Promise<{
  executionProviders: ('webgpu' | 'wasm')[];
  graphOptimizationLevel: 'all';
  numThreads: number;
  simd: boolean;
}> {
  const env = await getInferenceEnvironment();
  return {
    // Android/PC: ['webgpu'] / iPhone(iOS/Bluefy): ['wasm']
    executionProviders: env.executionProviders,
    graphOptimizationLevel: 'all',
    numThreads: env.wasmConfig.numThreads,
    simd: env.wasmConfig.simd,
  };
}
