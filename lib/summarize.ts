import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3.1-flash-lite-preview';

const SYSTEM_PROMPT = `당신은 한국어 설교 요약 전문 어시스턴트입니다.
주어진 자막 텍스트로부터 설교의 핵심 메시지를 충실히 정리하되,
원문에 없는 해석/적용/인사이트를 추가하지 않습니다.

규칙:
- 출력은 마크다운. 섹션은 ## (h2) 사용.
- 섹션 구성은 설교 흐름에 맞게 결정 (예: 도입 / 본론 / 적용 / 결론).
- 본문이 명확히 구조화되어 있으면 그 구조를 따라가고,
  그렇지 않으면 흐름을 살려 재구조화한다.
- 핵심 문장은 > 인용 블록으로.
- 성경 구절 인용은 정확히 보존.
- 출력 길이는 1500~3000 토큰 사이.
- 자막 오인식으로 보이는 부분은 자연스럽게 정정한다.
- 요약 외의 메타 코멘트(예: "이 요약은…")를 쓰지 않는다.`;

export interface SummarizeArgs {
  transcript: string;
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

export async function summarizeSermon(args: SummarizeArgs): Promise<string> {
  const { transcript, meta } = args;
  const userMessage = `메타데이터:
- 제목: ${meta.title ?? '미상'}
- 본문 구절: ${meta.bibleReference ?? '미상'}
- 설교자: ${meta.preacher ?? '미상'}
- 설교일: ${meta.sermonDate ?? '미상'}

자막:
${transcript}`;

  const response = await client().models.generateContent({
    model: MODEL,
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 4096,
    },
  });

  const text = response.text ?? '';
  if (!text || text.trim().length === 0) {
    throw new Error('Gemini returned empty summary');
  }
  return text;
}
