import { fork } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateBaselineFilename,
  generateScreenshotSignature,
} from '../../src/tdd/core/signature.js';

let fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function writeReporterFixture(fixtureData, workingDir) {
  let data = structuredClone(fixtureData);
  let stateDir = join(workingDir, '.vizzly');
  let details = {};
  for (let folder of ['baselines', 'current', 'diffs']) {
    await mkdir(join(stateDir, folder), { recursive: true });
  }
  for (let comparison of data.comparisons) {
    comparison.name = comparison.originalName || comparison.name;
    comparison.signature = generateScreenshotSignature(
      comparison.name,
      comparison.properties
    );
    let filename = generateBaselineFilename(
      comparison.name,
      comparison.signature
    );
    for (let [field, folder] of [
      ['current', 'current'],
      ['baseline', 'baselines'],
      ['diff', 'diffs'],
    ]) {
      if (!comparison[field]) continue;
      await copyFile(
        join(fixtures, comparison[field].replace(/^\//, '')),
        join(stateDir, folder, filename)
      );
      comparison[field] = `/images/${folder}/${filename}`;
    }
    if (comparison.diffClusters) {
      details[comparison.id] = { diffClusters: comparison.diffClusters };
      delete comparison.diffClusters;
    }
  }
  await writeFile(
    join(stateDir, 'comparison-details.json'),
    JSON.stringify(details)
  );
  await writeFile(join(stateDir, 'report-data.json'), JSON.stringify(data));
  return data;
}

export async function startRealReporter(fixtureData, port = 0) {
  let workingDir = await mkdtemp(join(tmpdir(), 'vizzly-review-'));
  let child;
  let exited;
  let shutdown;
  let killChild = () => child?.kill();
  let stop = () => {
    shutdown ??= (async () => {
      try {
        if (child && child.exitCode === null && child.signalCode === null) {
          if (child.connected) {
            child.send('stop', error => {
              if (error) child.kill();
            });
          } else {
            child.kill();
          }
          await exited;
        }
      } finally {
        process.removeListener('exit', killChild);
        await rm(workingDir, { recursive: true, force: true });
      }
    })();
    return shutdown;
  };

  try {
    let data = await writeReporterFixture(fixtureData, workingDir);
    child = fork(
      fileURLToPath(new URL('./real-server.js', import.meta.url)),
      [],
      {
        cwd: workingDir,
        execArgv: [],
        env: {
          ...process.env,
          VIZZLY_HOME: join(workingDir, 'home'),
          REPORTER_TEST_PORT: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      }
    );
    process.once('exit', killChild);
    exited = new Promise(resolve => child.once('close', resolve));
    let logs = '';
    child.stdout.on('data', chunk => {
      logs += chunk;
    });
    child.stderr.on('data', chunk => {
      logs += chunk;
    });
    let boundPort = await new Promise((resolve, reject) => {
      let cleanup = () => {
        child.off('message', ready);
        child.off('error', failed);
        child.off('exit', earlyExit);
      };
      let ready = message => {
        if (!message.ready) return;
        cleanup();
        resolve(message.port);
      };
      let failed = error => {
        cleanup();
        reject(error);
      };
      let earlyExit = code =>
        failed(new Error(`Reporter exited (${code}): ${logs}`));
      child.on('message', ready);
      child.once('error', failed);
      child.once('exit', earlyExit);
    });
    return {
      data,
      workingDir,
      url: `http://127.0.0.1:${boundPort}`,
      readReport: async () =>
        JSON.parse(
          await readFile(
            join(workingDir, '.vizzly', 'report-data.json'),
            'utf8'
          )
        ),
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
