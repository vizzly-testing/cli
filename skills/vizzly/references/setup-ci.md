# Setup And CI

Use this reference only when the user asks to initialize Vizzly, change CI, or
troubleshoot configuration. These workflows mutate project files or external
build state.

## Local Setup

Initialize only with authorization:

```bash
vizzly init
```

After setup, choose one local execution mode:

```bash
vizzly tdd run "<existing visual test command>" --no-open
```

or:

```bash
vizzly tdd start --json
<existing visual test command>
vizzly tdd stop --json
```

Do not run `tdd start` before `tdd run`; both own a local TDD server lifecycle.

## Cloud CI

Use a project-scoped token supplied by the user's existing secret-management
system. Never print it, write it into the repository, or replace working
credentials while debugging.

Wrap the CI job's existing visual test command:

```bash
vizzly run "<existing visual test command>" --wait --json
```

## Parallel CI

Give every shard in one build the same parallel ID, unique to that workflow
attempt. Run all shards without `--wait`, then finalize that shared ID once
after every shard finishes:

```bash
vizzly run "<shard test command>" --parallel-id "<shared-ci-run-id>" --json
vizzly finalize "<shared-ci-run-id>" --json
```

Do not create a different parallel ID per shard, and do not wait for a parallel
build to complete before it has been finalized. Use one finalizer rather than
having every shard race to finalize the build.

## Troubleshoot

- Run `vizzly doctor` for local configuration checks.
- Run `vizzly tdd status --json` for a local daemon started by the task.
- Run `vizzly status <build-id> --json` for cloud lifecycle facts.
- Run `vizzly context build <build-id> --agent --json` for visual evidence.
- If screenshots are absent, verify the existing SDK or integration, the test
  path that should capture them, and the active local or cloud session.
- If authentication is absent, report it rather than initiating login unless
  setup is explicitly in scope.
