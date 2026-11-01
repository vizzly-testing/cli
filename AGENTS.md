# Repository Guidelines

## Project Structure & Module Organization

Read [docs/architecture.md](docs/architecture.md) for domain ownership and file roles.

- `src/domains/<domain>/` owns product commands, HTTP routes, services, and contracts.
- `src/cli.js` wires commands; `src/server/` owns HTTP hosting and middleware.
- `src/services/` contains narrow capabilities shared across domains; `src/plugins/` owns plugin loading and composition.
- `src/reporter/src/domains/` owns browser features. Its `services/`, `layout/`, and `ui/` folders contain shared browser code.
- `src/index.js`, `src/client/`, `src/sdk/`, and `src/types/` define published package surfaces.
- `tests/domains/` mirrors backend ownership. `tests/cli/` and `tests/reporter/` exercise complete user workflows; `test-d/` checks published types.
- `clients/` contains framework integrations and SDK clients. Reference docs live in `docs/`, examples in `examples/`, and build output in `dist/`.

## Architecture Rules

- Start product changes in the domain that owns the behavior. Keep commands and routes focused on input, service calls, and output.
- Use optional role files: `*.validations.js` for input contracts, `*.normalizers.js` for incoming projections, `*.serializers.js` for outgoing projections, `*.rules.js` for preconditions, and `*.service.js` for domain operations. Add plain named helpers when needed. Don't create empty role files.
- Keep normalizers and serializers pure. New service code should take explicit inputs and keep I/O visible. Existing service output/events remain part of their behavior until deliberately changed.
- Import named functions directly from their owning modules. Cross-domain imports should use service or contract modules, never another domain's commands or routes. Don't add internal re-export barrels, runtime discovery, domain manifests, or old-path forwarding files.
- Keep shared services independent of product domains. Server, CLI, SDK, and plugin composition may assemble domain capabilities.
- Keep Node runtime code out of the reporter. Share only explicit browser-safe leaf modules; `src/domains/reports/report.normalizers.js` is the current shared report projection.
- Preserve public package specifiers, exported names, plugin interfaces, CLI behavior, and local HTTP contracts when reorganizing internals.
- Run `pnpm run check:architecture` after changing source ownership or imports, then verify behavior at the relevant user boundary.

## Build, Test, and Development Commands
- `pnpm run build`: clean and compile CLI + reporter bundles into `dist/`.
- `pnpm test`: run Node test runner suites with coverage enabled.
- `pnpm run test:watch`: watch mode for fast local iteration.
- `pnpm run test:reporter`: run Playwright reporter workflow tests.
- `pnpm run test:types`: validate published type definitions with `tsd`.
- `pnpm run lint` / `pnpm run format:check`: enforce Biome lint/format rules.
- `pnpm run fix`: run the formatter and lint fixes, including Biome's unsafe fixes.
- `pnpm run cli -- <args>`: run the development CLI (example: `pnpm run cli -- tdd status`).

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
Use Node.js 22.18+ on Node 22, or Node.js 24+. Keep secrets (for example
`VIZZLY_TOKEN`) out of git.

For local development, isolate CLI state with `VIZZLY_HOME` (for example `~/.vizzly.dev`) to avoid mutating real user config.
