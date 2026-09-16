// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 인라인 SVG 풍경 플레이스홀더 생성기. 바이너리 이미지 없이
// 테마/시드에 따라 색상과 실루엣이 달라지는 카드 그림을 그립니다.

const PALETTES = {
  '맛집':   ['#f7b267', '#f4845f', '#f25c54'],
  '뷰':     ['#4cc9f0', '#4361ee', '#3a0ca3'],
  '산책':   ['#80ed99', '#57cc99', '#38a3a5'],
  '아이동반': ['#ffd6e0', '#ffa5ab', '#f78ca0'],
  '기본':   ['#a0c4ff', '#6d9dc5', '#4a6fa5'],
};

function rnd(seed) {
  // 시드 기반 결정적 유사난수
  let s = seed * 2654435761 % 2147483647;
  return () => (s = s * 48271 % 2147483647) / 2147483647;
}

export function sceneSVG(theme, seed = 1, { w = 320, h = 180 } = {}) {
  const pal = PALETTES[theme] || PALETTES['기본'];
  const r = rnd((seed || 1) + theme.length * 7);
  const gid = `g${theme.length}${seed}`;
  const sky = pal[0], mid = pal[1], far = pal[2];

  // 뒤쪽 능선 두 개 + 앞쪽 언덕
  const ridge = (base, amp, color, op) => {
    const pts = [];
    for (let x = 0; x <= w; x += w / 8) {
      pts.push(`${x.toFixed(0)},${(base - amp * r()).toFixed(0)}`);
    }
    return `<polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="${color}" opacity="${op}"/>`;
  };

  // 테마 액센트: 뷰=해/달, 맛집=김이 나는 접시, 산책=나무, 아이동반=풍선
  let accent = '';
  const cx = 60 + r() * (w - 120);
  if (theme === '뷰') {
    accent = `<circle cx="${cx.toFixed(0)}" cy="52" r="22" fill="#fff8e1" opacity="0.9"/>`;
  } else if (theme === '맛집') {
    accent = `<g opacity="0.9"><ellipse cx="${(w/2).toFixed(0)}" cy="150" rx="46" ry="12" fill="#fff" opacity="0.85"/><path d="M${(w/2-14).toFixed(0)} 128 q6 -18 0 -30 M${(w/2).toFixed(0)} 128 q6 -18 0 -30 M${(w/2+14).toFixed(0)} 128 q6 -18 0 -30" stroke="#fff" stroke-width="3" fill="none" opacity="0.7"/></g>`;
  } else if (theme === '산책') {
    accent = `<g><rect x="${cx.toFixed(0)}" y="118" width="7" height="40" rx="3" fill="#6b4f2a"/><circle cx="${(cx+3).toFixed(0)}" cy="112" r="24" fill="#2d6a4f" opacity="0.9"/></g>`;
  } else if (theme === '아이동반') {
    accent = `<g><line x1="${cx.toFixed(0)}" y1="60" x2="${cx.toFixed(0)}" y2="120" stroke="#fff" stroke-width="1.5" opacity="0.7"/><circle cx="${cx.toFixed(0)}" cy="52" r="14" fill="#fff" opacity="0.9"/></g>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${theme} 테마 일러스트">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${mid}"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#${gid})"/>
  ${accent}
  ${ridge(h * 0.62, 34, far, 0.55)}
  ${ridge(h * 0.78, 40, mid, 0.7)}
  ${ridge(h * 0.9, 30, far, 0.9)}
</svg>`;
}
