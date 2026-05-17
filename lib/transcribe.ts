import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  GoogleGenAI,
  Type,
  FileState,
  createPartFromUri,
} from '@google/genai';
import { errorMessage } from './format';
import { extractUsage, type Usage } from './pricing';
import type { TranscriptSegment } from './types';

const MODEL = 'gemini-3.1-flash-lite';

const TRANSCRIBE_PROMPT = `당신은 한국어 기독교 설교 오디오 전사 전문가입니다.

규칙:
- 출력은 JSON 스키마를 정확히 따른다.
- segments: 설교 전체를 자연스러운 표현 단위(약 10~25초)로 끊어 배열로 출력.
- 각 segment.startSec: 해당 발화 시작 시각(초, 정수 또는 소수).
- 각 segment.text: 해당 구간의 받아쓰기. 한국어로, 자연스러운 문장으로 정리.
- 성경 고유명사(여호와, 그리스도, 베드로, 고린도전서 등)와 본문 인용은 정확히 표기.
- 설교자가 말하지 않은 내용은 추가하지 않는다. 요약 금지, 받아쓰기만.
- "어…", "음…" 같은 군말은 자연스러운 선에서 정리.
- 침묵·박수·반주 구간은 segment로 만들지 않는다.`;

const SEGMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startSec: { type: Type.NUMBER },
          text: { type: Type.STRING },
        },
        required: ['startSec', 'text'],
      },
    },
  },
  required: ['segments'],
};

function runCmd(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
    });
  });
}

export interface AudioFile {
  path: string;
  cleanup: () => Promise<void>;
}

export async function extractAudio(url: string): Promise<AudioFile> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sermon-audio-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    await runCmd(
      'yt-dlp',
      [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '5',
        '--postprocessor-args',
        'ffmpeg:-ac 1 -ar 16000 -b:a 32k',
        '-o',
        '%(id)s.%(ext)s',
        url,
      ],
      dir,
    );
    const files = await readdir(dir);
    const mp3 = files.find((f) => f.endsWith('.mp3'));
    if (!mp3) throw new Error('오디오 추출 실패: mp3 파일을 찾을 수 없습니다.');
    return { path: path.join(dir, mp3), cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
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

async function uploadAndWaitActive(audioPath: string) {
  const uploaded = await client().files.upload({
    file: audioPath,
    config: { mimeType: 'audio/mp3' },
  });
  if (!uploaded.name) throw new Error('업로드된 파일에 name이 없습니다.');

  let file = uploaded;
  const deadline = Date.now() + 120_000;
  while (file.state !== FileState.ACTIVE) {
    if (file.state === FileState.FAILED) {
      throw new Error(
        `Gemini File 처리 실패: ${file.error?.message ?? 'unknown'}`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error('Gemini File ACTIVE 상태 대기 타임아웃(120s).');
    }
    await new Promise((r) => setTimeout(r, 2000));
    file = await client().files.get({ name: uploaded.name });
  }
  return file;
}

export interface TranscribeResult {
  segments: TranscriptSegment[];
  usage: Usage;
}

export async function transcribeAudio(
  audioPath: string,
): Promise<TranscribeResult> {
  const file = await uploadAndWaitActive(audioPath);
  try {
    if (!file.uri || !file.mimeType) {
      throw new Error('업로드된 파일 정보(uri/mimeType)가 부족합니다.');
    }

    const response = await client().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            createPartFromUri(file.uri, file.mimeType),
            { text: TRANSCRIBE_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: SEGMENT_SCHEMA,
        maxOutputTokens: 32768,
      },
    });

    const text = response.text ?? '';
    if (!text || text.trim().length === 0) {
      throw new Error('Gemini 전사 응답이 비어있습니다.');
    }

    const usage = extractUsage(response.usageMetadata);

    let parsed: { segments: { startSec: number; text: string }[] };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch (e) {
      throw new Error(`전사 JSON 파싱 실패: ${errorMessage(e)}`);
    }

    const raw = Array.isArray(parsed.segments) ? parsed.segments : [];
    const segments = raw
      .filter(
        (s) =>
          typeof s?.startSec === 'number' &&
          typeof s?.text === 'string' &&
          s.text.trim().length > 0,
      )
      .map((s, idx) => ({
        idx,
        ts: Math.max(0, Math.floor(s.startSec)),
        text: s.text.trim(),
      }));

    return { segments, usage };
  } finally {
    if (file.name) {
      await client()
        .files.delete({ name: file.name })
        .catch(() => {});
    }
  }
}

export async function transcribeFromUrl(
  url: string,
): Promise<TranscribeResult> {
  const audio = await extractAudio(url);
  try {
    return await transcribeAudio(audio.path);
  } finally {
    await audio.cleanup();
  }
}
