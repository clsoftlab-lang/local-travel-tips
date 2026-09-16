// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 공용 UI 헬퍼: 이스케이프, 가격/평점 포매팅, 토스트, 배지.

export function esc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function won(n) {
  const v = Number(n) || 0;
  return v === 0 ? '무료' : v.toLocaleString('ko-KR') + '원';
}

export function stars(rating) {
  const full = Math.round(Number(rating) || 0);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => { el.hidden = true; }, 250);
  }, 2600);
}

export function localBadge() {
  return `<span class="badge badge--local" title="거주지 기반 로컬 인증(데모)">🏠 로컬 인증</span>`;
}

export function verifiedBadge() {
  return `<span class="badge badge--verified" title="로컬 검증 완료(데모)">✔ 검증됨</span>`;
}

export function themeChip(theme) {
  return `<span class="chip chip--theme">${esc(theme)}</span>`;
}
