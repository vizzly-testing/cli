# Vizzly SDK API Documentation

This document describes the public API endpoints available for Vizzly SDKs and CLI tools.

## Base URL

All SDK endpoints are prefixed with `/api/sdk/`

## Authentication

All SDK endpoints require:

- **API Token**: Passed via `Authorization: Bearer <token>` header
- **User-Agent**: Must contain "Vizzly" in the header value (e.g., `Vizzly-CLI/1.0.0`)

## Build Management

### Create Build

Creates a new build for screenshot uploads and comparisons. Supports both standalone builds and parallel execution for sharded test runs.

**Endpoint:** `POST /api/sdk/builds`

**Request Body:**

```json
{
  "build": {
    "name": "CLI Build 2024-01-15T10:30:00Z",
    "branch": "feature/new-ui",
    "commit_sha": "abc123def456",
    "commit_message": "Add new user dashboard",
    "common_ancestor_sha": "def456ghi789",
    "environment": "test",
    "github_pull_request_number": 123,

    // Parallel execution fields (optional)
    "parallel_id": "workflow-12345-attempt-1"
  }
}
```

**Parallel Execution Field:**

- `parallel_id` (optional): Unique identifier for parallel test execution (e.g., GitHub workflow run ID)

When `parallel_id` is provided:

- **First shard**: Creates a new build with the parallel_id
- **Subsequent shards**: Find and reuse the existing build with the same parallel_id
- **All shards**: Upload screenshots to the same build (leveraging existing build reopening logic)

**Response (201):**

