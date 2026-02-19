import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

let REGISTRY_MIGRATIONS = [
  {
    version: 1,
    name: 'registry_servers',
    sql: `
      CREATE TABLE IF NOT EXISTS registry_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS registry_servers (
        id TEXT PRIMARY KEY,
        port INTEGER NOT NULL UNIQUE,
        pid INTEGER NOT NULL,
        directory TEXT NOT NULL UNIQUE,
        started_at TEXT NOT NULL,
        config_path TEXT,
        name TEXT,
        log_file TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_registry_servers_started_at
        ON registry_servers(started_at DESC);
    `,
  },
];

function applyRegistryMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  let appliedRows = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
    .all();
  let appliedVersions = new Set(appliedRows.map(row => Number(row.version)));

  for (let migration of REGISTRY_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    let transaction = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        `
          INSERT INTO schema_migrations (version, name, applied_at)
          VALUES (?, ?, ?)
        `
      ).run(migration.version, migration.name, Date.now());
    });

    transaction();
  }
}

function mapServerRow(row) {
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    port: row.port,
    pid: row.pid,
    directory: row.directory,
    startedAt: row.started_at,
    configPath: row.config_path,
    name: row.name,
    logFile: row.log_file,
  };
}

/**
 * Manages a global registry of running TDD servers at ~/.vizzly/servers.db
 * Enables the menubar app to discover and manage multiple concurrent servers.
 */
export class ServerRegistry {
  constructor() {
    this.vizzlyHome = process.env.VIZZLY_HOME || join(homedir(), '.vizzly');
    this.registryPath = join(this.vizzlyHome, 'servers.json');
    this.dbPath = join(this.vizzlyHome, 'servers.db');
    this.db = null;
  }

  /**
   * Ensure the registry directory exists
   */
  ensureDirectory() {
    if (!existsSync(this.vizzlyHome)) {
      mkdirSync(this.vizzlyHome, { recursive: true });
    }
  }

  openDb() {
    if (this.db) {
      return this.db;
    }

    this.ensureDirectory();
    this.db = new BetterSqlite3(this.dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('busy_timeout = 5000');

    applyRegistryMigrations(this.db);
    this.maybeMigrateLegacyJson();

    return this.db;
  }

  getMeta(key) {
    let db = this.openDb();
    let row = db
      .prepare('SELECT value FROM registry_meta WHERE key = ?')
      .get(key);
    return row?.value ?? null;
  }

  setMeta(key, value) {
    let db = this.openDb();
    db.prepare(
      `
        INSERT INTO registry_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `
    ).run(key, String(value), Date.now());
  }

  maybeMigrateLegacyJson() {
    let db = this.db;
    if (!db) {
      return;
    }

    if (this.getMeta('legacy_json_migrated') === '1') {
      return;
    }

    try {
      let count = db
        .prepare('SELECT COUNT(*) AS count FROM registry_servers')
        .get().count;

      if (count === 0 && existsSync(this.registryPath)) {
        let raw = readFileSync(this.registryPath, 'utf8');
        let legacy = JSON.parse(raw);
        let servers = Array.isArray(legacy?.servers) ? legacy.servers : [];

        if (servers.length > 0) {
          let insert = db.prepare(`
            INSERT INTO registry_servers (
              id, port, pid, directory, started_at, config_path, name, log_file
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              port = excluded.port,
              pid = excluded.pid,
              directory = excluded.directory,
              started_at = excluded.started_at,
              config_path = excluded.config_path,
              name = excluded.name,
              log_file = excluded.log_file
          `);
          let removeExisting = db.prepare(
            'DELETE FROM registry_servers WHERE port = ? OR directory = ?'
          );

          let transaction = db.transaction(() => {
            for (let server of servers) {
              if (!server?.port || !server?.pid || !server?.directory) {
                continue;
              }

              removeExisting.run(Number(server.port), server.directory);

              insert.run(
                server.id || randomBytes(8).toString('hex'),
                Number(server.port),
                Number(server.pid),
                server.directory,
                server.startedAt || new Date().toISOString(),
                server.configPath || null,
                server.name || null,
                server.logFile || null
              );
            }
          });

          transaction();
        }
      }
    } catch {
      console.warn('Warning: Could not read server registry, starting fresh');
    } finally {
      this.setMeta('legacy_json_migrated', '1');
    }
  }

  /**
   * Read the current registry
   */
  read() {
    return {
      version: 1,
      servers: this.list(),
    };
  }

  /**
   * Replace the registry entries
   */
  write(registry) {
    let db = this.openDb();
    let servers = Array.isArray(registry?.servers) ? registry.servers : [];

    let insert = db.prepare(`
      INSERT INTO registry_servers (
        id, port, pid, directory, started_at, config_path, name, log_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let transaction = db.transaction(() => {
      db.prepare('DELETE FROM registry_servers').run();

      for (let server of servers) {
        if (!server?.port || !server?.pid || !server?.directory) {
          continue;
        }

        insert.run(
          server.id || randomBytes(8).toString('hex'),
          Number(server.port),
          Number(server.pid),
          server.directory,
          server.startedAt || new Date().toISOString(),
          server.configPath || null,
          server.name || null,
          server.logFile || null
        );
      }
    });

    transaction();
    this.notifyMenubar();
  }

  /**
   * Register a new server in the registry
   */
  register(serverInfo) {
    if (!serverInfo.pid || !serverInfo.port || !serverInfo.directory) {
      throw new Error('Missing required fields: pid, port, directory');
    }

    let port = Number(serverInfo.port);
    let pid = Number(serverInfo.pid);

    if (Number.isNaN(port) || Number.isNaN(pid)) {
      throw new Error('Invalid port or pid - must be numbers');
    }

    let db = this.openDb();

    let transaction = db.transaction(() => {
      db.prepare(
        'DELETE FROM registry_servers WHERE port = ? OR directory = ?'
      ).run(port, serverInfo.directory);

      db.prepare(`
        INSERT INTO registry_servers (
          id, port, pid, directory, started_at, config_path, name, log_file
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        serverInfo.id || randomBytes(8).toString('hex'),
        port,
        pid,
        serverInfo.directory,
        serverInfo.startedAt || new Date().toISOString(),
        serverInfo.configPath || null,
        serverInfo.name || null,
        serverInfo.logFile || null
      );
    });

    transaction();
    this.notifyMenubar();

    return this.read();
  }

