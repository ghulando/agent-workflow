# Configuration

## Project and personal settings

The project file is `.agent-workflow.json` at the Git repository root. A configuration in a subdirectory of a Git repository is ignored and protected; the enclosing repository's file applies. Personal preferences live in `~/.config/agent-workflow/personal.json`; `AGENT_WORKFLOW_HOME` can select another directory. Repository workflow settings override personal settings. Reviewer entries merge by provider; read-command lists are additive.

Start from [examples/project.json](../examples/project.json), or use `setup` to inspect your project. The example gate is for a Node project: replace it for other stacks. Neither installation nor setup runs detected checks or installs application toolchains.

Without configuration, hooks protect `main` and `master` and discover `.agents/skills`. There is no default gate or reviewer, so managed completion is unavailable until configured.

| Setting | Purpose |
| --- | --- |
| `version` | Configuration schema version; use `1`. |
| `protectedBranches` | Branches where agent implementation is denied. |
| `taskFiles` | Patterns identifying managed task Markdown. |
| `doneMarker` | Completion text; default `**Status:** done.`. Bare custom text is rendered after `**Status:**`. |
| `gate` | Executable/argument array for all project checks. |
| `review` | Optional project review wrapper; see [Review wrapper](#review-wrapper). |
| `skillRoots` | Directories containing `<name>/SKILL.md`. |
| `requiredSkills` | Skill names whose complete instructions are supplied at startup. |
| `readCommands` | Command prefixes or typed option rules trusted as reads on protected branches and in plan mode. |
| `readOnlyTools` | Host tool names or `*` patterns that do not modify project files. MCP tools (`mcp__*`) are left to the host's own permissions. |
| `extensions` | Repository JavaScript modules exporting `pre` and/or `post`. |
| `workflow` | Task, branch, review, and shell-approval preferences. |

Unknown keys, invalid inputs, and unreadable state fail closed. Patterns support `*` within a segment and `**` across segments. File-tool edits to Git metadata, workflow configuration, adapter configuration, and configured local gate/review/extension entrypoints ask first.

## Workflow settings

| Setting | Default |
| --- | --- |
| `taskDirectory` | `docs/tasks` |
| `baseBranch` | `main` |
| `featurePrefix`, `fixPrefix` | `feature/`, `fix/` |
| `requireReview` | `true` |
| `reviewers` | `{}`; choose providers explicitly |
| `reviewTimeout` | `900` seconds; range 1–3600 |
| `reviewContext`, `reviewExclude` | Empty pattern lists |
| `reviewExceptions` | Empty object; see [Review exceptions](#review-exceptions) |

Configure only reviewers you can run; each one is a CLI subprocess on your machine. Empty Claude and Codex objects use the harness's default model. Ollama needs an explicit model.

```json
{
  "workflow": {
    "reviewers": {
      "claude": {},
      "codex": {},
      "ollama": {"model": "your-installed-model"}
    }
  }
}
```

| Task author | Eligible reviewers |
| --- | --- |
| Pi | Claude or Codex |
| Codex | Claude or Ollama |
| Claude | Codex or Ollama |

`doctor --author codex` checks this before you start. Two harnesses can run the same model family, so a different harness does not guarantee a different model. `requireReview: false` turns off the review requirement; the gate is still required.

### Review wrapper

`review` is a one-element array naming an executable inside the repository, for example `["scripts/review.sh"]`. The guard recognizes it only when invoked from the project root exactly as `REVIEW_GATE_SESSION=<session key> scripts/review.sh <task-file> <author> <reviewer> [round]`, with `claude`, `codex` or `ollama` as reviewer and a round from 1 to 10. The wrapper must call the runner's `review` command itself; the recognition lets it run on protected branches. Edits to the file ask first.

### Review exceptions

Each task gets two recorded rounds. To allow more for one task, add an entry keyed by its repository-relative task file:

```json
{"workflow": {"reviewExceptions": {"docs/tasks/login.md": {"maxRound": 4, "reason": "Reviewer timed out twice; approved by the maintainer"}}}}
```

`maxRound` must be 3 to 10 and `reason` must be nonempty. The reason is recorded with every extra round.

Ollama may use `transport: "pi"` to run through Pi with tools, extensions, skills and context discovery turned off. `reviewContext` adds unchanged files the reviewer needs to understand a change. `reviewExclude` leaves generated files out of the review snapshot but keeps them in the fingerprint; the reviewer cannot accept what it never saw.

## Read commands

On protected branches and in plan or review mode only reads run; anything else is denied, because a script can write files even when its name sounds like a reader. On feature branches the guard does not classify commands at all.

Trust a fixed prefix with positional operands:

```json
{"readCommands": [["inspect", "list"]]}
```

Extra flags after that prefix are rejected. For variable options, describe exactly what the executable accepts:

```json
{
  "readCommands": [{
    "prefix": ["inspect", "read"],
    "options": {"--lines": "positiveInteger", "--source": "string", "--quiet": "flag"},
    "positionals": {"min": 1, "max": 1}
  }]
}
```

Typed values are separate arguments. Unknown options, abbreviations, combined short flags, and `--name=value` are rejected. Configured entries reject `--` unless it is explicitly part of the reviewed prefix; programs may forward the following arguments. Trust only executables whose option semantics you understand. Personal rules apply in every repository.

For an existing graphify graph, add these typed entries to your personal `readCommands` in `~/.config/agent-workflow/personal.json`:

```json
{
  "readCommands": [
    {
      "prefix": ["graphify", "query"],
      "options": {"--budget": "positiveInteger", "--dfs": "flag"},
      "positionals": {"min": 1, "max": 1}
    },
    {
      "prefix": ["graphify", "explain"],
      "options": {},
      "positionals": {"min": 1, "max": 1}
    },
    {
      "prefix": ["graphify", "path"],
      "options": {},
      "positionals": {"min": 2, "max": 2}
    },
    {
      "prefix": ["graphify", "affected"],
      "options": {"--depth": "positiveInteger"},
      "positionals": {"min": 1, "max": 1}
    }
  ]
}
```

These entries authorize reads only; the workflow never builds, updates or installs graphify. Add `graphify-out/` to the consuming repository's `.gitignore`.

The built-in classifier also accepts pipes between readers and discard redirections such as `2>/dev/null`. Variables, `$(...)`, backticks, output files and loops make a command unclassifiable. Globs need a literal directory prefix. `git -C` is a read only when it names the project root by absolute path. A `cd` before a read must stay inside the project, and Git reads from inside a nested repository are not reads, because another repository can supply executable Git configuration. `--help` and `--version` are reads only for the built-in readers and `git`, `rg`, `grep`, `find`, `sed`, `jq`, `node`, `npm` and `herdr`.

Older configurations may still contain `protectedPaths` or `workflow.shellApproval`. Both are accepted and ignored. Shell commands on feature branches never ask, except commit, merge, push and commands containing `publish`, `push`, `deploy`, `release` or `upload`. The check reads command text, so it catches ordinary spellings, including `/usr/bin/git`, Git global options, chains, line continuations and `sh -c` scripts, but not every way a shell can hide a command, such as one built in a variable or run from a script file. Shell commands can still write protected files. The hooks are workflow guardrails, not an OS security boundary, so use the harness sandbox when you need enforcement.

## Task workspace

Each task gets a private folder for team files outside the repository: `~/.agent-workflow/<repository folder name>/<task id>/`, or under `AGENT_WORKFLOW_WORKSPACE` when set. `task-start`, `task-resume` and `task-handoff` create it with mode 0700 and print it; an existing task folder that is a symlink or readable by others is refused. A `.repo` file records the owning repository; a second repository with the same folder name gets an error instead of sharing it.

Briefs, reports and findings go there, never into a harness's own scratch directory. Name every file `<writer>-<topic>.md`, where the writer is `claude`, `codex` or `pi`, for example `claude-brief-codex.md` or `pi-findings-1.md`. The guard denies a file-tool write or Codex patch to a workspace file whose name starts with another writer's prefix, and rejects a patch that mixes workspace and repository files. Anyone may read every file. Shell commands that write there are not ownership-checked. Recorded reviews add `<reviewer>-review-round<N>.md`. The task note itself stays in the repository.

Claude Code and Codex may still prompt for writes outside the project. `install-user` prints the settings to add yourself: the workspace path in `permissions.additionalDirectories` for Claude, and in `writable_roots` under `[sandbox_workspace_write]` for Codex.

## Project-local installation

From the standalone package checkout, preview and then install into an application:

```sh
node bin/workflow.ts install-plan /path/to/app
node bin/workflow.ts install /path/to/app
```

The package is copied into `plugins/agent-workflow` when outside the application. New settings and instruction files are created with private permissions (0600); existing file modes are preserved. Settings are merged; existing plugins, hooks, permissions, and model choices are retained. Conflicting registrations fail before writes. Native registration/restart/trust is still required. Choose project-local or personal installation for each harness to avoid duplicate guards.

Repair a reviewed vendored copy explicitly:

```sh
node bin/workflow.ts install-plan /path/to/app --repair
node bin/workflow.ts install /path/to/app --repair
```

Package and settings changes are staged first and rolled back on a reported IO failure; if rollback itself fails, the backups stay and the command reports an error. A crash mid-install can leave staging or backup directories behind, so inspect them before deleting.

## Extensions

An extension may export `pre({root, config, action})`, returning a denial reason, and `post({root, config, action})`, returning feedback. Either can be async. File actions include `{path, before, after}` previews; deletion has `after: null`. Shell actions include command and working directory.

Extensions are trusted project code. Post hooks cannot undo a tool's side effects. Place language-specific formatters and structural checks here rather than in the shared engine.
