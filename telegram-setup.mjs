#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BOT_COMMANDS } from "./telegram-commands.mjs";
import { HOOK_PATH } from "./telegram-worker.mjs";

const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
const TOKEN_PATTERN = /^[0-9]{5,20}:[A-Za-z0-9_-]{20,128}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/;
const SETUP_TIMEOUT_MS = 10_000;
const MAX_TELEGRAM_RESPONSE_BYTES = 16 * 1024;
const HELP = [
  "KINGDOM Telegram setup (dry-run by default)",
  "",
  "Required environment variables:",
  "  TELEGRAM_BOT_TOKEN",
  "  TELEGRAM_WEBHOOK_SECRET",
  "  TELEGRAM_WEBHOOK_URL (exact HTTPS /webhook URL)",
  "",
  "Usage:",
  "  node telegram-setup.mjs            # validate only; no network",
  "  node telegram-setup.mjs --dry-run  # validate only; no network",
  "  node telegram-setup.mjs --apply    # setMyCommands, then setWebhook",
  "  node telegram-setup.mjs --help",
].join("\n");

function writeLine(stream, value) {
  stream.write(`${value}\n`);
}

function readInputs(env) {
  return {
    token: env.TELEGRAM_BOT_TOKEN,
    secret: env.TELEGRAM_WEBHOOK_SECRET,
    webhookUrl: env.TELEGRAM_WEBHOOK_URL,
  };
}

function validWebhookUrl(value) {
  if (typeof value !== "string" ||
      value.trim() !== value ||
      /[\u0000-\u0020\u007f]/u.test(value) ||
      value.includes("?") ||
      value.includes("#")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.href === value &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === HOOK_PATH &&
      url.search === "" &&
      url.hash === "";
  } catch {
    return false;
  }
}

function validCommands() {
  return BOT_COMMANDS.length > 0 && BOT_COMMANDS.every(({ command, description }) =>
    COMMAND_PATTERN.test(command) &&
    typeof description === "string" &&
    description.length >= 1 &&
    Array.from(description).length <= 256);
}

function validInputs({ token, secret, webhookUrl }) {
  return typeof token === "string" && TOKEN_PATTERN.test(token) &&
    typeof secret === "string" && SECRET_PATTERN.test(secret) &&
    validWebhookUrl(webhookUrl) &&
    validCommands();
}

function apiMethodUrl(token, method) {
  return `${TELEGRAM_API_ORIGIN}/bot${token}/${method}`;
}

async function telegramMethod(fetchImpl, token, method, body, timers) {
  const controller = new AbortController();
  const timer = timers.setTimeoutImpl(() => controller.abort(), SETUP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(apiMethodUrl(token, method), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      redirect: "error",
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    if (!response.ok || response.redirected) return false;
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu.test(
      (response.headers.get("content-type") ?? "").trim(),
    )) {
      return false;
    }
    const declared = response.headers.get("content-length");
    if (declared !== null &&
        (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_TELEGRAM_RESPONSE_BYTES)) {
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) return false;
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > MAX_TELEGRAM_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          return false;
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(source);
    return value !== null && typeof value === "object" && value.ok === true;
  } catch {
    return false;
  } finally {
    timers.clearTimeoutImpl(timer);
  }
}

function modeFromArgs(argv) {
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--dry-run")) return "dry-run";
  if (argv.length === 1 && argv[0] === "--apply") return "apply";
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return "help";
  return "invalid";
}

export async function runSetup({
  argv = [],
  env = {},
  fetchImpl = globalThis.fetch,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const mode = modeFromArgs(argv);
  if (mode === "help") {
    writeLine(stdout, HELP);
    return 0;
  }
  if (mode === "invalid") {
    writeLine(stderr, "Setup refused: use --dry-run, --apply, or --help.");
    return 2;
  }

  const inputs = readInputs(env);
  if (!validInputs(inputs)) {
    writeLine(stderr, "Setup refused: all three environment inputs must be present and valid. No values were printed.");
    return 1;
  }

  if (mode === "dry-run") {
    writeLine(stdout, "Dry run complete: inputs and command definitions are valid. No network request was made.");
    return 0;
  }

  const timers = { setTimeoutImpl, clearTimeoutImpl };
  const commandsSet = await telegramMethod(fetchImpl, inputs.token, "setMyCommands", {
    commands: BOT_COMMANDS,
  }, timers);
  if (!commandsSet) {
    writeLine(stderr, "Setup failed: Telegram did not confirm setMyCommands. No remote description was printed.");
    return 1;
  }

  const webhookSet = await telegramMethod(fetchImpl, inputs.token, "setWebhook", {
    url: inputs.webhookUrl,
    secret_token: inputs.secret,
    allowed_updates: ["message"],
  }, timers);
  if (!webhookSet) {
    writeLine(stderr, "Setup failed: Telegram did not confirm setWebhook. No remote description was printed.");
    return 1;
  }

  writeLine(stdout, "Telegram commands and webhook were confirmed. Credentials were not printed.");
  return 0;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
    TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  };
  process.exitCode = await runSetup({ argv: process.argv.slice(2), env });
}
