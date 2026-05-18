import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: {
    models: { generateContent: typeof generateContentMock };
  }) {
    this.models = { generateContent: generateContentMock };
  }),
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    INTEGER: 'INTEGER',
    NUMBER: 'NUMBER',
  },
}));

import { generateVisualization } from './visualize';
import type { SummaryBullet } from './types';

const BULLETS: SummaryBullet[] = [
  { text: '회개가 시작점이다.', citations: [1] },
  { text: '용서가 따라온다.', citations: [2] },
  { text: '감사로 마무리된다.', citations: [3] },
];

describe('generateVisualization', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns mermaid flowchart on valid response', async () => {
    const source =
      'flowchart TD\n  A[회개] --> B[용서]\n  B --> C[감사]';
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ source }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '회개의 과정',
      bullets: BULLETS,
      kind: 'flowchart',
    });

    expect(visualization).toEqual({
      kind: 'mermaid',
      diagram: 'flowchart',
      source,
    });
    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toMatch(/flowchart 생성/);
    expect(call.contents).toContain('회개의 과정');
    expect(call.contents).toContain('회개가 시작점이다');
  });

  it('returns mermaid mindmap on valid response', async () => {
    const source =
      'mindmap\n  root((청지기))\n    시간\n    재물\n    재능';
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ source }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '청지기의 세 영역',
      bullets: BULLETS,
      kind: 'mindmap',
    });

    expect(visualization).toEqual({
      kind: 'mermaid',
      diagram: 'mindmap',
      source,
    });
    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toMatch(/mindmap 생성/);
  });

  it('returns null when source has wrong prefix', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ source: 'pie\n"a": 1\n"b": 2' }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });

    expect(visualization).toBeNull();
  });

  it('returns null when source is too short', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ source: 'flowchart TD' }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });

    expect(visualization).toBeNull();
  });

  it('returns null when flowchart header is glued to body on a single line', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        source: 'flowchart TD자녀의 효도 --> 부모의 기쁨부모의 기쁨',
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });

    expect(visualization).toBeNull();
  });

  it('returns null when flowchart body has no arrow', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        source: 'flowchart TD\n  A[효도]\n  B[기쁨]',
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });

    expect(visualization).toBeNull();
  });

  it('returns null when mindmap has no indented body', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        source: 'mindmap\nroot((청지기))\n시간\n재물',
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'mindmap',
    });

    expect(visualization).toBeNull();
  });

  it('returns null on empty response', async () => {
    generateContentMock.mockResolvedValueOnce({ text: '' });
    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });
    expect(visualization).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    generateContentMock.mockResolvedValueOnce({ text: 'not json' });
    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });
    expect(visualization).toBeNull();
  });

  it('returns null when api throws', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('rate limit'));
    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'flowchart',
    });
    expect(visualization).toBeNull();
  });

  it('returns compare visualization', async () => {
    const payload = {
      axis: '효도와 불효의 결과',
      left: { label: '효도', points: ['부모의 기쁨', '약속의 복', '관계의 회복'] },
      right: { label: '불효', points: ['부모의 슬픔', '영적 단절'] },
    };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(payload),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '효도와 불효',
      bullets: BULLETS,
      kind: 'compare',
    });

    expect(visualization).toEqual({ kind: 'compare', ...payload });
    const call = generateContentMock.mock.calls[0][0];
    expect(call.config.systemInstruction).toMatch(/대조 데이터/);
  });

  it('returns null when compare side has fewer than 2 points', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        axis: 'a',
        left: { label: 'L', points: ['하나만'] },
        right: { label: 'R', points: ['둘', '셋'] },
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'compare',
    });

    expect(visualization).toBeNull();
  });

  it('returns timeline visualization', async () => {
    const payload = {
      items: [
        { marker: '출생', title: '예수의 탄생', description: '베들레헴에서 태어나심.' },
        { marker: '공생애', title: '복음 선포', description: '하나님 나라를 가르치심.' },
        { marker: '십자가', title: '대속의 죽음', description: '인류 죄를 짊어지심.' },
      ],
    };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(payload),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '예수의 생애',
      bullets: BULLETS,
      kind: 'timeline',
    });

    expect(visualization).toEqual({ kind: 'timeline', ...payload });
  });

  it('returns null when timeline has too few items', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        items: [{ marker: 'a', title: 'b', description: 'c' }],
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'timeline',
    });

    expect(visualization).toBeNull();
  });

  it('returns concept visualization without facets', async () => {
    const payload = {
      term: '임마누엘',
      definition: '하나님이 우리와 함께하신다는 약속.',
    };
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify(payload),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '임마누엘',
      bullets: BULLETS,
      kind: 'concept',
    });

    expect(visualization).toEqual({ kind: 'concept', ...payload });
  });

  it('caps concept facets at 4', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({
        term: '청지기',
        definition: '맡기신 것을 관리하는 자.',
        facets: [
          { label: '근거', value: '마 25장' },
          { label: '대상', value: '시간/재물/재능' },
          { label: '태도', value: '책임' },
          { label: '결산', value: '주께 보고' },
          { label: '버려질 다섯번째', value: '잘림' },
        ],
      }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: '청지기',
      bullets: BULLETS,
      kind: 'concept',
    });

    expect(visualization?.kind).toBe('concept');
    if (visualization?.kind === 'concept') {
      expect(visualization.facets).toHaveLength(4);
    }
  });

  it('returns null when concept missing required fields', async () => {
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ term: '청지기' }),
    });

    const { visualization } = await generateVisualization({
      subsectionTitle: 't',
      bullets: BULLETS,
      kind: 'concept',
    });

    expect(visualization).toBeNull();
  });
});
