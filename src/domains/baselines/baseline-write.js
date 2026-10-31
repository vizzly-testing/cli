import { writeFileSync as defaultWriteFileSync } from 'node:fs';
import {
  createEmptyBaselineMetadata as defaultCreateEmptyBaselineMetadata,
  upsertScreenshotInMetadata as defaultUpsertScreenshotInMetadata,
} from './baseline-metadata.js';

/**
 * Write one image and update its baseline record. The caller commits metadata
 * after a single approval or after its full bulk update has finished.
 */
export function writeBaselineScreenshot(
  { imageBuffer, screenshot, metadata, baselineOptions },
  {
    writeFileSync = defaultWriteFileSync,
    createEmptyBaselineMetadata = defaultCreateEmptyBaselineMetadata,
    upsertScreenshotInMetadata = defaultUpsertScreenshotInMetadata,
  } = {}
) {
  writeFileSync(screenshot.path, imageBuffer);
  let baselineData = metadata || createEmptyBaselineMetadata(baselineOptions);
  upsertScreenshotInMetadata(baselineData, screenshot, screenshot.signature);
  return baselineData;
}
