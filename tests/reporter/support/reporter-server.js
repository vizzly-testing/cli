import { fork } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeReporterFixture } from './write-reporter-fixture.js';

export async function startRealReporter(fixtureData, options = {}) {
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
    await writeFile(
      join(workingDir, '.vizzlyrc.json'),
      JSON.stringify({
        comparison: { threshold: 2 },
        server: { port: 47392, timeout: 30000 },
        build: { name: 'Build {timestamp}', environment: 'test' },
        tdd: { openReport: false },
      })
    );
    child = fork(
      fileURLToPath(new URL('./server-process.js', import.meta.url)),
      [],
      {
        cwd: workingDir,
        execArgv: [],
        env: {
          ...process.env,
          VIZZLY_HOME: join(workingDir, 'home'),
          REPORTER_TEST_API_URL: options.apiUrl,
          REPORTER_TEST_SIGNED_IN: String(options.signedIn || false),
          VIZZLY_API_URL: options.apiUrl,
          VIZZLY_THRESHOLD: '',
          VIZZLY_MIN_CLUSTER_SIZE: '',
          VIZZLY_PORT: '',
          VIZZLY_TOKEN: '',
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
      readConfig: async () =>
        JSON.parse(await readFile(join(workingDir, '.vizzlyrc.json'), 'utf8')),
      readAuth: async () =>
        JSON.parse(
          await readFile(join(workingDir, 'home', 'config.json'), 'utf8')
        ).auth,
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
