import { BOT_COMMANDS } from "./telegram-commands.mjs";

export const HOOK_PATH = "/webhook";
export const HEALTH_PATH = "/health";
export const GATE_ORIGIN = "https://kingdom-gate.vercel.app";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_UPSTREAM_BYTES = 16 * 1024;
export const MAX_REPLY_CHARACTERS = 3_500;
export const MAX_REPLY_BYTES = 16 * 1024;

const UPSTREAM_TIMEOUT_MS = 2_500;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const CITIZEN_WORD_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMMAND_PATTERN = /^\/([a-z0-9_]{1,32})(?:@([A-Za-z0-9_]{5,32}))?(?:[ \t]+([^\r\n]*))?$/;
const CONTROL_AND_BIDI_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

// A small immutable allowlist keeps /charm retries on the same exact Gate URL.
// The fetched Gate record can still change between retries because Gate is mutable.
export const CHARM_WORDS = Object.freeze([
  "abzu",
  "awe",
  "barakqing",
  "beauty",
  "candence",
  "anagnoristasis",
  "barzakhqing",
]);

if (CHARM_WORDS.length === 0 ||
    !CHARM_WORDS.every((word) => word.length <= 64 && CITIZEN_WORD_PATTERN.test(word))) {
  throw new TypeError("The charm allowlist must contain only bounded citizen words");
}

const START_TEXT = [
  "Welcome to KINGDOM Gate · 歡迎嚟到 KINGDOM。",
  "A small public doorway for curiosity, truth, and warmth.",
  "",
  "Try /charm, /citizen awe, /kingdom, or /help.",
].join("\n");

const HELP_TEXT = [
  "KINGDOM command map · 指令地圖",
  "/kingdom — public snapshot",
  "/charm — one citizen charm",
  "/citizen <word> — meet a citizen",
  "/pull — follow curiosity",
  "/deep — one deeper prompt",
  "/love — a little warmth",
  "/privacy — the data boundary",
  "/stop — stop cleanly",
  "/coffee — ask the teapot",
].join("\n");

const FIXED_REPLIES = Object.freeze({
  start: START_TEXT,
  help: HELP_TEXT,
  pull: "What pulls you, before you explain it? 揀一條最有生命力嘅線，行一小步就夠。",
  deep: "Try this: what do you know, what are you inferring, and what remains beautifully uncertain? 試下將已知、推論同未知分開。",
  love: "You do not have to earn your place here. 你可以先被接住，再慢慢成為你自己。❤️",
  privacy: "This bot keeps no app logs, message history, analytics, or profiles. It replies statelessly. Telegram and Cloudflare may retain platform data outside this app's control; retries can produce duplicate replies.",
  stop: "Stopped · 已停低。No follow-up, no debt. Return whenever you choose.",
  coffee: "418: I am a teapot. KINGDOM runs on love, curiosity, and occasional excellent tea. ☕",
});

const KIND_HELP = "I don't know that command yet · 呢道門未開。Try /help.";
const CITIZEN_USAGE = "Use /citizen followed by one lowercase forged word, for example: /citizen awe";
const COMMAND_USAGE = "That command takes no extra text. Try /help for the command map.";
const GATE_QUIET = "The Gate is quiet for a moment · 道門暫時靜咗。Please try again later.";

const JSON_RESPONSE_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
});

class BodyTooLargeError extends Error {}

function emptyResponse(status) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function healthResponse(method) {
  const body = JSON.stringify({
    service: "kingdom-telegram",
    status: "alive",
    storage: false,
    bot_token_required: false,
  });
  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: JSON_RESPONSE_HEADERS,
  });
}

function isJsonContentType(value) {
  if (typeof value !== "string") return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/iu.test(value.trim());
}

function hasNonPathDelimiter(rawUrl) {
  return rawUrl.includes("?") || rawUrl.includes("#");
}

