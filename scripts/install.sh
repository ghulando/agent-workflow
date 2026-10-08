#!/bin/sh
# Install or update agent-workflow from GitHub in every harness found on PATH.
# Run it again to update. It also removes an install under the old
# agent-workflow-local marketplace name, which would otherwise run the guard twice.

set -e

repo=ghulando/agent-workflow
market=ghulando
old=agent-workflow-local
plugin=agent-workflow
pi_source=git:github.com/$repo

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`Node ${process.versions.node} is too old; agent-workflow needs 22.18 or newer.`);
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
  if has "$plugins" "j.some((p) => p.id === '$plugin@$old' && p.scope === 'user')"; then
    claude plugin uninstall "$plugin@$old"
  fi
  if has "$markets" "j.some((m) => m.name === '$old')"; then
    claude plugin marketplace remove "$old"
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
  if has "$plugins" "j.some((p) => p.id === '$plugin@$old' && p.scope === 'project')"; then
    echo "Projects still enable $plugin@$old. In each one run: claude plugin uninstall $plugin@$old --scope project"
  fi
fi

if command -v codex > /dev/null; then
  echo "Codex"
  markets=$(codex plugin marketplace list --json)
  plugins=$(codex plugin list --json)
  expect "$markets" "Array.isArray(j.marketplaces) && j.marketplaces.every((m) => typeof m?.name === 'string')" "codex plugin marketplace list"
  expect "$plugins" "Array.isArray(j.installed) && j.installed.every((p) => typeof p?.pluginId === 'string')" "codex plugin list"
  if has "$plugins" "j.installed.some((p) => p.pluginId === '$plugin@$old')"; then
    codex plugin remove "$plugin@$old"
  fi
  if has "$markets" "j.marketplaces.some((m) => m.name === '$old')"; then
    codex plugin marketplace remove "$old"
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
  if printf '%s\n' "$packages" | grep -qxF "  $pi_source"; then
    pi update "$pi_source"
  else
    pi install "$pi_source"
  fi
fi

workspace=${AGENT_WORKFLOW_WORKSPACE:-$HOME/.agent-workflow}
cat << EOF

Done. Restart every open Claude Code, Codex and Pi session, and approve hook trust when asked.
If you have not yet, make the task workspace writable:
  ~/.claude/settings.json  permissions.additionalDirectories: ["$workspace"]
  ~/.codex/config.toml     [sandbox_workspace_write] writable_roots = ["$workspace"]
EOF
