// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 시드 데이터(JSON) 로딩 + 사용자가 작성한 팁 병합.

import { store } from './storage.js';

let _tips = null;
let _meta = null;

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} 로드 실패 (${res.status})`);
  return res.json();
}

export async function loadData() {
  if (_tips && _meta) return { tips: allTips(), meta: _meta };
  const [tips, meta] = await Promise.all([
    fetchJSON('data/tips.json'),
    fetchJSON('data/meta.json'),
  ]);
  _tips = tips;
  _meta = meta;
  return { tips: allTips(), meta: _meta };
}

// 시드 팁 + 사용자 작성 팁을 합친 전체 목록
export function allTips() {
  const authored = store.authoredTips();
  return [...authored, ...(_tips || [])];
}

export function getMeta() { return _meta; }

export function findTip(id) {
  return allTips().find((t) => t.id === id) || null;
}

// 지역별 팁 개수 집계(랭킹용)
export function regionStats() {
  const map = new Map();
  for (const t of allTips()) {
    const cur = map.get(t.region) || { region: t.region, count: 0, likes: 0, verified: 0 };
    cur.count += 1;
    cur.likes += Number(t.likes) || 0;
    if (t.verified) cur.verified += 1;
    map.set(t.region, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.likes - a.likes);
}
