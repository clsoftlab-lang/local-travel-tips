<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# 숨은여행지찾기 — AI 백엔드 프록시

프런트엔드(정적 SPA)의 AI 기능을 **실제 Claude** 로 구동하기 위한 작은 Node 프록시입니다.

> **키는 서버에서만.** 브라우저와 리포지토리에는 API 키를 절대 두지 않습니다. 이 서버만
> `ANTHROPIC_API_KEY` 환경변수로 Claude 를 호출하고, 결과 텍스트를 스트리밍으로 프런트에 전달합니다.

## 동작

- `POST /api/ai` — 본문 `{ task, payload, grounding }` 를 받아 `system`/`messages` 를 구성한 뒤
  `client.messages.stream({ model, max_tokens, system, messages })` 로 호출하고, 텍스트 델타를
  응답 본문으로 흘려보냅니다(`text/plain` 스트림).
- `GET /health` — 상태 확인용(현재 모델 표시).
- CORS 허용(기본 `*`, 운영에서는 프런트 도메인으로 제한 권장).

`task` 는 `itinerary`(일정 생성) · `chatbot`(지역 챗봇) · `tipAssist`(팁 작성 도우미) ·
`digest`(지금 뜨는 로컬 추천 다이제스트) 중 하나이며, `grounding` 은 프런트가 보낸 **실제 로컬 팁
데이터** 로, 모델 답변을 이 데이터에 근거(grounded)하게 만듭니다.

## 💸 비용 최적화 (무인·저비용)

- **비용 우선 기본 모델**: `AI_MODEL` 미설정 시 `claude-haiku-4-5` ($1/$5 per MTok).
  품질이 필요하면 `AI_MODEL=claude-sonnet-5` 또는 `claude-opus-5` 로 상향.
- **Prompt caching**: 태스크 공통의 안정 시스템 지시를 `cache_control:{type:'ephemeral'}` 블록으로
  보내 반복 호출 시 캐시를 읽어 비용을 낮춥니다(가변 근거 데이터는 비캐시 블록).
- **Thinking/effort**: `claude-haiku*` 모델은 adaptive thinking / effort 를 **보내지 않습니다**
  (400 방지). 그 외 모델은 `thinking:{type:'adaptive'}` + `output_config:{effort: AI_EFFORT||'low'}`.
- **출력 상한**: 태스크별 modest `max_tokens`(기본 ~700).
- **가드레일**: IP 당 분당 `AI_RATE_PER_MIN`(기본 20)회 제한 + 월간 `AI_MONTHLY_TOKEN_CAP`
  (기본 2,000,000) 토큰 예산. 초과 시 `HTTP 429 {fallback:true}` → 프런트가 자동으로 mock 폴백.

## ☁️ Cloudflare Workers 로 무인 배포 (무료 티어)

관리할 서버 없이 무료로 돌리려면 [`worker.js`](./worker.js) + [`wrangler.toml`](./wrangler.toml) 를 씁니다.
같은 task 라우팅 · 모델/캐싱 규칙으로 Anthropic REST 를 직접 호출합니다(비스트리밍 텍스트 반환).

```bash
cd server
npm i -g wrangler                    # 또는 npx wrangler ...
wrangler secret put ANTHROPIC_API_KEY   # 키는 secret 으로만 (코드/리포지토리에 두지 않음)
wrangler deploy                      # 배포 → https://<name>.<subdomain>.workers.dev
```

배포 후 프런트의 [`../ai/config.js`](../ai/config.js) `AI_ENDPOINT` 를 워커 주소 + `/api/ai` 로 설정하면 됩니다.
모델/효율은 `wrangler.toml` 의 `[vars]`(`AI_MODEL`, `AI_EFFORT`)로 조정합니다.

## 실행

```bash
cd server
cp .env.example .env         # 그리고 ANTHROPIC_API_KEY 를 실제 키로 채웁니다
npm install                  # @anthropic-ai/sdk 설치
npm start                    # http://localhost:8790 에서 실행
```

그런 다음 프런트엔드의 [`../ai/config.js`](../ai/config.js) 에서:

```js
export const AI_ENDPOINT = "http://localhost:8790/api/ai";
```

로 설정하면, 앱의 AI 화면이 Mock 대신 실제 Claude 응답을 스트리밍으로 표시합니다.
`AI_ENDPOINT` 를 다시 빈 문자열 `""` 로 두면 백엔드 없이 결정적 Mock 모드로 되돌아갑니다.

## 환경변수 (`.env`)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (필수) | Anthropic API 키. **서버 전용.** |
| `AI_MODEL` | `claude-haiku-4-5` | 사용할 모델(비용 우선). `claude-sonnet-5`/`claude-opus-5` 로 상향 가능. |
| `ANTHROPIC_MODEL` | — | 구버전 호환 폴백(`AI_MODEL` 이 우선). |
| `AI_EFFORT` | `low` | effort. haiku 는 무시, sonnet/opus 에만 적용. |
| `AI_MONTHLY_TOKEN_CAP` | `2000000` | 월간 토큰 예산. 초과 시 429 `{fallback:true}`. |
| `AI_RATE_PER_MIN` | `20` | IP 당 분당 요청 제한. |
| `PORT` | `8790` | 프록시 포트. |
| `CORS_ORIGIN` | `*` | 허용 오리진. |

## 보안 메모

- **키는 서버 사이드에서만** 사용합니다. `.env` 는 커밋하지 마세요(`.gitignore` 에 포함).
- 프런트엔드는 키를 전혀 알지 못하며, 오직 이 프록시 주소만 압니다.
- 운영에서는 `CORS_ORIGIN` 을 실제 프런트 도메인으로 제한하고, 필요 시 요청 rate limit 을 추가하세요.

---
**Not an official Anthropic product.**
