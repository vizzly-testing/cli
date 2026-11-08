import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let scriptDir = dirname(fileURLToPath(import.meta.url));
let swiftPackageDir = resolve(scriptDir, '..');
let repoRoot = resolve(swiftPackageDir, '../..');
let cliPath = join(repoRoot, 'bin/vizzly.js');
let distCliPath = join(repoRoot, 'dist/adapters/cli/cli.js');

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

function printLocalScreenshots() {
  let screenshotsResult = spawnSync(
    process.execPath,
    [cliPath, 'tdd', 'screenshots', 'list', '--json'],
    {
      cwd: tempDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        VIZZLY_HOME: vizzlyHome,
      },
    }
  );

  if (screenshotsResult.stdout) {
    process.stdout.write(screenshotsResult.stdout);
  }

  if (screenshotsResult.stderr) {
    process.stderr.write(screenshotsResult.stderr);
  }

  return screenshotsResult.status ?? 1;
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

  let screenshotsStatus = printLocalScreenshots();
  cleanupAndExit(screenshotsStatus);
});

child.on('error', error => {
  console.error(error);
  cleanupAndExit(1);
});
