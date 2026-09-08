import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { uploadScreenshot as defaultUploadScreenshot } from '../../api/index.js';
import { detectImageInputType } from '../../utils/image-input-detector.js';
import * as output from '../../utils/output.js';
import { normalizeScreenshotOptions } from '../../utils/screenshot-options.js';

// Captures return immediately; flush waits for uploads and retains their outcomes.
export let createApiHandler = (
  client,
  { uploadScreenshot = defaultUploadScreenshot } = {}
) => {
  let captures = [];
  let uploadPromises = [];

  function recordFailure(capture, error) {
    capture.status = 'failed';
    capture.error = error.message;
    output.warn(
      `Screenshot "${capture.name}" failed to upload: ${error.message}`
    );
  }

  async function upload(
    capture,
    buildId,
    imageBuffer,
    properties,
    screenshotOptions
  ) {
    try {
      let result = await uploadScreenshot(
        client,
        buildId,
        capture.name,
        imageBuffer,
        properties ?? {},
        false,
        screenshotOptions
      );
      capture.status = result.skipped ? 'reused' : 'uploaded';
    } catch (error) {
      recordFailure(capture, error);
    }
  }

  async function handleScreenshot(
    buildId,
    name,
    image,
    properties = {},
    type,
    warnings = [],
    screenshotOptions = {}
  ) {
    let normalizedOptions = normalizeScreenshotOptions({
      ...screenshotOptions,
      properties,
    });
    properties = normalizedOptions.properties;
    screenshotOptions = {
      ...screenshotOptions,
      threshold: normalizedOptions.threshold,
      minClusterSize: normalizedOptions.minClusterSize,
      fullPage: normalizedOptions.fullPage,
      captureMode: normalizedOptions.captureMode,
      deviceScaleFactor: normalizedOptions.deviceScaleFactor,
      selector: normalizedOptions.selector,
    };
    warnings = [...(warnings || []), ...normalizedOptions.warnings];
    let capture = { name, status: 'pending' };
    captures.push(capture);
    let inputType = ['base64', 'file-path'].includes(type)
      ? type
      : detectImageInputType(image);
    let imageBuffer;
    try {
      if (!client) throw new Error('API client not available');
      if (inputType === 'file-path') {
        let filePath = resolve(image.replace('file://', ''));
        try {
          imageBuffer = readFileSync(filePath);
        } catch (error) {
          throw new Error(
            error.code === 'ENOENT'
              ? `Screenshot file not found: ${filePath}`
              : `Failed to read screenshot file: ${error.message}`
          );
        }
      } else if (inputType === 'base64') {
        imageBuffer = Buffer.from(image, 'base64');
      } else {
        throw new Error(
          'Invalid image input: must be a file path or base64 encoded image data'
        );
      }
    } catch (error) {
      recordFailure(capture, error);
      return {
        statusCode: client ? 400 : 500,
        body: { success: false, name, error: error.message },
      };
    }

    uploadPromises.push(
      upload(capture, buildId, imageBuffer, properties, screenshotOptions)
    );
    return {
      statusCode: 200,
      body: {
        success: true,
        queued: true,
        name,
        count: captures.length,
        warnings,
      },
    };
  }

  async function flush() {
    // Include captures received while an earlier batch was finishing. Repeated
    // flushes must retain failures so SDK flush cannot hide them from finalization.
    let count;
    do {
      count = uploadPromises.length;
      await Promise.all(uploadPromises);
    } while (count !== uploadPromises.length);

    let uploaded = captures.filter(
      capture => capture.status === 'uploaded'
    ).length;
    let reused = captures.filter(capture => capture.status === 'reused').length;
    let failures = captures
      .filter(capture => capture.status === 'failed')
      .map(({ name, error }) => ({ name, error }));
    return {
      uploaded,
      reused,
      failed: failures.length,
      total: captures.length,
      failures,
    };
  }

  function cleanup() {
    captures = [];
    uploadPromises = [];
  }

  return {
    handleScreenshot,
    getScreenshotCount: () => captures.length,
    flush,
    cleanup,
  };
};
