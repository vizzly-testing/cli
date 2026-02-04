# Vizzly Menubar App

A native macOS menubar app that manages TDD servers and bridges the CLI to the web reporter.

## Problem Statement

The current TDD workflow has friction:

1. `vizzly tdd start` backgrounds a server with no persistent visibility
2. Users can't easily tell if a server is running without `vizzly tdd status`
3. Managing multiple projects means juggling ports mentally
4. Easy to forget servers are running (resource leak)
5. No quick glance at test status without opening browser

## Solution

A lightweight native macOS menubar app that:

- Shows all running TDD servers at a glance
- Displays quick stats (passed/failed) per server
- Provides one-click access to dashboards
- Manages server lifecycle (start/stop/restart)
- Shows authentication status
- Sends notifications on test completion

**Key principle**: The menubar app is a *control plane* only. The React web reporter remains the primary UI for viewing comparisons, managing baselines, and configuring settings.

---

## Architecture

### Communication: CLI ↔ Menubar App

```
┌─────────────┐     writes      ┌─────────────────────┐
│   CLI       │ ──────────────► │ ~/.vizzly/servers   │
│             │                 │      .json          │
│ tdd start   │     posts       └──────────┬──────────┘
│ tdd stop    │ ──────────────►            │
└─────────────┘  Distributed               │ FSEvents
                 Notification              │ watch
                                           ▼
                               ┌─────────────────────┐
                               │   Menubar App       │
                               │                     │
                               │  - Reads registry   │
                               │  - Polls /health    │
                               │  - Spawns CLI cmds  │
                               └─────────────────────┘
```

**File + DistributedNotification pattern:**
- `~/.vizzly/servers.json` is the source of truth (survives crashes)
- `DistributedNotificationCenter.post("dev.vizzly.serverChanged")` for instant updates
- Menubar watches file with FSEvents as backup

### Global Server Registry

```json
// ~/.vizzly/servers.json
{
  "version": 1,
  "servers": [
    {
      "id": "a1b2c3d4",
      "port": 47392,
      "pid": 12345,
      "directory": "/Users/rob/Developer/vizzly-cli",
      "startedAt": "2026-01-27T10:30:00Z",
      "configPath": "/Users/rob/Developer/vizzly-cli/vizzly.config.js",
      "name": "vizzly-cli"
    }
  ]
}
```

### Menubar App Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Vizzly Menubar App                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ FSEvents     │    │ Distributed  │    │ HTTP Poller  │      │
│  │ Watcher      │    │ Notification │    │ (per server) │      │
│  │              │    │ Listener     │    │              │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         └─────────┬─────────┘                   │               │
│                   ▼                             │               │
│         ┌─────────────────┐                     │               │
│         │  ServerManager  │◄────────────────────┘               │
│         │                 │                                     │
│         │  - servers[]    │                                     │
│         │  - favorites[]  │                                     │
│         │  - stats{}      │                                     │
│         └────────┬────────┘                                     │
│                  │                                              │
│                  ▼                                              │
│         ┌─────────────────┐                                     │
│         │   MenuBuilder   │                                     │
│         └────────┬────────┘                                     │
│                  │                                              │
└──────────────────┼──────────────────────────────────────────────┘
                   ▼
            ┌─────────────┐
            │ NSStatusItem│
            │   Menu      │
            └─────────────┘
```

---

## CLI Changes Required

### 1. Global Server Registry

**File**: `src/tdd/server-registry.js` (new)

```javascript
// Manages ~/.vizzly/servers.json
export class ServerRegistry {
  constructor(vizzlyHome) {
    this.registryPath = path.join(vizzlyHome, 'servers.json')
  }

  async register(server) {
    let registry = await this.read()
    registry.servers = registry.servers.filter(s => s.id !== server.id)
    registry.servers.push(server)
    await this.write(registry)
    this.notify()
  }

  async unregister(serverId) {
    let registry = await this.read()
    registry.servers = registry.servers.filter(s => s.id !== serverId)
    await this.write(registry)
    this.notify()
  }

