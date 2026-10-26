import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import {
  access,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { compareSync } from '@vizzly-testing/honeydiff';

let runFile = promisify(execFile);
let cli = fileURLToPath(new URL('../../src/cli.js', import.meta.url));
let capture = fileURLToPath(
  new URL('../fixtures/local-capture.js', import.meta.url)
);

async function createProject(t) {
  let cwd = await mkdtemp(path.join(tmpdir(), 'vizzly-tdd-capture-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  return cwd;
}

async function runCapture(cwd, mode, args = []) {
  let reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  let port = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close(error => (error ? reject(error) : resolve()))
  );
  let env = { ...process.env };
  for (let key of Object.keys(env)) {
    if (key.startsWith('VIZZLY_') || key === 'NODE_V8_COVERAGE')
      delete env[key];
  }
  env.VIZZLY_HOME = path.join(cwd, 'user-state');
  env.VIZZLY_DISABLE_KEYCHAIN = 'true';
  let command = `"${process.execPath}" "${capture}" ${mode}`;
  let result;
  try {
    result = await runFile(
      process.execPath,
      [
        cli,
        '--json',
        'tdd',
        'run',
        command,
        '--no-open',
        '--port',
        String(port),
        ...args,
      ],
      { cwd, env }
    );
    result.code = 0;
  } catch (error) {
    result = error;
  }
  return {
    code: result.code,
    data: JSON.parse(result.stdout).data,
    stderr: result.stderr,
  };
}

test('zero captures do not advertise a report that was never generated', async t => {
  let cwd = await createProject(t);
  let result = await runCapture(cwd, 'zero');
  assert.equal(result.code, 0);
  assert.equal(result.data.summary.total, 0);
  assert.equal(result.data.reportPath, null);
  assert.equal(result.data.capture.accepted, 0);
});

test('first and repeated captures return usable image and report paths', async t => {
  let cwd = await createProject(t);
  let first = await runCapture(cwd, 'valid');
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.data.summary.new, 1);
  assert.equal(first.data.capture.accepted, 1);
  let image = first.data.comparisons[0].paths.current;
  assert.ok(image);
  let decoded = compareSync(image, image);
  assert.ok(decoded.images.current.width > 0);
  await access(first.data.reportPath);
  assert.match(await readFile(first.data.reportPath, 'utf8'), /first-capture/);
  let repeated = await runCapture(cwd, 'valid');
  assert.equal(repeated.code, 0, repeated.stderr);
  assert.equal(repeated.data.summary.passed, 1);
});

test('invalid initial image is rejected without creating a baseline', async t => {
  let cwd = await createProject(t);
  let result = await runCapture(cwd, 'invalid');
  assert.equal(result.code, 1);
  assert.equal(result.data.capture.rejected, 1);
  assert.equal(result.data.summary.total, 0);
  assert.equal(result.data.reportPath, null);
  let entries = await readdir(path.join(cwd, '.vizzly', 'baselines'));
  assert.equal(entries.filter(file => file.endsWith('.png')).length, 0);
});

test('a visual change exposes decodable baseline, current and diff images', async t => {
  let cwd = await createProject(t);
  let first = await runCapture(cwd, 'red');
  assert.equal(first.code, 0, first.stderr);
  let changed = await runCapture(cwd, 'blue');
  assert.equal(changed.code, 1, changed.stderr);
  assert.equal(changed.data.summary.failed, 1);
  assert.equal(changed.data.capture.accepted, 1);
  assert.equal(changed.data.capture.rejected, 0);
  for (let image of Object.values(changed.data.comparisons[0].paths)) {
    assert.ok(image);
    assert.equal(compareSync(image, image).images.current.width, 8);
  }
});

test('explicit baseline replacement still rejects corrupt image bytes', async t => {
  let cwd = await createProject(t);
  let first = await runCapture(cwd, 'red');
  let baseline = first.data.comparisons[0].paths.baseline;
  let before = await readFile(baseline);
  let rejected = await runCapture(cwd, 'invalid-replace', ['--set-baseline']);
  assert.equal(rejected.code, 1, rejected.stderr);
  assert.equal(rejected.data.capture.rejected, 1);
  assert.deepEqual(await readFile(baseline), before);
});

test('a good capture does not hide another rejected screenshot', async t => {
  let cwd = await createProject(t);
  let result = await runCapture(cwd, 'mixed');
  assert.equal(result.code, 1);
  assert.equal(result.data.capture.accepted, 1);
  assert.equal(result.data.capture.rejected, 1);
  assert.equal(result.data.summary.total, 1);
  await access(result.data.reportPath);
});

test('comparison errors are retained and fail the visual run', async t => {
  let cwd = await createProject(t);
  let first = await runCapture(cwd, 'valid');
  await writeFile(first.data.comparisons[0].paths.baseline, 'invalid-baseline');
  let result = await runCapture(cwd, 'valid');
  assert.equal(result.code, 1);
  assert.equal(result.data.summary.errors, 1);
  assert.equal(result.data.capture.errors, 1);
});

test('test failures preserve the captures that completed before failure', async t => {
  let cwd = await createProject(t);
  let result = await runCapture(cwd, 'valid-fail');
  assert.equal(result.code, 1);
  assert.equal(result.data.capture.accepted, 1);
  assert.equal(result.data.summary.new, 1);
  await access(result.data.reportPath);
  assert.match(result.data.error.message, /exited with code 1/);
});

test('report generation failure does not advertise a usable report', async t => {
  let cwd = await createProject(t);
  let result = await runCapture(cwd, 'report-failure');
  assert.equal(result.code, 1);
  assert.equal(result.data.capture.accepted, 1);
  assert.equal(result.data.reportPath, null);
  assert.ok(result.data.reportError);
});

test('server setup fallback is explicit even if the test command passes', async t => {
  let cwd = await createProject(t);
  await writeFile(path.join(cwd, '.vizzly'), 'Blocks server state directory');
  let result = await runCapture(cwd, 'zero');
  assert.equal(result.code, 1);
  assert.equal(result.data.capture.setup, 'disabled');
  assert.ok(result.data.capture.reason);
  assert.equal(result.data.reportPath, null);
});
