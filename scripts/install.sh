#!/bin/sh
# Install or update Halvard from GitHub in every harness found on PATH.
# Run it again to update. It also removes an install under the earlier
# agent-workflow name, which would otherwise run the guard twice.

set -e

repo=ghulando/halvard
market=ghulando
plugin=halvard
pi_source=git:github.com/$repo
# The earlier agent-workflow plugin, under this marketplace or its own old one.
old_market=agent-workflow-local
old_ids="agent-workflow@$market agent-workflow@$old_market"
old_pi=git:github.com/ghulando/agent-workflow

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`Node ${process.versions.node} is too old; Halvard needs 22.18 or newer.`);
  process.exit(1);
}'

# has <json> <expression>: true when the expression, applied to the parsed JSON as j, is truthy.
has() {
  printf '%s' "$1" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  const j = JSON.parse(raw);
  process.exit(eval(process.argv[1]) ? 0 : 1);
});' "$2"
}

# A predicate called from an if cannot stop the script, so check the shape first.
expect() {
  has "$1" "$2" || {
    echo "Unexpected output from $3; nothing was changed for this harness." >&2
    exit 1
  }
}

if command -v claude > /dev/null; then
  echo "Claude Code"
  markets=$(claude plugin marketplace list --json)
  plugins=$(claude plugin list --json)
  expect "$markets" "Array.isArray(j) && j.every((m) => typeof m?.name === 'string')" "claude plugin marketplace list"
  expect "$plugins" "Array.isArray(j) && j.every((p) => typeof p?.id === 'string' && typeof p.scope === 'string')" "claude plugin list"
  for id in $old_ids; do
    if has "$plugins" "j.some((p) => p.id === '$id' && p.scope === 'user')"; then
      claude plugin uninstall "$id"
    fi
  done
  if has "$markets" "j.some((m) => m.name === '$old_market')"; then
    claude plugin marketplace remove "$old_market"
  fi
  if has "$markets" "j.some((m) => m.name === '$market')"; then
    claude plugin marketplace update "$market"
  else
    claude plugin marketplace add "$repo"
  fi
  if has "$plugins" "j.some((p) => p.id === '$plugin@$market' && p.scope === 'user')"; then
    claude plugin uninstall "$plugin@$market"
  fi
  claude plugin install "$plugin@$market"
  for id in $old_ids; do
    if has "$plugins" "j.some((p) => p.id === '$id' && p.scope === 'project')"; then
      echo "Projects still enable $id. In each one run: claude plugin uninstall $id --scope project"
    fi
  done
fi

if command -v codex > /dev/null; then
  echo "Codex"
  markets=$(codex plugin marketplace list --json)
  plugins=$(codex plugin list --json)
  expect "$markets" "Array.isArray(j.marketplaces) && j.marketplaces.every((m) => typeof m?.name === 'string')" "codex plugin marketplace list"
  expect "$plugins" "Array.isArray(j.installed) && j.installed.every((p) => typeof p?.pluginId === 'string')" "codex plugin list"
  for id in $old_ids; do
    if has "$plugins" "j.installed.some((p) => p.pluginId === '$id')"; then
      codex plugin remove "$id"
    fi
  done
  if has "$markets" "j.marketplaces.some((m) => m.name === '$old_market')"; then
    codex plugin marketplace remove "$old_market"
  fi
  if has "$markets" "j.marketplaces.some((m) => m.name === '$market')"; then
    codex plugin marketplace upgrade "$market"
  else
    codex plugin marketplace add "$repo"
  fi
  if has "$plugins" "j.installed.some((p) => p.pluginId === '$plugin@$market')"; then
    codex plugin remove "$plugin@$market"
  fi
  codex plugin add "$plugin@$market"
fi

if command -v pi > /dev/null; then
  echo "Pi"
  packages=$(pi list)
  if printf '%s\n' "$packages" | grep -qxF "  $old_pi"; then
    pi remove "$old_pi"
  fi
  if printf '%s\n' "$packages" | grep -qxF "  $pi_source"; then
    pi update "$pi_source"
  else
    pi install "$pi_source"
  fi
