import { GoogleGenAI, Type } from '@google/genai';
import { errorMessage } from './format';
import { extractUsage, type Usage, emptyUsage, addUsage } from './pricing';
import type {
  CompareVisualization,
  ConceptVisualization,
  MermaidVisualization,
  SummaryBullet,
  TimelineVisualization,
  Visualization,
  VisualKind,
} from './types';

const MODEL = 'gemini-3.1-flash-lite';

const SHARED_RULES = `당신은 한국어 설교 요약을 보조하는 시각화 데이터 생성 어시스턴트입니다.
- 출력은 JSON 스키마를 정확히 따른다.
- 모든 문자열은 한국어. 라벨은 짧게(3~12자), 설명은 한 문장(20~60자).
- 라벨에 큰따옴표, 백슬래시, 백틱 사용 금지.
- 원문(핵심 명제 목록)에 없는 사실을 만들지 않는다.`;

const FLOWCHART_PROMPT = `${SHARED_RULES}
[작업: Mermaid flowchart 생성]
규칙:
- 첫 줄은 정확히 \`flowchart TD\` 한 줄만, 그 뒤 개행.
- 모든 노드는 반드시 영문 ID(A, B, C…)와 대괄호로 감싼 라벨로 정의한다. 예: \`A[자녀의 효도]\`.
- 노드는 3~7개. 화살표는 \`-->\` 만 사용한다.
- 같은 라벨 두 번 반복 금지. 같은 노드를 다시 참조할 땐 ID만 쓴다.
- 인과/순서/조건의 흐름을 단방향으로 표현한다. 분기는 최대 1단계.

좋은 예시:
\`\`\`
flowchart TD
  A[자녀의 효도] --> B[부모의 기쁨]
  B --> C[하나님의 약속]
\`\`\`

나쁜 예시(이렇게 출력하지 말 것):
- \`flowchart TD자녀의 효도 --> 부모의 기쁨\` (한 줄에 다 붙임)
- \`자녀의 효도 --> 부모의 기쁨\` (노드 ID/대괄호 없음)
- \`A[효도] --> B[기쁨] B[기쁨] --> C[약속]\` (라벨 중복 표기)`;

const MINDMAP_PROMPT = `${SHARED_RULES}
[작업: Mermaid mindmap 생성]
규칙:
- 첫 줄은 정확히 \`mindmap\` 한 줄만, 그 뒤 개행.
- 둘째 줄은 루트 노드 한 개. 들여쓰기 2칸, 형태는 \`root((핵심어))\`.
- 루트의 직속 가지는 2~5개. 각 가지의 손자는 0~3개까지.
- 들여쓰기는 2칸 단위로만.

좋은 예시:
\`\`\`
mindmap
  root((청지기))
    시간
    재물
    재능
\`\`\``;

const COMPARE_PROMPT = `${SHARED_RULES}
[작업: 두 입장/상태/결과의 대조 데이터 생성]
규칙:
- axis: 두 항목을 비교하는 축의 이름 (예: "효도와 불효의 결과", "옛 사람과 새 사람")
- left.label, right.label: 비교 대상 두 개의 짧은 이름
- left.points, right.points: 각 항목의 특성/결과를 2~4개씩. 양쪽 개수가 같으면 좋다.`;

const TIMELINE_PROMPT = `${SHARED_RULES}
[작업: 시간/단계 순서 데이터 생성]
규칙:
- items: 3~6개. 시간/단계 순서대로 정렬한다.
- marker: 시점/단계 라벨 (예: "1단계", "출애굽", "다윗 시대")
- title: 그 시점의 사건/주제 (8~16자)
- description: 한 문장 설명 (20~60자)`;

const CONCEPT_PROMPT = `${SHARED_RULES}
[작업: 핵심 개념 카드 데이터 생성]
규칙:
- term: 핵심어 (3~10자, 예: "임마누엘")
- definition: 한 문장 정의 (20~60자)
- facets: 0~4개. 그 개념을 부연하는 측면. label과 value가 각각 짧은 문자열. 굳이 필요 없으면 빈 배열.`;

const FLOWCHART_SCHEMA = {
  type: Type.OBJECT,
  properties: { source: { type: Type.STRING } },
  required: ['source'],
};

const COMPARE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    axis: { type: Type.STRING },
    left: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        points: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['label', 'points'],
    },
    right: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        points: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['label', 'points'],
    },
  },
  required: ['axis', 'left', 'right'],
};

const TIMELINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          marker: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ['marker', 'title', 'description'],
      },
    },
  },
  required: ['items'],
};

const CONCEPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    term: { type: Type.STRING },
    definition: { type: Type.STRING },
    facets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ['label', 'value'],
      },
    },
  },
  required: ['term', 'definition'],
};

let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

function bulletsToContext(bullets: SummaryBullet[]): string {
  return bullets
    .map((b, i) => {
      const subs =
        b.subBullets && b.subBullets.length > 0
          ? '\n' + b.subBullets.map((sb) => `   - ${sb.text}`).join('\n')
          : '';
      return `${i + 1}. ${b.text}${subs}`;
    })
    .join('\n');
}

