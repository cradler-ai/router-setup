#!/usr/bin/env node
/**
 * Cradler Router one-command setup.
 *
 *   npx @cradler/router-setup sk-cr-…
 *
 * Configures every supported coding agent to call https://router.cradler.ai.
 *
 * Always (their own config files, safe to create):
 *   Claude Code  → ~/.claude/settings.json   ("env" block)
 *   Codex        → ~/.codex/config.toml      (provider block) + shell profile key
 *   Gemini CLI   → ~/.gemini/.env
 * When detected (installed on this machine):
 *   OpenClaw     → ~/.openclaw/openclaw.json (models.providers entries)
 *   ZCode        → shell profile ZCODE_* exports (same marker block)
 *   Cherry Studio→ official cherrystudio:// one-click import deep link
 * UI-configured apps (Cursor / Trae / WorkBuddy / cc-switch) cannot be safely
 * written from outside — `--guides` prints exact values to paste.
 *
 * Then verifies the key with a live GET /v1/models call. Idempotent — run it
 * again with a new key to rotate. Every file it touches is listed in the
 * output, and existing settings outside our markers/blocks are left alone.
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

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function commandExists(cmd) {
  try {
    require("child_process").execSync(`command -v ${cmd}`, { stdio: "ignore", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

/** 把内容写进 shell profile 的 cradler 标记块(重跑整块替换)。 */
function writeShellBlock(lines) {
  const block = `${MARK_BEGIN}\n${lines.join("\n")}\n${MARK_END}`;
  const profiles = [".zshrc", ".bashrc"]
    .map((f) => path.join(home, f))
    .filter((f) => readIfExists(f) !== null);
  if (profiles.length === 0) profiles.push(path.join(home, ".zshrc"));
  for (const profile of profiles) {
    let text = readIfExists(profile) || "";
    if (text.includes(MARK_BEGIN)) {
      text = text.replace(new RegExp(`${MARK_BEGIN}[\\s\\S]*?${MARK_END}`), block);
    } else {
      text = text.trimEnd() + (text.trim() ? "\n\n" : "") + block + "\n";
    }
    writeFile(profile, text);
  }
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

  // The provider block reads the key from CRADLER_ROUTER_KEY — persisted via
  // the shared shell marker block (written once in main, with ZCode vars).
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

/* ---------- OpenClaw: ~/.openclaw/openclaw.json(检测到才配)---------- */

function setupOpenClaw(key) {
  const dir = path.join(home, ".openclaw");
  if (!exists(dir)) return false;
  const file = path.join(dir, "openclaw.json");
  let cfg = {};
  const raw = readIfExists(file);
  if (raw) {
    try {
      cfg = JSON.parse(raw);
    } catch {
      notes.push(`skipped OpenClaw: ${file} is not plain JSON (comments?) — add the provider by hand, see --guides`);
      return true;
    }
  }
  cfg.models = cfg.models || {};
  cfg.models.mode = cfg.models.mode || "merge";
  cfg.models.providers = cfg.models.providers || {};
  cfg.models.providers["cradler"] = {
    baseUrl: `${BASE}/v1`,
    apiKey: key,
    api: "openai-completions",
    models: [
      { id: "gpt-5.5", name: "GPT-5.5 (Cradler)" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini (Cradler)" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro (Cradler)" },
    ],
  };
  cfg.models.providers["cradler-claude"] = {
    baseUrl: BASE,
    apiKey: key,
    api: "anthropic-messages",
    models: [
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Cradler)" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8 (Cradler)" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (Cradler)" },
    ],
  };
  writeFile(file, JSON.stringify(cfg, null, 2) + "\n");
  notes.push("OpenClaw: pick e.g. cradler-claude/claude-sonnet-4-6 as your model");
  return true;
}

/* ---------- ZCode: shell 环境变量(检测到才配)---------- */

function zcodeInstalled() {
  return commandExists("zcode") || exists(path.join(home, ".zcode"));
}

function zcodeLines(key) {
  return [
    'export ZCODE_PROVIDER="openai-compatible"',
    'export ZCODE_OPENAI_PROVIDER="cradler"',
    'export ZCODE_OPENAI_MODEL="glm-5.2"',
    `export ZCODE_OPENAI_BASE_URL="${BASE}/v1"`,
    `export ZCODE_OPENAI_API_KEY="${key}"`,
  ];
}

