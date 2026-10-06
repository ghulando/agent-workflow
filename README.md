# Agent Workflow

One development workflow for Claude Code, Codex and Pi. Agents plan on a feature or fix branch, keep task notes under `docs/tasks/`, run your project's gate and get an independent review before a task is marked done. Hooks block work on protected branches, ask before edits to protected paths, and refuse a done marker until the gate has passed on the current tree.

Requires Node 22.16 or newer, Git and a POSIX shell.

## Install

From a clone of this repository:

```sh
npm ci --omit=peer
npm run build

node dist/bin/workflow.js install-user
node dist/bin/workflow.js install-user --apply

claude plugin install agent-workflow@agent-workflow-local

codex plugin add agent-workflow@agent-workflow-local
```

`install-user` previews the changes and `--apply` writes them. It copies the package to `~/.config/agent-workflow/package` and registers it with Pi, Claude Code and Codex. Pi loads that directory directly. Claude Code and Codex install from it as a plugin. Restart each harness and approve its hook trust prompt.

To enable the workflow in a project, run `setup` from that repository's root, as described in the [flow guide](docs/flow.md). [Usage](docs/usage.md) explains solo runs, Herdr team runs and what the engine enforces.

## Update

```sh
git pull
npm ci --omit=peer
npm run build

node dist/bin/workflow.js install-user --repair
node dist/bin/workflow.js install-user --repair --apply

claude plugin uninstall agent-workflow@agent-workflow-local
claude plugin install agent-workflow@agent-workflow-local

codex plugin remove agent-workflow@agent-workflow-local
codex plugin add agent-workflow@agent-workflow-local
```

`--repair` refreshes the package even when the version has not changed. Claude Code and Codex cache plugins by version, so a reinstall picks up the new copy where a plain update would not. Restart each harness and approve hook trust again if it asks.