```json
{
  "id": "build-uuid",
  "name": "CLI Build 2024-01-15T10:30:00Z",
  "branch": "feature/new-ui",
  "environment": "test",
  "status": "created",
  "url": "https://app.vizzly.co/org-slug/project-slug/builds/build-uuid",
  "organizationSlug": "my-org",
  "projectSlug": "my-project",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Get Build Details

Retrieves build information with optional related data.

**Endpoint:** `GET /api/sdk/builds/:buildId`

**Query Parameters:**

- `include` (optional): `"screenshots"` or `"comparisons"` to include related data

**Response (200):**

```json
{
  "build": {
    "id": "build-uuid",
    "name": "CLI Build 2024-01-15T10:30:00Z",
    "branch": "feature/new-ui",
    "status": "completed",
    "screenshot_count": 25,
    "comparison_count": 20,
    "created_at": "2024-01-15T10:30:00Z",
    "screenshots": [
      // Only included if include=screenshots
      {
        "id": "screenshot-uuid",
        "name": "homepage-desktop-chrome",
        "build_id": "build-uuid",
        "browser": "chrome",
        "viewport_width": 1920,
        "viewport_height": 1080,
        "url": "https://example.com/page",
        "sha256": "abc123def456...",
        "status": "completed",
        "original_url": "https://storage.example.com/screenshot.png",
        "file_size_bytes": 245760,
        "width": 1920,
        "height": 1080,
        "created_at": "2024-01-15T10:30:00Z"
      }
    ],
    "comparisons": [] // Only included if include=comparisons
  }
}
```

### List Builds

Retrieves a paginated list of builds with optional filtering.

**Endpoint:** `GET /api/sdk/builds`

**Query Parameters:**

- `limit` (optional, default: 20): Maximum number of builds to return
- `offset` (optional, default: 0): Number of builds to skip
- `branch` (optional): Filter by branch name
- `environment` (optional): Filter by environment
- `status` (optional): Filter by build status

**Response (200):**

```json
{
  "builds": [
    {
      "id": "build-uuid",
      "name": "CLI Build 2024-01-15T10:30:00Z",
      "branch": "main",
      "environment": "test",
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Update Build Status

Updates the status of a build (typically called by CLI when test suite completes).

**Endpoint:** `PUT /api/sdk/builds/:buildId/status`

**Request Body:**

```json
{
  "status": "completed",
  "executionTimeMs": 45000
}
```

**Valid Status Values:**

- `"pending"` → Maps to "created" (build ready for screenshots)
- `"running"` → Maps to "processing" (build is processing screenshots)
- `"completed"` → Maps to "completed" (all screenshots processed successfully)
- `"failed"` → Maps to "failed" (build failed or was terminated)

**Important: Parallel Build Behavior**

For builds with a `parallel_id`, the `"completed"` status is **not allowed** via this endpoint. Instead, you'll receive:

**Response for Parallel Build Completion Attempt (200):**

```json
{
  "build_id": "build-uuid",
  "status": "processing",
  "message": "Build with parallel_id cannot be finalized via status endpoint. Use POST /api/sdk/parallel/:parallelId/finalize to complete all parallel shards.",
  "parallel_id": "workflow-12345-attempt-1",
  "awaiting_finalize_all": true
}
```

**Response for Regular Builds (200):**

```json
{
  "message": "Build status updated successfully",
  "build": {
    "id": "build-uuid",
    "status": "completed",
    "execution_time_ms": 45000
  }
}
```

## Screenshot Management

### Upload Screenshot (Real-time)

Uploads a single screenshot to an existing build (used during test execution).

**Endpoint:** `POST /api/sdk/builds/:buildId/screenshots`

**Request Body:**

```json
{
  "name": "homepage-desktop-chrome",
  "image_data": "base64-encoded-image-data",
  "properties": {
    "browser": "chrome",
    "browserVersion": "91.0.4472.124",
    "device": "desktop",
    "viewport": {
      "width": 1920,
      "height": 1080
    },
    "url": "https://example.com/homepage",
    "selector": ".main-content"
  }
}
```

**Response (201):**

```json
{
  "id": "screenshot-uuid",
  "name": "homepage-desktop-chrome",
  "build_id": "build-uuid",
  "status": "pending",
  "sha256": "abc123...",
  "isDuplicate": false,
  "build_screenshot_count": 5,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Check Existing Screenshots (Signature-Based Deduplication)

Checks if screenshots with given SHA256 hashes already exist using intelligent signature-based deduplication. Supports both legacy SHA-only format and new signature-based format.

**Endpoint:** `POST /api/sdk/check-shas`

#### Legacy Format (SHA-only)

**Request Body:**

```json
{
  "buildId": "build-uuid",
  "shas": ["abc123def456...", "def456ghi789..."]
}
```

**Response (200):**

```json
{
  "existing": ["abc123def456..."],
  "missing": ["def456ghi789..."],
  "summary": {
    "total_checked": 2,
    "existing_count": 1,
    "missing_count": 1,
    "screenshots_created": 1,
    "format_used": "legacy-sha-only"
  },
  "screenshots": [
    {
      "id": "screenshot-uuid",
      "name": "auto-generated-name",
      "sha256": "abc123def456...",
      "fromExisting": true,
      "alreadyExisted": false
    }
  ]
}
```

#### New Format (Signature-Based - Recommended)

**Request Body:**

```json
{
  "buildId": "build-uuid",
  "screenshots": [
    {
      "sha256": "abc123def456...",
      "name": "homepage-login-form",
      "browser": "chrome",
      "viewport_width": 1920,
      "viewport_height": 1080,
      "url": "https://example.com/login",
      "selector": ".login-form"
    },
    {
      "sha256": "def456ghi789...",
      "name": "dashboard-mobile",
      "browser": "chrome",
      "viewport_width": 375,
      "viewport_height": 667
    }
  ]
}
```

**Response (200):**

```json
{
  "existing": [],
  "missing": ["abc123def456...", "def456ghi789..."],
  "summary": {
    "total_checked": 2,
    "existing_count": 0,
    "missing_count": 2,
    "screenshots_created": 0,
    "format_used": "signature-based"
  },
  "results": [
    {
      "sha256": "abc123def456...",
      "exists": true,
      "reusable": false,
      "reason": "Different signature (homepage-desktop|1920|chrome vs homepage-login-form|1920|chrome)"
    },
    {
      "sha256": "def456ghi789...",
      "exists": false,
      "reusable": false,
      "reason": "SHA not found"
    }
  ],
  "screenshots": []
}
```

#### Signature-Based Logic

The new format uses screenshot **signature** for intelligent deduplication:

- **Signature**: `name + viewport_width + browser` (excludes height as it's variable)
- **Same SHA + Same Signature**: Screenshot is reusable, returns as "existing"
- **Same SHA + Different Signature**: Screenshot not reusable, returns as "missing" to force new upload
- **Different SHA**: New screenshot, returns as "missing"

This ensures screenshots with new names but identical image data create separate records with correct names.

### Batch Upload Screenshots

Uploads multiple screenshot files and/or references existing screenshots by SHA256.

**Endpoint:** `POST /api/sdk/upload`

**Content-Type:** `multipart/form-data`

**Form Fields:**

- `screenshots` (files): Array of screenshot image files
- `build_id` (optional): ID of existing build to upload to
- `build_name` (optional): Name for new build if creating one
- `branch` (optional): Git branch name
- `commit_sha` (optional): Git commit SHA
- `commit_message` (optional): Git commit message
- `common_ancestor_sha` (optional): Common ancestor commit SHA
- `environment` (optional, default: "test"): Environment name
- `existing_shas` (optional): JSON array of SHA256 hashes for existing screenshots
- `config` (optional): JSON configuration object
- `threshold` (optional): Comparison threshold
- `parallel_id` (optional): Unique identifier for parallel test execution

**Response (201):**

```json
{
  "message": "Screenshots uploaded successfully and queued for processing",
  "build": {
    "id": "build-uuid",
    "name": "CLI Build",
    "status": "processing"
  },
  "screenshots": [],
  "count": 10,
  "processing_time_ms": 1250,
  "efficiency": {
    "total_processed": 10,
    "files_uploaded": 7,
    "existing_shas_requested": 3,
    "existing_reused": 3,
    "existing_skipped": 0
  }
}
```

## Comparison Management

### Get Comparison Details

Retrieves detailed information about a specific comparison, including diff images.

**Endpoint:** `GET /api/sdk/comparisons/:comparisonId`

**Response (200):**

```json
{
  "comparison": {
    "id": "comparison-uuid",
    "build_id": "build-uuid",
    "build_name": "CLI Build",
    "name": "homepage-desktop-chrome",
    "status": "completed",
    "diff_percentage": 2.5,
    "threshold": 0.1,
    "has_diff": true,
    "current_screenshot": {
      "id": "current-screenshot-uuid",
      "url": "https://storage.example.com/current.png"
    },
    "baseline_screenshot": {
      "id": "baseline-screenshot-uuid",
      "url": "https://storage.example.com/baseline.png"
    },
    "diff_image": {
      "url": "https://storage.example.com/diff.png"
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## Token Management

### Get Token Context

Retrieves information about the current API token and associated organization/project.

**Endpoint:** `GET /api/sdk/token/context`

**Response (200):**

```json
{
  "token": {
    "id": "token-uuid",
    "name": "CI/CD Token",
    "prefix": "vzy_"
  },
  "organization": {
    "id": "org-uuid",
    "name": "My Company",
    "slug": "my-company"
  },
  "project": {
    "id": "project-uuid",
    "name": "My App",
    "slug": "my-app"
  }
}
```

## Error Responses

All endpoints may return these common error responses:

### 400 Bad Request

```json
{
  "error": "Validation error message"
}
```

### 400 Bad Request (Missing User-Agent)

```json
{
  "error": "User-Agent header required"
}
```

```json
{
  "error": "Invalid User-Agent for SDK request"
}
```

### 401 Unauthorized

```json
{
  "error": "Invalid or missing API token"
}
```

### 404 Not Found

```json
{
  "error": "Resource not found"
}
```

### 413 Payload Too Large (Storage Quota Exceeded)

```json
{
  "error": "Storage quota exceeded",
  "details": {
    "currentUsage": "2.5GB",
    "limit": "5.0GB",
    "estimatedUpload": "3.0GB",
    "planName": "Pro"
  }
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal server error message"
}
```

## Rate Limits

Currently, there are no enforced rate limits on SDK endpoints, but reasonable usage is expected.

## Usage Examples

### Complete Workflow Example

1. **Create a build:**

   ```bash
   curl -X POST /api/sdk/builds \
     -H "Authorization: Bearer your-api-token" \
     -H "User-Agent: Vizzly-CLI/1.0.0" \
     -H "Content-Type: application/json" \
     -d '{"build": {"name": "Test Build", "branch": "main"}}'
   ```

2. **Upload screenshots:**

   ```bash
   curl -X POST /api/sdk/builds/build-uuid/screenshots \
     -H "Authorization: Bearer your-api-token" \
     -H "User-Agent: Vizzly-CLI/1.0.0" \
     -H "Content-Type: application/json" \
     -d '{"name": "homepage", "image_data": "base64..."}'
   ```

3. **Complete the build:**
   ```bash
   curl -X PUT /api/sdk/builds/build-uuid/status \
     -H "Authorization: Bearer your-api-token" \
     -H "User-Agent: Vizzly-CLI/1.0.0" \
     -H "Content-Type: application/json" \
     -d '{"status": "completed"}'
   ```

## Parallel Build Support

Vizzly supports parallel test execution where multiple test runners (shards) contribute screenshots to a single shared build. This is particularly useful for CI/CD workflows with parallel jobs.

### How Parallel Builds Work

1. **Single Build**: All shards share one build using a common `parallel_id`
2. **First Shard Creates**: The first shard to call the API creates the build
3. **Subsequent Shards Reuse**: Other shards find and reuse the existing build
4. **Automatic Reopening**: Existing build reopening logic handles concurrent uploads
5. **Shard Completion**: Individual shards can update status to `"failed"` but NOT `"completed"`
6. **Manual Finalization**: ONLY the finalize endpoint can complete parallel builds

### New Endpoints for Parallel Builds

#### Finalize Parallel Build

Marks a parallel build as completed after all shards finish.

**Endpoint:** `POST /api/sdk/parallel/:parallelId/finalize`

**Response (200):**

```json
{
  "message": "Parallel build finalized successfully",
  "build": {
    "id": "build-uuid",
    "status": "completed",
    "parallel_id": "workflow-12345-attempt-1"
  }
}
```

### Usage Example (GitHub Actions)

```yaml
jobs:
  e2e-tests:
    strategy:
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - name: Run tests with Vizzly
        run: |
          npx vizzly run "npm test -- --shard=${{ matrix.shard }}" \
            --parallel-id="${{ github.run_id }}-${{ github.run_attempt }}"

  finalize-e2e:
    needs: e2e-tests
    runs-on: ubuntu-latest
    if: always() && needs.e2e-tests.result == 'success'
    steps:
      - name: Finalize parallel build
        run: |
          curl -X POST "https://api.vizzly.co/api/sdk/parallel/${{ github.run_id }}-${{ github.run_attempt }}/finalize" \
            -H "Authorization: Bearer ${{ secrets.VIZZLY_TOKEN }}" \
            -H "User-Agent: GitHub-Actions/1.0"
```

### Best Practices

- Use GitHub workflow run ID + attempt number for `parallel_id` to ensure uniqueness
- Always call the finalize endpoint after all shards complete
- The finalize job should depend on all shard jobs completing successfully

## Implementation Notes

- All image data should be base64 encoded when sent via JSON
- File uploads use standard multipart/form-data encoding
- SHA256 hashes are used for deduplication and efficient uploads
- Build processing happens asynchronously after screenshot upload
- Screenshots are automatically processed for comparisons when uploaded
- Builds can be reopened if new screenshots arrive (useful for parallel test execution)
- Storage quota is checked before accepting uploads
- **Parallel builds**: Multiple shards share a single build using `parallel_id` for efficient parallel testing
- **Build finalization**: Use the finalize endpoint to complete parallel builds after all shards finish
