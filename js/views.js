// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 화면 렌더러. 각 뷰는 HTML 문자열을 반환하고, 필요 시 mount()에서
// 자체 이벤트를 연결합니다. 공통 카드 액션은 app.js가 위임 처리합니다.

import { allTips, getMeta, findTip, regionStats } from './data.js';
import { store } from './storage.js';
import { sceneSVG } from './svg.js';
import { esc, won, stars, localBadge, verifiedBadge, themeChip, toast } from './ui.js';
import { askAI, aiMode } from '../ai/ai.js';

// 탐색 필터 상태(모듈 스코프)
export const filters = { region: '전체', theme: '전체', price: '전체', season: '전체', q: '', sort: '추천순' };

const SEASON_NOW = '가을'; // 데모 기준 현재 계절(2026-09)

// ---------- 카드 ----------
function card(t) {
  const booked = store.isBookmarked(t.id);
  const unlocked = t.price === 0 || store.isUnlocked(t.id);
  return `<article class="card">
    <a class="card__media" href="#/tip/${esc(t.id)}" aria-label="${esc(t.title)} 상세 보기">
      ${sceneSVG(t.theme, t.photoSeed)}
      <span class="card__price ${t.price === 0 ? 'is-free' : 'is-paid'}">${won(t.price)}</span>
      ${t.author.isUser ? '<span class="card__mine">내 팁</span>' : ''}
    </a>
    <div class="card__body">
      <div class="card__meta">${themeChip(t.theme)}<span class="chip">${esc(t.region)}</span>${t.verified ? verifiedBadge() : ''}</div>
      <h3 class="card__title"><a href="#/tip/${esc(t.id)}">${esc(t.title)}</a></h3>
      <p class="card__summary">${esc(t.summary)}</p>
      <div class="card__foot">
        <span class="rating" title="평점 ${t.rating}">${stars(t.rating)} <b>${t.rating}</b> <small>(${t.ratingCount})</small></span>
        <span class="card__actions">
          <button class="mini-btn" data-action="like" data-id="${esc(t.id)}" aria-pressed="${store.isLiked(t.id)}">♥ ${t.likes + (store.isLiked(t.id) ? 1 : 0)}</button>
          <button class="mini-btn ${booked ? 'is-on' : ''}" data-action="bookmark" data-id="${esc(t.id)}" aria-pressed="${booked}">${booked ? '★ 찜됨' : '☆ 찜'}</button>
        </span>
      </div>
      <div class="card__author">${localBadge()} <span>${esc(t.author.name)} · ${esc(t.author.residence)} 거주 ${t.author.yearsLocal}년${unlocked ? '' : ' · 잠김'}</span></div>
    </div>
  </article>`;
}

// ---------- 탐색 ----------
function applyFilters(tips) {
  let list = tips.slice();
  if (filters.region !== '전체') list = list.filter((t) => t.region === filters.region);
  if (filters.theme !== '전체') list = list.filter((t) => t.theme === filters.theme);
  if (filters.season !== '전체') list = list.filter((t) => (t.seasons || []).includes(filters.season));
  if (filters.price === '무료') list = list.filter((t) => t.price === 0);
  if (filters.price === '유료') list = list.filter((t) => t.price > 0);
  const q = filters.q.trim().toLowerCase();
  if (q) {
    list = list.filter((t) =>
      [t.title, t.summary, t.region, t.district, t.theme, ...(t.tags || []), t.author.name]
        .join(' ').toLowerCase().includes(q));
  }
  switch (filters.sort) {
    case '평점순': list.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount); break;
    case '좋아요순': list.sort((a, b) => b.likes - a.likes); break;
    case '가격낮은순': list.sort((a, b) => a.price - b.price); break;
    case '가격높은순': list.sort((a, b) => b.price - a.price); break;
    default: list.sort((a, b) => (b.verified - a.verified) || (b.rating - a.rating) || (b.likes - a.likes));
  }
  return list;
}