  /**
   * Unregister a server by port and/or directory
   * When both are provided, matches servers with BOTH criteria (AND logic)
   * When only one is provided, matches servers with that criteria
   */
  unregister({ port, directory }) {
    let db = this.openDb();
    let result = { changes: 0 };

    if (port && directory) {
      result = db
        .prepare(
          'DELETE FROM registry_servers WHERE port = ? AND directory = ?'
        )
        .run(Number(port), directory);
    } else if (port) {
      result = db
        .prepare('DELETE FROM registry_servers WHERE port = ?')
        .run(Number(port));
    } else if (directory) {
      result = db
        .prepare('DELETE FROM registry_servers WHERE directory = ?')
        .run(directory);
    }

    if (result.changes > 0) {
      this.notifyMenubar();
    }

    return this.read();
  }

  /**
   * Find a server by port or directory
   */
  find({ port, directory }) {
    let db = this.openDb();

    if (port) {
      let row = db
        .prepare('SELECT * FROM registry_servers WHERE port = ? LIMIT 1')
        .get(Number(port));
      return mapServerRow(row);
    }

    if (directory) {
      let row = db
        .prepare('SELECT * FROM registry_servers WHERE directory = ? LIMIT 1')
        .get(directory);
      return mapServerRow(row);
    }

    return undefined;
  }

  /**
   * Get all registered servers
   */
  list() {
    let db = this.openDb();
    let rows = db
      .prepare('SELECT * FROM registry_servers ORDER BY started_at ASC')
      .all();

    return rows.map(mapServerRow);
  }

  /**
   * Remove servers whose PIDs no longer exist (stale entries)
   */
  cleanupStale() {
    let db = this.openDb();
    let servers = this.list();
    let staleIds = [];

    for (let server of servers) {
      try {
        process.kill(server.pid, 0);
      } catch (error) {
        if (error.code !== 'EPERM') {
          staleIds.push(server.id);
        }
      }
    }

    if (staleIds.length === 0) {
      return 0;
    }

    let deleteById = db.prepare('DELETE FROM registry_servers WHERE id = ?');
    let transaction = db.transaction(() => {
      for (let id of staleIds) {
        deleteById.run(id);
      }
    });

    transaction();
    this.notifyMenubar();
    return staleIds.length;
  }

  /**
   * Notify the menubar app that the registry changed
   */
  notifyMenubar() {
    if (process.platform !== 'darwin') return;

    try {
      execSync('notifyutil -p dev.vizzly.serverChanged', {
        stdio: 'ignore',
        timeout: 500,
      });
    } catch {
      // Non-fatal
    }
  }

  /**
   * Get all ports currently in use by registered servers
   * @returns {Set<number>} Set of ports in use
   */
  getUsedPorts() {
    let registry = this.read();
    return new Set(registry.servers.map(server => server.port));
  }

  /**
   * Find an available port starting from the default
   * @param {number} startPort - Port to start searching from (default: 47392)
   * @param {number} maxAttempts - Maximum ports to try (default: 100)
   * @returns {Promise<number>} Available port
   */
  async findAvailablePort(startPort = 47392, maxAttempts = 100) {
    this.cleanupStale();

    let usedPorts = this.getUsedPorts();

    for (let i = 0; i < maxAttempts; i++) {
      let port = startPort + i;

      if (usedPorts.has(port)) continue;

      let isFree = await isPortFree(port);
      if (isFree) {
        return port;
      }
    }

    return startPort;
  }

  close() {
    if (!this.db) {
      return;
    }

    try {
      this.db.close();
    } catch {
      // Ignore close failures
    } finally {
      this.db = null;
    }
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
