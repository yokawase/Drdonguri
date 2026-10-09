import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 電子カルテPCカレントペイン ＆ スマホ双方向インタラクティブ通信 バックエンド
// ---------------------------------------------------------------------------

interface EhrServerRoom {
  roomId: string;
  activePane: string;
  panes: Record<string, string>;
  cursor: {
    paneId: string;
    cursorPosition: number;
    selectionStart?: number;
    selectionEnd?: number;
  };
  patient: {
    id: string;
    name: string;
    kana: string;
    age: number;
    gender: '男性' | '女性';
    insurance: string;
    allergy: string;
  };
  clients: Set<{ ws: WebSocket; role: 'ehr-pc' | 'phone-app' }>;
  lastUpdatedAt: number;
}

const rooms = new Map<string, EhrServerRoom>();

function getOrCreateRoom(roomId: string): EhrServerRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      activePane: 'SOAP_O', // デフォルトは客観的所見
      panes: {
        SOAP_S: '【主訴】3日前からの咳嗽と発熱。市販感冒薬内服するも解熱せず。\n咽頭痛あり、呼吸困難感なし。',
        SOAP_O: '【バイタル】KT: 37.8℃, HR: 76bpm 整, BP: 124/78 mmHg, SpO2: 98% (room air)\n【胸部聴診】ラ音なし、呼吸音清。\n【咽頭】後壁に軽度発赤認む。扁桃肥大・白苔(-)。',
        SOAP_A: '【診断】急性上気道炎 (疑い)\n発熱・咳嗽を主徴とするウイルス性呼吸器感染症。現時点で細菌感染や肺炎を示唆する身体所見なし。',
        SOAP_P: '【処置・方針】\n1. 対症療法中心。水分・電解質補給励行。\n2. 処方: アセトアミノフェン錠500mg 屯用、デキストロメトルファン臭化水素酸塩錠15mg 3T毎食後。\n3. 症状増悪（呼吸困難、38.5℃以上持続）時は再診指示。',
        PRESCRIPTION: '1. アセトアミノフェン錠500mg 1回1錠 発熱・頭痛時 屯用 5回分\n2. デキストロメトルファン臭化水素酸塩錠15mg 1回1錠 1日3回毎食後 5日分\n3. トラネキサム酸錠250mg 1回1錠 1日3回毎食後 5日分',
        FREE_TEXT: '電子カルテ総合所見・自由記載欄（AtomS3U USB-HID直接打鍵可能ペイン）'
      },
      cursor: {
        paneId: 'SOAP_O',
        cursorPosition: 0
      },
      patient: {
        id: '2026-PT#8421',
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        age: 62,
        gender: '男性',
        insurance: '社保 本人 3割',
        allergy: 'ペニシリン系薬剤 (-)'
      },
      clients: new Set(),
      lastUpdatedAt: Date.now()
    };
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(room: EhrServerRoom, data: any, excludeWs?: WebSocket) {
  const jsonStr = JSON.stringify(data);
  for (const client of room.clients) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(jsonStr);
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }
}

