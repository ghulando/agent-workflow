# Agent Workflow

One development workflow for Claude Code, Codex and Pi. Agents plan on a feature or fix branch, keep task notes under `docs/tasks/`, run your project's gate and get an independent review before a task is marked done. Hooks block work on protected branches, ask before commit, merge, push and publish, and refuse a done marker until the gate and review have passed on the current tree. Everything else runs under the harness's own permissions.

The repository ships TypeScript only. Node runs it directly, so installing needs no build step and no `npm install`.

## Before you start

You need Node 22.18 or newer, Git, a POSIX shell, and the CLI of each harness you want to use. Check Node first, because an older Node cannot run the hooks and every tool call will be refused:

```sh
node --version   # must print v22.18.0 or newer
git --version
```

## Install

Install in whichever harnesses you use. Each one installs straight from GitHub.

The install script does this for every harness it finds on your `PATH`, and running it again updates them:

```sh
curl -fsSL https://raw.githubusercontent.com/ghulando/agent-workflow/main/scripts/install.sh | sh
```

It also removes an install under the old marketplace name. Then follow "After installing". The sections below are the same steps by hand.

### Claude Code

```sh
claude plugin marketplace add ghulando/agent-workflow
claude plugin install agent-workflow@ghulando
```

The first command registers this repository as a plugin marketplace named `ghulando`. The second installs the plugin from it.

### Codex

```sh
codex plugin marketplace add ghulando/agent-workflow
codex plugin add agent-workflow@ghulando
```

Codex reads the same marketplace file as Claude Code, so the marketplace has the same name.

### Pi

```sh
pi install git:github.com/ghulando/agent-workflow
```

Pi needs no marketplace. It loads the package's extension and skills directly.

### After installing

1. Restart every open Claude Code, Codex and Pi session. A running session keeps its old hooks.
2. Approve the hook trust prompt in Claude Code and Codex when it appears.
3. Make the task workspace writable. Team briefs and reviews go to `~/.agent-workflow`, outside your projects. Add its absolute path to `~/.claude/settings.json`:

   ```json
   { "permissions": { "additionalDirectories": ["/Users/you/.agent-workflow"] } }
   ```

   and to `~/.codex/config.toml`:

   ```toml
   [sandbox_workspace_write]
   writable_roots = ["/Users/you/.agent-workflow"]
   ```

   Merge these into any settings you already have, and replace `/Users/you` with your home directory.
4. Optionally create `~/.config/agent-workflow/personal.json` for personal reviewers and read commands, as described in [configuration](docs/configuration.md).

Start a new session to check the install. A working install shows "Agent workflow is active" in the startup context.

### Enable it in a project

Run `flow-setup` in the project. The [flow diagram](docs/flow.md) shows the whole process. [Usage](docs/usage.md) explains solo runs, Herdr team runs and what the engine enforces.

## Update

Run the install script again, or by hand:

```sh
claude plugin marketplace update ghulando
claude plugin uninstall agent-workflow@ghulando
claude plugin install agent-workflow@ghulando

codex plugin marketplace upgrade ghulando
codex plugin remove agent-workflow@ghulando
codex plugin add agent-workflow@ghulando

pi update --extension git:github.com/ghulando/agent-workflow
```

The first command for each harness fetches the latest `main`. Claude Code and Codex cache plugins by version, so the uninstall and reinstall pick up new code even when the version number has not changed. Restart each harness afterwards, and approve hook trust again if it asks.

### Moving from the old marketplace name

The marketplace used to be called `agent-workflow-local`. An install under that name stays enabled next to the new one, and the guard then runs twice. The install script removes it for you. By hand, remove the old install once, then install as described above:

```sh
claude plugin uninstall agent-workflow@agent-workflow-local
claude plugin marketplace remove agent-workflow-local

codex plugin remove agent-workflow@agent-workflow-local
codex plugin marketplace remove agent-workflow-local
```

A project that enabled the plugin in its own `.claude/settings.json` needs `claude plugin uninstall agent-workflow@agent-workflow-local --scope project`, run in that project. Codex keeps hook trust per plugin name, so it asks for trust again.

## Install from a local clone

Use this to run your own changes. It copies the package to `~/.config/agent-workflow/package` and installs every harness from there. Do not combine it with the GitHub install: both use the marketplace name `ghulando`, so remove the GitHub install first.

```sh
node bin/workflow.ts install-user
node bin/workflow.ts install-user --apply

claude plugin marketplace add ~/.config/agent-workflow/package
claude plugin install agent-workflow@ghulando

codex plugin marketplace add ~/.config/agent-workflow
codex plugin add agent-workflow@ghulando
```

`install-user` previews the changes and `--apply` writes them. It registers the package with Pi in `~/.pi/agent/settings.json`, creates `personal.json` and prints the workspace settings from step 3 above. Then follow "After installing".

To update a local install:

```sh
git pull

node bin/workflow.ts install-user --repair
node bin/workflow.ts install-user --repair --apply

claude plugin uninstall agent-workflow@ghulando
claude plugin install agent-workflow@ghulando

codex plugin remove agent-workflow@ghulando
codex plugin add agent-workflow@ghulando
```

`--repair` refreshes the package even when the version has not changed.