export function browseView() {
  const meta = getMeta();
  const tips = applyFilters(allTips());
  const opt = (v, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`;
  const regionOpts = ['전체', ...meta.regions].map((r) => opt(r, filters.region)).join('');
  const seasonOpts = ['전체', ...meta.seasons].map((s) => opt(s, filters.season)).join('');
  const sortOpts = ['추천순', '평점순', '좋아요순', '가격낮은순', '가격높은순'].map((s) => opt(s, filters.sort)).join('');
  const themeChips = ['전체', ...meta.themes].map((th) =>
    `<button class="filter-chip ${filters.theme === th ? 'is-on' : ''}" data-filter="theme" data-value="${esc(th)}">${esc(th)}</button>`).join('');
  const priceChips = ['전체', '무료', '유료'].map((p) =>
    `<button class="filter-chip ${filters.price === p ? 'is-on' : ''}" data-filter="price" data-value="${esc(p)}">${esc(p)}</button>`).join('');

  return `
  <section class="hero">
    <h1>동네 사람이 알려주는 <em>진짜</em> 여행지</h1>
    <p>그 지역에 사는 로컬만 팁을 씁니다. 관광 책자에 없는 숨은 장소를 찾아보세요.</p>
  </section>
  <section class="filters" aria-label="필터">
    <div class="filters__row">
      <input id="f-q" class="search" type="search" placeholder="장소·지역·키워드 검색" value="${esc(filters.q)}" aria-label="검색" />
      <select id="f-region" class="select" aria-label="지역 선택">${regionOpts}</select>
      <select id="f-season" class="select" aria-label="계절 선택">${seasonOpts}</select>
      <select id="f-sort" class="select" aria-label="정렬">${sortOpts}</select>
    </div>
    <div class="filters__chips" role="group" aria-label="테마">${themeChips}</div>
    <div class="filters__chips" role="group" aria-label="가격">${priceChips}</div>
  </section>
  <p class="result-count">${tips.length}개의 로컬 팁</p>
  <div class="grid">${tips.map(card).join('') || '<p class="empty">조건에 맞는 팁이 없습니다. 필터를 바꿔보세요.</p>'}</div>`;
}

export function mountBrowse() {
  const q = document.getElementById('f-q');
  if (q) q.addEventListener('input', (e) => { filters.q = e.target.value; rerenderGrid(); });
  const bind = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => { filters[key] = e.target.value; rerenderGrid(); });
  };
  bind('f-region', 'region'); bind('f-season', 'season'); bind('f-sort', 'sort');
}

// 그리드만 다시 그려 검색 입력 포커스를 유지
function rerenderGrid() {
  const view = document.getElementById('view');
  if (!view) return;
  const tips = applyFilters(allTips());
  const grid = view.querySelector('.grid');
  const count = view.querySelector('.result-count');
  if (count) count.textContent = `${tips.length}개의 로컬 팁`;
  if (grid) grid.innerHTML = tips.map(card).join('') || '<p class="empty">조건에 맞는 팁이 없습니다. 필터를 바꿔보세요.</p>';
  // 칩 활성 상태 갱신
  view.querySelectorAll('[data-filter]').forEach((b) => {
    b.classList.toggle('is-on', filters[b.dataset.filter] === b.dataset.value);
  });
}
export { rerenderGrid };

// ---------- 상세 ----------
export function detailView(id) {
  const t = findTip(id);
  if (!t) return `<p class="empty">팁을 찾을 수 없습니다. <a href="#/browse">탐색으로 돌아가기</a></p>`;
  const unlocked = t.price === 0 || store.isUnlocked(t.id);
  const booked = store.isBookmarked(t.id);
  const liked = store.isLiked(t.id);
  const reported = store.isReported(t.id);

  const bodyHtml = unlocked
    ? `<div class="tip-body">
         <h2>로컬의 상세 가이드</h2>
         ${(t.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}
         <div class="location-hint"><strong>📍 위치 힌트</strong><p>${esc(t.locationHint)}</p></div>
       </div>`
    : `<div class="tip-lock">
         <div class="tip-lock__blur">${(t.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
         <div class="tip-lock__overlay">
           <p>🔒 유료 팁입니다</p>
           <p class="muted">잠금을 해제하면 상세 가이드와 정확한 위치 힌트를 볼 수 있어요.</p>
           <button class="btn btn--primary" data-action="unlock" data-id="${esc(t.id)}">${won(t.price)} 결제하고 잠금 해제 (모의)</button>
           <p class="muted small">보유 포인트: ${won(store.wallet())} · 실제 결제가 아닌 데모입니다.</p>
         </div>
       </div>`;

  return `
  <p class="crumbs"><a href="#/browse">← 탐색</a></p>
  <article class="detail">
    <div class="detail__media">${sceneSVG(t.theme, t.photoSeed, { w: 640, h: 320 })}
      <span class="card__price ${t.price === 0 ? 'is-free' : 'is-paid'}">${won(t.price)}</span>
    </div>
    <div class="detail__head">
      <div class="card__meta">${themeChip(t.theme)}<span class="chip">${esc(t.region)}${t.district ? ' · ' + esc(t.district) : ''}</span>${t.verified ? verifiedBadge() : ''}${(t.seasons || []).map((s) => `<span class="chip chip--season">${esc(s)}</span>`).join('')}</div>
      <h1>${esc(t.title)}</h1>
      <p class="detail__summary">${esc(t.summary)}</p>
      <div class="detail__stat">
        <span class="rating">${stars(t.rating)} <b>${t.rating}</b> <small>(${t.ratingCount}개 평가)</small></span>
        <span class="trust" title="신뢰도: 로컬 검증 + 좋아요 반영">신뢰도 ${trustScore(t)}%</span>
      </div>
    </div>

    <div class="author-box">
      ${localBadge()}
      <div>
        <b>${esc(t.author.name)}</b> <span class="muted">${esc(t.author.residence)} 거주 ${t.author.yearsLocal}년</span>
        <p class="muted small">이 작성자는 거주지 기반 로컬 인증(데모)을 통과했습니다.</p>
      </div>
    </div>

    ${bodyHtml}

    <div class="tag-row">${(t.tags || []).map((tag) => `<span class="chip chip--tag">#${esc(tag)}</span>`).join('')}</div>

    <div class="detail__actions">
      <button class="btn ${booked ? 'is-on' : ''}" data-action="bookmark" data-id="${esc(t.id)}">${booked ? '★ 찜 해제' : '☆ 찜하기'}</button>
      <button class="btn ${liked ? 'is-on' : ''}" data-action="like" data-id="${esc(t.id)}">♥ 좋아요 ${t.likes + (liked ? 1 : 0)}</button>
      <button class="btn" data-action="report" data-id="${esc(t.id)}" ${reported ? 'disabled' : ''}>${reported ? '신고 접수됨' : '⚑ 신고/검증요청'}</button>
    </div>
  </article>`;
}

function trustScore(t) {
  let s = 50;
  if (t.verified) s += 25;
  if (t.author.localBadge) s += 10;
  s += Math.min(15, Math.round((t.likes || 0) / 30));
  return Math.min(99, s);
}

// ---------- 팁 작성 ----------
export function writeView() {
  const meta = getMeta();
  const o = (v) => `<option value="${esc(v)}">${esc(v)}</option>`;
  return `
  <section class="hero hero--sm"><h1>로컬 팁 작성</h1><p>당신이 사는 동네의 숨은 장소를 공유하세요. (데모: 브라우저에만 저장됩니다)</p></section>
  <form id="write-form" class="form" novalidate>
    <label>제목 <input name="title" required maxlength="60" placeholder="예: 서촌 골목 새벽 산책 코스" /></label>
    <div class="form__row">
      <label>지역 <select name="region" required>${meta.regions.map(o).join('')}</select></label>
      <label>구/군 <input name="district" placeholder="예: 종로구" /></label>
      <label>테마 <select name="theme" required>${meta.themes.map(o).join('')}</select></label>
    </div>
    <div class="form__row">
      <label>가격(원, 0=무료) <input name="price" type="number" min="0" max="9900" step="500" value="0" /></label>
      <label>거주지 <input name="residence" placeholder="예: 서울 종로구" /></label>
      <label>거주 연차 <input name="years" type="number" min="0" max="60" value="3" /></label>
    </div>
    <label>한 줄 요약 <input name="summary" required maxlength="80" placeholder="검색 결과에 보이는 짧은 설명" /></label>
    <label>상세 내용(줄바꿈으로 문단 구분) <textarea name="body" rows="5" required placeholder="현지인만 아는 팁을 적어주세요."></textarea></label>
    <label>위치 힌트 <input name="locationHint" placeholder="예: OO역 2번 출구 도보 7분" /></label>
    <label>태그(쉼표로 구분) <input name="tags" placeholder="예: 한옥, 새벽, 사진" /></label>
    <fieldset class="seasons"><legend>추천 계절</legend>${meta.seasons.map((s) => `<label class="inline"><input type="checkbox" name="season" value="${esc(s)}" /> ${esc(s)}</label>`).join('')}</fieldset>
    <label class="inline"><input type="checkbox" name="localConfirm" required /> 나는 이 지역에 거주하며 직접 경험한 정보임을 확인합니다 (모의 로컬 인증)</label>
    <button class="btn btn--primary" type="submit">팁 등록</button>
  </form>`;
}

export function mountWrite(navigate) {
  const form = document.getElementById('write-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    if (!form.reportValidity()) return;
    const id = 'user-' + Date.now().toString(36);
    const seasons = fd.getAll('season');
    const tip = {
      id,
      title: (fd.get('title') || '').toString().trim(),
      region: fd.get('region'),
      district: (fd.get('district') || '').toString().trim(),
      theme: fd.get('theme'),
      summary: (fd.get('summary') || '').toString().trim(),
      body: (fd.get('body') || '').toString().split('\n').map((s) => s.trim()).filter(Boolean),
      locationHint: (fd.get('locationHint') || '').toString().trim() || '작성자 미기재',
      author: {
        name: '나 (데모 사용자)',
        residence: (fd.get('residence') || `${fd.get('region')}`).toString().trim(),
        yearsLocal: Number(fd.get('years')) || 0,
        localBadge: true,
        isUser: true,
      },
      price: Math.max(0, Number(fd.get('price')) || 0),
      rating: 0, ratingCount: 0, likes: 0,
      verified: false, // 신규 팁은 로컬 검증 대기(데모)
      seasons: seasons.length ? seasons : [SEASON_NOW],
      tags: (fd.get('tags') || '').toString().split(',').map((s) => s.trim()).filter(Boolean),
      photoSeed: (Date.now() % 8) + 1,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    store.addAuthoredTip(tip);
    if (tip.price === 0) store.unlock(tip.id); // 무료 팁은 즉시 열람
    toast('팁이 등록되었습니다 (로컬 검증 대기 중)');
    navigate(`#/tip/${id}`);
  });
}

// ---------- 여행 노트 ----------
export function noteView() {
  const unlocked = new Set(store.unlockedIds());
  const booked = new Set(store.bookmarkIds());
  const all = allTips();
  const purchased = all.filter((t) => unlocked.has(t.id) && t.price > 0);
  const saved = all.filter((t) => booked.has(t.id));
  const mine = all.filter((t) => t.author.isUser);

  const section = (title, list, emptyMsg) => `
    <h2 class="note-h">${title} <small>(${list.length})</small></h2>
    <div class="grid">${list.map(card).join('') || `<p class="empty">${emptyMsg}</p>`}</div>`;

  return `
  <section class="hero hero--sm"><h1>내 여행 노트</h1><p>구매·저장한 팁과 내가 쓴 팁을 한곳에 모았습니다.</p></section>
  <div class="wallet-box">보유 포인트(모의): <b>${won(store.wallet())}</b> · 잠금 해제 ${purchased.length}건 · 찜 ${saved.length}건</div>
  ${section('🔓 구매한 유료 팁', purchased, '아직 구매한 유료 팁이 없습니다.')}
  ${section('★ 찜한 팁', saved, '찜한 팁이 없습니다. 마음에 드는 팁을 찜해보세요.')}
  ${section('✍️ 내가 쓴 팁', mine, '아직 작성한 팁이 없습니다.')}`;
}

// ---------- 지역 랭킹 + 계절 추천 ----------
export function rankingView() {
  const stats = regionStats();
  const max = Math.max(1, ...stats.map((s) => s.count));
  const rows = stats.map((s, i) => `
    <li class="rank-row">
      <span class="rank-no">${i + 1}</span>
      <a class="rank-name" href="#/browse" data-region="${esc(s.region)}">${esc(s.region)}</a>
      <span class="rank-bar"><span style="width:${(s.count / max * 100).toFixed(0)}%"></span></span>
      <span class="rank-val">팁 ${s.count} · ♥ ${s.likes} · 검증 ${s.verified}</span>
    </li>`).join('');

  const seasonal = allTips().filter((t) => (t.seasons || []).includes(SEASON_NOW))
    .sort((a, b) => b.rating - a.rating).slice(0, 6);

  return `
  <section class="hero hero--sm"><h1>지역 랭킹 & 계절 추천</h1><p>팁이 많고 검증이 활발한 지역, 그리고 지금 계절(${SEASON_NOW})에 좋은 곳.</p></section>
  <h2 class="note-h">지역별 로컬 팁 랭킹</h2>
  <ol class="rank-list">${rows}</ol>
  <h2 class="note-h">🍂 ${SEASON_NOW} 추천 팁</h2>
  <div class="grid">${seasonal.map(card).join('')}</div>`;
}

export function mountRanking(navigate) {
  document.querySelectorAll('.rank-name[data-region]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      filters.region = a.dataset.region;
      navigate('#/browse');
    });
  });
}

