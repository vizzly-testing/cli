import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import {
  buildDaemonChildArgs,
  buildDashboardUrl,
  buildLegacyServerInfo,
  buildOpenDashboardCommand,
  cleanupDaemonState,
  cleanupLegacyGlobalServerFile,
  cleanupLocalDaemonFiles,
  findDaemonPidByPort,
  getLocalDaemonFiles,
  readDaemonPidFile,
  removeFileIfExists,
  resolveDaemonPid,
  validateTddStartOptions,
  waitForDaemonChildInit,
  waitForProcessExit,
  waitForServerRunning,
  writeLegacyGlobalServerFile,
} from '../../src/commands/tdd-daemon.js';

function createManualTimers() {
  let timers = new Map();
  let nextId = 1;

  return {
    setTimeout(fn, ms) {
      let id = nextId++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    trigger(id) {
      let timer = timers.get(id);
      timers.delete(id);
      timer?.fn();
    },
    get(id) {
      return timers.get(id);
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
}

async function triggerTimer(timers, id) {
  for (let i = 0; i < 5 && !timers.get(id); i++) {
    await flushMicrotasks();
  }
  timers.trigger(id);
  await flushMicrotasks();
}

function createLsofProcess({ output = '', closeCode = 0, emitError = false }) {
  let child = new EventEmitter();
  child.stdout = new EventEmitter();

  queueMicrotask(() => {
    if (emitError) {
      child.emit('error', new Error('lsof unavailable'));
      return;
    }

    if (output) {
      child.stdout.emit('data', output);
    }
    child.emit('close', closeCode);
  });

  return child;
}

describe('commands/tdd-daemon helpers', () => {
  describe('daemon file helpers', () => {
    it('resolves local daemon files for a workspace', () => {
      assert.deepStrictEqual(getLocalDaemonFiles('/repo/app'), {
        vizzlyDir: '/repo/app/.vizzly',
        pidFile: '/repo/app/.vizzly/server.pid',
        serverFile: '/repo/app/.vizzly/server.json',
        logFile: '/repo/app/.vizzly/server.log',
      });
    });

    it('removes files only when they exist', () => {
      let removed = [];
      let existing = new Set(['/repo/app/.vizzly/server.pid']);

      assert.strictEqual(
        removeFileIfExists('/repo/app/.vizzly/server.pid', {
          existsSync: path => existing.has(path),
          unlinkSync: path => {
            removed.push(path);
            existing.delete(path);
          },
        }),
        true
      );
      assert.strictEqual(
        removeFileIfExists('/repo/app/.vizzly/server.json', {
          existsSync: path => existing.has(path),
          unlinkSync: path => removed.push(path),
        }),
        false
      );
      assert.deepStrictEqual(removed, ['/repo/app/.vizzly/server.pid']);
    });

    it('cleans local pid and server files together', () => {
      let removed = [];
      let existing = new Set([
        '/repo/app/.vizzly/server.pid',
        '/repo/app/.vizzly/server.json',
      ]);

      let result = cleanupLocalDaemonFiles('/repo/app', {
        existsSync: path => existing.has(path),
        unlinkSync: path => removed.push(path),
      });

      assert.deepStrictEqual(result, {
        pidFileRemoved: true,
        serverFileRemoved: true,
      });
      assert.deepStrictEqual(removed, [
        '/repo/app/.vizzly/server.pid',
        '/repo/app/.vizzly/server.json',
      ]);
    });

    it('writes the legacy global server file for SDK discovery', () => {
      let createdDirectories = [];
      let writes = [];

      let result = writeLegacyGlobalServerFile(
        { pid: 1234, port: 47400 },
        {
          home: () => '/home/test',
          exists: () => false,
          mkdir: (path, options) => {
            createdDirectories.push({ path, options });
          },
          writeFile: (path, contents) => {
            writes.push({ path, contents: JSON.parse(contents) });
          },
          now: () => 987654321,
        }
      );

      assert.deepStrictEqual(createdDirectories, [
        { path: '/home/test/.vizzly', options: { recursive: true } },
      ]);
      assert.deepStrictEqual(writes, [
        {
          path: '/home/test/.vizzly/server.json',
          contents: {
            pid: 1234,
            port: '47400',
            startTime: 987654321,
          },
        },
      ]);
      assert.deepStrictEqual(result, {
        path: '/home/test/.vizzly/server.json',
        serverInfo: buildLegacyServerInfo({
          pid: 1234,
          port: 47400,
          now: () => 987654321,
        }),
      });
    });

    it('cleans the legacy global server file when present', () => {
      let removed = [];
      let didRemove = cleanupLegacyGlobalServerFile({
        home: () => '/home/test',
        exists: path => path === '/home/test/.vizzly/server.json',
        unlink: path => removed.push(path),
      });

      assert.strictEqual(didRemove, true);
      assert.deepStrictEqual(removed, ['/home/test/.vizzly/server.json']);
    });

    it('cleans local files, legacy global state, and registry entries together', () => {
      let removed = [];
      let registryCalls = [];
      let localFiles = new Set([
        '/repo/app/.vizzly/server.pid',
        '/repo/app/.vizzly/server.json',
      ]);
      let legacyFiles = new Set(['/home/test/.vizzly/server.json']);

      let result = cleanupDaemonState({
        port: 47400,
        directory: '/repo/app',
        registry: {
          unregister: args => registryCalls.push(args),
        },
        localFileDeps: {
          existsSync: path => localFiles.has(path),
          unlinkSync: path => removed.push(path),
        },
        legacyFileDeps: {
          home: () => '/home/test',
          exists: path => legacyFiles.has(path),
          unlink: path => removed.push(path),
        },
      });

      assert.deepStrictEqual(result, {
        pidFileRemoved: true,
        serverFileRemoved: true,
        legacyGlobalServerFileRemoved: true,
      });
      assert.deepStrictEqual(removed, [
        '/repo/app/.vizzly/server.pid',
        '/repo/app/.vizzly/server.json',
        '/home/test/.vizzly/server.json',
      ]);
      assert.deepStrictEqual(registryCalls, [
        { port: 47400, directory: '/repo/app' },
      ]);
    });

    it('cleans daemon files even when registry cleanup fails', () => {
      let removed = [];

      let result = cleanupDaemonState({
        directory: '/repo/app',
        registry: {
          unregister: () => {
            throw new Error('registry unavailable');
          },
        },
        localFileDeps: {
          existsSync: path => path === '/repo/app/.vizzly/server.pid',
          unlinkSync: path => removed.push(path),
        },
        legacyFileDeps: {
          home: () => '/home/test',
          exists: () => false,
          unlink: path => removed.push(path),
        },
      });

      assert.deepStrictEqual(result, {
        pidFileRemoved: true,
        serverFileRemoved: false,
        legacyGlobalServerFileRemoved: false,
      });
      assert.deepStrictEqual(removed, ['/repo/app/.vizzly/server.pid']);
    });
  });

  describe('daemon pid discovery', () => {
    it('reads a daemon pid from a valid pid file', () => {
      let pid = readDaemonPidFile('/repo/app/.vizzly/server.pid', {
        existsSync: () => true,
        readFileSync: () => '1234\n',
      });

      assert.strictEqual(pid, 1234);
    });

    it('treats missing, unreadable, and invalid pid files as no process', () => {
      assert.strictEqual(
        readDaemonPidFile('/repo/app/.vizzly/server.pid', {
          existsSync: () => false,
          readFileSync: () => '1234',
        }),
        null
      );
      assert.strictEqual(
        readDaemonPidFile('/repo/app/.vizzly/server.pid', {
          existsSync: () => true,
          readFileSync: () => {
            throw new Error('permission denied');
          },
        }),
        null
      );
      assert.strictEqual(
        readDaemonPidFile('/repo/app/.vizzly/server.pid', {
          existsSync: () => true,
          readFileSync: () => 'not-a-pid',
        }),
        null
      );
      assert.strictEqual(
        readDaemonPidFile('/repo/app/.vizzly/server.pid', {
          existsSync: () => true,
          readFileSync: () => '1234abc',
        }),
        null
      );
      assert.strictEqual(
        readDaemonPidFile('/repo/app/.vizzly/server.pid', {
          existsSync: () => true,
          readFileSync: () => '0',
        }),
        null
      );
    });

    it('finds the first process listening on the daemon port', async () => {
      let calls = [];
      let pid = await findDaemonPidByPort(47400, {
        spawnProcess: (command, args, options) => {
          calls.push({ command, args, options });
          return createLsofProcess({ output: '4321\n9876\n' });
        },
      });

      assert.strictEqual(pid, 4321);
      assert.deepStrictEqual(calls, [
        {
          command: 'lsof',
          args: ['-ti', ':47400'],
          options: { stdio: 'pipe' },
        },
      ]);
    });

    it('returns no pid when port lookup fails or returns invalid output', async () => {
      assert.strictEqual(
        await findDaemonPidByPort(47400, {
          spawnProcess: () => createLsofProcess({ output: '', closeCode: 1 }),
        }),
        null
      );
      assert.strictEqual(
        await findDaemonPidByPort(47400, {
          spawnProcess: () => createLsofProcess({ output: 'nope\n' }),
        }),
        null
      );
      assert.strictEqual(
        await findDaemonPidByPort(47400, {
          spawnProcess: () => createLsofProcess({ output: '4321abc\n' }),
        }),
        null
      );
      assert.strictEqual(
        await findDaemonPidByPort(47400, {
          spawnProcess: () => createLsofProcess({ emitError: true }),
        }),
        null
      );
      assert.strictEqual(
        await findDaemonPidByPort(47400, {
          spawnProcess: () => {
            throw new Error('spawn failed');
          },
        }),
        null
      );
    });

    it('prefers the pid file before falling back to port discovery', async () => {
      let findByPortCalls = 0;
      let pid = await resolveDaemonPid({
        port: 47400,
        pidFile: '/repo/app/.vizzly/server.pid',
        readPid: pidFile => {
          assert.strictEqual(pidFile, '/repo/app/.vizzly/server.pid');
          return 1234;
        },
        findByPort: () => {
          findByPortCalls++;
          return 4321;
        },
      });

      assert.strictEqual(pid, 1234);
      assert.strictEqual(findByPortCalls, 0);
    });

    it('falls back to port discovery when the pid file is stale', async () => {
      let pid = await resolveDaemonPid({
        port: 47400,
        readPid: () => null,
        findByPort: port => {
          assert.strictEqual(port, 47400);
          return 4321;
        },
      });

      assert.strictEqual(pid, 4321);
    });
  });

  describe('buildDaemonChildArgs', () => {
    it('builds daemon child args from explicit options', () => {
      let args = buildDaemonChildArgs({
        entrypoint: '/repo/bin/vizzly.js',
        port: 47400,
        options: {
          open: true,
          baselineBuild: 'build-123',
          baselineComparison: 'comparison-456',
          environment: 'staging',
          threshold: 0.05,
          minClusterSize: 4,
          timeout: '45000',
          failOnDiff: true,
          token: 'token-abc',
        },
        globalOptions: {
          json: true,
          verbose: true,
          noColor: true,
        },
      });

      assert.deepStrictEqual(args, [
        '/repo/bin/vizzly.js',
        'tdd',
        'start',
        '--daemon-child',
        '--port',
        '47400',
        '--open',
        '--baseline-build',
        'build-123',
        '--baseline-comparison',
        'comparison-456',
        '--environment',
        'staging',
        '--threshold',
        '0.05',
        '--min-cluster-size',
        '4',
        '--timeout',
        '45000',
        '--fail-on-diff',
        '--token',
        'token-abc',
        '--json',
        '--verbose',
        '--no-color',
      ]);
    });
  });

  describe('validateTddStartOptions', () => {
    it('accepts valid comparison options', () => {
      assert.deepStrictEqual(
        validateTddStartOptions({ threshold: '0', minClusterSize: '1' }),
        []
      );
    });

    it('rejects invalid comparison options', () => {
      assert.deepStrictEqual(
        validateTddStartOptions({
          threshold: '-1',
          minClusterSize: '2.5',
        }),
        [
          'Threshold must be a non-negative number (CIEDE2000 Delta E)',
          'Min cluster size must be a positive integer',
        ]
      );
    });
  });

  describe('dashboard open helpers', () => {
    it('builds the local dashboard URL for a port', () => {
      assert.strictEqual(buildDashboardUrl(47400), 'http://localhost:47400');
    });

    it('uses open on macOS', () => {
      assert.deepStrictEqual(
        buildOpenDashboardCommand('http://localhost:47400', 'darwin'),
        {
          command: 'open',
          args: ['http://localhost:47400'],
        }
      );
    });

    it('uses xdg-open on Linux', () => {
      assert.deepStrictEqual(
        buildOpenDashboardCommand('http://localhost:47400', 'linux'),
        {
          command: 'xdg-open',
          args: ['http://localhost:47400'],
        }
      );
    });

    it('uses cmd start on Windows because start is a shell built-in', () => {
      assert.deepStrictEqual(
        buildOpenDashboardCommand('http://localhost:47400', 'win32'),
        {
          command: 'cmd',
          args: ['/c', 'start', '', 'http://localhost:47400'],
        }
      );
    });
  });

  describe('waitForDaemonChildInit', () => {
    it('resolves when the daemon child disconnects after initialization', async () => {
      let timers = createManualTimers();
      let child = new EventEmitter();

      let promise = waitForDaemonChildInit(child, { timers });
      child.emit('disconnect');

      let result = await promise;

      assert.deepStrictEqual(result, { ok: true });
      assert.strictEqual(timers.get(1), undefined);
      assert.strictEqual(child.listenerCount('disconnect'), 0);
      assert.strictEqual(child.listenerCount('exit'), 0);
    });

    it('returns an exit result when the daemon child exits first', async () => {
      let timers = createManualTimers();
      let child = new EventEmitter();

      let promise = waitForDaemonChildInit(child, { timers });
      child.emit('exit');

      let result = await promise;

      assert.deepStrictEqual(result, { ok: false, reason: 'exit' });
      assert.strictEqual(timers.get(1), undefined);
      assert.strictEqual(child.listenerCount('disconnect'), 0);
      assert.strictEqual(child.listenerCount('exit'), 0);
    });

    it('returns a timeout result and removes listeners', async () => {
      let timers = createManualTimers();
      let child = new EventEmitter();

      let promise = waitForDaemonChildInit(child, { timers });
      await triggerTimer(timers, 1);

      let result = await promise;

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.reason, 'timeout');
      assert.match(result.error.message, /initialization timed out/);
      assert.strictEqual(child.listenerCount('disconnect'), 0);
      assert.strictEqual(child.listenerCount('exit'), 0);
    });
  });

  describe('waitForServerRunning', () => {
    it('checks immediately and returns when the health check succeeds', async () => {
      let calls = [];

      let running = await waitForServerRunning(47400, {
        isRunning: async port => {
          calls.push(port);
          return true;
        },
      });

      assert.strictEqual(running, true);
      assert.deepStrictEqual(calls, [47400]);
    });

    it('waits between concrete health checks until the server responds', async () => {
      let timers = createManualTimers();
      let attempts = 0;
      let promise = waitForServerRunning(47400, {
        maxAttempts: 3,
        delayMs: 200,
        timers,
        isRunning: async () => {
          attempts++;
          return attempts === 3;
        },
      });

      await triggerTimer(timers, 1);
      await triggerTimer(timers, 2);

      assert.strictEqual(await promise, true);
      assert.strictEqual(attempts, 3);
    });

    it('returns false when all health checks fail', async () => {
      let timers = createManualTimers();
      let promise = waitForServerRunning(47400, {
        maxAttempts: 2,
        delayMs: 200,
        timers,
        isRunning: async () => false,
      });

      await triggerTimer(timers, 1);

      assert.strictEqual(await promise, false);
    });
  });

  describe('waitForProcessExit', () => {
    it('returns true immediately when the process is already gone', async () => {
      let exited = await waitForProcessExit(123, {
        processRunning: () => false,
      });

      assert.strictEqual(exited, true);
    });

    it('returns true once the process exits during the grace period', async () => {
      let timers = createManualTimers();
      let checks = 0;
      let promise = waitForProcessExit(123, {
        timeoutMs: 300,
        intervalMs: 100,
        timers,
        processRunning: () => {
          checks++;
          return checks < 2;
        },
      });

      await triggerTimer(timers, 1);

      assert.strictEqual(await promise, true);
      assert.strictEqual(checks, 2);
    });

    it('returns false when the process is still running after the grace period', async () => {
      let timers = createManualTimers();
      let promise = waitForProcessExit(123, {
        timeoutMs: 200,
        intervalMs: 100,
        timers,
        processRunning: () => true,
      });

      await triggerTimer(timers, 1);
      await triggerTimer(timers, 2);

      assert.strictEqual(await promise, false);
    });
  });
});
