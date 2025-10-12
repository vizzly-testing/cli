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

### 🔍 **TDD Status Checking**
- `/vizzly:tdd-status` - Check current TDD status and comparison results
- See failed/new/passed screenshot counts
- Direct links to diff images and dashboard

### 🐛 **Smart Diff Analysis**
- `/vizzly:debug-diff <screenshot-name>` - Analyze visual regression failures
- AI-powered analysis with contextual suggestions
- Guidance on whether to accept or fix changes

### 💡 **Screenshot Suggestions**
- `/vizzly:suggest-screenshots` - Analyze test files for screenshot opportunities
- Framework-specific code examples
- Respect your test structure and patterns

### ⚡ **Quick Setup**
- `/vizzly:setup` - Initialize Vizzly configuration
- Environment variable guidance
- CI/CD integration help

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

## Requirements

- Claude Code
- Node.js 20+
- Vizzly CLI (`@vizzly-testing/cli`) installed in your project
- TDD mode running for local features
- API token for cloud features (optional)

## Documentation

- [Vizzly CLI](https://github.com/vizzly-testing/vizzly-cli) - Official CLI documentation
- [Vizzly Platform](https://vizzly.dev) - Web dashboard and cloud features
- [Claude Code](https://claude.com/claude-code) - Claude Code documentation

## License

MIT © Vizzly Team
