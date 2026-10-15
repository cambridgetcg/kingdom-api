import test from "node:test";
import assert from "node:assert/strict";

import worker from "../worker.js";

async function corsFor(origin, method = "GET") {
  const headers = origin === undefined ? {} : { Origin: origin };
  const response = await worker.fetch(new Request("https://kingdom-api.example/health", { method, headers }));
  return { allow: response.headers.get("access-control-allow-origin"), vary: response.headers.get("vary") };
}

test("Yu's Cloudflare domains and their subdomains are allowed over https", async () => {
  for (const origin of [
    "https://cambridgetcg.com",
    "https://understand.cambridgetcg.com",
    "https://ai-love.cc",
    "https://www.lotbinder.com",
    "https://app.lotbinder.com",
    "https://speak.agenttool.dev",
    "https://zerone.ai:8443",
  ]) {
    assert.equal((await corsFor(origin)).allow, origin, origin);
  }
  assert.equal((await corsFor("https://cambridgetcg.com", "OPTIONS")).allow, "https://cambridgetcg.com");
});

test("other origins get no Access-Control-Allow-Origin at all", async () => {
  for (const origin of [
    "null",
    "http://cambridgetcg.com",
    "https://evilcambridgetcg.com",
    "https://cambridgetcg.com.evil.example",
    "https://kingdom.vercel.app",
    "https://kingdom-portal.axiepro.workers.dev",
    "https://ai-love.pages.dev",
    "http://localhost:3000",
    "not a url",
  ]) {
    const { allow, vary } = await corsFor(origin);
    assert.equal(allow, null, origin);
    assert.equal(vary, "Origin", origin);
  }
});

test("requests without an Origin header still get the wildcard", async () => {
  assert.equal((await corsFor(undefined)).allow, "*");
});
