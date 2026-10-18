# Adapted upstream skills

The flow skills are rewritten from these pinned sources and ship with this package.

| Source | Pinned commit | Used for |
|---|---|---|
| [Pstack](https://github.com/cursor/plugins/tree/c47b12849e43f18d5c374c7069c744cc55b0ea00/pstack) | `c47b12849e43f18d5c374c7069c744cc55b0ea00` | Investigation, architecture, impact, verification, verified slices |
| [Matt Pocock skills](https://github.com/mattpocock/skills/tree/d81f3a183412e71a5b1e84ca21bc1a35eea03a60) | `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` | Requirements, specs, slices, debugging, tests, review, handoffs, setup |
| [asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill/tree/3944283c183eea13fe5bd902b572da3b4de8bf44) | `3944283c183eea13fe5bd902b572da3b4de8bf44` | Writing for agents and parsers |

`third-party/sources.json` maps each original file to the skills adapted from it, with its SHA-256. The MIT notices are in `third-party/`.

The adaptations drop Cursor-only tools, fixed model names, automatic commits and shipping, mandatory parallel agents and issue-tracker publishing. flow-write drops the asd-ste100 Python linter, because the package ships only Node.

To take an upstream change, fetch the new commit, compare each mapped skill, port what is useful, update the commit, hashes and this table, then rerun the behaviour checks. Installing the package never fetches upstream content.
