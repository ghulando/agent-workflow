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

workspace=${HALVARD_WORKSPACE:-$HOME/.halvard}
cat << EOF

Done. Restart every open Claude Code, Codex and Pi session, and approve hook trust when asked.
If you have not yet, make the task workspace writable:
  ~/.claude/settings.json  permissions.additionalDirectories: ["$workspace"]
  ~/.codex/config.toml     [sandbox_workspace_write] writable_roots = ["$workspace"]
EOF
