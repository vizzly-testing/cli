# CI

CI uses the config committed to the repository. Set up Vizzly locally first.

## Cloud CI

Use a project token from the repo's existing secret store. Never print it or
save it in the repo.

```bash
vizzly run "<existing visual test command>" --json
```

Add `--wait` when you want CI to wait for cloud comparisons and fail on visual
differences. Changed comparisons then make the command exit with code `1`.

For parallel CI, give every shard the same ID for that CI run. Run shards
without `--wait`, then finalize once they all finish:

```bash
vizzly run "<shard test command>" --parallel-id "<shared-ci-run-id>" --json
vizzly finalize "<shared-ci-run-id>" --json
```

## Troubleshoot

- `vizzly doctor`: check local config.
- `vizzly status <build-id> --json`: check cloud build status.
- `vizzly api schema --json`: find cloud review requests and their inputs
  and outputs.

If screenshots are missing, check the integration and the test that should
capture them. If auth is missing, check the `VIZZLY_TOKEN` CI secret.