  async cleanupStale() {
    // Remove entries where PID no longer exists
  }

  notify() {
    // Send DistributedNotification via osascript or native module
  }
}
```

### 2. DistributedNotification

**Option A**: Use `osascript` (no native deps)
```javascript
import { exec } from 'child_process'

function notifyMenubar() {
  exec(`osascript -e 'tell application "System Events" to post notification "dev.vizzly.serverChanged"'`)
}
```

**Option B**: Use `node-mac-notifier` or similar native module

**Recommendation**: Start with osascript, upgrade if needed.

### 3. New CLI Commands & Flags

| Command | Purpose |
|---------|---------|
| `vizzly tdd list` | List all running servers (reads registry) |
| `vizzly tdd list --json` | Machine-readable output |
| `vizzly tdd status --json` | JSON output for current project's server |
| `vizzly tdd start --auto-port` | Auto-select next available port |

### 4. Integration Points

**On `tdd start`:**
```javascript
// After server starts successfully
await serverRegistry.register({
  id: generateId(),
  port: server.port,
  pid: process.pid,
  directory: process.cwd(),
  startedAt: new Date().toISOString(),
  configPath: config.configPath,
  name: config.name || path.basename(process.cwd())
})
```

**On `tdd stop`:**
```javascript
// Before/after stopping
await serverRegistry.unregister(serverId)
```

**On startup (any command):**
```javascript
// Clean up stale entries
await serverRegistry.cleanupStale()
```

### 5. Auth Status Endpoint

Add to HTTP server:
```javascript
// GET /api/auth/status - already exists, ensure it returns:
{
  "authenticated": true,
  "user": {
    "email": "rob@vizzly.dev",
    "name": "Rob DeLuca"
  }
}
```

---

## Menubar App Implementation

### Tech Stack

- **Language**: Swift 5.9+
- **UI**: AppKit (NSMenu) + SwiftUI (Preferences window)
- **Min macOS**: 13.0 (Ventura)
- **Dependencies**:
  - Sparkle (auto-updates)
  - LaunchAtLogin (login item helper)

### Project Structure

```
vizzly-menubar/
├── Vizzly.xcodeproj
├── Sources/
│   ├── App/
│   │   ├── VizzlyApp.swift           # @main entry point
│   │   └── AppDelegate.swift         # NSApplicationDelegate
│   ├── Menu/
│   │   ├── StatusBarController.swift # NSStatusItem management
│   │   ├── MenuBuilder.swift         # Constructs menu from state
│   │   └── ServerMenuItemView.swift  # Custom view for server row
│   ├── Services/
│   │   ├── ServerManager.swift       # Core state management
│   │   ├── RegistryWatcher.swift     # FSEvents + JSON parsing
│   │   ├── HealthMonitor.swift       # HTTP polling per server
│   │   ├── CLIBridge.swift           # Spawns vizzly commands
│   │   └── NotificationListener.swift # DistributedNotification
│   ├── Models/
│   │   ├── Server.swift              # Server data model
│   │   ├── ServerStats.swift         # Health/report data
│   │   └── Preferences.swift         # User preferences
│   └── Views/
│       ├── PreferencesView.swift     # Settings (SwiftUI)
│       └── OnboardingView.swift      # First-run experience
├── Resources/
│   ├── Assets.xcassets/
│   │   ├── AppIcon.appiconset/
│   │   └── MenuBarIcon.imageset/     # Template image for dark/light
│   └── Localizable.strings
├── Supporting Files/
│   ├── Info.plist
│   └── Vizzly.entitlements
└── Tests/
    └── VizzlyTests/
```

### Core Components

#### 1. Server Model

```swift
struct Server: Identifiable, Codable {
    let id: String
    let port: Int
    let pid: Int
    let directory: String
    let startedAt: Date
    let configPath: String?
    let name: String

    var dashboardURL: URL {
        URL(string: "http://localhost:\(port)")!
    }
}

