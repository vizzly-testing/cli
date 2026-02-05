# Vizzly Plugin for Claude Code

Visual regression testing with Vizzly - debug failures, check test status, and learn visual testing best practices.

## Installation

```bash
# Add the marketplace
/plugin marketplace add vizzly-testing/cli

# Install the plugin
/plugin install vizzly@vizzly-marketplace
```

Or via CLI:

```bash
claude plugin marketplace add vizzly-testing/cli
claude plugin install vizzly@vizzly-marketplace
```

Then restart Claude Code.

## What's Included

### Skills (auto-activated)

- **vizzly-knowledge** - Core knowledge about Vizzly file structure, CLI commands, and how it works
- **debug-visual-regression** - Analyze visual test failures and screenshot differences
- **check-visual-tests** - Check test status and get summaries
- **visual-testing-philosophy** - Best practices for visual testing

### Commands (manual)

- `/vizzly:setup` - Initialize Vizzly in a project
- `/vizzly:suggest-screenshots` - Analyze tests and suggest where to add visual screenshots

### CLI Integration

The plugin teaches Claude how to use the full Vizzly CLI:
- TDD commands: `vizzly tdd start`, `vizzly tdd run`, `vizzly baselines`
- Cloud commands: `vizzly run`, `vizzly status`, `vizzly builds`
- Review commands: `vizzly approve`, `vizzly reject`, `vizzly comment`
- Setup commands: `vizzly init`, `vizzly login`, `vizzly project:select`

## Structure

```
vizzly-plugin/
└── plugins/
    └── vizzly/
        ├── .claude-plugin/
        │   └── plugin.json
        ├── skills/
        └── commands/
```

## Development

Test the plugin locally:

```bash
claude --plugin-dir ./vizzly-plugin/plugins/vizzly
```
