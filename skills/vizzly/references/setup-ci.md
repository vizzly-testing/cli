# Setup And CI

Use Vizzly locally for fast feedback and in CI for shared review.

## Local Setup

```bash
vizzly init
vizzly tdd start --open
vizzly tdd run "<test command>" --no-open
```

The local SDK discovers `.vizzly/server.json` and sends screenshots to the TDD server when it is running.
For one-off checks, `vizzly tdd run` writes local review data under `.vizzly/`
and prints a context command for follow-up inspection.

## Cloud Setup

```bash
export VIZZLY_TOKEN="project-token"
vizzly run "<test command>" --wait
```

Use project tokens in CI. Avoid committing tokens.

## Parallel CI

Use `--parallel-id` when jobs are sharded:

```bash
vizzly run "npm test -- --shard=1/4" --parallel-id shard-1 --wait
```

Keep fast PR checks and broad scheduled checks separate:

- PR builds: critical flows and changed surfaces.
- Nightly builds: full-page sweeps, generated image suites, docs/manual captures.

## Troubleshooting

- Run `vizzly doctor` for local configuration checks.
- Run `vizzly status <build-id>` for cloud build status.
- Run `vizzly context build <build-id> --agent --json` for review evidence.
- If no screenshots appear, verify the SDK/import is present and the TDD server or `vizzly run` wrapper is active.
