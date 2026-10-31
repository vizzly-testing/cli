import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

let root = fileURLToPath(new URL('../../', import.meta.url));
let checker = await readFile(
  new URL('../../scripts/check-architecture.js', import.meta.url),
  'utf8'
);

async function checkFixture(t, files) {
  let directory = await mkdtemp(join(tmpdir(), 'vizzly-architecture-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await symlink(
    join(root, 'node_modules'),
    join(directory, 'node_modules'),
    'dir'
  );
  for (let [filename, source] of Object.entries({
    'package.json': '{"type":"module"}',
    'scripts/check-architecture.js': checker,
    ...files,
  })) {
    let target = join(directory, filename);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  return spawnSync(
    process.execPath,
    [join(directory, 'scripts/check-architecture.js')],
    { encoding: 'utf8' }
  );
}

test('domain contracts can compose pure helpers and the reporter can consume its explicit shared contract', async t => {
  let result = await checkFixture(t, {
    'src/services/math.js': 'export let add = (a, b) => a + b;',
    'src/domains/example/example.normalizers.js':
      "import { add } from '../../services/math.js'; export let normalize = value => add(value, 1);",
    'src/domains/reports/report.normalizers.js':
      'export let normalize = value => value;',
    'src/reporter/src/view.js':
      "import { normalize } from '../../domains/reports/report.normalizers.js'; export let view = normalize({});",
    'src/reporter/src/view.test.js':
      "import { readFile } from 'node:fs/promises';",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Architecture checks passed/);
});

test('the architecture command rejects hidden I/O, operation imports and browser boundary violations', async t => {
  for (let [files, diagnostic] of [
    [
      {
        'src/domains/example/example.normalizers.js':
          "import { request } from '../../services/fetch-utils.js'; export let normalize = request;",
        'src/services/fetch-utils.js':
          'export let request = url => fetch(url);',
      },
      /pure contract depends on I\/O or operations:.*fetch-utils.js -> fetch/,
    ],
    [
      {
        'src/domains/example/example.normalizers.js':
          "import { read } from '../../services/files.js'; export let normalize = read;",
        'src/services/files.js':
          "import { readFile } from 'fs/promises'; export let read = readFile;",
      },
      /pure contract depends on I\/O or operations:.*files.js -> fs\/promises/,
    ],
    [
      {
        'src/domains/example/example.validations.js':
          "import { perform } from './example.service.js'; export let validate = perform;",
        'src/domains/example/example.service.js':
          'export let perform = value => value;',
      },
      /pure contract depends on I\/O or operations:.*example.service.js/,
    ],
    [
      { 'src/reporter/src/view.js': "await import('node:fs');" },
      /browser code imports node:fs/,
    ],
    [
      {
        'src/services/example.js': "import './example.test.js';",
        'src/services/example.test.js': 'export let fixture = true;',
      },
      /production code must not import/,
    ],
  ]) {
    let result = await checkFixture(t, files);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, diagnostic);
  }
});
