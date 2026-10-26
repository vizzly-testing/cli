# JSON output

Use `--json` to read command results in scripts or pipe them to `jq`.

## Get started

```bash
# Full JSON output
vizzly builds --json

# Select specific fields
vizzly builds --build <id> --json id,status,branch
```

Result JSON goes to stdout. Progress messages and diagnostics from
`output.error(...)` go to stderr. Check the command's exit status too; failures
may appear in result JSON or leave stdout empty.

## Pick fields

Pass comma-separated fields, with dots for nested values:

```bash
# Top-level fields
vizzly status <id> --json buildId,status,branch

# Preview fields with dot notation
vizzly status <id> --json buildId,status,preview.url
```

Field names refer to the result inside `data`. Fields that don't exist are
left out.

## Output format

Successful results look like this:

```json
{
  "status": "data",
  "data": {}
}
```

Errors reported by `output.error(...)` go to stderr and look like this:

```json
{
  "status": "error",
  "message": "Something went wrong",
  "error": { "name": "ErrorType", "message": "Details", "code": "ERROR_CODE" }
}
```

Some commands return `status: "data"` with the outcome (`completed`, `failed`,
or `skipped`) in `data.status`. Check that field too.

## Commands

Examples show representative fields with illustrative IDs, URLs, and dates.
Other fields depend on the command, config, and API response. Empty objects
stand in for command-specific data.

### `vizzly run`

```bash
vizzly run "pnpm test" --json
```

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "status": "completed",
    "contextCommand": "vizzly api schema sdk.getBuildContext --json",
    "screenshotsCaptured": 15,
    "executionTimeMs": 4821,
    "git": {
      "branch": "main",
      "commit": "abc1234",
      "message": "Add feature"
    },
    "exitCode": 0
  }
}
```

Run `contextCommand` to find the cloud build-context API, then use `buildId`
to fetch that build's results.

Add `--wait` to include comparison results:

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "status": "completed",
    "screenshotsCaptured": 15,
    "executionTimeMs": 9876,
    "git": {
      "branch": "main",
      "commit": "abc1234",
      "message": "Add feature"
    },
    "comparisons": {
      "total": 15,
      "new": 2,
      "changed": 1,
      "identical": 12
    },
    "visual_review": { "state": "pending" },
    "contextCommand": "vizzly api schema sdk.getBuildContext --json",
    "exitCode": 1
  }
}
```

With `--wait`, `data.status` is the cloud build's processing status. A completed
build can still return `exitCode: 1` when comparisons find visual differences.

### `vizzly tdd run`

```bash
vizzly tdd run "pnpm test" --json
```

```json
{
  "status": "data",
  "data": {
    "status": "failed",
    "exitCode": 1,
    "comparisons": [
      {
        "name": "button-primary",
        "status": "failed",
        "signature": "button-primary|1920|chromium",
        "diffPercentage": 4.2,
        "threshold": 2.0,
        "paths": {
          "baseline": "/path/to/project/.vizzly/baselines/button-primary.png",
          "current": "/path/to/project/.vizzly/current/button-primary.png",
          "diff": "/path/to/project/.vizzly/diffs/button-primary.png"
        },
        "viewport": { "width": 1920, "height": 1080 },
        "browser": "chromium"
      }
    ],
    "summary": {
      "total": 1,
      "passed": 0,
      "failed": 1,
      "new": 0,
      "errors": 0
    },
    "capture": {
      "setup": "ready",
      "reason": null,
      "accepted": 1,
      "rejected": 0,
      "errors": 0
    },
    "reportPath": "/path/to/project/.vizzly/report/index.html",
    "reportError": null,
    "contextCommand": "vizzly context build current --source local --json"
  }
}
```

Test output goes to stderr in JSON mode. Captured screenshots also produce
`.vizzly/report-data.json` and `.vizzly/report/index.html`. Run the returned
`contextCommand` to inspect that local data.

`reportPath` is null when no report was generated. `capture.rejected` counts
failed screenshot requests; comparison errors also appear in `capture.errors`
and `summary.errors`. Those counts can overlap. If setup fails,
`capture.setup` is `"disabled"` and `capture.reason` explains why. Setup,
capture, and report errors fail the visual run even when your tests pass.

### `vizzly tdd screenshots`

Read the latest `.vizzly/` report without a running server or cloud credentials:

