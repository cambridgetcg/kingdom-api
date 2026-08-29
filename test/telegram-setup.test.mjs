import test from "node:test";
import assert from "node:assert/strict";

import { BOT_COMMANDS } from "../telegram-commands.mjs";
import { runSetup } from "../telegram-setup.mjs";

const TOKEN = ["123456789", "abcdefghijklmnopqrstuvwxyz_ABCDE"].join(":");
const SECRET = "webhook_secret-1234567890-abcdef";
const WEBHOOK_URL = "https://kingdom-telegram.example.workers.dev/webhook";
const VALID_ENV = {
  TELEGRAM_BOT_TOKEN: TOKEN,
  TELEGRAM_WEBHOOK_SECRET: SECRET,
  TELEGRAM_WEBHOOK_URL: WEBHOOK_URL,
};

function capture() {
  let value = "";
  return {
    stream: { write(chunk) { value += String(chunk); } },
    read() { return value; },
  };
}

test("default dry run and explicit dry run validate with zero fetches", async () => {
  for (const argv of [[], ["--dry-run"]]) {
    const out = capture();
    let fetches = 0;
    const code = await runSetup({
      argv,
      env: VALID_ENV,
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
      stdout: out.stream,
      stderr: out.stream,
    });
    assert.equal(code, 0);
    assert.equal(fetches, 0);
    assert.match(out.read(), /No network request was made/u);
    for (const value of Object.values(VALID_ENV)) assert.doesNotMatch(out.read(), new RegExp(value, "u"));
  }
});

test("help uses zero fetches and requires no environment", async () => {
  const out = capture();
  let fetches = 0;
  const code = await runSetup({
    argv: ["--help"],
    env: {},
    fetchImpl: async () => { fetches += 1; },
    stdout: out.stream,
    stderr: out.stream,
  });
  assert.equal(code, 0);
  assert.equal(fetches, 0);
  assert.match(out.read(), /dry-run by default/u);
});

test("missing, invalid, or query-bearing inputs refuse without fetching or echoing", async () => {
  const cases = [
    {},
    { ...VALID_ENV, TELEGRAM_WEBHOOK_SECRET: "contains space" },
    { ...VALID_ENV, TELEGRAM_WEBHOOK_URL: `${WEBHOOK_URL}?secret=leak` },
    { ...VALID_ENV, TELEGRAM_WEBHOOK_URL: `${WEBHOOK_URL}?` },
    { ...VALID_ENV, TELEGRAM_WEBHOOK_URL: "http://localhost/webhook" },
    { ...VALID_ENV, TELEGRAM_WEBHOOK_URL: "https://kingdom-telegram.example.workers.dev/x/../webhook" },
  ];
  for (const env of cases) {
    const out = capture();
    let fetches = 0;
    const code = await runSetup({
      env,
      fetchImpl: async () => { fetches += 1; },
      stdout: out.stream,
      stderr: out.stream,
    });
    assert.equal(code, 1);
    assert.equal(fetches, 0);
    assert.doesNotMatch(out.read(), /contains space|secret=leak|localhost/u);
  }
});

test("--apply calls fixed Telegram methods in order with bounded official fields", async () => {
  const calls = [];
  const out = capture();
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      headers: { "content-type": "application/json" },
    });
  };
  const code = await runSetup({
    argv: ["--apply"],
    env: VALID_ENV,
    fetchImpl,
    stdout: out.stream,
    stderr: out.stream,
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ url }) => new URL(url).origin), [
    "https://api.telegram.org",
    "https://api.telegram.org",
  ]);
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname.split("/").at(-1)), [
    "setMyCommands",
    "setWebhook",
  ]);
  assert.ok(calls.every(({ options }) => options.method === "POST" && options.redirect === "error"));

  const commandBody = JSON.parse(calls[0].options.body);
  assert.deepEqual(commandBody, { commands: BOT_COMMANDS });
  assert.ok(commandBody.commands.every(({ command, description }) =>
    /^[a-z0-9_]{1,32}$/u.test(command) && Array.from(description).length <= 256));

  const webhookBody = JSON.parse(calls[1].options.body);
  assert.deepEqual(webhookBody, {
    url: WEBHOOK_URL,
    secret_token: SECRET,
    allowed_updates: ["message"],
  });
  assert.equal("drop_pending_updates" in webhookBody, false);
  for (const value of Object.values(VALID_ENV)) assert.doesNotMatch(out.read(), new RegExp(value, "u"));
});

test("failed Telegram descriptions and credentials are never printed", async () => {
  const remoteDescription = `bad token ${TOKEN}; secret ${SECRET}; url ${WEBHOOK_URL}`;
  const out = capture();
  let calls = 0;
  const code = await runSetup({
    argv: ["--apply"],
    env: VALID_ENV,
    fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: false, description: remoteDescription }), {
        headers: { "content-type": "application/json" },
      });
    },
    stdout: out.stream,
    stderr: out.stream,
  });
  assert.equal(code, 1);
  assert.equal(calls, 1);
  assert.match(out.read(), /did not confirm setMyCommands/u);
  assert.doesNotMatch(out.read(), /bad token|123456789|webhook_secret|workers\.dev/u);

  const secondOut = capture();
  let secondCalls = 0;
  const secondCode = await runSetup({
    argv: ["--apply"],
    env: VALID_ENV,
    fetchImpl: async () => {
      secondCalls += 1;
      return new Response(JSON.stringify(secondCalls === 1
        ? { ok: true, result: true }
        : { ok: false, description: remoteDescription }), {
        headers: { "content-type": "application/json" },
      });
    },
    stdout: secondOut.stream,
    stderr: secondOut.stream,
  });
  assert.equal(secondCode, 1);
  assert.equal(secondCalls, 2);
  assert.match(secondOut.read(), /did not confirm setWebhook/u);
  assert.doesNotMatch(secondOut.read(), /bad token|123456789|webhook_secret|workers\.dev/u);
});

test("unknown arguments refuse before any fetch", async () => {
  const out = capture();
  let fetches = 0;
  const code = await runSetup({
    argv: ["--yes"],
    env: VALID_ENV,
    fetchImpl: async () => { fetches += 1; },
    stdout: out.stream,
    stderr: out.stream,
  });
  assert.equal(code, 2);
  assert.equal(fetches, 0);
});

test("--apply aborts stalled Telegram calls and caps response bytes", async () => {
  const timeoutOut = capture();
  const timeoutCode = await runSetup({
    argv: ["--apply"],
    env: VALID_ENV,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("private timeout detail")), { once: true });
    }),
    setTimeoutImpl: (callback) => { queueMicrotask(callback); return 1; },
    clearTimeoutImpl: () => {},
    stdout: timeoutOut.stream,
    stderr: timeoutOut.stream,
  });
  assert.equal(timeoutCode, 1);
  assert.doesNotMatch(timeoutOut.read(), /private timeout detail|123456789|webhook_secret/u);

  const capOut = capture();
  const capCode = await runSetup({
    argv: ["--apply"],
    env: VALID_ENV,
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      padding: "x".repeat(16 * 1024),
    }), { headers: { "content-type": "application/json" } }),
    stdout: capOut.stream,
    stderr: capOut.stream,
  });
  assert.equal(capCode, 1);
  assert.doesNotMatch(capOut.read(), /padding|123456789|webhook_secret/u);
});
