# Changelog

All notable changes to the Vizzly Claude Code plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 📚 **New MCP Server:** `vizzly-docs` - Easy access to Vizzly documentation
  - `list_docs` - Browse all docs with optional category filtering
  - `get_doc` - Retrieve full markdown content for any doc page
  - `search_docs` - Keyword search across titles, descriptions, and categories
  - `get_sidebar` - View complete documentation navigation structure
  - Fetches from live docs.vizzly.dev site with intelligent caching
- ⚡️ **Performance:** `get_tdd_status` now supports filtering and pagination
  - New `statusFilter` parameter: `'failed'`, `'new'`, `'passed'`, `'all'`, or `'summary'` (default)
  - New `limit` parameter for capping number of comparisons returned
  - Default behavior (summary mode) returns only counts for better token efficiency
- 🔧 **API Enhancement:** Cloud API provider now includes approval status and flaky screenshot detection
  - Added approval status breakdown (pending/approved/rejected/auto_approved)
  - Added flaky screenshot count
  - Added hot spot coverage metadata for quick triage

### Changed
- 🔧 **Internal:** `acceptBaseline()` in TDD service now accepts both comparison ID (string) or full comparison object
  - Enables accepting baselines from report-data.json without in-memory lookup
  - Fixes issue where accepting from dashboard wasn't working properly

### Fixed
- 🐛 Fixed path bug in local TDD provider: `screenshots/` → `current/` directory
- 🐛 Fixed API field mapping in cloud provider: API returns `result` not `status`

## [0.1.0] - 2025-10-18

### Added
- ✨ **Agent Skills** - Model-invoked capabilities that activate autonomously
  - `check-visual-tests` Skill - Automatically checks test status when you ask about tests
  - `debug-visual-regression` Skill - Automatically analyzes failures when you mention visual issues
- 📦 MCP server configuration moved to plugin root (`.mcp.json`)
- 📝 Comprehensive README with Skills documentation, troubleshooting, and workflows
- 🔒 Tool restrictions via `allowed-tools` for better security and focused capabilities

### Changed
- 🔧 MCP server name: `vizzly-server` → `vizzly` (cleaner naming)
- 🔧 Skills use correct tool prefix: `mcp__plugin_vizzly_vizzly__*`

### Removed
- ❌ **BREAKING:** `/vizzly:tdd-status` slash command → Replaced by `check-visual-tests` Skill
- ❌ **BREAKING:** `/vizzly:debug-diff` slash command → Replaced by `debug-visual-regression` Skill

### Migration Guide

**Before (v0.0.x):**
```bash
# Manually invoke slash commands
/vizzly:tdd-status
/vizzly:debug-diff homepage
```

**After (v0.1.0):**
```bash
# Just ask naturally - Skills activate automatically
"How are my visual tests?"
"The homepage screenshot is failing"
```

**What Changed:**
- **Status checks** are now autonomous - just ask about your tests
- **Debugging** happens automatically when you mention failures
- **No need to remember slash commands** - Claude understands your intent
- **Setup and suggestions** still use slash commands (`/vizzly:setup`, `/vizzly:suggest-screenshots`)

**Why This Change:**
Agent Skills provide a more natural, intuitive experience. Instead of memorizing command syntax, you can ask questions in plain language and Claude will automatically use the right tools.

**If You Prefer Explicit Commands:**
While the slash commands are removed, you can still be explicit in your requests:
- "Check my Vizzly test status" → Activates `check-visual-tests` Skill
- "Debug the homepage screenshot" → Activates `debug-visual-regression` Skill

### Fixed
- MCP server location now follows Claude Code plugin specifications
- Tool naming consistency across Skills and MCP server