```bash
vizzly tdd screenshots list
vizzly tdd screenshots list --page 2 --page-size 20 --status failed
vizzly tdd screenshots latest
vizzly tdd screenshots show 1a2b3c4d5e6f7890
vizzly tdd screenshots show 1a2b3c4d5e6f7890 --image diff
vizzly tdd screenshots accept 1a2b3c4d5e6f7890
```

The list follows capture order. Use an ID with `show`, or a name that matches
one comparison. Use IDs when a name has multiple browser or viewport variants.

`latest` prints the newest current screenshot's absolute path; add a name to
filter it. `show` prints details and the current image path. Add `--image diff`,
`--image baseline`, or `--image all` for other image paths.

The JSON list includes page details and each current image's path and
`exists` flag:

```json
{
  "status": "data",
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1,
    "hasPrevious": false,
    "hasNext": false,
    "screenshots": [
      {
        "id": "1a2b3c4d5e6f7890",
        "name": "button-primary",
        "status": "failed",
        "diffPercentage": 4.2,
        "browser": "chromium",
        "viewport": { "width": 1920, "height": 1080 },
        "currentImage": {
          "path": "/project/.vizzly/current/button-primary.png",
          "exists": true
        }
      }
    ]
  }
}
```

`accept` copies the current image to its local baseline, updates metadata, and
marks the report entry as passed. To set every baseline in a run, use
`vizzly tdd run "<command>" --set-baseline --no-open`.

Open the printed image paths to inspect captures or diffs.

### `vizzly tdd start`

```bash
vizzly tdd start --json
```

```json
{
  "status": "data",
  "data": {
    "status": "started",
    "port": 47392,
    "pid": 12345,
    "dashboardUrl": "http://localhost:47392"
  }
}
```

If the project already has a running server, `data.status` is
`"already_running"` with the same fields. When the port differs from the default,
use it with `vizzly tdd status --port <port>` or `vizzly tdd stop --port <port>`.

### `vizzly tdd stop`

```bash
vizzly tdd stop --json
```

```json
{
  "status": "data",
  "data": {
    "status": "stopped",
    "pid": 12345
  }
}
```

`data.status` is `"not_running"` when no server is registered, or `"stale"`
when Vizzly cleans up stale daemon files.

### `vizzly tdd status`

```bash
vizzly tdd status --json
```

```json
{
  "status": "data",
  "data": {
    "running": true,
    "port": 47392,
    "pid": 12345,
    "uptimeMs": 5025000,
    "uptime": "1h 23m 45s",
    "dashboardUrl": "http://localhost:47392"
  }
}
```

When no server is running, `data` is
`{ "running": false, "message": "TDD server not running" }`. After cleaning up
stale daemon files, Vizzly returns `status: "stale"` with `running: false`.

### `vizzly tdd list`

```bash
vizzly tdd list --json
```

```json
{
  "status": "data",
  "data": {
    "servers": [
      {
        "id": "project-server-id",
        "port": 47392,
        "pid": 12345,
        "directory": "/path/to/project",
        "startedAt": "2026-10-26T10:00:00Z",
        "configPath": null,
        "name": null,
        "logFile": null
      }
    ]
  }
}
```

### `vizzly context`

Use `context` for human summaries and saved local `.vizzly/` data. Each result
includes a `source` field. Context examples below show commands rather than a
fixed response shape, since the fields depend on the source and available data.

For new cloud agent workflows, discover the API and its response fields:

```bash
vizzly api schema --json
vizzly api schema sdk.getBuildContext --json
vizzly api schema getComparisonContext --json
```

`--agent` on `context build` and `context comparison` is deprecated. It still
returns the older compact format, with up to 10 evidence records and cursors
for more results. `--full` bypasses compact formatting. Use the schema-driven
API for new cloud workflows and `context --json` for local data.

#### `vizzly context build`

```bash
vizzly context build abc123 --source cloud --json
vizzly context build current --source local --json
```

Read build details, baseline information, and comparisons. The cloud response
comes from the API; the local response comes from the saved workspace report.

#### `vizzly context comparison`

```bash
vizzly context comparison cmp-1 --source cloud --json
vizzly context comparison build-detail-screenshots --source local --json
```

Read one comparison and its available history. Use IDs for cloud comparisons;
local lookup also accepts screenshot names.

#### `vizzly context screenshot`

```bash
vizzly context screenshot Dashboard --source cloud --json
vizzly context screenshot Dashboard --source local --json
```

