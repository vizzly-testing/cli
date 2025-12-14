import assert from 'node:assert';
import { describe, it } from 'node:test';
import { StaticReportGenerator } from '../../src/services/static-report-generator.js';

describe('services/static-report-generator', () => {
  describe('StaticReportGenerator', () => {
    it('initializes with workingDir and config', () => {
      let generator = new StaticReportGenerator('/project/.vizzly', {
        threshold: 0.1,
      });

      assert.strictEqual(generator.workingDir, '/project/.vizzly');
      assert.deepStrictEqual(generator.config, { threshold: 0.1 });
      assert.ok(generator.reportDir.includes('.vizzly'));
      assert.ok(generator.reportPath.includes('index.html'));
    });

    it('generateHtmlTemplate returns HTML string', () => {
      let generator = new StaticReportGenerator('/project/.vizzly', {});
      let reportData = {
        comparisons: [{ name: 'test', status: 'passed' }],
        summary: { total: 1, passed: 1 },
      };

      let html = generator.generateHtmlTemplate(reportData);

      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('window.VIZZLY_REPORTER_DATA'));
    });

    it('generateFallbackHtml returns minimal HTML', () => {
      let generator = new StaticReportGenerator('/project/.vizzly', {});
      let reportData = {
        comparisons: [],
        summary: { total: 0 },
      };

      let html = generator.generateFallbackHtml(reportData);

      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('Vizzly Dev Report'));
    });
  });
});
