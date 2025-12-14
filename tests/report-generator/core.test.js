import assert from 'node:assert';
import { describe, it } from 'node:test';
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

describe('report-generator/core', () => {
  describe('constants', () => {
    it('exports expected constants', () => {
      assert.strictEqual(DEFAULT_REPORT_DIR_NAME, 'report');
      assert.strictEqual(BUNDLE_FILENAME, 'reporter-bundle.js');
      assert.strictEqual(CSS_FILENAME, 'reporter-bundle.css');
      assert.strictEqual(INDEX_FILENAME, 'index.html');
    });
  });

  describe('buildReportDir', () => {
    it('builds correct path', () => {
      let result = buildReportDir('/home/user/project');
      assert.strictEqual(result, '/home/user/project/.vizzly/report');
    });
  });

  describe('buildReportPath', () => {
    it('builds correct path', () => {
      let result = buildReportPath('/home/user/project/.vizzly/report');
      assert.strictEqual(
        result,
        '/home/user/project/.vizzly/report/index.html'
      );
    });
  });

  describe('buildBundleSourcePaths', () => {
    it('builds correct paths', () => {
      let result = buildBundleSourcePaths('/home/user/project');
      assert.strictEqual(
        result.bundlePath,
        '/home/user/project/dist/reporter/reporter-bundle.iife.js'
      );
      assert.strictEqual(
        result.cssPath,
        '/home/user/project/dist/reporter/reporter-bundle.css'
      );
    });
  });

  describe('buildBundleDestPaths', () => {
    it('builds correct paths', () => {
      let result = buildBundleDestPaths('/home/user/project/.vizzly/report');
      assert.strictEqual(
        result.bundleDest,
        '/home/user/project/.vizzly/report/reporter-bundle.js'
      );
      assert.strictEqual(
        result.cssDest,
        '/home/user/project/.vizzly/report/reporter-bundle.css'
      );
    });
  });

  describe('validateReportData', () => {
    it('returns valid for object', () => {
      let result = validateReportData({ summary: {} });
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid for null', () => {
      let result = validateReportData(null);
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.error, 'Invalid report data provided');
    });

    it('returns invalid for undefined', () => {
      let result = validateReportData(undefined);
      assert.strictEqual(result.valid, false);
    });

    it('returns invalid for non-object', () => {
      let result = validateReportData('string');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('validateBundlesExist', () => {
    it('returns valid when both exist', () => {
      let result = validateBundlesExist(true, true);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, null);
    });

    it('returns invalid when bundle missing', () => {
      let result = validateBundlesExist(false, true);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('Reporter bundles not found'));
    });

    it('returns invalid when css missing', () => {
      let result = validateBundlesExist(true, false);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error.includes('Reporter bundles not found'));
    });

    it('returns invalid when both missing', () => {
      let result = validateBundlesExist(false, false);
      assert.strictEqual(result.valid, false);
    });
  });

  describe('serializeForHtml', () => {
    it('escapes < characters', () => {
      let result = serializeForHtml({ script: '<script>' });
      assert.ok(result.includes('\\u003c'));
      assert.ok(!result.includes('<script>'));
    });

    it('escapes > characters', () => {
      let result = serializeForHtml({ tag: '</script>' });
      assert.ok(result.includes('\\u003e'));
    });

    it('escapes & characters', () => {
      let result = serializeForHtml({ ampersand: 'a & b' });
      assert.ok(result.includes('\\u0026'));
    });

    it('handles nested objects', () => {
      let result = serializeForHtml({
        nested: { value: '<test>' },
      });
      assert.ok(result.includes('\\u003c'));
      assert.ok(result.includes('\\u003e'));
    });
  });

  describe('generateMainTemplate', () => {
    it('includes serialized data', () => {
      let result = generateMainTemplate({
        serializedData: '{"test":true}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      assert.ok(result.includes('window.VIZZLY_REPORTER_DATA = {"test":true}'));
    });

    it('includes timestamp', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      assert.ok(
        result.includes(
          'window.VIZZLY_REPORT_GENERATED_AT = "2024-01-01T00:00:00.000Z"'
        )
      );
    });

    it('includes static mode flag', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      assert.ok(result.includes('window.VIZZLY_STATIC_MODE = true'));
    });

    it('includes display date in title', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024, 12:00:00 AM',
      });

      assert.ok(result.includes('<title>Vizzly Dev Report - 1/1/2024'));
    });

    it('links to CSS bundle', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      assert.ok(
        result.includes('<link rel="stylesheet" href="./reporter-bundle.css">')
      );
    });

    it('links to JS bundle', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      assert.ok(
        result.includes('<script src="./reporter-bundle.js"></script>')
      );
    });

    it('includes loading spinner', () => {
      let result = generateMainTemplate({
        serializedData: '{}',
        timestamp: '2024-01-01T00:00:00.000Z',
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('class="reporter-loading"'));
      assert.ok(result.includes('class="spinner"'));
    });
  });

  describe('generateFallbackTemplate', () => {
    it('shows summary stats', () => {
      let result = generateFallbackTemplate({
        summary: { total: 10, passed: 8, failed: 2 },
        comparisons: [],
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('>10</span>'));
      assert.ok(result.includes('>8</span>'));
      assert.ok(result.includes('>2</span>'));
    });

    it('shows all passed message when no failures', () => {
      let result = generateFallbackTemplate({
        summary: { total: 5, passed: 5, failed: 0 },
        comparisons: [],
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('All tests passed!'));
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

      assert.ok(result.includes('<h2>Failed Comparisons</h2>'));
      assert.ok(result.includes('test-2 - 5.5% difference'));
      assert.ok(!result.includes('test-1 -'));
    });

    it('handles missing diffPercentage', () => {
      let result = generateFallbackTemplate({
        summary: { total: 1, passed: 0, failed: 1 },
        comparisons: [{ name: 'test', status: 'failed' }],
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('test - 0% difference'));
    });

    it('includes warning about limited report', () => {
      let result = generateFallbackTemplate({
        summary: {},
        comparisons: [],
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('Limited Report'));
      assert.ok(result.includes('npm run build:reporter'));
    });

    it('handles empty summary', () => {
      let result = generateFallbackTemplate({
        summary: {},
        comparisons: [],
        displayDate: '1/1/2024',
      });

      assert.ok(result.includes('>0</span>')); // defaults to 0
    });
  });

  describe('buildHtmlContent', () => {
    it('builds main HTML template', () => {
      let date = new Date('2024-01-01T12:00:00.000Z');
      let result = buildHtmlContent({ summary: { total: 5 } }, date);

      assert.ok(result.includes('<!DOCTYPE html>'));
      assert.ok(result.includes('window.VIZZLY_REPORTER_DATA'));
      assert.ok(result.includes('"total":5'));
    });

    it('uses provided date for timestamp', () => {
      let date = new Date('2024-06-15T10:30:00.000Z');
      let result = buildHtmlContent({}, date);

      assert.ok(result.includes('2024-06-15T10:30:00.000Z'));
    });
  });

  describe('buildFallbackHtmlContent', () => {
    it('builds fallback HTML template', () => {
      let date = new Date('2024-01-01T12:00:00.000Z');
      let result = buildFallbackHtmlContent(
        { summary: { total: 3 }, comparisons: [] },
        date
      );

      assert.ok(result.includes('<!DOCTYPE html>'));
      assert.ok(result.includes('Limited Report'));
      assert.ok(result.includes('>3</span>'));
    });

    it('handles missing summary and comparisons', () => {
      let date = new Date();
      let result = buildFallbackHtmlContent({}, date);

      assert.ok(result.includes('<!DOCTYPE html>'));
      assert.ok(result.includes('>0</span>'));
    });
  });
});
