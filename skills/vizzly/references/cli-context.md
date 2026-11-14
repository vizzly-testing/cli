# CLI evidence

Use the repository's CLI invocation and existing credentials. Cloud evidence
comes from `vizzly api`; saved local comparisons come from `vizzly tdd screenshots`.
The API command targets the configured cloud server, not the local TDD server.

## Query the cloud API

Discover the requests supported by this server before choosing a path:

```bash
vizzly api schema --json
vizzly api schema <operation-id> --json
vizzly api schema <operation-id> -q view=fields --json
vizzly api schema <operation-id> -q view=response --json
```

Use the returned method, path, headers, parameters, and body with `vizzly api`.
Replace path placeholders with actual IDs. Include the API version header from
discovery; the CLI doesn't add it. Treat `example.argv` as an argument array,
not a shell script. API payloads are under `data.response`, inside the CLI's
`status: "data"` envelope. Check the exit code before consuming a result.

Useful operations to look for in the index:

| Evidence | Operation |
| --- | --- |
| Accessible projects | `sdk.listProjects` |
| Builds matching a project, branch, or environment | `sdk.listBuilds` |
| Processing progress and review outcome | `sdk.getBuildStatus` |
| All captures in a build | `sdk.listBuildScreenshots` |
| Current review state | `visualReview.show` |
| One capture's image | `sdk.getScreenshotImage` |
| Current, baseline, or diff image | `sdk.getComparisonImage` |
| Paged changed regions or full analysis | `sdk.getComparisonRegions`, `sdk.getComparisonAnalysis` |
| Review discussion | `sdk.listBuildComments`, `sdk.listScreenshotComments` |

These are discovery hints. Use the current index and each operation's contract
if a name, field, permission, or endpoint differs.

Use a build supplied by the task. Otherwise, find the project and a build whose
branch, commit, or pull request matches the work. Keep missing values unknown.
Build completion and review approval are separate facts.

List the build's screenshots before inspecting individual comparisons. A capture
can have a null `comparison_id` while processing, or after a failure. Use the
screenshot's own image request when there is no comparison; never put `null` or
`undefined` into a comparison path.

The API returns one page per request. Follow that operation's page fields:
build lists use `meta`, screenshot lists use `page`, and region lists use cursors.
Keep filters and page size unchanged when continuing. Inspect the captures that
matter to the task; the first record isn't necessarily the most useful.

## Inspect images and details

Download images with `--output <new-file>`. Existing files aren't overwritten.
Open current, baseline, and diff together when available. A new capture may have
no baseline; an identical capture may have no diff. Report which images you
actually inspected, and call a result metadata-only if no image could be opened.

Discover regions and analysis only when images don't answer the question:

```bash
vizzly api schema sdk.getComparisonRegions --json
vizzly api schema sdk.getComparisonAnalysis --json
```

Use `--output <new-file>` for full analysis. Compare measurements with the images;
don't infer a visual cause from percentages or region counts alone. An unavailable
analysis artifact doesn't mean the screenshot passed.

Export the full schema only when needed:

```bash
vizzly api schema --full --output <new-file> --json
```

## Credentials and authorized writes

Schema discovery works without login. Ordinary API reads need credentials for
the operation. `--auth user` selects the saved login; `--auth token` selects a
project token. Explicit flag/env/config credentials win in `auto` mode. Don't
combine `--auth user` with `--token`, change the upload binding to browse another
project, or print tokens. Report missing authentication; start a login only when
setup is in scope. `vizzly whoami --json` reports granted scopes.

For an authorized review decision or comment, discover its schema:

```bash
vizzly api schema visualReview.comparison.decide --json
vizzly api schema visualReview.build.decide --json
vizzly api schema sdk.createScreenshotComment --json
vizzly api schema sdk.createBuildComment --json
```

Review writes require a user login with the operation's scope. Project tokens
can't approve, reject, or comment. Include `X-Organization` when the schema
requires it. Send the body with `-d @request.json` or `-d @-`.

Use a fresh UUID `commandId` for each intended action that supports it. Keep that
ID and the exact body for a retry of the same action. Writes aren't automatically
replayed. If the outcome is uncertain, read the review state before retrying;
reread on a conflict.

The generic API command sends the body you supply. It doesn't add the dedicated
review commands' automatic agent disclosure. Include the schema's `via` object
for an agent-assisted write, such as
`{"type":"agent","slug":"codex","name":"Codex"}`. The authenticated user stays
the author; disclosure doesn't grant permission or verify an agent's identity.

Screenshot comments use the chosen layer's bitmap pixels from its top-left.
Current and diff use current-image pixels; baseline uses its own image, which
may have a different height. Use image dimensions rather than viewport size.
Replies inherit their thread's layer and location. Check the schema for region,
point, and reply fields instead of copying fields from a CLI shortcut.

## Generate fresh local evidence

For one run, let Vizzly start and stop the local server:

```bash
vizzly tdd run "<existing visual test command>" --no-open --json
```

For repeated runs, start one background server and run the existing tests:

```bash
vizzly tdd start --json
vizzly tdd status --json
<existing visual test command>
vizzly tdd stop --json
```

Use the reported port when one was auto-selected. Only stop a server started
for this task. Keep the test command's output and exit status: setup, capture,
comparison, or report errors can fail a visual run even when the tests pass.

## Review a saved local TDD run

Read `.vizzly/` from the project directory after the run. No server or cloud
credentials are needed:

```bash
vizzly tdd screenshots list --page 1 --page-size 20 --json
vizzly tdd screenshots list --status failed --json
vizzly tdd screenshots list --status new --json
vizzly tdd screenshots show <comparison-id> --image all --json
vizzly tdd screenshots latest "<screenshot-name>" --json
```

`list` returns comparison IDs, status, browser, viewport, current image paths,
and pagination. Follow `hasNext` with the next `page`, retaining `pageSize` and
the status filter. A screenshot name may identify several variants; use the
comparison ID to select one. Local status `failed` means a visual difference,
while `error` means comparison processing failed.

`show` returns comparison facts, local image paths, and saved analysis details.
The default image is current; `--image all` adds baseline and diff. Check each
image's `exists` flag and open the files with an image viewer. A null image is
unavailable, not an invitation to guess its path. `latest` selects the newest
capture, optionally by exact name; without `--json` it prints only its path.

These commands describe the latest saved report, not cloud history or a project
review queue. They don't identify the Git commit that produced the captures.
Generate fresh evidence if the report may predate your change.

Only when accepting a local baseline is part of the task:

```bash
vizzly tdd screenshots accept <comparison-id> --json
```

This copies one current image into its baseline and updates the saved report.
It doesn't approve a cloud build. Don't accept a change to hide an unexplained
diff. `vizzly baselines --json` lists the local baseline files and metadata.

For cloud capture, use the repository's existing `vizzly run` workflow and then
discover its results with `vizzly api schema`. See the [CI guide](ci.md#cloud-ci).
