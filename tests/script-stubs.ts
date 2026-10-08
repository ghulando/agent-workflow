import type { TestContext } from 'node:test';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each stub logs its arguments and prints the fixture named after them. A .sh fixture
// runs first, standing in for a CLI that edits its own settings; a .fail fixture exits 1.
const stub = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
key=$(echo "$(basename "$0") $*" | tr ' ' '-')
[ -f "$STUB_FIXTURES/$key.sh" ] && . "$STUB_FIXTURES/$key.sh"
[ -f "$STUB_FIXTURES/$key" ] && cat "$STUB_FIXTURES/$key"
[ -f "$STUB_FIXTURES/$key.fail" ] && exit 1
exit 0
`;

export type Fixtures = Record<string, string>;

export const lists = (
  claudeMarkets: unknown,
  claudePlugins: unknown,
  codexMarkets: unknown,
  codexPlugins: unknown,
  piList: string,
): Fixtures => ({
  'claude-plugin-marketplace-list---json': JSON.stringify(claudeMarkets),
  'claude-plugin-list---json': JSON.stringify(claudePlugins),
  'codex-plugin-marketplace-list---json': JSON.stringify({ marketplaces: codexMarkets }),
  'codex-plugin-list---json': JSON.stringify({ installed: codexPlugins }),
  'pi-list': piList,
});

// Runs scripts/<name> with stub claude, codex and pi CLIs and a throwaway HOME and TMPDIR.
export function runScript(
  t: TestContext,
  name: string,
  fixtures: Fixtures,
  { args = [], prepare }: { args?: string[]; prepare?: (home: string, tmp: string) => void } = {},
) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'workflow-script-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin');
  const data = join(dir, 'fixtures');
  const home = join(dir, 'home');
  const tmp = join(dir, 'tmp');
  for (const path of [bin, data, home, tmp]) mkdirSync(path);
  for (const cli of ['claude', 'codex', 'pi']) {
    writeFileSync(join(bin, cli), stub);
    chmodSync(join(bin, cli), 0o755);
  }
  // Only the stubs and the system tools are on PATH, so real harness CLIs cannot run.
  symlinkSync(process.execPath, join(bin, 'node'));
  for (const [key, content] of Object.entries(fixtures)) writeFileSync(join(data, key), content);
  prepare?.(home, tmp);
  const log = join(dir, 'calls.log');
  writeFileSync(log, '');
  const script = fileURLToPath(new URL(`../scripts/${name}`, import.meta.url));
  const result = spawnSync('/bin/sh', [script, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: home,
      TMPDIR: tmp,
      STUB_LOG: log,
      STUB_FIXTURES: data,
    },
  });
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line && !/ list( --json)?$/.test(line));
  return { ...result, calls, home, tmp };
}
