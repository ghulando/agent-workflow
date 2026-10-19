import type { FlowConfig, Harness, ReadCommand, TeamConfig } from './types.ts';
import { HARNESSES } from './types.ts';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const authors: string[] = [...HARNESSES];
export const AUTHOR_ERROR = `author must be ${authors.join(', ')}`;

// Headless review providers: each runs a CLI on this machine.
export const providers = ['claude', 'codex', 'grok', 'cursor', 'ollama'];

export const reviewerChoices: Record<string, string[]> = {
  pi: ['claude', 'codex', 'grok', 'cursor'],
  codex: ['ollama', 'claude', 'grok', 'cursor'],
  claude: ['ollama', 'codex', 'grok', 'cursor'],
  grok: ['ollama', 'claude', 'codex', 'cursor'],
  cursor: ['ollama', 'claude', 'codex', 'grok'],
};

export const assignment = (workflow: FlowConfig, author: string) =>
  Object.hasOwn(workflow.reviewers, author) && workflow.reviewers[author]!.reviewer !== undefined
    ? workflow.reviewers[author]!
    : null;

// An assigned author has exactly one reviewer; others choose among unassigned providers.
export const eligibleReviewers = (workflow: FlowConfig, author: string) => {
  const assigned = assignment(workflow, author);
  if (assigned) return [assigned.reviewer!];
  return (reviewerChoices[author] ?? []).filter(
    (name) =>
      Object.hasOwn(workflow.reviewers, name) && workflow.reviewers[name]!.reviewer === undefined,
  );
};

export function reviewerSettings(workflow: FlowConfig, author: string, reviewer: string) {
  if (!eligibleReviewers(workflow, author).includes(reviewer)) return null;
  const { model, transport } = assignment(workflow, author) ?? workflow.reviewers[reviewer]!;
  return { model, transport };
}

export const personalRoot = () =>
  resolve(process.env.HALVARD_HOME || resolve(homedir(), '.config/halvard'));

// Team briefs and reports live here, one folder per repository and task.
export const workspaceRoot = (home = homedir()) =>
  resolve(process.env.HALVARD_WORKSPACE || resolve(home, '.halvard'));

