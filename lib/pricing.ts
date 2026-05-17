import type {
  GenerateContentResponseUsageMetadata,
  ModalityTokenCount,
} from '@google/genai';

// gemini-3.1-flash-lite 단가 (USD per 1M tokens, 2026-05 기준)
export const PRICING = {
  inputTextPerMTok: 0.25,
  inputAudioPerMTok: 0.5,
  outputPerMTok: 1.5,
} as const;

// 표시용 환율 — 정확한 정산이 아니라 감각용
export const KRW_PER_USD = 1350;

export interface Usage {
  inputTextTokens: number;
  inputAudioTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
}

export function emptyUsage(): Usage {
  return {
    inputTextTokens: 0,
    inputAudioTokens: 0,
    outputTokens: 0,
    thoughtsTokens: 0,
  };
}

export function addUsage(target: Usage, src: Usage): void {
  target.inputTextTokens += src.inputTextTokens;
  target.inputAudioTokens += src.inputAudioTokens;
  target.outputTokens += src.outputTokens;
  target.thoughtsTokens += src.thoughtsTokens;
}

function splitByModality(
  details: ModalityTokenCount[] | undefined,
): { audio: number; nonAudio: number; hasDetails: boolean } {
  if (!details || details.length === 0) {
    return { audio: 0, nonAudio: 0, hasDetails: false };
  }
  let audio = 0;
  let nonAudio = 0;
  for (const d of details) {
    const count = d.tokenCount ?? 0;
    if (String(d.modality) === 'AUDIO') audio += count;
    else nonAudio += count;
  }
  return { audio, nonAudio, hasDetails: true };
}

export function extractUsage(
  meta: GenerateContentResponseUsageMetadata | undefined,
): Usage {
  const u = emptyUsage();
  if (!meta) return u;

  const breakdown = splitByModality(meta.promptTokensDetails);
  if (breakdown.hasDetails) {
    u.inputAudioTokens = breakdown.audio;
    u.inputTextTokens = breakdown.nonAudio;
  } else {
    u.inputTextTokens = meta.promptTokenCount ?? 0;
  }
  u.outputTokens = meta.candidatesTokenCount ?? 0;
  u.thoughtsTokens = meta.thoughtsTokenCount ?? 0;
  return u;
}

export function costUsd(u: Usage): number {
  const M = 1_000_000;
  return (
    (u.inputTextTokens * PRICING.inputTextPerMTok) / M +
    (u.inputAudioTokens * PRICING.inputAudioPerMTok) / M +
    ((u.outputTokens + u.thoughtsTokens) * PRICING.outputPerMTok) / M
  );
}

export function formatUsage(u: Usage): string {
  const usd = costUsd(u);
  const krw = usd * KRW_PER_USD;
  const inputTotal = u.inputTextTokens + u.inputAudioTokens;
  const audioPart =
    u.inputAudioTokens > 0
      ? ` (text=${u.inputTextTokens}, audio=${u.inputAudioTokens})`
      : '';
  const thoughtsPart =
    u.thoughtsTokens > 0 ? `, thoughts=${u.thoughtsTokens}` : '';
  return (
    `input=${inputTotal}${audioPart}, output=${u.outputTokens}${thoughtsPart} ` +
    `→ $${usd.toFixed(4)} (≈${krw.toFixed(1)}원 @${KRW_PER_USD})`
  );
}
