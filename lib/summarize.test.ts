import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (this: { models: { generateContent: typeof generateContentMock } }) {
    this.models = { generateContent: generateContentMock };
  }),
}));

import { summarizeSermon } from './summarize';

describe('summarizeSermon', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    process.env.GEMINI_API_KEY = 'test-key';
  });

  it('returns markdown text from Gemini response', async () => {
    generateContentMock.mockResolvedValue({ text: '## 도입\n…요약…' });
    const md = await summarizeSermon({
      transcript: '안녕하세요. 오늘 본문은…',
      meta: { title: '테스트', preacher: null, sermonDate: null, bibleReference: null },
    });
    expect(md).toBe('## 도입\n…요약…');
    expect(generateContentMock).toHaveBeenCalledOnce();
    const args = generateContentMock.mock.calls[0][0];
    expect(args.model).toBe('gemini-3.1-flash-lite-preview');
    expect(args.config.systemInstruction).toMatch(/한국어 설교 요약/);
    expect(typeof args.contents).toBe('string');
    expect(args.contents).toContain('테스트');
    expect(args.contents).toContain('안녕하세요. 오늘 본문은…');
  });

  it('throws if Gemini returns empty text', async () => {
    generateContentMock.mockResolvedValue({ text: '' });
    await expect(
      summarizeSermon({
        transcript: 'x',
        meta: { title: null, preacher: null, sermonDate: null, bibleReference: null },
      }),
    ).rejects.toThrow(/empty/i);
  });
});
