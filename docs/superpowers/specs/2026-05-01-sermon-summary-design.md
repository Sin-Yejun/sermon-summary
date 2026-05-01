# Sermon Summary — MVP 설계

- **작성일**: 2026-05-01
- **상태**: MVP 설계 (구현 전)
- **목표**: YouTube에 올라오는 긴 설교 영상을 AI로 잘 구조화·요약해서 단일 웹 문서로 보여주는 도구. 본인 사용 전제로 출발해, 결과 품질이 괜찮으면 모바일 앱으로 확장.

---

## 1. 범위와 비범위

### 범위 (MVP)
- 사용자가 YouTube URL을 붙여넣으면, 그 영상의 자막을 가져와 LLM이 구조화 요약을 생성하고, 단일 문서형 웹 페이지에 표시
- 메타데이터(제목, 날짜, 본문 성경구절, 설교자, 교회) 자동 추출
- 같은 영상은 한 번만 처리하고 이후 캐시된 결과를 반환
- 처리 진행 상태(메타데이터 → 자막 → 요약)를 UI에 노출

### 비범위 (MVP에서 제외)
- 자동 폴링 / 새 영상 자동 감지 / 구독 관리
- 사용자 인증, 멀티유저, 권한 시스템
- 영상 STT(Whisper 등) — 자막 없을 때의 폴백은 추후 검토
- 별도 인사이트, 코멘트, 묵상 가이드 등 부가 콘텐츠
- 모바일 앱 (웹 MVP 검증 후 별도 작업)
- 공개 배포 — MVP는 로컬 실행만, 검증 이후 Railway 우선 검토

---

## 2. 사용자 흐름

1. **홈 (`/`)** — URL 입력 폼 한 개
2. 사용자가 YouTube URL을 붙여넣고 제출
3. 서버가 URL에서 `videoId` 추출 → DB에 이미 있으면 즉시 결과 페이지로 리다이렉트
4. 없으면 새 `sermon` 레코드를 `pending` 상태로 생성하고 비동기 워커 시작
5. 클라이언트는 `/s/[videoId]`로 이동 → 1.5초 간격으로 상태 폴링
6. 완료되면 결과 문서가 표시됨
7. 같은 URL을 다시 넣으면 4번을 건너뛰고 곧바로 결과

---

## 3. 결과 페이지 — 단일 문서형

```
[헤더 카드]
  제목         "마지막 때와 청지기 정신"
  본문         베드로전서 4:7-11
  설교자       이찬수 목사
  교회         분당우리교회
  설교일       2026-04-26
  [원본 영상 ↗]

[본문 — Gemini가 생성한 마크다운]
  ## 1. 도입 — 시대를 보는 눈
  …
  > 인용할 만한 핵심 문장이 있다면 인용 블록으로

  ## 2. 본론 — 청지기로 살라는 부르심
  …

  ## 3. 적용 — 이번 주 우리에게
  …

  ## 결론
  …

[푸터]
  마지막 갱신 시각 / "다시 처리" 버튼
```

- 섹션 구성은 LLM이 설교 내용에 맞춰 자율적으로 결정. 구조가 뚜렷한 설교는 그대로 따라가고, 그렇지 않으면 흐름에 맞게 재구조화.
- 별도 인사이트/코멘트 금지 — 충실한 요약과 재구조화에만 집중.
- 마크다운은 클라이언트에서 렌더(`react-markdown` + `remark-gfm`).

---

## 4. 컴포넌트

### 4.1 Frontend
- **Next.js 14 App Router**, TypeScript
- **Tailwind + shadcn/ui** (입력 폼·카드·버튼 정도, 미니멀)
- 페이지
  - `/` — 입력 폼
  - `/s/[videoId]` — 진행 상태 표시 + 완료되면 결과 문서

### 4.2 API (Next.js Route Handlers)
- `POST /api/summarize` — body: `{ url: string }`. videoId 추출 → DB 조회 → 신규면 레코드 생성하고 워커 트리거. 응답: `{ videoId }`.
- `GET /api/sermon/[videoId]` — 응답: `{ status, metadata, summaryMarkdown, error }`. 클라이언트 폴링 대상.

