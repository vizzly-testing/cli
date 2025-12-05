/**
 * HTML Report Generator for TDD visual comparison results
 * Creates an interactive report with overlay, toggle, and onion skin modes
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as output from '../utils/output.js';

export class HtmlReportGenerator {
  constructor(workingDir, config) {
    this.workingDir = workingDir;
    this.config = config;
    this.reportDir = join(workingDir, '.vizzly', 'report');
    this.reportPath = join(this.reportDir, 'index.html');

    // Get path to the CSS file that ships with the package
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.cssPath = join(__dirname, 'report-generator', 'report.css');
  }

  /**
   * Sanitize HTML content to prevent XSS attacks
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  sanitizeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Sanitize build info object
   * @param {Object} buildInfo - Build information to sanitize
   * @returns {Object} Sanitized build info
   */
  sanitizeBuildInfo(buildInfo = {}) {
    const sanitized = {};

    if (buildInfo.baseline && typeof buildInfo.baseline === 'object') {
      sanitized.baseline = {
        buildId: this.sanitizeHtml(buildInfo.baseline.buildId || ''),
        buildName: this.sanitizeHtml(buildInfo.baseline.buildName || ''),
        environment: this.sanitizeHtml(buildInfo.baseline.environment || ''),
        branch: this.sanitizeHtml(buildInfo.baseline.branch || ''),
      };
    }

    if (typeof buildInfo.threshold === 'number') {
      sanitized.threshold = Math.max(0, Math.min(1, buildInfo.threshold));
    }

    return sanitized;
  }

  /**
   * Generate HTML report from TDD results
   * @param {Object} results - TDD comparison results
   * @param {Object} buildInfo - Build information
   * @returns {string} Path to generated report
   */
  async generateReport(results, buildInfo = {}) {
    // Validate inputs
    if (!results || typeof results !== 'object') {
      throw new Error('Invalid results object provided');
    }

    const { comparisons = [], passed = 0, failed = 0, total = 0 } = results;

    // Filter only failed comparisons for the report
    const failedComparisons = comparisons.filter(
      comp => comp && comp.status === 'failed'
    );

    const reportData = {
      buildInfo: {
        timestamp: new Date().toISOString(),
        ...this.sanitizeBuildInfo(buildInfo),
      },
      summary: {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0',
      },
      comparisons: failedComparisons
        .map(comp => this.processComparison(comp))
        .filter(Boolean),
    };

    const htmlContent = this.generateHtmlTemplate(reportData);

    try {
      // Ensure report directory exists
      await mkdir(this.reportDir, { recursive: true });

      await writeFile(this.reportPath, htmlContent, 'utf8');

      output.debug('report', 'generated html report');
      return this.reportPath;
    } catch (error) {
      output.debug('report', 'html generation failed', {
        error: error.message,
      });
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  /**
   * Process comparison data for HTML report
   * @param {Object} comparison - Comparison object
   * @returns {Object} Processed comparison data
   */
  processComparison(comparison) {
    if (!comparison || typeof comparison !== 'object') {
      output.warn('Invalid comparison object provided');
      return null;
    }

    return {
      name: comparison.name || 'unnamed',
      status: comparison.status,
      baseline: this.getRelativePath(comparison.baseline, this.reportDir),
      current: this.getRelativePath(comparison.current, this.reportDir),
      diff: this.getRelativePath(comparison.diff, this.reportDir),
      threshold: comparison.threshold || 0,
      diffPercentage: comparison.diffPercentage || 0,
    };
  }

  /**
   * Get relative path from report directory to image file
   * @param {string} imagePath - Absolute path to image
   * @param {string} reportDir - Report directory path
   * @returns {string|null} Relative path or null if invalid
   */
  getRelativePath(imagePath, reportDir) {
    if (!imagePath || !existsSync(imagePath)) {
      return null;
    }
    return relative(reportDir, imagePath);
  }

  /**
   * Generate the complete HTML template
   * @param {Object} data - Report data
   * @returns {string} HTML content
   */
  generateHtmlTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vizzly TDD Report</title>
    <link rel="stylesheet" href="file://${this.cssPath}">
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>🐻 Vizzly Visual Testing Report</h1>
            <div class="summary">
                <div class="stat">
                    <span class="stat-number">${data.summary.total}</span>
                    <span class="stat-label">Total</span>
                </div>
                <div class="stat passed">
                    <span class="stat-number">${data.summary.passed}</span>
                    <span class="stat-label">Passed</span>
                </div>
                <div class="stat failed">
                    <span class="stat-number">${data.summary.failed}</span>
                    <span class="stat-label">Failed</span>
                </div>
                <div class="stat">
                    <span class="stat-number">${data.summary.passRate}%</span>
                    <span class="stat-label">Pass Rate</span>
                </div>
            </div>
            <div class="build-info">
                <span>Generated: ${new Date(data.buildInfo.timestamp).toLocaleString()}</span>
            </div>
        </header>

        ${
          data.comparisons.length === 0
            ? '<div class="no-failures">🎉 All tests passed! No visual differences detected.</div>'
            : `<main class="comparisons">
            ${data.comparisons.map(comp => this.generateComparisonHtml(comp)).join('')}
          </main>`
        }
    </div>

    <script>
document.addEventListener('DOMContentLoaded', function () {
  // Handle view mode switching
  document.querySelectorAll('.view-mode-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      let comparison = this.closest('.comparison');
      let mode = this.dataset.mode;

      // Update active button
      comparison
        .querySelectorAll('.view-mode-btn')
        .forEach(b => b.classList.remove('active'));
      this.classList.add('active');

      // Update viewer mode
      let viewer = comparison.querySelector('.comparison-viewer');
      viewer.dataset.mode = mode;

      // Hide all mode containers
      viewer.querySelectorAll('.mode-container').forEach(container => {
        container.style.display = 'none';
      });

      // Show appropriate mode container
      let activeContainer = viewer.querySelector('.' + mode + '-mode');
      if (activeContainer) {
        activeContainer.style.display = 'block';
      }
    });
  });

  // Handle onion skin drag-to-reveal
  document.querySelectorAll('.onion-container').forEach(container => {
    let isDragging = false;

    function updateOnionSkin(x) {
      let rect = container.getBoundingClientRect();
      let percentage = Math.max(
        0,
        Math.min(100, ((x - rect.left) / rect.width) * 100)
      );

      let currentImg = container.querySelector('.onion-current');
      let divider = container.querySelector('.onion-divider');

      if (currentImg && divider) {
        currentImg.style.clipPath = 'inset(0 ' + (100 - percentage) + '% 0 0)';
        divider.style.left = percentage + '%';
      }
    }

    container.addEventListener('mousedown', function (e) {
      isDragging = true;
      updateOnionSkin(e.clientX);
      e.preventDefault();
    });

    container.addEventListener('mousemove', function (e) {
      if (isDragging) {
        updateOnionSkin(e.clientX);
      }
    });

    document.addEventListener('mouseup', function () {
      isDragging = false;
    });

    // Touch events for mobile
    container.addEventListener('touchstart', function (e) {
      isDragging = true;
      updateOnionSkin(e.touches[0].clientX);
      e.preventDefault();
    });

    container.addEventListener('touchmove', function (e) {
      if (isDragging) {
        updateOnionSkin(e.touches[0].clientX);
        e.preventDefault();
      }
    });

    document.addEventListener('touchend', function () {
      isDragging = false;
    });
  });

  // Handle overlay mode clicking
  document.querySelectorAll('.overlay-container').forEach(container => {
    container.addEventListener('click', function () {
      let diffImage = this.querySelector('.diff-image');
      if (diffImage) {
        // Toggle diff visibility
        let isVisible = diffImage.style.opacity === '1';
        diffImage.style.opacity = isVisible ? '0' : '1';
      }
    });
  });

  // Handle toggle mode clicking
  document.querySelectorAll('.toggle-container img').forEach(img => {
    let isBaseline = true;
    let comparison = img.closest('.comparison');
    let baselineSrc = comparison.querySelector('.baseline-image').src;
    let currentSrc = comparison.querySelector('.current-image').src;

    img.addEventListener('click', function () {
      isBaseline = !isBaseline;
      this.src = isBaseline ? baselineSrc : currentSrc;

      // Update cursor style to indicate interactivity
      this.style.cursor = 'pointer';
    });
  });

  console.log('Vizzly TDD Report loaded successfully');
});