fi

# Grok's plugin list shape: an array, or one under plugins or installed.
grok_plugins='(Array.isArray(j) ? j : j.plugins ?? j.installed)'

if command -v grok > /dev/null; then
  echo "Grok"
  plugins=$(grok plugin list --json)
  expect "$plugins" "Array.isArray($grok_plugins) && $grok_plugins.every((p) => typeof (p?.name ?? p?.id) === 'string')" "grok plugin list"
  grok plugin marketplace update "$market" || grok plugin marketplace add "$repo"
  if has "$plugins" "$grok_plugins.some((p) => (p.name ?? p.id) === '$plugin' || (p.name ?? p.id) === '$plugin@$market')"; then
    grok plugin update "$plugin"
  else
    # Installing a Grok plugin grants it hook trust, which stays your decision.
    grok_trust="  grok plugin install $plugin --trust"
  fi
fi

if command -v cursor-agent > /dev/null; then
  echo "Cursor"
  command -v git > /dev/null || {
    echo "Git is required to install Halvard for Cursor." >&2
    exit 1
  }
  cursor_root=${HALVARD_HOME:-$HOME/.config/halvard}/cursor
  if [ -d "$cursor_root/.git" ]; then
    git -C "$cursor_root" pull --ff-only --quiet
  else
    mkdir -p "$(dirname "$cursor_root")"
    git clone --quiet --depth 1 "https://github.com/$repo.git" "$cursor_root"
  fi
  cursor_dir=${CURSOR_CONFIG_DIR:-$HOME/.cursor}
  # Cursor has no CLI plugins: merge Halvard's entries into the user hooks file and
  # link the skills. Entries from an earlier install are replaced, others are kept.
  node -e '
const fs = require("node:fs");
const path = require("node:path");
const [root, dir] = process.argv.slice(1);
if (/["$`\\]/.test(root)) throw new Error(`unsupported characters in ${root}`);
const ours = (entry) =>
  typeof entry?.command === "string" && entry.command.includes("/bin/hook.ts\"") && entry.command.includes("\"$f\" cursor");
const template = JSON.parse(fs.readFileSync(path.join(root, "hooks/cursor.json"), "utf8"));
const file = path.join(dir, "hooks.json");
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { version: 1, hooks: {} };
if (!config || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
  throw new Error(`unexpected shape in ${file}; nothing was changed for Cursor`);
}
if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.halvard.bak`);
for (const [event, entries] of Object.entries(config.hooks)) {
  if (Array.isArray(entries)) config.hooks[event] = entries.filter((entry) => !ours(entry));
}
for (const [event, entries] of Object.entries(template.hooks)) {
  config.hooks[event] = [
    ...(config.hooks[event] ?? []),
    ...entries.map((entry) => ({ ...entry, command: entry.command.replaceAll("${HALVARD_ROOT}", root) })),
  ];
}
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
const skills = path.join(dir, "skills");
fs.mkdirSync(skills, { recursive: true });
for (const name of fs.readdirSync(path.join(root, "skills"))) {
  const link = path.join(skills, name);
  const target = path.join(root, "skills", name);
  const stat = fs.lstatSync(link, { throwIfNoEntry: false });
  if (stat && !stat.isSymbolicLink()) {
    console.log(`  kept your own ${link}; Halvard did not link its ${name} skill`);
    continue;
  }
  if (stat) fs.rmSync(link);
  fs.symlinkSync(target, link);
}
' "$cursor_root" "$cursor_dir"
fi

workspace=${HALVARD_WORKSPACE:-$HOME/.halvard}
cat << EOF

Done. Restart every open Claude Code, Codex, Pi, Grok and Cursor session, and approve hook trust when asked.
If you have not yet, make the task workspace writable:
  ~/.claude/settings.json  permissions.additionalDirectories: ["$workspace"]
  ~/.codex/config.toml     [sandbox_workspace_write] writable_roots = ["$workspace"]
EOF
if [ -n "${grok_trust-}" ]; then
  printf '\nGrok installs a plugin only with hook trust. Review Halvard, then run:\n%s\n' "$grok_trust"
fi
