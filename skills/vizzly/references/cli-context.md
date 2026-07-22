# CLI And Context

Use these commands to gather Vizzly evidence before making UI assumptions.

## Local TDD

```bash
vizzly tdd start --open
vizzly tdd status
vizzly tdd stop
vizzly tdd run "<test command>" --no-open
vizzly context build current --source local --agent
vizzly context build current --source local --agent --json
```

If `tdd start` prints a non-default port, pass that same port to
`tdd status --port <port>` and `tdd stop --port <port>`.

Local context reads `.vizzly` state and does not require cloud auth. After a
one-shot `tdd run`, prefer the printed `contextCommand` before editing UI.

## Cloud Builds

```bash
export VIZZLY_TOKEN="project-token"
vizzly run "<test command>" --wait --json
vizzly status <build-id> --json
vizzly context build <build-id> --agent --json
```

`vizzly run --wait --json` returns a `contextCommand` when a cloud build is created. Prefer that command over constructing URLs by hand.

Status reports the server-owned lifecycle, processing, comparison, and review
facts. Build context is the visual debugging handoff. Its default agent payload
is bounded, so start there before requesting larger collections.

For each evidence record:

1. Look at the current, baseline, and diff image URLs.
2. Read the viewport, browser, metadata, review state, and compact Honeydiff
   diagnostics alongside those images.
3. Run the exact `suggested_commands` returned by the payload to inspect the
   comparison or screenshot history.
4. Add `--include diffs` only when you need raw Honeydiff region geometry, and
   request comments only when human review context matters.

Do not turn missing fields into guessed progress, counts, or conclusions. Cloud
status and context are projections of API facts.

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
- Follow returned `suggested_commands` instead of guessing identifiers or URLs.
- Keep human-readable command output in final summaries only when it changes the user's next action.
- Do not approve/reject unless explicitly asked.
