/**
 * HTML Report Generator for TDD visual comparison results
 * Creates an interactive report with overlay, toggle, and onion skin modes
 */

import { writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { createServiceLogger } from '../utils/logger-factory.js';

const logger = createServiceLogger('HTML-REPORT');

export class HtmlReportGenerator {
  constructor(workingDir, config) {
    this.workingDir = workingDir;
    this.config = config;
    this.reportDir = join(workingDir, '.vizzly', 'report');
    this.reportPath = join(this.reportDir, 'index.html');
  }

  /**
   * Generate HTML report from TDD results
   * @param {Object} results - TDD comparison results
   * @param {Object} buildInfo - Build information
   * @returns {string} Path to generated report
   */
  async generateReport(results, buildInfo = {}) {
    const { comparisons = [], passed = 0, failed = 0, total = 0 } = results;

    // Filter only failed comparisons (those with diffs)
    const failedComparisons = comparisons.filter(
      comp => comp.status === 'failed'
    );

    const reportData = {
      buildInfo: {
        timestamp: new Date().toISOString(),
        workingDir: this.workingDir,
        ...buildInfo,
      },
      summary: {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0',
      },
      comparisons: failedComparisons.map(comp => this.processComparison(comp)),
    };

    const htmlContent = this.generateHtmlTemplate(reportData);

    // Ensure report directory exists
    const { mkdirSync } = await import('fs');
    mkdirSync(this.reportDir, { recursive: true });

    writeFileSync(this.reportPath, htmlContent, 'utf8');

    logger.debug(`HTML report generated: ${this.reportPath}`);
    return this.reportPath;
  }

  /**
   * Process comparison data for HTML report
   * @param {Object} comparison - Comparison object
   * @returns {Object} Processed comparison data
   */
  processComparison(comparison) {
    const reportDir = this.reportDir;

    return {
      name: comparison.name,
      status: comparison.status,
      baseline: this.getRelativePath(comparison.baseline, reportDir),
      current: this.getRelativePath(comparison.current, reportDir),
      diff: this.getRelativePath(comparison.diff, reportDir),
      threshold: comparison.threshold,
      diffPercentage: comparison.diffPercentage,
    };
  }

  /**
   * Get relative path from report directory to image file
   * @param {string} imagePath - Absolute path to image
   * @param {string} reportDir - Report directory path
   * @returns {string} Relative path
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
    <style>
        ${this.getCssStyles()}
    </style>
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
        ${this.getJavaScript()}
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
    if (!comparison.baseline || !comparison.current || !comparison.diff) {
      return `<div class="comparison error">
        <h3>${comparison.name}</h3>
        <p>Missing comparison images</p>
      </div>`;
    }

    return `
    <div class="comparison" data-comparison="${comparison.name}">
        <div class="comparison-header">
            <h3>${comparison.name}</h3>
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

  /**
   * Get CSS styles for the report
   * @returns {string} CSS content
   */
  getCssStyles() {
    return `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #e2e8f0;
            background: #0f172a;
            min-height: 100vh;
        }

        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }

        .header {
            background: #1e293b;
            border-radius: 12px;
            padding: 32px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid #334155;
        }

        .header h1 {
            font-size: 2rem;
            margin-bottom: 24px;
            color: #f1f5f9;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .summary {
            display: flex;
            gap: 30px;
            margin-bottom: 15px;
        }

        .stat {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #94a3b8;
        }

        .stat.passed .stat-number { color: #22c55e; }
        .stat.failed .stat-number { color: #f59e0b; }

        .stat-label {
            font-size: 0.875rem;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.025em;
            font-weight: 500;
        }

        .build-info {
            color: #64748b;
            font-size: 0.875rem;
        }

        .no-failures {
            text-align: center;
            padding: 48px;
            background: #1e293b;
            border-radius: 12px;
            border: 1px solid #334155;
            font-size: 1.125rem;
            color: #22c55e;
        }

        .comparison {
            background: #1e293b;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid #334155;
        }

        .comparison-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid #334155;
        }

        .comparison-header h3 {
            margin: 0;
            font-size: 1.25rem;
            color: #f1f5f9;
            font-weight: 600;
        }

        .comparison-meta {
            display: flex;
            gap: 16px;
            font-size: 0.875rem;
        }

        .diff-status {
            padding: 6px 12px;
            background: rgba(245, 158, 11, 0.1);
            color: #f59e0b;
            border-radius: 6px;
            font-weight: 500;
            border: 1px solid rgba(245, 158, 11, 0.2);
            font-size: 0.875rem;
        }

        .comparison-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .view-mode-btn {
            padding: 8px 16px;
            border: 1px solid #475569;
            background: #334155;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all 0.2s;
            color: #cbd5e1;
        }

        .view-mode-btn:hover {
            background: #475569;
            border-color: #64748b;
            color: #e2e8f0;
        }

        .view-mode-btn.active {
            background: #f59e0b;
            color: #1e293b;
            border-color: #f59e0b;
            box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .comparison-viewer {
            position: relative;
            border: 1px solid #334155;
            border-radius: 8px;
            overflow: hidden;
            background: #0f172a;
        }

        .mode-container {
            position: relative;
            min-height: 200px;
            text-align: center;
        }

        .mode-container img {
            max-width: 100%;
            height: auto;
            display: block;
        }

        /* Overlay Mode */
        .overlay-container {
            position: relative;
            display: inline-block;
            margin: 0 auto;
            cursor: pointer;
        }

        .overlay-container .current-image {
            display: block;
            max-width: 100%;
            width: auto;
            height: auto;
        }

        .overlay-container .baseline-image {
            position: absolute;
            top: 0;
            left: 0;
            opacity: 0.5;
            max-width: 100%;
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .overlay-container .diff-image {
            position: absolute;
            top: 0;
            left: 0;
            opacity: 0;
            max-width: 100%;
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        /* Side by Side Mode */
        .side-by-side-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            align-items: start;
            padding: 16px;
        }

        .side-by-side-image {
            text-align: center;
            flex: 1;
            min-width: 200px;
            max-width: 400px;
        }

        .side-by-side-image img {
            width: 100%;
            height: auto;
            max-width: none;
            border: 2px solid #475569;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            transition: border-color 0.2s ease;
        }

        .side-by-side-image img:hover {
            border-color: #f59e0b;
        }

        .side-by-side-image label {
            display: block;
            margin-top: 12px;
            font-size: 0.875rem;
            color: #94a3b8;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.025em;
        }

        /* Onion Skin Mode */
        .onion-container {
            position: relative;
            display: flex;
            justify-content: center;
            width: 100%;
            cursor: ew-resize;
            user-select: none;
        }

        .onion-baseline {
            max-width: 100%;
            width: auto;
            height: auto;
            display: block;
        }

        .onion-current {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            max-width: 100%;
            width: auto;
            height: auto;
            clip-path: inset(0 50% 0 0);
        }
        
        .onion-divider {
            position: absolute;
            top: 0;
            left: 50%;
            width: 2px;
            height: 100%;
            background: #f59e0b;
            transform: translateX(-50%);
            z-index: 10;
            pointer-events: none;
        }
        
        .onion-divider::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #f59e0b;
            border: 2px solid #1e293b;
        }
        
        .onion-divider::after {
            content: '⟷';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #1e293b;
            font-size: 12px;
            font-weight: bold;
        }


        /* Toggle Mode */
        .toggle-container {
            display: inline-block;
        }
        
        .toggle-container img {
            max-width: 100%;
            width: auto;
            height: auto;
            cursor: pointer;
        }

        .error {
            color: #ef4444;
            text-align: center;
            padding: 40px;
        }

        @media (max-width: 768px) {
            .container { padding: 10px; }
            .summary { flex-wrap: wrap; gap: 15px; }
            .comparison-controls { flex-wrap: wrap; }
            .side-by-side-container { 
                grid-template-columns: 1fr;
                gap: 15px;
            }
        }
    `;
  }

  /**
   * Get JavaScript functionality for the report
   * @returns {string} JavaScript content
   */
  getJavaScript() {
    return `
        document.addEventListener('DOMContentLoaded', function() {
            // Handle view mode switching
            document.querySelectorAll('.view-mode-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const comparison = this.closest('.comparison');
                    const mode = this.dataset.mode;
                    
                    // Update active button
                    comparison.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Update viewer mode
                    const viewer = comparison.querySelector('.comparison-viewer');
                    viewer.dataset.mode = mode;
                    
                    // Hide all mode containers
                    viewer.querySelectorAll('.mode-container').forEach(container => {
                        container.style.display = 'none';
                    });
                    
                    // Show appropriate mode container
                    const activeContainer = viewer.querySelector('.' + mode + '-mode');
                    if (activeContainer) {
                        activeContainer.style.display = 'block';
                    }
                    
                });
            });

            // Handle onion skin drag-to-reveal
            document.querySelectorAll('.onion-container').forEach(container => {
                let isDragging = false;
                
                function updateOnionSkin(x) {
                    const rect = container.getBoundingClientRect();
                    const percentage = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
                    
                    const currentImg = container.querySelector('.onion-current');
                    const divider = container.querySelector('.onion-divider');
                    
                    if (currentImg && divider) {
                        currentImg.style.clipPath = 'inset(0 ' + (100 - percentage) + '% 0 0)';
                        divider.style.left = percentage + '%';
                    }
                }
                
                container.addEventListener('mousedown', function(e) {
                    isDragging = true;
                    updateOnionSkin(e.clientX);
                    e.preventDefault();
                });
                
                container.addEventListener('mousemove', function(e) {
                    if (isDragging) {
                        updateOnionSkin(e.clientX);
                    }
                });
                
                document.addEventListener('mouseup', function() {
                    isDragging = false;
                });
                
                // Touch events for mobile
                container.addEventListener('touchstart', function(e) {
                    isDragging = true;
                    updateOnionSkin(e.touches[0].clientX);
                    e.preventDefault();
                });
                
                container.addEventListener('touchmove', function(e) {
                    if (isDragging) {
                        updateOnionSkin(e.touches[0].clientX);
                        e.preventDefault();
                    }
                });
                
                document.addEventListener('touchend', function() {
                    isDragging = false;
                });
            });

            // Handle overlay mode clicking
            document.querySelectorAll('.overlay-container').forEach(container => {
                container.addEventListener('click', function() {
                    const diffImage = this.querySelector('.diff-image');
                    if (diffImage) {
                        // Toggle diff visibility
                        const isVisible = diffImage.style.opacity === '1';
                        diffImage.style.opacity = isVisible ? '0' : '1';
                    }
                });
            });
            
            // Handle toggle mode clicking
            document.querySelectorAll('.toggle-container img').forEach(img => {
                let isBaseline = true;
                const comparison = img.closest('.comparison');
                const baselineSrc = comparison.querySelector('.baseline-image').src;
                const currentSrc = comparison.querySelector('.current-image').src;
                
                img.addEventListener('click', function() {
                    isBaseline = !isBaseline;
                    this.src = isBaseline ? baselineSrc : currentSrc;
                    
                    // Update cursor style to indicate interactivity
                    this.style.cursor = 'pointer';
                });
            });

            console.log('Vizzly TDD Report loaded successfully');
        });
    `;
  }
}
