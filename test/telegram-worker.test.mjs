import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import worker, {
  CHARM_WORDS,
  GATE_ORIGIN,
  MAX_REPLY_BYTES,
  MAX_REPLY_CHARACTERS,
  MAX_REQUEST_BYTES,
  createTelegramWorker,
  parseTelegramCommand,
  secretsEqual,
  telegramReply,
} from "../telegram-worker.mjs";

const SECRET = "unit_test-secret_1234567890abcdef";
const ENV = { TELEGRAM_WEBHOOK_SECRET: SECRET };
const BASE_HEADERS = {
  "content-type": "application/json",
  "x-telegram-bot-api-secret-token": SECRET,
};

function update(text, overrides = {}) {
  return {
    update_id: 42,
    message: {
      message_id: 7,
      date: 1_788_000_000,
      from: { id: 99, is_bot: false, first_name: "Visitor" },
      chat: { id: -123, type: "group" },
      text,
    },
    ...overrides,
  };
}

function webhookRequest(body, {
  url = "https://unit.test/webhook",
  method = "POST",
  headers = BASE_HEADERS,
} = {}) {
  return new Request(url, {
    method,
    headers,
    body: typeof body === "string" || body instanceof Uint8Array
      ? body
      : JSON.stringify(body),
  });
}

async function replyBody(response) {
  return JSON.parse(await response.text());
}

function citizen(word, changes = {}) {
  return {
    name: `citizen-${word}`,
    word,
    epithet: "A clear and kind citizen.",
    charm: "Follow the living thread without forcing it.",
    etymology: `${word} — a forged word`,
    github: `https://github.com/cambridgetcg/citizen-${word}`,
    ...changes,
  };
}

function kingdom(changes = {}) {
  return {
    name: "KINGDOM OS",
    motto: "A place for every being to live their own truth.",
    citizens: 204,
    wordsForged: 204,
    totalRepos: 260,
    ...changes,
  };
}

