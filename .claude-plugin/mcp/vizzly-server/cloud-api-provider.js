/**
 * Provider for Vizzly Cloud API integration
 */
export class CloudAPIProvider {
  constructor() {
    this.defaultApiUrl = process.env.VIZZLY_API_URL || 'https://app.vizzly.dev';
  }

  /**
   * Make API request to Vizzly
   */
  async makeRequest(path, apiToken, apiUrl = this.defaultApiUrl) {
    if (!apiToken) {
      throw new Error(
        'API token required. Set VIZZLY_TOKEN environment variable or provide via apiToken parameter.'
      );
    }

    let url = `${apiUrl}${path}`;
    let response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'Vizzly-Claude-Plugin/0.1.0'
      }
    });

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`API request failed (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Get build status and details
   */
  async getBuildStatus(buildId, apiToken, apiUrl) {
    let data = await this.makeRequest(
      `/api/sdk/builds/${buildId}?include=comparisons`,
      apiToken,
      apiUrl
    );

    let { build } = data;

    // Calculate comparison summary
    let comparisons = build.comparisons || [];
    let summary = {
      total: comparisons.length,
      new: comparisons.filter((c) => c.status === 'new').length,
      changed: comparisons.filter((c) => c.has_diff).length,
      identical: comparisons.filter((c) => !c.has_diff && c.status !== 'new').length
    };

    // Group comparisons by status
    let failedComparisons = comparisons
      .filter((c) => c.has_diff)
      .map((c) => ({
        name: c.name,
        diffPercentage: c.diff_percentage,
        currentUrl: c.current_screenshot?.original_url,
        baselineUrl: c.baseline_screenshot?.original_url,
        diffUrl: c.diff_image?.url
      }));

    let newComparisons = comparisons
      .filter((c) => c.status === 'new')
      .map((c) => ({
        name: c.name,
        currentUrl: c.current_screenshot?.original_url
      }));

    return {
      build: {
        id: build.id,
        name: build.name,
        branch: build.branch,
        status: build.status,
        url: build.url,
        organizationSlug: build.organizationSlug,
        projectSlug: build.projectSlug,
        createdAt: build.created_at,
        // Include commit details for debugging
        commitSha: build.commit_sha,
        commitMessage: build.commit_message,
        commonAncestorSha: build.common_ancestor_sha
      },
      summary,
      failedComparisons,
      newComparisons
    };
  }

  /**
   * List recent builds
   */
  async listRecentBuilds(apiToken, options = {}) {
    let { limit = 10, branch, apiUrl } = options;

    let queryParams = new URLSearchParams({
      limit: limit.toString()
    });

    if (branch) {
      queryParams.append('branch', branch);
    }

    let data = await this.makeRequest(`/api/sdk/builds?${queryParams}`, apiToken, apiUrl);

    return {
      builds: data.builds.map((b) => ({
        id: b.id,
        name: b.name,
        branch: b.branch,
        status: b.status,
        environment: b.environment,
        createdAt: b.created_at
      })),
      pagination: data.pagination
    };
  }

  /**
   * Get token context (organization and project info)
   */
  async getTokenContext(apiToken, apiUrl) {
    return await this.makeRequest('/api/sdk/token/context', apiToken, apiUrl);
  }

  /**
   * Get comparison details
   */
  async getComparison(comparisonId, apiToken, apiUrl) {
    let data = await this.makeRequest(`/api/sdk/comparisons/${comparisonId}`, apiToken, apiUrl);

    return data.comparison;
  }

  // ==================================================================
  // BUILD COMMENTS
  // ==================================================================

  /**
   * Create a comment on a build
   */
  async createBuildComment(buildId, content, type, apiToken, apiUrl) {
    let url = `${apiUrl || this.defaultApiUrl}/api/sdk/builds/${buildId}/comments`;
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'Vizzly-Claude-Plugin/0.1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, type })
    });

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`Failed to create comment (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * List comments for a build
   */
  async listBuildComments(buildId, apiToken, apiUrl) {
    let data = await this.makeRequest(`/api/sdk/builds/${buildId}/comments`, apiToken, apiUrl);

    // Filter out unnecessary fields from comments for MCP
    let filterComment = (comment) => {
      // eslint-disable-next-line no-unused-vars
      let { profile_photo_url, email, ...filtered } = comment;
      // Recursively filter replies if they exist
      if (filtered.replies && Array.isArray(filtered.replies)) {
        filtered.replies = filtered.replies.map(filterComment);
      }
      return filtered;
    };

    return {
      ...data,
      comments: data.comments ? data.comments.map(filterComment) : []
    };
  }

  // ==================================================================
  // COMPARISON APPROVALS
  // ==================================================================

  /**
   * Approve a comparison
   */
  async approveComparison(comparisonId, comment, apiToken, apiUrl) {
    let url = `${apiUrl || this.defaultApiUrl}/api/sdk/comparisons/${comparisonId}/approve`;
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'Vizzly-Claude-Plugin/0.1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment })
    });

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`Failed to approve comparison (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Reject a comparison
   */
  async rejectComparison(comparisonId, reason, apiToken, apiUrl) {
    let url = `${apiUrl || this.defaultApiUrl}/api/sdk/comparisons/${comparisonId}/reject`;
    let response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'Vizzly-Claude-Plugin/0.1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`Failed to reject comparison (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * Update comparison approval status
   */
  async updateComparisonApproval(comparisonId, approvalStatus, comment, apiToken, apiUrl) {
    let url = `${apiUrl || this.defaultApiUrl}/api/sdk/comparisons/${comparisonId}/approval`;
    let response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'Vizzly-Claude-Plugin/0.1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ approval_status: approvalStatus, comment })
    });

    if (!response.ok) {
      let error = await response.text();
      throw new Error(`Failed to update comparison approval (${response.status}): ${error}`);
    }

    return response.json();
  }

  // ==================================================================
  // REVIEW STATUS
  // ==================================================================

  /**
   * Get review summary for a build
   */
  async getReviewSummary(buildId, apiToken, apiUrl) {
    let data = await this.makeRequest(
      `/api/sdk/builds/${buildId}/review-summary`,
      apiToken,
      apiUrl
    );

    return data;
  }

  // ==================================================================
  // TDD WORKFLOW
  // ==================================================================

  /**
   * Download baseline screenshots from a cloud build
   * Returns screenshot data that can be saved locally
   */
  async downloadBaselines(buildId, screenshotNames, apiToken, apiUrl) {
    let data = await this.makeRequest(
      `/api/sdk/builds/${buildId}?include=screenshots`,
      apiToken,
      apiUrl
    );

    let { build } = data;
    let screenshots = build.screenshots || [];

    // Filter by screenshot names if provided
    if (screenshotNames && screenshotNames.length > 0) {
      screenshots = screenshots.filter((s) => screenshotNames.includes(s.name));
    }

    return {
      buildId: build.id,
      buildName: build.name,
      screenshots: screenshots.map((s) => ({
        name: s.name,
        url: s.original_url,
        sha256: s.sha256,
        width: s.viewport_width,
        height: s.viewport_height,
        browser: s.browser
      }))
    };
  }
}
