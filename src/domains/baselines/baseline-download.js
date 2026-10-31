import { existsSync, writeFileSync } from 'node:fs';
import { NetworkError } from '../../errors/vizzly-error.js';
import { fetchWithTimeout as defaultFetchWithTimeout } from '../../services/fetch-utils.js';
import { safePath } from '../../services/paths.js';
import { sanitizeScreenshotName } from '../screenshots/screenshot.validations.js';
import { saveBaselineMetadata } from './baseline-metadata.js';

/** Install one selected cloud build without changing how it was selected. */
export async function installBaselineBuild({
  baselineBuild,
  baselinePath,
  workingDir,
  threshold,
  signatureProperties,
  existingBaseline,
  environment,
  branch,
  output,
  fetchWithTimeout = defaultFetchWithTimeout,
}) {
  let existingShaMap = new Map();
  if (existingBaseline) {
    existingBaseline.screenshots.forEach(screenshot => {
      if (screenshot.sha256 && screenshot.filename) {
        existingShaMap.set(screenshot.filename, screenshot.sha256);
      }
    });
  }

  // Download screenshots
  let downloadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let batchSize = 5;

  let screenshotsToProcess = [];
  for (let screenshot of baselineBuild.screenshots) {
    let sanitizedName;
    try {
      sanitizedName = sanitizeScreenshotName(screenshot.name);
    } catch (error) {
      output.warn(
        `Skipping screenshot with invalid name '${screenshot.name}': ${error.message}`
      );
      errorCount++;
      continue;
    }

    let filename = screenshot.filename;
    if (!filename) {
      output.warn(
        `Screenshot ${sanitizedName} has no filename from API - skipping`
      );
      errorCount++;
      continue;
    }

    let imagePath = safePath(baselinePath, filename);

    // Check SHA
    if (existsSync(imagePath) && screenshot.sha256) {
      let storedSha = existingShaMap.get(filename);
      if (storedSha === screenshot.sha256) {
        downloadedCount++;
        skippedCount++;
        continue;
      }
    }

    let downloadUrl = screenshot.original_url || screenshot.url;
    if (!downloadUrl) {
      output.warn(`Screenshot ${sanitizedName} has no download URL - skipping`);
      errorCount++;
      continue;
    }

    screenshotsToProcess.push({
      sanitizedName,
      imagePath,
      downloadUrl,
    });
  }

  // Process downloads in batches
  if (screenshotsToProcess.length > 0) {
    output.info(
      `📥 Downloading ${screenshotsToProcess.length} new/updated screenshots...`
    );

    for (let i = 0; i < screenshotsToProcess.length; i += batchSize) {
      let batch = screenshotsToProcess.slice(i, i + batchSize);
      let batchNum = Math.floor(i / batchSize) + 1;
      let totalBatches = Math.ceil(screenshotsToProcess.length / batchSize);

      output.info(`📦 Processing batch ${batchNum}/${totalBatches}`);

      let downloadPromises = batch.map(
        async ({ sanitizedName, imagePath, downloadUrl }) => {
          try {
            let response = await fetchWithTimeout(downloadUrl);
            if (!response.ok) {
              throw new NetworkError(
                `Failed to download ${sanitizedName}: ${response.statusText}`
              );
            }

            let arrayBuffer = await response.arrayBuffer();
            let imageBuffer = Buffer.from(arrayBuffer);
            writeFileSync(imagePath, imageBuffer);

            return { success: true, name: sanitizedName };
          } catch (error) {
            output.warn(
              `Failed to download ${sanitizedName}: ${error.message}`
            );
            return {
              success: false,
              name: sanitizedName,
              error: error.message,
            };
          }
        }
      );

      let batchResults = await Promise.all(downloadPromises);
      let batchSuccesses = batchResults.filter(r => r.success).length;
      let batchFailures = batchResults.filter(r => !r.success).length;

      downloadedCount += batchSuccesses;
      errorCount += batchFailures;
    }
  }

  if (downloadedCount === 0 && skippedCount === 0) {
    output.error('No screenshots were successfully downloaded');
    return null;
  }

  // Store baseline metadata
  let baselineData = {
    buildId: baselineBuild.id,
    buildName: baselineBuild.name,
    environment,
    branch,
    threshold,
    signatureProperties,
    createdAt: new Date().toISOString(),
    buildInfo: {
      commitSha: baselineBuild.commit_sha,
      commitMessage: baselineBuild.commit_message,
      visual_review: baselineBuild.visual_review || null,
      completedAt: baselineBuild.completed_at,
    },
    screenshots: baselineBuild.screenshots
      .filter(s => s.filename)
      .map(s => ({
        name: sanitizeScreenshotName(s.name),
        originalName: s.name,
        sha256: s.sha256,
        id: s.id,
        filename: s.filename,
        path: safePath(baselinePath, s.filename),
        browser: s.browser,
        viewport_width: s.viewport_width,
        originalUrl: s.original_url,
        fileSize: s.file_size_bytes,
        dimensions: { width: s.width, height: s.height },
      })),
  };

  saveBaselineMetadata(baselinePath, baselineData);

  // Save baseline build metadata for MCP plugin
  let baselineMetadataPath = safePath(
    workingDir,
    '.vizzly',
    'baseline-metadata.json'
  );
  writeFileSync(
    baselineMetadataPath,
    JSON.stringify(
      {
        buildId: baselineBuild.id,
        buildName: baselineBuild.name,
        branch,
        environment,
        commitSha: baselineBuild.commit_sha,
        commitMessage: baselineBuild.commit_message,
        visual_review: baselineBuild.visual_review || null,
        completedAt: baselineBuild.completed_at,
        downloadedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // Summary
  let actualDownloads = downloadedCount - skippedCount;
  if (skippedCount > 0) {
    if (actualDownloads === 0) {
      output.info(`All ${skippedCount} baselines up-to-date`);
    } else {
      output.info(
        `Downloaded ${actualDownloads} new screenshots, ${skippedCount} already up-to-date`
      );
    }
  } else {
    output.info(
      `Downloaded ${downloadedCount}/${baselineBuild.screenshots.length} screenshots successfully`
    );
  }

  if (errorCount > 0) {
    output.warn(`${errorCount} screenshots failed to download`);
  }

  return baselineData;
}
