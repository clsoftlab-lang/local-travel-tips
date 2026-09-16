// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 앱 진입점: 해시 라우팅 + 공통 액션 위임 + 테마 토글.

import { loadData, findTip } from './js/data.js';
import { store } from './js/storage.js';
import { toast, won } from './js/ui.js';
import {
  browseView, mountBrowse, rerenderGrid, filters,
  detailView, writeView, mountWrite,
  noteView, rankingView, mountRanking, aboutView,
} from './js/views.js';

const view = () => document.getElementById('view');

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function setActiveNav(name) {
  document.querySelectorAll('#nav a[data-nav]').forEach((a) => {
    a.classList.toggle('is-active', a.dataset.nav === name);
  });
}

function render() {
  const raw = location.hash.replace(/^#\/?/, '') || 'browse';
  const [route, param] = raw.split('/');
  const el = view();
  if (!el) return;

  try {
    switch (route) {
      case 'browse':
        el.innerHTML = browseView(); setActiveNav('browse'); mountBrowse(); break;
      case 'tip':
        el.innerHTML = detailView(param); setActiveNav(''); break;
      case 'write':
        el.innerHTML = writeView(); setActiveNav('write'); mountWrite(navigate); break;
      case 'note':
        el.innerHTML = noteView(); setActiveNav('note'); break;
      case 'ranking':
        el.innerHTML = rankingView(); setActiveNav('ranking'); mountRanking(navigate); break;
      case 'about':
        el.innerHTML = aboutView(); setActiveNav('about'); break;
      default:
        navigate('#/browse'); return;
    }
  } catch (err) {
    el.innerHTML = `<p class="empty">화면을 그리는 중 오류가 발생했습니다.<br><small>${String(err && err.message || err)}</small></p>`;
  }
  el.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
}

// ----- 공통 액션 위임 -----
function onClick(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case 'bookmark': return doBookmark(id);
      case 'like': return doLike(id);
      case 'unlock': return doUnlock(id);
      case 'report': return doReport(id, btn);
      case 'reset': return doReset();
    }
  }
  // 필터 칩(테마/가격)
  const chip = e.target.closest('[data-filter]');
  if (chip) {
    filters[chip.dataset.filter] = chip.dataset.value;
    rerenderGrid();
  }
}

function refreshCurrent() { render(); }

function doBookmark(id) {
  const on = store.toggleBookmark(id);
  toast(on ? '여행 노트에 찜했습니다' : '찜을 해제했습니다');
  refreshCurrent();
}

function doLike(id) {
  const on = store.toggleLike(id);
  toast(on ? '좋아요를 눌렀습니다' : '좋아요를 취소했습니다');
  refreshCurrent();
}

function doUnlock(id) {
  const t = findTip(id);
  if (!t) return;
  if (t.price === 0 || store.isUnlocked(id)) { toast('이미 열람 가능한 팁입니다'); return refreshCurrent(); }
  const wallet = store.wallet();
  if (wallet < t.price) { toast(`포인트가 부족합니다 (보유 ${won(wallet)})`); return; }
  const ok = window.confirm(`${won(t.price)}를 결제하고 이 팁의 잠금을 해제할까요?\n(모의 결제 · 실제 청구 없음)`);
  if (!ok) return;
  store.setWallet(wallet - t.price);
  store.unlock(id);
  toast(`잠금을 해제했습니다 (남은 포인트 ${won(store.wallet())})`);
  refreshCurrent();
}

function doReport(id, btn) {
  if (store.isReported(id)) return;
  const ok = window.confirm('이 팁에 대해 검증 요청/신고를 접수할까요? (모의)');
  if (!ok) return;
  store.report(id);
  toast('신고가 접수되었습니다 (데모)');
  if (btn) { btn.disabled = true; btn.textContent = '신고 접수됨'; }
}

function doReset() {
  const ok = window.confirm('이 브라우저에 저장된 모든 데모 데이터를 초기화할까요?');
  if (!ok) return;
  store.reset();
  toast('모든 데모 데이터를 초기화했습니다');
  navigate('#/browse');
}

// ----- 테마 토글(라이트/다크) -----
function initTheme() {
  const root = document.documentElement;
  let saved = 'auto';
  try { saved = localStorage.getItem('sujon.theme') || 'auto'; } catch {}
  root.dataset.theme = saved;
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', () => {
    const order = { auto: 'light', light: 'dark', dark: 'auto' };
    const next = order[root.dataset.theme] || 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('sujon.theme', next); } catch {}
    toast(`테마: ${next === 'auto' ? '시스템' : next === 'light' ? '라이트' : '다크'}`);
  });
}

// ----- 부트스트랩 -----
async function boot() {
  initTheme();
  document.addEventListener('click', onClick);
  window.addEventListener('hashchange', render);
  if (!store.available()) {
    toast('브라우저 저장소를 쓸 수 없어 임시(메모리) 모드로 동작합니다');
  }
  try {
    await loadData();
    render();
  } catch (err) {
    view().innerHTML = `<p class="empty">데이터를 불러오지 못했습니다.<br><small>${String(err && err.message || err)}</small><br>로컬 서버(예: <code>python -m http.server</code>)로 실행했는지 확인하세요.</p>`;
  }
}

boot();
