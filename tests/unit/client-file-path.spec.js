import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

describe('Client SDK - File Path Support', () => {
  let testDir;
  let testImagePath;
  let vizzlyScreenshot;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create test directory and test image file
    testDir = join(
      process.cwd(),
      'tests',
      'fixtures',
      'temp-client-screenshots'
    );
    mkdirSync(testDir, { recursive: true });

    testImagePath = join(testDir, 'test-screenshot.png');
    const testImageBuffer = Buffer.from('fake-png-data');
    writeFileSync(testImagePath, testImageBuffer);

    // Mock server.json for auto-discovery
    const vizzlyDir = join(process.cwd(), '.vizzly');
    mkdirSync(vizzlyDir, { recursive: true });
    writeFileSync(
      join(vizzlyDir, 'server.json'),
      JSON.stringify({ port: 47392 })
    );

    // Import fresh module
    const clientModule = await import('../../src/client/index.js');
    vizzlyScreenshot = clientModule.vizzlyScreenshot;

    // Mock successful response
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  });

  afterEach(() => {
    // Clean up test files
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    try {
      rmSync(join(process.cwd(), '.vizzly'), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    vi.resetModules();
  });

  it('should accept file path and send path directly to server', async () => {
    await vizzlyScreenshot('test-from-file', testImagePath);

    // File paths are now sent directly to the server (not converted to base64)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:47392/screenshot',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(`"image":"${testImagePath}"`),
      })
    );
  });

  it('should accept relative file paths', async () => {
    const relativePath = join(
      'tests',
      'fixtures',
      'temp-client-screenshots',
      'test-screenshot.png'
    );

    await vizzlyScreenshot('test-relative-path', relativePath);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('should send non-existent file path to server (server validates)', async () => {
    const nonExistentPath = join(testDir, 'does-not-exist.png');

    // Client no longer validates file existence - sends path to server
    // Server will return error if file doesn't exist
    await vizzlyScreenshot('test-missing-file', nonExistentPath);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:47392/screenshot',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(`"image":"${nonExistentPath}"`),
      })
    );
  });

  it('should maintain backward compatibility with Buffer', async () => {
    const imageBuffer = Buffer.from('direct-buffer-data');

    await vizzlyScreenshot('test-buffer', imageBuffer);

    const expectedBase64 = imageBuffer.toString('base64');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        body: expect.stringContaining(`"image":"${expectedBase64}"`),
      })
    );
  });

  it('should pass options correctly with file path', async () => {
    await vizzlyScreenshot('test-with-options', testImagePath, {
      properties: {
        browser: 'chrome',
        viewport: { width: 1920, height: 1080 },
      },
      threshold: 5,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"browser":"chrome"'),
      })
    );
  });

  it('should handle simple filename with extension', async () => {
    // Create a test file in current directory
    const simpleFilePath = join(testDir, 'simple.png');
    writeFileSync(simpleFilePath, Buffer.from('simple-png'));

    await vizzlyScreenshot('test-simple-filename', 'simple.png');

    // Client sends the filename as-is, server will resolve it
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"image":"simple.png"'),
      })
    );
  });

  it('should handle Windows-style paths', async () => {
    const windowsPath = 'C:\\\\Users\\\\test\\\\screenshot.png';

    await vizzlyScreenshot('test-windows-path', windowsPath);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"image":"C:\\\\\\\\Users'),
      })
    );
  });

  it('should handle file:// URIs', async () => {
    const fileUri = `file://${testImagePath}`;

    await vizzlyScreenshot('test-file-uri', fileUri);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/screenshot'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(`"image":"file://${testImagePath}"`),
      })
    );
  });
});