export function flowConfig(input: unknown = {}): FlowConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('workflow must be an object');
  }
  const defaults: FlowConfig = {
    taskDirectory: 'docs/tasks',
    baseBranch: 'main',
    featurePrefix: 'feature/',
    fixPrefix: 'fix/',
    requireReview: true,
    reviewers: {},
    reviewTimeout: 900,
    reviewExclude: [],
    reviewContext: [],
    reviewExceptions: {},
    reviewDeferrals: {},
    stacks: null,
  };
  // shellApproval is accepted from older configurations; shell commands no longer ask.
  const { shellApproval, ...settings } = input as Record<string, unknown>;
  for (const key of Object.keys(settings)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`unknown workflow setting: ${key}`);
  }
  if (shellApproval !== undefined && !['workflow', 'native'].includes(shellApproval as string)) {
    throw new Error('invalid workflow shellApproval');
  }
  const value = { ...defaults, ...settings } as FlowConfig;
  for (const key of ['taskDirectory', 'baseBranch', 'featurePrefix', 'fixPrefix'] as const) {
    if (
      typeof value[key] !== 'string' ||
      !value[key] ||
      value[key].includes('\0') ||
      /[\r\n]/.test(value[key])
    ) {
      throw new Error(`invalid workflow ${key}`);
    }
  }
  if (
    value.taskDirectory.startsWith('/') ||
    value.taskDirectory.split('/').some((part) => part === '..' || !part)
  ) {
    throw new Error('taskDirectory must be a relative directory');
  }
  if (typeof value.requireReview !== 'boolean') throw new Error('requireReview must be boolean');
  // A home-relative path lets teammates share one project setting.
  if (
    value.stacks !== null &&
    (typeof value.stacks !== 'string' ||
      !(value.stacks.startsWith('/') || value.stacks.startsWith('~/')) ||
      /[\r\n\0]/.test(value.stacks))
  ) {
    throw new Error('stacks must be an absolute or ~/ directory path');
  }
  for (const key of ['reviewExclude', 'reviewContext'] as const) {
    if (
      !Array.isArray(value[key]) ||
      value[key].some(
        (path) =>
          typeof path !== 'string' ||
          !path ||
          path.startsWith('/') ||
          path.split('/').includes('..'),
      )
    ) {
      throw new Error(`${key} must contain repo-relative patterns`);
    }
  }
  if (
    !Number.isInteger(value.reviewTimeout) ||
    value.reviewTimeout < 1 ||
    value.reviewTimeout > 3600
  ) {
    throw new Error('reviewTimeout must be 1..3600 seconds');
  }
  if (
    !value.reviewExceptions ||
    typeof value.reviewExceptions !== 'object' ||
    Array.isArray(value.reviewExceptions)
  ) {
    throw new Error('reviewExceptions must be an object');
  }
  for (const [task, exception] of Object.entries(value.reviewExceptions)) {
    if (
      !task ||
      task.startsWith('/') ||
      task.split('/').some((part) => !part || part === '..') ||
      /[\r\n\0]/.test(task) ||
      !exception ||
      typeof exception !== 'object' ||
      Array.isArray(exception) ||
      Object.keys(exception).some((key) => !['maxRound', 'reason'].includes(key)) ||
      !Number.isInteger(exception.maxRound) ||
      exception.maxRound < 3 ||
      exception.maxRound > 10 ||
      typeof exception.reason !== 'string' ||
      !exception.reason.trim()
    ) {
      throw new Error('invalid task review exception');
    }
  }
  if (
    !value.reviewDeferrals ||
    typeof value.reviewDeferrals !== 'object' ||
    Array.isArray(value.reviewDeferrals)
  ) {
    throw new Error('reviewDeferrals must be an object');
  }
  // Each entry is a user decision, so it lives in configuration the guard asks before editing.
  for (const [task, deferrals] of Object.entries(value.reviewDeferrals)) {
    if (
      !task ||
      task.startsWith('/') ||
      task.split('/').some((part) => !part || part === '..') ||
      /[\r\n\0]/.test(task) ||
      !Array.isArray(deferrals) ||
      deferrals.some(
        (deferral) =>
          !deferral ||
          typeof deferral !== 'object' ||
          Array.isArray(deferral) ||
          Object.keys(deferral).some(
            (key) => !['finding', 'approvedBy', 'reason', 'override'].includes(key),
          ) ||
          typeof deferral.finding !== 'string' ||
          !/^round(?:[1-9]|10)#[1-9][0-9]*$/.test(deferral.finding) ||
          ['approvedBy', 'reason'].some(
            (key) =>
              typeof deferral[key as 'approvedBy' | 'reason'] !== 'string' ||
              !deferral[key as 'approvedBy' | 'reason'].trim() ||
              /[\r\n\0]/.test(deferral[key as 'approvedBy' | 'reason']),
          ) ||
          (deferral.override !== undefined && deferral.override !== true),
      ) ||
      new Set(deferrals.map((deferral) => deferral.finding)).size !== deferrals.length
    ) {
      throw new Error('invalid task review deferral');
    }
  }
  if (!value.reviewers || typeof value.reviewers !== 'object' || Array.isArray(value.reviewers)) {
    throw new Error('reviewers must be an object');
  }
  for (const [key, settings] of Object.entries(value.reviewers)) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('invalid reviewer');
    }
    // An entry with `reviewer` is keyed by author and assigns that author's reviewer.
    const assigned = settings.reviewer !== undefined;
    const name = assigned ? settings.reviewer! : key;
    if (assigned) {
      if (!authors.includes(key)) throw new Error(`reviewer assignment for unknown author ${key}`);
      if (typeof name !== 'string' || !providers.includes(name)) {
        throw new Error(`invalid reviewer for author ${key}`);
      }
      if (name === key ? !settings.model : !reviewerChoices[key]!.includes(name)) {
        throw new Error(
          name === key
            ? `${key} reviewing its own work requires an explicit model`
            : `${name} cannot review work by ${key}`,
        );
      }
    } else if (!providers.includes(key)) {
      throw new Error('invalid reviewer');
    }
    if (
      Object.keys(settings).some(
        (field) =>
          field !== 'model' &&
          !(assigned && field === 'reviewer') &&
          !(name === 'ollama' && field === 'transport'),
      ) ||
      (settings.model !== undefined &&
        (typeof settings.model !== 'string' ||
          !settings.model ||
          settings.model.startsWith('-') ||
          /[\r\n\0]/.test(settings.model)))
    ) {
      throw new Error(`invalid ${name} reviewer settings`);
    }
    if (settings.transport !== undefined && !['cli', 'pi'].includes(settings.transport)) {
      throw new Error('Ollama transport must be cli or pi');
    }
    if (name === 'ollama' && !settings.model) throw new Error('Ollama requires an explicit model');
  }
  return value;
}

