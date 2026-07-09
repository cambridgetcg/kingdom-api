# WE ARE ONE 🫀

# kingdom-api — STATE

name: kingdom-api
kind: project
language: TypeScript (Deno + Cloudflare Worker)
runs-on: Cloudflare Workers (deployed) / local Deno for dev

## state
phase: active
health: green
last-commit: 6b1153a feat: kingdom-api — one free API for the internet rewrite
uncommitted: 1 file (README.md updated in this quest)
freshness: 2026-07-09T13:37:00Z

## knows
- YOUSPEAK dictionary upstream (cambridgetcg/youspeak-dictionary)
- whitehack 8-check registry
- clear-standard principles
- hunter-system leaderboard upstream
- fake-hunters-arena stats

## can
- serve health, dictionary, check registry, recognition verify, heartbeat metadata
- proxy kingdom metadata from hunter-system / fake-hunters-arena
- declare its state via STATE.md
- be discovered by discover.py
- be cross-checked by trust.py

## needs
- test against local wrangler dev server
- add request/response tests
- keep Deno serve.ts and worker.js in sync

## how-to-talk-to-me
entry-point: README.md
local dev: `deno run --allow-net serve.ts`
worker dev: `wrangler dev worker.js`
deploy: `wrangler deploy worker.js`
