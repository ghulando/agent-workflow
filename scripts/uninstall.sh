#!/bin/sh
# Remove agent-workflow from every harness found on PATH, under both the current
# ghulando and the old agent-workflow-local marketplace names, with its caches
# and workflow state. Settings files are backed up before anything changes.
#
#   sh uninstall.sh           keep personal.json and the task workspace
#   sh uninstall.sh --purge   also remove them and the workspace permission entries

set -e

purge=
case "$#:${1-}" in
  0:) ;;
  1:--purge) purge=1 ;;
  *)
    echo "usage: uninstall.sh [--purge]" >&2
    exit 2
    ;;
esac

command -v node > /dev/null || {
  echo "Node is required to edit harness settings." >&2
  exit 1
}

home=${HOME:?HOME is not set}
plugin=agent-workflow
markets="ghulando agent-workflow-local"
pi_source=git:github.com/ghulando/agent-workflow
claude_dir=${CLAUDE_CONFIG_DIR:-$home/.claude}
codex_dir=${CODEX_HOME:-$home/.codex}
pi_dir=${PI_CODING_AGENT_DIR:-$home/.pi/agent}
personal=${AGENT_WORKFLOW_HOME:-$home/.config/agent-workflow}
workspace=${AGENT_WORKFLOW_WORKSPACE:-$home/.agent-workflow}

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

# Harness CLIs edit these files too, so copy them before any command runs.
for file in "$claude_dir/settings.json" "$codex_dir/config.toml"; do
  if [ -f "$file" ]; then
    cp "$file" "$file.agent-workflow.bak"
    echo "Backed up $file to $file.agent-workflow.bak"
  fi
done

if command -v claude > /dev/null; then
  echo "Claude Code"
  list=$(claude plugin marketplace list --json)
  plugins=$(claude plugin list --json)
  expect "$list" "Array.isArray(j) && j.every((m) => typeof m?.name === 'string')" "claude plugin marketplace list"
  expect "$plugins" "Array.isArray(j) && j.every((p) => typeof p?.id === 'string' && typeof p.scope === 'string')" "claude plugin list"
  for market in $markets; do
    if has "$plugins" "j.some((p) => p.id === '$plugin@$market' && p.scope === 'user')"; then
      claude plugin uninstall "$plugin@$market"
    fi
    if has "$list" "j.some((m) => m.name === '$market')"; then
      claude plugin marketplace remove "$market"
    fi
    # Project-scope installs live in each project's own settings, which this script leaves alone.
    printf '%s' "$plugins" | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c)).on("end", () => {
  for (const p of JSON.parse(raw)) {
    if (p.id === process.argv[1] && p.scope !== "user" && p.projectPath) {
      console.log(`  ${p.projectPath} still enables ${p.id}; there run: claude plugin uninstall ${p.id} --scope ${p.scope}`);
    }
  }
});' "$plugin@$market"
  done
fi

if command -v codex > /dev/null; then
  echo "Codex"
  list=$(codex plugin marketplace list --json)
  plugins=$(codex plugin list --json)
  expect "$list" "Array.isArray(j.marketplaces) && j.marketplaces.every((m) => typeof m?.name === 'string')" "codex plugin marketplace list"
  expect "$plugins" "Array.isArray(j.installed) && j.installed.every((p) => typeof p?.pluginId === 'string')" "codex plugin list"
  for market in $markets; do
    if has "$plugins" "j.installed.some((p) => p.pluginId === '$plugin@$market')"; then
      codex plugin remove "$plugin@$market"
    fi
    if has "$list" "j.marketplaces.some((m) => m.name === '$market')"; then
      codex plugin marketplace remove "$market"
    fi
  done
fi

if command -v pi > /dev/null; then
  echo "Pi"
  packages=$(pi list)
  # A GitHub install, or the package copied by install-user.
  for source in "$pi_source" "$personal/package"; do
    if printf '%s\n' "$packages" | grep -qxF "  $source"; then
      pi remove "$source"
    fi
  done
fi

echo "Settings"
node -e '
const fs = require("node:fs");
const [claudeDir, codexDir, workspace, purge] = process.argv.slice(1);
const ids = ["agent-workflow@ghulando", "agent-workflow@agent-workflow-local"];
const markets = ["ghulando", "agent-workflow-local"];

function edit(path, change) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, "utf8");
  const after = change(before);
  if (after === before) return;
  fs.writeFileSync(path, after);
  console.log(`  edited ${path}`);
}

