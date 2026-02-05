# Vizzly Plugin for Claude Code

> Visual regression testing skills for Claude Code

This plugin teaches Claude how to work with Vizzly. Debug failures, check test status, and learn visual testing best practices - all through natural conversation.

## Installation

### Step 1: Add the marketplace

In Claude Code, run:

```
/plugin marketplace add vizzly-testing/cli
```

This registers the Vizzly plugin marketplace with Claude Code.

### Step 2: Install the plugin

```
/plugin install vizzly@vizzly-marketplace
```

Or use the interactive installer:
1. Run `/plugin`
2. Go to the **Discover** tab
3. Search for "vizzly"
4. Select it and choose your install scope

### Step 3: Restart Claude Code

Skills load on startup. Quit and reopen Claude Code to activate the plugin.

### Verify Installation

After restarting, run `/plugin` and check the **Installed** tab. You should see `vizzly@vizzly-marketplace`.

---

## What's Included

### Skills (Auto-Activated)

Claude automatically uses these when relevant to your conversation:

| Skill | Triggers When You Say... |
|-------|---------------------------|
| **check-visual-tests** | "How are my visual tests?", "What's failing?" |
| **debug-visual-regression** | "Debug the homepage screenshot", "Why is this failing?" |
| **visual-testing-philosophy** | "Where should I add screenshots?", "Best practices?" |
| **vizzly-knowledge** | Background context (always available) |

### Commands (Manual)

| Command | Purpose |
|---------|---------|
| `/vizzly:setup` | Initialize Vizzly in a new project |
| `/vizzly:suggest-screenshots` | Analyze test files for screenshot opportunities |

---

## Usage Examples

**Check test status:**
```
How are my visual tests?
```

**Debug a failure:**
```
The homepage screenshot is failing, can you help debug it?
```

**Get screenshot suggestions:**
```
/vizzly:suggest-screenshots
```

**Set up a new project:**
```
/vizzly:setup
```

---

## How It Works

This plugin is **skills-first, not tools-first**.

The plugin teaches Claude how to work with Vizzly:
- Read `.vizzly/report-data.json` for test results
- View screenshot images with the Read tool
- Run CLI commands like `vizzly tdd start`
- Review and approve visual changes via the CLI
- Understand visual testing best practices

Claude uses its built-in capabilities (Read, Bash, etc.) combined with the Vizzly CLI - the plugin provides the knowledge to use them effectively.

---

## Requirements

- Claude Code v1.0.33 or later
- Vizzly CLI in your project: `npm install --save-dev @vizzly-testing/cli`

---

## Troubleshooting

**Plugin not showing in Discover tab?**
- Make sure the marketplace was added: `/plugin` → Marketplaces tab
- If missing, run `/plugin marketplace add vizzly-testing/cli` again

**Skills not activating?**
- Restart Claude Code after installing
- Try invoking directly: `/vizzly:check-visual-tests`

**"Server not running" message?**
- Start the TDD server: `vizzly tdd start`
- Run your tests to generate screenshots

---

## For Plugin Developers

To test the plugin locally without installing:

```bash
claude --plugin-dir ./vizzly-plugin/plugins/vizzly
```

---

## License

MIT