### 4.3 Worker (서버 내 비동기 함수)
매주 1~2개 처리 정도라 큐 시스템 없이 단순 `async` 함수로 충분. 동시성 1로 제한해도 무방.

처리 단계:
1. **메타데이터 추출**: `yt-dlp --dump-json --skip-download <url>` → 제목·설명·길이
2. **메타데이터 파싱**: 영상 설명 첫 문단에서 정규식 기반으로 `날짜 / 교회 / 제목 / 본문구절 / 설교자` 추출. 추출 실패 시 LLM 폴백 또는 빈 값 허용.
3. **자막 추출**: `yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format vtt -o ...` → VTT 파싱 → 평문 트랜스크립트
4. **요약 생성**: Gemini 호출 (자세한 프롬프트는 §6)
5. **DB 저장**: 결과 마크다운, 메타데이터, 트랜스크립트 모두 저장. 상태 `done`.

각 단계 실패 시 상태 `failed` + `error` 메시지 기록, 자동 재시도 1회.

### 4.4 DB
- **SQLite** (`better-sqlite3`) — 로컬 단순성 최우선. 배포 시점에 Postgres 검토.
- 단일 테이블 `sermons`:
  ```
  videoId          TEXT PRIMARY KEY
  url              TEXT NOT NULL
  status           TEXT NOT NULL  -- pending | fetching_metadata | transcribing | summarizing | done | failed
  errorMessage     TEXT
  title            TEXT
  channelName      TEXT
  publishedAt      TEXT  -- ISO date
  sermonDate       TEXT  -- 설교일 (영상 설명에서 파싱)
  preacher         TEXT
  bibleReference   TEXT
  durationSeconds  INTEGER
  transcript       TEXT
  summaryMarkdown  TEXT
  createdAt        TEXT
  updatedAt        TEXT
  ```

---

## 5. 상태 머신

```
pending
  └→ fetching_metadata
       └→ transcribing
            └→ summarizing
                 └→ done

(어느 단계든) → failed
```

클라이언트 폴링 간격: **1.5초**. 완료 또는 실패면 폴링 중단.

---

## 6. LLM 프롬프트 설계

### 6.1 모델
- **`gemini-3.1-flash-lite-preview`** (운영 시점에는 stable 버전으로 핀)
- Context Caching이 모델에서 지원되면 시스템 프롬프트를 캐싱해 비용 절감

### 6.2 시스템 프롬프트 골자
```
당신은 한국어 설교 요약 전문 어시스턴트입니다. 
주어진 자막 텍스트로부터 설교의 핵심 메시지를 충실히 정리하되, 
원문에 없는 해석/적용/인사이트를 추가하지 않습니다.

규칙:
- 출력은 마크다운. 섹션은 ## (h2) 사용.
- 섹션 구성은 설교 흐름에 맞게 자유롭게 결정 (예: 도입 / 본론 / 적용 / 결론).
- 본문이 명확히 구조화되어 있으면 그 구조를 따라가고, 
  그렇지 않으면 흐름을 살려 재구조화.
- 핵심 문장이 있으면 > 인용 블록 사용.
- 성경 구절 인용은 정확히 보존.
- 출력 길이는 1500~3000 토큰 사이.
- 설교자 본인의 표현을 가능한 살리되, 자막 오인식으로 보이는 부분은 자연스럽게 정정.
```

### 6.3 사용자 메시지
- 메타데이터 (제목·본문구절·설교자·날짜)
- 자막 평문 텍스트

### 6.4 출력 검증
- 빈 문자열·과도하게 짧은 결과(< 500자) → 1회 재시도
- 출력 토큰이 모델 한도에 닿으면 잘림 위험 → 토큰 사용량 로그로 감지

---

## 7. 메타데이터 파싱 규칙

YouTube 영상 설명 예시:
```
2026-04-26
분당우리교회 주일설교
마지막 때와 청지기 정신 (베드로전서 4장 7-11절)
이찬수 목사
```

1차 시도(정규식):
- 1행: `\d{4}-\d{2}-\d{2}` → `sermonDate`
- 2행: `(.+) 주일설교` → `channelName`
- 3행: `(.+?) \((.+)절\)` → `title`, `bibleReference`
- 4행: `(.+) 목사` → `preacher`

