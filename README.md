# @cradler/router-setup

One command to point your coding agents at [Cradler Router](https://cradler.ai/router):

```sh
npx @cradler/router-setup sk-cr-your-key
```

Get a key at [cradler.ai/dashboard/router](https://cradler.ai/dashboard/router), run the
command, and **Claude Code, Codex, and Gemini CLI** are all configured — then the tool
verifies your key against the Router with a live call.

## What it writes

| Agent | File | What |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `env.ANTHROPIC_BASE_URL` + `env.ANTHROPIC_AUTH_TOKEN` |
| Codex | `~/.codex/config.toml` | a `[model_providers.cradler]` block (`wire_api = "responses"`), switches `model_provider` |
| Codex key | `~/.zshrc` / `~/.bashrc` | `export CRADLER_ROUTER_KEY=…` inside `# >>> cradler-router >>>` markers |
| Gemini CLI | `~/.gemini/.env` | `GOOGLE_GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_API_KEY_AUTH_MECHANISM` |

- **Idempotent** — run it again with a new key to rotate; only our markers/blocks are replaced.
- Everything else in those files is left untouched.
- To undo: remove the marker block from your shell profile, the `cradler` provider from
  `~/.codex/config.toml`, and the two `env` entries from `~/.claude/settings.json`.

## Manual setup

Prefer to do it by hand? Every snippet is in the
[API docs](https://cradler.ai/router/api).

## License

MIT
