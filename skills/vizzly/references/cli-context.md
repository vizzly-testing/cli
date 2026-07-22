# CLI And Context

Use the repository's existing CLI invocation. The examples use `vizzly` for
brevity; substitute the repository's package script or package-manager command
when needed.

Use existing authentication and project configuration. If cloud authentication
is missing, report the blocker. Do not start an interactive login or change
credentials unless the task includes setup.

## Inspect Existing Local Evidence

Request structured local evidence with both `--agent` and `--json`:

```bash
vizzly context build current --source local --agent --json
vizzly context screenshot "<screenshot-name>" --source local --json
vizzly context review-queue --source local --json
```

Pin hand-written local drill-downs with `--source local`. Without it, automatic
source resolution may fall back to cloud data when a local item is unavailable.

Local context reads persisted `.vizzly` artifacts. Confirm that their build,
branch, timestamp, and baseline match the task before treating them as current.

## Generate Fresh Local Evidence

For a one-off run, let Vizzly own the complete local session:

```bash
vizzly tdd run "<existing visual test command>" --no-open
vizzly context build current --source local --agent --json
```

For repeated test runs, start the detached daemon once:

```bash
vizzly tdd start --json
vizzly tdd status --json
<existing visual test command>
vizzly context build current --source local --agent --json
vizzly tdd stop --json
```

Treat `tdd run` and `tdd start` as alternatives. Do not shell-background
`tdd start`; it already launches a detached daemon. Stop only a server started
for the current task, and reuse the printed port for status or stop commands
when Vizzly selects a non-default port.

## Inspect Cloud Evidence

When the task already has a build ID:

```bash
vizzly status <build-id> --json
vizzly context build <build-id> --agent --json
```

Use status for server-owned lifecycle, processing, comparison, and review
facts. Use build context for visual debugging.

When creating a cloud build is in scope, wrap the repository's existing test
command:

```bash
vizzly run "<existing visual test command>" --wait --json
vizzly context build <build-id> --agent --json
```

The `contextCommand` returned by current `run` and `tdd run` output omits
`--json`. Add `--json` when using it as the bounded structured handoff.

## Read And Drill Into Evidence

For each evidence record:

1. Inspect the current, baseline, and diff images with an available harness
   capability. State the limitation if an image cannot be accessed.
2. Read render metadata, review state, and compact Honeydiff diagnostics next
   to the images.
3. Run the returned `suggested_commands` instead of reconstructing identifiers
   or URLs.
4. Add `--include diffs` only when raw Honeydiff region geometry is needed.
   Request comments only when human review context matters.

Useful manual drill-downs are:

```bash
vizzly context comparison <comparison-id> --json
vizzly context screenshot "<screenshot-name>" --json
vizzly context similar <fingerprint-hash> --json
vizzly context review-queue --json
```

`context similar` is cloud-only. Keep missing values unknown, and do not turn
metadata into a visual conclusion when the underlying images are unavailable.