struct ServerStats {
    let total: Int
    let passed: Int
    let failed: Int
    let errors: Int
    let uptime: TimeInterval
    var isHealthy: Bool { errors == 0 }
}
```

#### 2. Registry Watcher

```swift
class RegistryWatcher: ObservableObject {
    @Published var servers: [Server] = []

    private var fileMonitor: DispatchSourceFileSystemObject?
    private let registryURL: URL

    init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        registryURL = home.appendingPathComponent(".vizzly/servers.json")

        setupFileWatcher()
        setupNotificationListener()
        loadRegistry()
    }

    private func setupFileWatcher() {
        let fd = open(registryURL.path, O_EVTONLY)
        fileMonitor = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: .write,
            queue: .main
        )
        fileMonitor?.setEventHandler { [weak self] in
            self?.loadRegistry()
        }
        fileMonitor?.resume()
    }

    private func setupNotificationListener() {
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(registryChanged),
            name: NSNotification.Name("dev.vizzly.serverChanged"),
            object: nil
        )
    }

    @objc private func registryChanged() {
        loadRegistry()
    }

    private func loadRegistry() {
        // Parse JSON, update servers array
    }
}
```

#### 3. Health Monitor

```swift
class HealthMonitor {
    private var timers: [String: Timer] = [:]
    private var stats: [String: ServerStats] = [:]

    func startMonitoring(_ server: Server) {
        let timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
            self.fetchStats(for: server)
        }
        timers[server.id] = timer
        fetchStats(for: server) // Initial fetch
    }

    func stopMonitoring(_ serverId: String) {
        timers[serverId]?.invalidate()
        timers.removeValue(forKey: serverId)
    }

    private func fetchStats(for server: Server) async {
        // GET http://localhost:{port}/health
        // GET http://localhost:{port}/api/report-data (for counts)
    }
}
```

#### 4. CLI Bridge

```swift
class CLIBridge {
    private let cliPath: String

    init() {
        // Find vizzly CLI - check common locations
        // 1. /usr/local/bin/vizzly
        // 2. ~/.npm-global/bin/vizzly
        // 3. npx vizzly
        cliPath = Self.findCLI()
    }

    func startServer(in directory: URL, port: Int? = nil) async throws {
        var args = ["tdd", "start"]
        if let port = port {
            args.append(contentsOf: ["--port", String(port)])
        }

        try await runCLI(args, in: directory)
    }

    func stopServer(in directory: URL) async throws {
        try await runCLI(["tdd", "stop"], in: directory)
    }

    private func runCLI(_ args: [String], in directory: URL) async throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: cliPath)
        process.arguments = args
        process.currentDirectoryURL = directory
        try process.run()
        process.waitUntilExit()
    }
}
```

### Menu Design

```
┌─────────────────────────────────────────┐
│  ● Vizzly                               │  ← Icon color indicates status
├─────────────────────────────────────────┤
│                                         │
│ SERVERS                                 │
│ ─────────────────────────────────────── │
│ ● vizzly-cli        ✓ 70/71    :47392  │  ← Click → open dashboard
│ ● my-app            Running    :47393  │     Right-click → context menu
│                                         │
│ FAVORITES                               │
│ ─────────────────────────────────────── │
│ ○ design-system     Stopped            │  ← Click → start server
│                                         │
├─────────────────────────────────────────┤
│ ⊕ Start Server...               ⌘N     │
│ ─────────────────────────────────────── │
│ 👤 rob@vizzly.dev                      │
├─────────────────────────────────────────┤
│ Preferences...                  ⌘,     │
│ Check for Updates...                   │
│ Quit Vizzly                     ⌘Q     │
└─────────────────────────────────────────┘
```

**Server row context menu (right-click):**
```
┌────────────────────────┐
│ Open Dashboard         │
│ Open in Terminal       │
│ Open in Finder         │
│ ────────────────────── │
│ Restart Server         │
│ Stop Server            │
│ ────────────────────── │
│ Add to Favorites       │
│ Copy Dashboard URL     │
└────────────────────────┘
```

**Icon states:**
- 🟢 Green dot: All servers healthy, no failures
- 🟡 Yellow dot: Servers running, some tests failing
- ⚪ Gray dot: No servers running
- 🔴 Red dot: Server error/crashed

### Preferences

```swift
struct PreferencesView: View {
    @AppStorage("launchAtLogin") var launchAtLogin = false
    @AppStorage("showNotifications") var showNotifications = true
    @AppStorage("pollingInterval") var pollingInterval = 5.0

