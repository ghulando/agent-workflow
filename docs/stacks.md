# Stack records

A stack record holds a team's decisions for one kind of repository: the architecture, the libraries, the naming, the test style and the gate. `flow-bootstrap` reads the records, asks only what a record leaves open, and turns the answers into the repository's own `AGENTS.md` section and skills. The workflow engine knows no stack; everything stack-specific lives in the records and, after bootstrap, in the repository.

## Where records live

Records are plain Markdown, one directory per stack, in a Git checkout. This repository keeps its records in `stacks/`, which `npm pack` does not ship, so the installed plugin carries no stack opinions. Point the workflow at the checkout with the `stacks` workflow setting, usually in personal configuration:

```json
{ "stacks": "~/projects/agent-workflow/stacks" }
```

Any other checkout of records works the same way. The engine reads the directory and never fetches it. Point the setting at a working checkout rather than an installed copy, because a new record written during bootstrap lands there for you to review and commit. Without the setting, bootstrap still runs and asks every question.

## Format

Each stack is `<stack>/stack.md`, where the directory name is the stack name: lowercase letters, digits and hyphens. The file starts with a level-one title, then a `Kind: backend` or `Kind: frontend` line, then these level-two headings and no others, each once. They may appear in any order; bootstrap asks a new record's decisions in table order.

| Heading | Holds |
| --- | --- |
| `Summary` | One or two sentences on what the stack is for. |
| `Architecture` | Layers or modules, project layout and dependency direction. |
| `Libraries` | The framework and the libraries the team chose, each with what it is for. |
| `Data` | Persistence, migrations and naming in storage; for a frontend, state and data fetching. |
| `Messaging` | Events, queues and background work. |
| `Errors` | The error model across layers and at the boundary. |
| `Naming` | File, type, member and test naming. |
| `Testing` | Runner, mocking style, test layers and what each covers. |
| `Gate` | Commands that must pass, one `- <purpose>: <command>` line each, such as `- test: go test ./...`. The purpose has no colon. Arguments split on spaces; quoting and shell syntax are not supported. |
| `Open choices` | Decisions left to each repository, one `- <choice>: <options> (default <option>)` line each, where the choice name is lowercase letters, digits and hyphens. |
| `Concerns` | The skills bootstrap generates, one `- <name> (always-on|on-demand): <when it applies>` line each. |

A heading that does not apply says `None.`, except Concerns, which lists at least one skill. Gate, Open choices and Concerns hold only their list lines; put notes about them under another heading. A record may also hold `<stack>/skills/<concern>.md`, a short template bootstrap follows for that concern where exact wording matters.

## What belongs in a record

A line belongs in a record only if two good engineers could disagree on it. "Handlers return `Result<T>` instead of throwing" belongs; "handle errors" does not. Bootstrap writes idiomatic code guidance from its own knowledge and the record supplies the choices it must follow, so a record stays near a page. A record never names a harness, hook, agent or plugin, because the skills it produces must load the same way in Claude Code, Codex and Pi.

## What bootstrap writes

In the target repository, bootstrap writes a stack section in `AGENTS.md` between `<!-- agent-workflow stack -->` and `<!-- /agent-workflow stack -->`, one skill per concern under the first `skillRoots` entry, the always-on concerns in `requiredSkills`, and a `stack` entry in `.agent-workflow.json`:

```json
{
  "stack": {
    "name": "go",
    "commit": "3f2c9e1d…",
    "modified": false,
    "gate": [["go", "vet", "./..."], ["go", "test", "./..."]]
  }
}
```

`commit` is the commit of the stacks checkout, and `modified` says whether the record's files differed from it. `setup` proposes `gate` when the repository has no gate yet. Content outside the delimited `AGENTS.md` section is never changed, and a skills-only bootstrap leaves `AGENTS.md` untouched. When the repository has `AGENTS.md` and no `CLAUDE.md`, bootstrap adds a `CLAUDE.md` containing `@AGENTS.md` so Claude Code loads the same rules.
