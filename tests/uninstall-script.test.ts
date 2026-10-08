import type { TestContext } from 'node:test';
import type { Fixtures } from './script-stubs.ts';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { lists, runScript } from './script-stubs.ts';

const old = 'agent-workflow@agent-workflow-local';
const plugin = 'agent-workflow@ghulando';
const pi = 'git:github.com/ghulando/agent-workflow';
const uid = process.getuid!();

const installed = lists(
  [{ name: 'ghulando' }, { name: 'agent-workflow-local' }, { name: 'other' }],
  [
    { id: plugin, scope: 'user' },
    { id: old, scope: 'user' },
    { id: old, scope: 'project', projectPath: '/work/app' },
    { id: 'kept@other', scope: 'user' },
  ],
  [{ name: 'ghulando' }, { name: 'agent-workflow-local' }],
  [{ pluginId: plugin }, { pluginId: old }],
  `User packages:\n  npm:other\n  ${pi}\n    /home/.pi/agent/git/github.com/ghulando/agent-workflow\n`,
);

// A home holding both installs, unrelated settings, caches and workflow data.
function prepare(home: string, tmp: string) {
  const workspace = join(home, '.agent-workflow');
  mkdirSync(join(home, '.claude'));
  writeFileSync(
    join(home, '.claude/settings.json'),
    JSON.stringify({
      model: 'opus',
      permissions: { additionalDirectories: [workspace, '/other'] },
      enabledPlugins: { [plugin]: true, [old]: true, 'kept@other': true },
      extraKnownMarketplaces: { ghulando: {}, 'agent-workflow-local': {}, other: {} },
    }),
  );
  mkdirSync(join(home, '.codex'));
  writeFileSync(
    join(home, '.codex/config.toml'),
    [
      'model = "gpt"',
      '',
      '[hooks.state."other@market:hooks.json:pre_tool_use:0:0"]',
      'trusted_hash = "sha256:keep"',
      '',
      `[hooks.state."${old}:hooks/codex.json:pre_tool_use:0:0"]`,
      'trusted_hash = "sha256:old"',
      '',
      `[hooks.state."${plugin}:hooks/codex.json:session_start:0:0"]`,
      'trusted_hash = "sha256:new"',
      '',
      '[sandbox_workspace_write]',
      'writable_roots = [',
      `  '${workspace}', # task workspace`,
      '  "/other",',
      ']',
      '',
      '[marketplaces.agent-workflow-local]',
      'source_type = "git"',
      '  [profiles.dev]',
      '  model = "kept"',
      '',
      `[plugins.'${plugin}'] # added by codex`,
      'enabled = true',
      '',
      `[plugins."${old}"]`,
      'enabled = true',
      '',
    ].join('\n'),
  );
  for (const path of [
    '.claude/plugins/cache/ghulando/agent-workflow/0.0.1',
    '.claude/plugins/cache/agent-workflow-local/agent-workflow/0.0.1',
    '.claude/plugins/cache/other/kept/1.0.0',
    '.claude/plugins/data/agent-workflow-ghulando',
    '.codex/plugins/cache/agent-workflow-local/agent-workflow',
    '.codex/.tmp/marketplaces/agent-workflow-local',
    '.pi/agent/git/github.com/ghulando/agent-workflow',
    '.config/agent-workflow/package',
    '.agent-workflow/app/task',
  ]) {
    mkdirSync(join(home, path), { recursive: true });
  }
  writeFileSync(join(home, '.config/agent-workflow/personal.json'), '{}\n');
  mkdirSync(join(tmp, `agent-workflow-${uid}`));
}

function run(t: TestContext, fixtures: Fixtures, args: string[] = []) {
  return runScript(t, 'uninstall.sh', fixtures, { args, prepare });
}

