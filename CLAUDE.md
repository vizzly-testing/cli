# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Critical: Repository Information

**NEVER use `vizzly-co` as the GitHub organization. It is ALWAYS `vizzly-testing`.**
**The product URL is `vizzly.dev` (NOT vizzly.com or any other domain).**

## What is Vizzly?

Vizzly is a visual review platform for UI developers and designers. Unlike tools that render
components in isolation, Vizzly captures screenshots directly from your functional tests—the *real
thing*. It enables teams to collaborate on visual changes through an intuitive web dashboard.

**This CLI is the core of Vizzly.** It provides:
1. **Client SDK** - Lightweight API for test runners to send screenshots
2. **TDD Mode** - Local visual testing with interactive dashboard, settings, and project tools
3. **Cloud Integration** - Upload screenshots to Vizzly's web platform for team review
4. **CI/CD Support** - Run tests in parallel, wait for results, handle visual regressions
5. **Plugin System** - Extensible architecture for adding custom commands and integrations

## Two Modes of Operation

**TDD Mode (Local Development):**
- Visual test-driven development workflow
- No API token required for visual testing
- Screenshots compared locally using `honeydiff` (high-performance Rust-based diffing)
- Interactive dashboard at `http://localhost:47392`
  - View and accept/reject baselines
  - Settings tab for editing configuration without touching files
  - Projects tab for authentication and project mappings
- Fast iteration cycle
- Command: `vizzly tdd start` or `vizzly tdd run "npm test"`

**Run Mode (CI/CD & Cloud):**
- Requires API token
- Screenshots uploaded to Vizzly cloud
- Team reviews changes via web dashboard
- Supports parallel test execution across shards
- Returns exit codes for CI integration
- Command: `vizzly run "npm test" --wait`

## Development Commands

### Build and Test
```bash
npm run build              # Full build: clean, compile, copy assets, reporter, types
npm run clean              # Remove dist directory
npm run compile            # Babel compile src to dist
npm run types              # Generate TypeScript declarations

npm test                   # Run all tests once (node --test)
npm test:watch             # Run tests in watch mode
npm run test:reporter      # Run Playwright visual regression tests for reporter UI
npm run test:reporter:visual  # Self-test: run reporter tests with Vizzly

npm run lint               # ESLint check
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier format
npm run format:check       # Prettier check
```

### Testing Specific Files/Patterns
```bash
node --test tests/commands/builds.test.js           # Single test file
node --test $(find tests/services -name '*.test.js') # Directory
```

### Reporter Development
```bash
npm run dev:reporter       # Start Vite dev server for reporter UI (port 5173)
npm run build:reporter     # Build reporter production bundle
```

## Architecture Overview

**Service-Oriented Design:**
The CLI uses a dependency injection container (`src/container/`) to wire up services with proper
lifecycle management. Services are singletons registered with dependencies, making it easy to test
and compose functionality.

**Client SDK Philosophy:**
The client SDK (`@vizzly-testing/cli/client`) is intentionally thin—it just POSTs screenshot data to
a local HTTP server. This keeps test runner integration simple and language-agnostic. The heavy
lifting happens server-side.

**Reporter UI:**
The interactive dashboard is a React SPA (`src/reporter/`) built with Vite. It serves two purposes:
1. Live TDD dashboard fetching data from HTTP endpoints
2. Static HTML reports with embedded JSON data

Same codebase, different data sources.

**Plugin Architecture:**
The CLI supports a plugin system (`src/plugin-loader.js`) that enables extensibility while keeping the
core lean. Plugins are ESM modules that register Commander.js commands and receive access to the
service container, config, and output utilities.

- **Auto-discovery**: Plugins under `@vizzly-testing/*` scope are automatically discovered from node_modules
- **Config-based**: Plugins can be explicitly loaded via `vizzly.config.js`
- **Security**: Path validation prevents directory traversal, scope restriction limits auto-discovery
- **Graceful errors**: Plugin failures don't crash the CLI
- **Timeout protection**: 5-second timeout prevents infinite loops during registration
- **Deduplication**: Same plugin won't load twice (warns on version conflicts)

## Key Workflows

**TDD Workflow (Local Development):**
1. Developer runs `vizzly tdd start` → Background TDD server starts
2. Developer runs tests in watch mode → `vizzlyScreenshot()` sends images to server
3. Server compares using `honeydiff` → Saves results to `.vizzly/`
4. Dashboard at `http://localhost:47392` shows:
   - Live comparisons → Accept/reject baselines
   - Settings tab → Edit config (threshold, ports, etc.) without touching files
   - Projects tab → Login, manage project mappings as convenient
5. Baselines updated → Tests pass on next run

**One-off TDD Run:**
1. Developer runs `vizzly tdd run "npm test"` → Ephemeral server starts
2. Tests execute once → Screenshots captured and compared
3. Static HTML report generated → Opens in browser
4. Server automatically stops

**CI/CD Workflow:**
1. CI runs `vizzly run "npm test" --wait` → Starts screenshot server
2. Tests run → Client SDK sends screenshots to server
3. Server queues screenshots → Batch uploads to cloud after tests
4. `--wait` polls build status → Returns exit code based on visual differences
5. Team reviews on web dashboard → Approves/requests changes

**Parallel Builds:**
- Multiple CI shards run with same `--parallel-id`
- Each shard uploads its screenshots independently
- After all shards complete, run `vizzly finalize <parallel-id>`
- Cloud processes complete build and shows unified results

