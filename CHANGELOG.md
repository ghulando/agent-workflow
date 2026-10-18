# Changelog

## Unreleased

Renamed from agent-workflow to Halvard. The package, command, plugin, skills (`/halvard`, `halvard-<step>`), configuration file (`.halvard.json`), personal directory (`~/.config/halvard`), task workspace (`~/.halvard`), environment variables (`HALVARD_*`) and approval phrase (`approve halvard <id>`) use the new name. The old names are not read; [install](docs/install.md) lists the steps to move. The install and uninstall scripts also remove an earlier agent-workflow install.

## 0.0.1

First release: shared workflow engine, native adapters for Pi, Claude Code and Codex, portable task records, configurable gate and independent review.
