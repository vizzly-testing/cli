/**
 * Tests for signature generation pure functions
 *
 * These tests require NO mocking - they test pure functions with input/output assertions.
 * Contract tests in tests/contracts/signature-parity.spec.js verify cloud parity.
 */

import { describe, expect, it } from 'vitest';
import {
  generateScreenshotSignature,
  generateBaselineFilename,
  generateComparisonId,
} from '../../../src/tdd/core/signature.js';

describe('signature', () => {
  describe('generateScreenshotSignature', () => {
    it('generates signature with all default properties', () => {
      let result = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        browser: 'chrome',
      });

      expect(result).toBe('homepage|1920|chrome');
    });

    it('uses empty string for null values', () => {
      let result = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        browser: null,
      });

      expect(result).toBe('homepage|1920|');
    });

    it('uses empty string for undefined values', () => {
      let result = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        // browser is undefined
      });

      expect(result).toBe('homepage|1920|');
    });

    it('handles nested viewport.width format (SDK format)', () => {
      let result = generateScreenshotSignature('homepage', {
        viewport: { width: 1280 },
        browser: 'firefox',
      });

      expect(result).toBe('homepage|1280|firefox');
    });

    it('prefers top-level viewport_width over nested (backend format)', () => {
      let result = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        viewport: { width: 1280 }, // Should be ignored
        browser: 'chrome',
      });

      expect(result).toBe('homepage|1920|chrome');
    });

    it('includes custom properties in order', () => {
      let result = generateScreenshotSignature(
        'VBtn',
        {
          viewport_width: 1920,
          browser: 'chromium',
          theme: 'dark',
          device: 'desktop',
        },
        ['theme', 'device']
      );

      expect(result).toBe('VBtn|1920|chromium|dark|desktop');
    });

    it('uses empty string for missing custom properties', () => {
      let result = generateScreenshotSignature(
        'VBtn',
        {
          viewport_width: 1920,
          browser: 'chromium',
          device: 'desktop',
          // theme is missing
        },
        ['theme', 'device']
      );

      expect(result).toBe('VBtn|1920|chromium||desktop');
    });

    it('finds custom properties in metadata object', () => {
      let result = generateScreenshotSignature(
        'component',
        {
          viewport_width: 1920,
          browser: 'chrome',
          metadata: { theme: 'light' },
        },
        ['theme']
      );

      expect(result).toBe('component|1920|chrome|light');
    });

    it('finds custom properties in metadata.properties', () => {
      let result = generateScreenshotSignature(
        'component',
        {
          viewport_width: 1920,
          browser: 'chrome',
          metadata: { properties: { variant: 'outlined' } },
        },
        ['variant']
      );

      expect(result).toBe('component|1920|chrome|outlined');
    });

    it('trims whitespace from values', () => {
      let result = generateScreenshotSignature('  homepage  ', {
        viewport_width: 1920,
        browser: '  chrome  ',
      });

      expect(result).toBe('homepage|1920|chrome');
    });

    it('converts numbers to strings', () => {
      let result = generateScreenshotSignature(
        'test',
        {
          viewport_width: 1920,
          browser: 'chrome',
          count: 42,
        },
        ['count']
      );

      expect(result).toBe('test|1920|chrome|42');
    });

    it('handles empty properties object', () => {
      let result = generateScreenshotSignature('homepage', {});

      expect(result).toBe('homepage||');
    });

    it('handles no properties argument', () => {
      let result = generateScreenshotSignature('homepage');

      expect(result).toBe('homepage||');
    });
  });

  describe('generateBaselineFilename', () => {
    it('generates filename with hash', () => {
      let signature = 'homepage|1920|chrome';
      let filename = generateBaselineFilename('homepage', signature);

      // Hash is deterministic
      expect(filename).toBe('homepage_1796f76bcda3.png');
    });

    it('generates different hash for different signatures', () => {
      let file1 = generateBaselineFilename('homepage', 'homepage|1920|chrome');
      let file2 = generateBaselineFilename('homepage', 'homepage|1920|firefox');

      expect(file1).not.toBe(file2);
    });

    it('removes unsafe filesystem characters', () => {
      let filename = generateBaselineFilename(
        'test/path:name*?"<>|file',
        'test|1920|chrome'
      );

      // Should not contain /\:*?"<>|
      expect(filename).not.toMatch(/[/\\:*?"<>|]/);
      expect(filename).toMatch(/^testpathnamefile_[a-f0-9]{12}\.png$/);
    });

    it('converts spaces to hyphens', () => {
      let filename = generateBaselineFilename(
        'my screenshot name',
        'my screenshot name|1920|chrome'
      );

      expect(filename).toMatch(/^my-screenshot-name_[a-f0-9]{12}\.png$/);
    });

    it('limits name length to 50 characters', () => {
      let longName = 'a'.repeat(100);
      let filename = generateBaselineFilename(
        longName,
        `${longName}|1920|chrome`
      );

      // Name part should be max 50 chars, plus _hash.png
      let namePart = filename.split('_')[0];
      expect(namePart.length).toBe(50);
    });

    it('hash is always 12 characters', () => {
      let filename = generateBaselineFilename('test', 'test|1920|chrome');
      let hashPart = filename.match(/_([a-f0-9]+)\.png$/)?.[1];

      expect(hashPart).toHaveLength(12);
    });
  });

  describe('generateComparisonId', () => {
    it('generates 16-char hex ID', () => {
      let id = generateComparisonId('homepage|1920|chrome');

      expect(id).toMatch(/^[a-f0-9]{16}$/);
    });

    it('is deterministic for same signature', () => {
      let id1 = generateComparisonId('homepage|1920|chrome');
      let id2 = generateComparisonId('homepage|1920|chrome');

      expect(id1).toBe(id2);
    });

    it('differs for different signatures', () => {
      let id1 = generateComparisonId('homepage|1920|chrome');
      let id2 = generateComparisonId('homepage|1920|firefox');

      expect(id1).not.toBe(id2);
    });
  });

  describe('golden values (contract verification)', () => {
    // These values must match tests/contracts/signature-parity.spec.js
    // If they fail, CLI and cloud are out of sync

    it('homepage|1920|chrome -> homepage_1796f76bcda3.png', () => {
      let sig = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        browser: 'chrome',
      });
      let filename = generateBaselineFilename('homepage', sig);

      expect(sig).toBe('homepage|1920|chrome');
      expect(filename).toBe('homepage_1796f76bcda3.png');
    });

    it('homepage|1920| (null browser) -> homepage_8910e19f78bf.png', () => {
      let sig = generateScreenshotSignature('homepage', {
        viewport_width: 1920,
        browser: null,
      });
      let filename = generateBaselineFilename('homepage', sig);

      expect(sig).toBe('homepage|1920|');
      expect(filename).toBe('homepage_8910e19f78bf.png');
    });

    it('VBtn with custom properties -> VBtn_fd88a64fe01b.png', () => {
      let sig = generateScreenshotSignature(
        'VBtn',
        {
          viewport_width: 1920,
          browser: 'chromium',
          theme: 'dark',
          device: 'desktop',
        },
        ['theme', 'device']
      );
      let filename = generateBaselineFilename('VBtn', sig);

      expect(sig).toBe('VBtn|1920|chromium|dark|desktop');
      expect(filename).toBe('VBtn_fd88a64fe01b.png');
    });
  });
});
