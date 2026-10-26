# Setup and CI

Use this guide when the task includes setup, CI changes, or config problems.
These commands can change files or cloud builds.

## Set up Vizzly

Run this only when the task authorizes setup:

```bash
vizzly init
```

See [CLI context](cli-context.md) for local results and starting or stopping TDD.

## Cloud CI

Use a project token from the repo's existing secret store. Never print it or
save it in the repo.

```bash
vizzly run "<existing visual test command>" --wait --json
```

For parallel CI, give every shard the same ID for that CI run. Run shards
without `--wait`, then finalize once they all finish:

```bash
vizzly run "<shard test command>" --parallel-id "<shared-ci-run-id>" --json
vizzly finalize "<shared-ci-run-id>" --json
```

## Troubleshoot

- `vizzly doctor`: check local config.
- `vizzly tdd status --json`: check a local server started for this task.
- `vizzly status <build-id> --json`: check cloud build status.
- `vizzly api schema --json`: find cloud review requests and their inputs
  and outputs.

If screenshots are missing, check the existing integration, the test that
should capture them, and the active session. If auth is missing, report it.
Only start login when setup is part of the task.
