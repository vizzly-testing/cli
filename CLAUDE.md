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
2. **Local TDD Mode** - Fast feedback loop with local comparisons and live dashboard
3. **Cloud Integration** - Upload screenshots to Vizzly's web platform for team review
4. **CI/CD Support** - Run tests in parallel, wait for results, handle visual regressions
5. **Plugin System** - Extensible architecture for adding custom commands and integrations

## Two Modes of Operation

**TDD Mode (Local Development):**
- No API token required
- Screenshots compared locally using `odiff`
- Interactive dashboard at `http://localhost:47392`
- Accept/reject baselines directly in UI
- Fast iteration cycle

**Run Mode (CI/CD & Cloud):**
- Requires API token
- Screenshots uploaded to Vizzly cloud
- Team reviews changes via web dashboard
- Supports parallel test execution across shards
- Returns exit codes for CI integration

## Development Commands

### Build and Test
```bash
npm run build              # Full build: clean, compile, copy assets, reporter, types
npm run clean              # Remove dist directory
npm run compile            # Babel compile src to dist
npm run types              # Generate TypeScript declarations

npm test                   # Run all tests once (vitest)
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
npx vitest run tests/unit/config-loader.spec.js    # Single test file
npx vitest run tests/services/                      # Directory
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
service container, config, and logger.

- **Auto-discovery**: Plugins under `@vizzly-testing/*` scope are automatically discovered from node_modules
- **Config-based**: Plugins can be explicitly loaded via `vizzly.config.js`
- **Security**: Path validation prevents directory traversal, scope restriction limits auto-discovery
- **Graceful errors**: Plugin failures don't crash the CLI
- **Timeout protection**: 5-second timeout prevents infinite loops during registration
- **Deduplication**: Same plugin won't load twice (warns on version conflicts)

## Key Workflows

**TDD Workflow:**
1. Developer runs `vizzly tdd start` → Background server starts
2. Developer runs tests in watch mode → `vizzlyScreenshot()` sends images to server
3. Server compares using `odiff` → Saves results to `.vizzly/`
4. Dashboard shows live comparisons → Developer accepts/rejects in UI
5. Baselines updated → Tests pass on next run

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

## Environment Variables

- `VIZZLY_TOKEN` - API authentication token
- `VIZZLY_API_URL` - API base URL (default: https://app.vizzly.dev)
- `VIZZLY_LOG_LEVEL` - Logging level (debug|info|warn|error)
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

- **Vitest** for unit/integration tests (`npm test`)
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
1. Extend `BaseService` for lifecycle hooks (`onStart`, `onStop`)
2. Register in service container with dependencies
3. Inject via container in commands that need it

**Modifying screenshot comparison:**
Remember to update both local (TDD) and cloud comparison logic to keep behavior consistent.

**Creating a plugin:**
1. Create ESM module that exports `{ name, version?, register(program, context) }`
2. Plugin receives `program` (Commander instance), `config`, `logger`, and `services` container
3. For official plugins: Publish under `@vizzly-testing/*` scope with `vizzly.plugin` field in package.json
4. For community/local plugins: Add path to `plugins` array in `vizzly.config.js`
5. Add tests in plugin's own package or in `tests/integration/`
6. See `docs/plugins.md` and `examples/custom-plugin/` for complete guide
