// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 플러그형(pluggable) AI 레이어.
//
//   askAI(task, payload, { onToken })
//
// - AI_ENDPOINT 가 비어 있으면: 앱의 로컬 팁 데이터를 재사용하는 결정적
//   한국어 MockProvider 로 답을 만들고, onToken 으로 스트리밍처럼 흘려보냅니다.
//   (API 키 불필요, 완전 오프라인, 데모 기본값)
// - AI_ENDPOINT 가 설정되어 있으면: {task, payload, grounding} 을 백엔드 프록시
//   (server/)에 POST 하고, 응답 본문(text 스트림)을 그대로 onToken 으로 전달합니다.
//   실제 Claude 호출과 API 키는 백엔드에서만 일어납니다.

import { allTips, getMeta } from '../js/data.js';
import { AI_ENDPOINT } from './config.js';

// ---------- 태스크 정의 ----------
export const AI_TASKS = {
  itinerary: 'AI 여행 일정 생성',
  chatbot: '지역 여행 챗봇',
  tipAssist: '팁 작성 도우미',
  digest: '지금 뜨는 로컬 추천 다이제스트',
};

// 다이제스트 기본 계절(호출 측에서 payload.season 으로 덮어씀)
const DEFAULT_SEASON = '가을';

// ---------- 공용 헬퍼 ----------
function regionList() { const m = getMeta(); return (m && m.regions) || []; }
function themeList() { const m = getMeta(); return (m && m.themes) || []; }

function detectRegion(text) {
  const t = String(text || '');
  return regionList().find((r) => t.includes(r)) || '';
}

function detectThemes(text) {
  const t = String(text || '');
  return themeList().filter((th) => t.includes(th));
}

