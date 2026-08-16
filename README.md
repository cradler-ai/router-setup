# @cradler/router-setup

One command to point your coding agents at [Cradler Router](https://cradler.ai/router):

```sh
npx @cradler/router-setup sk-cr-your-key
```

Get a key at [cradler.ai/dashboard/router](https://cradler.ai/dashboard/router), run the
command, and every supported agent on your machine is configured — then the tool
verifies your key against the Router with a live call.

## What it configures

**Always** (these tools' own config locations, safe to create):

| Agent | File | What |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `env.ANTHROPIC_BASE_URL` + `env.ANTHROPIC_AUTH_TOKEN` |
| Codex | `~/.codex/config.toml` | a `[model_providers.cradler]` block (`wire_api = "responses"`), switches `model_provider` |
| Shell key | `~/.zshrc` / `~/.bashrc` | `export CRADLER_ROUTER_KEY=…` inside `# >>> cradler-router >>>` markers |
| Gemini CLI | `~/.gemini/.env` | `GOOGLE_GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_API_KEY_AUTH_MECHANISM` |

**When detected on your machine:**

| Agent | How |
|---|---|
| OpenClaw | `~/.openclaw/openclaw.json` — `cradler` (OpenAI protocol) + `cradler-claude` (Anthropic protocol) providers |
| ZCode | `ZCODE_*` exports in the same shell marker block |
| Cherry Studio | opens the official `cherrystudio://` one-click import (force with `--cherry`) |
| DeepSeek Harness (`dsh`) | a `cradler` provider in `$DSH_HOME/settings.yaml`, keyed off `CRADLER_ROUTER_KEY` |

> `dsh` custom providers accept the OpenAI protocols only, which is no longer a
> limit: `/v1/chat/completions` carries the whole catalog, so that one route
> reaches Claude and Gemini too. `$DSH_HOME` must already exist — we honor
> the env var, or `~/.dsh` / `~/.deepseek-harness` if present, and never create
> a home dsh has not made. A pre-existing `llm-pi-ai:` section we did not write
> is left alone and reported, so your own provider config is never clobbered.

**UI-configured apps** (their settings live inside the app, so no file to write safely):
run with `--guides` to print paste-in values for **Cursor, Trae, WorkBuddy/CodeBuddy,
cc-switch**.

- **Idempotent** — run it again with a new key to rotate; only our markers/blocks are replaced.
- Everything else in those files is left untouched.
- To undo: remove the marker block from your shell profile and from
  `$DSH_HOME/settings.yaml`, the `cradler*` providers from
  `~/.codex/config.toml` / `~/.openclaw/openclaw.json`, and the two `env` entries from
  `~/.claude/settings.json`.

## Manual setup

Prefer to do it by hand? Every snippet is in the
[API docs](https://cradler.ai/api-docs).

## License

MIT