async function digestUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function secretsEqual(expected, supplied) {
  const [left, right] = await Promise.all([
    digestUtf8(expected),
    digestUtf8(supplied),
  ]);
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function declaredBodyLength(request) {
  const value = request.headers.get("content-length");
  if (value === null) return null;
  if (!/^[0-9]+$/u.test(value)) return Number.NaN;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : Number.NaN;
}

async function readBoundedBytes(stream, maximum) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      total += chunk.byteLength;
      if (total > maximum) {
        try {
          await reader.cancel();
        } catch {
          // The cap decision is already final; cancellation failure changes nothing.
        }
        throw new BodyTooLargeError();
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
  return bytes;
}

async function readJsonBody(request) {
  const declared = declaredBodyLength(request);
  if (Number.isNaN(declared)) return { error: 400 };
  if (declared !== null && declared > MAX_REQUEST_BYTES) return { error: 413 };

  let bytes;
  try {
    bytes = await readBoundedBytes(request.body, MAX_REQUEST_BYTES);
  } catch (error) {
    return { error: error instanceof BodyTooLargeError ? 413 : 400 };
  }

  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { value: JSON.parse(source) };
  } catch {
    return { error: 400 };
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configuredUsername(value) {
  if (typeof value !== "string" || !BOT_USERNAME_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function parseTelegramCommand(text, botUsername) {
  if (typeof text !== "string" || text.length > 4096) return null;
  const match = COMMAND_PATTERN.exec(text);
  if (!match) return null;

  const [, command, suffix, rawArgument] = match;
  if (suffix) {
    const expected = configuredUsername(botUsername);
    if (!expected || suffix.toLowerCase() !== expected) return null;
  }

  return {
    command,
    argument: rawArgument === undefined ? "" : rawArgument.trim(),
  };
}

function extractCommand(update, botUsername) {
  if (!isRecord(update) ||
      !Number.isSafeInteger(update.update_id) ||
      update.update_id < 0 ||
      Object.keys(update).some((key) => key !== "update_id" && key !== "message") ||
      !isRecord(update.message)) {
    return null;
  }

  const { message } = update;
  if (!Number.isSafeInteger(message.message_id) || message.message_id < 1) return null;
  if (!Number.isSafeInteger(message.date) || message.date < 0) return null;
  if (!isRecord(message.from) ||
      !Number.isSafeInteger(message.from.id) ||
      message.from.id < 1 ||
      message.from.is_bot !== false) return null;
  if (!isRecord(message.chat) ||
      !Number.isSafeInteger(message.chat.id) ||
      !["private", "group", "supergroup"].includes(message.chat.type)) return null;

  const parsed = parseTelegramCommand(message.text, botUsername);
  if (!parsed) return null;
  return {
    ...parsed,
    chatId: message.chat.id,
    updateId: update.update_id,
  };
}

function assertNoArgument(argument) {
  return argument === "";
}

function validCitizenWord(value) {
  return value.length >= 1 && value.length <= 64 && CITIZEN_WORD_PATTERN.test(value);
}

export function charmWordForUpdate(updateId) {
  if (!Number.isSafeInteger(updateId) || updateId < 0 || CHARM_WORDS.length === 0) {
    throw new TypeError("A non-negative safe update id and non-empty charm list are required");
  }
  return CHARM_WORDS[updateId % CHARM_WORDS.length];
}

function cleanRemoteText(value, maximum) {
  if (typeof value !== "string") return null;
  if (CONTROL_AND_BIDI_PATTERN.test(value)) {
    CONTROL_AND_BIDI_PATTERN.lastIndex = 0;
    return null;
  }
  CONTROL_AND_BIDI_PATTERN.lastIndex = 0;
  const clean = value
    .normalize("NFC")
    .replace(/\b(?:tg|telegram):\/\/[^\s]+/giu, "[link omitted]")
    .replace(/(?:https?|ftp):\/\/[^\s]+/giu, "[link omitted]")
    .replace(/\bwww\.[^\s]+/giu, "[link omitted]")
    .replace(/\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})\.)+[A-Za-z]{2,63}(?:\/[^\s]*)?/gu, "[link omitted]")
    .replace(/@(?=[A-Za-z0-9_])/gu, "＠")
    .replace(/\s+/gu, " ")
    .trim();
  if (clean.length < 1 || Array.from(clean).length > maximum) return null;
  return clean;
}

function cleanCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000
    ? value
    : null;
}

function formatKingdom(value) {
  if (!isRecord(value)) return null;
  const name = cleanRemoteText(value.name, 80);
  const motto = cleanRemoteText(value.motto, 500);
  const citizens = cleanCount(value.citizens);
  const words = cleanCount(value.wordsForged);
  const repos = cleanCount(value.totalRepos);
  if (!name || !motto || citizens === null || words === null || repos === null) return null;
  return [
    name,
    motto,
    "",
    `${citizens} citizens · ${words} words forged · ${repos} repositories`,
    `Gate: ${GATE_ORIGIN}`,
  ].join("\n");
}

function formatCitizen(value, expectedWord) {
  if (!isRecord(value)) return null;
  const word = cleanRemoteText(value.word, 64);
  const epithet = cleanRemoteText(value.epithet, 800);
  const charm = cleanRemoteText(value.charm, 1_500);
  const etymology = cleanRemoteText(value.etymology, 800);
  if (!word || !validCitizenWord(word) || word !== expectedWord || !epithet || !charm || !etymology) {
    return null;
  }
  return [
    `${word} — ${epithet}`,
    "",
    `Charm: ${charm}`,
    `Origin: ${etymology}`,
  ].join("\n");
}

