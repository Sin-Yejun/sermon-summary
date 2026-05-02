import { GoogleGenAI, Type } from '@google/genai';
import { fmtTs } from './format';
import type {
  SummaryBullet,
  SummaryDoc,
  SummarySection,
  SummarySubsection,
  TranscriptSegment,
} from './types';

const MODEL = 'gemini-3.1-flash-lite-preview';

const SHARED_PRINCIPLES = `당신은 한국어 설교 요약 전문 어시스턴트입니다.
설교 자막을 다룰 때 다음 원칙을 반드시 지킵니다.

[표현 완결성]
- 각 단락은 도입-전개-결론이 끊기지 않은 완결된 표현 단위에 대응한다.
- 예화·일화·인용은 시작과 마무리를 함께 묶어 처리한다.
- 적용 권면은 권면을 시작하는 도입부터 결론까지 한 단위로 본다.

[자연스러운 경계]
- 화제가 바뀌는 자연스러운 지점(본문 → 강해, 강해 → 적용, 적용 → 결단)에서 단락을 나눈다.
- 호흡, 강조, 어조 변화에서 경계를 잡는다.

[감정·논리 연속성]
- 감정 흐름의 起承轉合을 끊지 않는다.
- 본문(성경) 해석의 논리 구조(전제 → 핵심 메시지 → 적용)를 보존한다.

[설교 흐름 인지]
- 설교는 보통 도입(상황·예화) → 본문 강해 → 적용·결단 → 마무리·축복 순으로 흐른다.
- 본문 인용은 정확히 보존한다.
- 자막 오인식이 명백한 부분은 자연스럽게 정정한다.
- 메타 코멘트("이 요약은…", "AI가 생성한…") 절대 금지.`;

const OUTLINE_PROMPT = `${SHARED_PRINCIPLES}

[현재 작업: 1단계 — 구조와 핵심 추출]
입력으로 주어지는 자막 세그먼트(각 줄: [idx] mm:ss 텍스트)에서
설교의 흐름을 sections > subsections 계층으로 정리한다.

규칙:
- 출력은 JSON 스키마를 정확히 따른다.
- tldr: 2~3문장으로 설교 전체를 압축.
- sections: 3~6개. id는 "1", "2", "3" 형식.
- subsections: 각 section마다 1~3개. id는 "1.1", "1.2"처럼 부모와 점 표기.
- 각 subsection은 coveredIdxRange로 그 단락이 자막의 어느 idx 범위를 커버하는지
  [startIdx, endIdx]를 명시한다(닫힌 구간, 둘 다 포함).
- 각 subsection.bullets: 3~6개. 핵심 명제. 필요하면 subBullets 한 단계만 더.
- bullets와 subBullets에는 citations를 포함하지 않는다(다음 단계에서 부여).`;

const CITATION_PROMPT = `${SHARED_PRINCIPLES}

[현재 작업: 2단계 — 인용 매칭]
이전 단계에서 만든 한 subsection의 bullets 텍스트와, 그 단락에 해당하는
자막 세그먼트가 주어진다. 각 bullet과 subBullet이 어느 자막 idx에서
직접 도출되는지 1~3개 고른다.

규칙:
- 출력은 JSON 스키마를 정확히 따른다(입력 bullets와 동일한 순서, 동일한 텍스트, citations만 채움).
- citations: 그 주장의 근거가 가장 직접적으로 드러나는 자막 idx 1~3개.
- 인용 없는 bullet은 만들지 않는다. 근거가 약하면 가장 가까운 idx를 1개라도 고른다.
- subBullets가 있다면 그것에도 동일하게 citations를 부여한다.
- text는 입력 그대로 보존한다(임의 수정 금지).`;

const BULLET_INPUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    subBullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING } },
        required: ['text'],
      },
    },
  },
  required: ['text'],
};

const OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tldr: { type: Type.STRING },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          subsections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                coveredIdxRange: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                },
                bullets: { type: Type.ARRAY, items: BULLET_INPUT_SCHEMA },
              },
              required: ['id', 'title', 'coveredIdxRange', 'bullets'],
            },
          },
        },
        required: ['id', 'title', 'subsections'],
      },
    },
  },
  required: ['tldr', 'sections'],
};

const BULLET_OUTPUT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    text: { type: Type.STRING },
    citations: { type: Type.ARRAY, items: { type: Type.INTEGER } },
    subBullets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          citations: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ['text', 'citations'],
      },
    },
  },
  required: ['text', 'citations'],
};

const CITATION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    bullets: { type: Type.ARRAY, items: BULLET_OUTPUT_SCHEMA },
  },
  required: ['bullets'],
};

