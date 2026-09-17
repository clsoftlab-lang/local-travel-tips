// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 숨은여행지찾기 AI 백엔드 프록시 (비용 합리적 · 무인 지향).
//
// 브라우저는 절대 Anthropic API 키를 보지 못합니다. 프런트엔드는 이 서버의
// POST /api/ai 로 {task, payload, grounding} 을 보내고, 이 서버가 서버 측에서만
// ANTHROPIC_API_KEY 로 Claude 를 호출한 뒤 텍스트를 스트리밍으로 돌려줍니다.
//
// 비용 최적화:
//  - 기본 모델은 저비용 우선 claude-haiku-4-5 (AI_MODEL 로 상향 가능).
//  - 안정적인(태스크 공통) 시스템 지시 블록에 prompt caching(cache_control) 적용.
//  - 태스크별 modest max_tokens.
//  - IP 당 분당 요청 제한 + 월간 토큰 예산(AI_MONTHLY_TOKEN_CAP) 초과 시 429 {fallback:true}.
//
// 실행:
//   1) cp .env.example .env  후 ANTHROPIC_API_KEY 채우기
//   2) npm install
//   3) npm start
//   4) ../ai/config.js 의 AI_ENDPOINT 를 "http://localhost:8790/api/ai" 로 설정

import http from 'node:http';
import process from 'node:process';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT) || 8790;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 비용 우선 기본값. 품질을 높이려면 AI_MODEL 을 claude-sonnet-5 또는 claude-opus-5 로 올리세요.
// (ANTHROPIC_MODEL 은 이전 설정과의 호환용 폴백입니다.)
const MODEL = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

// 태스크별 출력 상한(비용 절약). 정말 필요한 태스크만 크게.
const MAX_TOKENS = { itinerary: 900, chatbot: 700, tipAssist: 700, digest: 500 };
function maxTokensFor(task) { return MAX_TOKENS[task] || 700; }

// 비용 가드레일: IP 당 분당 요청 제한 + 월간 토큰 예산.
const RATE_PER_MIN = Number(process.env.AI_RATE_PER_MIN) || 20;
const TOKEN_CAP = Number(process.env.AI_MONTHLY_TOKEN_CAP) || 2_000_000;

const RATE = new Map(); // ip -> { start, count }
function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}
function rateLimited(ip) {
  const now = Date.now();
  const e = RATE.get(ip);
  if (!e || now - e.start >= 60_000) { RATE.set(ip, { start: now, count: 1 }); return false; }
  e.count += 1;
  return e.count > RATE_PER_MIN;
}

let usageMonth = monthKey();
let tokensUsed = 0;
function monthKey() { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`; }
function budgetExceeded() {
  const m = monthKey();
  if (m !== usageMonth) { usageMonth = m; tokensUsed = 0; } // 월이 바뀌면 리셋
  return tokensUsed >= TOKEN_CAP;
}
function addUsage(u) {
  if (!u) return;
  tokensUsed += (u.input_tokens || 0) + (u.output_tokens || 0)
    + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[warn] ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 를 확인하세요.');
}

// SDK 는 process.env.ANTHROPIC_API_KEY 를 자동으로 읽습니다(서버 측에서만 사용).
const client = new Anthropic();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// 태스크와 무관하게 동일한(=캐시 적중률이 높은) 안정 지시 블록.
const SYSTEM_INSTRUCTION = [
  '당신은 "숨은여행지찾기"의 한국어 AI 도우미입니다.',
  '반드시 아래 "로컬 팁 데이터(JSON)" 근거 블록에 있는 정보에만 근거해서 한국어로 답하세요.',
  '데이터에 없는 장소·업체·가격을 지어내지 마세요. 근거가 없으면 없다고 말하세요.',
  '답변은 간결하고 실용적으로, 각 추천에 위치 힌트가 있으면 덧붙이세요.',
].join('\n');

// ---------- task → (systemVariable, messages) ----------
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error('요청 본문이 너무 큽니다.'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, model: MODEL }));
  }

  if (req.method !== 'POST' || !req.url.startsWith('/api/ai')) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not Found');
  }

  // 비용 가드레일: 초과 시 429 {fallback:true} → 프런트는 자동으로 mock 으로 폴백(무인).
  if (rateLimited(clientIp(req)) || budgetExceeded()) {
    res.writeHead(429, { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ fallback: true }));
  }

  let task, payload, grounding;
  try {
    const parsed = JSON.parse((await readBody(req)) || '{}');
    task = parsed.task;
    payload = parsed.payload || {};
    grounding = parsed.grounding || [];
  } catch {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('잘못된 JSON 요청입니다.');
  }

  try {
    const { systemVariable, messages } = buildPrompt(task, payload, grounding);
    // 시스템 블록 배열: 안정 지시는 prompt caching(ephemeral), 가변 근거는 비캐시.
    const system = [
      { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: systemVariable },
    ];

    const params = { model: MODEL, max_tokens: maxTokensFor(task), system, messages };
    // Haiku 4.5 는 adaptive thinking / effort 를 받지 않습니다(400 방지). 그 외 모델만 사용.
    if (!MODEL.startsWith('claude-haiku')) {
      params.thinking = { type: 'adaptive' };
      params.output_config = { effort: process.env.AI_EFFORT || 'low' };
    }

    const stream = client.messages.stream(params);

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }
    // 최종 메시지의 usage 를 월간 토큰 예산에 누적.
    try { const final = await stream.finalMessage(); addUsage(final && final.usage); } catch { /* usage 집계 실패 무시 */ }
    res.end();
  } catch (err) {
    console.error('[api/ai] 오류:', err && err.message ? err.message : err);
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('AI 처리 중 오류가 발생했습니다.');
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`숨은여행지찾기 AI 프록시가 http://localhost:${PORT} 에서 실행 중 (model=${MODEL}, cap=${TOKEN_CAP}, mode=backend)`);
});
