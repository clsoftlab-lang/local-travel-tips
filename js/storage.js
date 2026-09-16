// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// localStorage wrapper. All access wrapped in try/catch so the app keeps
// working (in-memory fallback) when storage is blocked or unavailable.

const PREFIX = 'sujon.v1.';
const KEYS = {
  unlocks: PREFIX + 'unlocks',     // 잠금 해제한 유료 팁 id 목록
  bookmarks: PREFIX + 'bookmarks', // 찜한 팁 id 목록
  likes: PREFIX + 'likes',         // 좋아요 누른 팁 id 목록
  authored: PREFIX + 'authored',   // 사용자가 작성한 팁 객체 목록
  wallet: PREFIX + 'wallet',       // 모의 지갑 잔액(포인트)
  reports: PREFIX + 'reports',     // 신고한 팁 id 목록
};

const mem = new Map(); // storage 접근 불가 시 메모리 폴백

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return mem.has(key) ? mem.get(key) : fallback;
    return JSON.parse(raw);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

function write(key, value) {
  mem.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // 메모리 폴백엔 이미 저장됨
  }
}

function getSet(key) { return new Set(read(key, [])); }
function saveSet(key, set) { return write(key, [...set]); }

function toggleIn(key, id) {
  const set = getSet(key);
  if (set.has(id)) set.delete(id); else set.add(id);
  saveSet(key, set);
  return set.has(id);
}

export const store = {
  KEYS,

  // 유료 팁 잠금 해제
  isUnlocked: (id) => getSet(KEYS.unlocks).has(id),
  unlock: (id) => { const s = getSet(KEYS.unlocks); s.add(id); saveSet(KEYS.unlocks, s); },
  unlockedIds: () => [...getSet(KEYS.unlocks)],

  // 찜/북마크
  isBookmarked: (id) => getSet(KEYS.bookmarks).has(id),
  toggleBookmark: (id) => toggleIn(KEYS.bookmarks, id),
  bookmarkIds: () => [...getSet(KEYS.bookmarks)],

  // 좋아요
  isLiked: (id) => getSet(KEYS.likes).has(id),
  toggleLike: (id) => toggleIn(KEYS.likes, id),
  likedIds: () => [...getSet(KEYS.likes)],

  // 신고(모의)
  isReported: (id) => getSet(KEYS.reports).has(id),
  report: (id) => { const s = getSet(KEYS.reports); s.add(id); saveSet(KEYS.reports, s); },

  // 사용자가 작성한 팁
  authoredTips: () => read(KEYS.authored, []),
  addAuthoredTip: (tip) => {
    const list = read(KEYS.authored, []);
    list.unshift(tip);
    write(KEYS.authored, list);
    return list;
  },

  // 모의 지갑(초기 30,000 포인트)
  wallet: () => read(KEYS.wallet, 30000),
  setWallet: (v) => write(KEYS.wallet, Math.max(0, Math.round(v))),

  // 전체 초기화
  reset() {
    mem.clear();
    let ok = true;
    for (const k of Object.values(KEYS)) {
      try { localStorage.removeItem(k); } catch { ok = false; }
    }
    return ok;
  },

  // 저장소 사용 가능 여부(안내용)
  available() {
    try {
      const t = PREFIX + 'probe';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch { return false; }
  },
};