Read the screenshot's available comparison history.

#### `vizzly context similar`

```bash
vizzly context similar fp-dashboard --source cloud --project storybook --org acme --json
```

Find cloud comparisons with a similar diff fingerprint. An abbreviated payload
inside `data` looks like this:

```json
{
  "resource": "fingerprint_context",
  "source": "cloud",
  "fingerprint_hash": "fp-dashboard",
  "comparisons": [
    {
      "id": "cmp-1",
      "build_id": "abc123",
      "screenshot": { "name": "Dashboard" }
    }
  ]
}
```

`context similar --source local` isn't supported and returns an error.

#### `vizzly context review-queue`

```bash
vizzly context review-queue --source cloud --project storybook --org acme --json
vizzly context review-queue --source local --json
```

Read the comparisons waiting for review in the selected source. These context
commands don't make review decisions.

### `vizzly builds`

List builds with optional filtering:

```bash
vizzly builds --json
vizzly builds --branch main --status completed --limit 10 --json
```

```json
{
  "status": "data",
  "data": {
    "builds": [
      {
        "id": "abc123-def456",
        "name": "Build #123",
        "status": "completed",
        "branch": "main",
        "commit": "abc1234",
        "commitMessage": "Add feature",
        "environment": "test",
        "screenshotCount": 15,
        "comparisons": {
          "total": 15,
          "new": 2,
          "changed": 1,
          "identical": 12
        },
        "visual_review": { "state": "approved" },
        "createdAt": "2025-01-15T10:30:00Z",
        "completedAt": "2025-01-15T10:32:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

Get a specific build:

```bash
vizzly builds --build <id> --json
vizzly builds --build <id> --comparisons --json  # Include comparison details
```

### `vizzly comparisons`

Query comparisons for a build:

```bash
vizzly comparisons --build <id> --json
vizzly comparisons --build <id> --status changed --json
```

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "buildName": "Build #123",
    "comparisons": [
      {
        "id": "comp-uuid",
        "name": "button-primary",
        "status": "completed",
        "result": "changed",
        "diffPercentage": 0.042,
        "visual_review": { "state": "pending" },
        "viewport": { "width": 1920, "height": 1080 },
        "browser": "chromium",
        "urls": {
          "baseline": "https://...",
          "current": "https://...",
          "diff": "https://..."
        },
        "honeydiff": {
          "fingerprintHash": "00000000001ec127",
          "regionCount": 12,
          "details": {
            "clusters": { "count": 12, "average_density": 0.81 }
          }
        }
      }
    ],
    "summary": {
      "total": 1,
      "passed": 0,
      "failed": 1,
      "new": 0
    }
  }
}
```

`status` tells you about processing. Use `result` for what changed (`identical`,
`changed`, or `new`) and `visual_review.state` for the review decision.

Search by name across builds:

```bash
vizzly comparisons --name "button-*" --json
vizzly comparisons --name "button-*" --branch main --json
```

Get a specific comparison:

```bash
vizzly comparisons --id <comparison-id> --json
```

### `vizzly config`

```bash
vizzly config --json
```

```json
{
  "status": "data",
  "data": {
    "configFile": "/path/to/vizzly.config.js",
    "config": {
      "server": { "port": 47392, "timeout": 30000 },
      "build": {},
      "upload": {},
      "comparison": { "threshold": 2.0, "minClusterSize": 2 },
      "tdd": { "openReport": false },
      "api": {
        "url": "https://app.vizzly.dev",
        "tokenConfigured": true,
        "tokenPrefix": "vzt_abc1..."
      },
      "linkedProject": {
        "organization": "my-org",
        "project": "my-project",
        "tokenPrefix": "vzt_abc",
        "storage": "keychain",
        "expiresAt": null
      }
    }
  }
}
```

Get a specific config value:

```bash
vizzly config comparison.threshold --json
```

```json
{
  "status": "data",
  "data": {
    "key": "comparison.threshold",
    "value": 2.0
  }
}
```

### `vizzly baselines`

List local TDD baselines:

```bash
vizzly baselines --json
```

