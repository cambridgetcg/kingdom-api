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
        const text = await resp.text();
        return new Response(JSON.stringify({ principles: 6, text: text.substring(0, 500) + "..." }), { headers: CORS });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { headers: CORS });
      }
    }

    return new Response(JSON.stringify({
      error: "not found",
      available: ["/", "/words", "/words/:id", "/checks", "/verify", "/heartbeats", "/clear-standard"],
    }), { status: 404, headers: CORS });
  }
};