function broadcastPeerStatus(room: EhrServerRoom) {
  let pcCount = 0;
  let phoneCount = 0;
  for (const c of room.clients) {
    if (c.role === 'ehr-pc') pcCount++;
    if (c.role === 'phone-app') phoneCount++;
  }
  broadcastToRoom(room, {
    type: 'PEER_STATUS',
    pcCount,
    phoneCount
  });
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  // AI Studio開発サーバーおよびiFrame通信はポート3000固定
  const PORT = 3000;

  // CORS対応 (別ポートやスマホからの通信を許可)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    if (req.url.startsWith('/api')) {
      console.log(`[API ${req.method}] ${req.url}`);
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // WebSocket Server Setup on the same HTTP server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    let currentRoomId = 'clinic-station-1';
    let currentRole: 'ehr-pc' | 'phone-app' = 'phone-app';

    ws.on('message', (messageRaw: string | Buffer) => {
      try {
        const msg = JSON.parse(messageRaw.toString());
        const roomId = msg.roomId || currentRoomId;
        const room = getOrCreateRoom(roomId);

        switch (msg.type) {
          case 'JOIN': {
            currentRoomId = roomId;
            currentRole = msg.role || 'phone-app';
            // 既存登録解除
            for (const c of room.clients) {
              if (c.ws === ws) room.clients.delete(c);
            }
            room.clients.add({ ws, role: currentRole });

            // 初期状態を接続クライアントに返送
            let pcCount = 0;
            let phoneCount = 0;
            for (const c of room.clients) {
              if (c.role === 'ehr-pc') pcCount++;
              if (c.role === 'phone-app') phoneCount++;
            }

            ws.send(JSON.stringify({
              type: 'STATE_INIT',
              state: {
                roomId: room.roomId,
                activePane: room.activePane,
                panes: room.panes,
                cursor: room.cursor,
                patient: room.patient,
                connectedPeers: { pcCount, phoneCount },
                lastUpdateSource: currentRole,
                lastUpdatedAt: room.lastUpdatedAt
              }
            }));

            // 全ピアに接続台数を通知
            broadcastPeerStatus(room);
            console.log(`[WS] Client joined room=${roomId} role=${currentRole} (Total: ${room.clients.size})`);
            break;
          }

          case 'PANE_FOCUS': {
            room.activePane = msg.paneId;
            room.cursor = {
              paneId: msg.paneId,
              cursorPosition: msg.cursorPosition ?? (room.panes[msg.paneId]?.length || 0)
            };
            room.lastUpdatedAt = Date.now();
            // 全クライアントへ即時ブロードキャスト
            broadcastToRoom(room, {
              type: 'PANE_FOCUS',
              roomId: room.roomId,
              paneId: msg.paneId,
              cursorPosition: room.cursor.cursorPosition,
              sourceRole: msg.sourceRole || currentRole
            }, ws);
            break;
          }

          case 'PANE_UPDATE': {
            if (msg.paneId && typeof msg.text === 'string') {
              room.panes[msg.paneId] = msg.text;
              room.lastUpdatedAt = Date.now();
              // 全クライアントへ即時ブロードキャスト
              broadcastToRoom(room, {
                type: 'PANE_UPDATE',
                roomId: room.roomId,
                paneId: msg.paneId,
                text: msg.text,
                sourceRole: msg.sourceRole || currentRole
              }, ws);
            }
            break;
          }

          case 'KEYSTROKE_INJECT': {
            // スマホまたはドングルから電子カルテPCのカレントペインへ直接打鍵注入
            const targetPane = msg.paneId || room.activePane;
            const currentText = room.panes[targetPane] || '';
            const newText = currentText ? `${currentText}\n${msg.text}` : msg.text;
            room.panes[targetPane] = newText;
            room.lastUpdatedAt = Date.now();

            broadcastToRoom(room, {
              type: 'KEYSTROKE_INJECT',
              roomId: room.roomId,
              paneId: targetPane,
              text: msg.text,
              fullText: newText,
              mode: msg.mode,
              sourceRole: msg.sourceRole || currentRole
            });
            break;
          }

          case 'BTN_PRESS': {
            // ドングル物理ボタンまたはスマホ打鍵トリガー
            broadcastToRoom(room, {
              type: 'BTN_PRESS',
              roomId: room.roomId,
              sourceRole: msg.sourceRole || currentRole
            });
            break;
          }

          case 'CLEAR_PANE': {
            const targetPane = msg.paneId || room.activePane;
            if (targetPane) {
              room.panes[targetPane] = '';
              room.lastUpdatedAt = Date.now();
              broadcastToRoom(room, {
                type: 'CLEAR_PANE',
                roomId: room.roomId,
                paneId: targetPane,
                sourceRole: msg.sourceRole || currentRole
              });
            }
            break;
          }

          default:
            console.warn('[WS] Unknown message type:', msg.type);
        }
      } catch (err) {
        console.error('[WS] Message handling error:', err);
      }
    });

    ws.on('close', () => {
      const room = rooms.get(currentRoomId);
      if (room) {
        for (const c of room.clients) {
          if (c.ws === ws) room.clients.delete(c);
        }
        broadcastPeerStatus(room);
        console.log(`[WS] Client disconnected from room=${currentRoomId}. Remaining: ${room.clients.size}`);
      }
    });
  });

  // Gemini API クライアント初期化 (遅延初期化により起動時クラッシュを防止)
  const getAiClient = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      throw new Error('GEMINI_API_KEYが未設定です。.envファイルにGEMINI_API_KEYを設定してください。');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // 429 (クォータ超過) や 503 (高需要・一時的過負荷) に対応するマルチモデル自動フォールバック＆リトライ機構
  const executeAiWithFallback = async (
    ai: any,
    options: {
      contents: any;
      config?: any;
      candidateModels?: string[];
    }
  ) => {
    // 独立した別枠クォータを持つモデルを順に指定:
    // 1. gemini-2.5-flash: 高速・高品質・マルチモーダル対応
    // 2. gemini-2.0-flash: 安定高速
    // 3. gemini-1.5-flash: 実績のある標準モデル
    const models = options.candidateModels || [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ];

    let lastError: any = null;

    for (const model of models) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[AI] 実行試行: model=${model} (試行回数: ${attempt})`);
          const response = await ai.models.generateContent({
            model,
            contents: options.contents,
            config: options.config,
          });

          if (response && response.text !== undefined) {
            console.log(`[AI] 成功: model=${model}`);
            return { text: response.text, usedModel: model };
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          console.warn(`[AI] モデル ${model} エラー (attempt ${attempt}): ${errMsg}`);

          // クォータ超過 (1日の上限20回など) の場合は同モデルでの再試行は無意味なため、即座に別モデルへフォールバック
          const isQuotaExceeded =
            errMsg.includes('Quota exceeded') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('free_tier_requests') ||
            errMsg.includes('rate-limit');

          if (isQuotaExceeded) {
            console.warn(`[AI] モデル ${model} はクォータ制限に達したため、別モデルへ即座にフォールバックします`);
            break;
          }

          // 一時的な過負荷 (503 / UNAVAILABLE / 一時的混雑) の場合のみリトライ
          const isTransient =
            errMsg.includes('503') ||
            errMsg.includes('high demand') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('overloaded');

          if (isTransient && attempt < 2) {
            await new Promise((res) => setTimeout(res, 400 * attempt));
            continue;
          }
          break;
        }
      }
    }

    throw lastError || new Error('利用可能なすべてのAIモデルが一時的に応答しませんでした');
  };

  // 医療カルテテキストのAI自動校正・SOAP整形プロキシエンドポイント
  app.post('/api/ai/format-chart', async (req, res) => {
    try {
      const { text, formatStyle, mode } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: '入力テキストが必要です' });
      }

      const ai = getAiClient();
      const systemInstruction = `あなたは日本の医療現場向け電子カルテ入力支援アシスタントです。
医師が入力または音声入力したテキストを、電子カルテにそのまま入力できる高品質なカルテ記録に整形・校正します。
【ルール】
1. 医師の入力意図や医学的所見、数値、処方内容を勝手に改変・捏造しないこと。
2. 誤字脱字、音声認識による同音異義語の誤変換（例：「こうけつあつ」→「高血圧」、「しょうに」→「小児」）を正確に修正すること。
3. 指定されたフォーマット（SOAP形式、箇条書き、簡潔文）に従って出力すること。
4. カルテに不要な挨拶文、前置き、AIとしての自己紹介や解説は一切出力せず、カルテ本文のみを出力すること。`;

      let prompt = `以下の入力テキストをカルテ用に整形してください。\n\n【入力】\n${text}\n\n【希望スタイル】: ${formatStyle || 'SOAP形式'}`;
      if (mode === 'romaji_assist') {
        prompt += `\n【補足】Windows IME入力しやすくなるよう、長すぎる文節は適切な読点（、）やスペース、改行で区切ってください。`;
      }

      const result = await executeAiWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
        candidateModels: [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
        ],
      });

      const formattedText = result.text?.trim() || text;
      res.json({ success: true, formattedText, model: result.usedModel });
    } catch (err: any) {
      console.error('AI Service Error:', err);
      const isQuotaExhausted = String(err?.message || '').includes('Quota exceeded') || String(err?.message || '').includes('RESOURCE_EXHAUSTED');
      const is503 = String(err?.message || '').includes('503') || String(err?.message || '').includes('high demand');
      const message = isQuotaExhausted
        ? 'AIモデルの無料クォータ上限に達しました。しばらく時間をおいて再度お試しください。'
        : is503
        ? 'AIモデルが現在混雑しています。フォールバック処理を実行しましたが失敗しました。数秒後に再度お試しください。'
        : (err.message || 'AIカルテ整形に失敗しました');
      res.status(500).json({ error: message });
    }
  });

  // スマートフォンカメラOCR (電子カルテ画面・紹介状・検査所見の画像文字認識)
  app.post('/api/ai/ocr-chart', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', mode = 'chart' } = req.body;
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({ error: '画像データ（Base64）が必要です' });
      }

      // data URL prefix を除去
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      const ai = getAiClient();
      const systemInstruction = `あなたは日本の医療機関向け電子カルテ・診療録・医療文書専門の超高精度OCRエンジンです。
医師が撮影した「電子カルテ画面」「紙の健康診断結果票」「診療情報提供書（紹介状）」「血液・生化学検査結果表」「処方箋」の画像から、文字・数値・単位・記号を1字の狂いもなく正確に読み取ります。

【必須遵守ルール（医療DX品質基準）】
1. カルテ見出し括弧の標準化:
   - 日本の電子カルテ標準である隅付き括弧【 】を正確に出力すること（例: 【主訴】、【健診データ (判定)】、【生活習慣・問診】、【診察】、【方針】、【現病歴】、【既往歴】、【処方】）。
   - 「」や（）や単なる太字、コロンのみに崩さないこと。
2. 医療専門用語・同音異義語の医学的文脈補正:
   - 一般語への誤変換（例: 「定期健康診断」を「低気」、「異常指摘」を「以上」、「健診データ」を「検診だた」、「自覚症状特になし」を「似なし」、「脂質分画」を「資質分」）を厳禁とし、医学的に正しい漢字で出力すること。
   - 「缶ビール」「休肝日」「脂肪肝疑い」「腹部触診」「圧痛なし」「肝腫大」「再検」など、医学・生活習慣用語を忠実に認識すること。
3. ギリシャ文字・検査項目・単位の厳密保持:
   - 「γ-GTP」のギリシャ文字「γ（ガンマ）」をハイフンやマイナス（-GTP）に欠落させず、必ず「γ-GTP」と出力すること。
   - 「HbA1c」「LDL-C」「TG」「ALT(GPT)」「AST(GOT)」「BMI」などのアルファベット表記を正確に維持すること。
   - 単位（mg/dL, U/L, %, kg, g, mmHg等）および数値を半角英数字で正確に認識すること。「ｍｇ・ｄL」のような全角文字や不要な中黒記号は半角「mg/dL」に正規化すること。
4. ローマ字・未変換文字の完全排除:
   - 途中のローマ字（kyoukaigata, tyuuseisibou等）は一切出力せず、すべて正式な日本語漢字・かな・正規英数字で出力すること。
5. ノイズの除去とレイアウト維持:
   - PCモニタ枠、タスクバー、不要なボタンUIは無視し、カルテ記事本文・所見・数値のみを元の改行・箇条書き構造を保って出力すること。
   - 前置き・解説・AIとしての挨拶は一切出力せず、本文のみを出力すること。`;

      let prompt = `この画像からカルテ記事または医療文書のテキストを、上記の医療DX品質基準に従って正確に読み取ってください。`;
      if (mode === 'soap') {
        prompt += `\n【指示】SOAP形式（S:主訴、O:客観的所見、A:評価、P:治療方針）で整理して出力してください。`;
      } else if (mode === 'prescription') {
        prompt += `\n【指示】薬剤名、用法、用量、日数の処方内容を中心に正確に抽出してください。`;
      }

      const result = await executeAiWithFallback(ai, {
        contents: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'image/jpeg',
            },
          },
          {
            text: prompt,
          },
        ],
        config: {
          systemInstruction,
          temperature: 0.0, // 決定論的・最高忠実度の文字起こし
        },
        candidateModels: [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
        ],
      });

      const extractedText = result.text?.trim() || '';
      res.json({ success: true, text: extractedText, model: result.usedModel });
    } catch (err: any) {
      console.error('AI OCR API Error:', err);
      const isQuotaExhausted = String(err?.message || '').includes('Quota exceeded') || String(err?.message || '').includes('RESOURCE_EXHAUSTED');
      const is503 = String(err?.message || '').includes('503') || String(err?.message || '').includes('high demand');
      const message = isQuotaExhausted
        ? 'AIモデルの無料クォータ上限に達しました。しばらく時間をおいて再度お試しください。'
        : is503
        ? 'AIモデルが現在混雑しています。数秒後に再度お試しください。'
        : (err.message || 'カメラOCRに失敗しました');
      res.status(500).json({ error: message });
    }
  });

  // 臨床判断支援 (CDS) エンドポイント: ICD-10病名推奨、HVCスコア算出、併用禁忌・処方監査
  app.post('/api/ai/analyze-clinical', async (req, res) => {
    try {
      const { soapText, patientContext } = req.body;
      if (!soapText || typeof soapText !== 'string') {
        return res.status(400).json({ error: 'カルテ・SOAPテキストが必要です' });
      }

      const ai = getAiClient();
      const age = patientContext?.age || 64;
      const gender = patientContext?.gender || '男性';

      const systemInstruction = `あなたは日本の臨床医学および電子カルテシステムに精通した「スマートパーソナルヘルスケア HVC (High Value Care) シニアアーキテクト」です。
提供された診察・SOAPテキストと患者背景（年齢: ${age}歳, 性別: ${gender}）から、以下の3点を高精度に判定し、必ず指定されたJSON構造のみを出力してください。

【設計理念: 医師を守る「防護盾（スマート・コパイロット）」】
- 単なる「無駄な医療の削減（Choosing Wisely）」という批判的・説教的なスローガンを排し、見落とし・過誤訴訟・レセプト返戻（減点）から医師を守る「防衛的サジェスト」として構成すること。
- 患者の身体的ハーム（不要な被曝・下剤・偶発症・偽陽性ケアカスケード）を回避するメリットを明示すること。

1. 【MEDIS標準病名・ICD-10病名推奨 ＆ レセプト適応支援】
   - カルテ内の所見・主訴・投薬歴に基づき、適合する標準病名（MEDIS病名マスター準拠）とICD-10コードを推奨。
   - status: "confirmed"（確定病名）または "suspected"（疑い病名）。
   - billingTip: 投薬や検査が査定・返戻されないためのレセプト適応アドバイス（例: タケキャブ処方時の逆流性食道炎病名補完など）。

2. 【スマートHVC臨床スコア ＆ 防衛的サジェスト】
   - 以下の代表的HVCシナリオを網羅・評価:
     * 軽症頭部打撲 ➔ HEAD_INJURY_CT (CCHR/PECARN基準: JCS 0/神経異常なし時の観察待機プロトコル選択)
     * 急性上気道炎/咽頭炎 ➔ CENTOR (感冒時の抗菌薬適正使用・耐性菌/副作用リスク低減)
     * 酸分泌抑制薬 ➔ PPI_STEWARDSHIP (タケキャブ/ネキシウム等の病名漏れ防止 ＆ 漫然投与見直し)
     * 消化器内視鏡検診 ➔ GI_ENDOSCOPY_HVC (ピロリ未感染低リスク層に対する不要検査猶予・ハーム回避)
     * 心房細動 ➔ CHADS2 (見落とし・脳梗塞予防DOAC推奨)
     * 市中肺炎 ➔ A-DROP (重症度・入院適応判定)
     * 脂肪肝 ➔ FIB_4 (肝線維化スクリーニング・低リスク時の生活習慣改善先行)
   - nudgeCategory: "clinical_support" (学会指針) | "prescription_check" (耐性菌・副作用防止) | "billing_safety" (返戻防止) | "previsit_pmh" (PMH生涯リスク判定)
   - harmAvoidanceBenefit: 身体的ハーム回避メリット

3. 【併用禁忌・安全性アラート】
   - 致命的な併用禁忌（ワーファリン+アミオダロン、シルデナフィル+ニトログリセリン、シンバスタチン+イトラコナゾール、β遮断薬+ベラパミル等）。

【出力フォーマット】
前置きやMarkdownコードブロックを含めず、直接以下のJSONオブジェクトを出力すること:
{
  "suggestedDiagnoses": [
    {
      "standardName": "string",
      "icd10Code": "string",
      "medisCode": "string",
      "status": "confirmed" | "suspected",
      "evidence": "string",
      "confidence": number,
      "category": "string",
      "isChronic": boolean,
      "billingTip": "string"
    }
  ],
  "clinicalScores": [
    {
      "scoreType": "HEAD_INJURY_CT" | "CENTOR" | "PPI_STEWARDSHIP" | "GI_ENDOSCOPY_HVC" | "CHADS2" | "A_DROP" | "FIB_4" | "CURB_65",
      "title": "string",
      "targetCondition": "string",
      "nudgeCategory": "clinical_support" | "prescription_check" | "billing_safety" | "previsit_pmh",
      "scoreValue": number | string,
      "maxScore": number,
      "level": "low" | "moderate" | "high" | "critical",
      "fulfilledCriteria": [{ "key": "string", "label": "string", "points": number, "matchedText": "string" }],
      "guidelineTitle": "string",
      "recommendation": "string",
      "harmAvoidanceBenefit": "string"
    }
  ],
  "safetyAlerts": [
    {
      "id": "string",
      "type": "contraindication" | "dosage_warning" | "interaction",
      "title": "string",
      "message": "string",
      "severity": "danger" | "warning" | "info",
      "drugs": ["string", "string"],
      "recommendation": "string"
    }
  ]
}`;

      const prompt = `患者年齢: ${age}歳 / 性別: ${gender}\n\n【診察テキスト / SOAP】\n${soapText}`;

      const result = await executeAiWithFallback(ai, {
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
        candidateModels: [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-1.5-flash',
        ],
      });

      const rawJson = result.text?.trim() || '{}';
      let parsedData;
      try {
        parsedData = JSON.parse(rawJson);
      } catch (parseErr) {
        console.warn('[AI] JSON Parse Warning, regex cleanup fallback:', parseErr);
        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('AIレスポンスのJSONパースに失敗しました');
        }
      }

      res.json({
        success: true,
        suggestedDiagnoses: parsedData.suggestedDiagnoses || [],
        clinicalScores: parsedData.clinicalScores || [],
        safetyAlerts: parsedData.safetyAlerts || [],
        model: result.usedModel
      });
    } catch (err: any) {
      console.error('AI Clinical CDS Error:', err);
      res.status(500).json({
        error: err.message || '臨床判断支援のAI解析に失敗しました'
      });
    }
  });

  // ルーム情報・状態取得RESTエンドポイント (HTTPフォールバック対応)
  app.get('/api/ehr/rooms/:roomId', (req, res) => {
    const room = getOrCreateRoom(req.params.roomId);
    let pcCount = 0;
    let phoneCount = 0;
    for (const c of room.clients) {
      if (c.role === 'ehr-pc') pcCount++;
      if (c.role === 'phone-app') phoneCount++;
    }
    res.json({
      roomId: room.roomId,
      activePane: room.activePane,
      panes: room.panes,
      cursor: room.cursor,
      patient: room.patient,
      connectedPeers: { pcCount, phoneCount },
      lastUpdatedAt: room.lastUpdatedAt
    });
  });

  // ファームウェアソースコードダウンロード (Linux Mint / ブラウザ直結用)
  app.get('/api/firmware/main.cpp', (_req, res) => {
    try {
      const firmwarePath = path.resolve(process.cwd(), 'firmware/src/main.cpp');
      if (fs.existsSync(firmwarePath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="main.cpp"');
        return res.sendFile(firmwarePath);
      }
      res.status(404).send('firmware/src/main.cpp not found');
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.get('/api/firmware/platformio.ini', (_req, res) => {
    try {
      const pioPath = path.resolve(process.cwd(), 'firmware/platformio.ini');
      if (fs.existsSync(pioPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(pioPath);
      }
      res.status(404).send('firmware/platformio.ini not found');
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  app.get('/api/firmware/partitions_8MB.csv', (_req, res) => {
    try {
      const partPath = path.resolve(process.cwd(), 'firmware/partitions_8MB.csv');
      if (fs.existsSync(partPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(partPath);
      }
      res.status(404).send('firmware/partitions_8MB.csv not found');
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // ヘルスチェックエンドポイント
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'DrVoice Donguri Server & Realtime WebSocket', timestamp: Date.now() });
  });

  // APIエラーハンドリングミドルウェア (JSONパースエラーやペイロード超過エラーをHTMLではなくJSONで返す)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      console.error('[API Middleware Error]:', err);
      if (err.type === 'entity.too.large') {
        return res.status(413).json({
          success: false,
          error: '画像データが大きすぎます。自動圧縮処理を確認してください。',
        });
      }
      return res.status(err.status || 500).json({
        success: false,
        error: err.message || 'サーバー処理エラーが発生しました',
      });
    }
    next();
  });

  // Vite開発サーバーミドルウェアまたは静的ファイル配信
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DrVoice Server] Running on http://0.0.0.0:${PORT} (WebSocket + HTTP)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

