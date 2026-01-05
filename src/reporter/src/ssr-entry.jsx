/**
 * SSR Entry Point
 *
 * This module exports a function to render the static report to HTML string.
 * It's built by Vite as a Node-compatible module for use in the CLI.
 */

import { renderToString } from 'react-dom/server';
import StaticReportView from './components/static-report-view.jsx';

/**
 * Render the static report to an HTML string
 * @param {Object} reportData - The report data from report-data.json
 * @returns {string} The rendered HTML
 */
export function renderStaticReport(reportData) {
  return renderToString(<StaticReportView reportData={reportData} />);
}
