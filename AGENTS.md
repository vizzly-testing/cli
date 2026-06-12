# Repository Guidelines

## Project Structure & Module Organization
Core CLI code lives in `src/` (commands, API client, services, auth, server, TDD, and shared utils).  
UI for local/static reports lives in `src/reporter/` (Vite + React).  
Tests live in `tests/` with suites grouped by domain (`tests/commands`, `tests/server`, `tests/services`, etc.).  
Type definition tests live in `test-d/`.  
Framework integrations and SDK clients live in `clients/` (`storybook`, `static-site`, `vitest`, `ember`, `ruby`, `swift`).  
Reference docs are in `docs/`, examples in `examples/`, and built artifacts output to `dist/`.

## Build, Test, and Development Commands
- `pnpm run build`: clean and compile CLI + reporter bundles into `dist/`.
- `pnpm test`: run Node test runner suites with coverage enabled.
- `pnpm run test:watch`: watch mode for fast local iteration.
- `pnpm run test:reporter`: run Playwright reporter workflow tests.
- `pnpm run test:types`: validate published type definitions with `tsd`.
- `pnpm run lint` / `pnpm run format:check`: enforce Biome lint/format rules.
- `pnpm run fix`: run formatter + safe lint fixes.
- `pnpm run cli -- <args>`: run local CLI entrypoint (example: `pnpm run cli -- status`).

## Coding Style & Naming Conventions
Use ESM JavaScript with top-level imports. Prefer functional modules and explicit inputs/outputs over class-heavy designs.  
Project convention: prefer `let` over `const`.  
Biome is the source of truth: 2-space indent, single quotes, semicolons, trailing commas (`es5`), 80-char line width.  
File names are lowercase with hyphens where needed (example: `config-service.js`); tests use `*.test.js`.

## Testing Guidelines
Primary frameworks: Node’s built-in test runner (`node --test`), Playwright (reporter E2E), and `tsd` (types).  
Write tests around user outcomes and observable behavior; avoid mocking internal modules.  
Mock only external boundaries (network/time/randomness).  
No arbitrary sleeps; wait on concrete state/events.  
There is no strict coverage percentage gate today, but changed behavior should include focused tests.

## Commit & Pull Request Guidelines
Follow existing history style: gitmoji-prefixed, action-oriented commit subjects (examples: `✨`, `🐛`, `🔧`, `🔖`, `⚡️`).  
Keep subjects concise; include issue/PR refs when relevant (example: `(#217)`).  
PRs should include:
- Why the change is needed.
- A clear summary of all meaningful diff areas.
- A concise confidence/verification summary without listing commands run.
- Screenshots or terminal output for UI/reporting changes when helpful.
- Do not mention private or sibling repo work in public repo PRs.

## Security & Configuration Tips
Use Node.js `>=22`. Keep secrets (for example `VIZZLY_TOKEN`) out of git.  
For local development, isolate CLI state with `VIZZLY_HOME` (for example `~/.vizzly.dev`) to avoid mutating real user config.
