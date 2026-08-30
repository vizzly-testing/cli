import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuildInfo,
  createBuildUrl,
  createComparisonStats,
  createStatusData,
  createStatusSuggestedCommands,
  getBuildReviewState,
  getComparisonStatus,
  getProcessingStatus,
  normalizeBuildStatus,
  shouldFailStatus,
  validateStatusOptions,
} from '../../src/commands/status.js';

function createBuild(overrides = {}) {
  return {
    id: 'build-123',
    status: 'completed',
    name: 'Homepage',
    created_at: '2026-05-18T12:00:00.000Z',
    updated_at: '2026-05-18T12:01:00.000Z',
    completed_at: '2026-05-18T12:02:00.000Z',
    environment: 'ci',
    branch: 'main',
    commit_sha: 'abcdef1234567890',
    commit_message: 'Update homepage',
    screenshot_count: 3,
    total_comparisons: 3,
    new_comparisons: 1,
    changed_comparisons: 1,
    identical_comparisons: 1,
    execution_time_ms: 4250,
    is_baseline: false,
    user_agent: 'vizzly-test',
    project_id: 'project-123',
    failed_jobs: 0,
    ...overrides,
  };
}

function createStatusBundle(overrides = {}) {
  return {
    resource: 'build_status',
    schema_version: 1,
    conclusion: 'review_required',
    processing: {
      total: 3,
      completed: 3,
      failed: 0,
      active: 0,
      pending: 0,
    },
    comparisons: { total: 3, new: 1, changed: 1, identical: 1 },
    review: { pending: 2, approved: 1, rejected: 0, auto_approved: 0 },
    scope: {
      organization: { id: 'org-1', slug: 'acme' },
      project: { id: 'project-123', slug: 'web' },
    },
    links: { web: 'https://app.test/acme/web/builds/build-123' },
    ...overrides,
    build: {
      id: 'build-123',
      status: 'completed',
      name: 'Homepage',
      created_at: '2026-05-18T12:00:00.000Z',
      updated_at: '2026-05-18T12:01:00.000Z',
      completed_at: '2026-05-18T12:02:00.000Z',
      environment: 'ci',
      branch: 'main',
      commit_sha: 'abcdef1234567890',
      commit_message: 'Update homepage',
      visual_review: { state: 'pending' },
      execution_time_ms: 4250,
      is_baseline: false,
      user_agent: 'vizzly-test',
      ...overrides.build,
    },
  };
}

describe('validateStatusOptions', () => {
  it('accepts a build ID', () => {
    assert.deepStrictEqual(validateStatusOptions('build-123'), []);
  });

  it('rejects missing and whitespace-only build IDs', () => {
    assert.deepStrictEqual(validateStatusOptions(''), ['Build ID is required']);
    assert.deepStrictEqual(validateStatusOptions('   '), [
      'Build ID is required',
    ]);
  });
});

describe('status data', () => {
  it('reads the build from the status response', () => {
    let build = createBuild();

    assert.strictEqual(normalizeBuildStatus({ build }), build);
    assert.strictEqual(normalizeBuildStatus(build), undefined);
  });

  it('preserves processing, review, and preview facts in JSON data', () => {
    let data = createStatusData(createStatusBundle(), {
      preview_url: 'https://preview.test',
      status: 'ready',
      file_count: 12,
      expires_at: '2026-05-19T12:00:00.000Z',
    });

    assert.strictEqual(data.resource, 'build_status');
    assert.strictEqual(data.buildId, 'build-123');
    assert.deepStrictEqual(data.visual_review, { state: 'pending' });
    assert.deepStrictEqual(data.processing, {
      total: 3,
      completed: 3,
      failed: 0,
      active: 0,
      pending: 0,
    });
    assert.deepStrictEqual(data.preview, {
      url: 'https://preview.test',
      status: 'ready',
      fileCount: 12,
      expiresAt: '2026-05-19T12:00:00.000Z',
    });
  });

  it('does not invent missing status facts', () => {
    let data = createStatusData({
      build: {
        id: 'build-without-review',
        status: 'processing',
      },
    });

    assert.strictEqual(data.visual_review, null);
    assert.strictEqual(data.processing, undefined);
    assert.strictEqual(data.screenshotsTotal, undefined);
    assert.strictEqual(data.comparisons, undefined);
  });

  it('keeps processing facts separate from review facts', () => {
    let statusBundle = createStatusBundle();
    let processing = createStatusBundle({
      processing: {
        total: 3,
        completed: 2,
        failed: 0,
        active: 1,
      },
    });

    assert.strictEqual(getBuildReviewState(statusBundle), 'pending');
    assert.deepStrictEqual(getProcessingStatus(processing), {
      total: 3,
      completed: 2,
      failed: 0,
      active: 1,
    });
    assert.deepStrictEqual(getComparisonStatus(statusBundle), {
      total: 3,
      new: 1,
      changed: 1,
      identical: 1,
    });
  });
});

describe('status display decisions', () => {
  it('creates human build info and comparison stats', () => {
    let colors = {
      brand: {
        success: value => value,
        danger: value => value,
        info: value => value,
        warning: value => value,
        textMuted: value => value,
      },
    };

    assert.deepStrictEqual(createBuildInfo(createBuild()), {
      Name: 'Homepage',
      Status: 'COMPLETED',
      Environment: 'ci',
      Branch: 'main',
      Commit: 'abcdef12 - Update homepage',
    });
    assert.strictEqual(
      createComparisonStats(createStatusBundle(), colors),
      '1 new · 1 changed · 1 identical'
    );
  });

  it('creates scoped build URLs from the status response', () => {
    assert.strictEqual(
      createBuildUrl('https://app.test/api', createBuild(), {
        organization: { slug: 'acme' },
        project: { slug: 'web' },
      }),
      'https://app.test/acme/web/builds/build-123'
    );
    assert.strictEqual(
      createBuildUrl('https://app.test/api', createBuild()),
      null
    );
    assert.strictEqual(createBuildUrl(null, createBuild()), null);
  });

  it('fails only for processing failures, not review-required builds', () => {
    assert.strictEqual(
      shouldFailStatus(createStatusBundle({ build: { status: 'failed' } })),
      true
    );
    assert.strictEqual(
      shouldFailStatus(
        createStatusBundle({ processing: { total: 3, failed: 1 } })
      ),
      true
    );
    assert.strictEqual(shouldFailStatus(createStatusBundle()), false);
    assert.strictEqual(
      shouldFailStatus(createStatusBundle({ conclusion: 'processing_failed' })),
      true
    );
    assert.strictEqual(
      shouldFailStatus(createStatusBundle({ conclusion: 'rejected' })),
      false
    );
  });

  it('creates executable visual-context follow-up commands', () => {
    assert.deepStrictEqual(createStatusSuggestedCommands(createBuild()), [
      {
        label: 'Inspect build context',
        command: 'vizzly --json context build build-123 --agent --source cloud',
      },
      {
        label: 'List comparisons',
        command: 'vizzly --json comparisons --build build-123',
      },
    ]);
  });
});
