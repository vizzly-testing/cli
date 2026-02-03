import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Manages a global registry of running TDD servers at ~/.vizzly/servers.json
 * Enables the menubar app to discover and manage multiple concurrent servers.
 */
export class ServerRegistry {
  constructor() {
    this.vizzlyHome = process.env.VIZZLY_HOME || join(homedir(), '.vizzly');
    this.registryPath = join(this.vizzlyHome, 'servers.json');
  }

  /**
   * Ensure the registry directory exists
   */
  ensureDirectory() {
    if (!existsSync(this.vizzlyHome)) {
      mkdirSync(this.vizzlyHome, { recursive: true });
    }
  }

  /**
   * Read the current registry, returning empty if it doesn't exist
   */
  read() {
    try {
      if (existsSync(this.registryPath)) {
        let data = JSON.parse(readFileSync(this.registryPath, 'utf8'));
        return {
          version: data.version || 1,
          servers: data.servers || [],
        };
      }
    } catch (_err) {
      // Corrupted file, start fresh
      console.warn('Warning: Could not read server registry, starting fresh');
    }
    return { version: 1, servers: [] };
  }

  /**
   * Write the registry to disk
   */
  write(registry) {
    this.ensureDirectory();
    writeFileSync(this.registryPath, JSON.stringify(registry, null, 2));
  }

  /**
   * Register a new server in the registry
   */
  register(serverInfo) {
    // Validate required fields
    if (!serverInfo.pid || !serverInfo.port || !serverInfo.directory) {
      throw new Error('Missing required fields: pid, port, directory');
    }

    let port = Number(serverInfo.port);
    let pid = Number(serverInfo.pid);

    if (Number.isNaN(port) || Number.isNaN(pid)) {
      throw new Error('Invalid port or pid - must be numbers');
    }

    let registry = this.read();

    // Remove any existing entry for this port or directory (shouldn't happen, but be safe)
    registry.servers = registry.servers.filter(
      s => s.port !== port && s.directory !== serverInfo.directory
    );

    // Add the new server
    registry.servers.push({
      id: serverInfo.id || randomBytes(8).toString('hex'),
      port,
      pid,
      directory: serverInfo.directory,
      startedAt: serverInfo.startedAt || new Date().toISOString(),
      configPath: serverInfo.configPath || null,
      name: serverInfo.name || null,
      logFile: serverInfo.logFile || null,
    });

    this.write(registry);
    this.notifyMenubar();

    return registry;
  }

  /**
   * Unregister a server by port and/or directory
   * When both are provided, matches servers with BOTH criteria (AND logic)
   * When only one is provided, matches servers with that criteria
   */
  unregister({ port, directory }) {
    let registry = this.read();
    let initialCount = registry.servers.length;

    if (port && directory) {
      // Both specified - match servers with both port AND directory
      registry.servers = registry.servers.filter(
        s => !(s.port === port && s.directory === directory)
      );
    } else if (port) {
      registry.servers = registry.servers.filter(s => s.port !== port);
    } else if (directory) {
      registry.servers = registry.servers.filter(
        s => s.directory !== directory
      );
    }

    if (registry.servers.length !== initialCount) {
      this.write(registry);
      this.notifyMenubar();
    }

    return registry;
  }

  /**
   * Find a server by port or directory
   */
  find({ port, directory }) {
    let registry = this.read();

    if (port) {
      return registry.servers.find(s => s.port === port);
    }
    if (directory) {
      return registry.servers.find(s => s.directory === directory);
    }
    return null;
  }

  /**
   * Get all registered servers
   */
  list() {
    return this.read().servers;
  }

  /**
   * Remove servers whose PIDs no longer exist (stale entries)
   */
  cleanupStale() {
    let registry = this.read();
    let initialCount = registry.servers.length;

    registry.servers = registry.servers.filter(server => {
      try {
        // Signal 0 doesn't kill, just checks if process exists
        process.kill(server.pid, 0);
        return true;
      } catch (err) {
        // ESRCH = process doesn't exist, EPERM = exists but no permission (still valid)
        return err.code === 'EPERM';
      }
    });

    if (registry.servers.length !== initialCount) {
      this.write(registry);
      this.notifyMenubar();
      return initialCount - registry.servers.length;
    }

    return 0;
  }

  /**
   * Notify the menubar app that the registry changed
   *
   * Uses macOS notifyutil for instant Darwin notification delivery.
   * The menubar app listens for this in addition to file watching.
   */
  notifyMenubar() {
    if (process.platform !== 'darwin') return;

    try {
      execSync('notifyutil -p dev.vizzly.serverChanged', {
        stdio: 'ignore',
        timeout: 500,
      });
    } catch {
      // Non-fatal - menubar will still see changes via file watching
    }
  }

  /**
   * Get all ports currently in use by registered servers
   * @returns {Set<number>} Set of ports in use
   */
  getUsedPorts() {
    let registry = this.read();
    return new Set(registry.servers.map(s => s.port));
  }

  /**
   * Find an available port starting from the default
   * @param {number} startPort - Port to start searching from (default: 47392)
   * @param {number} maxAttempts - Maximum ports to try (default: 100)
   * @returns {Promise<number>} Available port
   */
  async findAvailablePort(startPort = 47392, maxAttempts = 100) {
    // Clean up stale entries first
    this.cleanupStale();

    let usedPorts = this.getUsedPorts();

    for (let i = 0; i < maxAttempts; i++) {
      let port = startPort + i;

      // Skip if registered in our registry
      if (usedPorts.has(port)) continue;

      // Check if port is actually free (not used by other apps)
      let isFree = await isPortFree(port);
      if (isFree) {
        return port;
      }
    }

    // Fallback to default if nothing found (will fail later with clear error)
    return startPort;
  }
}

/**
 * Check if a port is free (not in use by any process)
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if port is free
 */
async function isPortFree(port) {
  return new Promise(resolve => {
    let server = createServer();

    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors - assume port is free
        resolve(true);
      }
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

// Singleton instance
let registryInstance = null;

export function getServerRegistry() {
  if (!registryInstance) {
    registryInstance = new ServerRegistry();
  }
  return registryInstance;
}
