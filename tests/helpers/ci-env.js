/**
 * Shared CI environment isolation for tests that touch CI detection.
 *
 * Usage:
 *   let ciEnv = useCleanCIEnv();
 *   process.env.GITHUB_EVENT_PATH = ciEnv.createEventFile({ ... });
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'node:test';
import { resetGitHubEventCache } from '../../src/utils/ci-env.js';

// CI variables read by src/utils/ci-env.js, cleared so host CI can't leak in
export let CI_ENV_VARS = [
  'VIZZLY_BRANCH',
  'VIZZLY_COMMIT_SHA',
  'VIZZLY_COMMIT_MESSAGE',
  'VIZZLY_COMMIT_AUTHOR_NAME',
  'VIZZLY_COMMIT_AUTHOR_EMAIL',
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
  'CI_COMMIT_AUTHOR',
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
  'GITHUB_EVENT_PATH',
];

/**
 * Clear CI env vars and the GitHub event cache around each test
 * @returns {{ createEventFile: (payload: Object|string) => string }}
 */
export function useCleanCIEnv() {
  let originalEnv;
  let tempDirs = [];

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDirs = [];
    for (let name of CI_ENV_VARS) {
      delete process.env[name];
    }
    resetGitHubEventCache();
  });

  afterEach(() => {
    for (let dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    process.env = originalEnv;
    resetGitHubEventCache();
  });

  return {
    /**
     * Write a GitHub Actions event payload to a temp file
     * @param {Object|string} payload - Event payload (strings written as-is)
     * @returns {string} Path to the event file
     */
    createEventFile(payload) {
      let dir = mkdtempSync(join(tmpdir(), 'vizzly-event-'));
      tempDirs.push(dir);
      let eventPath = join(dir, 'event.json');
      writeFileSync(
        eventPath,
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      );
      return eventPath;
    },
  };
}
