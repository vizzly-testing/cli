# CLI Context

Use the repository's established CLI invocation and existing authentication.
If cloud authentication is unavailable, report the blocker. Do not start an
interactive login unless setup is in scope.

## Choose The Evidence

Use an ID supplied by the task. If no cloud build is supplied, list recent
builds and select the one matching the branch, commit, or pull request:

```bash
vizzly builds --branch <branch> --limit 5 --json
vizzly status <build-id> --json
vizzly context build <build-id> --source cloud --agent --json
```

Use status for lifecycle facts and build context for visual evidence. Do not
assume the first returned comparison is the most important; preserve API order
and inspect the records relevant to the task.

For saved local evidence:

```bash
vizzly context build current --source local --agent --json
vizzly context screenshot "<screenshot-name>" --source local --json
vizzly context review-queue --source local --json
```

Confirm the stored build, branch, timestamp, and baseline are current enough
for the task.

## Generate Fresh Evidence

For one run, let Vizzly own the local session:

```bash
vizzly tdd run "<existing visual test command>" --no-open
```

For repeated runs, start the detached daemon once:

```bash
vizzly tdd start --json
vizzly tdd status --json
<existing visual test command>
vizzly tdd stop --json
```

`tdd run` and `tdd start` are alternatives. Stop only a daemon started for the
current task.

When a cloud build is in scope:

```bash
vizzly run "<existing visual test command>" --wait --json
vizzly context build <build-id> --source cloud --agent --json
```

## Inspect A Comparison

Follow the build response's `suggested_commands`. The direct form is:

```bash
vizzly context comparison <comparison-id> --source <local-or-cloud> --agent --json
vizzly context comparison <comparison-id> --source <local-or-cloud> --agent --include diffs --json
```

Open all three images together. Prefer `original_url` and fall back to `url`:

- Current: `comparison.screenshot.original_url` or
  `comparison.screenshot.url`
- Baseline: `comparison.baseline.original_url` or `comparison.baseline.url`
- Diff: `comparison.analysis.diff_image_url`

Then compare the visible change with diff regions, fingerprint, and the
separate `similar_by_fingerprint` and `recent_by_name` history streams.
Previous review decisions help explain recurring evidence but do not decide the
current review.

Useful supporting commands:

```bash
vizzly context screenshot "<screenshot-name>" --source <local-or-cloud> --json
vizzly context similar <fingerprint-hash> --source cloud --json
vizzly context review-queue --source <local-or-cloud> --json
```

Use `--include diffs` only when compact diagnostics are insufficient. Request
comments only when human review context matters.

## Continue Without Guessing

Run returned `suggested_commands` rather than reconstructing IDs, sources, or
pagination. When more evidence exists, the next-page command carries the API's
opaque `--cursor`; do not edit or interpret it. Keep follow-up commands pinned
to the source that produced the evidence.
