import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let root = fileURLToPath(new URL('../', import.meta.url));
let ignoredDirectories = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.vizzly',
]);

function testFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    let filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : testFiles(filename);
    }
    return entry.isFile() && entry.name.endsWith('.test.js') ? [filename] : [];
  });
}

let options = process.argv.slice(2);
if (options[0] === '--') options = options.slice(1);
let watching = options.includes('--watch');
let files = ['src', 'tests', 'clients/swift/tests-js']
  .flatMap(directory => testFiles(path.join(root, directory)))
  .sort();

let child = spawn(
  process.execPath,
  [
    ...(!watching ? ['--experimental-test-coverage'] : []),
    '--test',
    '--test-concurrency=1',
    '--test-reporter=spec',
    ...options,
    ...files,
  ],
  { cwd: root, stdio: 'inherit' }
);

let requestedSignal;
function forwardSignal(signal) {
  requestedSignal = signal;
  child.kill(signal);
}

let forwardInterrupt = () => forwardSignal('SIGINT');
let forwardTermination = () => forwardSignal('SIGTERM');
process.on('SIGINT', forwardInterrupt);
process.on('SIGTERM', forwardTermination);

function removeSignalHandlers() {
  process.off('SIGINT', forwardInterrupt);
  process.off('SIGTERM', forwardTermination);
}

child.once('error', error => {
  removeSignalHandlers();
  process.stderr.write(`Unable to start tests: ${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  removeSignalHandlers();
  let exitSignal = requestedSignal || signal;
  if (exitSignal) process.kill(process.pid, exitSignal);
  else process.exitCode = code ?? 1;
});
