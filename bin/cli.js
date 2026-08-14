#!/usr/bin/env node
/**
 * Cradler Router one-command setup.
 *
 *   npx @cradler/router-setup sk-cr-…
 *
 * Configures every supported coding agent to call https://router.cradler.ai:
 *   Claude Code  → ~/.claude/settings.json   ("env" block)
 *   Codex        → ~/.codex/config.toml      (provider block) + shell profile key
 *   Gemini CLI   → ~/.gemini/.env
 * Then verifies the key with a live GET /v1/models call. Idempotent — run it
 * again with a new key to rotate. Every file it touches is listed in the
 * output, and existing settings outside our markers are left alone.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const BASE = process.env.CRADLER_ROUTER_BASE || "https://router.cradler.ai";
const MARK_BEGIN = "# >>> cradler-router >>>";
const MARK_END = "# <<< cradler-router <<<";

const home = process.env.HOME || os.homedir();
const changed = [];
const notes = [];

function log(msg) {
  process.stdout.write(msg + "\n");
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  changed.push(file);
}

/* ---------- Claude Code: ~/.claude/settings.json ---------- */

function setupClaudeCode(key) {
  const file = path.join(home, ".claude", "settings.json");
  let settings = {};
  const raw = readIfExists(file);
  if (raw) {
    try {
      settings = JSON.parse(raw);
    } catch {
      notes.push(`skipped Claude Code: ${file} is not valid JSON — fix it and re-run`);
      return;
    }
  }
  settings.env = {
    ...(settings.env || {}),
    ANTHROPIC_BASE_URL: BASE,
    ANTHROPIC_AUTH_TOKEN: key,
  };
  writeFile(file, JSON.stringify(settings, null, 2) + "\n");
}

/* ---------- Codex: ~/.codex/config.toml + shell profile ---------- */

const CODEX_BLOCK = `[model_providers.cradler]
name = "Cradler Router"
base_url = "${BASE}/v1"
wire_api = "responses"
env_key = "CRADLER_ROUTER_KEY"`;

function setupCodex(key) {
  const file = path.join(home, ".codex", "config.toml");
  let toml = readIfExists(file) || "";

  if (toml.includes("[model_providers.cradler]")) {
    // Replace our block in place (base URL may have changed between versions).
    toml = toml.replace(
      /\[model_providers\.cradler\][^[]*/s,
      CODEX_BLOCK + "\n\n"
    );
  } else {
    toml = toml.trimEnd() + (toml.trim() ? "\n\n" : "") + CODEX_BLOCK + "\n";
  }

  // Point Codex at the provider; keep any model the user already picked.
  if (/^model_provider\s*=/m.test(toml)) {
    toml = toml.replace(/^model_provider\s*=.*$/m, 'model_provider = "cradler"');
  } else {
    toml = 'model_provider = "cradler"\n' + toml;
  }
  if (!/^model\s*=/m.test(toml)) {
    toml = 'model = "gpt-5.5"\n' + toml;
  }
  writeFile(file, toml);

  // The provider block reads the key from CRADLER_ROUTER_KEY — persist it in
  // the shell profile(s), inside our markers so re-runs replace cleanly.
  const exportLine = `export CRADLER_ROUTER_KEY="${key}"`;
  const block = `${MARK_BEGIN}\n${exportLine}\n${MARK_END}`;
  const profiles = [".zshrc", ".bashrc"]
    .map((f) => path.join(home, f))
    .filter((f) => readIfExists(f) !== null);
  if (profiles.length === 0) profiles.push(path.join(home, ".zshrc"));
  for (const profile of profiles) {
    let text = readIfExists(profile) || "";
    if (text.includes(MARK_BEGIN)) {
      text = text.replace(
        new RegExp(`${MARK_BEGIN}[\\s\\S]*?${MARK_END}`),
        block
      );
    } else {
      text = text.trimEnd() + (text.trim() ? "\n\n" : "") + block + "\n";
    }
    writeFile(profile, text);
  }
  notes.push("Codex: open a new terminal (or `source ~/.zshrc`) so CRADLER_ROUTER_KEY is set");
}

/* ---------- Gemini CLI: ~/.gemini/.env ---------- */

function setupGeminiCli(key) {
  const file = path.join(home, ".gemini", ".env");
  const wanted = {
    GOOGLE_GEMINI_BASE_URL: BASE,
    GEMINI_API_KEY: key,
    GEMINI_API_KEY_AUTH_MECHANISM: "bearer",
  };
  const lines = (readIfExists(file) || "").split("\n").filter((l) => {
    const k = l.split("=")[0].trim();
    return l.trim() !== "" && !(k in wanted);
  });
  for (const [k, v] of Object.entries(wanted)) lines.push(`${k}="${v}"`);
  writeFile(file, lines.join("\n") + "\n");
}

/* ---------- verify ---------- */

async function verify(key) {
  try {
    const res = await fetch(`${BASE}/v1/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401) return { ok: false, why: "the key was rejected (401) — copy it again from the dashboard" };
    if (!res.ok) return { ok: false, why: `unexpected response (${res.status})` };
    const data = await res.json();
    return { ok: true, models: data.data.length };
  } catch {
    return { ok: false, why: "could not reach router.cradler.ai — check your network" };
  }
}

/* ---------- main ---------- */

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    log("Usage: npx @cradler/router-setup <sk-cr-your-key>");
    log("Get a key: https://cradler.ai/dashboard/router");
    return;
  }
  let key = args.find((a) => !a.startsWith("-")) || "";
  if (!key) {
    key = await ask("Paste your Router API key (sk-cr-…): ");
  }
  if (!key.startsWith("sk-cr-")) {
    log("✗ That does not look like a Router key (they start with sk-cr-).");
    log("  Create one at https://cradler.ai/dashboard/router");
    process.exitCode = 1;
    return;
  }

  log(`\nConfiguring agents for ${BASE} …\n`);
  setupClaudeCode(key);
  setupCodex(key);
  setupGeminiCli(key);

  log("Updated:");
  for (const f of [...new Set(changed)]) log(`  • ${f.replace(home, "~")}`);
  for (const n of notes) log(`  ⚠ ${n}`);

  process.stdout.write("\nVerifying your key against the Router … ");
  const result = await verify(key);
  if (result.ok) {
    log(`✓ ${result.models} models available.\n`);
    log("Done. Try it:");
    log("  claude          # Claude Code");
    log("  codex           # Codex (new terminal first)");
    log("  gemini          # Gemini CLI");
  } else {
    log(`✗ ${result.why}`);
    log("Config files were written — fix the key and re-run to update them.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  log(`✗ setup failed: ${err.message}`);
  process.exitCode = 1;
});
