# Upload Command Guide

The `vizzly upload` command is the simplest way to get started with Vizzly. It uploads screenshots directly from a directory without requiring test integration.

## Basic Usage

```bash
vizzly upload <path>
```

Upload all screenshots from a directory:

```bash
vizzly upload ./screenshots
vizzly upload ./test-results/screenshots
vizzly upload ./cypress/screenshots
```

## Options

### Build Information

**`--build-name <name>`** - Custom build name
```bash
vizzly upload ./screenshots --build-name "Release v1.2.3"
vizzly upload ./screenshots --build-name "PR-456"
```

**`--environment <env>`** - Environment name (default: "test")
```bash
vizzly upload ./screenshots --environment "staging"
vizzly upload ./screenshots --environment "production"
```

### Git Integration

The CLI automatically detects git information, but you can override:

**`--branch <branch>`** - Git branch override
```bash
vizzly upload ./screenshots --branch "feature/new-ui"
```

**`--commit <sha>`** - Git commit SHA override
```bash
vizzly upload ./screenshots --commit "abc123def456"
```

**`--message <msg>`** - Commit message override
```bash
vizzly upload ./screenshots --message "Fix header layout"
```

### Comparison Settings

**`--threshold <number>`** - Comparison threshold (0-1, default: 0.01)
```bash
vizzly upload ./screenshots --threshold 0.05  # More tolerant
vizzly upload ./screenshots --threshold 0.001 # More strict
```

### Processing

**`--wait`** - Wait for build completion
```bash
vizzly upload ./screenshots --wait
```

This will:
- Upload all screenshots
- Wait for processing to complete
- Show progress and results
- Exit with appropriate status code

**`--metadata <json>`** - Additional metadata as JSON
```bash
vizzly upload ./screenshots --metadata '{"browser": "chrome", "viewport": "1920x1080"}'
```

## Examples

### Basic Upload
```bash
# Simple upload with auto-detected git info
vizzly upload ./screenshots
```

### Release Build
```bash
# Upload with specific build name and wait for results
vizzly upload ./screenshots \
  --build-name "Release v2.1.0" \
  --environment "production" \
  --wait
```

### CI/CD Integration
```bash
# Upload with CI-specific metadata
vizzly upload ./test-results/screenshots \
  --build-name "CI-Build-${BUILD_NUMBER}" \
  --branch "${GIT_BRANCH}" \
  --commit "${GIT_COMMIT}" \
  --message "${GIT_COMMIT_MESSAGE}" \
  --wait
```

### Manual Testing
```bash
# Upload with custom metadata for manual test session
vizzly upload ./manual-screenshots \
  --build-name "Manual Test Session" \
  --metadata '{"tester": "john.doe", "device": "iPhone 13"}' \
  --environment "staging"
```

## File Support

The upload command supports:

- **PNG files** - Primary format for screenshots
- **JPG/JPEG files** - Also supported
- **Recursive directory scanning** - Finds images in subdirectories
- **Automatic filtering** - Ignores non-image files

## Build Processing

When you upload screenshots, Vizzly:

1. **Creates a build** - Groups your screenshots together
2. **Finds baselines** - Matches against previous approved screenshots
3. **Generates comparisons** - Creates visual diffs for changed screenshots
4. **Provides results** - Shows what changed, what's new, what's approved

## Status Codes

The upload command exits with different status codes:

- **0** - Success (all screenshots approved or no changes)
- **1** - Changes detected (requires review)
- **2** - Upload failed or error occurred

This makes it perfect for CI/CD pipelines where you want the build to fail if visual changes are detected.

## Common Workflows

### First Time Setup
```bash
# Upload initial baseline screenshots
vizzly upload ./screenshots --build-name "Initial Baseline"
```

### Regular Development
```bash
# Upload after making changes
vizzly upload ./screenshots --build-name "Feature: New Dashboard"
```

### Release Process
```bash
# Upload release candidate screenshots
vizzly upload ./screenshots \
  --build-name "Release Candidate v2.0" \
  --environment "production" \
  --wait
```

## Troubleshooting

**No screenshots found**
- Check the path exists and contains image files
- Verify file permissions
- Use absolute paths if relative paths aren't working

**Upload failed**
- Verify your API token is set: `echo $VIZZLY_TOKEN`
- Check network connectivity
- Try with `--verbose` for detailed error information

**Slow uploads**
- Large image files take longer to upload
- Network speed affects upload time
- Use `--wait` to see progress information

## Next Steps

- Learn about [Test Integration](./test-integration.md) for automated screenshot capture
- Explore [TDD Mode](./tdd-mode.md) for local development
- Check the [API Reference](./api-reference.md) for programmatic usage