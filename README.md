<!--
SPDX-License-Identifier: Apache-2.0
Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
-->
# 숨은여행지찾기 — Local Insider Travel Tips

한국어 문서: [README.ko.md](./README.ko.md)

A local-insider travel-tips web app. **Only people who live near a destination** write
authentic tips, hidden spots and reviews — and can sell them for a small price. Travelers
browse tips written by verified locals, unlock paid tips, bookmark favorites, and keep a
personal travel note.

## 🔗 LIVE DEMO

**https://clsoftlab-lang.github.io/local-travel-tips/**

## What it is

Guidebooks and blogs are crowded and often stale. The people who *actually* know a place are
the ones who live there. **숨은여행지찾기** flips travel content around the local: a resident
writes a hidden-spot tip, gets a residence-based **local badge**, and can offer the tip free
or for a small price. Travelers get authentic, verified-local recommendations instead of
sponsored noise.

## Features

- **Explore** by 시/도 (region), theme (맛집 · 뷰 · 산책 · 아이동반), season and price, with free-text search and sorting (추천 / 평점 / 좋아요 / 가격).
- **Tip detail**: local badge, location hint, inline-SVG scenery photo, rating, trust score, tags, seasons.
- **Free vs. paid** tips with a **simulated purchase → unlock** flow backed by a mock point wallet.
- **Local verification badge** (residence-based, mock) and per-tip **trust score** (local verification + likes).
- **Write a tip** form → saved to `localStorage` (new tips start as "verification pending").
- **Bookmark / like**, and a **Travel Note** collecting purchased, bookmarked and self-authored tips.
- **Extras**: region ranking, seasonal recommendations, and a mock report / verification-request flow.
- **🤖 AI assistant** (itinerary generator, regional chatbot, tip-writing helper) — demo runs on a local mock; real Claude is opt-in via a backend proxy.
- Responsive mobile-first UI, **light + dark** themes, Korean UI, zero build step.

## Run locally

No build, no dependencies — just a static server (ES modules need HTTP, not `file://`):

```bash
# Python
python -m http.server 8976
# then open http://localhost:8976

# or Node
npx --yes serve .
```

Then browse to the printed URL.

## ⚠️ DEMO-MODE boundaries

This is a demonstration app. The following are intentionally **not real**:

- **All content is seed data + inline-SVG placeholder images** — the places, authors, prices and ratings are fictional, not real businesses or people.
- **`localStorage` is not a real database.** Unlocks, bookmarks, likes, authored tips and the point wallet live only in *your* browser and are cleared by the "reset" button or clearing site data.
- **There are no real payments, no real local verification, no accounts and no PII.** Purchases and the local badge are simulated.
- **A real build would add** a backend/database, real geolocation + local verification, real payments, and user authentication.

## Tech

- Static SPA: modern **HTML + CSS + ES-module JavaScript**, relative paths only, no bundler.
- Data from `data/*.json`; state persisted in `localStorage` (with in-memory fallback + try/catch).
- Photos are **inline SVG** generated per theme/seed — no binary assets.
- CI: `node check.mjs` (JSON parses, `node --check` on all JS, required HTML containers).

## Project structure

```
index.html          app shell + required containers
styles.css          light/dark, mobile-first
app.js              router + delegated actions + theme toggle
js/storage.js       localStorage wrapper (try/catch + reset)
js/data.js          JSON loading + authored-tip merge
js/svg.js           inline-SVG scenery generator
js/ui.js            escape / format / toast / badges
js/views.js         browse / detail / write / note / ranking / ai / about
ai/config.js        AI_ENDPOINT ("" = demo mock, no backend, no key)
ai/ai.js            askAI() — deterministic Korean mock or backend stream
server/index.mjs    optional Claude backend proxy (keys server-side only)
data/tips.json      45 seed tips across 17 regions
data/meta.json      regions / themes / seasons
check.mjs           static verification (used by CI)
```

## 🤖 AI 기능 (API 연동)

The app ships three AI features — **AI itinerary generator**, **regional travel chatbot**, and **tip-writing helper** — reachable from the **AI 도우미** menu.

- **Demo = mock (default).** With `ai/config.js` set to `export const AI_ENDPOINT = "";`, the app runs a **deterministic Korean MockProvider** that builds answers from the app's own local-tips data. No backend, **no API key**, fully offline.
- **Enable real Claude (opt-in).** Run the backend proxy in [`server/`](./server/): copy `.env.example` → `.env`, set `ANTHROPIC_API_KEY` (model `claude-opus-5`), `npm install`, `npm start`. Then point the frontend at it:

  ```js
  // ai/config.js
  export const AI_ENDPOINT = "http://localhost:8790/api/ai";
  ```

  The frontend POSTs `{task, payload, grounding}` (grounding = real tip data) and streams the response; the server calls `client.messages.stream({ model: "claude-opus-5", max_tokens: 2048, thinking: { type: "adaptive" }, ... })`.

- **BOLD RULE: API keys are server-side only.** The key lives only in the backend's `ANTHROPIC_API_KEY` environment variable — **never in the browser and never in the repository.** `check.mjs` fails the build if a real key format (`sk-ant-…`) appears anywhere in the repo, and asserts `AI_ENDPOINT` is empty.

## Contributors

- **Dr. Lee Il-guk (이일국)** — idea, direction
- **LWJ**, **LMJ** — collaborators
- **Claude** (Anthropic) — implementation assistant

## License

- Code: **Apache-2.0** — see [LICENSE](./LICENSE).
- Documentation: **CC BY 4.0**.

---

**Not an official Anthropic product.**

## 🎓 Idea origin

The seed idea for this project came from the **entrepreneurship class taught by Dr. Lee Il-guk (이일국) at Yongin University (용인대학교)**. The students in that class produced startup ideas of remarkable, standout creativity — this project is one of those exceptional ideas, finally brought to life as a working service. Built with deep admiration and gratitude for those students' imagination. *(No student personal information is included; only the idea itself was used, implemented clean-room.)*
