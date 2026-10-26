# CLI context

Use the repo's usual CLI command and existing credentials. If cloud auth isn't
available, report it. Only start an interactive login when setup is part of
the task.

## Query the cloud API

Check the live API schema for endpoints and options:

```bash
vizzly api schema --json
vizzly api schema <operation-id> --json
vizzly api schema <operation-id> -q view=fields --json
vizzly api schema <operation-id> -q view=response --json
```

The index lists available requests. Each operation shows the method, path,
parameters, auth, and example arguments. Ask for field choices or response types
as needed. API results are under `data.response`.

Call the returned path with `vizzly api <path>`. Use `-X` for the method, `-H`
for headers, and `-q` for query parameters. Include the API version header from
the schema on data requests. Use `fields` to ask for just the data you need.

The CLI fetches one page per request. Use the response's page fields to get
more results. Pass cursors back unchanged and keep the same query.

To review a build, find the project and build, then check its screenshots,
comparisons, and image endpoints. Download images with `--output <new-file>`
and view the baseline, current, and diff together. File output also helps with
large analysis results. Existing files won't be overwritten. Export the full
schema only when needed:

```bash
vizzly api schema --full --output <new-file> --json
```

Review decisions need the user's authorization, user credentials, and the
organization header listed in the schema. Check the decision request's body
before sending it with `-d @<file>` or `-d @-` for stdin. Make a fresh `commandId`
for each intended decision, then read back the review state. Writes aren't
retried automatically. If you're unsure whether one succeeded, check the state
before trying again. Treat schema examples as argument arrays, not shell scripts.

## Choose the evidence

Use the ID supplied by the task. If no cloud build is named, find recent builds
and choose the one matching the branch, commit, or pull request:

```bash
vizzly builds --branch <branch> --limit 5 --json
vizzly status <build-id> --json
vizzly api schema sdk.getBuildContext --json
```

Use status to check build progress, then follow the build-context API for
screenshots and diffs. Keep the API's comparison order and inspect the records
that matter to the task. The first comparison isn't necessarily the most useful.

For saved local results:

```bash
vizzly context build current --source local --json
vizzly context screenshot "<screenshot-name>" --source local --json
vizzly context review-queue --source local --json
```

Check that the saved build, branch, timestamp, and baseline are recent enough
for the task.

## Generate fresh evidence

For one run, let Vizzly start and stop the local server:

```bash
vizzly tdd run "<existing visual test command>" --no-open
```

For repeated runs, start a background server once:

```bash
vizzly tdd start --json
vizzly tdd status --json
<existing visual test command>
vizzly tdd stop --json
```

Choose `tdd run` or `tdd start`. Only stop a server started for this task.

## Review a local TDD run

After `tdd run` exits, read captures from `.vizzly/`. You don't need a running
server or cloud credentials:

```bash
vizzly tdd screenshots list --page 1 --page-size 20
vizzly tdd screenshots latest
vizzly tdd screenshots show <comparison-id>
```

`latest` prints the newest current screenshot's path. Use `list` to find a
specific comparison ID or browser variant. While changing UI, open the current
image first. Add `--image diff` or `--image all` when you need to compare it.
Open the printed paths with an image viewer.

`accept` replaces one local baseline and updates the report entry. Use it only
when the task explicitly authorizes accepting a baseline:

```bash
vizzly tdd screenshots accept <comparison-id>
```

Don't accept a change just to make a diff disappear.

When the task calls for a cloud build:

```bash
vizzly run "<existing visual test command>" --json
vizzly api schema --json
```

To make visual differences fail CI, see the
[CI guide](setup-ci.md#cloud-ci).

## Inspect a comparison

Find comparison and image requests in the schema:

```bash
vizzly api schema getComparisonContext --json
vizzly api schema sdk.getComparisonImage --json
```

Request `comparison.images` to check which current, baseline, and diff images
are available. Download them through `sdk.getComparisonImage`, using the
comparison ID and image kind. Include the version header from the schema and
use `--output <new-file>` to save each image.

View the available images together. A new capture may have no baseline, and an
identical capture may have no diff. Report missing or inaccessible images;
don't invent them. Request `comparison.review` to check the review decision.

Changed regions and full analysis use separate requests. Discover them when
the images alone don't answer the question:

```bash
vizzly api schema sdk.getComparisonRegions --json
vizzly api schema sdk.getComparisonAnalysis --json
```

Use `--output <new-file>` for full analysis. Compare those details with the
images and earlier comparisons. Previous decisions can help explain a recurring
change; they don't decide the current review.

Other useful commands:

```bash
vizzly context screenshot "<screenshot-name>" --source <local-or-cloud> --json
vizzly context similar <fingerprint-hash> --source cloud --json
vizzly context review-queue --source <local-or-cloud> --json
```

Use IDs and page values from the API response. Pass cursors back unchanged,
keep the same query, and request only what you need. Fetch comments when they
help explain a review.