/* ---------- Cherry Studio:官方一键导入深链(检测到才弹)---------- */

function cherryDeepLink(key) {
  const cfg = {
    id: "cradler-router",
    baseUrl: `${BASE}/v1`,
    apiKey: key,
    name: "Cradler Router",
    type: "openai",
  };
  // Cherry Studio 的还原映射是 _→+ 、-→/(与标准 base64url 相反!),
  // 所以要用标准 base64 再按它的约定替换,详见其 providersImport.ts。
  const data = Buffer.from(JSON.stringify(cfg))
    .toString("base64")
    .replaceAll("+", "_")
    .replaceAll("/", "-")
    .replace(/=+$/, "");
  return `cherrystudio://providers/api-keys?v=1&data=${data}`;
}

function cherryInstalled() {
  if (process.platform === "darwin") return exists("/Applications/Cherry Studio.app");
  return commandExists("cherrystudio") || commandExists("cherry-studio");
}

function openCherry(link) {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    require("child_process").execSync(`${opener} "${link}"`, { stdio: "ignore" });
    notes.push("Cherry Studio: confirm the imported \"Cradler Router\" provider in the window that just opened");
    return true;
  } catch {
    return false;
  }
}

/* ---------- UI 应用引导(改不了它们的内部设置,给可粘贴的值)---------- */

function printGuides(key) {
  const k = key || "sk-cr-…";
  log(`
UI-configured apps — paste these values:

■ Cursor  (Settings → Models → API Keys)
    Override OpenAI Base URL:  ${BASE}/v1
    OpenAI API Key:            ${k}
    Add models:                gpt-5.5, gpt-5.4-mini, deepseek-v4-pro, glm-5.2
    Note: Cursor's override speaks the OpenAI protocol only — Claude/Gemini
    model names will not verify there; use GPT/DeepSeek/GLM/Kimi IDs.

■ Trae  (Settings → Models → Add custom model, OpenAI-compatible)
    Base URL:   ${BASE}/v1
    API Key:    ${k}
    Model IDs:  gpt-5.5, deepseek-v4-pro, glm-5.2, kimi-k3

■ WorkBuddy / CodeBuddy  (model picker → Configure custom models)
    URL:        ${BASE}/v1
    API Key:    ${k}
    Model name: deepseek-v4-pro (or any /v1/models ID)

■ cc-switch  (Add provider → Custom)
    Claude Code preset:  base URL ${BASE}, token ${k}
    Codex preset:        base URL ${BASE}/v1, wire_api responses, key ${k}

■ Cherry Studio (if it did not auto-open)
    Settings → Model provider → Add → OpenAI type
    API URL: ${BASE}/v1   ·   API Key: ${k}

Full docs: https://cradler.ai/router/api`);
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
    log("Usage: npx @cradler/router-setup <sk-cr-your-key> [--guides] [--cherry]");
    log("  --guides   print copy-paste values for Cursor / Trae / WorkBuddy / cc-switch");
    log("  --cherry   open the Cherry Studio one-click import even if not auto-detected");
    log("Get a key: https://cradler.ai/dashboard/router");
    return;
  }
  if (args.includes("--guides") && !args.some((a) => !a.startsWith("-"))) {
    printGuides("");
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

  // 共享 shell 标记块:Codex 的 key,外加检测到 ZCode 时它的一组变量。
  const shellLines = [`export CRADLER_ROUTER_KEY="${key}"`];
  const hasZcode = zcodeInstalled();
  if (hasZcode) shellLines.push(...zcodeLines(key));
  writeShellBlock(shellLines);

  const hasOpenClaw = setupOpenClaw(key);
  let cherryOpened = false;
  if (cherryInstalled() || args.includes("--cherry")) {
    cherryOpened = openCherry(cherryDeepLink(key));
  }

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
    if (hasOpenClaw) log("  openclaw        # OpenClaw (providers cradler / cradler-claude)");
    if (hasZcode) log("  zcode           # ZCode (new terminal first)");
    if (cherryOpened) log("  Cherry Studio   # confirm the import prompt");
    if (args.includes("--guides")) {
      printGuides(key);
    } else {
      log("\nUsing Cursor / Trae / WorkBuddy / cc-switch? Run again with --guides for paste-in values.");
    }
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
