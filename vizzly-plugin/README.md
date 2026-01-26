# Vizzly Plugin Marketplace

This directory contains the Vizzly plugin marketplace for Claude Code.

## For Users

See the [plugin README](./plugins/vizzly/README.md) for installation instructions.

**Quick install:**

```
/plugin marketplace add vizzly-testing/cli
/plugin install vizzly@vizzly-marketplace
```

Then restart Claude Code.

## Structure

```
vizzly-plugin/
├── .claude-plugin/
│   └── marketplace.json    # Marketplace definition
└── plugins/
    └── vizzly/             # The actual plugin
        ├── .claude-plugin/
        │   └── plugin.json
        ├── skills/         # Auto-activated skills
        ├── commands/       # Manual slash commands
        └── README.md       # User documentation
```

## For Plugin Developers

To test the plugin locally:

```bash
claude --plugin-dir ./vizzly-plugin/plugins/vizzly
```

To test via marketplace:

```bash
/plugin marketplace add ./vizzly-plugin
/plugin install vizzly@vizzly-marketplace
```