// ---------- AI 도우미 ----------
export function aiView() {
  const meta = getMeta();
  const o = (v) => `<option value="${esc(v)}">${esc(v)}</option>`;
  const modeLabel = aiMode() === 'backend' ? '실시간 Claude(백엔드 연동)' : '데모 Mock(로컬 팁 기반, 오프라인)';
  const interestChecks = meta.themes.map((th) =>
    `<label class="inline"><input type="checkbox" name="ai-interest" value="${esc(th)}" /> ${esc(th)}</label>`).join('');

  return `
  <section class="hero hero--sm"><h1>AI 여행 도우미</h1>
    <p>로컬 팁 데이터를 근거로 일정·질문·팁 작성을 도와드립니다.</p>
  </section>
  <p class="ai-mode">현재 모드: <b>${esc(modeLabel)}</b> · <span class="muted small">실제 AI 연동은 <code>ai/config.js</code> + <code>server/</code> 로 켤 수 있습니다(키는 서버에서만).</span></p>

  <section class="ai-panel">
    <h2 class="note-h">🗺️ AI 여행 일정 생성</h2>
    <div class="form">
      <div class="form__row">
        <label>지역 <select id="ai-it-region" class="select">${['전체', ...meta.regions].map(o).join('')}</select></label>
        <label>일수 <select id="ai-it-days" class="select">${['1', '2', '3', '4', '5'].map(o).join('')}</select></label>
      </div>
      <fieldset class="seasons"><legend>관심사(테마)</legend>${interestChecks}</fieldset>
      <button class="btn btn--primary" id="ai-it-run" type="button">일정 만들기</button>
    </div>
    <pre class="ai-out" id="ai-it-out" aria-live="polite">여기에 AI 일정이 표시됩니다.</pre>
  </section>

  <section class="ai-panel">
    <h2 class="note-h">💬 지역 여행 챗봇</h2>
    <div class="form">
      <label>질문 <input id="ai-chat-q" class="search" type="text" placeholder='예: 부산에서 뭐 하면 좋아요?' /></label>
      <button class="btn btn--primary" id="ai-chat-run" type="button">물어보기</button>
    </div>
    <pre class="ai-out" id="ai-chat-out" aria-live="polite">여기에 답변이 표시됩니다.</pre>
  </section>

  <section class="ai-panel">
    <h2 class="note-h">✍️ 팁 작성 도우미</h2>
    <div class="form">
      <div class="form__row">
        <label>지역 <select id="ai-tip-region" class="select">${meta.regions.map(o).join('')}</select></label>
        <label>테마 <select id="ai-tip-theme" class="select">${meta.themes.map(o).join('')}</select></label>
      </div>
      <label>메모(자유롭게) <textarea id="ai-tip-notes" rows="4" placeholder="예: 새벽에 조용함, OO역 근처, 사진 명당"></textarea></label>
      <button class="btn btn--primary" id="ai-tip-run" type="button">팁 다듬기</button>
    </div>
    <pre class="ai-out" id="ai-tip-out" aria-live="polite">여기에 작성 도움말이 표시됩니다.</pre>
  </section>`;
}