// 지역/테마로 팁을 고르고, 평점 높은 순으로 정렬(결정적)
function selectTips({ region = '', themes = [] } = {}) {
  let list = allTips().slice();
  if (region && region !== '전체') list = list.filter((t) => t.region === region);
  if (themes && themes.length) {
    const inThemes = list.filter((t) => themes.includes(t.theme));
    const rest = list.filter((t) => !themes.includes(t.theme));
    list = [...inThemes, ...rest];
  }
  return list.sort((a, b) =>
    (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
    String(a.id).localeCompare(String(b.id)));
}

// 백엔드 LLM 을 위한 축약 근거 데이터(실 DB 팁을 grounding 으로 전달)
function groundingTips(list, limit = 14) {
  return list.slice(0, limit).map((t) => ({
    title: t.title,
    region: t.region,
    district: t.district || '',
    theme: t.theme,
    summary: t.summary,
    tags: t.tags || [],
    seasons: t.seasons || [],
    price: t.price,
    rating: t.rating,
    locationHint: t.locationHint || '',
  }));
}

// ---------- MockProvider (결정적 한국어) ----------
function mockItinerary(payload = {}) {
  const region = payload.region && payload.region !== '전체' ? payload.region : '';
  const themes = Array.isArray(payload.interests) ? payload.interests : [];
  const days = Math.min(7, Math.max(1, Number(payload.days) || 2));
  const pool = selectTips({ region, themes });

  const head = region
    ? `📍 ${region} ${days}일 여행 일정`
    : `📍 전국 로컬 팁 기반 ${days}일 여행 일정`;
  const intLine = themes.length ? `관심사: ${themes.join(', ')}` : '관심사: 전체';

  if (!pool.length) {
    return `${head}\n${intLine}\n\n조건에 맞는 로컬 팁이 아직 없습니다. 지역이나 관심사를 바꿔보세요.`;
  }

  const perDay = Math.max(2, Math.ceil(pool.length / days) > 3 ? 3 : Math.max(2, Math.ceil(pool.length / days)));
  const lines = [head, intLine, ''];
  let idx = 0;
  for (let d = 1; d <= days; d++) {
    lines.push(`── ${d}일차 ──`);
    let placed = 0;
    for (let k = 0; k < perDay && idx < pool.length; k++, idx++) {
      const t = pool[idx];
      const where = t.district ? `${t.region} ${t.district}` : t.region;
      lines.push(`${slot(k)} ${t.title} (${t.theme}·${where})`);
      lines.push(`   → ${t.summary}`);
      if (t.locationHint) lines.push(`   📌 ${t.locationHint}`);
      placed++;
    }
    if (!placed) lines.push('   (추천할 로컬 팁이 더 없습니다. 자유 일정으로 즐겨보세요.)');
    lines.push('');
    if (idx >= pool.length) idx = 0; // 팁이 적으면 순환
  }
  lines.push('※ 데모: 위 일정은 실제 로컬 팁 데이터로 구성한 예시입니다.');
  return lines.join('\n');
}

function slot(k) { return ['오전', '점심', '오후', '저녁'][k] || '추가'; }

function mockChatbot(payload = {}) {
  const q = String(payload.question || '').trim();
  const region = payload.region && payload.region !== '전체'
    ? payload.region
    : detectRegion(q);
  const themes = detectThemes(q);
  const pool = selectTips({ region, themes }).slice(0, 5);

  if (!q) return '무엇이 궁금하신가요? 예: "부산에서 뭐 하면 좋아요?"';
  if (!pool.length) {
    return region
      ? `${region}에 대한 로컬 팁을 아직 찾지 못했습니다. 다른 지역이나 키워드로 물어보세요.`
      : '해당 조건의 로컬 팁을 찾지 못했습니다. 지역명(예: 서울, 제주)을 넣어 물어보세요.';
  }
  const where = region || '이 지역';
  const out = [`${where}에서 로컬이 추천하는 곳을 정리했어요.`, ''];
  pool.forEach((t, i) => {
    out.push(`${i + 1}. ${t.title} — ${t.theme}`);
    out.push(`   ${t.summary}`);
    if (t.locationHint) out.push(`   📌 ${t.locationHint}`);
  });
  out.push('');
  out.push('더 자세히 보고 싶으면 탐색 화면에서 지역/테마로 필터링해 보세요. (데모)');
  return out.join('\n');
}

function mockTipAssist(payload = {}) {
  const region = payload.region || '';
  const theme = payload.theme || '';
  const notes = String(payload.notes || '').trim();
  const sample = selectTips({ region: region && region !== '전체' ? region : '', themes: theme ? [theme] : [] })[0];

  const kw = notes
    ? notes.split(/[\s,·]+/).filter(Boolean).slice(0, 3)
    : [];
  const titleBase = kw.length ? kw.join(' ') : (region || '우리 동네');
  const where = region || '동네';

  const out = [];
  out.push('✍️ 로컬 팁 작성 도우미 (데모)');
  out.push('');
  out.push('추천 제목');
  out.push(`- ${where} ${theme || '숨은'} ${titleBase} 코스`.replace(/\s+/g, ' ').trim());
  out.push(`- 현지인만 아는 ${where} ${theme || ''} 이야기`.replace(/\s+/g, ' ').trim());
  out.push('');
  out.push('한 줄 요약(예시)');
  out.push(`- 관광객이 잘 모르는 ${where}의 ${theme || '장소'}, 로컬의 시선으로 짧게 소개하세요.`);
  out.push('');
  out.push('본문 구성 가이드');
  out.push('1) 어떤 순간/시간대가 가장 좋은지 (예: 새벽, 평일 오전)');
  out.push('2) 정확한 찾아가는 길·위치 힌트 (역/버스/도보 시간)');
  out.push('3) 로컬만 아는 디테일 (덜 붐비는 자리, 곁들이면 좋은 것)');
  out.push('4) 주의할 점 (영업시간, 계절, 예약 여부)');
  if (notes) {
    out.push('');
    out.push('입력하신 메모 정리');
    kwLines(notes).forEach((l) => out.push(l));
  }
  out.push('');
  out.push('추천 태그');
  out.push(`- ${[theme, region, ...(kw)].filter(Boolean).slice(0, 5).map((s) => '#' + s).join(' ')}`);
  if (sample) {
    out.push('');
    out.push(`참고: 이 지역/테마의 인기 팁 "${sample.title}" 처럼, 구체적인 위치 힌트가 신뢰도를 높입니다.`);
  }
  return out.join('\n');
}

function kwLines(notes) {
  return notes.split('\n').map((s) => s.trim()).filter(Boolean).map((s) => `- ${s}`);
}

// 지역/계절 기준으로 "지금 뜨는" 추천을 짧게 요약(결정적, 오프라인 동작)
function digestPool(payload = {}) {
  const region = payload.region && payload.region !== '전체' ? payload.region : '';
  const season = payload.season && payload.season !== '전체' ? payload.season : DEFAULT_SEASON;
  let list = selectTips({ region });
  const inSeason = list.filter((t) => (t.seasons || []).includes(season));
  // 계절 팁을 앞으로, 부족하면 나머지로 보충
  const ordered = [...inSeason, ...list.filter((t) => !inSeason.includes(t))];
  return { region, season, list: ordered };
}

function mockDigest(payload = {}) {
  const { region, season, list } = digestPool(payload);
  const where = region || '전국';
  const picks = list.slice(0, 4);
  if (!picks.length) {
    return `🔥 지금 뜨는 로컬 추천 다이제스트 · ${where}\n조건에 맞는 로컬 팁이 아직 없습니다. 지역/계절을 바꿔보세요.`;
  }
  const out = [`🔥 지금 뜨는 로컬 추천 다이제스트 · ${where} · ${season}`, ''];
  picks.forEach((t, i) => {
    const place = t.district ? `${t.region} ${t.district}` : t.region;
    out.push(`${i + 1}. ${t.title} (${t.theme}·${place}) ★${t.rating}`);
    out.push(`   ${t.summary}`);
    if (t.locationHint) out.push(`   📌 ${t.locationHint}`);
  });
  out.push('');
  out.push('※ 데모: 실제 로컬 팁 데이터로 자동 생성한 추천입니다.');
  return out.join('\n');
}

function mockAnswer(task, payload) {
  switch (task) {
    case 'itinerary': return mockItinerary(payload);
    case 'chatbot': return mockChatbot(payload);
    case 'tipAssist': return mockTipAssist(payload);
    case 'digest': return mockDigest(payload);
    default: return '알 수 없는 AI 작업입니다.';
  }
}

// mock 을 스트리밍처럼 흘려보냄(결정적, 짧은 지연)
function streamMock(text, onToken) {
  return new Promise((resolve) => {
    if (typeof onToken !== 'function') return resolve();
    const chunks = text.match(/[\s\S]{1,3}/g) || [];
    let i = 0;
    const tick = () => {
      if (i >= chunks.length) return resolve();
      try { onToken(chunks[i++]); } catch { /* UI 콜백 오류 무시 */ }
      setTimeout(tick, 8);
    };
    tick();
  });
}

// ---------- 백엔드 요청 본문 ----------
function buildRequest(task, payload = {}) {
  let region = payload.region || '';
  let themes = [];
  if (task === 'itinerary') { themes = payload.interests || []; }
  else if (task === 'chatbot') {
    region = region || detectRegion(payload.question);
    themes = detectThemes(payload.question);
  } else if (task === 'tipAssist') {
    themes = payload.theme ? [payload.theme] : [];
  } else if (task === 'digest') {
    // 지역/계절 기준 근거 팁(계절 매칭 우선)
    const d = digestPool(payload);
    return { task, payload, grounding: groundingTips(d.list) };
  }
  const pool = selectTips({ region: region && region !== '전체' ? region : '', themes });
  return { task, payload, grounding: groundingTips(pool) };
}

// mock 으로 안전 폴백(무인: 앱이 절대 멈추지 않음)
async function fallbackToMock(task, payload, onToken) {
  const text = mockAnswer(task, payload);
  await streamMock(text, onToken);
  return text;
}

// ---------- 공개 API ----------
export async function askAI(task, payload = {}, { onToken } = {}) {
  // 데모 기본값: 백엔드 없이 결정적 mock
  if (!AI_ENDPOINT) return fallbackToMock(task, payload, onToken);

  // 실 연동: 백엔드 프록시로 POST 후 텍스트 스트림 수신.
  // 실패/429{fallback:true}/네트워크 오류 시 → 자동으로 mock 으로 폴백(무인).
  let res;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequest(task, payload)),
    });
  } catch {
    return fallbackToMock(task, payload, onToken); // 네트워크 오류
  }

  // 429(예산/레이트) 또는 기타 오류 → mock 폴백
  if (res.status === 429 || !res.ok) return fallbackToMock(task, payload, onToken);

  // 논스트림 응답(예: Cloudflare Worker) 처리
  if (!res.body || typeof res.body.getReader !== 'function') {
    let text = '';
    try { text = await res.text(); } catch { return fallbackToMock(task, payload, onToken); }
    // 서버가 JSON {fallback:true} 를 200 으로 줄 가능성 방어
    if (/^\s*\{\s*"fallback"\s*:\s*true\s*\}\s*$/.test(text)) {
      return fallbackToMock(task, payload, onToken);
    }
    if (onToken && text) onToken(text);
    return text;
  }

  // 스트림 응답 처리
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) { full += chunk; if (onToken) onToken(chunk); }
    }
    const tail = decoder.decode();
    if (tail) { full += tail; if (onToken) onToken(tail); }
  } catch {
    // 스트림 중단: 아직 아무것도 못 받았으면 mock 으로 폴백
    if (!full) return fallbackToMock(task, payload, onToken);
  }
  return full;
}

// 현재 모드(안내용): mock 또는 backend
export function aiMode() { return AI_ENDPOINT ? 'backend' : 'mock'; }
