# Working in the codebase

Start with the feature's domain. A change to project linking should lead you to
`src/domains/projects/`, where its commands, requests, storage, and service live.
The folder tells you who owns the behavior; the filename tells you its role.

## Find the owner

| Domain under `src/domains/` | Responsibility |
| --- | --- |
| `api` | Generic authenticated requests and cloud schema discovery. |
| `auth` | Device login, logout, identity, token storage, credential-aware cloud requests, and local auth routes. |
| `baselines` | Baseline metadata, cloud baseline reads, and local acceptance. |
| `builds` | Cloud build creation, reads, status, and finalization. |
| `comparisons` | Comparison queries and local comparison results. |
| `config` | Configuration contracts, discovery, loading, planning, and local settings routes. |
| `context` | Cloud and local visual evidence, provider selection, and context projections. |
| `diagnostics` | Doctor checks and local environment information. |
| `previews` | Static preview requests and upload commands. |
| `projects` | Organization/project access, project linking, and project credentials. |
| `reports` | Report projections, static HTML generation, dashboard routes, and report events. |
| `review` | Approval, rejection, and comment commands. |
| `runs` | Test execution, build coordination, sessions, and plugin execution events. |
| `screenshots` | Screenshot identity, validation, image input, and capture delivery. |
| `setup` | Guided init, prompts, bundled skills, and agent guidance installation. |
| `tdd` | Local comparison workflow, daemon lifecycle, registry, and capture commands. |
| `updates` | Version checks, update notices, and package-manager upgrades. |
| `uploads` | Screenshot upload workflow, file selection, deduplication, and progress. |

Local and cloud operations can belong to the same domain. Choose ownership by
what the operation does. The `api` domain handles generic API invocation; build
requests belong to `builds`, for example.

## Choose the file's role

Every role is optional. Add a file when it has a responsibility to hold.

| File | Responsibility |
| --- | --- |
| `*.commands.js` | CLI input, domain calls, terminal/JSON output, and exit behavior. |
| `*.routes.js` | Local HTTP input, domain calls, and HTTP responses. |
| `*.service.js` | Domain operations, including filesystem, network, and integration work. |
| `*.validations.js` | Reusable contracts for command options, requests, source payloads, or service inputs. |
| `*.rules.js` | Named preconditions such as required credentials or valid configuration choices. |
| `*.normalizers.js` | Pure projections of incoming data into the shape the domain uses. |
| `*.serializers.js` | Pure projections into outward response or command data shapes. |

Use plain named helpers for narrower responsibilities, such as
`screenshots/screenshot-identity.js` or `projects/project-link-store.js`.
One service file can compose these helpers without becoming a large file itself.
Commands can share the same domain without sharing one command file.

Keep durable record contracts in `*.model.js` when the application actually owns
that persisted shape. A build request payload alone doesn't need a model.
Likewise, add background job contracts only if there is a real queued job
boundary. There are no required model or job placeholders.

Keep normalizers and serializers free of I/O and authorization. Put reusable
preconditions in rules and input parsing in validations. New services should use
explicit inputs and visible side effects. Existing services also emit progress,
output, and events; moving them doesn't change those observable contracts.

## Compose through explicit imports

`src/cli.js` registers domain commands. `src/server/http-server.js` wires local
routes. SDK and plugin entrypoints assemble domain capabilities for their callers.
There is no runtime domain discovery or automatic wiring based on filenames.

Import a named function from the module that owns it. A cross-domain caller
should use a service or a reusable contract. Cross-domain command composition,
such as linking a project during guided setup, lives under `src/cli/` and is
passed into the owning command explicitly. Keep dependencies one-way where possible; if two
domains need each other's internals, reconsider which one owns the operation.

Use package entrypoints for the public exports they promise. Inside the project,
import the implementation directly. Don't add domain barrels, forwarding modules
at old internal paths, or a second implementation to ease a file move.

## Keep shared code narrow

The folders beside `domains/` have specific jobs:

- `src/services/`: shared capabilities such as HTTP protocol helpers, filesystem
  changes, global JSON settings, secret storage, Git/CI information, terminal
  output, and package paths. These modules must not import product domains or
  decide product policy.
- `src/server/`: HTTP hosting, middleware, asset delivery, proxying, and server
  lifecycle. Product routes remain with their domains.
- `src/plugins/`: plugin discovery, the public plugin service interface, and
  composition of the services plugins consume.
- `src/errors/`: shared error types.
- `src/index.js`, `src/client/`, `src/sdk/`, and `src/types/`: package entrypoints
  and declarations for external callers.

A helper used by two domains can still have a clear domain owner. Move it into
shared services only when its responsibility is independent of those domains.
Avoid recreating a generic utilities folder.

## Respect the browser boundary

`src/reporter/` remains a separate Vite browser/SSR build. Its source follows the
same ownership pattern under `src/reporter/src/domains/`:

- `auth`, `builds`, `config`, `reports`, and `review` own their screens, hooks,
  queries, and request functions.
- `*.queries.js` composes query hooks; `*.service.js` owns browser request calls.
- `services/` contains the shared HTTP client, query client/keys, and SSE code.
- `layout/` and `ui/` contain shared presentation. `app-router.jsx`, `main.jsx`,
  and `ssr-entry.jsx` compose the application.

Browser code must not import Node modules, secrets, filesystem operations, or
server services. A deliberate shared leaf can be imported directly when it has
no Node dependencies: `src/domains/reports/report.normalizers.js` is the shared
report-data projection. Keep that module browser-safe.

Built reporter assets remain in `dist/reporter/`; the static renderer remains in
`dist/reporter-ssr/`. Package-relative resources use
`src/services/package-info.js:getPackageRoot()` so source and installed builds
resolve the same packaged artifacts.

## Verify the change

Focused `*.test.js` files live beside their owning domain, shared capability,
server, plugin, client, or SDK module. This includes deterministic contracts and
integration tests with a clear owner. A filename such as
`baselines/baseline-download.test.js` makes the relevant tests easy to find.

CLI subprocess workflows live in `tests/cli/<domain>/`; browser workflows and
their fixtures stay in `tests/reporter/`. Packed-package workflows live in
`tests/packaging/`, and published declaration checks stay in `test-d/`. Shared
test-only helpers stay in `tests/helpers/`. Avoid separate `unit`, `commands`,
or `core` test buckets that hide which feature owns a test.

`scripts/test.js` discovers the same source, workflow, and Swift adapter tests for
normal and watch runs. Build compilation excludes `*.test.js`, so colocated
tests do not ship in the package. Run the build before the full suite; the packed
workflow verifies the actual compiled package and report artifacts.

Use real files, images, HTTP, and CLI processes where they are the consumed
boundary. Do not copy production functions into tests or replace domain logic
with handwritten fakes. When replacing a test, name the outcome its replacement
proves before deleting it. Keep pure edge cases when they add confidence beyond
a workflow, and remove duplicate or assertion-free cases.

Run `pnpm run check:architecture` after moving files or changing imports. Use the
normal lint, format, build, Node tests, type tests, and reporter tests for the
parts you change. The architecture check covers structure; user outcomes still
need tests at their consumed boundary.

A reorganization must preserve public specifiers (`@vizzly-testing/cli`,
`/client`, `/sdk`, and `/config`), exported names, plugin methods/events, CLI
flags/output/exit codes, and local HTTP behavior. Verify runtime resource paths
and subprocess entrypoints as well as imports. Run local checks with an isolated
`VIZZLY_HOME` so development doesn't alter your real configuration.
