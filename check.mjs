// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// 정적 검증기: JSON 파싱, 모든 JS의 `node --check`, index.html 필수 컨테이너.
// 실패 시 종료 코드 1. CI(node check.mjs)에서 사용.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.error(`  FAIL ${m}`); failures++; };

// 1) JSON 파싱
console.log('[1] JSON 파싱');
const jsonFiles = ['data/tips.json', 'data/meta.json'];
let tips = null, meta = null;
for (const rel of jsonFiles) {
  try {
    const data = JSON.parse(readFileSync(join(root, rel), 'utf8'));
    if (rel.endsWith('tips.json')) tips = data;
    if (rel.endsWith('meta.json')) meta = data;
    ok(`${rel} 파싱됨`);
  } catch (e) { bad(`${rel} 파싱 실패: ${e.message}`); }
}

// 2) 시드 데이터 무결성
console.log('[2] 시드 데이터 검사');
if (Array.isArray(tips)) {
  if (tips.length >= 40) ok(`팁 ${tips.length}개 (>= 40)`); else bad(`팁이 40개 미만: ${tips.length}`);
  const ids = new Set();
  const req = ['id', 'title', 'region', 'theme', 'summary', 'body', 'price', 'rating', 'author'];
  let structOk = true;
  for (const t of tips) {
    for (const k of req) if (!(k in t)) { bad(`팁 ${t.id || '?'} 필드 누락: ${k}`); structOk = false; }
    if (ids.has(t.id)) { bad(`중복 id: ${t.id}`); structOk = false; }
    ids.add(t.id);
    if (typeof t.price !== 'number' || t.price < 0) { bad(`잘못된 가격: ${t.id}`); structOk = false; }
    if (meta && meta.regions && !meta.regions.includes(t.region)) { bad(`meta에 없는 지역: ${t.region} (${t.id})`); structOk = false; }
    if (meta && meta.themes && !meta.themes.includes(t.theme)) { bad(`meta에 없는 테마: ${t.theme} (${t.id})`); structOk = false; }
  }
  if (structOk) ok('모든 팁 필수 필드/참조 정상');
  const paid = tips.filter((t) => t.price > 0).length;
  const free = tips.length - paid;
  ok(`무료 ${free} / 유료 ${paid}`);
} else bad('tips.json 이 배열이 아님');

// 3) 모든 JS `node --check`
console.log('[3] JS 문법 검사 (node --check)');
function collectJS(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectJS(p));
    else if (['.js', '.mjs'].includes(extname(name))) out.push(p);
  }
  return out;
}
for (const f of collectJS(root)) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    ok(`${f.replace(root, '')} 문법 OK`);
  } catch (e) {
    bad(`${f.replace(root, '')} 문법 오류: ${(e.stderr || e.stdout || e.message).toString().split('\n')[0]}`);
  }
}

// 4) index.html 필수 컨테이너
console.log('[4] index.html 필수 컨테이너');
try {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const required = ['id="app"', 'id="view"', 'id="toast"', 'id="nav"', 'id="theme-toggle"', 'src="app.js"'];
  for (const token of required) {
    if (html.includes(token)) ok(`포함: ${token}`); else bad(`누락: ${token}`);
  }
} catch (e) { bad(`index.html 읽기 실패: ${e.message}`); }

// 5) AI 레이어 / 백엔드 파일 존재 + node --check
console.log('[5] AI/서버 파일 검사 (node --check ai/ + server/)');
const aiRequired = ['ai/config.js', 'ai/ai.js', 'server/index.mjs', 'server/package.json'];
for (const rel of aiRequired) {
  try { statSync(join(root, rel)); ok(`존재: ${rel}`); }
  catch { bad(`누락: ${rel}`); }
}
for (const dir of ['ai', 'server']) {
  let files = [];
  try { files = collectJS(join(root, dir)); } catch { bad(`${dir}/ 디렉터리 없음`); continue; }
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(`${f.replace(root, '')} 문법 OK`); }
    catch (e) { bad(`${f.replace(root, '')} 문법 오류: ${(e.stderr || e.stdout || e.message).toString().split('\n')[0]}`); }
  }
}

// 6) AI_ENDPOINT 는 리포지토리에서 반드시 빈 문자열(데모=mock, 브라우저에 키 없음)
console.log('[6] ai/config.js 의 AI_ENDPOINT 검사');
try {
  const cfg = readFileSync(join(root, 'ai/config.js'), 'utf8');
  const m = cfg.match(/export\s+const\s+AI_ENDPOINT\s*=\s*(["'])(.*?)\1/);
  if (!m) bad('AI_ENDPOINT export 를 찾지 못함');
  else if (m[2] === '') ok('AI_ENDPOINT 가 빈 문자열(데모=mock)');
  else bad(`AI_ENDPOINT 가 비어있지 않음: "${m[2]}" (커밋 전 "" 로 되돌리세요)`);
} catch (e) { bad(`ai/config.js 읽기 실패: ${e.message}`); }

// 7) 실제 API 키 형식 스캔 (키가 리포지토리에 절대 없도록)
console.log('[7] 실제 API 키 형식 스캔');
// 검사기 소스가 스스로 매치되지 않도록 문자열을 분리해 정규식을 구성합니다.
const KEY_RE = new RegExp("sk-" + "ant-[A-Za-z0-9_-]{20,}");
function collectText(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '.env') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectText(p));
    else if (!['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf'].includes(extname(name))) out.push(p);
  }
  return out;
}
let keyHits = 0;
for (const f of collectText(root)) {
  let content = '';
  try { content = readFileSync(f, 'utf8'); } catch { continue; }
  if (KEY_RE.test(content)) { bad(`실제 키 형식 발견: ${f.replace(root, '')}`); keyHits++; }
}
if (!keyHits) ok('실제 API 키 형식 없음');

console.log('');
if (failures) { console.error(`검증 실패: ${failures}건`); process.exit(1); }
console.log('모든 검증 통과 ✔');