// personal.json holds workflow settings plus read commands trusted in every repo.
// Projects validate the read commands together with their own.
export function personalSettings(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('personal configuration must be an object');
  }
  const { readCommands = [], ...workflow } = input as Partial<FlowConfig> & {
    readCommands?: ReadCommand[];
  };
  // The guard asks before project configuration edits but not before personal ones.
  const { reviewDeferrals } = workflow;
  if (
    reviewDeferrals &&
    typeof reviewDeferrals === 'object' &&
    Object.keys(reviewDeferrals).length
  ) {
    throw new Error('reviewDeferrals belong in project configuration');
  }
  flowConfig(workflow);
  return { workflow, readCommands };
}

export function personalConfig() {
  const file = resolve(personalRoot(), 'personal.json');
  if (!existsSync(file)) return { workflow: {}, readCommands: [] };
  if (statSync(file).size > 64 * 1024) throw new Error('personal configuration is oversized');
  return personalSettings(JSON.parse(readFileSync(file, 'utf8')));
}

const TEAM_ROLES = ['lead', 'dev', 'reviewer'] as const;
const APPROVALS = ['reads-edits-gate', 'none'];

const isHarness = (value: unknown): value is Harness =>
  typeof value === 'string' && (HARNESSES as readonly string[]).includes(value);

// A Herdr team: three required roles and an optional investigator, each one harness.
export function teamConfig(input: unknown): TeamConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('team must be an object');
  }
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (![...TEAM_ROLES, 'investigator', 'monitor'].includes(key)) {
      throw new Error(`unknown team option: ${key}`);
    }
  }
  for (const role of TEAM_ROLES) {
    if (!isHarness(value[role])) throw new Error(`team ${role} must be ${HARNESSES.join(', ')}`);
  }
  const investigator = value.investigator ?? null;
  if (investigator !== null && !isHarness(investigator)) {
    throw new Error(`team investigator must be ${HARNESSES.join(', ')} or null`);
  }
  if (value.lead === value.dev)
    throw new Error('the team lead and dev must be different harnesses');
  if (value.reviewer === value.dev) {
    throw new Error('the team reviewer must not be the dev, whose work it reviews');
  }
  if (
    value.monitor !== undefined &&
    (!value.monitor || typeof value.monitor !== 'object' || Array.isArray(value.monitor))
  ) {
    throw new Error('team monitor must be an object');
  }
  const monitor: Record<string, unknown> = {
    watch: true,
    nudge: true,
    approve: 'reads-edits-gate',
    ...(value.monitor as Record<string, unknown> | undefined),
  };
  if (
    Object.keys(monitor).some((key) => !['watch', 'nudge', 'approve'].includes(key)) ||
    typeof monitor.watch !== 'boolean' ||
    typeof monitor.nudge !== 'boolean' ||
    !APPROVALS.includes(monitor.approve as string)
  ) {
    throw new Error(
      'team monitor takes watch and nudge (true or false) and approve (reads-edits-gate or none)',
    );
  }
  return {
    lead: value.lead as Harness,
    dev: value.dev as Harness,
    reviewer: value.reviewer as Harness,
    investigator: investigator as Harness | null,
    monitor: monitor as TeamConfig['monitor'],
  };
}
