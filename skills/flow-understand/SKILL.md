---
name: flow-understand
description: Trace an unfamiliar subsystem and investigate what a proposed change could break. Use before changing unfamiliar code or explaining runtime behavior and ownership.
---

When `graphify-out/graph.json` exists, start with `graphify query "<question>"`, `graphify explain "<symbol>"`, `graphify path "<a>" "<b>"` or `graphify affected "<symbol>"`. The graph can be stale or wrong, including loosely resolved same-named functions, so read the cited file and line before relying on an edge. Never run `graphify update`, `graphify extract`, `graphify add`, `graphify watch` or `graphify hook` from the workflow.

Use any other project knowledge graph when present, then inspect actual code. Trace the user entry point through the relevant modules to outputs and side effects. Read nearby tests, the domain glossary and relevant architecture decisions.

Identify ownership, callers, dependencies, persisted/transmitted formats, lifecycle and failure paths. Cite files and lines. Match depth to the question: a function needs a direct trace, not a fleet of agents. Delegate only when authorized and supported; absence of delegation must not block investigation.

For changes, identify the one or two assumptions safety depends on. Check beyond symbol callers: other languages, schemas, flags, teardown and pinned library behavior. Prove consequential assumptions with a real test or repro. Distinguish demonstrated behavior, source evidence and unverified assumptions.

Return the useful model, affected files and confirmed risks, not a file inventory.

Adapted from Pstack how and blast-radius; see ../../UPSTREAM.md.
