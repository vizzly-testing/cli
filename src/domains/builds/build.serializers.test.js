import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildBuildPayload } from './build.serializers.js';

describe('buildBuildPayload', () => {
  it('includes commit author fields only when present', () => {
    let base = { name: 'Build', branch: 'main', environment: 'test' };

    let withAuthor = buildBuildPayload({
      ...base,
      commit_author_name: 'Ada Lovelace',
      commit_author_email: 'ada@example.com',
    });
    let withoutAuthor = buildBuildPayload({
      ...base,
      commit_author_name: null,
      commit_author_email: undefined,
    });

    assert.strictEqual(withAuthor.commit_author_name, 'Ada Lovelace');
    assert.strictEqual(withAuthor.commit_author_email, 'ada@example.com');
    assert.deepStrictEqual(withoutAuthor, base);
  });

  it('builds basic payload with name, branch, environment', () => {
    let result = buildBuildPayload({
      name: 'My Build',
      branch: 'main',
      environment: 'test',
    });

    assert.deepStrictEqual(result, {
      name: 'My Build',
      branch: 'main',
      environment: 'test',
    });
  });

  it('uses buildName as fallback for name', () => {
    let result = buildBuildPayload({
      buildName: 'Build Name',
      branch: 'main',
      environment: 'test',
    });

    assert.strictEqual(result.name, 'Build Name');
  });

  it('includes commit_sha when commit provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      commit: 'abc123',
    });

    assert.strictEqual(result.commit_sha, 'abc123');
  });

  it('uses commit_sha field directly', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      commit_sha: 'def456',
    });

    assert.strictEqual(result.commit_sha, 'def456');
  });

  it('includes commit_message when message provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      message: 'fix: bug',
    });

    assert.strictEqual(result.commit_message, 'fix: bug');
  });

  it('includes github_pull_request_number when pullRequestNumber provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      pullRequestNumber: 123,
    });

    assert.strictEqual(result.github_pull_request_number, 123);
  });

  it('includes parallel_id when parallelId provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      parallelId: 'parallel-abc',
    });

    assert.strictEqual(result.parallel_id, 'parallel-abc');
  });

  it('includes threshold when provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      threshold: 2.5,
    });

    assert.strictEqual(result.threshold, 2.5);
  });

  it('includes metadata when provided', () => {
    let result = buildBuildPayload({
      name: 'Build',
      branch: 'main',
      environment: 'test',
      metadata: { ci: 'github' },
    });

    assert.deepStrictEqual(result.metadata, { ci: 'github' });
  });
});
