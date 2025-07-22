# Doctor Command

The `doctor` command provides a quick preflight to validate your local setup. It is designed to be fast and non-invasive by default.

## Summary

- Local-only checks by default (no network)
- Optional API connectivity check via `--api`
- Node.js 20+ required

## What It Checks

- Node.js version: must be 20 or newer
- `apiUrl`: must be a valid `http` or `https` URL
- `comparison.threshold`: a number between 0 and 1
- Effective `server.port`: reports the port without binding (default `47392`)

## Usage

```bash
# Local-only checks
vizzly doctor

# Include API connectivity checks (requires VIZZLY_TOKEN)
vizzly doctor --api

# JSON output for CI/tooling
vizzly doctor --json
```

## Environment Variables

- `VIZZLY_API_URL` — Override the API base URL (default: `https://vizzly.dev`)
- `VIZZLY_TOKEN` — API token used only when `--api` is provided

## Exit Codes

- `0` — All requested checks passed
- `1` — One or more checks failed

## Notes

- The `--api` flag performs a minimal, read-only API request to verify connectivity.
- The command does not bind or reserve the configured port; it only reports it.
