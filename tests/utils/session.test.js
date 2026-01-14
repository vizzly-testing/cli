import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  clearSession,
  formatSessionAge,
  getSessionPath,
  readSession,
  writeSession,
} from '../../src/utils/session.js';

describe('session', () => {
  let testDir;

  beforeEach(() => {
    testDir = join(tmpdir(), `vizzly-session-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('getSessionPath', () => {
    it('returns path within .vizzly directory', () => {
      let path = getSessionPath('/some/project');
      assert.strictEqual(path, '/some/project/.vizzly/session.json');
    });
  });

  describe('writeSession', () => {
    it('creates session file with build context', () => {
      writeSession(
        { buildId: 'build-123', branch: 'main', commit: 'abc123' },
        { cwd: testDir }
      );

      let sessionPath = getSessionPath(testDir);
      assert.ok(existsSync(sessionPath), 'Session file should exist');
    });

    it('creates .vizzly directory if it does not exist', () => {
      let newDir = join(testDir, 'subdir');
      mkdirSync(newDir);

      writeSession({ buildId: 'build-123' }, { cwd: newDir });

      assert.ok(
        existsSync(join(newDir, '.vizzly')),
        '.vizzly directory should exist'
      );
    });

    it('writes to GITHUB_ENV when available', () => {
      let githubEnvPath = join(testDir, 'github-env');
      writeFileSync(githubEnvPath, '');

      writeSession(
        { buildId: 'build-456' },
        { cwd: testDir, env: { GITHUB_ENV: githubEnvPath } }
      );

      let envContent = readFileSync(githubEnvPath, 'utf-8');
      assert.ok(
        envContent.includes('VIZZLY_BUILD_ID=build-456'),
        'Should write build ID to GITHUB_ENV'
      );
    });

    it('writes to GITHUB_OUTPUT when available', () => {
      let githubOutputPath = join(testDir, 'github-output');
      writeFileSync(githubOutputPath, '');

      writeSession(
        { buildId: 'build-789' },
        { cwd: testDir, env: { GITHUB_OUTPUT: githubOutputPath } }
      );

      let outputContent = readFileSync(githubOutputPath, 'utf-8');
      assert.ok(
        outputContent.includes('build-id=build-789'),
        'Should write build ID to GITHUB_OUTPUT'
      );
    });
  });

  describe('readSession', () => {
    it('returns null when no session file exists', () => {
      let session = readSession({ cwd: testDir });
      assert.strictEqual(session, null);
    });

    it('reads build ID from environment variable first', () => {
      // Create a session file with different build ID
      writeSession({ buildId: 'file-build' }, { cwd: testDir });

      // Environment variable should take precedence
      let session = readSession({
        cwd: testDir,
        env: { VIZZLY_BUILD_ID: 'env-build' },
      });

      assert.strictEqual(session.buildId, 'env-build');
      assert.strictEqual(session.source, 'environment');
    });

    it('reads from session file when env var not set', () => {
      writeSession(
        { buildId: 'file-build', branch: 'feature' },
        { cwd: testDir }
      );

      let session = readSession({ cwd: testDir, env: {} });

      assert.strictEqual(session.buildId, 'file-build');
      assert.strictEqual(session.branch, 'feature');
      assert.strictEqual(session.source, 'session_file');
    });

    it('marks session as expired when too old', () => {
      // Write session with old timestamp
      let sessionDir = join(testDir, '.vizzly');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, 'session.json'),
        JSON.stringify({
          buildId: 'old-build',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        })
      );

      let session = readSession({
        cwd: testDir,
        env: {},
        maxAgeMs: 60 * 60 * 1000, // 1 hour
      });

      assert.strictEqual(session.buildId, 'old-build');
      assert.strictEqual(session.expired, true);
    });

    it('detects branch mismatch', () => {
      writeSession({ buildId: 'build-123', branch: 'main' }, { cwd: testDir });

      let session = readSession({
        cwd: testDir,
        currentBranch: 'feature-branch',
        env: {},
      });

      assert.strictEqual(session.branchMismatch, true);
    });

    it('no branch mismatch when branches match', () => {
      writeSession({ buildId: 'build-123', branch: 'main' }, { cwd: testDir });

      let session = readSession({
        cwd: testDir,
        currentBranch: 'main',
        env: {},
      });

      assert.strictEqual(session.branchMismatch, false);
    });
  });

  describe('clearSession', () => {
    it('clears existing session file', () => {
      writeSession({ buildId: 'build-123' }, { cwd: testDir });
      clearSession({ cwd: testDir });

      let session = readSession({ cwd: testDir, env: {} });
      assert.strictEqual(session, null);
    });

    it('does not error when no session exists', () => {
      // Should not throw
      clearSession({ cwd: testDir });
    });
  });

  describe('formatSessionAge', () => {
    it('formats seconds', () => {
      assert.strictEqual(formatSessionAge(30 * 1000), '30s ago');
    });

    it('formats minutes', () => {
      assert.strictEqual(formatSessionAge(5 * 60 * 1000), '5m ago');
    });

    it('formats hours and minutes', () => {
      assert.strictEqual(formatSessionAge(90 * 60 * 1000), '1h 30m ago');
    });
  });
});