## Configuration

**Priority (highest to lowest):**
1. CLI flags (`--port`, `--threshold`, etc.)
2. Environment variables (`VIZZLY_TOKEN`, `VIZZLY_API_URL`)
3. Config file (`vizzly.config.js` found via cosmiconfig)
4. Built-in defaults

Config files use `defineConfig()` helper for better IDE support.

## Key Concepts

**Screenshot Identity:**
Screenshots are matched by signature: `name|viewport_width|browser`. This ensures the same logical
screenshot across different runs can be compared, even if viewport or browser differs.

**Baseline Management:**
- TDD mode: Baselines stored in `.vizzly/baselines/` as PNG files
- Cloud mode: Baselines are previous build's screenshots on same branch
- Both use SHA-based deduplication to avoid redundant uploads/storage

**Auto-Discovery:**
The client SDK automatically discovers a running TDD server by searching for `.vizzly/server.json`
in parent directories. This allows tests to work without explicit configuration.

**Dogfooding:**
The reporter UI's visual tests (`tests/reporter/`) use Vizzly itself for visual regression testing.

**Static vs Live Reports:**
The React-based reporter works in two modes:
- **Live mode**: TDD server serves dashboard that polls for updates (live comparisons, settings, projects)
- **Static mode**: Self-contained HTML report with embedded data (comparisons only, generated by `vizzly tdd run`)

## Environment Variables

- `VIZZLY_HOME` - Override config directory (default: ~/.vizzly). Useful for development/testing
- `VIZZLY_TOKEN` - API authentication token
- `VIZZLY_API_URL` - API base URL (default: https://app.vizzly.dev)
- `VIZZLY_LOG_LEVEL` - Logging level (debug|info|warn|error)
- `VIZZLY_BUILD_NAME` - Custom build name (useful in CI for dynamic naming)
- `VIZZLY_PARALLEL_ID` - Parallel build identifier
- `VIZZLY_ENABLED` - Enable/disable SDK (default: auto-detect)
- `VIZZLY_SERVER_URL` - Screenshot server URL for client
- `VIZZLY_BUILD_ID` - Build identifier for grouping screenshots

Git information overrides (for CI):
- `VIZZLY_COMMIT_SHA`
- `VIZZLY_COMMIT_MESSAGE`
- `VIZZLY_BRANCH`
- `VIZZLY_PR_NUMBER`

## Package Exports

The package provides multiple entry points for different use cases:

- `@vizzly-testing/cli` - Main exports (SDK, client, utilities)
- `@vizzly-testing/cli/client` - Lightweight test runner integration (`vizzlyScreenshot`)
- `@vizzly-testing/cli/sdk` - Full SDK with programmatic upload control
- `@vizzly-testing/cli/config` - Config helpers (`defineConfig`)

## Testing

- **Node test runner** for unit/integration tests (`npm test`)
- **Playwright** for reporter UI visual tests (`npm run test:reporter`)
- Coverage thresholds: 75% lines/functions, 70% branches
- Tests mirror `src/` structure in `tests/`

## Common Development Patterns

**Adding a new command:**
1. Create command file in `src/commands/`
2. Register in `src/cli.js` with Commander
3. Use `loadConfig()` to merge CLI options with config file
4. Add tests in `tests/commands/`

**Adding a new service:**
1. Create a plain class in `src/services/`
2. Add it to `createServices()` in `src/services/index.js` with its dependencies
3. Access via `services.myService` in commands

**Modifying screenshot comparison:**
Remember to update both local (TDD) and cloud comparison logic to keep behavior consistent.

**Creating a plugin:**
1. Create ESM module that exports `{ name, version?, register(program, context) }`
2. Plugin receives `program` (Commander instance), `config`, `output`, and `services` object
3. For official plugins: Publish under `@vizzly-testing/*` scope with `vizzly.plugin` field in package.json
4. For community/local plugins: Add path to `plugins` array in `vizzly.config.js`
5. Add tests in plugin's own package or in `tests/integration/`
6. See `docs/plugins.md` and `examples/custom-plugin/` for complete guide

## Local Development Setup

When developing the CLI, use `VIZZLY_HOME` to isolate dev state from production:

```bash
# Set up isolated dev environment
export VIZZLY_HOME="$HOME/.vizzly.dev"
export VIZZLY_API_URL="http://localhost:3000"

# Now login, link projects, etc. - all stored in ~/.vizzly.dev
vizzly login
vizzly project link
```

This keeps your production auth/projects in `~/.vizzly` untouched while you work on the CLI.

Recommended: Add a `.envrc` file (with direnv) to auto-set these when entering the repo.

## Git Commits & Pull Requests

**NEVER add AI attribution to commits, PRs, or any writing:**
- ❌ "🤖 Generated with [Claude Code](https://claude.com/claude-code)"
- ❌ "Co-Authored-By: Claude <noreply@anthropic.com>"

**Commits:**
- Use gitmoji prefix (✨ feat, 🐛 fix, 📝 docs, ♻️ refactor, 🧪 test, etc.)
- Keep messages clear and concise

**Pull Requests:**
- Title must include gitmoji prefix matching the primary change type
- Description must explain the *why* (motivation/problem being solved)
- Description must cover all changes in the diff, not just highlights
- Use a "Summary" section with bullet points for each change
- Include a "Test plan" section with verification steps