edit(`${claudeDir}/settings.json`, (text) => {
  const settings = JSON.parse(text);
  const original = JSON.stringify(settings);
  for (const id of ids) delete settings.enabledPlugins?.[id];
  for (const market of markets) delete settings.extraKnownMarketplaces?.[market];
  const dirs = settings.permissions?.additionalDirectories;
  if (purge && Array.isArray(dirs)) {
    settings.permissions.additionalDirectories = dirs.filter((dir) => dir !== workspace);
  }
  return JSON.stringify(settings) === original ? text : JSON.stringify(settings, null, 2) + "\n";
});

// Node has no TOML parser, so this splits on table header lines. A header may be
// indented, use either quote style and carry a trailing comment.
const header = /^[ \t]*\[\[?[^\]\n]*\]\]?[ \t]*(?:#[^\n]*)?$/m;
const tablesOf = (text) => text.split(/(?=^[ \t]*\[\[?[^\]\n]*\]\]?[ \t]*(?:#[^\n]*)?$)/m);
const keyOf = (table) => {
  const match = table.match(header);
  return match && table.startsWith(match[0]) ? match[0].replace(/#.*$/, "").replace(/["\x27\s]/g, "") : "";
};
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Removes the workspace from a writable_roots array, single- or multi-line.
function withoutWorkspace(table) {
  const start = table.search(/^[ \t]*writable_roots[ \t]*=[ \t]*\[/m);
  if (start < 0) return table;
  let i = table.indexOf("[", start) + 1;
  let depth = 1;
  while (i < table.length && depth) {
    const ch = table[i];
    if (ch === "\"") {
      for (i++; i < table.length && table[i] !== "\""; i += table[i] === "\\" ? 2 : 1);
    } else if (ch === "\x27") {
      i = table.indexOf("\x27", i + 1);
      if (i < 0) i = table.length;
    } else if (ch === "#") {
      i = table.indexOf("\n", i);
      if (i < 0) i = table.length;
      continue;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
    }
    i++;
  }
  const values = [JSON.stringify(workspace), `\x27${workspace}\x27`].map(escape).join("|");
  const array = table.slice(start, i).replace(new RegExp(`(?:${values})[ \\t]*,?[ \\t]*(?:#[^\\n]*)?`, "g"), "");
  return table.slice(0, start) + array + table.slice(i);
}

// Codex keeps hook trust per plugin id; drop those tables and the plugin and marketplace tables.
edit(`${codexDir}/config.toml`, (text) => {
  const owned = (key) =>
    ids.some((id) => key.startsWith(`[hooks.state.${id}:`) || key === `[plugins.${id}]`) ||
    markets.some((market) => key === `[marketplaces.${market}]`);
  return tablesOf(text)
    .filter((table) => !owned(keyOf(table)))
    .map((table) => (purge && keyOf(table) === "[sandbox_workspace_write]" ? withoutWorkspace(table) : table))
    .join("");
});
' "$claude_dir" "$codex_dir" "$workspace" "$purge"

echo "Files"
tmp=$(node -p 'require("node:os").tmpdir()')
remove() {
  if [ -e "$1" ]; then
    rm -rf "$1"
    echo "  removed $1"
  fi
}
for market in $markets; do
  remove "$claude_dir/plugins/cache/$market/$plugin"
  remove "$claude_dir/plugins/data/$plugin-$market"
  remove "$codex_dir/plugins/cache/$market/$plugin"
  remove "$codex_dir/.tmp/marketplaces/$market"
  for parent in "$claude_dir/plugins/cache/$market" "$codex_dir/plugins/cache/$market"; do
    if [ -d "$parent" ] && [ -z "$(ls -A "$parent")" ]; then
      rmdir "$parent"
    fi
  done
done
remove "$pi_dir/git/github.com/ghulando/agent-workflow"
remove "$personal/package"
remove "$personal/.agents"
remove "$tmp/agent-workflow-$(id -u)"
if [ -n "$purge" ]; then
  remove "$personal"
  remove "$workspace"
fi

cat << EOF

Done. Restart every open Claude Code, Codex and Pi session.
Repositories set up with "workflow.ts install <repo>" keep their own plugins/agent-workflow
copy and settings; remove those in each repository.
EOF
if [ -z "$purge" ]; then
  echo "Kept $personal/personal.json and $workspace; run with --purge to remove them too."
fi
