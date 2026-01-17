/**
 * CI Environment Detection
 *
 * Generic functions to extract git and PR information from any CI provider
 */

import { readFileSync } from 'node:fs';

// Cache for GitHub Actions event payload to avoid re-reading the file
let _githubEventCache = null;

/**
 * Read and parse the GitHub Actions event payload from GITHUB_EVENT_PATH.
 *
 * GitHub Actions sets GITHUB_EVENT_PATH to a file containing the full webhook
 * payload that triggered the workflow. This is essential for pull_request events
 * because GITHUB_SHA points to a merge commit, not the actual head commit.
 *
 * @returns {Object} Parsed event payload or empty object on failure
 */
export function getGitHubEvent() {
  if (_githubEventCache !== null) {
    return _githubEventCache;
  }

  let eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    _githubEventCache = {};
    return _githubEventCache;
  }

  try {
    let content = readFileSync(eventPath, 'utf8');
    _githubEventCache = JSON.parse(content);
  } catch {
    // File doesn't exist or invalid JSON - fail silently with empty object
    _githubEventCache = {};
  }

  return _githubEventCache;
}

/**
 * Reset the GitHub event cache. Useful for testing.
 */
export function resetGitHubEventCache() {
  _githubEventCache = null;
}

/**
 * Get the branch name from CI environment variables
 * @returns {string|null} Branch name or null if not available
 */
