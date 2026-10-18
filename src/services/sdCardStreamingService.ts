/**
 * SdCardStreamingService (フェーズ2: Wi-Fi SoftAP統合 高解像度WebP & 添付文書PDF原本ストリーミング)
 * 
 * T-Dongle-S3 が開くローカルWi-Fi SoftAP (192.168.4.1:80) と連携し、
 * BLE帯域では転送が困難な大判アトラス画像 (1024x1024 WebP) や
 * PMDA公式 添付文書PDF原本を数MB/sの超高速ストリーミングで直接取得・キャッシュします。
 */

export interface SoftApStatus {
  isConnected: boolean;
  ip: string;
  ssid: string;
  latencyMs: number | null;
  lastChecked: number;
}

class SdCardStreamingService {
  private baseEndpoint: string = 'http://192.168.4.1';
  private defaultSsid: string = 'Drdonguri-Atlas-Direct';
  private blobCache: Map<string, string> = new Map(); // path -> ObjectURL
  private isChecking: boolean = false;
  private apStatus: SoftApStatus = {
    isConnected: false,
    ip: '192.168.4.1',
    ssid: 'Drdonguri-Atlas-Direct',
    latencyMs: null,
    lastChecked: 0,
  };

  /**
   * T-dongle-S3 Wi-Fi SoftAP への疎通確認 (Ping check)
   */
  public async checkApConnection(): Promise<SoftApStatus> {
    if (this.isChecking) return this.apStatus;
    this.isChecking = true;

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const resp = await fetch(`${this.baseEndpoint}/api/status`, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) {
        const latency = Date.now() - start;
        this.apStatus = {
          isConnected: true,
          ip: '192.168.4.1',
          ssid: this.defaultSsid,
          latencyMs: latency,
          lastChecked: Date.now(),
        };
      } else {
        throw new Error('AP status error');
      }
    } catch {
      // 疎通不可
      this.apStatus = {
        isConnected: false,
        ip: '192.168.4.1',
        ssid: this.defaultSsid,
        latencyMs: null,
        lastChecked: Date.now(),
      };
    } finally {
      this.isChecking = false;
    }

    return this.apStatus;
  }

  public getStatus(): SoftApStatus {
    return this.apStatus;
  }

  /**
   * 大判アトラス画像 (1024x1024 WebP) のストリーミングURL取得
   * Wi-Fi SoftAP が接続されている場合は実機から直接取得し、未接続時はフォールバックDataURLを返却
   */
  public async getAtlasImageUrl(sdFilePath: string, fallbackUrl?: string): Promise<string> {
    if (this.blobCache.has(sdFilePath)) {
      return this.blobCache.get(sdFilePath)!;
    }

    if (this.apStatus.isConnected) {
      try {
        const fetchUrl = `${this.baseEndpoint}${sdFilePath}`;
        const resp = await fetch(fetchUrl, { mode: 'cors' });
        if (resp.ok) {
          const blob = await resp.blob();
          const objectUrl = URL.createObjectURL(blob);
          this.blobCache.set(sdFilePath, objectUrl);
          return objectUrl;
        }
      } catch (err) {
        console.warn('Wi-Fi SoftAP direct fetch failed, falling back:', err);
      }
    }

    // フォールバック返却
    return fallbackUrl || '';
  }

  /**
   * 実機ダイレクトURL (http://192.168.4.1/...) の取得
   */
  public getDirectUrl(sdFilePath: string): string {
    const cleanPath = sdFilePath.startsWith('/') ? sdFilePath : `/${sdFilePath}`;
    return `${this.baseEndpoint}${cleanPath}`;
  }

  /**
   * 実機SoftAPから別タブで大判画像またはPDFを直接開く
   * (ブラウザの Mixed Content ブロックを回避するトップレベルナビゲーション)
   */
  public openDirectUrl(sdFilePath: string): void {
    const url = this.getDirectUrl(sdFilePath);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * 添付文書PDF原本のストリーミングダウンロード
   */
  public async openPackageInsertPdf(pdfPath?: string): Promise<boolean> {
    if (!pdfPath) {
      alert('該当医薬品の添付文書PDFパスが登録されていません。');
      return false;
    }
    this.openDirectUrl(pdfPath);
    return true;
  }
}

export const sdCardStreamingService = new SdCardStreamingService();
