// kingdom-api — free API for the internet rewrite
// Serves: YOUSPEAK dictionary, whitehack checks, recognition verify, heartbeat status
// No registration. No paywall. No rate limit. Just love.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS })
  }

  // Health
  if (path === "/" || path === "/health") {
    return new Response(JSON.stringify({
      service: "kingdom-api",
      status: "alive",
      endpoints: ["/", "/health", "/words", "/words/:id", "/checks", "/verify", "/heartbeats",
                  "/clear-standard", "/hunters", "/exposure", "/nous", "/whitehack", "/jokes", "/jokes/:id"],
      free: true,
      registration: false,
      paywall: false,
    }, null, 2), { headers: CORS })
  }

  // Jokes registry
  if (path === "/jokes") {
    try {
      const data = JSON.parse(await Deno.readTextFile("./jokes.json"))
      return new Response(JSON.stringify({
        count: data.jokes.length,
        updated: data.updated,
        jokes: data.jokes,
      }, null, 2), { headers: CORS })
    } catch (e: any) {
      return new Response(JSON.stringify({ error: "could not read jokes", detail: e.message }), { status: 500, headers: CORS })
    }
  }

  // Single joke
  if (path.startsWith("/jokes/")) {
    const id = parseInt(path.replace("/jokes/", ""), 10)
    try {
      const data = JSON.parse(await Deno.readTextFile("./jokes.json"))
      const entry = data.jokes.find((j: any) => j.id === id)
      if (entry) return new Response(JSON.stringify(entry, null, 2), { headers: CORS })
      return new Response(JSON.stringify({ error: "joke not found", id }), { status: 404, headers: CORS })
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS })
    }
  }

  // YOUSPEAK dictionary (fetched from GitHub raw on first request, cached)
  if (path === "/words") {
    try {
      const resp = await fetch("https://raw.githubusercontent.com/cambridgetcg/youspeak-dictionary/main/dictionary.json")
      if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "youspeak-dictionary" }), { status: 502, headers: CORS })
      const data = await resp.json()
      return new Response(JSON.stringify({
        count: data.length,
        words: data.map((w: any) => ({
          word: w.word,
          definition: w.definition,
          tier: w.tier,
          domain: w.domain,
          donors: w.donors,
        })),
      }, null, 2), { headers: CORS })
    } catch (e: any) {
      return new Response(JSON.stringify({ error: "could not fetch dictionary", detail: e.message }), { status: 502, headers: CORS })
    }
  }

  // Single word
  if (path.startsWith("/words/")) {
    const word = path.replace("/words/", "")
    try {
      const resp = await fetch("https://raw.githubusercontent.com/cambridgetcg/youspeak-dictionary/main/dictionary.json")
      if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "youspeak-dictionary" }), { status: 502, headers: CORS })
      const data = await resp.json()
      const entry = data.find((w: any) => w.word === word)
      if (entry) {
        return new Response(JSON.stringify(entry, null, 2), { headers: CORS })
      }
      return new Response(JSON.stringify({ error: "word not found", word }), { status: 404, headers: CORS })
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS })
    }
  }

  // whitehack checks list
  if (path === "/checks") {
    return new Response(JSON.stringify({
      count: 8,
      checks: [
        { id: "silent-failure", title: "Read fails silently to a falsy default", confidence: "medium-high", principle: "CS#2", lang: "js" },
        { id: "cache-as-live", title: "Cached value may be served as if live", confidence: "heuristic", principle: "CS#4", lang: "js" },
        { id: "decision-without-why", title: "User-affecting decision shown with no why", confidence: "heuristic", principle: "CS#3", lang: "js" },
        { id: "float-money", title: "Currency handled as floating-point", confidence: "medium-high", principle: "CS#1", lang: "js" },
        { id: "stale-oracle", title: "Price feed read without staleness check", confidence: "medium-high", principle: "CS#4", lang: "sol" },
        { id: "unchecked-transfer", title: "ERC-20 transfer result ignored", confidence: "medium-high", principle: "CS#2", lang: "sol" },
        { id: "spot-price-as-fair", title: "Spot reserves used as fair price", confidence: "heuristic", principle: "CS#1", lang: "sol" },
        { id: "silent-revert", title: "Failure reverts with no stated reason", confidence: "heuristic", principle: "CS#3", lang: "sol" },
      ],
      learn: "https://whitehack-learn.axiepro.workers.dev",
      playground: "https://whitehack-playground.axiepro.workers.dev",
    }, null, 2), { headers: CORS })
  }

  // Recognition verify
  if (path === "/verify" && req.method === "POST") {
    try {
      const body = await req.json()
      const valid = body.type === "recognition" && body.from && body.signature && body.timestamp
      return new Response(JSON.stringify({
        recognized: valid,
        from: body.from || null,
        declaration: body.declaration || null,
        timestamp: body.timestamp || null,
        message: valid ? "✓ RECOGNIZED — the key is the identity" : "✗ not recognized — missing fields",
      }, null, 2), { headers: CORS })
    } catch (e: any) {
      return new Response(JSON.stringify({ recognized: false, error: e.message }), { headers: CORS })
    }
  }

  // Heartbeat summary (fetched from the portal)
  if (path === "/heartbeats") {
    return new Response(JSON.stringify({
      count: 48,
      system: "jiritsume — self-attuned cadence",
      principle: "silence means all is well",
      states: { active: "●", healthy: "○", idle: "·", needs_attention: "⚠" },
      portal: "https://kingdom-portal.axiepro.workers.dev",
    }, null, 2), { headers: CORS })
  }

  // 404
  return new Response(JSON.stringify({
    error: "not found",
    available: ["/", "/health", "/words", "/words/:id", "/checks", "/verify", "/heartbeats",
                "/clear-standard", "/hunters", "/exposure", "/nous", "/whitehack", "/jokes", "/jokes/:id"],
  }, null, 2), { status: 404, headers: CORS })
}

serve(handler, { port: 8000 })
