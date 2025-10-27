#!/usr/bin/env node

/**
 * Vizzly MCP Server
 * Provides Claude Code with access to Vizzly TDD state and cloud API
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { LocalTDDProvider } from './local-tdd-provider.js';
import { CloudAPIProvider } from './cloud-api-provider.js';
import { resolveToken, getUserInfo } from './token-resolver.js';

class VizzlyMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'vizzly',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.localProvider = new LocalTDDProvider();
    this.cloudProvider = new CloudAPIProvider();

    this.setupHandlers();
  }

  /**
   * Detect context - whether user is working locally or with cloud builds
   */
  async detectContext(workingDirectory) {
    let context = {
      hasLocalTDD: false,
      hasApiToken: false,
      hasAuthentication: false,
      mode: null,
      tokenSource: null,
      user: null
    };

    // Check for local TDD setup
    let vizzlyDir = await this.localProvider.findVizzlyDir(workingDirectory);
    if (vizzlyDir) {
      context.hasLocalTDD = true;
      context.mode = 'local';
    }

    // Check for API token using token resolver
    let token = await resolveToken({ workingDirectory });
    if (token) {
      context.hasApiToken = true;
      context.hasAuthentication = true;

      // Determine token source
      if (process.env.VIZZLY_TOKEN) {
        context.tokenSource = 'environment';
      } else if (token.startsWith('vzt_')) {
        context.tokenSource = 'project_mapping';
      } else {
        context.tokenSource = 'user_login';
        // Include user info if available
        let userInfo = await getUserInfo();
        if (userInfo) {
          context.user = {
            email: userInfo.email,
            name: userInfo.name
          };
        }
      }

      if (!context.mode) {
        context.mode = 'cloud';
      }
    }

    return context;
  }

  /**
   * Resolve API token from various sources
   * @param {Object} args - Tool arguments that may contain apiToken
   * @param {string} args.apiToken - Explicitly provided token
   * @param {string} args.workingDirectory - Working directory for project mapping
   * @returns {Promise<string|null>} Resolved token
   */
  async resolveApiToken(args = {}) {
    return await resolveToken({
      providedToken: args.apiToken,
      workingDirectory: args.workingDirectory || process.cwd()
    });
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'detect_context',
          description:
            "Detect whether user is working in local TDD mode or cloud collaboration mode. Use this at the start of a conversation to understand the user's workflow.",
          inputSchema: {
            type: 'object',
            properties: {
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional)'
              }
            }
          }
        },
        {
          name: 'get_tdd_status',
          description:
            'Get current TDD mode status including comparison results, failed/new/passed counts, and diff information',
          inputSchema: {
            type: 'object',
            properties: {
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional, defaults to current directory)'
              },
              statusFilter: {
                type: 'string',
                description: 'Filter comparisons by status: "failed", "new", "passed", or "all". Defaults to "summary" (no comparisons, just counts)',
                enum: ['failed', 'new', 'passed', 'all', 'summary']
              },
              limit: {
                type: 'number',
                description: 'Maximum number of comparisons to return (default: unlimited when statusFilter is set)'
              }
            }
          }
        },
        {
          name: 'read_comparison_details',
          description:
            'Read detailed comparison information for a screenshot or comparison. Automatically detects if working in local TDD mode or cloud mode. Pass either a screenshot name (e.g., "homepage_desktop") for local mode or a comparison ID (e.g., "cmp_abc123") for cloud mode. IMPORTANT: Returns both paths (for local) and URLs (for cloud). Use Read tool for paths, WebFetch for URLs. Do NOT read/fetch diff images as they cause API errors.',
          inputSchema: {
            type: 'object',
            properties: {
              identifier: {
                type: 'string',
                description: 'Screenshot name (local mode) or comparison ID (cloud mode)'
              },
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional, for local mode)'
              },
              apiToken: {
                type: 'string',
                description:
                  'Vizzly API token (optional, auto-resolves from: CLI flag > env var > project mapping > user login)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional, for cloud mode)'
              }
            },
            required: ['identifier']
          }
        },
        {
          name: 'list_diff_images',
          description:
            'List all available diff images from TDD comparisons. Returns paths for reference only - do NOT read these images as they cause API errors. Use read_comparison_details to get baseline and current image paths instead.',
          inputSchema: {
            type: 'object',
            properties: {
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional)'
              }
            }
          }
        },
        {
          name: 'get_build_status',
          description: 'Get cloud build status and comparison results (requires API token)',
          inputSchema: {
            type: 'object',
            properties: {
              buildId: {
                type: 'string',
                description: 'Build ID to check status for'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional, defaults to https://app.vizzly.dev)'
              }
            },
            required: ['buildId']
          }
        },
        {
          name: 'list_recent_builds',
          description: 'List recent builds from Vizzly cloud (requires API token)',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of builds to return (default: 10)'
              },
              branch: {
                type: 'string',
                description: 'Filter by branch name (optional)'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            }
          }
        },
        {
          name: 'get_comparison',
          description:
            'Get detailed comparison information from cloud API including screenshot URLs. IMPORTANT: Use WebFetch to view ONLY baselineUrl and currentUrl - do NOT fetch diffUrl as it causes API errors.',
          inputSchema: {
            type: 'object',
            properties: {
              comparisonId: {
                type: 'string',
                description: 'Comparison ID'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['comparisonId']
          }
        },
        {
          name: 'search_comparisons',
          description:
            'Search for comparisons by screenshot name across recent builds in the cloud. Returns matching comparisons with their build context and screenshot URLs. Use this to find all instances of a specific screenshot across different builds for debugging.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Screenshot/comparison name to search for (supports partial matching)'
              },
              branch: {
                type: 'string',
                description: 'Optional branch name to filter results'
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 50)'
              },
              offset: {
                type: 'number',
                description: 'Offset for pagination (default: 0)'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['name']
          }
        },
        {
          name: 'create_build_comment',
          description: 'Create a comment on a build for collaboration',
          inputSchema: {
            type: 'object',
            properties: {
              buildId: {
                type: 'string',
                description: 'Build ID to comment on'
              },
              content: {
                type: 'string',
                description: 'Comment text content'
              },
              type: {
                type: 'string',
                description: 'Comment type: general, approval, rejection (default: general)'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['buildId', 'content']
          }
        },
        {
          name: 'list_build_comments',
          description: 'List all comments on a build',
          inputSchema: {
            type: 'object',
            properties: {
              buildId: {
                type: 'string',
                description: 'Build ID'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['buildId']
          }
        },
        {
          name: 'approve_comparison',
          description: 'Approve a comparison - indicates the visual change is acceptable',
          inputSchema: {
            type: 'object',
            properties: {
              comparisonId: {
                type: 'string',
                description: 'Comparison ID to approve'
              },
              comment: {
                type: 'string',
                description: 'Optional comment explaining the approval'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['comparisonId']
          }
        },
        {
          name: 'reject_comparison',
          description: 'Reject a comparison - indicates the visual change needs fixing',
          inputSchema: {
            type: 'object',
            properties: {
              comparisonId: {
                type: 'string',
                description: 'Comparison ID to reject'
              },
              reason: {
                type: 'string',
                description: 'Required reason for rejection (will be added as a comment)'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['comparisonId', 'reason']
          }
        },
        {
          name: 'get_review_summary',
          description: 'Get review status and assignments for a build',
          inputSchema: {
            type: 'object',
            properties: {
              buildId: {
                type: 'string',
                description: 'Build ID'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              }
            },
            required: ['buildId']
          }
        },
        {
          name: 'accept_baseline',
          description: 'Accept a screenshot as the new baseline in local TDD mode',
          inputSchema: {
            type: 'object',
            properties: {
              screenshotName: {
                type: 'string',
                description: 'Name of the screenshot to accept'
              },
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional)'
              }
            },
            required: ['screenshotName']
          }
        },
        {
          name: 'reject_baseline',
          description:
            'Reject a screenshot baseline in local TDD mode (marks it for investigation)',
          inputSchema: {
            type: 'object',
            properties: {
              screenshotName: {
                type: 'string',
                description: 'Name of the screenshot to reject'
              },
              reason: {
                type: 'string',
                description: 'Reason for rejection'
              },
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional)'
              }
            },
            required: ['screenshotName', 'reason']
          }
        },
        {
          name: 'download_baselines',
          description: 'Download baseline screenshots from a cloud build to use in local TDD mode',
          inputSchema: {
            type: 'object',
            properties: {
              buildId: {
                type: 'string',
                description: 'Build ID to download baselines from'
              },
              screenshotNames: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description:
                  'Optional list of specific screenshot names to download (if not provided, downloads all)'
              },
              apiToken: {
                type: 'string',
                description: 'Vizzly API token (optional, auto-resolves from user login or env)'
              },
              apiUrl: {
                type: 'string',
                description: 'API base URL (optional)'
              },
              workingDirectory: {
                type: 'string',
                description: 'Path to project directory (optional)'
              }
            },
            required: ['buildId']
          }
        }
      ]
    }));

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'vizzly://tdd/status',
          name: 'TDD Status',
          description: 'Current TDD comparison results and statistics',
          mimeType: 'application/json'
        },
        {
          uri: 'vizzly://tdd/server-info',
          name: 'TDD Server Info',
          description: 'Information about the running TDD server',
          mimeType: 'application/json'
        }
      ]
    }));

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      let { uri } = request.params;

      if (uri === 'vizzly://tdd/status') {
        let status = await this.localProvider.getTDDStatus();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2)
            }
          ]
        };
      }

      if (uri === 'vizzly://tdd/server-info') {
        let serverInfo = await this.localProvider.getServerInfo();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(serverInfo, null, 2)
            }
          ]
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      let { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'detect_context': {
            let context = await this.detectContext(args.workingDirectory);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(context, null, 2)
                }
              ]
            };
          }

          case 'get_tdd_status': {
            let status = await this.localProvider.getTDDStatus(
              args.workingDirectory,
              args.statusFilter,
              args.limit
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(status, null, 2)
                }
              ]
            };
          }

          case 'read_comparison_details': {
            // Unified handler that tries local first, then cloud
            let details = null;
            let mode = null;

            // Try local mode first (if vizzlyDir exists)
            try {
              details = await this.localProvider.getComparisonDetails(
                args.identifier,
                args.workingDirectory
              );
              mode = 'local';
            } catch (localError) {
              // If local fails and we have API token, try cloud mode
              let apiToken = await this.resolveApiToken(args);
              if (apiToken && args.identifier.startsWith('cmp_')) {
                try {
                  let cloudComparison = await this.cloudProvider.getComparison(
                    args.identifier,
                    apiToken,
                    args.apiUrl
                  );

                  // Transform cloud response to unified format
                  details = {
                    mode: 'cloud',
                    name: cloudComparison.name,
                    status: cloudComparison.status,
                    diffPercentage: cloudComparison.diff_percentage,
                    threshold: cloudComparison.threshold,
                    hasDiff: cloudComparison.has_diff,
                    // Cloud URLs
                    baselineUrl: cloudComparison.baseline_screenshot?.original_url,
                    currentUrl: cloudComparison.current_screenshot?.original_url,
                    diffUrl: cloudComparison.diff_image?.url,
                    // Additional cloud metadata
                    comparisonId: cloudComparison.id,
                    buildId: cloudComparison.build_id,
                    analysis: [
                      `Cloud comparison (${cloudComparison.diff_percentage?.toFixed(2)}% difference)`,
                      'Use WebFetch to view baselineUrl and currentUrl',
                      'Do NOT fetch diffUrl as it causes API errors'
                    ]
                  };
                  mode = 'cloud';
                } catch (cloudError) {
                  throw new Error(
                    `Failed to get comparison details: Local - ${localError.message}, Cloud - ${cloudError.message}`
                  );
                }
              } else {
                throw localError;
              }
            }

            // Add mode to response if not already present
            if (mode && !details.mode) {
              details.mode = mode;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(details, null, 2)
                }
              ]
            };
          }

          case 'list_diff_images': {
            let diffs = await this.localProvider.listDiffImages(args.workingDirectory);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(diffs, null, 2)
                }
              ]
            };
          }

          case 'get_build_status': {
            let apiToken = await this.resolveApiToken(args);
            let buildStatus = await this.cloudProvider.getBuildStatus(
              args.buildId,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(buildStatus, null, 2)
                }
              ]
            };
          }

          case 'list_recent_builds': {
            let apiToken = await this.resolveApiToken(args);
            let builds = await this.cloudProvider.listRecentBuilds(
              apiToken,
              {
                limit: args.limit,
                branch: args.branch,
                apiUrl: args.apiUrl
              }
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(builds, null, 2)
                }
              ]
            };
          }

          case 'get_comparison': {
            let apiToken = await this.resolveApiToken(args);
            let comparison = await this.cloudProvider.getComparison(
              args.comparisonId,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(comparison, null, 2)
                }
              ]
            };
          }

          case 'search_comparisons': {
            let apiToken = await this.resolveApiToken(args);
            let results = await this.cloudProvider.searchComparisons(args.name, apiToken, {
              branch: args.branch,
              limit: args.limit,
              offset: args.offset,
              apiUrl: args.apiUrl
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(results, null, 2)
                }
              ]
            };
          }

          case 'create_build_comment': {
            let apiToken = await this.resolveApiToken(args);
            let result = await this.cloudProvider.createBuildComment(
              args.buildId,
              args.content,
              args.type || 'general',
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'list_build_comments': {
            let apiToken = await this.resolveApiToken(args);
            let comments = await this.cloudProvider.listBuildComments(
              args.buildId,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(comments, null, 2)
                }
              ]
            };
          }

          case 'approve_comparison': {
            let apiToken = await this.resolveApiToken(args);
            let result = await this.cloudProvider.approveComparison(
              args.comparisonId,
              args.comment,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'reject_comparison': {
            let apiToken = await this.resolveApiToken(args);
            let result = await this.cloudProvider.rejectComparison(
              args.comparisonId,
              args.reason,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'get_review_summary': {
            let apiToken = await this.resolveApiToken(args);
            let summary = await this.cloudProvider.getReviewSummary(
              args.buildId,
              apiToken,
              args.apiUrl
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(summary, null, 2)
                }
              ]
            };
          }

          case 'accept_baseline': {
            let result = await this.localProvider.acceptBaseline(
              args.screenshotName,
              args.workingDirectory
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'reject_baseline': {
            let result = await this.localProvider.rejectBaseline(
              args.screenshotName,
              args.reason,
              args.workingDirectory
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          }

          case 'download_baselines': {
            // First get build metadata and screenshot data from cloud
            let apiToken = await this.resolveApiToken(args);

            // Get full build status for metadata
            let buildStatus = await this.cloudProvider.getBuildStatus(
              args.buildId,
              apiToken,
              args.apiUrl
            );

            // Get screenshot data
            let cloudData = await this.cloudProvider.downloadBaselines(
              args.buildId,
              args.screenshotNames,
              apiToken,
              args.apiUrl
            );

            // Download and save locally with build metadata
            let result = await this.localProvider.downloadBaselinesFromCloud(
              cloudData.screenshots,
              args.workingDirectory,
              buildStatus.build // Pass build metadata
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      buildId: cloudData.buildId,
                      buildName: cloudData.buildName,
                      ...result
                    },
                    null,
                    2
                  )
                }
              ]
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
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

  async run() {
    let transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Vizzly MCP server running on stdio');
  }
}

// Start server
let server = new VizzlyMCPServer();
server.run().catch(console.error);
