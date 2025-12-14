/**
 * Test for baseline download cleanup (Issue #112)
 * Tests that when downloading baselines, local state is always cleared
 * This handles signature property changes, build switches, and stale state
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { createTDDService } from '../../src/tdd/tdd-service.js';

describe('TDD Service - Baseline Download Cleanup (#112)', () => {
  let baseDir;
  let testDir;
  let tddService;
  let mockFetch;
  let testCounter = 0;

  beforeAll(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'vizzly-baseline-cleanup-'));
  });

  afterAll(() => {
    try {
      rmSync(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    testCounter++;
    testDir = join(baseDir, `test-${testCounter}`);
    mkdirSync(testDir, { recursive: true });

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  test('should always clear current/diffs/metadata when downloading baselines', async () => {
    // Setup: Create .vizzly with existing state
    let vizzlyDir = join(testDir, '.vizzly');
    let baselinesDir = join(vizzlyDir, 'baselines');
    let currentDir = join(vizzlyDir, 'current');
    let diffsDir = join(vizzlyDir, 'diffs');
    mkdirSync(baselinesDir, { recursive: true });
    mkdirSync(currentDir, { recursive: true });
    mkdirSync(diffsDir, { recursive: true });

    // Create old baseline metadata
    let oldMetadata = {
      buildId: 'old-build-123',
      buildName: 'Old Build',
      environment: 'test',
      branch: 'main',
      threshold: 0.1,
      signatureProperties: ['old-prop'],
      createdAt: new Date().toISOString(),
      screenshots: [
        {
          name: 'VBtn-dark',
          originalName: 'VBtn dark',
          filename: 'VBtn-dark_f3e8a0928dbd.png',
          sha256: 'old-sha',
        },
      ],
    };

    writeFileSync(
      join(baselinesDir, 'metadata.json'),
      JSON.stringify(oldMetadata, null, 2)
    );

    // Create baseline-metadata.json
    writeFileSync(
      join(vizzlyDir, 'baseline-metadata.json'),
      JSON.stringify({ buildId: 'old-build-123' })
    );

    // Create fake state files that should be cleared
    writeFileSync(join(currentDir, 'current-screenshot.png'), 'current data');
    writeFileSync(join(diffsDir, 'diff-screenshot.png'), 'diff data');

    // Verify old state exists
    expect(existsSync(join(currentDir, 'current-screenshot.png'))).toBe(true);
    expect(existsSync(join(diffsDir, 'diff-screenshot.png'))).toBe(true);
    expect(existsSync(join(vizzlyDir, 'baseline-metadata.json'))).toBe(true);

    // Mock API response with NEW signature properties
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        build: {
          id: 'new-build-456',
          name: 'New Build',
          status: 'completed',
          branch: 'main',
          commit_sha: 'abc123',
        },
        signatureProperties: ['theme', 'device'], // Different properties
        screenshots: [
          {
            id: 'screenshot-1',
            name: 'VBtn dark',
            sha256: 'new-sha',
            filename: 'VBtn-dark_9a31f257b078.png',
            original_url: 'https://example.com/screenshot.png',
            viewport_width: 1265,
            browser: null,
          },
        ],
      }),
    });

    // Mock the image download
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Mock hotspot fetch (will fail but that's ok)
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    // Create TDD service and download baselines
    tddService = createTDDService(
      {
        apiUrl: 'https://test.example.com',
        apiKey: 'test-token',
        comparison: { threshold: 0.1 },
      },
      { workingDir: testDir }
    );

    await tddService.downloadBaselines('test', 'main', 'new-build-456');

    // Current and diffs directories should be EMPTY
    expect(existsSync(join(currentDir, 'current-screenshot.png'))).toBe(false);
    expect(existsSync(join(diffsDir, 'diff-screenshot.png'))).toBe(false);

    // baseline-metadata.json should be regenerated with new build info
    expect(existsSync(join(vizzlyDir, 'baseline-metadata.json'))).toBe(true);
    const baselineMetadata = JSON.parse(
      readFileSync(join(vizzlyDir, 'baseline-metadata.json'), 'utf8')
    );
    expect(baselineMetadata.buildId).toBe('new-build-456');

    // New baseline should exist
    let newBaselineFile = join(baselinesDir, 'VBtn-dark_9a31f257b078.png');
    expect(existsSync(newBaselineFile)).toBe(true);

    // Baseline metadata should have NEW signature properties
    let newMetadata = JSON.parse(
      readFileSync(join(baselinesDir, 'metadata.json'), 'utf8')
    );
    expect(newMetadata.signatureProperties).toEqual(['theme', 'device']);
  });

  test('should clear state even when signature properties are the same', async () => {
    // Setup: Create .vizzly with existing state
    let vizzlyDir = join(testDir, '.vizzly');
    let baselinesDir = join(vizzlyDir, 'baselines');
    let currentDir = join(vizzlyDir, 'current');
    let diffsDir = join(vizzlyDir, 'diffs');
    mkdirSync(baselinesDir, { recursive: true });
    mkdirSync(currentDir, { recursive: true });
    mkdirSync(diffsDir, { recursive: true });

    // Create old metadata with SAME properties
    let oldMetadata = {
      buildId: 'build-123',
      buildName: 'Build',
      environment: 'test',
      branch: 'main',
      threshold: 0.1,
      signatureProperties: ['theme', 'device'], // SAME as what API will return
      createdAt: new Date().toISOString(),
      screenshots: [
        {
          name: 'VBtn-dark',
          filename: 'VBtn-dark_9a31f257b078.png',
          sha256: 'sha256-123',
        },
      ],
    };

    writeFileSync(
      join(baselinesDir, 'metadata.json'),
      JSON.stringify(oldMetadata, null, 2)
    );

    // Create fake state files
    writeFileSync(join(currentDir, 'current-screenshot.png'), 'current data');
    writeFileSync(join(diffsDir, 'diff-screenshot.png'), 'diff data');
    writeFileSync(
      join(vizzlyDir, 'baseline-metadata.json'),
      JSON.stringify({ buildId: 'build-123' })
    );

    // Verify state exists
    expect(existsSync(join(currentDir, 'current-screenshot.png'))).toBe(true);
    expect(existsSync(join(diffsDir, 'diff-screenshot.png'))).toBe(true);
    expect(existsSync(join(vizzlyDir, 'baseline-metadata.json'))).toBe(true);

    // Mock API response with SAME signature properties
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        build: {
          id: 'build-456',
          name: 'Build',
          status: 'completed',
          branch: 'main',
          commit_sha: 'abc123',
        },
        signatureProperties: ['theme', 'device'], // SAME!
        screenshots: [
          {
            id: 'screenshot-1',
            name: 'VBtn dark',
            sha256: 'sha256-123',
            filename: 'VBtn-dark_9a31f257b078.png',
            original_url: 'https://example.com/screenshot.png',
            viewport_width: 1265,
          },
        ],
      }),
    });

    // Mock the image download
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    // Mock hotspot fetch (will fail but that's ok)
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    // Create TDD service and download baselines
    tddService = createTDDService(
      {
        apiUrl: 'https://test.example.com',
        apiKey: 'test-token',
        comparison: { threshold: 0.1 },
      },
      { workingDir: testDir }
    );

    await tddService.downloadBaselines('test', 'main', 'build-456');

    // State should STILL be cleared even though properties didn't change
    expect(existsSync(join(currentDir, 'current-screenshot.png'))).toBe(false);
    expect(existsSync(join(diffsDir, 'diff-screenshot.png'))).toBe(false);

    // baseline-metadata.json should be regenerated
    expect(existsSync(join(vizzlyDir, 'baseline-metadata.json'))).toBe(true);
  });
});