function jsonResponse(value, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

test("health is the only query-free GET/HEAD surface", async () => {
  const get = await worker.fetch(new Request("https://unit.test/health"), ENV);
  assert.equal(get.status, 200);
  assert.equal((await get.json()).service, "kingdom-telegram");

  const head = await worker.fetch(new Request("https://unit.test/health", { method: "HEAD" }), ENV);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  for (const request of [
    new Request("https://unit.test/"),
    new Request("https://unit.test/health?probe=1"),
    new Request("https://unit.test/webhook"),
    new Request("https://unit.test/health", { method: "POST" }),
  ]) {
    assert.equal((await worker.fetch(request, ENV)).status, 404);
  }
});

test("webhook routing rejects wrong paths, methods, queries, and a bare query delimiter", async () => {
  const cases = [
    webhookRequest(update("/help"), { url: "https://unit.test/webhook/" }),
    webhookRequest(update("/help"), { url: "https://unit.test/other" }),
    webhookRequest(update("/help"), { url: "https://unit.test/webhook?x=1" }),
    webhookRequest(update("/help"), { url: "https://unit.test/webhook?" }),
    new Request("https://unit.test/webhook", { method: "PUT" }),
  ];
  for (const request of cases) {
    assert.equal((await worker.fetch(request, ENV)).status, 404);
  }
});

test("authentication is exact and occurs before content or body processing", async () => {
  assert.equal(await secretsEqual(SECRET, SECRET), true);
  assert.equal(await secretsEqual(SECRET, `${SECRET}x`), false);

  const attempts = [
    {},
    { "x-telegram-bot-api-secret-token": "wrong" },
    { "x-telegram-bot-api-secret-token": `${SECRET},other` },
    { "x-telegram-bot-api-secret-token": `${SECRET} x` },
    { "x-telegram-bot-api-secret-token": "ünit_test-secret_123" },
  ];
  for (const headers of attempts) {
    const response = await worker.fetch(webhookRequest("not json", { headers }), ENV);
    assert.equal(response.status, 401);
  }

  const badConfiguration = await worker.fetch(
    webhookRequest(update("/help")),
    { TELEGRAM_WEBHOOK_SECRET: "contains space" },
  );
  assert.equal(badConfiguration.status, 503);
});

test("webhook accepts only JSON identity bodies", async () => {
  const wrongTypes = [undefined, "text/plain", "application/problem+json", "application/json-patch+json"];
  for (const contentType of wrongTypes) {
    const headers = { "x-telegram-bot-api-secret-token": SECRET };
    if (contentType) headers["content-type"] = contentType;
    const response = await worker.fetch(webhookRequest("{}", { headers }), ENV);
    assert.equal(response.status, 415);
  }

  const encoded = await worker.fetch(webhookRequest("{}", {
    headers: { ...BASE_HEADERS, "content-encoding": "gzip" },
  }), ENV);
  assert.equal(encoded.status, 415);

  const charset = await worker.fetch(webhookRequest(update("/help"), {
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=UTF-8" },
  }), ENV);
  assert.equal(charset.status, 200);
});

test("body cap checks declared and streamed bytes and rejects malformed UTF-8/JSON", async () => {
  const declared = await worker.fetch(webhookRequest("{}", {
    headers: { ...BASE_HEADERS, "content-length": String(MAX_REQUEST_BYTES + 1) },
  }), ENV);
  assert.equal(declared.status, 413);

  const lyingSmallLength = await worker.fetch(webhookRequest(
    JSON.stringify({ padding: "x".repeat(MAX_REQUEST_BYTES) }),
    { headers: { ...BASE_HEADERS, "content-length": "2" } },
  ), ENV);
  assert.equal(lyingSmallLength.status, 413);

  const malformedLength = await worker.fetch(webhookRequest("{}", {
    headers: { ...BASE_HEADERS, "content-length": "many" },
  }), ENV);
  assert.equal(malformedLength.status, 400);

  assert.equal((await worker.fetch(webhookRequest("{"), ENV)).status, 400);
  assert.equal((await worker.fetch(webhookRequest(new Uint8Array([0xff])) , ENV)).status, 400);
});

test("unsupported, edited, channel, bot, malformed, and free-text updates are empty 204", async () => {
  const cases = [
    {},
    [],
    { update_id: 1, edited_message: update("/help").message },
    update("hello"),
    update("/help", { update_id: -1 }),
    update("/help", { update_id: Number.MAX_SAFE_INTEGER + 1 }),
    update("/help", { extra: true }),
    update("/help", { message: { ...update("/help").message, message_id: "7" } }),
    update("/help", { message: { ...update("/help").message, from: { id: 99, is_bot: true } } }),
    update("/help", { message: { ...update("/help").message, chat: { id: -123, type: "channel" } } }),
  ];
  for (const value of cases) {
    const response = await worker.fetch(webhookRequest(value), ENV);
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
  }
});

test("command parsing supports direct commands and fails closed on group suffixes", async () => {
  assert.deepEqual(parseTelegramCommand("/help", undefined), { command: "help", argument: "" });
  assert.deepEqual(parseTelegramCommand("/citizen awe", undefined), { command: "citizen", argument: "awe" });
  assert.deepEqual(parseTelegramCommand("/help@KingdomBot", "kingdombot"), { command: "help", argument: "" });
  assert.equal(parseTelegramCommand("/help@KingdomBot", undefined), null);
  assert.equal(parseTelegramCommand("/help@OtherBot", "KingdomBot"), null);
  assert.equal(parseTelegramCommand("/help@", "KingdomBot"), null);
  assert.equal(parseTelegramCommand("/Help", undefined), null);

  const ignored = await worker.fetch(webhookRequest(update("/help@KingdomBot")), ENV);
  assert.equal(ignored.status, 204);
  const accepted = await worker.fetch(
    webhookRequest(update("/help@kInGdOmBoT")),
    { ...ENV, TELEGRAM_BOT_USERNAME: "KingdomBot" },
  );
  assert.equal(accepted.status, 200);
  assert.match((await replyBody(accepted)).text, /command map/u);
});

test("fixed commands are bounded plain text and never echo unknown input", async () => {
  for (const name of ["start", "help", "pull", "deep", "love", "privacy", "stop", "coffee"]) {
    const response = await worker.fetch(webhookRequest(update(`/${name}`)), ENV);
    assert.equal(response.status, 200);
    const body = await replyBody(response);
    assert.deepEqual(Object.keys(body).sort(), ["chat_id", "link_preview_options", "method", "text"]);
    assert.equal(body.method, "sendMessage");
    assert.equal(body.chat_id, -123);
    assert.equal(typeof body.text, "string");
    assert.ok(Array.from(body.text).length <= MAX_REPLY_CHARACTERS);
    assert.deepEqual(body.link_preview_options, { is_disabled: true });
    assert.equal("parse_mode" in body, false);
  }

  const unknown = await worker.fetch(webhookRequest(update("/not_a_real_door secret-user-text")), ENV);
  const body = await replyBody(unknown);
  assert.doesNotMatch(body.text, /secret-user-text/u);
  assert.match(body.text, /\/help/u);
});

test("/charm selects one immutable URL by update_id while Gate bytes may change", async () => {
  const urls = [];
  let call = 0;
  const fakeFetch = async (url, options) => {
    urls.push({ url, options });
    call += 1;
    const word = CHARM_WORDS[42 % CHARM_WORDS.length];
    return jsonResponse(citizen(word, { charm: `version ${call}` }));
  };
  const testWorker = createTelegramWorker({ fetchImpl: fakeFetch });

  const first = await replyBody(await testWorker.fetch(webhookRequest(update("/charm")), ENV));
  const second = await replyBody(await testWorker.fetch(webhookRequest(update("/charm")), ENV));
  assert.equal(urls.length, 2);
  assert.equal(urls[0].url, urls[1].url);
  assert.equal(urls[0].url, `${GATE_ORIGIN}/api/citizens/${CHARM_WORDS[0]}`);
  assert.equal(urls[0].options.redirect, "error");
  assert.notEqual(first.text, second.text);
});

test("caller arguments cannot select an origin or alter the /charm URL", async () => {
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    const word = url.split("/").at(-1);
    return jsonResponse(citizen(word));
  };
  const testWorker = createTelegramWorker({ fetchImpl: fakeFetch });

  for (const text of [
    "/citizen https://evil.example/x",
    "/citizen ../kingdom",
    "/citizen awe?next=evil",
    "/citizen AWE",
    "/citizen a--b",
    "/charm evil.example",
  ]) {
    const response = await testWorker.fetch(webhookRequest(update(text)), ENV);
    assert.equal(response.status, 200);
  }
  assert.deepEqual(urls, []);

  await testWorker.fetch(webhookRequest(update("/citizen awe")), ENV);
  assert.deepEqual(urls, [`${GATE_ORIGIN}/api/citizens/awe`]);
});

