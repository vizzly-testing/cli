import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ServerRegistry } from '../../src/tdd/server-registry.js';

/**
 * Create an isolated registry using a temp directory
 */
function createTestRegistry(testDir) {
  let registry = new ServerRegistry();
  registry.vizzlyHome = testDir;
  registry.registryPath = join(testDir, 'servers.json');
  // Disable menubar notifications in tests
  registry.notifyMenubar = () => {};
  return registry;
}

/**
 * Start a TCP server on a port (to simulate a port being in use)
 */
function occupyPort(port) {
  return new Promise((resolve, reject) => {
    let server = createServer();
    server.once('error', reject);
    server.once('listening', () => resolve(server));
    server.listen(port, '127.0.0.1');
  });
}

describe('tdd/server-registry', () => {
  let testDir;
  let registry;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `vizzly-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    registry = createTestRegistry(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('register and find', () => {
    it('can register a server and find it by directory', () => {
      registry.register({
        pid: 12345,
        port: 47392,
        directory: '/projects/my-app',
        name: 'my-app',
      });

      let found = registry.find({ directory: '/projects/my-app' });
      assert.strictEqual(found.port, 47392);
      assert.strictEqual(found.pid, 12345);
      assert.strictEqual(found.name, 'my-app');
    });

    it('can register a server and find it by port', () => {
      registry.register({
        pid: 12345,
        port: 47393,
        directory: '/projects/my-app',
      });

      let found = registry.find({ port: 47393 });
      assert.strictEqual(found.directory, '/projects/my-app');
    });

    it('returns null when server not found', () => {
      let found = registry.find({ directory: '/nonexistent' });
      assert.strictEqual(found, undefined);
    });
  });

  describe('unregister', () => {
    it('removes server by directory', () => {
      registry.register({
        pid: 12345,
        port: 47392,
        directory: '/projects/app-a',
      });
      registry.register({
        pid: 12346,
        port: 47393,
        directory: '/projects/app-b',
      });

      registry.unregister({ directory: '/projects/app-a' });

      assert.strictEqual(
        registry.find({ directory: '/projects/app-a' }),
        undefined
      );
      assert.notStrictEqual(
        registry.find({ directory: '/projects/app-b' }),
        undefined
      );
    });

    it('removes server by port', () => {
      registry.register({
        pid: 12345,
        port: 47392,
        directory: '/projects/app-a',
      });

      registry.unregister({ port: 47392 });

      assert.strictEqual(registry.find({ port: 47392 }), undefined);
    });
  });

  describe('list', () => {
    it('returns all registered servers', () => {
      registry.register({ pid: 1, port: 47392, directory: '/a' });
      registry.register({ pid: 2, port: 47393, directory: '/b' });
      registry.register({ pid: 3, port: 47394, directory: '/c' });

      let servers = registry.list();
      assert.strictEqual(servers.length, 3);
    });

    it('returns empty array when no servers', () => {
      let servers = registry.list();
      assert.deepStrictEqual(servers, []);
    });
  });

  describe('getUsedPorts', () => {
    it('returns set of all registered ports', () => {
      registry.register({ pid: 1, port: 47392, directory: '/a' });
      registry.register({ pid: 2, port: 47395, directory: '/b' });

      let usedPorts = registry.getUsedPorts();
      assert.strictEqual(usedPorts.has(47392), true);
      assert.strictEqual(usedPorts.has(47395), true);
      assert.strictEqual(usedPorts.has(47393), false);
    });
  });

  describe('cleanupStale', () => {
    it('removes servers with non-existent PIDs', () => {
      // Register a server with a PID that definitely doesn't exist
      registry.register({
        pid: 999999999,
        port: 47392,
        directory: '/projects/dead-app',
      });

      let cleaned = registry.cleanupStale();

      assert.strictEqual(cleaned, 1);
      assert.strictEqual(
        registry.find({ directory: '/projects/dead-app' }),
        undefined
      );
    });

    it('keeps servers with existing PIDs', () => {
      // Use current process PID - definitely exists
      registry.register({
        pid: process.pid,
        port: 47392,
        directory: '/projects/live-app',
      });

      let cleaned = registry.cleanupStale();

      assert.strictEqual(cleaned, 0);
      assert.notStrictEqual(
        registry.find({ directory: '/projects/live-app' }),
        null
      );
    });
  });

  describe('findAvailablePort', () => {
    // Use high port range (48500+) to avoid conflicts with running TDD servers
    let testBasePort = 48500;

    it('returns default port when nothing is using it', async () => {
      let port = await registry.findAvailablePort(testBasePort);
      assert.strictEqual(port, testBasePort);
    });

    it('skips ports registered in the registry', async () => {
      // Register servers on testBasePort and testBasePort+1 with current PID so they're not cleaned up
      registry.register({
        pid: process.pid,
        port: testBasePort,
        directory: '/a',
      });
      registry.register({
        pid: process.pid,
        port: testBasePort + 1,
        directory: '/b',
      });

      let port = await registry.findAvailablePort(testBasePort);
      assert.strictEqual(port, testBasePort + 2);
    });

    it('skips ports actually in use by other processes', async () => {
      // Actually occupy port 47500 with a real TCP server
      let occupyingServer = await occupyPort(47500);

      try {
        let port = await registry.findAvailablePort(47500);
        assert.strictEqual(port, 47501);
      } finally {
        occupyingServer.close();
      }
    });

    it('handles combination of registered and occupied ports', async () => {
      // Register 47600 in registry
      registry.register({ pid: process.pid, port: 47600, directory: '/a' });

      // Actually occupy 47601
      let occupyingServer = await occupyPort(47601);

      try {
        let port = await registry.findAvailablePort(47600);
        // Should skip 47600 (registered) and 47601 (occupied), return 47602
        assert.strictEqual(port, 47602);
      } finally {
        occupyingServer.close();
      }
    });
  });

  describe('corrupted registry file', () => {
    it('recovers from corrupted JSON', () => {
      writeFileSync(registry.registryPath, 'not valid json{{{');

      // Should not throw, returns empty
      let servers = registry.list();
      assert.deepStrictEqual(servers, []);

      // Can still register new servers
      registry.register({ pid: 1, port: 47392, directory: '/a' });
      assert.strictEqual(registry.list().length, 1);
    });
  });

  describe('replaces existing entries', () => {
    it('replaces server when same directory is registered again', () => {
      registry.register({ pid: 1, port: 47392, directory: '/projects/app' });
      registry.register({ pid: 2, port: 47393, directory: '/projects/app' });

      let servers = registry.list();
      assert.strictEqual(servers.length, 1);
      assert.strictEqual(servers[0].port, 47393);
      assert.strictEqual(servers[0].pid, 2);
    });

    it('replaces server when same port is registered again', () => {
      registry.register({ pid: 1, port: 47392, directory: '/projects/app-a' });
      registry.register({ pid: 2, port: 47392, directory: '/projects/app-b' });

      let servers = registry.list();
      assert.strictEqual(servers.length, 1);
      assert.strictEqual(servers[0].directory, '/projects/app-b');
    });
  });
});
