import type { PackageMetadata } from './types.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { authors, eligibleReviewers, personalRoot } from './flow-config.js';
import { currentBranch, loadProject } from './project.js';
import { packageStatus } from './package.js';
import { pluginRoot } from './runtime.js';

export function doctor(cwd: string, author?: string) {
  if (author !== undefined && !authors.includes(author)) {
    throw new Error('author must be pi, codex or claude');
  }
  const { root, config } = loadProject(cwd);
  const issues = [];
  const reviewers = Object.fromEntries(
    (author ? [author] : []).map((name) => [name, eligibleReviewers(config.workflow, name)]),
  );
  if (!config.gate) issues.push('No gate is configured; managed task completion is unavailable.');
  if (config.workflow.requireReview) {
    for (const [name, providers] of Object.entries(reviewers)) {
      if (!providers.length) issues.push(`No configured independent reviewer for ${name}.`);
    }
  }
  const paths = [resolve(personalRoot(), 'package'), resolve(root, 'plugins/agent-workflow')];
  const installations = paths
    .filter((path) => existsSync(path))
    .map((path) => packageStatus(pluginRoot, path));
  for (const install of installations) {
    if (!install.matches) {
      let version;
      try {
        version = (
          JSON.parse(readFileSync(resolve(install.path, 'package.json'), 'utf8')) as PackageMetadata
        ).version;
      } catch {}
      const current = (
        JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')) as PackageMetadata
      ).version;
      const command =
        install.path === paths[0]
          ? version === current
            ? 'install-user --repair'
            : 'install-user for a normal upgrade'
          : version === current
            ? 'install-plan --repair'
            : 'an explicit vendored package upgrade';
      issues.push(`Package content differs at ${install.path}; preview ${command}.`);
    }
  }
  const staging = new Map<string, string[]>();
  const addPrefix = (directory: string, prefix: string) =>
    staging.set(directory, [...(staging.get(directory) ?? []), prefix]);
  for (const path of paths) addPrefix(dirname(path), basename(path) + '.next-');
  const settings = [
    resolve(root, '.agent-workflow.json'),
    resolve(root, 'CLAUDE.md'),
    resolve(root, '.pi/settings.json'),
    resolve(root, '.claude/settings.json'),
    resolve(root, '.codex/config.toml'),
    resolve(root, '.agents/plugins/marketplace.json'),
    resolve(personalRoot(), 'personal.json'),
    resolve(personalRoot(), '.agents/plugins/marketplace.json'),
    resolve(homedir(), '.pi/agent/settings.json'),
    resolve(homedir(), '.claude/settings.json'),
    resolve(homedir(), '.codex/config.toml'),
  ];
  for (const path of settings) addPrefix(dirname(path), `.${basename(path)}.workflow-`);
  for (const [directory, prefixes] of staging) {
    if (existsSync(directory)) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && prefixes.some((prefix) => entry.name.startsWith(prefix))) {
          issues.push(
            `Installation staging leftover: ${resolve(directory, entry.name)}; inspect before removing.`,
          );
        }
      }
    }
  }
  return {
    root,
    branch: currentBranch(root),
    runner: resolve(pluginRoot, 'dist/bin/workflow.js'),
    gate: config.gate,
    requireReview: config.workflow.requireReview,
    reviewers,
    installations,
    issues,
    note: 'Configuration checks do not prove native hooks are loaded or trusted, or that reviewer providers are available.',
  };
}
