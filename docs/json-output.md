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

# Nested fields with dot notation
vizzly status <id> --json buildId,comparisons.total,comparisons.changed
```

Field selection works on all commands. If a field doesn't exist, it's omitted from the output.

## Output Format

All JSON output follows this structure:

```json
{
  "status": "data",
  "data": { /* command-specific payload */ }
}
```

Errors look like this:

```json
{
  "status": "error",
  "message": "Something went wrong",
  "error": { "name": "ErrorType", "message": "Details", "code": "ERROR_CODE" }
}
```

## Command Reference

### `vizzly run`

```bash
vizzly run "npm test" --json
```

```json
{
  "buildId": "abc123-def456",
  "status": "completed",
  "url": "https://app.vizzly.dev/org/project/builds/abc123",
  "screenshotsCaptured": 15,
  "executionTimeMs": 4500,
  "git": {
    "branch": "main",
    "commit": "abc1234",
    "message": "Add new feature"
  },
  "exitCode": 0
}
```

With `--wait`, includes comparison results:

```json
{
  "buildId": "abc123-def456",
  "status": "completed",
  "comparisons": {
    "total": 15,
    "new": 2,
    "changed": 1,
    "identical": 12
  },
  "approvalStatus": "pending",
  "exitCode": 1
}
```

### `vizzly tdd run`

```bash
vizzly tdd run "npm test" --json
```

```json
{
  "status": "completed",
  "exitCode": 0,
  "comparisons": [
    {
      "name": "button-primary",
      "status": "failed",
      "signature": "button-primary|1920|chromium",
      "diffPercentage": 4.2,
      "threshold": 2.0,
      "paths": {
        "baseline": ".vizzly/baselines/button-primary_abc123.png",
        "current": ".vizzly/current/button-primary_abc123.png",
        "diff": ".vizzly/diffs/button-primary_abc123.png"
      },
      "viewport": { "width": 1920, "height": 1080 },
      "browser": "chromium"
    }
  ],
  "summary": {
    "total": 10,
    "passed": 8,
    "failed": 1,
    "new": 1
  },
  "reportPath": ".vizzly/report/index.html"
}
```

### `vizzly tdd start`

```bash
vizzly tdd start --json
```

```json
{
  "status": "started",
  "port": 47392,
  "pid": 12345,
  "dashboardUrl": "http://localhost:47392"
}
```

### `vizzly tdd stop`

```bash
vizzly tdd stop --json
```

```json
{
  "status": "stopped",
  "pid": 12345
}
```

### `vizzly tdd status`

```bash
vizzly tdd status --json
```

```json
{
  "running": true,
  "port": 47392,
  "pid": 12345,
  "uptimeMs": 5025000,
  "uptime": "1h 23m 45s",
  "dashboardUrl": "http://localhost:47392"
}
```

### `vizzly tdd list`

```bash
vizzly tdd list --json
```

```json
{
  "servers": [
    {
      "directory": "/path/to/project",
      "port": 47392,
      "pid": 12345,
      "isCurrent": true
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
  "buildId": "abc123-def456",
  "buildName": "Build #123",
  "comparisons": [
    {
      "id": "comp-uuid",
      "name": "button-primary",
      "status": "changed",
      "diffPercentage": 0.042,
      "approvalStatus": "pending",
      "viewport": { "width": 1920, "height": 1080 },
      "browser": "chromium",
      "urls": {
        "baseline": "https://...",
        "current": "https://...",
        "diff": "https://..."
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
```

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
  "configFile": "/path/to/vizzly.config.js",
  "config": {
    "server": { "port": 47392, "timeout": 30000 },
    "comparison": { "threshold": 2.0, "minClusterSize": 2 },
    "tdd": { "openReport": false },
    "api": {
      "url": "https://app.vizzly.dev",
      "tokenConfigured": true,
      "tokenPrefix": "vzt_abc1..."
    }
  },
  "project": {
    "name": "My Project",
    "slug": "my-project",
    "organization": "my-org"
  }
}
```

Get a specific config value:

```bash
vizzly config comparison.threshold --json
```

```json
{
  "key": "comparison.threshold",
  "value": 2.0
}
```

### `vizzly baselines`

List local TDD baselines:

```bash
vizzly baselines --json
```

```json
{
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
  "endpoint": "/api/sdk/builds",
  "method": "GET",
  "response": { /* raw API response */ }
}
```

### `vizzly upload`

```bash
vizzly upload ./screenshots --json
```

```json
{
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
    "commit": "abc1234"
  }
}
```

### `vizzly preview`

```bash
vizzly preview ./dist --json
```

```json
{
  "success": true,
  "buildId": "abc123-def456",
  "previewUrl": "https://preview.vizzly.dev/abc123",
  "files": 150,
  "bytes": 5000000,
  "compressedBytes": 1200000,
  "compressionRatio": "76%",
  "expiresAt": "2025-03-01T00:00:00Z"
}
```

### `vizzly status`

```bash
vizzly status <build-id> --json
```

```json
{
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
```

### `vizzly init`

```bash
vizzly init --json
```

```json
{
  "status": "created",
  "configPath": "/path/to/vizzly.config.js"
}
```

### `vizzly project:select`

```bash
vizzly project:select --json
```

Note: In JSON mode, the interactive prompts still appear because project selection requires user input.

```json
{
  "status": "configured",
  "project": {
    "name": "My Project",
    "slug": "my-project"
  },
  "organization": {
    "name": "My Org",
    "slug": "my-org"
  },
  "directory": "/path/to/project",
  "tokenCreated": true
}
```

### `vizzly project:list`

```bash
vizzly project:list --json
```

```json
{
  "projects": [
    {
      "directory": "/path/to/project",
      "isCurrent": true,
      "project": {
        "name": "My Project",
        "slug": "my-project"
      },
      "organization": "my-org",
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "current": {
    "directory": "/path/to/project",
    "isCurrent": true,
    "project": { "name": "My Project", "slug": "my-project" },
    "organization": "my-org",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

### `vizzly project:token`

```bash
vizzly project:token --json
```

```json
{
  "token": "vzt_abc123...",
  "directory": "/path/to/project",
  "project": {
    "name": "My Project",
    "slug": "my-project"
  },
  "organization": "my-org",
  "createdAt": "2025-01-15T10:00:00Z"
}
```

### `vizzly project:remove`

```bash
vizzly project:remove --json
```

In JSON mode, skips confirmation and removes immediately:

```json
{
  "removed": true,
  "directory": "/path/to/project",
  "project": {
    "name": "My Project",
    "slug": "my-project"
  },
  "organization": "my-org"
}
```

## Scripting Examples

### Check for visual changes in CI

```bash
result=$(vizzly run "npm test" --wait --json)
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
