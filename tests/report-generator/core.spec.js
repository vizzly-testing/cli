import { describe, expect, it } from 'vitest';
import {
  BUNDLE_FILENAME,
  buildBundleDestPaths,
  buildBundleSourcePaths,
  buildFallbackHtmlContent,
  buildHtmlContent,
  buildReportDir,
  buildReportPath,
  CSS_FILENAME,
  DEFAULT_REPORT_DIR_NAME,
  generateFallbackTemplate,
  generateMainTemplate,
  INDEX_FILENAME,
  serializeForHtml,
  validateBundlesExist,
  validateReportData,
} from '../../src/report-generator/core.js';

// ============================================================================
// Tests
// ============================================================================

describe('report-generator/core', () => {
  describe('constants', () => {
    it('exports expected constants', () => {
      expect(DEFAULT_REPORT_DIR_NAME).toBe('report');
      expect(BUNDLE_FILENAME).toBe('reporter-bundle.js');
      expect(CSS_FILENAME).toBe('reporter-bundle.css');
      expect(INDEX_FILENAME).toBe('index.html');
    });
  });

  describe('buildReportDir', () => {
    it('builds correct path', () => {
      let result = buildReportDir('/home/user/project');
      expect(result).toBe('/home/user/project/.vizzly/report');
    });
  });

  describe('buildReportPath', () => {
    it('builds correct path', () => {
      let result = buildReportPath('/home/user/project/.vizzly/report');
      expect(result).toBe('/home/user/project/.vizzly/report/index.html');
    });
  });

  describe('buildBundleSourcePaths', () => {
    it('builds correct paths', () => {
      let result = buildBundleSourcePaths('/home/user/project');
      expect(result.bundlePath).toBe(
        '/home/user/project/dist/reporter/reporter-bundle.iife.js'
      );
      expect(result.cssPath).toBe(
        '/home/user/project/dist/reporter/reporter-bundle.css'
      );
    });
  });

  describe('buildBundleDestPaths', () => {
    it('builds correct paths', () => {
      let result = buildBundleDestPaths('/home/user/project/.vizzly/report');
      expect(result.bundleDest).toBe(
        '/home/user/project/.vizzly/report/reporter-bundle.js'
      );
      expect(result.cssDest).toBe(
        '/home/user/project/.vizzly/report/reporter-bundle.css'
      );
    });
  });

  describe('validateReportData', () => {
    it('returns valid for object', () => {
      let result = validateReportData({ summary: {} });
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid for null', () => {
      let result = validateReportData(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid report data provided');
    });

    it('returns invalid for undefined', () => {
      let result = validateReportData(undefined);
      expect(result.valid).toBe(false);
    });

    it('returns invalid for non-object', () => {
      let result = validateReportData('string');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateBundlesExist', () => {
    it('returns valid when both exist', () => {
      let result = validateBundlesExist(true, true);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it('returns invalid when bundle missing', () => {
      let result = validateBundlesExist(false, true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Reporter bundles not found');
    });

    it('returns invalid when css missing', () => {
      let result = validateBundlesExist(true, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Reporter bundles not found');
    });

    it('returns invalid when both missing', () => {
      let result = validateBundlesExist(false, false);
      expect(result.valid).toBe(false);
    });
  });

  describe('serializeForHtml', () => {
    it('escapes < characters', () => {
      let result = serializeForHtml({ script: '<script>' });
      expect(result).toContain('\\u003c');
      expect(result).not.toContain('<script>');
    });

    it('escapes > characters', () => {
      let result = serializeForHtml({ tag: '</script>' });
      expect(result).toContain('\\u003e');
    });

    it('escapes & characters', () => {
      let result = serializeForHtml({ ampersand: 'a & b' });
      expect(result).toContain('\\u0026');
    });

    it('handles nested objects', () => {
      let result = serializeForHtml({
        nested: { value: '<test>' },
      });
      expect(result).toContain('\\u003c');
      expect(result).toContain('\\u003e');
    });
  });

  describe('generateMainTemplate', () => {
    it('includes serialized data', () => {
      let result = generateMainTemplate({
        serializedData: '{"test":true}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      expect(result).toContain('window.VIZZLY_REPORTER_DATA = {"test":true}');
    });

    it('includes timestamp', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      expect(result).toContain(
        'window.VIZZLY_REPORT_GENERATED_AT = "2024-01-01T00:00:00.000Z"'
      );
    });

    it('includes static mode flag', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      expect(result).toContain('window.VIZZLY_STATIC_MODE = true');
    });

    it('includes display date in title', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      expect(result).toContain('<title>Vizzly Dev Report - 1/1/2024');
    });

    it('links to CSS bundle', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      expect(result).toContain(
        '<link rel="stylesheet" href="./reporter-bundle.css">'
      );
    });

    it('links to JS bundle', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      expect(result).toContain('<script src="./reporter-bundle.js"></script>');
    });

    it('includes loading spinner', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      expect(result).toContain('class="reporter-loading"');
      expect(result).toContain('class="spinner"');
    });
  });

  describe('generateFallbackTemplate', () => {
    it('shows summary stats', () => {
      let result = generateFallbackTemplate({
        summary: { total: 10, passed: 8, failed: 2 },
        comparisons: [],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('>10</span>');
      expect(result).toContain('>8</span>');
      expect(result).toContain('>2</span>');
    });

    it('shows all passed message when no failures', () => {
      let result = generateFallbackTemplate({
        summary: { total: 5, passed: 5, failed: 0 },
        comparisons: [],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('All tests passed!');
    });

    it('shows failed comparisons list', () => {
      let result = generateFallbackTemplate({
        summary: { total: 2, passed: 1, failed: 1 },
        comparisons: [
          { name: 'test-1', status: 'passed' },
          { name: 'test-2', status: 'failed', diffPercentage: 5.5 },
        ],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('<h2>Failed Comparisons</h2>');
      expect(result).toContain('test-2 - 5.5% difference');
      expect(result).not.toContain('test-1 -');
    });

    it('handles missing diffPercentage', () => {
      let result = generateFallbackTemplate({
        summary: { total: 1, passed: 0, failed: 1 },
        comparisons: [{ name: 'test', status: 'failed' }],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('test - 0% difference');
    });

    it('includes warning about limited report', () => {
      let result = generateFallbackTemplate({
        summary: {},
        comparisons: [],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('Limited Report');
      expect(result).toContain('npm run build:reporter');
    });

    it('handles empty summary', () => {
      let result = generateFallbackTemplate({
        summary: {},
        comparisons: [],
        displayDate: '1/1/2024',
      });

      expect(result).toContain('>0</span>'); // defaults to 0
    });
  });

  describe('buildHtmlContent', () => {
    it('builds main HTML template', () => {
      let date = new Date('2024-01-01T12:00:00.000Z');
      let result = buildHtmlContent({ summary: { total: 5 } }, date);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('window.VIZZLY_REPORTER_DATA');
      expect(result).toContain('"total":5');
    });

    it('uses provided date for timestamp', () => {
      let date = new Date('2024-06-15T10:30:00.000Z');
      let result = buildHtmlContent({}, date);

      expect(result).toContain('2024-06-15T10:30:00.000Z');
    });
  });

  describe('buildFallbackHtmlContent', () => {
    it('builds fallback HTML template', () => {
      let date = new Date('2024-01-01T12:00:00.000Z');
      let result = buildFallbackHtmlContent(
        { summary: { total: 3 }, comparisons: [] },
        date
      );

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('Limited Report');
      expect(result).toContain('>3</span>');
    });

    it('handles missing summary and comparisons', () => {
      let date = new Date();
      let result = buildFallbackHtmlContent({}, date);

      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('>0</span>');
    });
  });
});
