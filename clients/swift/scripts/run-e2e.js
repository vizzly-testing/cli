import { spawn } from 'node:child_process';
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
  console.error('Build the CLI first: npm run build');
  process.exit(1);
}

let tempDir = mkdtempSync(join(tmpdir(), 'vizzly-swift-e2e-'));
let swiftTestCommand = [
  'cd',
  JSON.stringify(swiftPackageDir),
  '&&',
  'swift',
  'test',
  '--filter',
  'VizzlyE2ETests',
].join(' ');

let child = spawn(
  process.execPath,
  [cliPath, 'tdd', 'run', swiftTestCommand, '--no-color'],
  {
    cwd: tempDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VIZZLY_E2E: '1',
      VIZZLY_HOME: join(tempDir, '.vizzly-home'),
    },
  }
);

child.on('exit', code => {
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(code ?? 1);
});

child.on('error', error => {
  rmSync(tempDir, { recursive: true, force: true });
  console.error(error);
  process.exit(1);
});
