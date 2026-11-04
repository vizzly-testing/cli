import { constants } from 'node:fs';
import { access, chmod, cp, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let cli = fileURLToPath(new URL('../../bin/vizzly.js', import.meta.url));
// Use tui-driver's optional PTY backend directly so tests wait on output events
// instead of the visual driver's screen-stability polling.
let pty;
let ptyFixture;
try {
  let resolve = createRequire(import.meta.resolve('tui-driver'));
  let entry = resolve.resolve('node-pty');
  if (process.platform === 'darwin') {
    let directory = path.dirname(path.dirname(entry));
    let helper = path.join(
      'prebuilds',
      `darwin-${process.arch}`,
      'spawn-helper'
    );
    try {
      await access(path.join(directory, helper), constants.X_OK);
    } catch (error) {
      if (error.code === 'EACCES') {
        // Some package caches lose this helper's executable bit. Repair an
        // isolated dependency copy; tests must not modify installed modules.
        ptyFixture = await mkdtemp(path.join(tmpdir(), 'vizzly-pty-backend-'));
        let copy = path.join(ptyFixture, 'node_modules', 'node-pty');
        await cp(directory, copy, { recursive: true });
        await chmod(path.join(copy, helper), 0o755);
        entry = path.join(copy, 'lib', 'index.js');
      } else if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  pty = (await import(entry)).default;
} catch {
  /* The optional native test dependency is unavailable. */
}
after(async () => {
  if (ptyFixture) await rm(ptyFixture, { recursive: true, force: true });
});
export let terminalTest = pty ? test : test.skip;

export async function terminalFixture(t) {
  let cwd = await realpath(
    await mkdtemp(path.join(tmpdir(), 'vizzly-terminal-'))
  );
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

export function runTerminal(
  t,
  cwd,
  responses,
  environment = {},
  args = ['init'],
  entry = cli,
  observe = () => {}
) {
  let env = { ...process.env, TERM: 'dumb', COLUMNS: '40', NO_COLOR: '1' };
  for (let name of Object.keys(env)) {
    if (
      name.startsWith('VIZZLY_') ||
      [
        'CI',
        'NODE_V8_COVERAGE',
        'FORCE_COLOR',
        'NO_UPDATE_NOTIFIER',
        'NODE_OPTIONS',
      ].includes(name)
    )
      delete env[name];
  }
  env.VIZZLY_HOME = path.join(cwd, 'user-state');
  env.VIZZLY_DISABLE_KEYCHAIN = 'true';
  Object.assign(env, environment);
  let child = pty.spawn(process.execPath, [entry, ...args, '--no-color'], {
    cwd,
    env,
    name: 'dumb',
    cols: 40,
    rows: 24,
  });
  let exited = false;
  t.after(() => {
    if (!exited) child.kill();
  });
  return new Promise((resolve, reject) => {
    let output = '';
    let pending = '';
    let index = 0;
    let receive = chunk => {
      let value = chunk.toString();
      output += value;
      pending += value;
      observe(output);
      while (index < responses.length) {
        let [marker, answer] = responses[index];
        let position = pending.indexOf(marker);
        if (position < 0) break;
        pending = pending.slice(position + marker.length);
        index++;
        child.write(answer);
      }
    };
    child.onData(receive);
    child.onExit(({ exitCode: code }) => {
      exited = true;
      if (index !== responses.length)
        reject(new Error(`Terminal ended before prompt ${index}: ${output}`));
      else resolve({ code, output });
    });
  });
}
