import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectDevicePlatform,
  detectBestBackend,
  getInferenceEnvironment,
  getTransformersPipelineOptions,
  getOnnxSessionOptions,
} from '../src/services/inferenceEngine';

describe('inferenceEngine (WebGPU / WASM Dynamic Backend Switching)', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  describe('detectDevicePlatform', () => {
    it('Android User-Agent を android と判定する', () => {
      const res = detectDevicePlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
      );
      expect(res.platform).toBe('android');
      expect(res.isBluefy).toBe(false);
    });

    it('iPhone Safari User-Agent を ios と判定する', () => {
      const res = detectDevicePlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
      );
      expect(res.platform).toBe('ios');
      expect(res.isBluefy).toBe(false);
    });

    it('iPhone / iPad Bluefy ブラウザを ios かつ isBluefy=true と判定する', () => {
      const res = detectDevicePlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Bluefy/2.4.1 Mobile/15E148'
      );
      expect(res.platform).toBe('ios');
      expect(res.isBluefy).toBe(true);
    });
  });

  describe('detectBestBackend & getInferenceEnvironment', () => {
    it('Android 端末で navigator.gpu.requestAdapter() が成功する場合、webgpu と fp16 を選択する', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent:
            'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36',
          hardwareConcurrency: 8,
          gpu: {
            requestAdapter: vi.fn().mockResolvedValue({
              features: new Set(['shader-f16']),
            }),
          },
        },
        configurable: true,
        writable: true,
      });

      const backend = await detectBestBackend(true);
      expect(backend).toBe('webgpu');

      const env = await getInferenceEnvironment();
      expect(env.backend).toBe('webgpu');
      expect(env.platform).toBe('android');
      expect(env.hasShaderF16).toBe(true);
      expect(env.recommendedDtype).toBe('fp16');
      expect(env.recommendedWhisperModel).toBe('Xenova/whisper-base');
      expect(env.executionProviders).toEqual(['webgpu']);
      expect(env.badgeLabel).toBe('🟢 WebGPU (Android)');

      const tfOpts = await getTransformersPipelineOptions('automatic-speech-recognition');
      expect(tfOpts.device).toBe('webgpu');
      expect(tfOpts.dtype).toBe('fp16');
      expect(tfOpts.modelId).toBe('Xenova/whisper-base');

      const ortOpts = await getOnnxSessionOptions();
      expect(ortOpts.executionProviders).toEqual(['webgpu']);
    });

    it('iPhone (iOS / Bluefy) で WebGPU が未対応またはアダプター取得失敗時、wasm と q8 へ安全にフォールバックする', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Bluefy/2.4.1 Mobile/15E148',
          hardwareConcurrency: 6,
          // iOS WKWebView / Bluefy where navigator.gpu is absent
        },
        configurable: true,
        writable: true,
      });

      const backend = await detectBestBackend(true);
      expect(backend).toBe('wasm');

      const env = await getInferenceEnvironment();
      expect(env.backend).toBe('wasm');
      expect(env.platform).toBe('ios');
      expect(env.isBluefy).toBe(true);
      expect(env.recommendedDtype).toBe('q8');
      expect(env.recommendedWhisperModel).toBe('Xenova/whisper-tiny');
      expect(env.executionProviders).toEqual(['wasm']);
      expect(env.wasmConfig).toEqual({ numThreads: 4, simd: true });
      expect(env.badgeLabel).toBe('🔵 WASM (iOS/Bluefy)');

      const tfOpts = await getTransformersPipelineOptions('automatic-speech-recognition');
      expect(tfOpts.device).toBe('wasm');
      expect(tfOpts.dtype).toBe('q8');
      expect(tfOpts.modelId).toBe('Xenova/whisper-tiny');

      const ortOpts = await getOnnxSessionOptions();
      expect(ortOpts.executionProviders).toEqual(['wasm']);
      expect(ortOpts.graphOptimizationLevel).toBe('all');
    });

    it('navigator.gpu は存在するが requestAdapter() が null を返す環境では wasm へフォールバックする', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
          hardwareConcurrency: 4,
          gpu: {
            requestAdapter: vi.fn().mockResolvedValue(null),
          },
        },
        configurable: true,
        writable: true,
      });

      const backend = await detectBestBackend(true);
      expect(backend).toBe('wasm');

      const env = await getInferenceEnvironment();
      expect(env.badgeLabel).toBe('🔵 WASM (iOS)');
    });
  });
});
