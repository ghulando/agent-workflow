---
name: flow-bootstrap
description: Configure a repository's stack rules and skills from shared stack records, asking only what a record leaves open. Use for a new or empty repository, or to add stack skills to an existing one.
---

Bootstrap writes configuration, never application code. It does not scaffold projects, install dependencies or run package managers; scaffolding is the first normal task afterwards. docs/stacks.md in this package defines the record format.

## Read the state

Run `node <plugin-root>/bin/workflow.ts bootstrap .` from the repository root. It prints the valid records in the configured `stacks` clone with their kind, summary and concerns, the records that break the format, the stacks `commit`, and per record whether its files differ from that commit (`modified`), the stacks the setup scan `detected`, the branch and whether it is protected, the existing `stamp`, the current `agentsSection`, the existing skills and a tree fingerprint. Without a `stacks` setting there are no records. Say so, and offer either to stop while the user sets `stacks` in personal configuration, or to continue without a record: then ask the new-stack questions, write no record, and stamp the stack with a null commit and `modified` true. Report invalid records by file and problem rather than guessing past them.

When `protectedBranch` is true, the guard will refuse the apply step; ask the user to create a working branch first. When `commit` is null or the chosen record's `modified` is true, say so before asking further: the stamp will not point at a committed record unless the user commits the stacks checkout first.

## Choose the stack

Ask which stack, offering the valid records and a new one, and mention what the scan detected. Never pick silently, including when the scan detects exactly one stack. An argument such as `flow-bootstrap <stack>` answers this question.

Then ask for every placeholder the record uses, such as a service name or a namespace prefix, so no placeholder reaches the generated files.

## Existing code

When the repository already has code, check it before asking about decisions. Read the manifests, project files, test projects and a few representative source files per layer, and compare them with each recorded decision and open choice.

An open choice the code already answers takes the code's answer as its default. A recorded decision the code contradicts is a disagreement. List them all with file evidence, such as a library in a project file that differs from the record, then ask about each one separately, with the code's choice as default, before showing any summary. A library the record names but the code does not use yet is not a disagreement; the record applies to new code. Evidence that is half-present or too thin to judge is a question, with the record as default.

When the user keeps the code's choice, find the recorded rules that depend on the replaced decision and drop or adjust them. List those changes in the confirmation. Generate skills only and never edit application code. Leave an existing stack section or skill unchanged unless the user chooses to replace it; a plan with `"agents": null` writes skills only and leaves `AGENTS.md` byte-identical. Ask whether the repository should get a stack section at all when it has none.

## Decisions

For an existing record, read its `stack.md` and any `skills/<concern>.md` templates. Show the recorded decisions, adjusted by any disagreements already settled, as one short summary to accept or change. Then ask each remaining open choice on its own with its default. A change to a recorded decision applies to this repository only; offer to update the record as a separate edit in the stacks checkout.

For a new stack, ask the name and kind, then one decision at a time in the order of the docs/stacks.md table, each with a suggested default and a one-line reason. Summary, Gate and Concerns are proposals for the user to confirm. Ask only decisions two good engineers could disagree on; record a decision that should vary per repository as an open choice instead. Before writing anything, show the complete record and its path `<stacks>/<name>/stack.md`, and wait for confirmation; never overwrite an existing record. Then write it, run `bootstrap .` again until it lists the record without problems, and tell the user to review and commit it in the stacks checkout. Never commit or push there yourself. Then continue with the existing-record path, asking its open choices.

## Write the plan

Generate one skill per concern the repository uses. Skip a concern whose open choice the user answered with none, or, on an existing repository, a capability the code does not use and the user does not plan to add; list the skipped concerns in the confirmation. Each skill has frontmatter whose `name` is the concern and whose `description` says when it applies, so an agent loads it for that work and not otherwise.

A skill's body states the decisions its concern applies, then how to follow them with the named libraries. That guidance may use a named library's own API, but it adds no policy: no layer placement, retry, lock, compatibility or error rule the record and the user's answers do not state. When such a rule seems necessary, ask the user or leave it out. Put a decision in the one skill that owns it rather than repeating it across skills. Keep each skill short enough to read before every matching change.

Write the `AGENTS.md` stack section as rules every session needs: the stack and kind, the architecture and dependency direction, naming, the error model, the gate commands, and which skill to read for which work, by skill name. Start it with `## Stack` and use level-three headings inside it. Do not repeat skill bodies there.

Check that the gate commands can run in this repository as laid out, such as a build command that needs a solution or manifest at the root. Say which commands cannot pass until the first scaffolding task exists.

Show the full file list, the `AGENTS.md` section and each skill, and wait for the user's confirmation. Then save the plan outside the repository, under a file name unique to this run, as JSON:

```json
{
  "version": 1,
  "root": "<root from the report>",
  "tree": "<tree from the report>",
  "stack": { "name": "<stack>", "commit": "<commit from the report>", "modified": "<the record's modified>", "gate": [["<command>", "<argument>"]] },
  "agents": "<stack section Markdown without markers, or null>",
  "skills": [{ "name": "<concern>", "content": "<SKILL.md text>", "required": true }],
  "overwrite": []
}
```

`required` is true for always-on concerns, which load at every session start. `overwrite` lists existing skills the user agreed to replace.

## Apply and hand off

Run `node <plugin-root>/bin/workflow.ts bootstrap-apply . <plan-file>`. It adds a `CLAUDE.md` containing `@AGENTS.md` when the repository has `AGENTS.md` and no `CLAUDE.md`, so Claude Code loads the same rules; when `CLAUDE.md` exists without that import, relay the `claude` message from the result. It refuses a stale plan, an unlisted existing skill, a skill whose name does not match its directory and a target with several hard links. When the tree changed after confirmation, run `bootstrap .` again, rebuild the plan with the new fingerprint and show what changed before applying. Never work around a refusal.

Then use [flow-setup](../flow-setup/SKILL.md): `setup` proposes the recorded gate while none is configured, and the user reviews it before `setup-apply`. In a repository without commits, `setup` proposes the current branch as base; point that out.

Finish by naming the files written, the stacks commit recorded and whether the record had uncommitted changes. Committing the result is the user's call.