export function mountAI() {
  const runInto = async (outId, btn, task, payloadFn) => {
    const out = document.getElementById(outId);
    if (!out || !btn) return;
    if (btn.disabled) return;
    btn.disabled = true;
    out.textContent = '';
    out.classList.add('is-loading');
    try {
      await askAI(task, payloadFn(), { onToken: (chunk) => { out.textContent += chunk; } });
    } catch (err) {
      out.textContent = 'AI 요청 중 오류가 발생했습니다: ' + String(err && err.message || err);
      toast('AI 요청에 실패했습니다');
    } finally {
      out.classList.remove('is-loading');
      btn.disabled = false;
    }
  };

  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };

  bind('ai-it-run', (e) => runInto('ai-it-out', e.currentTarget, 'itinerary', () => ({
    region: (document.getElementById('ai-it-region') || {}).value || '전체',
    days: Number((document.getElementById('ai-it-days') || {}).value) || 2,
    interests: [...document.querySelectorAll('input[name="ai-interest"]:checked')].map((c) => c.value),
  })));

  bind('ai-chat-run', (e) => runInto('ai-chat-out', e.currentTarget, 'chatbot', () => ({
    question: (document.getElementById('ai-chat-q') || {}).value || '',
  })));

  bind('ai-tip-run', (e) => runInto('ai-tip-out', e.currentTarget, 'tipAssist', () => ({
    region: (document.getElementById('ai-tip-region') || {}).value || '',
    theme: (document.getElementById('ai-tip-theme') || {}).value || '',
    notes: (document.getElementById('ai-tip-notes') || {}).value || '',
  })));

  const chatInput = document.getElementById('ai-chat-q');
  if (chatInput) chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const b = document.getElementById('ai-chat-run'); if (b) b.click(); }
  });
}

