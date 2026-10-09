import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Web Worker スレッド内で WebLLM エンジンハンドラを待機
// メインスレッド（React UI）をブロックせずに WebGPU 推論を実行
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
