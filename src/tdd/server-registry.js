import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'
import { randomBytes } from 'crypto'

/**
 * Manages a global registry of running TDD servers at ~/.vizzly/servers.json
 * Enables the menubar app to discover and manage multiple concurrent servers.
 */
export class ServerRegistry {
  constructor() {
    this.vizzlyHome = process.env.VIZZLY_HOME || join(homedir(), '.vizzly')
    this.registryPath = join(this.vizzlyHome, 'servers.json')
  }

  /**
   * Ensure the registry directory exists
   */
  ensureDirectory() {
    if (!existsSync(this.vizzlyHome)) {
      mkdirSync(this.vizzlyHome, { recursive: true })
    }
  }

  /**
   * Read the current registry, returning empty if it doesn't exist
   */
  read() {
    try {
      if (existsSync(this.registryPath)) {
        let data = JSON.parse(readFileSync(this.registryPath, 'utf8'))
        return {
          version: data.version || 1,
          servers: data.servers || [],
        }
      }
    } catch (err) {
      // Corrupted file, start fresh
      console.warn('Warning: Could not read server registry, starting fresh')
    }
    return { version: 1, servers: [] }
  }

  /**
   * Write the registry to disk
   */
  write(registry) {
    this.ensureDirectory()
    writeFileSync(this.registryPath, JSON.stringify(registry, null, 2))
  }

  /**
   * Register a new server in the registry
   */
  register(serverInfo) {
    let registry = this.read()

    // Remove any existing entry for this port or directory (shouldn't happen, but be safe)
    registry.servers = registry.servers.filter(
      (s) => s.port !== serverInfo.port && s.directory !== serverInfo.directory
    )

    // Add the new server
    registry.servers.push({
      id: serverInfo.id || randomBytes(8).toString('hex'),
      port: Number(serverInfo.port),
      pid: Number(serverInfo.pid),
      directory: serverInfo.directory,
      startedAt: serverInfo.startedAt || new Date().toISOString(),
      configPath: serverInfo.configPath || null,
      name: serverInfo.name || null,
      logFile: serverInfo.logFile || null,
    })

    this.write(registry)
    this.notifyMenubar()

    return registry
  }

  /**
   * Unregister a server by port or directory
   */
  unregister({ port, directory }) {
    let registry = this.read()
    let initialCount = registry.servers.length

    if (port) {
      registry.servers = registry.servers.filter((s) => s.port !== port)
    }
    if (directory) {
      registry.servers = registry.servers.filter((s) => s.directory !== directory)
    }

    if (registry.servers.length !== initialCount) {
      this.write(registry)
      this.notifyMenubar()
    }

    return registry
  }

  /**
   * Find a server by port or directory
   */
  find({ port, directory }) {
    let registry = this.read()

    if (port) {
      return registry.servers.find((s) => s.port === port)
    }
    if (directory) {
      return registry.servers.find((s) => s.directory === directory)
    }
    return null
  }

  /**
   * Get all registered servers
   */
  list() {
    return this.read().servers
  }

  /**
   * Remove servers whose PIDs no longer exist (stale entries)
   */
  cleanupStale() {
    let registry = this.read()
    let initialCount = registry.servers.length

    registry.servers = registry.servers.filter((server) => {
      try {
        // Signal 0 doesn't kill, just checks if process exists
        process.kill(server.pid, 0)
        return true
      } catch (err) {
        // ESRCH = process doesn't exist, EPERM = exists but no permission (still valid)
        return err.code === 'EPERM'
      }
    })

    if (registry.servers.length !== initialCount) {
      this.write(registry)
      this.notifyMenubar()
      return initialCount - registry.servers.length
    }

    return 0
  }

  /**
   * Notify the menubar app that the registry changed
   * Uses macOS DistributedNotificationCenter via osascript
   */
  notifyMenubar() {
    if (process.platform !== 'darwin') return

    try {
      // Post a distributed notification that the menubar app listens for
      execSync(
        `osascript -e 'tell application "System Events" to post notification with name "dev.vizzly.serverChanged"'`,
        { stdio: 'ignore', timeout: 1000 }
      )
    } catch (err) {
      // Non-fatal - menubar might not be running or osascript might fail
    }
  }
}

// Singleton instance
let registryInstance = null

export function getServerRegistry() {
  if (!registryInstance) {
    registryInstance = new ServerRegistry()
  }
  return registryInstance
}