export function getBranch() {
  return (
    process.env.VIZZLY_BRANCH || // Vizzly override
    process.env.GITHUB_HEAD_REF || // GitHub Actions (for PRs)
    process.env.GITHUB_REF_NAME || // GitHub Actions (for pushes)
    process.env.CI_COMMIT_REF_NAME || // GitLab CI
    process.env.CIRCLE_BRANCH || // CircleCI
    process.env.TRAVIS_BRANCH || // Travis CI
    process.env.BUILDKITE_BRANCH || // Buildkite
    process.env.DRONE_BRANCH || // Drone CI
    process.env.BRANCH_NAME || // Jenkins
    process.env.GIT_BRANCH || // Jenkins (alternative)
    process.env.BITBUCKET_BRANCH || // Bitbucket Pipelines
    process.env.WERCKER_GIT_BRANCH || // Wercker
    process.env.APPVEYOR_REPO_BRANCH || // AppVeyor
    process.env.BUILD_SOURCEBRANCH?.replace(/^refs\/heads\//, '') || // Azure DevOps
    process.env.CODEBUILD_WEBHOOK_HEAD_REF?.replace(/^refs\/heads\//, '') || // AWS CodeBuild
    process.env.SEMAPHORE_GIT_BRANCH || // Semaphore
    null
  );
}

/**
 * Get the commit SHA from CI environment variables.
 *
 * IMPORTANT: For GitHub Actions pull_request events, GITHUB_SHA points to a
 * temporary merge commit, NOT the actual head commit of the PR. This function
 * reads the event payload from GITHUB_EVENT_PATH to extract the correct SHA.
 *
 * See: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request
 * "GITHUB_SHA for this event is the last merge commit of the pull request merge branch.
 * If you want to get the commit ID for the last commit to the head branch of the
 * pull request, use github.event.pull_request.head.sha instead."
 *
 * @returns {string|null} Commit SHA or null if not available
 */
export function getCommit() {
  // Vizzly override always takes priority
  if (process.env.VIZZLY_COMMIT_SHA) {
    return process.env.VIZZLY_COMMIT_SHA;
  }

  // GitHub Actions: extract the correct SHA based on event type
  if (process.env.GITHUB_ACTIONS) {
    let event = getGitHubEvent();

    // For pull_request events, use the actual head commit SHA (not the merge commit)
    // The event payload contains pull_request.head.sha which is what we want
    if (event.pull_request?.head?.sha) {
      return event.pull_request.head.sha;
    }

    // For push events or if event parsing failed, GITHUB_SHA is correct
    return process.env.GITHUB_SHA || null;
  }

  // Other CI providers
  return (
    process.env.CI_COMMIT_SHA || // GitLab CI
    process.env.CIRCLE_SHA1 || // CircleCI
    process.env.TRAVIS_COMMIT || // Travis CI
    process.env.BUILDKITE_COMMIT || // Buildkite
    process.env.DRONE_COMMIT_SHA || // Drone CI
    process.env.GIT_COMMIT || // Jenkins
    process.env.BITBUCKET_COMMIT || // Bitbucket Pipelines
    process.env.WERCKER_GIT_COMMIT || // Wercker
    process.env.APPVEYOR_REPO_COMMIT || // AppVeyor
    process.env.BUILD_SOURCEVERSION || // Azure DevOps
    process.env.CODEBUILD_RESOLVED_SOURCE_VERSION || // AWS CodeBuild
    process.env.SEMAPHORE_GIT_SHA || // Semaphore
    process.env.HEROKU_TEST_RUN_COMMIT_VERSION || // Heroku CI
    process.env.COMMIT_SHA || // Generic
    process.env.HEAD_COMMIT || // Alternative generic
    process.env.SHA || // Another generic option
    null
  );
}

/**
 * Get the commit message from CI environment variables
 * @returns {string|null} Commit message or null if not available
 */
export function getCommitMessage() {
  return (
    process.env.VIZZLY_COMMIT_MESSAGE || // Vizzly override
    process.env.CI_COMMIT_MESSAGE || // GitLab CI
    process.env.TRAVIS_COMMIT_MESSAGE || // Travis CI
    process.env.BUILDKITE_MESSAGE || // Buildkite
    process.env.DRONE_COMMIT_MESSAGE || // Drone CI
    process.env.APPVEYOR_REPO_COMMIT_MESSAGE || // AppVeyor
    process.env.COMMIT_MESSAGE || // Generic
    null
  );
}

/**
 * Get the pull request number from CI environment variables
 * @returns {number|null} PR number or null if not available/not a PR
 */
export function getPullRequestNumber() {
  // Check VIZZLY override first
  if (process.env.VIZZLY_PR_NUMBER) {
    return parseInt(process.env.VIZZLY_PR_NUMBER, 10);
  }

  // GitHub Actions - extract from GITHUB_REF
  if (
    process.env.GITHUB_ACTIONS &&
    process.env.GITHUB_EVENT_NAME === 'pull_request'
  ) {
    const prMatch = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\/merge/);
    if (prMatch?.[1]) return parseInt(prMatch[1], 10);
  }

  // GitLab CI
  if (process.env.CI_MERGE_REQUEST_ID) {
    return parseInt(process.env.CI_MERGE_REQUEST_ID, 10);
  }

  // CircleCI - extract from PR URL
  if (process.env.CIRCLE_PULL_REQUEST) {
    const prMatch = process.env.CIRCLE_PULL_REQUEST.match(/\/pull\/(\d+)$/);
    if (prMatch?.[1]) return parseInt(prMatch[1], 10);
  }

  // Travis CI
  if (
    process.env.TRAVIS_PULL_REQUEST &&
    process.env.TRAVIS_PULL_REQUEST !== 'false'
  ) {
    return parseInt(process.env.TRAVIS_PULL_REQUEST, 10);
  }

  // Buildkite
  if (
    process.env.BUILDKITE_PULL_REQUEST &&
    process.env.BUILDKITE_PULL_REQUEST !== 'false'
  ) {
    return parseInt(process.env.BUILDKITE_PULL_REQUEST, 10);
  }

  // Drone CI
  if (process.env.DRONE_PULL_REQUEST) {
    return parseInt(process.env.DRONE_PULL_REQUEST, 10);
  }

  // Jenkins (GitHub Pull Request Builder plugin)
  if (process.env.ghprbPullId) {
    return parseInt(process.env.ghprbPullId, 10);
  }

  // Azure DevOps
  if (process.env.SYSTEM_PULLREQUEST_PULLREQUESTID) {
    return parseInt(process.env.SYSTEM_PULLREQUEST_PULLREQUESTID, 10);
  }

  // AppVeyor
  if (process.env.APPVEYOR_PULL_REQUEST_NUMBER) {
    return parseInt(process.env.APPVEYOR_PULL_REQUEST_NUMBER, 10);
  }

  return null;
}

/**
 * Get the PR head SHA from CI environment variables.
 *
 * For GitHub Actions, this reads from the event payload to get the actual
 * head commit SHA, not the merge commit that GITHUB_SHA points to.
 *
 * @returns {string|null} PR head SHA or null if not available
 */
export function getPullRequestHeadSha() {
  // Vizzly override always takes priority
  if (process.env.VIZZLY_PR_HEAD_SHA) {
    return process.env.VIZZLY_PR_HEAD_SHA;
  }

  // GitHub Actions: extract from event payload for PRs
  if (process.env.GITHUB_ACTIONS) {
    let event = getGitHubEvent();
    if (event.pull_request?.head?.sha) {
      return event.pull_request.head.sha;
    }
    return process.env.GITHUB_SHA || null;
  }

  // Other CI providers
  return (
    process.env.CI_COMMIT_SHA || // GitLab CI
    process.env.CIRCLE_SHA1 || // CircleCI
    process.env.TRAVIS_COMMIT || // Travis CI
    process.env.BUILDKITE_COMMIT || // Buildkite
    process.env.DRONE_COMMIT_SHA || // Drone CI
    process.env.ghprbActualCommit || // Jenkins
    process.env.GIT_COMMIT || // Jenkins fallback
    process.env.BUILD_SOURCEVERSION || // Azure DevOps
    process.env.APPVEYOR_REPO_COMMIT || // AppVeyor
    null
  );
}

/**
 * Get the PR base SHA from CI environment variables.
 *
 * For GitHub Actions, this reads from the event payload to get the base
 * branch SHA that the PR is targeting.
 *
 * @returns {string|null} PR base SHA or null if not available
 */
export function getPullRequestBaseSha() {
  // Vizzly override always takes priority
  if (process.env.VIZZLY_PR_BASE_SHA) {
    return process.env.VIZZLY_PR_BASE_SHA;
  }

  // GitHub Actions: extract from event payload
  if (process.env.GITHUB_ACTIONS) {
    let event = getGitHubEvent();
    if (event.pull_request?.base?.sha) {
      return event.pull_request.base.sha;
    }
  }

  // Other CI providers
  return (
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_SHA || // GitLab CI
    null // Most CIs don't provide this
  );
}

/**
 * Get the PR head ref (branch) from CI environment variables
 * @returns {string|null} PR head ref or null if not available
 */
export function getPullRequestHeadRef() {
  return (
    process.env.VIZZLY_PR_HEAD_REF || // Vizzly override
    process.env.GITHUB_HEAD_REF || // GitHub Actions
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || // GitLab CI
    process.env.TRAVIS_PULL_REQUEST_BRANCH || // Travis CI
    process.env.DRONE_SOURCE_BRANCH || // Drone CI
    process.env.ghprbSourceBranch || // Jenkins
    process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH?.replace(
      /^refs\/heads\//,
      ''
    ) || // Azure DevOps
    process.env.APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH || // AppVeyor
    null
  );
}

/**
 * Get the PR base ref (target branch) from CI environment variables
 * @returns {string|null} PR base ref or null if not available
 */
export function getPullRequestBaseRef() {
  return (
    process.env.VIZZLY_PR_BASE_REF || // Vizzly override
    process.env.GITHUB_BASE_REF || // GitHub Actions
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || // GitLab CI
    process.env.TRAVIS_BRANCH || // Travis CI (target branch)
    process.env.BUILDKITE_PULL_REQUEST_BASE_BRANCH || // Buildkite
    process.env.DRONE_TARGET_BRANCH || // Drone CI
    process.env.ghprbTargetBranch || // Jenkins
    process.env.SYSTEM_PULLREQUEST_TARGETBRANCH?.replace(
      /^refs\/heads\//,
      ''
    ) || // Azure DevOps
    process.env.APPVEYOR_REPO_BRANCH || // AppVeyor (target branch)
    null
  );
}

/**
 * Check if we're currently in a pull request context
 * @returns {boolean} True if in a PR context
 */
export function isPullRequest() {
  return getPullRequestNumber() !== null;
}

/**
 * Get the CI provider name
 * @returns {string} CI provider name or 'unknown'
 */
export function getCIProvider() {
  if (process.env.GITHUB_ACTIONS) return 'github-actions';
  if (process.env.GITLAB_CI) return 'gitlab-ci';
  if (process.env.CIRCLECI) return 'circleci';
  if (process.env.TRAVIS) return 'travis-ci';
  if (process.env.BUILDKITE) return 'buildkite';
  if (process.env.DRONE) return 'drone-ci';
  if (process.env.JENKINS_URL) return 'jenkins';
  if (process.env.AZURE_HTTP_USER_AGENT || process.env.TF_BUILD)
    return 'azure-devops';
  if (process.env.CODEBUILD_BUILD_ID) return 'aws-codebuild';
  if (process.env.APPVEYOR) return 'appveyor';
  if (process.env.SEMAPHORE) return 'semaphore';
  if (process.env.WERCKER) return 'wercker';
  if (process.env.BITBUCKET_BUILD_NUMBER) return 'bitbucket-pipelines';
  if (process.env.HEROKU_TEST_RUN_ID) return 'heroku-ci';
  return 'unknown';
}