추출 실패 시:
- 빈 값 허용 (UI는 missing 필드 숨김)
- 채널이 다른 곳일 경우 영상 설명 형식이 다를 수 있어 추후 확장 여지

---

## 8. 에러 처리

| 상황 | 동작 |
|---|---|
| URL 형식 오류 | 클라이언트 측 검증 즉시 반환 |
| `yt-dlp` 실패 (비공개·삭제·지오블록) | `failed` + "영상을 가져올 수 없습니다" |
| 자막 없음 | `failed` + "이 영상에는 한국어 자막이 없어 요약할 수 없습니다" + (추후 STT 폴백 안내) |
| Gemini API 실패 | 1회 자동 재시도 후 `failed` |
| 트랜스크립트가 비정상적으로 짧음 (< 500자) | 자막 인식 실패 가능성 표시 후 진행 |
| 처리 중 프로세스 죽음 | 재시작 시 `pending`/`*ing` 상태인 레코드를 `failed`로 정리하는 부팅 훅 |

---

## 9. 테스트

- **단위**: 메타데이터 파서 (5~10개 영상 설명 샘플), VTT 파서, URL → videoId 변환
- **통합**: 로컬에서 짧은 한국어 자막 있는 테스트 영상 1개로 전체 파이프라인 E2E
- **골든 샘플**: 분당우리교회 설교 1개에 대한 요약 결과를 스냅샷으로 저장. 프롬프트 변경 시 회귀 확인.
- **수동 QA**: 5편 정도 직접 돌려보고 요약 품질 확인. "구조화가 잘 되었는가" "원문에 없는 인사이트를 끼워넣지 않는가"가 합격 기준.

---

## 10. 스택 정리

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 14 App Router + TypeScript |
| UI | Tailwind + shadcn/ui |
| 마크다운 렌더 | `react-markdown` + `remark-gfm` |
| LLM | Gemini `gemini-3.1-flash-lite-preview` (Google GenAI SDK) |
| 자막/메타데이터 | `yt-dlp` (시스템 바이너리, 자식 프로세스 호출) |
| DB | SQLite (`better-sqlite3`) |
| 패키지 매니저 | pnpm |
| 환경변수 | `GEMINI_API_KEY` |
| 배포 | 미정. MVP는 로컬 실행. Railway 우선 검토. |

---

## 11. 디렉토리 구조 (제안)

```
sermon-summary/
├─ app/
│  ├─ page.tsx                  # 홈, URL 입력 폼
│  ├─ s/[videoId]/page.tsx      # 결과 페이지 (서버 컴포넌트 + 클라이언트 폴링)
│  └─ api/
│     ├─ summarize/route.ts
│     └─ sermon/[videoId]/route.ts
├─ lib/
│  ├─ db.ts                     # SQLite 초기화 + 스키마
│  ├─ youtube.ts                # videoId 추출, yt-dlp 호출, VTT 파서
│  ├─ metadata.ts               # 영상 설명 파싱
│  ├─ summarize.ts              # Gemini 호출, 프롬프트
│  └─ worker.ts                 # 파이프라인 오케스트레이션
├─ components/
│  ├─ url-form.tsx
│  ├─ progress.tsx
│  └─ summary-view.tsx
├─ docs/superpowers/specs/
│  └─ 2026-05-01-sermon-summary-design.md
├─ .env.example                 # GEMINI_API_KEY=
├─ package.json
└─ tsconfig.json
```

---

## 12. 앱화 경로 (참고, MVP 범위 아님)

- 백엔드(`/api/*`)는 그대로 유지하고 인증만 추가
- 프론트는 React Native/Expo로 새로 작성
- 결과 마크다운은 `react-native-markdown-display` 등으로 그대로 렌더
- 매주 자동 폴링이 필요해지면 그때 워커 분리 + cron 도입

---

## 13. 열린 질문

- 분당우리교회 외 채널을 추가로 다룰 가능성이 있는지 — 있다면 메타데이터 파서를 채널별 어댑터로 추상화 필요
- 자막이 없는 영상이 자주 발생하는지 — STT 폴백을 일찍 붙일지의 트리거
- 결과 마크다운에 영상 임베드를 넣을지 (현재는 "원본 영상 ↗" 외부 링크만)