// Accept/Reject baseline functions
async function acceptBaseline(screenshotName) {
  const button = document.querySelector(\`button[onclick*="\${screenshotName}"]\`);
  if (button) {
    button.disabled = true;
    button.innerHTML = '⏳ Accepting...';
  }

  try {
    const response = await fetch('/accept-baseline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: screenshotName })
    });

    if (response.ok) {
      // Mark as accepted and hide the comparison
      const comparison = document.querySelector(\`[data-comparison="\${screenshotName}"]\`);
      if (comparison) {
        comparison.style.background = '#e8f5e8';
        comparison.style.border = '2px solid #4caf50';

        const status = comparison.querySelector('.diff-status');
        if (status) {
          status.innerHTML = '✅ Accepted as new baseline';
          status.style.color = '#4caf50';
        }

        const actions = comparison.querySelector('.comparison-actions');
        if (actions) {
          actions.innerHTML = '<div style="color: #4caf50; padding: 0.5rem;">✅ Screenshot accepted as new baseline</div>';
        }
      }

      // Auto-refresh after short delay to show updated report
      setTimeout(() => window.location.reload(), 2000);
    } else {
      throw new Error('Failed to accept baseline');
    }
  } catch (error) {
    console.error('Error accepting baseline:', error);
    if (button) {
      button.disabled = false;
      button.innerHTML = '✅ Accept as Baseline';
    }
    alert('Failed to accept baseline. Please try again.');
  }
}

function rejectChanges(screenshotName) {
  const comparison = document.querySelector(\`[data-comparison="\${screenshotName}"]\`);
  if (comparison) {
    comparison.style.background = '#fff3cd';
    comparison.style.border = '2px solid #ffc107';

    const status = comparison.querySelector('.diff-status');
    if (status) {
      status.innerHTML = '⚠️ Changes rejected - baseline unchanged';
      status.style.color = '#856404';
    }

    const actions = comparison.querySelector('.comparison-actions');
    if (actions) {
      actions.innerHTML = '<div style="color: #856404; padding: 0.5rem;">⚠️ Changes rejected - baseline kept as-is</div>';
    }
  }
}
    </script>
</body>
</html>`;
  }

  /**
   * Generate HTML for a single comparison
   * @param {Object} comparison - Comparison data
   * @returns {string} HTML content
   */
  generateComparisonHtml(comparison) {
    if (
      !comparison ||
      !comparison.baseline ||
      !comparison.current ||
      !comparison.diff
    ) {
      return `<div class="comparison error">
        <h3>${this.sanitizeHtml(comparison?.name || 'Unknown')}</h3>
        <p>Missing comparison images</p>
      </div>`;
    }

    const safeName = this.sanitizeHtml(comparison.name);

    return `
    <div class="comparison" data-comparison="${safeName}">
        <div class="comparison-header">
            <h3>${safeName}</h3>
            <div class="comparison-meta">
                <span class="diff-status">Visual differences detected</span>
            </div>
        </div>
        
        <div class="comparison-controls">
            <button class="view-mode-btn active" data-mode="overlay">Overlay</button>
            <button class="view-mode-btn" data-mode="toggle">Toggle</button>
            <button class="view-mode-btn" data-mode="onion">Onion Skin</button>
            <button class="view-mode-btn" data-mode="side-by-side">Side by Side</button>
        </div>

        <div class="comparison-actions">
            <button class="accept-btn" onclick="acceptBaseline('${safeName}')">
                ✅ Accept as Baseline
            </button>
            <button class="reject-btn" onclick="rejectChanges('${safeName}')">
                ❌ Keep Current Baseline
            </button>
        </div>

        <div class="comparison-viewer">
            <!-- Overlay Mode -->
            <div class="mode-container overlay-mode" data-mode="overlay">
                <div class="overlay-container">
                    <img class="current-image" src="${comparison.current}" alt="Current" />
                    <img class="baseline-image" src="${comparison.baseline}" alt="Baseline" />
                    <img class="diff-image" src="${comparison.diff}" alt="Diff" />
                </div>
            </div>
            
            <!-- Toggle Mode -->
            <div class="mode-container toggle-mode" data-mode="toggle" style="display: none;">
                <div class="toggle-container">
                    <img class="toggle-image" src="${comparison.baseline}" alt="Baseline" />
                </div>
            </div>
            
            <!-- Onion Skin Mode -->
            <div class="mode-container onion-mode" data-mode="onion" style="display: none;">
                <div class="onion-container">
                    <img class="onion-baseline" src="${comparison.baseline}" alt="Baseline" />
                    <img class="onion-current" src="${comparison.current}" alt="Current" />
                    <div class="onion-divider"></div>
                </div>
            </div>
            
            <!-- Side by Side Mode -->
            <div class="mode-container side-by-side-mode" data-mode="side-by-side" style="display: none;">
                <div class="side-by-side-container">
                    <div class="side-by-side-image">
                        <img src="${comparison.baseline}" alt="Baseline" />
                        <label>Baseline</label>
                    </div>
                    <div class="side-by-side-image">
                        <img src="${comparison.current}" alt="Current" />
                        <label>Current</label>
                    </div>
                </div>
            </div>
        </div>

    </div>`;
  }
}