async function callJson(args: {
  systemInstruction: string;
  contents: string;
  schema: object;
}): Promise<{ json: unknown; usage: Usage } | null> {
  let response;
  try {
    response = await client().models.generateContent({
      model: MODEL,
      contents: args.contents,
      config: {
        systemInstruction: args.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: args.schema,
        maxOutputTokens: 2048,
      },
    });
  } catch (e) {
    console.warn(`[visualize] api 호출 실패: ${errorMessage(e)}`);
    return null;
  }
  const usage = extractUsage(response.usageMetadata);
  const text = response.text ?? '';
  if (!text.trim()) return { json: null, usage };
  try {
    return { json: JSON.parse(text), usage };
  } catch {
    return { json: null, usage };
  }
}

const FLOWCHART_HEADER_RE = /^flowchart\s+(TD|LR|TB|RL|BT)$/;
const MINDMAP_HEADER_RE = /^mindmap$/;
const ARROW_RE = /-->/;

function validateMermaid(
  source: string,
  diagram: 'flowchart' | 'mindmap',
): boolean {
  const trimmed = source.trim();
  if (trimmed.length < 20) return false;
  const lines = trimmed.split('\n');
  if (lines.length < 2) return false;
  const header = lines[0].trim();

  if (diagram === 'flowchart') {
    if (!FLOWCHART_HEADER_RE.test(header)) return false;
    const body = lines.slice(1).join('\n');
    return ARROW_RE.test(body);
  }

  if (!MINDMAP_HEADER_RE.test(header)) return false;
  return lines.slice(1).some((l) => /^\s{2,}\S/.test(l));
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(asString).filter(Boolean);
}

function buildMermaid(
  json: unknown,
  diagram: 'flowchart' | 'mindmap',
): MermaidVisualization | null {
  if (!json || typeof json !== 'object') return null;
  const source = asString((json as { source?: unknown }).source);
  if (!validateMermaid(source, diagram)) return null;
  return { kind: 'mermaid', diagram, source };
}

function buildCompare(json: unknown): CompareVisualization | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as {
    axis?: unknown;
    left?: { label?: unknown; points?: unknown };
    right?: { label?: unknown; points?: unknown };
  };
  const axis = asString(j.axis);
  const leftLabel = asString(j.left?.label);
  const rightLabel = asString(j.right?.label);
  const leftPoints = asStringArray(j.left?.points);
  const rightPoints = asStringArray(j.right?.points);
  if (!axis || !leftLabel || !rightLabel) return null;
  if (leftPoints.length < 2 || rightPoints.length < 2) return null;
  if (leftPoints.length > 6 || rightPoints.length > 6) return null;
  return {
    kind: 'compare',
    axis,
    left: { label: leftLabel, points: leftPoints },
    right: { label: rightLabel, points: rightPoints },
  };
}

function buildTimeline(json: unknown): TimelineVisualization | null {
  if (!json || typeof json !== 'object') return null;
  const rawItems = (json as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) return null;
  const items = rawItems
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const x = it as { marker?: unknown; title?: unknown; description?: unknown };
      const marker = asString(x.marker);
      const title = asString(x.title);
      const description = asString(x.description);
      if (!marker || !title || !description) return null;
      return { marker, title, description };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (items.length < 2 || items.length > 8) return null;
  return { kind: 'timeline', items };
}

function buildConcept(json: unknown): ConceptVisualization | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { term?: unknown; definition?: unknown; facets?: unknown };
  const term = asString(j.term);
  const definition = asString(j.definition);
  if (!term || !definition) return null;
  const rawFacets = Array.isArray(j.facets) ? j.facets : [];
  const facets = rawFacets
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const x = f as { label?: unknown; value?: unknown };
      const label = asString(x.label);
      const value = asString(x.value);
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((v): v is { label: string; value: string } => v !== null)
    .slice(0, 4);
  return {
    kind: 'concept',
    term,
    definition,
    ...(facets.length > 0 ? { facets } : {}),
  };
}

export interface VisualizeArgs {
  subsectionTitle: string;
  bullets: SummaryBullet[];
  kind: Exclude<VisualKind, 'none'>;
}

export interface VisualizeResult {
  visualization: Visualization | null;
  usage: Usage;
}

interface KindConfig {
  prompt: string;
  schema: object;
  build: (json: unknown) => Visualization | null;
}

const CONFIGS: Record<Exclude<VisualKind, 'none'>, KindConfig> = {
  flowchart: {
    prompt: FLOWCHART_PROMPT,
    schema: FLOWCHART_SCHEMA,
    build: (j) => buildMermaid(j, 'flowchart'),
  },
  mindmap: {
    prompt: MINDMAP_PROMPT,
    schema: FLOWCHART_SCHEMA,
    build: (j) => buildMermaid(j, 'mindmap'),
  },
  compare: { prompt: COMPARE_PROMPT, schema: COMPARE_SCHEMA, build: buildCompare },
  timeline: { prompt: TIMELINE_PROMPT, schema: TIMELINE_SCHEMA, build: buildTimeline },
  concept: { prompt: CONCEPT_PROMPT, schema: CONCEPT_SCHEMA, build: buildConcept },
};

export async function generateVisualization(
  args: VisualizeArgs,
): Promise<VisualizeResult> {
  const cfg = CONFIGS[args.kind];
  const userMessage = `Subsection 제목: ${args.subsectionTitle}

핵심 명제:
${bulletsToContext(args.bullets)}`;

  const totalUsage = emptyUsage();
  const result = await callJson({
    systemInstruction: cfg.prompt,
    contents: userMessage,
    schema: cfg.schema,
  });
  if (!result) return { visualization: null, usage: totalUsage };
  addUsage(totalUsage, result.usage);
  const visualization = cfg.build(result.json);
  return { visualization, usage: totalUsage };
}
