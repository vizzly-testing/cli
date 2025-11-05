# Vizzly Docs MCP Server

MCP server that provides Claude Code with easy access to Vizzly documentation.

## How It Works

This server fetches documentation from the deployed `docs.vizzly.dev` site, making it easy for LLMs to:
- Browse all available docs
- Search documentation by keyword
- Retrieve full markdown content
- Understand the documentation structure

## Tools

### `list_docs`
List all available documentation pages with optional category filtering.

**Arguments:**
- `category` (optional): Filter by category (e.g., "Integration > CLI", "Features")

**Example:**
```javascript
list_docs({ category: "CLI" })
```

### `get_doc`
Get the full markdown content of a specific documentation page.

**Arguments:**
- `path` (required): The document path (e.g., "integration/cli/overview.mdx") or slug (e.g., "integration/cli/overview")

**Example:**
```javascript
get_doc({ path: "integration/cli/tdd-mode" })
```

### `search_docs`
Search documentation by keyword. Searches in titles, descriptions, and categories.

**Arguments:**
- `query` (required): Search query
- `limit` (optional): Maximum number of results (default: 10)

**Example:**
```javascript
search_docs({ query: "parallel builds", limit: 5 })
```

### `get_sidebar`
Get the complete sidebar navigation structure.

**Example:**
```javascript
get_sidebar()
```

## Architecture

The server works in a hybrid model:
1. **Index** - Fetches a pre-built JSON index from `docs.vizzly.dev/api/mcp-index.json`
2. **Content** - Fetches individual doc content on-demand from `docs.vizzly.dev/api/content/{path}`
3. **Caching** - Index is cached for 5 minutes to minimize network requests

This approach ensures:
- Fast browsing/searching (uses cached index)
- Always up-to-date content (fetched from live site)
- Minimal network overhead
- No local file dependencies

## Data Flow

```
Claude Code
    ↓
MCP Server (this)
    ↓
docs.vizzly.dev API
    ↓
Statically generated at build time (Astro)
```

## Development

To test the server locally:

```bash
# The server is automatically loaded by Claude Code when the plugin is active
# Check .mcp.json for configuration
```

## Files

- `index.js` - Main MCP server implementation
- `docs-fetcher.js` - Utilities for fetching and searching docs
- `README.md` - This file