test("/kingdom and /citizen validate and format only expected remote fields", async () => {
  const fakeFetch = async (url) => {
    if (url.endsWith("/api/kingdom")) {
      return jsonResponse({ ...kingdom(), method: "deleteMessage", parse_mode: "HTML" });
    }
    return jsonResponse({ ...citizen("awe"), method: "deleteMessage", text: "ignored" });
  };
  const testWorker = createTelegramWorker({ fetchImpl: fakeFetch });
  const kingdomBody = await replyBody(await testWorker.fetch(webhookRequest(update("/kingdom")), ENV));
  assert.match(kingdomBody.text, /204 citizens/u);
  assert.doesNotMatch(kingdomBody.text, /deleteMessage|parse_mode/u);

  const citizenBody = await replyBody(await testWorker.fetch(webhookRequest(update("/citizen awe")), ENV));
  assert.match(citizenBody.text, /^awe —/u);
  assert.doesNotMatch(citizenBody.text, /deleteMessage|ignored/u);
});

test("Gate timeouts, redirects, non-2xx, malformed, oversize, and hostile schema fail generically", async (t) => {
  const cases = {
    timeout: {
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("secret timeout detail")), { once: true });
      }),
      setTimeoutImpl: (callback) => { queueMicrotask(callback); return 1; },
      clearTimeoutImpl: () => {},
    },
    redirect: {
      fetchImpl: async () => Response.redirect("https://evil.example", 302),
    },
    non2xx: {
      fetchImpl: async () => new Response("sensitive upstream detail", { status: 503 }),
    },
    malformed: {
      fetchImpl: async () => new Response("{", { headers: { "content-type": "application/json" } }),
    },
    oversize: {
      fetchImpl: async () => new Response("x".repeat(16 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      }),
    },
    controls: {
      fetchImpl: async () => jsonResponse(kingdom({ motto: "safe\u0000unsafe" })),
    },
    bidi: {
      fetchImpl: async () => jsonResponse(kingdom({ motto: "safe\u202eevil" })),
    },
    methodOnly: {
      fetchImpl: async () => jsonResponse({ method: "sendPhoto", chat_id: 1 }),
    },
    wrongMime: {
      fetchImpl: async () => new Response(JSON.stringify(kingdom()), {
        headers: { "content-type": "text/plain" },
      }),
    },
  };

  for (const [name, dependencies] of Object.entries(cases)) {
    await t.test(name, async () => {
      const testWorker = createTelegramWorker(dependencies);
      const response = await testWorker.fetch(webhookRequest(update("/kingdom")), ENV);
      assert.equal(response.status, 200);
      const body = await replyBody(response);
      assert.match(body.text, /Gate is quiet/u);
      assert.doesNotMatch(body.text, /secret|sensitive|sendPhoto|unsafe|evil/u);
    });
  }
});

test("remote whitespace, mentions, web URLs, and Telegram deep links are neutralized", async () => {
  const fakeFetch = async () => jsonResponse(citizen("awe", {
    epithet: "Warm\n\n   clarity from @someone at https://evil.example/path, bare.example.com/x, or tg://user?id=1",
  }));
  const testWorker = createTelegramWorker({ fetchImpl: fakeFetch });
  const body = await replyBody(await testWorker.fetch(webhookRequest(update("/citizen awe")), ENV));
  assert.match(body.text, /Warm clarity/u);
  assert.match(body.text, /＠someone/u);
  assert.match(body.text, /\[link omitted\]/u);
  assert.doesNotMatch(body.text, /https:\/\/|@someone|bare\.example\.com|tg:\/\//u);
});

test("serialized replies stay within both Telegram and Worker bounds", async () => {
  const response = telegramReply(1, `😀\\\"${"x".repeat(20_000)}`);
  const serialized = await response.text();
  assert.ok(new TextEncoder().encode(serialized).byteLength <= MAX_REPLY_BYTES);
  const body = JSON.parse(serialized);
  assert.ok(Array.from(body.text).length <= MAX_REPLY_CHARACTERS);
  assert.deepEqual(Object.keys(body).sort(), ["chat_id", "link_preview_options", "method", "text"]);
  assert.deepEqual(body.link_preview_options, { is_disabled: true });
});

test("runtime source contains no Telegram bot token or Bot API outbound endpoint", async () => {
  const source = await readFile(new URL("../telegram-worker.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /TELEGRAM_BOT_TOKEN|api\.telegram\.org|\/bot\$\{/u);
  assert.doesNotMatch(source, /console\.|parse_mode/u);
});