```json
{
  "status": "data",
  "data": {
    "baselines": [
      {
        "name": "button-primary",
        "signature": "button-primary|1920|chromium",
        "filename": "button-primary_abc123.png",
        "path": "/path/to/.vizzly/baselines/button-primary_abc123.png",
        "sha256": "abc123...",
        "viewport": { "width": 1920, "height": 1080 },
        "browser": "chromium",
        "createdAt": "2025-01-15T10:00:00Z",
        "fileSize": 45678
      }
    ],
    "count": 1,
    "metadata": {
      "buildId": "local-baseline",
      "buildName": "Local TDD Baseline",
      "branch": "local",
      "threshold": 2.0,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  }
}
```

Get info for a specific baseline:

```bash
vizzly baselines --info "button-primary" --json
```

### `vizzly api`

Call the API directly:

```bash
# GET request
vizzly api /sdk/builds --json

# Add query parameters
vizzly api /sdk/builds -q limit=10 -q branch=main --json
```

```json
{
  "status": "data",
  "data": {
    "endpoint": "/api/sdk/builds",
    "method": "GET",
    "response": {}
  }
}
```

### `vizzly upload`

```bash
vizzly upload ./screenshots --json
```

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "url": "https://app.vizzly.dev/...",
    "stats": {
      "total": 20,
      "uploaded": 15,
      "skipped": 5,
      "bytes": 0
    },
    "git": {
      "branch": "main",
      "commit": "abc1234",
      "message": "Add feature"
    },
    "executionTimeMs": 6241
  }
}
```

`stats.skipped` counts images Vizzly already has, matched by SHA. Use
`--upload-all` to upload every image again.

`stats.bytes` currently falls back to `0`; it isn't a transferred-byte total.
JSON upload mode returns this summary without waiting, even with `--wait`.
Use `vizzly status <build-id> --json` to check processing and comparisons.

### `vizzly preview`

```bash
vizzly preview ./dist --build <build-id> --json
```

Use an existing cloud build ID, or omit `--build` when a saved build session
is available. Private projects also require `--public-link` to acknowledge that
anyone with the preview link can open it.

```json
{
  "status": "data",
  "data": {
    "success": true,
    "buildId": "abc123-def456",
    "previewUrl": "https://preview.vizzly.dev/abc123",
    "files": 150,
    "bytes": 5000000,
    "compressedBytes": 1200000,
    "compressionRatio": "76%",
    "newBytes": 320000,
    "reusedBlobs": 12,
    "deduplicationRatio": 0.42,
    "basePath": null,
    "expiresAt": "2025-03-01T00:00:00Z"
  }
}
```

### `vizzly approve`

```bash
vizzly approve <comparison-id> --json
```

```json
{
  "status": "data",
  "data": {
    "eventId": "event_123",
    "idempotent": false,
    "review": {}
  }
}
```

### `vizzly reject`

```bash
vizzly reject <comparison-id> --reason "Unexpected regression" --json
```

```json
{
  "status": "data",
  "data": {
    "eventId": "event_124",
    "idempotent": false,
    "review": {}
  }
}
```

### `vizzly comment`

```bash
vizzly comment <build-id> "Needs design review" --json
```

```json
{
  "status": "data",
  "data": {
    "created": true,
    "buildId": "build_123",
    "comment": {}
  }
}
```

Sign in with `vizzly login` to approve, reject, or comment. Project tokens
can't perform review actions.

### `vizzly status`

```bash
vizzly status <build-id> --json
```

```json
{
  "status": "data",
  "data": {
    "resource": "build_status",
    "schemaVersion": 1,
    "buildId": "abc123-def456",
    "status": "completed",
    "conclusion": "review_required",
    "name": "Build #123",
    "createdAt": "2025-01-15T10:30:00Z",
    "completedAt": "2025-01-15T10:32:00Z",
    "environment": "test",
    "branch": "main",
    "commit": "abc1234",
    "commitMessage": "Add feature",
    "screenshotsTotal": 15,
    "processing": {
      "total": 15,
      "completed": 15,
      "failed": 0,
      "active": 0,
      "pending": 0
    },
    "comparisonsTotal": 15,
    "comparisons": {
      "total": 15,
      "new": 2,
      "changed": 1,
      "identical": 12
    },
    "newComparisons": 2,
    "changedComparisons": 1,
    "identicalComparisons": 12,
    "visual_review": { "state": "pending" },
    "executionTime": 4500,
    "scope": {
      "organization": { "id": "org-1", "slug": "acme" },
      "project": { "id": "project-1", "slug": "storybook" }
    },
    "links": {
      "web": "https://app.vizzly.dev/acme/storybook/builds/abc123-def456"
    },
    "suggestedCommands": [
      {
        "label": "Discover build context API",
        "command": "vizzly api schema sdk.getBuildContext --json"
      },
      {
        "label": "List comparisons",
        "command": "vizzly --json comparisons --build abc123-def456"
      }
    ],
    "preview": {
      "url": "https://preview.vizzly.dev/...",
      "status": "ready",
      "fileCount": 150,
      "expiresAt": "2025-03-01T00:00:00Z"
    }
  }
}
```

Counts, conclusion, and review state come from the API. A build can finish
processing and still need review. Fields the API doesn't return are left out.

### `vizzly init`

`--json` uses quick setup: create or keep config without questions. It doesn't
install dependencies, run tests, or link a cloud project. Agent files require
`--agent-skill` or `--agent-guidance`. Put project settings in the config.

```bash
vizzly init --json
```

```json
{
  "status": "data",
  "data": {
    "status": "created",
    "configPath": "/path/to/vizzly.config.js",
    "mode": "quick",
    "plugins": [],
    "changes": [
      { "path": "/path/to/vizzly.config.js", "status": "written" }
    ],
    "requirements": [],
    "verification": { "capture": "not_run" },
    "cloud": { "status": "not_requested" },
    "exitCode": 0
  }
}
```

Existing config returns `status: "skipped"` and `reason: "config_exists"`.
`changes` is empty when no files changed. Quick setup doesn't load executable
config or plugins, and it doesn't verify screenshot capture.

To set up project agents too (unchanged fields omitted):

```bash
vizzly init --agent-guidance --json
```

```json
{
  "status": "data",
  "data": {
    "status": "created",
    "configPath": "/path/to/vizzly.config.js",
    "plugins": [],
    "agentSkill": {
      "status": "installed",
      "sourcePath": "/path/to/cli/skills/vizzly",
      "targetPath": "/path/to/project/.agents/skills/vizzly"
    },
    "agentGuidance": {
      "status": "created",
      "agentsPath": "/path/to/project/AGENTS.md"
    }
  }
}
```

If config already exists, init returns `"status": "skipped"` without changing
config or agent files. Edit the config directly to change your setup.

### `vizzly project link`

```bash
vizzly project link my-org/my-project --json
```

```json
{
  "status": "data",
  "data": {
    "linked": true,
    "reused": false,
    "organizationSlug": "my-org",
    "projectSlug": "my-project",
    "tokenPrefix": "vzt_abc",
    "storage": "keychain",
    "binding": {
      "status": "bound",
      "configPath": "/path/to/vizzly.config.js"
    }
  }
}
```

The config stores the project name; credentials stay in user storage. Repeated
linking returns `reused: true` when a saved token is still valid. If the config
needs a manual edit, linking returns `linked: false`, `binding.status: "manual"`,
and instructions. It exits with code `2` without creating a token.

### `vizzly projects`

```bash
vizzly projects --json
```

```json
{
  "status": "data",
  "data": {
    "projects": [
      {
        "id": "project-123",
        "name": "My Project",
        "slug": "my-project",
        "organizationName": "My Org",
        "organizationSlug": "my-org",
        "buildCount": 42,
        "createdAt": "2025-01-15T10:00:00Z",
        "updatedAt": "2025-01-20T10:00:00Z"
      }
    ],
    "pagination": {
      "total": 1,
      "hasMore": false
    }
  }
}
```

Filter by organization:

```bash
vizzly projects --org my-org --json
```

## Scripts

### Check for visual changes in CI

```bash
vizzly run "pnpm test" --wait --json
```

Use the command's exit status to fail CI. You don't need to parse comparison
counts for this.

### Get the latest build ID

```bash
build_id=$(vizzly builds --limit 1 --json | jq -r '.data.builds[0].id')
echo "Latest build: $build_id"
```

### List failed comparisons

```bash
vizzly comparisons --build "$build_id" --status changed --json \
  | jq -r '.data.comparisons[].name'
```

### Check TDD server status

```bash
if vizzly tdd status --json | jq -e '.data.running' > /dev/null; then
  echo "TDD server is running"
else
  echo "TDD server is not running"
fi
```

### Get comparison threshold from config

```bash
threshold=$(vizzly config comparison.threshold --json | jq '.data.value')
echo "Current threshold: $threshold"
```

### Count local baselines

```bash
count=$(vizzly baselines --json | jq '.data.count')
echo "You have $count baselines"
```
