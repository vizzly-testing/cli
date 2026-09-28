# Setup And CI

Use this reference only when the task includes initialization, CI changes, or
configuration troubleshooting. These workflows mutate files or external build
state.

## Initialize

Initialize only with authorization:

```bash
vizzly init
```

Use [CLI context](cli-context.md) for local evidence and TDD lifecycle commands.

## Cloud CI

Use a project-scoped token from the repository's existing secret system. Never
print it or write it into the repository.

```bash
vizzly run "<existing visual test command>" --wait --json
```

For parallel CI, give every shard the same workflow-specific parallel ID. Run
shards without `--wait`, then finalize once after all shards finish:

```bash
vizzly run "<shard test command>" --parallel-id "<shared-ci-run-id>" --json
vizzly finalize "<shared-ci-run-id>" --json
```

## Troubleshoot

- `vizzly doctor`: local configuration
- `vizzly tdd status --json`: a local daemon started by the task
- `vizzly status <build-id> --json`: cloud lifecycle
- `vizzly context build <build-id> --source cloud --agent --json`: visual
  evidence

If screenshots are absent, verify the existing integration, the test path that
should capture them, and the active session. If authentication is absent,
report it rather than logging in unless setup is in scope.
