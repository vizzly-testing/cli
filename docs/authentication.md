# Authentication Guide

Vizzly CLI supports flexible authentication to fit different workflows: user authentication for local development and API tokens for CI/CD pipelines.

## Overview

The CLI provides two authentication methods:

1. **User Authentication** - OAuth-based login for individual developers
2. **API Tokens** - Direct token authentication for automation and CI/CD

## User Authentication (Recommended for Local Development)

User authentication uses OAuth 2.0 device flow to securely authenticate with your Vizzly account.

### Login

```bash
vizzly login
```

**What happens:**
1. CLI displays a device code
2. Browser automatically opens to https://app.vizzly.dev/auth/device
3. Device code is pre-filled in the form
4. You authorize the CLI with your Vizzly account
5. Access token is stored securely in `~/.vizzly/config.json`

**Features:**
- 30-day token expiry with automatic refresh
- Secure storage with 0600 file permissions (Unix/Linux/macOS)
- Works across all your projects

**JSON Output:**
```bash
vizzly login --json
```

Returns machine-readable output for scripting:
```json
{
  "success": true,
  "user": {
    "email": "you@example.com",
    "name": "Your Name"
  }
}
```

### Check Authentication Status

```bash
vizzly whoami
```

Shows:
- Current user email and name
- Organizations you belong to
- Token expiry date
- Project mappings (if configured)

**Example output:**
```
Authenticated as you@example.com (Your Name)

Organizations:
  - Acme Inc
  - Personal

Token expires: 2025-11-15

Project mappings:
  /Users/you/projects/acme-app → Acme Inc / Marketing Site
```

**JSON Output:**
```bash
vizzly whoami --json
```

### Logout

```bash
vizzly logout
```

Clears all stored authentication:
- Revokes tokens on the server
- Removes tokens from `~/.vizzly/config.json`
- Clears project mappings

## Project-Specific Tokens

For multi-project workflows, configure directory-specific tokens.

### Select a Project

```bash
cd /path/to/project
vizzly project:select
```

**Interactive prompts:**
1. Choose an organization
2. Choose a project
3. Token is mapped to current directory path

The CLI automatically uses the correct token based on your current directory.

### List Projects

```bash
vizzly project:list
```

Shows all configured project mappings:
```
Project mappings:
  /Users/you/projects/acme-app → Acme Inc / Marketing Site
  /Users/you/projects/startup → Personal / Landing Page
```

### Show Project Token

```bash
vizzly project:token
```

Displays the project token for the current directory (first 10 characters only for security).

**JSON Output:**
```bash
vizzly project:token --json
```

### Remove Project Configuration

```bash
vizzly project:remove
```

Removes the project mapping for the current directory.

## API Token Authentication (Recommended for CI/CD)

For automated environments, use project tokens directly.

### Using Environment Variables

```bash
export VIZZLY_TOKEN=vzt_your_project_token_here
vizzly run "npm test"
```

### Using CLI Flags

```bash
vizzly run "npm test" --token vzt_your_project_token_here
```

### Using .env Files (Local Development)

Create a `.env` file in your project root:

```
VIZZLY_TOKEN=vzt_your_project_token_here
```

**Important:** Add `.env` to your `.gitignore` to prevent committing secrets.

### CI/CD Integration

Use your CI provider's secret management:

**GitHub Actions:**
```yaml
- name: Run visual tests
  run: npx vizzly run "npm test" --wait
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
```

**GitLab CI:**
```yaml
visual-tests:
  script:
    - npx vizzly run "npm test" --wait
  variables:
    VIZZLY_TOKEN: $VIZZLY_TOKEN
```

**CircleCI:**
```yaml
- run:
    name: Visual tests
    command: npx vizzly run "npm test" --wait
    environment:
      VIZZLY_TOKEN: $VIZZLY_TOKEN
```

## Token Resolution Priority

The CLI resolves tokens in this order (highest to lowest):

1. **CLI flag** (`--token`)
2. **Environment variable** (`VIZZLY_TOKEN`)
3. **Project mapping** (from `vizzly project:select`)
4. **User access token** (from `vizzly login`)

This allows flexible authentication across different contexts.

### Examples

**Override with CLI flag:**
```bash
vizzly run "npm test" --token vzt_different_token
```

**Use project mapping:**
```bash
cd /path/to/project
vizzly run "npm test"  # Uses token from project:select
```

**Fallback to user token:**
```bash
vizzly login
cd /new/project
vizzly run "npm test"  # Uses user access token
```

## Token Storage

Tokens are stored in `~/.vizzly/config.json` with the following structure:

```json
{
  "accessToken": "vzt_...",
  "refreshToken": "vzr_...",
  "expiresAt": "2025-11-15T10:30:00Z",
  "user": {
    "id": "usr_...",
    "email": "you@example.com",
    "name": "Your Name"
  },
  "projectMappings": {
    "/Users/you/projects/acme-app": {
      "organizationId": "org_...",
      "organizationName": "Acme Inc",
      "projectId": "prj_...",
      "projectName": "Marketing Site",
      "token": "vzt_..."
    }
  }
}
```

**Security:**
- File created with `0600` permissions (owner read/write only)
- On Windows, permissions are set via ACLs when possible
- Never commit this file to version control

## Token Refresh

Access tokens expire after 30 days. The CLI automatically refreshes tokens:

- **5-minute expiry buffer** - Tokens are refreshed 5 minutes before expiry
- **Automatic refresh on 401** - If a request fails with 401, token is refreshed and retried
- **Refresh tokens** - Long-lived refresh tokens are used to obtain new access tokens

You don't need to manually manage token refresh.

## Troubleshooting

### "Not authenticated" error

**Solution:**
```bash
vizzly login
```

Or set `VIZZLY_TOKEN` environment variable.

### "Token expired" error

**Solution:**
The CLI should auto-refresh. If it doesn't:
```bash
vizzly logout
vizzly login
```

### Permission denied writing config file

**Linux/macOS:**
```bash
chmod 700 ~/.vizzly
chmod 600 ~/.vizzly/config.json
```

**Windows:**
Run CLI as administrator or check file permissions.

### Project token not being used

**Solution:**
Verify project mapping:
```bash
vizzly project:list
```

Check you're in the correct directory. The CLI traverses parent directories to find project mappings.

### Browser doesn't open during login

**Solution:**
1. Copy the device code shown in the terminal
2. Manually visit https://app.vizzly.dev/auth/device
3. Paste the device code
4. Press Enter in the terminal after authorizing

## Security Best Practices

1. **Never commit tokens** - Add `.env` and `~/.vizzly/config.json` to `.gitignore`
2. **Use CI secrets** - Store `VIZZLY_TOKEN` in your CI provider's secret manager
3. **Rotate tokens regularly** - Generate new project tokens periodically
4. **Use project tokens in CI** - Don't use personal access tokens in shared pipelines
5. **Limit token scope** - Use project-specific tokens instead of organization-wide tokens when possible

## Next Steps

- [Getting Started Guide](./getting-started.md)
- [Test Integration Guide](./test-integration.md)
- [API Reference](./api-reference.md)
