# CLI And Context

Use these commands to gather Vizzly evidence before making UI assumptions.

## Local TDD

```bash
vizzly tdd start
vizzly tdd run "<test command>" --no-open
vizzly context build current --source local --agent
vizzly context build current --source local --agent --json
```

Local context reads `.vizzly` state and does not require cloud auth.

## Cloud Builds

```bash
export VIZZLY_TOKEN="project-token"
vizzly run "<test command>" --wait --json
vizzly context build <build-id> --agent --json --include diffs,comments
```

`vizzly run --wait --json` returns a `contextCommand` when a cloud build is created. Prefer that command over constructing URLs by hand.

## Drilldowns

```bash
vizzly context comparison <comparison-id> --json
vizzly context screenshot "<screenshot-name>" --json
vizzly context similar <fingerprint-hash> --json
vizzly context review-queue --json
```

Use comparison context for one diff. Use screenshot context for history and recurring dynamic areas. Use review queue context when triaging unresolved visual work.

## Good Agent Behavior

- Use `--json` for automation and summaries.
- Use `--agent` when building prompt context or asking another agent to continue.
- Keep human-readable command output in final summaries only when it changes the user's next action.
- Do not approve/reject unless explicitly asked.
