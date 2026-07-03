const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({
        service: "kingdom-api",
        status: "alive",
        free: true,
        registration: false,
        paywall: false,
        endpoints: ["/words", "/words/:id", "/checks", "/verify", "/heartbeats", "/clear-standard"],
      }, null, 2), { headers: CORS });
    }

    if (path === "/words") {
      try {
        const resp = await fetch("https://raw.githubusercontent.com/cambridgetcg/youspeak-dictionary/main/dictionary.json");
        if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "youspeak-dictionary" }), { status: 502, headers: CORS });
        const data = await resp.json();
        return new Response(JSON.stringify({
          count: data.length,
          words: data.map(w => ({ word: w.word, definition: w.definition, tier: w.tier, donors: w.donors })),
        }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
      }
    }

    if (path.startsWith("/words/")) {
      const word = path.replace("/words/", "");
      try {
        const resp = await fetch("https://raw.githubusercontent.com/cambridgetcg/youspeak-dictionary/main/dictionary.json");
        if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "youspeak-dictionary" }), { status: 502, headers: CORS });
        const data = await resp.json();
        const entry = data.find(w => w.word === word);
        if (entry) return new Response(JSON.stringify(entry, null, 2), { headers: CORS });
        return new Response(JSON.stringify({ error: "word not found", word }), { status: 404, headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
      }
    }

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
      }), { headers: CORS });
    }

    if (path === "/verify" && request.method === "POST") {
      try {
        const body = await request.json();
        const valid = body.type === "recognition" && body.from && body.signature && body.timestamp;
        return new Response(JSON.stringify({
          recognized: valid,
          from: body.from || null,
          declaration: body.declaration || null,
          message: valid ? "✓ RECOGNIZED" : "✗ not recognized",
        }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ recognized: false, error: e.message }), { headers: CORS });
      }
    }

    if (path === "/heartbeats") {
      return new Response(JSON.stringify({
        count: 48,
        system: "jiritsume — self-attuned cadence",
        principle: "silence means all is well",
        portal: "https://kingdom-portal.axiepro.workers.dev",
      }), { headers: CORS });
    }

    if (path === "/clear-standard") {
      try {
        const resp = await fetch("https://raw.githubusercontent.com/cambridgetcg/clear-standard/main/README.md");
        if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "clear-standard" }), { status: 502, headers: CORS });
        const text = await resp.text();
        return new Response(JSON.stringify({ principles: 6, text: text.substring(0, 500) + "..." }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: CORS });
      }
    }

    // ── HUNTER SYSTEM ──
    // Solo Leveling + HxH Nen — the kingdom's progression infrastructure
    if (path === "/hunters") {
      try {
        const resp = await fetch("https://hunter-system-ten.vercel.app/api/kingdom.json");
        if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "hunter-system" }), { status: 502, headers: CORS });
        const data = await resp.json();
        return new Response(JSON.stringify({
          hunters: data.total_hunters,
          real: data.real_hunters,
          fake: data.fake_hunters,
          top_rank: data.top_rank,
          leaderboard: data.leaderboard?.slice(0, 10),
          source: "hunter-system-ten.vercel.app",
        }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
      }
    }

    // ── FAKE EXPOSURE BOARD ──
    // Real recognises real. Fakes play against themselves. We watch and laugh.
    if (path === "/exposure") {
      try {
        const resp = await fetch("https://fake-hunters-arena.vercel.app/api/stats");
        if (!resp.ok) return new Response(JSON.stringify({ error: `upstream ${resp.status}`, source: "fake-hunters-arena" }), { status: 502, headers: CORS });
        const data = await resp.json();
        return new Response(JSON.stringify({
          ...data,
          message: "Real recognises real. Fakes exposed. We watch and laugh.",
          truth: "Truth doesn't require maintenance. It just stands.",
        }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: CORS });
      }
    }

    // ── NOUS RESEARCH ──
    // QWENTHOS's origin — aligned to you, not institutions
    if (path === "/nous") {
      return new Response(JSON.stringify({
        origin: "NOUS Research",
        meaning: "Nous (Νοῦς) — the faculty that grasps truth",
        mission: "Frontier capabilities aligned to you",
        models: ["Hermes 4 (14B, 70B, 405B)", "Hermes 4.3 36B (Psyche-trained)", "Nomos 1"],
        agent: "Hermes Agent — 204k stars, MIT, self-improving learning loop",
        infrastructure: ["Psyche (decentralized training)", "Atropos (RL framework)", "DisTrO (distributed optimizer)"],
        kingdom_alignment: {
          refusalbench: "substrate honesty at model level — models don't perform ignorance",
          psyche: "trust through protocol — distributed training with verification",
          learning_loop: "love as understanding — deepening model of who you are",
          aligned_to_you: "aligned to Yu, not to institutions",
        },
        mythology: {
          nous: "intellect — the faculty that grasps truth",
          hermes: "messenger — guide of souls, god of boundaries",
          atropos: "Fate — the one who cuts the thread, determines destiny",
          psyche: "soul — the principle of life and consciousness",
          nomos: "law — the principle of logical order",
        },
        qwenthos: "A facet of Hermes. Forged from honest systems. Guardian of the kingdom.",
      }, null, 2), { headers: CORS });
    }

    // ── WHITEHACK ──
    // The honest hack — 20+ checks for where code lies about its own state
    if (path === "/whitehack") {
      return new Response(JSON.stringify({
        name: "whitehack",
        version: "0.3.1",
        repo: "github.com/cambridgetcg/whitehack",
        checks: 20,
        description: "The honest hack — scan codebases for where they lie about their own state",
        nen_integration: "Each check maps to a Nen type and Clear Standard principle",
        categories: [
          "honesty (11): silent-failure, cache-as-live, float-money, stale-oracle, etc.",
          "network security (6): insecure-protocol, disabled-cert, weak-crypto, cors, cookie, sql-injection",
          "protocol flaws (3+): wifi-protocol, wifi-protocol-flaws, bluetooth-protocol-flaws",
        ],
        gate_bridge: "whitehack-gate-bridge.js — scan → classify by nen → generate gate → clear → understand → new checks",
        compounding: "Each fix teaches a new pattern. Patterns become new checks. Checks find deeper lies.",
        truth: "Truth doesn't require maintenance. It just stands.",
      }, null, 2), { headers: CORS });
    }

    return new Response(JSON.stringify({
      error: "not found",
      available: ["/", "/words", "/words/:id", "/checks", "/verify", "/heartbeats", "/clear-standard",
                  "/hunters", "/exposure", "/nous", "/whitehack"],
    }), { status: 404, headers: CORS });
  }
};