// ---------- 소개 ----------
export function aboutView() {
  return `
  <section class="hero hero--sm"><h1>숨은여행지찾기 소개</h1></section>
  <div class="prose">
    <p><b>숨은여행지찾기</b>는 그 지역에 실제로 사는 <b>로컬</b>만 여행 팁을 쓰고, 여행자는 검증된 로컬 팁을 둘러보는 데모 서비스입니다.</p>
    <h2>주요 기능</h2>
    <ul>
      <li>지역(시/도)·테마·계절·가격 필터, 검색, 정렬로 탐색</li>
      <li>팁 상세: 로컬 배지, 위치 힌트, 평점, 신뢰도, 유료/무료 구분</li>
      <li>유료 팁 모의 결제 → 잠금 해제, 찜/북마크, 내 여행 노트</li>
      <li>팁 작성(브라우저 저장), 지역 랭킹, 신고/검증 요청(모의)</li>
    </ul>
    <div class="callout">
      <h2>데모 모드 경계</h2>
      <p><b>이 사이트는 데모입니다.</b> 아래 항목은 실제로 동작하지 않습니다.</p>
      <ul>
        <li><b>시드 데이터 + SVG 플레이스홀더 이미지</b>이며, 실제 장소/업체가 아닙니다.</li>
        <li><b>localStorage는 실제 데이터베이스가 아닙니다.</b> 이 브라우저에만 저장됩니다.</li>
        <li><b>실제 결제·로컬 인증·계정·개인정보(PII)가 없습니다.</b> 결제와 인증은 모두 모의입니다.</li>
        <li>실제 서비스라면 백엔드, 실제 위치·로컬 인증, 결제, 인증(계정)이 추가됩니다.</li>
      </ul>
    </div>
    <div class="danger-zone">
      <h2>데이터 초기화</h2>
      <p>이 브라우저에 저장된 잠금 해제·찜·좋아요·작성 팁·지갑을 모두 지웁니다.</p>
      <button class="btn btn--danger" data-action="reset">모든 데모 데이터 초기화</button>
    </div>
    <p class="muted small">Apache-2.0 · © 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국) · Not an official Anthropic product.</p>
  </div>`;
}
