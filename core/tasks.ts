import type { Project, Task, TaskMetadata } from './types.js';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { authors, eligibleReviewers, workspaceRoot } from './flow-config.js';
import { currentBranch, git, loadProject, projectPath, readText } from './project.js';
import { privateDirectory } from './state.js';

// The marker keeps two repositories with the same name from sharing a folder.
export function taskWorkspace(root: string, id: string) {
  const dir = resolve(workspaceRoot(), basename(root), id);
  const marker = resolve(dir, '.repo');
  mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
  privateDirectory(dir);
  if (lstatSync(marker, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error(`task workspace marker ${marker} is a symlink`);
  }
  try {
    writeFileSync(marker, root + '\n', { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  if (readFileSync(marker, 'utf8').trim() !== root) {
    throw new Error(
      `task workspace ${dir} belongs to another repository; set AGENT_WORKFLOW_WORKSPACE or use another task id`,
    );
  }
  return dir;
}

const taskId = (file: string) => basename(file, '.md');

export function readTask(project: Project, path: string): Task {
  const file = projectPath(project.root, project.root, path);
  const content = readText(project.root, file);
  const match = content.match(/^<!-- agent-workflow (.+) -->$/m);
  if (!match) throw new Error('task has no workflow metadata; use task-start for portable tasks');
  const parsed: unknown = JSON.parse(match[1]!);
  const metadata = parsed as TaskMetadata;
  if (
    metadata.version !== 1 ||
    !authors.includes(metadata.author) ||
    typeof metadata.branch !== 'string' ||
    !/^[a-f0-9]{40,64}$/.test(metadata.base) ||
    typeof metadata.title !== 'string'
  ) {
    throw new Error('invalid task metadata');
  }
  git(project.root, ['cat-file', '-e', `${metadata.base}^{commit}`]);
  return { file, content, metadata };
}

export function startTask(
  cwd: string,
  {
    id,
    title,
    author,
    fix = false,
    small = false,
  }: { id: string; title: string; author: string; fix?: boolean; small?: boolean },
) {
  const project = loadProject(cwd);
  const { root, config } = project;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? '') || id.length > 64) {
    throw new Error('task id must be a short lowercase slug');
  }
  if (typeof title !== 'string' || !title.trim() || title.length > 512 || /[\r\n\0]/.test(title)) {
    throw new Error('invalid task title');
  }
  if (!authors.includes(author)) throw new Error('author must be pi, codex or claude');
  if (config.workflow.requireReview && !eligibleReviewers(config.workflow, author).length) {
    throw new Error(
      `no configured independent reviewer for ${author}; configure Claude/Codex/Ollama as appropriate or explicitly disable required review`,
    );
  }
  const branch = (fix ? config.workflow.fixPrefix : config.workflow.featurePrefix) + id;
  git(root, ['check-ref-format', '--branch', branch]);
  const base = git(root, [
    'rev-parse',
    '--verify',
    `${config.workflow.baseBranch}^{commit}`,
  ]).trim();
  if (git(root, ['status', '--porcelain']).trim()) {
    throw new Error(
      'worktree has existing changes; preserve them and resolve task placement before starting a new branch',
    );
  }
  const file = projectPath(root, root, `${config.workflow.taskDirectory}/${id}.md`);
  if (readText(root, file)) throw new Error('task file already exists');
  // Switch only a clean tree, directly to the requested base. No stash, reset,
  // checkout of main, or rewriting of the user's existing branch is needed.
  git(root, ['switch', '-c', branch, base]);
  const metadata = { version: 1, title, author, branch, base, small, reviewCycle: randomUUID() };
  const content = `# ${title}\n\n<!-- agent-workflow ${JSON.stringify(metadata)} -->\n\n**Status:** open.\n\n## Goal\n\n${title}\n\n## Acceptance criteria\n\n- [ ] Describe the observable result before implementation.\n\n## Plan\n\n${small ? 'Small task; implement directly.' : '- [ ] Record the short implementation plan before coding.'}\n\n## Decisions\n\nNone yet.\n\n## Progress\n\nBranch created; implementation has not started.\n\n## Verification\n\nNot run.\n\n## Review\n\nNot run. Record fixes before re-review; reports are kept outside the source tree.\n\n## Next step\n\nRead project instructions and fill the acceptance criteria${small ? '.' : ' and plan.'}\n`;
  mkdirSync(dirname(resolve(root, file)), { recursive: true });
  writeFileSync(resolve(root, file), content, { flag: 'wx' });
  return { branch, task: file, base, workspace: taskWorkspace(root, id) };
}

export function resumeTask(cwd: string, path: string) {
  const project = loadProject(cwd);
  const task = readTask(project, path);
  return {
    ...task,
    workspace: taskWorkspace(project.root, taskId(task.file)),
    currentBranch: currentBranch(project.root),
    expectedBranch: task.metadata.branch,
    changes: git(project.root, ['status', '--short']),
    instruction:
      'Read the task, project instructions and relevant skills. Verify recorded progress against the current files. Do not switch branches or discard existing changes automatically.',
  };
}

export function handoffTask(cwd: string, path: string, author: string) {
  const project = loadProject(cwd);
  const task = readTask(project, path);
  if (!authors.includes(author)) throw new Error('author must be pi, codex or claude');
  const metadata = { ...task.metadata, author, reviewCycle: randomUUID() };
  const content = task.content.replace(
    /^<!-- agent-workflow (.+) -->$/m,
    `<!-- agent-workflow ${JSON.stringify(metadata)} -->`,
  );
  writeFileSync(resolve(project.root, task.file), content);
  return {
    task: task.file,
    author,
    workspace: taskWorkspace(project.root, taskId(task.file)),
    instruction:
      'Author updated; review receipts from the earlier author do not transfer. Update progress and next step before leaving.',
  };
}
