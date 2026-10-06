import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

// Personal preferences must not alter fixtures or packaged-install verification.
const previous = process.env.AGENT_WORKFLOW_HOME;
const home = mkdtempSync(join(tmpdir(), 'workflow-suite-personal-'));

process.env.AGENT_WORKFLOW_HOME = home;

after(() => {
  if (previous === undefined) {
    delete process.env.AGENT_WORKFLOW_HOME;
  } else {
    process.env.AGENT_WORKFLOW_HOME = previous;
  }
  rmSync(home, { recursive: true, force: true });
});

// Task commands create team workspaces; keep them out of the real home directory.
const previousWorkspace = process.env.AGENT_WORKFLOW_WORKSPACE;
const workspace = mkdtempSync(join(tmpdir(), 'workflow-suite-workspace-'));

process.env.AGENT_WORKFLOW_WORKSPACE = workspace;

after(() => {
  if (previousWorkspace === undefined) {
    delete process.env.AGENT_WORKFLOW_WORKSPACE;
  } else {
    process.env.AGENT_WORKFLOW_WORKSPACE = previousWorkspace;
  }
  rmSync(workspace, { recursive: true, force: true });
});