interface OutlineSubsection {
  id: string;
  title: string;
  coveredIdxRange: [number, number] | number[];
  bullets: { text: string; subBullets?: { text: string }[] }[];
}
interface OutlineSection {
  id: string;
  title: string;
  subsections: OutlineSubsection[];
}
interface OutlineDraft {
  tldr: string;
  sections: OutlineSection[];
}

interface CitationResult {
  bullets: SummaryBullet[];
}

export interface SummarizeArgs {
  segments: TranscriptSegment[];
  meta: {
    title: string | null;
    bibleReference: string | null;
    preacher: string | null;
    sermonDate: string | null;
  };
}

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function segmentsToPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${s.idx}] ${fmtTs(s.ts)} ${s.text}`)
    .join('\n');
}

async function callJson<T>(args: {
  systemInstruction: string;
  contents: string;
  schema: object;
  maxOutputTokens?: number;
}): Promise<T> {
  const response = await client().models.generateContent({
    model: MODEL,
    contents: args.contents,
    config: {
      systemInstruction: args.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: args.schema,
      maxOutputTokens: args.maxOutputTokens ?? 16384,
    },
  });
  const text = response.text ?? '';
  if (!text || text.trim().length === 0) {
    throw new Error('Gemini returned empty response');
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `Gemini JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

async function extractOutline(args: SummarizeArgs): Promise<OutlineDraft> {
  const { segments, meta } = args;
  const userMessage = `메타데이터:
- 제목: ${meta.title ?? '미상'}
- 본문 구절: ${meta.bibleReference ?? '미상'}
- 설교자: ${meta.preacher ?? '미상'}
- 설교일: ${meta.sermonDate ?? '미상'}

자막 세그먼트(총 ${segments.length}개):
${segmentsToPrompt(segments)}`;

  const draft = await callJson<OutlineDraft>({
    systemInstruction: OUTLINE_PROMPT,
    contents: userMessage,
    schema: OUTLINE_SCHEMA,
    maxOutputTokens: 16384,
  });
  if (!draft.tldr || !Array.isArray(draft.sections) || draft.sections.length === 0) {
    throw new Error('Outline 결과가 비정상입니다.');
  }
  return draft;
}

function clampRange(
  range: number[] | [number, number],
  total: number,
): [number, number] {
  const lo = Math.max(0, Math.min(total - 1, Math.floor(range[0] ?? 0)));
  const hi = Math.max(lo, Math.min(total - 1, Math.floor(range[1] ?? lo)));
  return [lo, hi];
}

async function attachCitationsForSubsection(
  sub: OutlineSubsection,
  segments: TranscriptSegment[],
): Promise<SummarySubsection> {
  const [lo, hi] = clampRange(sub.coveredIdxRange, segments.length);
  const slice = segments.slice(lo, hi + 1);
  const bulletsInput = sub.bullets.map((b) => ({
    text: b.text,
    subBullets: b.subBullets?.map((sb) => ({ text: sb.text })) ?? [],
  }));

  const userMessage = `Subsection 제목: ${sub.title}
커버 범위: idx ${lo} ~ ${hi}

자막 세그먼트:
${segmentsToPrompt(slice)}

Bullets:
${JSON.stringify(bulletsInput, null, 2)}`;

  const result = await callJson<CitationResult>({
    systemInstruction: CITATION_PROMPT,
    contents: userMessage,
    schema: CITATION_SCHEMA,
    maxOutputTokens: 4096,
  });

  const sanitized: SummaryBullet[] = (result.bullets ?? []).map((b, i) => {
    const orig = sub.bullets[i];
    return {
      text: orig?.text ?? b.text,
      citations: (b.citations ?? []).filter(
        (c) => Number.isInteger(c) && c >= 0 && c < segments.length,
      ),
      subBullets:
        b.subBullets?.map((sb, j) => ({
          text: orig?.subBullets?.[j]?.text ?? sb.text,
          citations: (sb.citations ?? []).filter(
            (c) => Number.isInteger(c) && c >= 0 && c < segments.length,
          ),
        })) ?? [],
    };
  });

  const startTs = segments[lo]?.ts ?? 0;

  return {
    id: sub.id,
    title: sub.title,
    startTs,
    bullets: sanitized,
  };
}

export async function summarizeSermon(
  args: SummarizeArgs,
): Promise<SummaryDoc> {
  if (args.segments.length === 0) {
    throw new Error('자막 세그먼트가 비어있습니다.');
  }

  const outline = await extractOutline(args);

  const sections: SummarySection[] = await Promise.all(
    outline.sections.map(async (sec) => ({
      id: sec.id,
      title: sec.title,
      subsections: await Promise.all(
        sec.subsections.map((sub) =>
          attachCitationsForSubsection(sub, args.segments),
        ),
      ),
    })),
  );

  return {
    tldr: outline.tldr,
    sections,
  };
}
