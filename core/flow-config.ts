import type { FlowConfig, ReadCommand } from './types.js';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const authors = ['pi', 'codex', 'claude'];

export const reviewerChoices: Record<string, string[]> = {
  pi: ['claude', 'codex'],
  codex: ['ollama', 'claude'],
  claude: ['ollama', 'codex'],
};

export const eligibleReviewers = (workflow: FlowConfig, author: string) =>
  (reviewerChoices[author] ?? []).filter((name) => Object.hasOwn(workflow.reviewers, name));

export const personalRoot = () =>
  resolve(process.env.AGENT_WORKFLOW_HOME || resolve(homedir(), '.config/agent-workflow'));

// Team briefs and reports live here, one folder per repository and task.
export const workspaceRoot = (home = homedir()) =>
  resolve(process.env.AGENT_WORKFLOW_WORKSPACE || resolve(home, '.agent-workflow'));

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
    shellApproval: 'workflow',
  };
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`unknown workflow setting: ${key}`);
  }
  const value = { ...defaults, ...input } as FlowConfig;
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
  if (!['workflow', 'native'].includes(value.shellApproval)) {
    throw new Error('invalid workflow shellApproval');
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
  if (!value.reviewers || typeof value.reviewers !== 'object' || Array.isArray(value.reviewers)) {
    throw new Error('reviewers must be an object');
  }
  for (const [name, settings] of Object.entries(value.reviewers)) {
    if (
      !['claude', 'codex', 'ollama'].includes(name) ||
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings)
    ) {
      throw new Error('invalid reviewer');
    }
    if (
      Object.keys(settings).some(
        (key) => key !== 'model' && !(name === 'ollama' && key === 'transport'),
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
  flowConfig(workflow);
  return { workflow, readCommands };
}

export function personalConfig() {
  const file = resolve(personalRoot(), 'personal.json');
  if (!existsSync(file)) return { workflow: {}, readCommands: [] };
  if (statSync(file).size > 64 * 1024) throw new Error('personal configuration is oversized');
  return personalSettings(JSON.parse(readFileSync(file, 'utf8')));
}
