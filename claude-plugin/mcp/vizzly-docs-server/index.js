#!/usr/bin/env node

/**
 * Vizzly Docs MCP Server
 * Provides Claude Code with easy access to Vizzly documentation
 *
 * This server fetches docs from the deployed docs.vizzly.dev site,
 * making it easy for LLMs to navigate and retrieve documentation content.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fetchDocsIndex, fetchDocContent, searchDocs } from './docs-fetcher.js';

class VizzlyDocsMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'vizzly-docs',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Cache the index for the session
    this.indexCache = null;
    this.indexFetchTime = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    this.setupHandlers();
  }

  /**
   * Get the docs index (with caching)
   */
  async getIndex() {
    let now = Date.now();

    if (!this.indexCache || !this.indexFetchTime || now - this.indexFetchTime > this.CACHE_TTL) {
      this.indexCache = await fetchDocsIndex();
      this.indexFetchTime = now;
    }

    return this.indexCache;
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_docs',
          description:
            'List all available Vizzly documentation pages. Returns title, description, category, and URL for each doc. Optionally filter by category.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                description:
                  'Optional category filter (e.g., "Integration > CLI", "Features"). Case-insensitive partial match.'
              }
            }
          }
        },
        {
          name: 'get_doc',
          description:
            'Get the full markdown content of a specific documentation page. Returns the raw MDX/markdown with frontmatter. Use the path or slug from list_docs.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'The document path (e.g., "integration/cli/overview.mdx") or slug (e.g., "integration/cli/overview"). Get this from list_docs or search_docs.'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'search_docs',
          description:
            'Search documentation by keyword. Searches in titles and descriptions. Returns matching docs with relevance scores.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (e.g., "TDD mode", "authentication", "parallel builds")'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
                default: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_sidebar',
          description:
            'Get the complete sidebar navigation structure. Useful for understanding how docs are organized and finding related pages.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        switch (request.params.name) {
          case 'list_docs':
            return await this.handleListDocs(request.params.arguments);

          case 'get_doc':
            return await this.handleGetDoc(request.params.arguments);

          case 'search_docs':
            return await this.handleSearchDocs(request.params.arguments);

          case 'get_sidebar':
            return await this.handleGetSidebar();

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  async handleListDocs(args) {
    let index = await this.getIndex();
    let { category } = args || {};

    let docs = index.docs;

    // Filter by category if provided
    if (category) {
      let lowerCategory = category.toLowerCase();
      docs = docs.filter(doc => doc.category.toLowerCase().includes(lowerCategory));
    }

    // Format response
    let response = `# Vizzly Documentation (${docs.length} docs)\n\n`;

    if (category) {
      response += `Filtered by category: "${category}"\n\n`;
    }

    // Group by category
    let byCategory = {};
    for (let doc of docs) {
      if (!byCategory[doc.category]) {
        byCategory[doc.category] = [];
      }
      byCategory[doc.category].push(doc);
    }

    for (let [cat, catDocs] of Object.entries(byCategory)) {
      response += `## ${cat}\n\n`;
      for (let doc of catDocs) {
        response += `- **${doc.title}**\n`;
        response += `  - Path: \`${doc.path}\`\n`;
        response += `  - Slug: \`${doc.slug}\`\n`;
        if (doc.description) {
          response += `  - ${doc.description}\n`;
        }
        response += `  - URL: ${doc.url}\n\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  }

  async handleGetDoc(args) {
    let { path } = args;

    if (!path) {
      throw new Error('path parameter is required');
    }

    let content = await fetchDocContent(path);

    return {
      content: [
        {
          type: 'text',
          text: content
        }
      ]
    };
  }

  async handleSearchDocs(args) {
    let { query, limit = 10 } = args;

    if (!query) {
      throw new Error('query parameter is required');
    }

    let index = await this.getIndex();
    let results = searchDocs(index.docs, query, limit);

    let response = `# Search Results for "${query}"\n\n`;
    response += `Found ${results.length} matching docs:\n\n`;

    for (let result of results) {
      response += `## ${result.doc.title}\n`;
      response += `- **Category:** ${result.doc.category}\n`;
      response += `- **Path:** \`${result.doc.path}\`\n`;
      response += `- **Relevance:** ${Math.round(result.score * 100)}%\n`;
      if (result.doc.description) {
        response += `- **Description:** ${result.doc.description}\n`;
      }
      response += `- **URL:** ${result.doc.url}\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  }

  async handleGetSidebar() {
    let index = await this.getIndex();

    let response = `# Vizzly Documentation Structure\n\n`;
    response += JSON.stringify(index.sidebar, null, 2);

    return {
      content: [
        {
          type: 'text',
          text: response
        }
      ]
    };
  }

  async run() {
    let transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Start the server
let server = new VizzlyDocsMCPServer();
server.run().catch(error => {
  console.error('Server error:', error);
  process.exit(1);
});
