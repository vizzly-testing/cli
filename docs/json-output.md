# JSON Output Reference

Every Vizzly CLI command supports `--json` for machine-readable output. Use it to pipe results to `jq`, integrate with CI/CD tools, or build custom automation.

## Basic Usage

```bash
# Full JSON output
vizzly builds --json

# Select specific fields
vizzly builds --json id,status,branch
```

When you pass `--json`, all human-friendly output goes to stderr, and structured data goes to stdout. This means you can safely pipe the output without worrying about spinner text or progress messages.

## Field Selection

Select specific fields using comma-separated names:

```bash
# Top-level fields
vizzly status <id> --json buildId,status,branch

# Preview fields with dot notation
vizzly status <id> --json buildId,status,preview.url
```

Field selection works on the command payload before it is wrapped in the
standard `{ status, data }` envelope. If a field doesn't exist, it's omitted
from the output.

## Output Format

Successful command payloads are wrapped in this structure:

```json
{
  "status": "data",
  "data": { /* command-specific payload */ }
}
```

Errors emitted through `output.error(...)` look like this:

```json
{
  "status": "error",
  "message": "Something went wrong",
  "error": { "name": "ErrorType", "message": "Details", "code": "ERROR_CODE" }
}
```

Some commands return a `data` envelope with their own payload `status`
(`completed`, `failed`, or `skipped`) instead of using the error envelope.

## Command Reference

The shorter command examples below show the full `--json` envelope. Very large
context examples show the command-specific payload that appears inside `data`.

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
    "contextCommand": "vizzly context build abc123-def456 --agent",
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

With `--wait`, includes comparison results:

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
    "approvalStatus": "pending",
    "contextCommand": "vizzly context build abc123-def456 --agent",
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
    "contextCommand": "vizzly context build current --source local --agent"
  }
}
```

`tdd run` keeps structured output on stdout. The wrapped test command can still
print normally; Vizzly forwards that child output to stderr in JSON mode so
`stdout` stays safe to parse.

When screenshots are captured, Vizzly also writes local review artifacts under
`.vizzly/`, including `.vizzly/report-data.json` and
`.vizzly/report/index.html`. Use `contextCommand` when you want a stable
follow-up command for local review data.

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

If this project already has a live TDD server, the command returns
`status: "already_running"` with the same `port`, `pid`, and `dashboardUrl`
fields. Use that `port` with `vizzly tdd status --port <port>` or
`vizzly tdd stop --port <port>` when Vizzly auto-assigned a non-default port.

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

`stop` also returns parseable non-happy-path states. If no server is registered
for the current project or port, `data.status` is `"not_running"`. If Vizzly
finds stale daemon files and cleans them up, `data.status` is `"stale"`.

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

When no server is running, `status` still uses the data envelope and returns
`{ "running": false, "message": "TDD server not running" }`. Stale daemon files
are reported as `status: "stale"` with `running: false` after cleanup.

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

Use `vizzly context` when you want one machine-friendly bundle instead of several narrow calls.
This is the best fit for automation, agents, and scripts that need approved baselines, visual
evidence, review state, comments, preview links, and diff metadata in one place.

Every context payload includes a `source` field. That tells you whether the bundle came from
cloud data or your local `.vizzly` workspace.

#### `vizzly context build`

```bash
vizzly context build abc123 --json
vizzly context build abc123 --agent --json
vizzly context build abc123 --agent --json --include diffs,comments
vizzly context build abc123 --agent --json --full
vizzly context build current --source local --json
vizzly context build current --source local --agent
```

Use `--json` for durable automation. Use `--agent --json` when you want the compact handoff that
agents should read first. It returns at most 10 actionable evidence records while preserving API
order, with failed captures first and one variant from each screenshot group before additional
variants. Add `--include diffs` for raw Honeydiff diagnostics on those selected records. Explicit
`screenshots` and `comments` includes return those API collections, and `--full` returns the
complete build context payload unchanged.

Compact agent JSON:

```json
{
  "resource": "build_agent_context",
  "source": "cloud",
  "project": {
    "organization": "acme",
    "slug": "storybook",
    "name": "Storybook"
  },
  "build": {
    "id": "abc123",
    "status": "completed",
    "approval_status": "pending"
  },
  "baseline": {
    "selected": {
      "id": "baseline-build",
      "name": "Approved Main",
      "approval_status": "approved"
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
  "evidence_limit": 10,
  "evidence_returned": 1,
  "evidence_truncated": false,
  "evidence": [
    {
      "kind": "comparison",
      "id": "cmp-1",
      "name": "Dashboard",
      "result": "changed",
      "review_state": "pending",
      "needs_review": true,
      "group": {
        "name": "Dashboard",
        "variant_count": 2,
        "needs_review_count": 1,
        "failed_count": 0,
        "max_diff_percentage": 0.42
      },
      "screenshot": {
        "id": "current-1",
        "browser": "chrome",
        "viewport": { "width": 1440, "height": 900 },
        "bitmap": { "width": 2880, "height": 1800 },
        "signature": "Dashboard|1440|chrome",
        "url": "https://.../current.png"
      },
      "baseline": {
        "id": "baseline-1",
        "build_id": "baseline-build",
        "url": "https://.../baseline.png"
      },
      "diff": {
        "percentage": 0.42,
        "fingerprint_hash": "00000000001ec127",
        "region_count": 12,
        "projection": {
          "clusters": { "count": 12 }
        },
        "image_url": "https://..."
      }
    }
  ],
  "suggested_commands": [
    {
      "label": "Inspect comparison context",
      "command": "vizzly --json context comparison cmp-1"
    },
    {
      "label": "Inspect screenshot history",
      "command": "vizzly --json context screenshot Dashboard"
    },
    {
      "label": "Load raw diff diagnostics",
      "command": "vizzly --json context build abc123 --agent --include diffs"
    }
  ]
}
```

`status`, `summary`, review state, asset URLs, and Honeydiff values come from the API. The compact
client does not estimate processing progress or rebuild server aggregates. Its local work is
limited to normalization, bounded evidence selection, truncation facts, and executable
`suggested_commands`. When `evidence_truncated` is `true`, the suggestions also include a `--full`
command.

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
    "approval_status": "pending"
  },
  "baseline": {
    "selected": {
      "id": "baseline-build",
      "name": "Approved Main",
      "approval_status": "approved"
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
vizzly context comparison cmp-1 --json
vizzly context comparison build-detail-screenshots --source local --json
```

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
      "diff_regions": [],
      "confirmed_regions": []
    }
  },
  "history": {
    "similar_by_fingerprint": [],
    "recent_by_name": [],
    "hotspot_analysis": {
      "confidence": "no_data"
    }
  }
}
```

#### `vizzly context screenshot`

```bash
vizzly context screenshot Dashboard --json
vizzly context screenshot Dashboard --source local --json
```

```json
{
  "resource": "screenshot_context",
  "source": "cloud",
  "screenshot": {
    "name": "Dashboard"
  },
  "confirmed_regions": [
    {
      "label": "Known header copy band"
    }
  ],
  "history": {
    "recent_comparisons": []
  }
}
```

#### `vizzly context similar`

```bash
vizzly context similar fp-dashboard --project storybook --org acme --json
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

