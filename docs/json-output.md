# JSON output

Use `--json` to read command results in scripts or pipe them to `jq`.

## Get started

```bash
# Full JSON output
vizzly builds --json

# Select specific fields
vizzly builds --json id,status,branch
```

JSON goes to stdout. Progress messages and other text go to stderr, so they
won't break your parser.

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
  "data": { /* command-specific payload */ }
}
```

Errors reported by `output.error(...)` look like this:

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

Most examples show the full JSON response. The larger context examples show
only what goes inside `data`.

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
    "status": "failed",
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
          "baseline": ".vizzly/baselines/button-primary.png",
          "current": ".vizzly/current/button-primary.png",
          "diff": ".vizzly/diff/button-primary.png"
        },
        "viewport": { "width": 1920, "height": 1080 },
        "browser": "chromium"
      }
    ],
    "summary": {
      "total": 1,
      "passed": 0,
      "failed": 1,
      "new": 0
    },
    "reportPath": ".vizzly/report/index.html",
    "contextCommand": "vizzly context build current --source local --json"
  }
}
```

Test output goes to stderr in JSON mode. Captured screenshots also produce
`.vizzly/report-data.json` and `.vizzly/report/index.html`. Run the returned
`contextCommand` to inspect that local data.

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
        "directory": "/path/to/project",
        "port": 47392,
        "pid": 12345,
        "isCurrent": true
      }
    ]
  }
}
```

### `vizzly context`

Use `context` for human summaries and local `.vizzly/` data. The `source` field
identifies where the data came from.

`--agent` on `context build` and `context comparison` is deprecated. The compact
examples below show that older format. For new cloud agent workflows,
start with `vizzly api schema --json`; use `context --json` for local data.

#### `vizzly context build`

```bash
vizzly context build abc123 --source cloud --json
vizzly context build abc123 --source cloud --agent --json
vizzly context build abc123 --source cloud --agent --json --include diffs
vizzly context build abc123 --source cloud --agent --json --full
vizzly context build current --source local --json
vizzly context build current --source local --agent
```

The deprecated `--agent --json` format returns up to 10 records and a cursor
for the next page. Use `--full` for the complete build context.

Legacy compact build JSON:

```json
{
  "resource": "build_agent_context",
  "source": "cloud",
  "scope": {
    "organization": { "slug": "acme" },
    "project": { "slug": "storybook", "name": "Storybook" }
  },
  "build": {
    "id": "abc123",
    "status": "completed",
    "review_state": "pending"
  },
  "baseline": {
    "selected": {
      "id": "baseline-build",
      "name": "Approved Main",
      "review_state": "approved"
    },
    "selection_reason": "latest approved build"
  },
  "status": {
    "needs_review": true,
    "reasons": ["comparisons_need_review"],
    "pending_comparisons": 3,
    "unresolved_comments": 0
  },
  "summary": {
    "comparisons": {
      "total": 12,
      "changed": 2,
      "new": 1
    }
  },
  "evidence": {
    "items": [
      {
        "type": "comparison",
        "id": "cmp-1",
        "screenshot_name": "Dashboard",
        "result": "changed",
        "review_state": "pending",
        "needs_review": true,
        "screenshot": {
          "id": "current-1",
          "browser": "chrome",
          "viewport": { "width": 1440, "height": 900 },
          "bitmap": { "width": 2880, "height": 1800 },
          "signature": "Dashboard|1440|chrome",
          "url": "https://.../current.png",
          "baseline": {
            "id": "baseline-1",
            "build_id": "baseline-build",
            "url": "https://.../baseline.png"
          }
        },
        "diff": {
          "percentage": 0.42,
          "fingerprint_hash": "00000000001ec127",
          "region_count": 12,
          "image_url": "https://..."
        }
      }
    ],
    "page": {
      "limit": 10,
      "returned": 1,
      "total": 12,
      "has_more": true,
      "next_cursor": "opaque-cursor-returned-by-api"
    }
  },
  "suggested_commands": [
    {
      "label": "Inspect comparison context",
      "command": "vizzly --json context comparison cmp-1 --agent --source cloud"
    },
    {
      "label": "Inspect screenshot history",
      "command": "vizzly --json context screenshot Dashboard --source cloud"
    },
    {
      "label": "Load raw diff diagnostics",
      "command": "vizzly --json context build abc123 --agent --include diffs --source cloud"
    },
    {
      "label": "Load next evidence page",
      "command": "vizzly --json context build abc123 --agent --cursor opaque-cursor-returned-by-api --source cloud"
    }
  ]
}
```

Results keep the API's values and order. `suggested_commands` gives you
follow-up commands with the same source and the next page's cursor, if needed.
Use `--full` for the raw result.

Full build context JSON:

```json
{
  "resource": "build_context",
  "source": "cloud",
  "scope": {
    "organization": { "slug": "acme" },
    "project": { "slug": "storybook" }
  },
  "build": {
    "id": "abc123",
    "status": "completed",
    "review_state": "pending"
  },
  "baseline": {
    "selected": {
      "id": "baseline-build",
      "name": "Approved Main",
      "review_state": "approved"
    },
    "selection_reason": "common_ancestor",
    "comparison_baseline_build_ids": ["baseline-build"]
  },
  "status": {
    "needs_review": true,
    "reasons": ["comparisons_need_review"],
    "pending_comparisons": 3,
    "unresolved_comments": 0
  },
  "summary": {
    "comparisons": {
      "total": 12,
      "changed": 2,
      "new": 1
    },
    "review": {
      "pending": 3,
      "approved": 9,
      "rejected": 0
    }
  },
  "screenshots": [
    {
      "name": "Dashboard",
      "url": "https://...",
      "baseline": { "url": "https://..." }
    }
  ],
  "comparisons": [
    {
      "id": "cmp-1",
      "screenshot_name": "Dashboard",
      "result": "changed",
      "needs_review": true,
      "diff": {
        "percentage": 0.42,
        "image_url": "https://...",
        "regions": []
      }
    }
  ],
  "comments": {
    "build": [],
    "screenshot_count": 0
  }
}
```

#### `vizzly context comparison`

```bash
vizzly context comparison cmp-1 --source cloud --json
vizzly context comparison cmp-1 --source cloud --agent --json
vizzly context comparison cmp-1 --source cloud --agent --json --include diffs
vizzly context comparison build-detail-screenshots --source local --json
```

Raw JSON keeps the source response as it is. The deprecated `--agent` format
also keeps the API's comparison and `analysis` fields, with separate pages for
fingerprint matches and recent comparisons with the same name.

Legacy compact comparison JSON:

```json
{
  "resource": "comparison_agent_context",
  "source": "cloud",
  "comparison": {
    "id": "cmp-1",
    "screenshot_name": "Dashboard",
    "result": "changed",
    "review_state": "pending",
    "screenshot": {
      "url": "https://.../current.png"
    },
    "baseline": {
      "url": "https://.../baseline.png"
    },
    "analysis": {
      "diff_image_url": "https://.../diff.png",
      "fingerprint_hash": "00000000001ec127",
      "diff_regions": [],
      "cluster_metadata": {
        "classification": "dynamic_content"
      }
    }
  },
  "history": {
    "active_stream": null,
    "similar_by_fingerprint": {
      "items": [],
      "page": {
        "limit": 10,
        "returned": 0,
        "total": 0,
        "has_more": false,
        "next_cursor": null
      }
    },
    "recent_by_name": {
      "items": [],
      "page": {
        "limit": 10,
        "returned": 0,
        "total": 0,
        "has_more": false,
        "next_cursor": null
      }
    }
  }
}
```

Raw comparison JSON remains available without `--agent`:

```json
{
  "resource": "comparison_context",
  "source": "local_workspace",
  "comparison": {
    "id": "cmp-1",
    "name": "Dashboard",
    "result": "changed",
    "analysis": {
      "diff_image_url": ".vizzly/diffs/dashboard.png",
      "diff_regions": []
    }
  },
  "history": {
    "similar_by_fingerprint": [],
    "recent_by_name": []
  }
}
```

#### `vizzly context screenshot`

```bash
vizzly context screenshot Dashboard --source cloud --json
vizzly context screenshot Dashboard --source local --json
```

```json
{
  "resource": "screenshot_context",
  "source": "cloud",
  "screenshot": {
    "name": "Dashboard"
  },
  "history": {
    "recent_comparisons": []
  }
}
```

#### `vizzly context similar`

```bash
vizzly context similar fp-dashboard --source cloud --project storybook --org acme --json
```

```json
{
  "resource": "fingerprint_context",
  "source": "cloud",
  "fingerprint": {
    "hash": "fp-dashboard"
  },
  "matches": [
    {
      "comparison_id": "cmp-1",
      "build_id": "abc123",
      "screenshot_name": "Dashboard"
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

```json
{
  "resource": "review_queue_context",
  "source": "local_workspace",
  "summary": {
    "total": 2,
    "changed": 1,
    "new": 1
  },
  "comparisons": [
    {
      "id": "cmp-1",
      "name": "Settings Panel",
      "result": "changed"
    }
  ]
}
```

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
      "total": 15,
      "passed": 12,
      "failed": 2,
      "new": 1
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
    "count": 45,
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
    "response": { /* raw API response */ }
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
      "bytes": 2500000
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

Add `--wait` to include comparison results when the build finishes processing:

```bash
vizzly upload ./screenshots --wait --json
```

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "status": "failed",
    "url": "https://app.vizzly.dev/...",
    "stats": {
      "total": 20,
      "uploaded": 15,
      "skipped": 5,
      "bytes": 2500000
    },
    "git": {
      "branch": "main",
      "commit": "abc1234",
      "message": "Add feature"
    },
    "comparisons": {
      "total": 15,
      "passed": 12,
      "failed": 2,
      "new": 1
    },
    "visual_review": { "state": "pending" },
    "executionTimeMs": 9876
  }
}
```

### `vizzly preview`

```bash
vizzly preview ./dist --json
```

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
    "review": { /* visual review */ }
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
    "review": { /* visual review */ }
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
    "comment": { /* created comment */ }
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

```bash
vizzly init --json
```

```json
{
  "status": "data",
  "data": {
    "status": "created",
    "configPath": "/path/to/vizzly.config.js"
  }
}
```

To set up project agents too:

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

Run it again after upgrading to refresh the skill and managed `AGENTS.md`
block. Updated items report `"status": "refreshed"`; your config and other
guidance stay as they are.

### `vizzly project link`

```bash
vizzly project link my-org/my-project --json
```

```json
{
  "status": "data",
  "data": {
    "linked": true,
    "organizationSlug": "my-org",
    "projectSlug": "my-project",
    "tokenPrefix": "vzt_abc",
    "storage": "keychain"
  }
}
```

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
result=$(vizzly run "pnpm test" --wait --json)
changed=$(echo "$result" | jq '.data.comparisons.changed')

if [ "$changed" -gt 0 ]; then
  echo "Visual changes detected!"
  exit 1
fi
```

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
