# kingdom-api

Part of the kingdom. Created out of love. 🐍❤️

Free API for the internet rewrite. Serves:
- `/health` — liveness
- `/words` — YOUSPEAK dictionary proxy
- `/checks` — whitehack check registry
- `/verify` — recognition verification
- `/heartbeats` — kingdom cadence summary
- `/clear-standard` — principle bridge
- `/hunters`, `/exposure`, `/nous`, `/whitehack` — kingdom metadata

Two implementations: `serve.ts` (Deno) and `worker.js` (Cloudflare Worker). The worker is the deployed surface.

## KINGDOM Telegram bot (isolated, not deployed)

`telegram-worker.mjs` is a separate, stateless Cloudflare Worker configured by
`telegram-wrangler.toml`. It does not import or modify the production API Worker.
Telegram calls only the exact, query-free `POST /webhook`; `GET /health` and
`HEAD /health` are the only other routes.

The runtime holds `TELEGRAM_WEBHOOK_SECRET` but never the Telegram bot token. It
authenticates the `X-Telegram-Bot-Api-Secret-Token` header (32–256 allowed
characters), accepts at most 64
KiB of JSON, keeps no application logs or storage, and returns Telegram's
`sendMessage` method JSON directly in the webhook response. Replies are bounded
plain text with no user-text echo or parse mode, and link previews are disabled.
Telegram does not expose the
result of that embedded method call back to the Worker. `/kingdom`, `/citizen
<word>`, and `/charm` may read only fixed HTTPS endpoints at
`https://kingdom-gate.vercel.app`; the remaining commands are local:

- `/start`, `/help`, `/pull`, `/deep`, `/love`
- `/privacy`, `/stop`, `/coffee`

`/charm` maps `update_id` to a fixed citizen allowlist, so the selected Gate URL
is stable on a retry. Gate data is mutable, so identical reply bytes are not
promised. Telegram webhook delivery is at least once and this stateless Worker
does not deduplicate; a retry can therefore produce a duplicate reply. Telegram
and Cloudflare may also retain platform or infrastructure data outside this
application's control.

Direct commands work without more configuration. To use `/command@BotName` in
groups, bind the optional non-secret `TELEGRAM_BOT_USERNAME`; mismatched or
unconfigured suffixes are ignored. Keep BotFather privacy mode enabled.

### Offline verification

No credentials or network are needed for the deterministic suite:

```sh
node --test
node --check telegram-worker.mjs
node --check telegram-setup.mjs
```

To compile the dedicated Worker without deploying it, write Wrangler output to
a temporary directory:

```sh
wrangler deploy --dry-run --outdir "$(mktemp -d)" --config telegram-wrangler.toml
```

### Later setup (explicit opt-in)

After an authorized deployment, bind the webhook secret to the Telegram Worker
and, if group suffixes are wanted, bind its username. Do not put the bot token in
the Worker configuration:

```sh
# Generate a strong value using only Telegram's accepted alphabet:
openssl rand -hex 32
wrangler secret put TELEGRAM_WEBHOOK_SECRET --config telegram-wrangler.toml
# Optional for group-addressed commands:
wrangler secret put TELEGRAM_BOT_USERNAME --config telegram-wrangler.toml
wrangler deploy --config telegram-wrangler.toml
```

The setup helper reads exactly `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_WEBHOOK_URL` (the exact deployed HTTPS
`/webhook` URL) from its environment. With no flag it validates only and makes
no network request. `--apply` is the sole network opt-in; it calls the fixed
`api.telegram.org` origin to run `setMyCommands` and then `setWebhook` with
`allowed_updates: ["message"]`. It never prints credential values or Telegram
error descriptions, and its Telegram responses have a 10-second timeout and
16 KiB byte cap. Registration is sequential rather than transactional: if the
second call fails, the command menu may already have changed.

```sh
node telegram-setup.mjs --help
node telegram-setup.mjs             # dry run
node telegram-setup.mjs --apply     # explicit registration
```