Local workspace similarity is not supported yet. If you point `context similar` at `--source local`,
the CLI returns a clear error instead of pretending the data exists.

#### `vizzly context review-queue`

```bash
vizzly context review-queue --project storybook --org acme --json
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
        "approvalStatus": "approved",
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
        "approvalStatus": "pending",
        "reviewState": "pending",
        "visualReview": { "state": "pending" },
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
          "projection": {
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

`status` preserves the processing value returned by the API. Use `result` for
the visual outcome (`identical`, `changed`, or `new`) and `reviewState` for the
current review decision. Older responses that only provide `status` and
`approvalStatus` keep working with the same fields.

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

Raw API access for advanced use cases:

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

`stats.skipped` counts screenshots that Vizzly resolved by SHA without sending
image bytes. Use `--upload-all` when you need every screenshot uploaded
regardless of existing storage.

With `--wait`, the payload includes comparison results after Vizzly finishes
processing the build:

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
    "approvalStatus": "pending",
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
    "approved": true,
    "comparisonId": "comp_123",
    "comparison": { /* updated comparison */ }
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
    "rejected": true,
    "comparisonId": "comp_123",
    "reason": "Unexpected regression",
    "comparison": { /* updated comparison */ }
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

Review actions require a user login. Project tokens are intentionally not enough
to approve, reject, or comment.

### `vizzly status`

```bash
vizzly status <build-id> --json
```

```json
{
  "status": "data",
  "data": {
    "buildId": "abc123-def456",
    "status": "completed",
    "name": "Build #123",
    "createdAt": "2025-01-15T10:30:00Z",
    "completedAt": "2025-01-15T10:32:00Z",
    "environment": "test",
    "branch": "main",
    "commit": "abc1234",
    "commitMessage": "Add feature",
    "screenshotsTotal": 15,
    "comparisonsTotal": 15,
    "newComparisons": 2,
    "changedComparisons": 1,
    "identicalComparisons": 12,
    "approvalStatus": "pending",
    "executionTime": 4500,
    "preview": {
      "url": "https://preview.vizzly.dev/...",
      "status": "ready",
      "fileCount": 150,
      "expiresAt": "2025-03-01T00:00:00Z"
    }
  }
}
```

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

With project agent setup:

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

## Scripting Examples

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