    var body: some View {
        Form {
            Section("General") {
                Toggle("Launch at login", isOn: $launchAtLogin)
                Toggle("Show notifications", isOn: $showNotifications)
            }

            Section("Monitoring") {
                Picker("Refresh interval", selection: $pollingInterval) {
                    Text("2 seconds").tag(2.0)
                    Text("5 seconds").tag(5.0)
                    Text("10 seconds").tag(10.0)
                }
            }

            Section("Favorites") {
                // List of favorite directories
                // Add/remove buttons
            }
        }
        .frame(width: 400, height: 300)
    }
}
```

---

## Implementation Phases

### Phase 1: CLI Foundation (This Repo)

- [ ] Create `ServerRegistry` class
- [ ] Integrate registry into `tdd start` / `tdd stop`
- [ ] Add stale server cleanup on CLI startup
- [ ] Add `vizzly tdd list` command
- [ ] Add `--json` flag to `status` and `list`
- [ ] Add DistributedNotification via osascript
- [ ] Add `--auto-port` flag

### Phase 2: Menubar MVP (vizzly-menubar repo)

- [ ] Xcode project setup with SwiftUI lifecycle
- [ ] NSStatusItem with basic menu
- [ ] Registry file watcher (FSEvents)
- [ ] DistributedNotification listener
- [ ] Server list display with status
- [ ] Click to open dashboard
- [ ] Basic health polling

### Phase 3: Server Management

- [ ] Start server from menubar (folder picker)
- [ ] Stop server from context menu
- [ ] Restart server
- [ ] Favorites system (pin directories)
- [ ] Preferences window

### Phase 4: Polish

- [ ] Notifications on test completion
- [ ] Sparkle auto-updates
- [ ] LaunchAtLogin support
- [ ] Proper icon states (green/yellow/red)
- [ ] Keyboard shortcuts
- [ ] First-run onboarding

### Phase 5: Distribution

- [ ] GitHub releases with signed builds
- [ ] Homebrew cask formula
- [ ] CLI prints install suggestion on first `tdd start`

---

## Distribution

| Channel | Implementation |
|---------|----------------|
| **Direct Download** | GitHub releases, DMG with drag-to-Applications |
| **Auto-updates** | Sparkle framework, appcast.xml hosted on GitHub/CDN |
| **Homebrew** | `brew install --cask vizzly` (after stable release) |
| **Discovery** | CLI prints "Tip: Install Vizzly menubar app" on `tdd start` |

**Code signing**: Apple Developer account required for notarization (avoid Gatekeeper warnings)

---

## Open Questions

1. **CLI location discovery**: How does the Swift app find the `vizzly` CLI reliably?
   - Check PATH, common npm locations, ask user to configure?

2. **Multiple CLI versions**: What if user has different vizzly versions in different projects?
   - Use project-local `npx vizzly` instead of global?

3. **Sandbox restrictions**: Should the app be sandboxed?
   - Sandboxing limits file access, but we need to read arbitrary project dirs
   - Probably ship non-sandboxed for now

4. **Terminal integration**: "Open in Terminal" - which terminal app?
   - Default to Terminal.app, support iTerm2, Warp, etc. in preferences?

---

## Success Metrics

- Reduced "is my server running?" confusion
- Faster workflow switching between projects
- Fewer orphaned background servers
- Positive user feedback on DX improvement
