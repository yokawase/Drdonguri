import { useState, useEffect } from 'react';
import {
  getCachedInferenceEnvironment,
  getInferenceEnvironment,
  subscribeInferenceEnvironment,
  type InferenceEnvironmentInfo,
} from '../services/inferenceEngine';

/**
 * アプリ起動時に端末の推論環境 (WebGPU vs WASM) を自動判定し、
 * リアクティブにUIへ反映するカスタムフック
 */
export function useInferenceBackend(): InferenceEnvironmentInfo {
  const [envInfo, setEnvInfo] = useState<InferenceEnvironmentInfo>(() =>
    getCachedInferenceEnvironment()
  );

  useEffect(() => {
    const unsubscribe = subscribeInferenceEnvironment((nextEnv) => {
      setEnvInfo(nextEnv);
    });

    // 初回未プローブ時は非同期で実GPUアダプター検査 (requestAdapter) を実行
    getInferenceEnvironment().then((resolved) => {
      setEnvInfo(resolved);
    });

    return unsubscribe;
  }, []);

  return envInfo;
}
