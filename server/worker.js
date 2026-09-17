// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 숨은여행지찾기 AI 백엔드 — Cloudflare Workers 변형 (무인·무료 호스팅).
//
// Node 프록시(index.mjs)와 동일한 task 라우팅 · 모델/캐싱 규칙을 쓰되, Anthropic REST
// (POST https://api.anthropic.com/v1/messages) 를 직접 호출합니다. 응답은 비스트리밍
// 텍스트로 돌려줍니다(프런트의 askAI 는 스트림/논스트림 모두 처리).
//
// 키는 Worker secret 으로만: `wrangler secret put ANTHROPIC_API_KEY`.
// 무료 티어 = 관리할 서버 없음(무인). 배포 방법은 README.md 참고.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// 비용 우선 기본값(AI_MODEL 로 claude-sonnet-5 / claude-opus-5 로 상향 가능).
function modelOf(env) { return (env && env.AI_MODEL) || 'claude-haiku-4-5'; }

const MAX_TOKENS = { itinerary: 900, chatbot: 700, tipAssist: 700, digest: 500 };
function maxTokensFor(task) { return MAX_TOKENS[task] || 700; }

// index.mjs 와 동일한 안정 지시(캐시 적중률↑).
const SYSTEM_INSTRUCTION = [
  '당신은 "숨은여행지찾기"의 한국어 AI 도우미입니다.',
  '반드시 아래 "로컬 팁 데이터(JSON)" 근거 블록에 있는 정보에만 근거해서 한국어로 답하세요.',
  '데이터에 없는 장소·업체·가격을 지어내지 마세요. 근거가 없으면 없다고 말하세요.',
  '답변은 간결하고 실용적으로, 각 추천에 위치 힌트가 있으면 덧붙이세요.',
].join('\n');

function buildPrompt(task, payload = {}, grounding = []) {
  const groundJson = JSON.stringify(grounding || []);
  const systemVariable = `로컬 팁 데이터(우리 서비스 DB 실측 집계):\n${groundJson}`;

  let user;
  if (task === 'itinerary') {
    const region = payload.region || '전체';
    const interests = (payload.interests || []).join(', ') || '전체';
    const days = payload.days || 2;
    user = `지역 "${region}", 관심사 "${interests}" 기준으로 ${days}일짜리 여행 일정을 하루 단위로 만들어 주세요. 위 로컬 팁만 활용하고, 각 일정에 위치 힌트를 덧붙이세요.`;
  } else if (task === 'chatbot') {
    user = `여행자 질문: "${payload.question || ''}"\n위 로컬 팁 데이터를 근거로 친절하게 한국어로 답해 주세요.`;
  } else if (task === 'tipAssist') {
    user = `저는 "${payload.region || ''}" 지역의 로컬입니다. 테마는 "${payload.theme || ''}" 이고, 제 메모는 다음과 같습니다:\n${payload.notes || '(메모 없음)'}\n\n좋은 로컬 여행 팁이 되도록 제목 후보, 한 줄 요약, 본문 구성, 추천 태그를 제안해 주세요.`;
  } else if (task === 'digest') {
    const region = payload.region && payload.region !== '전체' ? payload.region : '전국';
    const season = payload.season || '';
    user = `"${region}"의 ${season ? season + ' ' : ''}"지금 뜨는 로컬 추천 다이제스트"를 아주 짧게(3~4개 항목) 만들어 주세요. 각 항목은 한 줄 소개 + 위치 힌트로, 위 로컬 팁 데이터에 있는 곳만 사용하세요. 서두는 한 문장 이내로 담백하게.`;
  } else {
    user = String(payload.question || payload.notes || '도움이 필요합니다.');
  }

  return { systemVariable, messages: [{ role: 'user', content: user }] };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, model: modelOf(env) });
    }
    if (request.method !== 'POST' || !url.pathname.startsWith('/api/ai')) {
      return new Response('Not Found', { status: 404, headers: CORS });
    }

    let body;
    try { body = await request.json(); } catch {
      return new Response('잘못된 JSON 요청입니다.', { status: 400, headers: CORS });
    }
    const task = body.task;
    const payload = body.payload || {};
    const grounding = body.grounding || [];

    const model = modelOf(env);
    const { systemVariable, messages } = buildPrompt(task, payload, grounding);
    const reqBody = {
      model,
      max_tokens: maxTokensFor(task),
      // 안정 지시는 prompt caching(ephemeral), 가변 근거는 비캐시.
      system: [
        { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: systemVariable },
      ],
      messages,
    };
    // Haiku 4.5 는 adaptive thinking / effort 를 받지 않습니다(400 방지).
    if (!model.startsWith('claude-haiku')) {
      reqBody.thinking = { type: 'adaptive' };
      reqBody.output_config = { effort: env.AI_EFFORT || 'low' };
    }

    let apiRes;
    try {
      apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(reqBody),
      });
    } catch {
      // 네트워크 오류 → 프런트가 mock 으로 폴백하도록 신호.
      return json({ fallback: true }, 502);
    }

    if (!apiRes.ok) {
      // 429(rate/budget) 등 → 프런트 자동 mock 폴백.
      return json({ fallback: true }, apiRes.status === 429 ? 429 : 502);
    }

    let data;
    try { data = await apiRes.json(); } catch { return json({ fallback: true }, 502); }
    const text = (data.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');

    return new Response(text, { status: 200, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
  },
};
