import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalTDDProvider } from '../../claude-plugin/mcp/vizzly-server/local-tdd-provider.js';
import { join } from 'path';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

describe('LocalTDDProvider', () => {
  let provider;
  let testDir;
  let vizzlyDir;

  beforeEach(async () => {
    provider = new LocalTDDProvider();
    testDir = await mkdtemp(join(tmpdir(), 'vizzly-test-'));
    vizzlyDir = join(testDir, '.vizzly');

    // Create basic .vizzly structure
    await mkdir(vizzlyDir, { recursive: true });
    await mkdir(join(vizzlyDir, 'baselines'), { recursive: true });
    await mkdir(join(vizzlyDir, 'current'), { recursive: true });
    await mkdir(join(vizzlyDir, 'diffs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getTDDStatus', () => {
    beforeEach(async () => {
      // Create mock server.json
      let serverInfo = {
        port: 47392,
        pid: process.pid,
        started: new Date().toISOString(),
      };
      await writeFile(
        join(vizzlyDir, 'server.json'),
        JSON.stringify(serverInfo, null, 2)
      );

      // Create mock report-data.json
      let reportData = {
        comparisons: [
          {
            id: 'test1',
            name: 'screenshot1',
            status: 'failed',
            diffPercentage: 5.2,
            threshold: 0.1,
            current: '/images/current/screenshot1.png',
            baseline: '/images/baselines/screenshot1.png',
            diff: '/images/diffs/screenshot1.png',
          },
          {
            id: 'test2',
            name: 'screenshot2',
            status: 'new',
            diffPercentage: 0,
            threshold: 0.1,
            current: '/images/current/screenshot2.png',
            baseline: null,
            diff: null,
          },
          {
            id: 'test3',
            name: 'screenshot3',
            status: 'passed',
            diffPercentage: 0,
            threshold: 0.1,
            current: '/images/current/screenshot3.png',
            baseline: '/images/baselines/screenshot3.png',
            diff: null,
          },
        ],
      };
      await writeFile(
        join(vizzlyDir, 'report-data.json'),
        JSON.stringify(reportData, null, 2)
      );
    });

    it('returns summary mode by default (no comparison details)', async () => {
      let status = await provider.getTDDStatus(testDir);

      expect(status.error).toBeUndefined();
      expect(status.summary).toEqual({
        total: 3,
        failed: 1,
        new: 1,
        passed: 1,
      });
      expect(status.failedComparisons).toEqual(['screenshot1']);
      expect(status.newScreenshots).toEqual(['screenshot2']);
      // Should NOT include full comparison details in summary mode
      expect(status.comparisons).toBeUndefined();
    });

    it('returns all comparisons when statusFilter is "all"', async () => {
      let status = await provider.getTDDStatus(testDir, 'all');

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(3);
      expect(status.comparisons[0]).toMatchObject({
        name: 'screenshot1',
        status: 'failed',
        diffPercentage: 5.2,
        threshold: 0.1,
        hasDiff: true,
      });
      expect(status.comparisons[0].currentPath).toContain(
        '.vizzly/current/screenshot1.png'
      );
    });

    it('filters comparisons by "failed" status', async () => {
      let status = await provider.getTDDStatus(testDir, 'failed');

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(1);
      expect(status.comparisons[0]).toMatchObject({
        name: 'screenshot1',
        status: 'failed',
      });
    });

    it('filters comparisons by "new" status', async () => {
      let status = await provider.getTDDStatus(testDir, 'new');

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(1);
      expect(status.comparisons[0]).toMatchObject({
        name: 'screenshot2',
        status: 'new',
      });
    });

    it('filters comparisons by "passed" status', async () => {
      let status = await provider.getTDDStatus(testDir, 'passed');

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(1);
      expect(status.comparisons[0]).toMatchObject({
        name: 'screenshot3',
        status: 'passed',
      });
    });

    it('limits number of comparisons returned', async () => {
      let status = await provider.getTDDStatus(testDir, 'all', 2);

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(2);
      expect(status.summary.total).toBe(3); // Summary shows total count
    });

    it('combines statusFilter and limit', async () => {
      // Add more failed comparisons to test
      let reportData = {
        comparisons: [
          {
            id: 'test1',
            name: 'screenshot1',
            status: 'failed',
            diffPercentage: 5.2,
            threshold: 0.1,
            current: '/images/current/screenshot1.png',
            baseline: '/images/baselines/screenshot1.png',
            diff: '/images/diffs/screenshot1.png',
          },
          {
            id: 'test2',
            name: 'screenshot2',
            status: 'failed',
            diffPercentage: 3.1,
            threshold: 0.1,
            current: '/images/current/screenshot2.png',
            baseline: '/images/baselines/screenshot2.png',
            diff: '/images/diffs/screenshot2.png',
          },
          {
            id: 'test3',
            name: 'screenshot3',
            status: 'failed',
            diffPercentage: 1.5,
            threshold: 0.1,
            current: '/images/current/screenshot3.png',
            baseline: '/images/baselines/screenshot3.png',
            diff: '/images/diffs/screenshot3.png',
          },
          {
            id: 'test4',
            name: 'screenshot4',
            status: 'passed',
            diffPercentage: 0,
            threshold: 0.1,
            current: '/images/current/screenshot4.png',
            baseline: '/images/baselines/screenshot4.png',
            diff: null,
          },
        ],
      };
      await writeFile(
        join(vizzlyDir, 'report-data.json'),
        JSON.stringify(reportData, null, 2)
      );

      let status = await provider.getTDDStatus(testDir, 'failed', 2);

      expect(status.error).toBeUndefined();
      expect(status.comparisons).toHaveLength(2);
      expect(status.comparisons.every(c => c.status === 'failed')).toBe(true);
    });

    it('returns error when .vizzly directory not found', async () => {
      let nonExistentDir = join(tmpdir(), 'non-existent-' + Date.now());
      let status = await provider.getTDDStatus(nonExistentDir);

      expect(status.error).toBe('No .vizzly directory found');
    });

    it('converts report paths to filesystem paths correctly', async () => {
      let status = await provider.getTDDStatus(testDir, 'failed');

      expect(status.comparisons[0].currentPath).toBe(
        join(vizzlyDir, 'current', 'screenshot1.png')
      );
      expect(status.comparisons[0].baselinePath).toBe(
        join(vizzlyDir, 'baselines', 'screenshot1.png')
      );
      expect(status.comparisons[0].diffPath).toBe(
        join(vizzlyDir, 'diffs', 'screenshot1.png')
      );
    });
  });

  describe('getComparisonDetails', () => {
    beforeEach(async () => {
      // Create mock server.json
      let serverInfo = {
        port: 47392,
        pid: process.pid,
        started: new Date().toISOString(),
      };
      await writeFile(
        join(vizzlyDir, 'server.json'),
        JSON.stringify(serverInfo, null, 2)
      );

      // Create mock report-data.json
      let reportData = {
        comparisons: [
          {
            id: 'test1',
            name: 'screenshot1',
            status: 'failed',
            diffPercentage: 5.2,
            threshold: 0.1,
            current: '/images/current/screenshot1.png',
            baseline: '/images/baselines/screenshot1.png',
            diff: '/images/diffs/screenshot1.png',
          },
        ],
      };
      await writeFile(
        join(vizzlyDir, 'report-data.json'),
        JSON.stringify(reportData, null, 2)
      );
    });

    it('returns detailed comparison information', async () => {
      let details = await provider.getComparisonDetails('screenshot1', testDir);

      expect(details.error).toBeUndefined();
      expect(details).toMatchObject({
        name: 'screenshot1',
        status: 'failed',
        diffPercentage: 5.2,
        threshold: 0.1,
        hasDiff: true,
      });
    });

    it('returns error when screenshot not found', async () => {
      let details = await provider.getComparisonDetails('nonexistent', testDir);

      expect(details.error).toBe('Screenshot "nonexistent" not found');
    });
  });

  describe('acceptBaseline', () => {
    beforeEach(async () => {
      // Create mock server.json
      let serverInfo = {
        port: 47392,
        pid: process.pid,
        started: new Date().toISOString(),
      };
      await writeFile(
        join(vizzlyDir, 'server.json'),
        JSON.stringify(serverInfo, null, 2)
      );

      // Create mock current screenshot
      let mockImageBuffer = Buffer.from('fake-png-data');
      await writeFile(
        join(vizzlyDir, 'current', 'screenshot1.png'),
        mockImageBuffer
      );
    });

    it('copies current screenshot to baselines directory', async () => {
      let result = await provider.acceptBaseline('screenshot1', testDir);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Accepted screenshot1 as new baseline');
    });

    it('returns error when .vizzly directory not found', async () => {
      let nonExistentDir = join(tmpdir(), 'non-existent-' + Date.now());

      await expect(
        provider.acceptBaseline('screenshot1', nonExistentDir)
      ).rejects.toThrow('No .vizzly directory found');
    });
  });
});
