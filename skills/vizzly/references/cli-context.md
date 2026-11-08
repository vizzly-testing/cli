# CLI evidence

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

Discover accessible organizations and projects before guessing a destination:

```bash
vizzly orgs --auth user --json
vizzly projects --auth user --json
vizzly builds --auth user --project <project-slug> --org <org-slug> --json
```

These reads don't require linking a checkout. `--auth user` selects the saved
login even when the repo launcher exports a project token. A project token sees
only its own project. In `auto` mode, explicit flag/env/config credentials win
over a saved login; a saved login wins over an implicit linked upload credential.
Use `--auth token` to deliberately inspect the token's view. Don't combine
`--auth user` with `--token`.

Follow `pagination.nextOffset` when `pagination.hasMore` is true. A list command
returns one logical page; large limits can require several bounded API requests.
If the next offset is null while more results exist, narrow your filters to stay
within the API's offset limit. An expired selected login is refreshed automatically;
a rejected session asks for login. Report the recovery action when interactive
login isn't authorized. Network failures preserve the session. `whoami` reports
granted scopes: reads require `read`, uploads require `builds:write`, review
decisions require `reviews:write`, and comments require `comments:write`. A scope
denial requires explicit user consent for additional permissions, not repeated
refreshes or a different identity.

`vizzly project status --json` describes configured and effective upload
destinations separately. Use `project link` only when setup or changing the
upload destination is authorized. It saves the destination without issuing a credential.
The selected login can upload when it has `builds:write`; explicit project tokens
remain the automation path. Browsing another project must not change that binding.

Use the ID supplied by the task. If no cloud build is named, find recent builds
and choose the one matching the branch, commit, or pull request:

```bash
vizzly builds --branch <branch> --limit 5 --json
vizzly status <build-id> --json
vizzly comparisons --build <build-id> --json
vizzly api schema sdk.listBuildScreenshots --json
```

Use status to check build progress, then read the build's comparisons and
captures for screenshots and diffs. Keep the API's comparison order and inspect
the records that matter to the task. The first comparison isn't necessarily the
most useful.

For saved local results:

```bash
vizzly tdd screenshots list --json
vizzly tdd screenshots list --status failed --json
vizzly tdd screenshots show "<screenshot-name>" --json
```

These read the latest saved run. If it may predate your change, generate fresh
evidence before drawing conclusions.

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
[CI guide](ci.md#cloud-ci).

## Inspect a comparison

Read the comparison, then find its image request in the schema:

```bash
vizzly comparisons --id <comparison-id> --json
vizzly api schema sdk.getComparisonImage --json
```

Download the current, baseline, and diff images through
`sdk.getComparisonImage`, using the comparison ID and image kind. Include the
version header from the schema and use `--output <new-file>` to save each image.

View the available images together. A new capture may have no baseline, and an
identical capture may have no diff. Report missing or inaccessible images;
don't invent them. Use `visual_review` on the comparison to check the review
decision.

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
vizzly comparisons --name "<screenshot-name>" --json
vizzly comparisons --build <build-id> --status changed --json
```

Use IDs and page values from the API response. Pass cursors back unchanged,
keep the same query, and request only what you need. Fetch comments when they
help explain a review.


### Comments and agent disclosure

After the user authorizes a review action, comment on the build or the exact
screenshot area using IDs from discovery. `--layer current|baseline|diff`
picks the image you're commenting on and defaults to `current`. Regions use
that layer's original bitmap pixels, with the origin at its top-left; use the
image dimensions, not the viewport. Current and diff share the current image's
pixels, while baseline uses the baseline image, which can be a different
height. `--point x,y` pins a spot as integer percentages (0-100) instead of a
region. Replies inherit their thread's layer and location, so omit `--layer`,
`--region`, and `--point` with `--reply-to`.

```bash
vizzly comment <build-id> "Navigation overlaps the heading" --screenshot <screenshot-id> --region 20,40,300,80 --json
vizzly comment <build-id> "Old footer spacing" --screenshot <screenshot-id> --layer baseline --region 40,200,320,120 --json
vizzly comment <build-id> "Button shifted" --screenshot <screenshot-id> --layer diff --point 50,12 --json
vizzly comment <build-id> "Follow-up" --screenshot <screenshot-id> --reply-to <comment-id> --json
```

Review decisions and comments automatically disclose Codex, Claude Code, Pi,
Gemini CLI or OpenCode when the harness exports its identification variable.
The logged-in user remains the author; disclosure never grants permissions.
Use `--via-agent <slug>` for another agent or to resolve conflicting markers.
`VIZZLY_VIA_AGENT` provides an environment override. Explicit flags win.
Only the reported agent name/slug is sent; session IDs and prompts stay local.
Do not treat reported disclosure as verified identity or permission to act.