test('uninstall script removes both marketplace names and keeps unrelated settings', (t) => {
  const result = run(t, installed);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, [
    `claude plugin uninstall ${plugin}`,
    'claude plugin marketplace remove ghulando',
    `claude plugin uninstall ${old}`,
    'claude plugin marketplace remove agent-workflow-local',
    `codex plugin remove ${plugin}`,
    'codex plugin marketplace remove ghulando',
    `codex plugin remove ${old}`,
    'codex plugin marketplace remove agent-workflow-local',
    `pi remove ${pi}`,
  ]);
  assert.match(
    result.stdout,
    /\/work\/app still enables agent-workflow@agent-workflow-local; there run: claude plugin uninstall agent-workflow@agent-workflow-local --scope project/,
  );

  const { home, tmp } = result;
  const workspace = join(home, '.agent-workflow');
  const claude = JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(claude, {
    model: 'opus',
    permissions: { additionalDirectories: [workspace, '/other'] },
    enabledPlugins: { 'kept@other': true },
    extraKnownMarketplaces: { other: {} },
  });
  assert.match(
    readFileSync(join(home, '.claude/settings.json.agent-workflow.bak'), 'utf8'),
    /agent-workflow-local/,
  );
  const codex = readFileSync(join(home, '.codex/config.toml'), 'utf8');
  assert.match(codex, /other@market/);
  assert.match(codex, /^ {2}\[profiles\.dev\]\n {2}model = "kept"$/m);
  assert.ok(codex.includes(`'${workspace}', # task workspace`));
  assert.doesNotMatch(codex, /agent-workflow@|marketplaces\.agent-workflow-local/);

  for (const path of [
    '.claude/plugins/cache/ghulando',
    '.claude/plugins/cache/agent-workflow-local',
    '.claude/plugins/data/agent-workflow-ghulando',
    '.codex/plugins/cache/agent-workflow-local',
    '.codex/.tmp/marketplaces/agent-workflow-local',
    '.pi/agent/git/github.com/ghulando/agent-workflow',
    '.config/agent-workflow/package',
  ]) {
    assert.ok(!existsSync(join(home, path)), `${path} should be removed`);
  }
  assert.ok(!existsSync(join(tmp, `agent-workflow-${uid}`)));
  assert.ok(existsSync(join(home, '.claude/plugins/cache/other/kept/1.0.0')));
  assert.ok(existsSync(join(home, '.config/agent-workflow/personal.json')));
  assert.ok(existsSync(join(home, '.agent-workflow/app/task')));
});

test('uninstall script with --purge also removes personal data and workspace permissions', (t) => {
  const result = run(t, installed, ['--purge']);
  assert.equal(result.status, 0, result.stderr);
  const { home } = result;
  assert.ok(!existsSync(join(home, '.config/agent-workflow')));
  assert.ok(!existsSync(join(home, '.agent-workflow')));
  const claude = JSON.parse(readFileSync(join(home, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(claude.permissions, { additionalDirectories: ['/other'] });
  const codex = readFileSync(join(home, '.codex/config.toml'), 'utf8');
  assert.match(codex, /^writable_roots = \[\n  \n  "\/other",\n\]$/m);
  assert.ok(!codex.includes(join(home, '.agent-workflow')));
});

test('uninstall script backs up settings before a harness CLI edits them', (t) => {
  const result = run(t, {
    ...installed,
    [`claude-plugin-uninstall-${plugin}.sh`]: 'echo "{}" > "$HOME/.claude/settings.json"\n',
  });
  assert.equal(result.status, 0, result.stderr);
  const backup = readFileSync(
    join(result.home, '.claude/settings.json.agent-workflow.bak'),
    'utf8',
  );
  assert.match(backup, /"model":"opus"/);
});

test('uninstall script stops before changes when a harness reports unexpected output', (t) => {
  const result = run(t, { ...installed, 'claude-plugin-list---json': 'not json' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, []);
  assert.match(result.stderr, /Unexpected output from claude plugin list/);
  assert.ok(existsSync(join(result.home, '.claude/plugins/cache/ghulando/agent-workflow')));
});

test('uninstall script rejects unknown or extra arguments', (t) => {
  for (const args of [['--force'], ['--purge', '--force'], ['--purge', '--purge']]) {
    const result = run(t, installed, args);
    assert.equal(result.status, 2, args.join(' '));
    assert.deepEqual(result.calls, []);
    assert.ok(!existsSync(join(result.home, '.claude/settings.json.agent-workflow.bak')));
  }
});
