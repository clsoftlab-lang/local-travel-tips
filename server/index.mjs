// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 숨은여행지찾기 AI 백엔드 프록시.
//
// 브라우저는 절대 Anthropic API 키를 보지 못합니다. 프런트엔드는 이 서버의
// POST /api/ai 로 {task, payload, grounding} 을 보내고, 이 서버가 서버 측에서만
// ANTHROPIC_API_KEY 로 Claude 를 호출한 뒤 텍스트를 스트리밍으로 돌려줍니다.
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
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

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

// ---------- task → (system, messages) ----------
function buildPrompt(task, payload = {}, grounding = []) {
  const groundJson = JSON.stringify(grounding || []);
  const system = [
    '당신은 "숨은여행지찾기"의 한국어 AI 도우미입니다.',
    '반드시 아래 제공된 로컬 팁 데이터(JSON)에 근거해서만 한국어로 답하세요.',
    '데이터에 없는 장소·업체·가격을 지어내지 마세요. 근거가 없으면 없다고 말하세요.',
    '',
    '로컬 팁 데이터(우리 서비스 DB 실측 집계):',
    groundJson,
  ].join('\n');

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
  } else {
    user = String(payload.question || payload.notes || '도움이 필요합니다.');
  }

  return { system, messages: [{ role: 'user', content: user }] };
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
    const { system, messages } = buildPrompt(task, payload, grounding);
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system,
      messages,
    });

    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(event.delta.text);
      }
    }
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
  console.log(`숨은여행지찾기 AI 프록시가 http://localhost:${PORT} 에서 실행 중 (model=${MODEL}, mode=backend)`);
});
