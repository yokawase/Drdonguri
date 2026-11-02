import { describe, it, expect } from 'vitest';
import {
  buildClinicalAuditChatResponse,
  buildInstantSecretaryRagResponse,
} from '../src/services/webLlmService';

describe('Gemma2専属医療秘書 カルテ総合監査・見落としチェック連動テスト', () => {
  it('カルテ未入力時は無関係な固定文を出さず、入力案内を提示する', () => {
    const res = buildClinicalAuditChatResponse('');
    expect(res.answer).toContain('先生、現在カルテ内容が未入力です');
    expect(res.answer).not.toContain('全身状態・バイタル安全確認 (標準トリアージ)');
    expect(res.answer).not.toContain('抗微生物薬適正使用の手引き');
    expect(res.answer).not.toContain('動脈硬化性疾患・高血圧治療GL');
  });

  it('腹痛カルテが入力されている場合、腹痛のRed Flagsとピットフォールが的確に提示される', () => {
    const chart = `
52歳男性。昨夜からの激しい右下腹部痛。
38.2度の発熱、悪寒あり。
歩行時に響くような痛み。吐き気あり。
ロキソニン 60mg 頓用で内服したが改善せず。
    `.trim();

    const res = buildClinicalAuditChatResponse(chart);

    // 1. カルテ所見の把握・引用
    expect(res.answer).toContain('右下腹部痛');

    // 2. 腹痛・発熱に関連するRed Flags
    expect(res.answer).toMatch(/(?:腹痛|急性腹症|発熱|感染)/);
    expect(res.answer).toMatch(/(?:穿孔|腹膜炎|虫垂炎|虚血)/);

    // 3. 腹痛カルテで不足している所見（筋性防御・反跳痛など）が指摘される
    expect(res.answer).toMatch(/(?:腹膜刺激徴候|反跳痛|筋性防御|腸雑音)/);

    // 4. 内服中のロキソニンに対する言及がある
    expect(res.answer).toMatch(/(?:ロキソニン|NSAIDs|処方)/);

    // 5. 以前の無関係な固定文（抗微生物薬適正使用の手引き、動脈硬化性疾患）が無条件に出てこない
    expect(res.answer).not.toContain('抗微生物薬適正使用の手引き (厚労省) (抗菌薬適正使用根拠)');
    expect(res.answer).not.toContain('動脈硬化性疾患・高血圧治療GL (生活習慣病管理根拠)');
  });

  it('胸痛カルテが入力されている場合、胸痛のKiller Red Flagsと心電図確認が提示される', () => {
    const chart = `
65歳男性。今朝からの前胸部絞扼痛。
冷汗あり、左肩へ放散する重苦しい痛み。
BP 150/90, HR 88, SpO2 97%。
    `.trim();

    const res = buildClinicalAuditChatResponse(chart);

    expect(res.answer).toContain('前胸部絞扼痛');
    expect(res.answer).toMatch(/(?:Killer Chest Pain|胸痛|心筋梗塞|ACS)/);
    expect(res.answer).toMatch(/(?:心電図|ECG|背部移動痛|ST)/);
  });

  it('buildInstantSecretaryRagResponse で「カルテ総合監査・見落としチェック」を呼んだ際、入力カルテに連動する', () => {
    const chart = `
70歳女性。めまいとふらつき。
立位で悪化、右半身のしびれ感あり。
    `.trim();

    const query = '現在のカルテ内容から、鑑別すべきRed Flags（致死的疾患）、確認すべき追加所見、処方・腎機能(eGFR)の注意点を医療秘書として簡潔に監査してください。';

    const res = buildInstantSecretaryRagResponse(query, chart);

    // カルテ所見の反映
    expect(res.instantAnswer).toContain('めまい');
    expect(res.instantAnswer).toMatch(/(?:めまい|しびれ|脳血管|小脳)/);

    // クエリの「eGFR」という文字列だけで eGFR 基準値ブロックが無条件固定出現しない
    expect(res.instantAnswer).not.toContain('末期腎不全・透析導入準備水準');
  });
});