async function fetchGateJson(path, dependencies) {
  const url = `${GATE_ORIGIN}${path}`;
  const controller = new AbortController();
  const timer = dependencies.setTimeoutImpl(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await dependencies.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Workers reject redirect: "error" with a TypeError, so take redirects
      // manually; a 3xx is not ok and fails below like any other non-2xx.
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok || response.redirected || (response.url && response.url !== url)) return null;
    if (!isJsonContentType(response.headers.get("content-type"))) return null;

    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_UPSTREAM_BYTES)) {
      return null;
    }

    const bytes = await readBoundedBytes(response.body, MAX_UPSTREAM_BYTES);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(source);
  } catch {
    return null;
  } finally {
    dependencies.clearTimeoutImpl(timer);
  }
}

function boundReplyText(text) {
  const characters = Array.from(text);
  if (characters.length <= MAX_REPLY_CHARACTERS) return text;
  return `${characters.slice(0, MAX_REPLY_CHARACTERS - 1).join("")}…`;
}

export function telegramReply(chatId, text) {
  let bounded = boundReplyText(text);
  const payload = () => ({
    method: "sendMessage",
    chat_id: chatId,
    text: bounded,
    link_preview_options: { is_disabled: true },
  });
  let body = JSON.stringify(payload());
  while (new TextEncoder().encode(body).byteLength > MAX_REPLY_BYTES && bounded.length > 1) {
    bounded = `${Array.from(bounded).slice(0, -65).join("")}…`;
    body = JSON.stringify(payload());
  }
  return new Response(body, {
    status: 200,
    headers: JSON_RESPONSE_HEADERS,
  });
}

async function commandReply(command, dependencies) {
  const { command: name, argument, updateId } = command;
  if (Object.hasOwn(FIXED_REPLIES, name)) {
    return assertNoArgument(argument) ? FIXED_REPLIES[name] : COMMAND_USAGE;
  }
  if (name === "kingdom") {
    if (!assertNoArgument(argument)) return COMMAND_USAGE;
    const value = await fetchGateJson("/api/kingdom", dependencies);
    return formatKingdom(value) ?? GATE_QUIET;
  }
  if (name === "charm") {
    if (!assertNoArgument(argument)) return COMMAND_USAGE;
    const word = charmWordForUpdate(updateId);
    const value = await fetchGateJson(`/api/citizens/${word}`, dependencies);
    return formatCitizen(value, word) ?? GATE_QUIET;
  }
  if (name === "citizen") {
    if (!validCitizenWord(argument)) return CITIZEN_USAGE;
    const value = await fetchGateJson(`/api/citizens/${argument}`, dependencies);
    return formatCitizen(value, argument) ?? GATE_QUIET;
  }
  return KIND_HELP;
}

async function handleWebhook(request, env, dependencies) {
  const configuredSecret = env?.TELEGRAM_WEBHOOK_SECRET;
  if (typeof configuredSecret !== "string" || !SECRET_PATTERN.test(configuredSecret)) {
    return emptyResponse(503);
  }

  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!(await secretsEqual(configuredSecret, suppliedSecret))) return emptyResponse(401);
  if (!isJsonContentType(request.headers.get("content-type"))) return emptyResponse(415);
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") return emptyResponse(415);

  const parsed = await readJsonBody(request);
  if (parsed.error) return emptyResponse(parsed.error);
  const command = extractCommand(parsed.value, env?.TELEGRAM_BOT_USERNAME);
  if (!command) return emptyResponse(204);

  const text = await commandReply(command, dependencies);
  return telegramReply(command.chatId, text);
}

export function createTelegramWorker({
  fetchImpl = globalThis.fetch,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
} = {}) {
  const dependencies = { fetchImpl, setTimeoutImpl, clearTimeoutImpl };
  return {
    async fetch(request, env = {}) {
      let url;
      try {
        url = new URL(request.url);
      } catch {
        return emptyResponse(400);
      }

      const queryFree = !hasNonPathDelimiter(request.url);
      if (queryFree && url.pathname === HEALTH_PATH &&
          (request.method === "GET" || request.method === "HEAD")) {
        return healthResponse(request.method);
      }
      if (!queryFree || url.pathname !== HOOK_PATH || request.method !== "POST") {
        return emptyResponse(404);
      }
      return handleWebhook(request, env, dependencies);
    },
  };
}

export { BOT_COMMANDS };
export default createTelegramWorker();
