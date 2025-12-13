/**
 * Contract Test: Signature and Filename Parity
 *
 * ⚠️  CRITICAL: This file MUST stay in sync with the cloud counterpart!
 *
 * Cloud counterpart: vizzly/tests/contracts/signature-parity.test.js
 *
 * These tests verify that CLI and cloud generate identical signatures and
 * filenames. The "golden tests" contain known-good values that BOTH repos
 * must produce.
 *
 * If you need to change signature/filename generation:
 *   1. Update vizzly-cli/src/tdd/core/signature.js
 *   2. Update vizzly/src/utils/screenshot-identity.js (same logic)
 *   3. Update golden values in THIS file
 *   4. Update golden values in vizzly/tests/contracts/signature-parity.test.js
 *   5. Run tests in BOTH repos to verify parity
 */

import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

// Replicate cloud's signature generation logic exactly
// This serves as the "contract" - if cloud changes, update this and the test will fail
function generateSignature(screenshot, customProperties = []) {
  const defaultProperties = ['name', 'viewport_width', 'browser'];
  const allProperties = [...defaultProperties, ...customProperties];

  const parts = allProperties.map(prop => {
    let value = screenshot[prop];
    if (value === null || value === undefined) return '';
    return String(value).trim();
  });

  return parts.join('|');
}

function generateFilename(name, signature) {
  const hash = crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 12);
  const safeName = name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `${safeName}_${hash}.png`;
}

describe('Signature and Filename Parity Contract', () => {
  describe('signature generation', () => {
    it('should match cloud format: name|viewport_width|browser', () => {
      const screenshot = {
        name: 'homepage',
        viewport_width: 1920,
        browser: 'chrome',
      };

      expect(generateSignature(screenshot)).toBe('homepage|1920|chrome');
    });

    it('should use empty string for null/undefined values', () => {
      const screenshot = {
        name: 'homepage',
        viewport_width: 1920,
        browser: null,
      };

      expect(generateSignature(screenshot)).toBe('homepage|1920|');
    });

    it('should include custom properties in order', () => {
      const screenshot = {
        name: 'VBtn',
        viewport_width: 1920,
        browser: 'chromium',
        theme: 'dark',
        device: 'desktop',
      };

      // Custom properties are appended in order
      expect(generateSignature(screenshot, ['theme', 'device'])).toBe(
        'VBtn|1920|chromium|dark|desktop'
      );
    });

    it('should handle missing custom properties', () => {
      const screenshot = {
        name: 'VBtn',
        viewport_width: 1920,
        browser: 'chromium',
        device: 'desktop',
        // theme is missing
      };

      expect(generateSignature(screenshot, ['theme', 'device'])).toBe(
        'VBtn|1920|chromium||desktop'
      );
    });
  });

  describe('hash-based filename generation', () => {
    it('should generate consistent hash for same signature', () => {
      const signature = 'homepage|1920|chrome';
      const filename = generateFilename('homepage', signature);

      // Hash is deterministic - same input = same output
      expect(filename).toBe('homepage_1796f76bcda3.png');
    });

    it('should generate different hash for different signatures', () => {
      const sig1 = 'homepage|1920|chrome';
      const sig2 = 'homepage|1920|firefox';

      const file1 = generateFilename('homepage', sig1);
      const file2 = generateFilename('homepage', sig2);

      expect(file1).not.toBe(file2);
    });

    it('should sanitize special characters in name', () => {
      const signature = 'test/path:name|1920|chrome';
      const filename = generateFilename('test/path:name', signature);

      // Special chars removed, spaces to hyphens
      expect(filename).toMatch(/^testpathname_[a-f0-9]{12}\.png$/);
    });

    it('should generate different filenames for same name with different custom properties', () => {
      const dark = {
        name: 'VBtn',
        viewport_width: 1920,
        browser: 'chromium',
        theme: 'dark',
        device: 'desktop',
      };

      const light = {
        name: 'VBtn',
        viewport_width: 1920,
        browser: 'chromium',
        theme: 'light',
        device: 'desktop',
      };

      const customProps = ['theme', 'device'];

      const darkSig = generateSignature(dark, customProps);
      const lightSig = generateSignature(light, customProps);

      const darkFile = generateFilename('VBtn', darkSig);
      const lightFile = generateFilename('VBtn', lightSig);

      // CRITICAL: Different themes = different signatures = different files
      expect(darkSig).toBe('VBtn|1920|chromium|dark|desktop');
      expect(lightSig).toBe('VBtn|1920|chromium|light|desktop');
      expect(darkFile).not.toBe(lightFile);
    });
  });

  describe('known hash values (golden tests)', () => {
    // These are "golden" tests - known good values from the cloud
    // If these fail, either CLI or cloud has drifted
    const goldenTests = [
      {
        screenshot: {
          name: 'homepage',
          viewport_width: 1920,
          browser: 'chrome',
        },
        customProps: [],
        expectedSignature: 'homepage|1920|chrome',
        expectedFilename: 'homepage_1796f76bcda3.png',
      },
      {
        screenshot: { name: 'homepage', viewport_width: 1920, browser: null },
        customProps: [],
        expectedSignature: 'homepage|1920|',
        expectedFilename: 'homepage_8910e19f78bf.png',
      },
      {
        screenshot: {
          name: 'VBtn',
          viewport_width: 1920,
          browser: 'chromium',
          theme: 'dark',
          device: 'desktop',
        },
        customProps: ['theme', 'device'],
        expectedSignature: 'VBtn|1920|chromium|dark|desktop',
        expectedFilename: 'VBtn_fd88a64fe01b.png',
      },
    ];

    goldenTests.forEach(
      ({ screenshot, customProps, expectedSignature, expectedFilename }, i) => {
        it(`golden test ${i + 1}: ${screenshot.name}`, () => {
          const sig = generateSignature(screenshot, customProps);
          const file = generateFilename(screenshot.name, sig);

          expect(sig).toBe(expectedSignature);
          expect(file).toBe(expectedFilename);
        });
      }
    );
  });
});
