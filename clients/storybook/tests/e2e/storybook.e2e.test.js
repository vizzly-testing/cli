import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { parseStories } from '../../src/crawler.js';

function spawnWithOutput(command, args, options) {
  let child = spawn(command, args, options);
  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', chunk => {
    stdout += chunk.toString();
  });

  child.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });

  return { child, getOutput: () => ({ stdout, stderr }) };
}

async function getFreePort() {
  return await new Promise((resolvePromise, rejectPromise) => {
    let server = net.createServer();
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      let address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => rejectPromise(new Error('Failed to allocate port')));
        return;
      }
      let { port } = address;
      server.close(error => {
        if (error) rejectPromise(error);
        else resolvePromise(port);
      });
    });
  });
}

async function waitFor(check, { timeoutMs = 30000, intervalMs = 200 } = {}) {
  let start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      let result = await check();
      if (result) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs));
  }

  throw lastError || new Error(`Timed out after ${timeoutMs}ms`);
}

async function listPngsRecursive(dir) {
  let entries = await readdir(dir, { withFileTypes: true });
  let results = [];

  for (let entry of entries) {
    let fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listPngsRecursive(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('Storybook fixture E2E', () => {
  it(
    'captures screenshots into Vizzly TDD server',
    { timeout: 180000 },
    async () => {
      let storybookClientDir = process.cwd();
      let repoRoot = resolve(storybookClientDir, '../..');
      let vizzlyBin = join(repoRoot, 'bin', 'vizzly.js');

      let exampleDir = join(storybookClientDir, 'example-storybook');
      let storybookDist = join(exampleDir, 'dist');
      let indexJsonPath = join(storybookDist, 'index.json');

      // Ensure Storybook has been built (CI should run this beforehand).
      try {
        await readFile(indexJsonPath, 'utf-8');
      } catch {
        throw new Error(
          `Missing ${indexJsonPath}. Run \`cd ${exampleDir} && npm ci && npm run build-storybook\` before \`npm run test:e2e\`.`
        );
      }

      let indexData = JSON.parse(await readFile(indexJsonPath, 'utf-8'));
      let stories = parseStories(indexData);
      assert.ok(stories.length > 0, 'Expected fixture Storybook to contain stories');

      let storyId = stories[0].id;
      let port = await getFreePort();

      let tempProjectDir = await mkdtemp(join(tmpdir(), 'vizzly-storybook-e2e-'));
      let tempHomeDir = await mkdtemp(join(tmpdir(), 'vizzly-home-'));

      let tddProc = null;
      let tddOutput = null;

      try {
        await mkdir(join(tempProjectDir, '.vizzly'), { recursive: true });

        let { child, getOutput } = spawnWithOutput(
          process.execPath,
          [vizzlyBin, 'tdd', 'start', '--daemon-child', '--port', String(port)],
          {
            cwd: tempProjectDir,
            env: {
              ...process.env,
              HOME: tempHomeDir,
              CI: 'true',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        tddProc = child;
        tddOutput = getOutput;

        await waitFor(
          async () => {
            let response = await fetch(`http://localhost:${port}/health`);
            return response.ok;
          },
          { timeoutMs: 30000, intervalMs: 250 }
        );

        let runnerPath = join(tempProjectDir, 'run-storybook.mjs');
        let storybookEntryUrl = pathToFileURL(
          join(storybookClientDir, 'src', 'index.js')
        ).href;

        await writeFile(
          runnerPath,
          `import { run } from ${JSON.stringify(storybookEntryUrl)};\n` +
            `const logger = { info() {}, warn() {}, error() {} };\n` +
            `await run(process.env.STORYBOOK_PATH, {\n` +
            `  concurrency: 1,\n` +
            `  include: process.env.INCLUDE,\n` +
            `  viewports: process.env.VIEWPORTS,\n` +
            `  headless: true,\n` +
            `  browserArgs: process.env.BROWSER_ARGS,\n` +
            `}, { logger, config: {} });\n`,
          'utf-8'
        );

        let { child: runProc, getOutput: runOutput } = spawnWithOutput(
          process.execPath,
          [runnerPath],
          {
            cwd: tempProjectDir,
            env: {
              ...process.env,
              HOME: tempHomeDir,
              CI: 'true',
              STORYBOOK_PATH: storybookDist,
              INCLUDE: storyId,
              VIEWPORTS: 'mobile:375x667',
              BROWSER_ARGS:
                '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );

        let exitCode = await new Promise(resolvePromise => {
          runProc.on('close', code => resolvePromise(code ?? 0));
        });

        if (exitCode !== 0) {
          let { stdout, stderr } = runOutput();
          throw new Error(
            `Storybook run failed with exit code ${exitCode}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
          );
        }

        let currentDir = join(tempProjectDir, '.vizzly', 'current');

        await waitFor(
          async () => {
            try {
              let pngs = await listPngsRecursive(currentDir);
              return pngs.length > 0;
            } catch {
              return false;
            }
          },
          { timeoutMs: 30000, intervalMs: 250 }
        );
      } catch (error) {
        if (tddOutput) {
          let { stdout, stderr } = tddOutput();
          throw new Error(
            `${error.message}\n\nTDD STDOUT:\n${stdout}\n\nTDD STDERR:\n${stderr}`
          );
        }
        throw error;
      } finally {
        if (tddProc && tddProc.exitCode === null) {
          tddProc.kill('SIGTERM');
          await Promise.race([
            new Promise(resolvePromise => tddProc.once('exit', resolvePromise)),
            new Promise(resolvePromise => setTimeout(resolvePromise, 5000)),
          ]);
          if (tddProc.exitCode === null) {
            tddProc.kill('SIGKILL');
          }
        }
        await rm(tempProjectDir, { recursive: true, force: true });
        await rm(tempHomeDir, { recursive: true, force: true });
      }
    }
  );
});
