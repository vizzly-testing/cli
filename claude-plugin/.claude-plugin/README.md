# Vizzly Claude Code Plugin

> Integrate Vizzly visual regression testing seamlessly into your Claude Code workflow

This plugin brings Vizzly's powerful visual testing capabilities directly into Claude Code, helping you debug visual regressions, manage baselines, and integrate visual testing into your development workflow—all with AI assistance.

## Installation

### From GitHub (Recommended)

```bash
# Add the marketplace
/plugin marketplace add vizzly-testing/vizzly-cli

# Install the plugin
/plugin install vizzly@vizzly-marketplace
```

### From Local Source

```bash
# Clone the repository
git clone https://github.com/vizzly-testing/vizzly-cli.git
cd vizzly-cli

# Add the marketplace
/plugin marketplace add ./.claude-plugin

# Install the plugin
/plugin install vizzly@vizzly-marketplace
```

## Features

### ✨ **Agent Skills** (Model-Invoked)

Claude automatically uses these Skills when you mention visual testing:

**🐛 Debug Visual Regression**
- Activated when you mention failing visual tests or screenshot differences
- Automatically analyzes visual changes, identifies root causes
- Compares baseline vs current screenshots
- Suggests whether to accept or fix changes
- Works with both local TDD and cloud modes

**🔍 Check Visual Test Status**
- Activated when you ask about test status or results
- Provides quick summary of passed/failed/new screenshots
- Shows diff percentages and threshold information
- Links to dashboard for detailed review

**Example usage:**
- Just say: *"The homepage screenshot is failing"* → Claude debugs it
- Just ask: *"How are my visual tests?"* → Claude checks status
- No slash commands needed—Claude activates Skills automatically!

### 📋 **Slash Commands** (User-Invoked)

Explicit workflows you trigger manually:

**⚡ Quick Setup**
- `/vizzly:setup` - Initialize Vizzly configuration
- Environment variable guidance
- CI/CD integration help

**💡 Screenshot Suggestions**
- `/vizzly:suggest-screenshots` - Analyze test files for screenshot opportunities
- Framework-specific code examples
- Respect your test structure and patterns

### Skills vs Slash Commands

**Skills** are capabilities Claude uses autonomously based on your request. Just describe what you need naturally, and Claude will use the appropriate Skill.

**Slash Commands** are explicit workflows you invoke manually when you want step-by-step guidance through a process.

## MCP Server Tools

The plugin provides an MCP server with direct access to Vizzly data:

### Local TDD Tools
- `detect_context` - Detect if using local TDD or cloud mode
- `get_tdd_status` - Get current TDD comparison results
- `read_comparison_details` - Detailed info for specific screenshot
- `accept_baseline` - Accept a screenshot as new baseline
- `reject_baseline` - Reject a baseline with reason

### Cloud API Tools
- `list_recent_builds` - List recent builds with filtering
- `get_build_status` - Get build status with commit context
- `get_comparison` - Get comparison details with screenshots
- `approve_comparison` - Approve a comparison with comment
- `reject_comparison` - Reject a comparison with reason
- `create_build_comment` - Add comment to build

## Authentication

The plugin automatically uses your Vizzly authentication with the following priority:

1. **Explicitly provided token** (via tool parameters)
2. **Environment variable** (`VIZZLY_TOKEN`)
3. **Project mapping** (configured via `vizzly project:select`)
4. **User access token** (from `vizzly login`)

### Getting Started

**For local development:**
```bash
vizzly login                # Authenticate with your Vizzly account
vizzly project:select       # Optional: set project-specific token
```

**For CI/CD:**
```bash
export VIZZLY_TOKEN=vzt_your_project_token
```

The plugin will automatically use the appropriate token based on your context.

## Requirements

- Claude Code
- Node.js 20+
- Vizzly CLI (`@vizzly-testing/cli`) installed in your project
- TDD mode running for local features
- Authentication configured (see above) for cloud features

## How It Works

### Agent Skills

The plugin's Skills use Claude Code's `allowed-tools` feature to restrict what actions they can perform:

**Check Visual Test Status Skill:**
- Can use: `get_tdd_status`, `detect_context`
- Purpose: Quickly check test status without modifying anything

**Debug Visual Regression Skill:**
- Can use: `Read`, `WebFetch`, `read_comparison_details`, `accept_baseline`, `approve_comparison`, `reject_comparison`
- Purpose: Analyze failures and suggest/apply fixes

### MCP Server Integration

The plugin bundles an MCP server that provides 15 tools for interacting with Vizzly:

- **Automatic startup** - MCP server starts when plugin is enabled
- **Token resolution** - Automatically finds your authentication token
- **Dual mode** - Works with both local TDD and cloud builds
- **No configuration needed** - Just install and use

## Troubleshooting

### Skills not activating

If Claude isn't using the Skills automatically:

1. Verify plugin is enabled: `/plugin`
2. Check MCP server status: `/mcp` (should show `plugin:vizzly:vizzly`)
3. Try being more explicit: "Check my Vizzly test status"

### MCP server not connecting

If the MCP server shows as "failed" in `/mcp`:

1. Check Node.js version: `node --version` (requires 20+)
2. View logs: `claude --debug`
3. Reinstall plugin: `/plugin uninstall vizzly@vizzly-marketplace` then `/plugin install vizzly@vizzly-marketplace`

### TDD server not found

If Skills report "TDD server not running":

1. Start TDD mode: `vizzly tdd start`
2. Verify server is running: Check for `.vizzly/server.json`
3. Run tests to generate screenshots

## Example Workflows

### Local TDD Development

```bash
# Start TDD server
vizzly tdd start

# Run your tests
npm test

# Ask Claude to check status
# "How are my visual tests?"

# If failures, ask Claude to debug
# "The login page screenshot is failing"
```

### Cloud Build Review

```bash
# After CI/CD runs and creates a build
# "Show me recent Vizzly builds"

# Review specific comparison
# "Analyze comparison cmp_abc123"

# Approve or reject
# Claude will suggest using approve/reject tools
```

## Documentation

- [Vizzly CLI](https://github.com/vizzly-testing/vizzly-cli) - Official CLI documentation
- [Vizzly Platform](https://vizzly.dev) - Web dashboard and cloud features
- [Claude Code](https://claude.com/claude-code) - Claude Code documentation
- [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills) - Learn about Claude Code Skills

## License

MIT © Vizzly Team
