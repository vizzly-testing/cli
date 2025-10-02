import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Archive a build to history directory
 * @param {string} workingDir - Working directory
 * @param {string} buildId - Build ID to archive
 * @param {Array} builds - Build data
 * @param {Array} comparisons - Comparison data
 * @param {Object} summary - Summary stats
 * @param {number} maxHistory - Maximum number of builds to keep (default: 3)
 */
export function archiveBuild(
  workingDir,
  buildId,
  builds,
  comparisons,
  summary,
  maxHistory = 3
) {
  let historyDir = join(workingDir, '.vizzly', 'history');

  // Create history directory if it doesn't exist
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }

  // Save current build to history
  let buildDir = join(historyDir, buildId);
  if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
  }

  let buildData = {
    buildId,
    timestamp: Date.now(),
    builds,
    comparisons,
    summary,
  };

  writeFileSync(
    join(buildDir, 'report.json'),
    JSON.stringify(buildData, null, 2)
  );

  // Clean up old builds (keep last N)
  cleanupOldBuilds(historyDir, maxHistory);
}

/**
 * Get list of archived builds
 * @param {string} workingDir - Working directory
 * @returns {Array} Array of build metadata
 */
export function getArchivedBuilds(workingDir) {
  let historyDir = join(workingDir, '.vizzly', 'history');

  if (!existsSync(historyDir)) {
    return [];
  }

  try {
    let buildDirs = readdirSync(historyDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort()
      .reverse(); // Newest first

    return buildDirs
      .map(buildId => {
        let reportPath = join(historyDir, buildId, 'report.json');
        if (existsSync(reportPath)) {
          try {
            let data = JSON.parse(
              require('fs').readFileSync(reportPath, 'utf8')
            );
            return {
              buildId: data.buildId,
              timestamp: data.timestamp,
              summary: data.summary,
            };
          } catch {
            return null;
          }
        }
        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Remove old builds, keeping only the last N
 * @private
 */
function cleanupOldBuilds(historyDir, maxHistory) {
  try {
    let buildDirs = readdirSync(historyDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
      .sort()
      .reverse(); // Newest first

    // Remove builds beyond maxHistory
    if (buildDirs.length > maxHistory) {
      let toRemove = buildDirs.slice(maxHistory);
      toRemove.forEach(buildId => {
        let buildDir = join(historyDir, buildId);
        rmSync(buildDir, { recursive: true, force: true });
      });
    }
  } catch {
    // Ignore cleanup errors
  }
}
