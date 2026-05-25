import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let scriptDir = dirname(fileURLToPath(import.meta.url));
let swiftPackageDir = resolve(scriptDir, '..');
let repoRoot = resolve(swiftPackageDir, '../..');
let cliPath = join(repoRoot, 'bin/vizzly.js');
let distCliPath = join(repoRoot, 'dist/cli.js');

if (!existsSync(distCliPath)) {
  console.error('Build the CLI first: pnpm run build');
  process.exit(1);
}

let tempDir = mkdtempSync(join(tmpdir(), 'vizzly-swift-e2e-'));
let vizzlyHome = join(tempDir, '.vizzly-home');
let swiftTestCommand = [
  'cd',
  JSON.stringify(swiftPackageDir),
  '&&',
  'swift',
  'test',
  '--filter',
  'VizzlyE2ETests',
].join(' ');

function cleanupAndExit(code = 1) {
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(code);
}

function printLocalContext() {
  let contextResult = spawnSync(
    process.execPath,
    [cliPath, 'context', 'build', 'current', '--source', 'local', '--agent'],
    {
      cwd: tempDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        VIZZLY_HOME: vizzlyHome,
      },
    }
  );

  if (contextResult.stdout) {
    process.stdout.write(contextResult.stdout);
  }

  if (contextResult.stderr) {
    process.stderr.write(contextResult.stderr);
  }

  return contextResult.status ?? 1;
}

let child = spawn(
  process.execPath,
  [cliPath, 'tdd', 'run', swiftTestCommand, '--no-color'],
  {
    cwd: tempDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VIZZLY_E2E: '1',
      VIZZLY_HOME: vizzlyHome,
    },
  }
);

child.on('exit', code => {
  if (code !== 0) {
    cleanupAndExit(code ?? 1);
  }

  let contextStatus = printLocalContext();
  cleanupAndExit(contextStatus);
});

child.on('error', error => {
  console.error(error);
  cleanupAndExit(1);
});
