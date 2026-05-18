import { GoogleGenAI, Type } from '@google/genai';
import { errorMessage, fmtTs } from './format';
import { addUsage, emptyUsage, extractUsage, type Usage } from './pricing';
import type {
  SummaryBullet,
  SummaryDoc,
  SummarySection,
  SummarySubsection,
  TranscriptSegment,
  VisualKind,
} from './types';

const MODEL = 'gemini-3.1-flash-lite';

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

[목표 분량]
지나친 압축보다 충실한 재현을 우선한다. 설교에서 실제로 다뤄진 내용은
가능한 한 빠짐없이 담는다. 단, 자막 그대로의 길이로 늘어뜨리지 말고
의미 단위로 정돈된 문장으로 옮긴다.

규칙:
- 출력은 JSON 스키마를 정확히 따른다.
- tldr: 3~5문장으로 설교 전체의 핵심 메시지·본문구절·결단 포인트를 압축.
- sections: 3~6개. id는 "1", "2", "3" 형식.
- subsections: 각 section마다 2~4개. id는 "1.1", "1.2"처럼 부모와 점 표기.
  한 section이 1개 subsection으로만 끝나지 않도록 한다(섹션이 충분히 짧을 때만 예외).
- 각 subsection은 coveredIdxRange로 그 단락이 자막의 어느 idx 범위를 커버하는지
  [startIdx, endIdx]를 명시한다(닫힌 구간, 둘 다 포함).
- 각 subsection.bullets: 4~7개.
  - 각 bullet은 한 문장(30~90자). "주장 + 근거/예시/맥락"이 함께 담기도록.
  - 추상적 권면("X해야 한다")보다 구체적 근거·예화·인용을 곁들여 풀어 쓴다.
  - 단순 동어 반복 금지. bullet 간 내용이 겹치면 통합한다.
- subBullets: 적극 활용. bullet 1개당 0~3개.
  - 부연·예시·성경구절 인용·설교자 표현 그대로 인용 등에 사용한다.
  - 단순 반복 금지. bullet의 의미를 확장하거나 구체화할 때만.
- bullets와 subBullets에는 citations를 포함하지 않는다(다음 단계에서 부여).

[suggestedVisual 선정 규칙]
각 subsection마다 도식화가 유익할지 판단하여 다음 중 하나를 고른다.
- 'flowchart': **인과/순서/조건 흐름**이 명확할 때 (예: "회개 → 용서 → 감사", "원인 → 결과")
- 'mindmap': **한 개념의 분류/하위요소**가 2~4개로 명확히 나뉠 때 (예: "청지기 정신의 3요소", "사랑의 3가지 표현")
- 'compare': **두 입장/상태/결과의 대조**가 핵심일 때 (예: "효도하는 자녀 vs 불효하는 자녀", "옛 사람 vs 새 사람", "율법주의 vs 복음")
- 'timeline': **시간 순서/단계적 변화**가 핵심일 때 (예: 성경 사건의 흐름, 신앙 성장의 단계, 다윗 생애의 시기)
- 'concept': **하나의 핵심 단어/개념**에 대한 정의와 측면이 핵심일 때 (예: "임마누엘 — 하나님이 우리와 함께", "케노시스 — 자기 비움")
- 'none': 도식이 의미를 더하지 않을 때 (단순 권면, 예화 자체, 도입, 축복, 정서적 호소 등). **기본값은 'none'이며 도식이 정말 도움될 때만 다른 값을 고른다.** 의미 없는 도식이 의미 있는 도식보다 더 해롭다.

판단 우선순위(의심스러우면 위쪽이 우선):
1. 두 항목이 명확히 대비되는가 → 'compare'
2. 시간/단계 순서가 핵심인가 → 'timeline'
3. 인과/논리 흐름이 핵심인가 → 'flowchart'
4. 하나의 개념에 하위 요소가 있는가 → 'mindmap'
5. 한 개념의 정의·강조만이 핵심인가 → 'concept'
6. 위 어느 것도 아니면 → 'none'`;

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
                suggestedVisual: {
                  type: Type.STRING,
                  enum: [
                    'none',
                    'flowchart',
                    'mindmap',
                    'compare',
                    'timeline',
                    'concept',
                  ],
                },
              },
              required: [
                'id',
                'title',
                'coveredIdxRange',
                'bullets',
                'suggestedVisual',
              ],
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
  suggestedVisual?: VisualKind;
}

const VALID_VISUALS: readonly VisualKind[] = [
  'none',
  'flowchart',
  'mindmap',
  'compare',
  'timeline',
  'concept',
];

function normalizeVisual(v: unknown): VisualKind {
  return VALID_VISUALS.includes(v as VisualKind) ? (v as VisualKind) : 'none';
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
}): Promise<{ result: T; usage: Usage }> {
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
  const usage = extractUsage(response.usageMetadata);
  try {
    return { result: JSON.parse(text) as T, usage };
  } catch (e) {
    throw new Error(`Gemini JSON 파싱 실패: ${errorMessage(e)}`);
  }
}

async function extractOutline(
  args: SummarizeArgs,
): Promise<{ outline: OutlineDraft; usage: Usage }> {
  const { segments, meta } = args;
  const userMessage = `메타데이터:
- 제목: ${meta.title ?? '미상'}
- 본문 구절: ${meta.bibleReference ?? '미상'}
- 설교자: ${meta.preacher ?? '미상'}
- 설교일: ${meta.sermonDate ?? '미상'}

자막 세그먼트(총 ${segments.length}개):
${segmentsToPrompt(segments)}`;

  const { result: draft, usage } = await callJson<OutlineDraft>({
    systemInstruction: OUTLINE_PROMPT,
    contents: userMessage,
    schema: OUTLINE_SCHEMA,
    maxOutputTokens: 16384,
  });
  if (!draft.tldr || !Array.isArray(draft.sections) || draft.sections.length === 0) {
    throw new Error('Outline 결과가 비정상입니다.');
  }
  return { outline: draft, usage };
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
): Promise<{ subsection: SummarySubsection; usage: Usage }> {
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

  const { result, usage } = await callJson<CitationResult>({
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
    subsection: {
      id: sub.id,
      title: sub.title,
      startTs,
      bullets: sanitized,
      suggestedVisual: normalizeVisual(sub.suggestedVisual),
    },
    usage,
  };
}

export interface SummarizeResult {
  doc: SummaryDoc;
  usage: Usage;
}

export async function summarizeSermon(
  args: SummarizeArgs,
): Promise<SummarizeResult> {
  if (args.segments.length === 0) {
    throw new Error('자막 세그먼트가 비어있습니다.');
  }

  const totalUsage = emptyUsage();
  const { outline, usage: outlineUsage } = await extractOutline(args);
  addUsage(totalUsage, outlineUsage);

  const sections: SummarySection[] = await Promise.all(
    outline.sections.map(async (sec) => ({
      id: sec.id,
      title: sec.title,
      subsections: await Promise.all(
        sec.subsections.map(async (sub) => {
          const { subsection, usage } = await attachCitationsForSubsection(
            sub,
            args.segments,
          );
          addUsage(totalUsage, usage);
          return subsection;
        }),
      ),
    })),
  );

  return {
    doc: {
      tldr: outline.tldr,
      sections,
    },
    usage: totalUsage,
  };
}
