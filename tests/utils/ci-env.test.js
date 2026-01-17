import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  getBranch,
  getCIProvider,
  getCommit,
  getCommitMessage,
  getPullRequestBaseRef,
  getPullRequestBaseSha,
  getPullRequestHeadRef,
  getPullRequestHeadSha,
  getPullRequestNumber,
  isPullRequest,
} from '../../src/utils/ci-env.js';

describe('utils/ci-env', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all CI-related env vars
    let ciVars = [
      'VIZZLY_BRANCH',
      'VIZZLY_COMMIT_SHA',
      'VIZZLY_COMMIT_MESSAGE',
      'VIZZLY_PR_NUMBER',
      'VIZZLY_PR_HEAD_SHA',
      'VIZZLY_PR_BASE_SHA',
      'VIZZLY_PR_HEAD_REF',
      'VIZZLY_PR_BASE_REF',
      'GITHUB_ACTIONS',
      'GITHUB_HEAD_REF',
      'GITHUB_REF_NAME',
      'GITHUB_SHA',
      'GITHUB_REF',
      'GITHUB_EVENT_NAME',
      'GITHUB_BASE_REF',
      'GITLAB_CI',
      'CI_COMMIT_REF_NAME',
      'CI_COMMIT_SHA',
      'CI_COMMIT_MESSAGE',
      'CI_MERGE_REQUEST_ID',
      'CI_MERGE_REQUEST_SOURCE_BRANCH_NAME',
      'CI_MERGE_REQUEST_TARGET_BRANCH_NAME',
      'CI_MERGE_REQUEST_TARGET_BRANCH_SHA',
      'CIRCLECI',
      'CIRCLE_BRANCH',
      'CIRCLE_SHA1',
      'CIRCLE_PULL_REQUEST',
      'TRAVIS',
      'TRAVIS_BRANCH',
      'TRAVIS_COMMIT',
      'TRAVIS_COMMIT_MESSAGE',
      'TRAVIS_PULL_REQUEST',
      'TRAVIS_PULL_REQUEST_BRANCH',
      'BUILDKITE',
      'BUILDKITE_BRANCH',
      'BUILDKITE_COMMIT',
      'BUILDKITE_MESSAGE',
      'BUILDKITE_PULL_REQUEST',
      'BUILDKITE_PULL_REQUEST_BASE_BRANCH',
      'DRONE',
      'DRONE_BRANCH',
      'DRONE_COMMIT_SHA',
      'DRONE_COMMIT_MESSAGE',
      'DRONE_PULL_REQUEST',
      'DRONE_SOURCE_BRANCH',
      'DRONE_TARGET_BRANCH',
      'JENKINS_URL',
      'BRANCH_NAME',
      'GIT_BRANCH',
      'GIT_COMMIT',
      'ghprbPullId',
      'ghprbSourceBranch',
      'ghprbTargetBranch',
      'ghprbActualCommit',
      'BITBUCKET_BRANCH',
      'BITBUCKET_COMMIT',
      'BITBUCKET_BUILD_NUMBER',
      'WERCKER',
      'WERCKER_GIT_BRANCH',
      'WERCKER_GIT_COMMIT',
      'APPVEYOR',
      'APPVEYOR_REPO_BRANCH',
      'APPVEYOR_REPO_COMMIT',
      'APPVEYOR_REPO_COMMIT_MESSAGE',
      'APPVEYOR_PULL_REQUEST_NUMBER',
      'APPVEYOR_PULL_REQUEST_HEAD_REPO_BRANCH',
      'TF_BUILD',
      'AZURE_HTTP_USER_AGENT',
      'BUILD_SOURCEBRANCH',
      'BUILD_SOURCEVERSION',
      'SYSTEM_PULLREQUEST_PULLREQUESTID',
      'SYSTEM_PULLREQUEST_SOURCEBRANCH',
      'SYSTEM_PULLREQUEST_TARGETBRANCH',
      'CODEBUILD_BUILD_ID',
      'CODEBUILD_WEBHOOK_HEAD_REF',
      'CODEBUILD_RESOLVED_SOURCE_VERSION',
      'SEMAPHORE',
      'SEMAPHORE_GIT_BRANCH',
      'SEMAPHORE_GIT_SHA',
      'HEROKU_TEST_RUN_ID',
      'HEROKU_TEST_RUN_COMMIT_VERSION',
      'COMMIT_SHA',
      'HEAD_COMMIT',
      'SHA',
      'COMMIT_MESSAGE',
    ];
    for (let v of ciVars) {
      delete process.env[v];
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getBranch', () => {
    it('returns null when no CI env vars set', () => {
      assert.strictEqual(getBranch(), null);
    });

    it('prefers VIZZLY_BRANCH override', () => {
      process.env.VIZZLY_BRANCH = 'vizzly-branch';
      process.env.GITHUB_REF_NAME = 'github-branch';

      assert.strictEqual(getBranch(), 'vizzly-branch');
    });

    it('reads GITHUB_HEAD_REF for PRs', () => {
      process.env.GITHUB_HEAD_REF = 'feature-branch';

      assert.strictEqual(getBranch(), 'feature-branch');
    });

    it('reads GITHUB_REF_NAME for pushes', () => {
      process.env.GITHUB_REF_NAME = 'main';

      assert.strictEqual(getBranch(), 'main');
    });

    it('reads CI_COMMIT_REF_NAME for GitLab', () => {
      process.env.CI_COMMIT_REF_NAME = 'gitlab-branch';

      assert.strictEqual(getBranch(), 'gitlab-branch');
    });

    it('reads CIRCLE_BRANCH for CircleCI', () => {
      process.env.CIRCLE_BRANCH = 'circle-branch';

      assert.strictEqual(getBranch(), 'circle-branch');
    });

    it('strips refs/heads/ from Azure DevOps BUILD_SOURCEBRANCH', () => {
      process.env.BUILD_SOURCEBRANCH = 'refs/heads/azure-branch';

      assert.strictEqual(getBranch(), 'azure-branch');
    });

    it('strips refs/heads/ from AWS CodeBuild CODEBUILD_WEBHOOK_HEAD_REF', () => {
      process.env.CODEBUILD_WEBHOOK_HEAD_REF = 'refs/heads/codebuild-branch';

      assert.strictEqual(getBranch(), 'codebuild-branch');
    });
  });

  describe('getCommit', () => {
    it('returns null when no CI env vars set', () => {
      assert.strictEqual(getCommit(), null);
    });

    it('prefers VIZZLY_COMMIT_SHA override', () => {
      process.env.VIZZLY_COMMIT_SHA = 'vizzly-sha';
      process.env.GITHUB_SHA = 'github-sha';

      assert.strictEqual(getCommit(), 'vizzly-sha');
    });

    it('reads GITHUB_SHA for GitHub Actions push events', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_SHA = 'abc123';

      assert.strictEqual(getCommit(), 'abc123');
    });

    it('reads generic COMMIT_SHA', () => {
      process.env.COMMIT_SHA = 'generic-sha';

      assert.strictEqual(getCommit(), 'generic-sha');
    });
  });

  describe('getCommitMessage', () => {
    it('returns null when no CI env vars set', () => {
      assert.strictEqual(getCommitMessage(), null);
    });

    it('prefers VIZZLY_COMMIT_MESSAGE override', () => {
      process.env.VIZZLY_COMMIT_MESSAGE = 'vizzly message';
      process.env.CI_COMMIT_MESSAGE = 'gitlab message';

      assert.strictEqual(getCommitMessage(), 'vizzly message');
    });

    it('reads CI_COMMIT_MESSAGE for GitLab', () => {
      process.env.CI_COMMIT_MESSAGE = 'fix: bug';

      assert.strictEqual(getCommitMessage(), 'fix: bug');
    });
  });

  describe('getPullRequestNumber', () => {
    it('returns null when no PR context', () => {
      assert.strictEqual(getPullRequestNumber(), null);
    });

    it('prefers VIZZLY_PR_NUMBER override', () => {
      process.env.VIZZLY_PR_NUMBER = '42';
      process.env.CI_MERGE_REQUEST_ID = '99';

      assert.strictEqual(getPullRequestNumber(), 42);
    });

    it('extracts PR number from GitHub Actions GITHUB_REF', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_REF = 'refs/pull/123/merge';

      assert.strictEqual(getPullRequestNumber(), 123);
    });

    it('returns null for GitHub push events', () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_EVENT_NAME = 'push';
      process.env.GITHUB_REF = 'refs/heads/main';

      assert.strictEqual(getPullRequestNumber(), null);
    });

    it('reads CI_MERGE_REQUEST_ID for GitLab', () => {
      process.env.CI_MERGE_REQUEST_ID = '456';

      assert.strictEqual(getPullRequestNumber(), 456);
    });

    it('extracts PR number from CircleCI CIRCLE_PULL_REQUEST URL', () => {
      process.env.CIRCLE_PULL_REQUEST = 'https://github.com/org/repo/pull/789';

      assert.strictEqual(getPullRequestNumber(), 789);
    });

    it('reads TRAVIS_PULL_REQUEST when not false', () => {
      process.env.TRAVIS_PULL_REQUEST = '101';

      assert.strictEqual(getPullRequestNumber(), 101);
    });

    it('returns null for TRAVIS_PULL_REQUEST=false', () => {
      process.env.TRAVIS_PULL_REQUEST = 'false';

      assert.strictEqual(getPullRequestNumber(), null);
    });

    it('reads BUILDKITE_PULL_REQUEST when not false', () => {
      process.env.BUILDKITE_PULL_REQUEST = '202';

      assert.strictEqual(getPullRequestNumber(), 202);
    });

    it('returns null for BUILDKITE_PULL_REQUEST=false', () => {
      process.env.BUILDKITE_PULL_REQUEST = 'false';

      assert.strictEqual(getPullRequestNumber(), null);
    });

    it('reads DRONE_PULL_REQUEST', () => {
      process.env.DRONE_PULL_REQUEST = '303';

      assert.strictEqual(getPullRequestNumber(), 303);
    });

    it('reads ghprbPullId for Jenkins', () => {
      process.env.ghprbPullId = '404';

      assert.strictEqual(getPullRequestNumber(), 404);
    });

    it('reads SYSTEM_PULLREQUEST_PULLREQUESTID for Azure DevOps', () => {
      process.env.SYSTEM_PULLREQUEST_PULLREQUESTID = '505';

      assert.strictEqual(getPullRequestNumber(), 505);
    });

    it('reads APPVEYOR_PULL_REQUEST_NUMBER', () => {
      process.env.APPVEYOR_PULL_REQUEST_NUMBER = '606';

      assert.strictEqual(getPullRequestNumber(), 606);
    });
  });

  describe('getPullRequestHeadSha', () => {
    it('returns null when not set', () => {
      assert.strictEqual(getPullRequestHeadSha(), null);
    });

    it('prefers VIZZLY_PR_HEAD_SHA override', () => {
      process.env.VIZZLY_PR_HEAD_SHA = 'vizzly-head';
      process.env.GITHUB_SHA = 'github-sha';

      assert.strictEqual(getPullRequestHeadSha(), 'vizzly-head');
    });

    it('reads ghprbActualCommit for Jenkins', () => {
      process.env.ghprbActualCommit = 'jenkins-pr-sha';

      assert.strictEqual(getPullRequestHeadSha(), 'jenkins-pr-sha');
    });
  });

  describe('getPullRequestBaseSha', () => {
    it('returns null when not set', () => {
      assert.strictEqual(getPullRequestBaseSha(), null);
    });

    it('prefers VIZZLY_PR_BASE_SHA override', () => {
      process.env.VIZZLY_PR_BASE_SHA = 'vizzly-base';

      assert.strictEqual(getPullRequestBaseSha(), 'vizzly-base');
    });

    it('reads CI_MERGE_REQUEST_TARGET_BRANCH_SHA for GitLab', () => {
      process.env.CI_MERGE_REQUEST_TARGET_BRANCH_SHA = 'gitlab-base';

      assert.strictEqual(getPullRequestBaseSha(), 'gitlab-base');
    });
  });

  describe('getPullRequestHeadRef', () => {
    it('returns null when not set', () => {
      assert.strictEqual(getPullRequestHeadRef(), null);
    });

    it('prefers VIZZLY_PR_HEAD_REF override', () => {
      process.env.VIZZLY_PR_HEAD_REF = 'vizzly-head-ref';

      assert.strictEqual(getPullRequestHeadRef(), 'vizzly-head-ref');
    });

    it('reads GITHUB_HEAD_REF', () => {
      process.env.GITHUB_HEAD_REF = 'feature-branch';

      assert.strictEqual(getPullRequestHeadRef(), 'feature-branch');
    });

    it('strips refs/heads/ from Azure SYSTEM_PULLREQUEST_SOURCEBRANCH', () => {
      process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH = 'refs/heads/azure-source';

      assert.strictEqual(getPullRequestHeadRef(), 'azure-source');
    });
  });

  describe('getPullRequestBaseRef', () => {
    it('returns null when not set', () => {
      assert.strictEqual(getPullRequestBaseRef(), null);
    });

    it('prefers VIZZLY_PR_BASE_REF override', () => {
      process.env.VIZZLY_PR_BASE_REF = 'vizzly-base-ref';

      assert.strictEqual(getPullRequestBaseRef(), 'vizzly-base-ref');
    });

    it('reads GITHUB_BASE_REF', () => {
      process.env.GITHUB_BASE_REF = 'main';

      assert.strictEqual(getPullRequestBaseRef(), 'main');
    });

    it('strips refs/heads/ from Azure SYSTEM_PULLREQUEST_TARGETBRANCH', () => {
      process.env.SYSTEM_PULLREQUEST_TARGETBRANCH = 'refs/heads/main';

      assert.strictEqual(getPullRequestBaseRef(), 'main');
    });
  });

  describe('isPullRequest', () => {
    it('returns false when no PR context', () => {
      assert.strictEqual(isPullRequest(), false);
    });

    it('returns true when PR number is available', () => {
      process.env.VIZZLY_PR_NUMBER = '123';

      assert.strictEqual(isPullRequest(), true);
    });
  });

  describe('getCIProvider', () => {
    it('returns unknown when no CI detected', () => {
      assert.strictEqual(getCIProvider(), 'unknown');
    });

    it('detects GitHub Actions', () => {
      process.env.GITHUB_ACTIONS = 'true';

      assert.strictEqual(getCIProvider(), 'github-actions');
    });

    it('detects GitLab CI', () => {
      process.env.GITLAB_CI = 'true';

      assert.strictEqual(getCIProvider(), 'gitlab-ci');
    });

    it('detects CircleCI', () => {
      process.env.CIRCLECI = 'true';

      assert.strictEqual(getCIProvider(), 'circleci');
    });

    it('detects Travis CI', () => {
      process.env.TRAVIS = 'true';

      assert.strictEqual(getCIProvider(), 'travis-ci');
    });

    it('detects Buildkite', () => {
      process.env.BUILDKITE = 'true';

      assert.strictEqual(getCIProvider(), 'buildkite');
    });

    it('detects Drone CI', () => {
      process.env.DRONE = 'true';

      assert.strictEqual(getCIProvider(), 'drone-ci');
    });

    it('detects Jenkins', () => {
      process.env.JENKINS_URL = 'http://jenkins.example.com';

      assert.strictEqual(getCIProvider(), 'jenkins');
    });

    it('detects Azure DevOps via TF_BUILD', () => {
      process.env.TF_BUILD = 'true';

      assert.strictEqual(getCIProvider(), 'azure-devops');
    });

    it('detects Azure DevOps via AZURE_HTTP_USER_AGENT', () => {
      process.env.AZURE_HTTP_USER_AGENT = 'vsts';

      assert.strictEqual(getCIProvider(), 'azure-devops');
    });

    it('detects AWS CodeBuild', () => {
      process.env.CODEBUILD_BUILD_ID = 'build-123';

      assert.strictEqual(getCIProvider(), 'aws-codebuild');
    });

    it('detects AppVeyor', () => {
      process.env.APPVEYOR = 'true';

      assert.strictEqual(getCIProvider(), 'appveyor');
    });

    it('detects Semaphore', () => {
      process.env.SEMAPHORE = 'true';

      assert.strictEqual(getCIProvider(), 'semaphore');
    });

    it('detects Wercker', () => {
      process.env.WERCKER = 'true';

      assert.strictEqual(getCIProvider(), 'wercker');
    });

    it('detects Bitbucket Pipelines', () => {
      process.env.BITBUCKET_BUILD_NUMBER = '123';

      assert.strictEqual(getCIProvider(), 'bitbucket-pipelines');
    });

    it('detects Heroku CI', () => {
      process.env.HEROKU_TEST_RUN_ID = 'run-123';

      assert.strictEqual(getCIProvider(), 'heroku-ci');
    });
  });
});
