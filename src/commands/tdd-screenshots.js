import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { generateScreenshotSignature } from '../tdd/core/signature.js';
import { TddService as defaultTddService } from '../tdd/tdd-service.js';
import { loadConfig as defaultLoadConfig } from '../utils/config-loader.js';
import * as output from '../utils/output.js';
import { safePath } from '../utils/security.js';

let DEFAULT_PAGE_SIZE = 20;
let MAX_PAGE_SIZE = 100;
let TDD_SCREENSHOT_STATUSES = new Set([
  'baseline-created',
  'baseline-updated',
  'error',
  'failed',
  'new',
  'passed',
  'rejected',
]);
let TDD_SCREENSHOT_IMAGES = new Set(['current', 'baseline', 'diff', 'all']);

function readLocalReport(workingDir) {
  let projectDir = resolve(workingDir);
  let vizzlyDir = join(projectDir, '.vizzly');
  let reportPath = join(vizzlyDir, 'report-data.json');

  if (!existsSync(reportPath)) {
    return {
      error:
        `No local TDD screenshots found. Run "vizzly tdd run <command>" ` +
        `first. Expected ${reportPath}`,
    };
  }

  try {
    let report = JSON.parse(readFileSync(reportPath, 'utf8'));
    if (!report || !Array.isArray(report.comparisons)) {
      return { error: `Local TDD report has no comparisons: ${reportPath}` };
    }
    if (
      report.comparisons.some(
        comparison =>
          !comparison ||
          typeof comparison !== 'object' ||
          Array.isArray(comparison)
      )
    ) {
      return {
        error: `Local TDD report has invalid comparisons: ${reportPath}`,
      };
    }

    return { report, projectDir, vizzlyDir };
  } catch (error) {
    return {
      error: `Could not read local TDD report ${reportPath}: ${error.message}`,
    };
  }
}

function resolveImagePath(imageUrl, vizzlyDir) {
  if (typeof imageUrl !== 'string' || imageUrl.length === 0) return null;

  let relativePath;
  if (imageUrl.startsWith('/images/')) {
    relativePath = imageUrl.slice('/images/'.length);
  } else if (imageUrl.startsWith('.vizzly/')) {
    relativePath = imageUrl.slice('.vizzly/'.length);
  } else {
    return null;
  }

  try {
    return safePath(vizzlyDir, relativePath);
  } catch {
    return null;
  }
}

function readComparisonDetails(vizzlyDir) {
  let detailsPath = join(vizzlyDir, 'comparison-details.json');
  if (!existsSync(detailsPath)) return {};

  try {
    let details = JSON.parse(readFileSync(detailsPath, 'utf8'));
    return details && typeof details === 'object' && !Array.isArray(details)
      ? details
      : {};
  } catch {
    return {};
  }
}

function getViewport(properties) {
  return {
    width: properties?.viewport_width ?? properties?.viewport?.width ?? null,
    height: properties?.viewport_height ?? properties?.viewport?.height ?? null,
  };
}

function comparisonSummary(comparison, vizzlyDir) {
  let currentPath = resolveImagePath(comparison.current, vizzlyDir);
  return {
    id: comparison.id,
    name: comparison.name,
    status: comparison.status,
    diffPercentage: comparison.diffPercentage ?? null,
    browser: comparison.properties?.browser ?? null,
    viewport: getViewport(comparison.properties),
    currentImage: currentPath
      ? { path: currentPath, exists: existsSync(currentPath) }
      : null,
  };
}

function getPaginationOptions(options = {}) {
  let page = options.page ?? 1;
  let pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  let errors = [];

  if (!Number.isInteger(page) || page < 1) {
    errors.push('--page must be a positive integer');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    errors.push(
      `--page-size must be an integer between 1 and ${MAX_PAGE_SIZE}`
    );
  }
  if (options.status && !TDD_SCREENSHOT_STATUSES.has(options.status)) {
    errors.push(
      `--status must be one of: ${[...TDD_SCREENSHOT_STATUSES].join(', ')}`
    );
  }

  return { page, pageSize, errors };
}

function reportError(message, commandOutput = output) {
  commandOutput.error(message);
  process.exitCode = 1;
}

function getImageKinds(image = 'current') {
  if (!TDD_SCREENSHOT_IMAGES.has(image)) {
    return {
      error: `--image must be one of: ${[...TDD_SCREENSHOT_IMAGES].join(', ')}`,
    };
  }

  return { kinds: image === 'all' ? ['current', 'baseline', 'diff'] : [image] };
}

function imageReferences(comparison, vizzlyDir, kinds) {
  return Object.fromEntries(
    kinds.map(kind => {
      let path = resolveImagePath(comparison[kind], vizzlyDir);
      return [kind, path ? { path, exists: existsSync(path) } : null];
    })
  );
}

function readLocalComparison(idOrName, workingDir) {
  if (!idOrName?.trim()) {
    return { error: 'A screenshot name or comparison ID is required.' };
  }

  let local = readLocalReport(workingDir);
  if (local.error) return local;

  let found = findComparison(local.report.comparisons, idOrName);
  if (found.error) return found;

  return { local, comparison: found.comparison };
}

export function listTddScreenshots(options = {}, workingDir = process.cwd()) {
  let { page, pageSize, errors } = getPaginationOptions(options);
  if (errors.length > 0) {
    reportError(errors.join('\n'));
    return null;
  }

  let local = readLocalReport(workingDir);
  if (local.error) {
    reportError(local.error);
    return null;
  }

  let comparisons = options.status
    ? local.report.comparisons.filter(item => item.status === options.status)
    : local.report.comparisons;
  let total = comparisons.length;
  let totalPages = Math.ceil(total / pageSize);
  let start = (page - 1) * pageSize;
  let items = comparisons
    .slice(start, start + pageSize)
    .map(comparison => comparisonSummary(comparison, local.vizzlyDir));
  let data = {
    page,
    pageSize,
    total,
    totalPages,
    hasPrevious: page > 1 && total > 0,
    hasNext: start + items.length < total,
    screenshots: items,
  };

  if (output.isJson()) {
    output.data(data);
    return data;
  }

  let pageLabel = totalPages ? ` of ${totalPages}` : '';
  output.print(
    `TDD screenshots · ${total} comparison${total === 1 ? '' : 's'} · ` +
      `page ${page}${pageLabel}`
  );
  if (options.status) output.print(`Filtered by status: ${options.status}`);

  if (items.length === 0) {
    output.print('No screenshots on this page.');
  }

  for (let [index, item] of items.entries()) {
    let row = start + index + 1;
    let diff = !Number.isFinite(item.diffPercentage)
      ? ''
      : ` · ${item.diffPercentage.toFixed(2)}% diff`;
    output.print(`${row}. ${item.status} · ${item.name} · ${item.id}${diff}`);
  }

  if (data.hasNext) {
    output.blank();
    let nextPageCommand =
      `Next page: vizzly tdd screenshots list --page ${page + 1} ` +
      `--page-size ${pageSize}`;
    if (options.status) nextPageCommand += ` --status ${options.status}`;
    output.print(nextPageCommand);
  }

  if (items.length > 0) {
    output.blank();
    output.print('Inspect one: vizzly tdd screenshots show <id>');
  }

  return data;
}

export function latestTddScreenshot(name = null, workingDir = process.cwd()) {
  let local = readLocalReport(workingDir);
  if (local.error) {
    reportError(local.error);
    return null;
  }

  let matches = local.report.comparisons
    .map((comparison, index) => ({ comparison, index }))
    .filter(({ comparison }) => !name || comparison.name === name)
    .sort((left, right) => {
      let leftTimestamp = Number(left.comparison.timestamp) || 0;
      let rightTimestamp = Number(right.comparison.timestamp) || 0;
      return rightTimestamp - leftTimestamp || right.index - left.index;
    });

  if (matches.length === 0) {
    reportError(
      name
        ? `No local TDD screenshot found for "${name}".`
        : 'No local TDD screenshots were captured.'
    );
    return null;
  }

  let { comparison } = matches[0];
  let image = imageReferences(comparison, local.vizzlyDir, ['current']).current;
  let data = {
    id: comparison.id,
    name: comparison.name,
    status: comparison.status,
    timestamp: comparison.timestamp ?? null,
    image,
  };

  if (!image?.exists) {
    reportError(`The latest screenshot is missing for "${comparison.name}".`);
    return null;
  }

  if (output.isJson()) {
    output.data(data);
    return data;
  }

  output.print(image.path);
  return data;
}

function findComparison(comparisons, idOrName) {
  let byId = comparisons.find(item => item.id === idOrName);
  if (byId) return { comparison: byId };

  let bySignature = comparisons.find(item => item.signature === idOrName);
  if (bySignature) return { comparison: bySignature };

  let byName = comparisons.filter(item => item.name === idOrName);
  if (byName.length === 1) return { comparison: byName[0] };
  if (byName.length > 1) {
    return {
      error:
        `More than one screenshot is named "${idOrName}". ` +
        `Use a comparison ID: ${byName.map(item => item.id).join(', ')}`,
    };
  }

  let prefixMatches = comparisons.filter(item =>
    String(item.id || '').startsWith(idOrName)
  );
  if (prefixMatches.length === 1) return { comparison: prefixMatches[0] };
  if (prefixMatches.length > 1) {
    return {
      error: `Comparison ID prefix "${idOrName}" is ambiguous. Use a full ID.`,
    };
  }

  return { error: `No local TDD screenshot found for "${idOrName}".` };
}

export function showTddScreenshot(
  idOrName,
  options = {},
  workingDir = process.cwd()
) {
  let selected = readLocalComparison(idOrName, workingDir);
  if (selected.error) {
    reportError(selected.error);
    return null;
  }

  let { kinds, error } = getImageKinds(options.image);
  if (error) {
    reportError(error);
    return null;
  }

  let { local, comparison } = selected;
  let comparisonFacts = { ...comparison };
  delete comparisonFacts.baseline;
  delete comparisonFacts.current;
  delete comparisonFacts.diff;
  let detail = {
    comparison: comparisonFacts,
    images: imageReferences(comparison, local.vizzlyDir, kinds),
    details: readComparisonDetails(local.vizzlyDir)[comparison.id] || {},
  };

  if (output.isJson()) {
    output.data(detail);
    return detail;
  }

  let { properties = {} } = comparison;
  let viewport = getViewport(properties);
  output.print(`${comparison.name} · ${comparison.status}`);
  output.print(`ID: ${comparison.id}`);
  if (comparison.signature) output.print(`Signature: ${comparison.signature}`);
  if (Number.isFinite(comparison.diffPercentage)) {
    output.print(`Difference: ${comparison.diffPercentage.toFixed(2)}%`);
  }
  if (properties.browser) output.print(`Browser: ${properties.browser}`);
  if (viewport.width && viewport.height) {
    output.print(`Viewport: ${viewport.width}×${viewport.height}`);
  }
  if (comparison.error) output.print(`Error: ${comparison.error}`);
  if (comparison.reason) output.print(`Reason: ${comparison.reason}`);

  for (let kind of kinds) {
    let image = detail.images[kind];
    let imageLabel = image
      ? `${image.path}${image.exists ? '' : ' (missing)'}`
      : 'not available';
    output.print(`${kind}: ${imageLabel}`);
  }

  return detail;
}

function removeComparisonDetails(comparison, vizzlyDir, writeFile) {
  let detailsPath = join(vizzlyDir, 'comparison-details.json');
  if (!existsSync(detailsPath)) return;

  let details;
  try {
    details = JSON.parse(readFileSync(detailsPath, 'utf8'));
  } catch {
    return;
  }

  if (
    !details ||
    typeof details !== 'object' ||
    Array.isArray(details) ||
    !Object.hasOwn(details, comparison.id)
  ) {
    return;
  }

  delete details[comparison.id];
  writeFile(detailsPath, JSON.stringify(details));
}

function updateReportAfterAccept(report, comparison, baselinePath) {
  let timestamp = Date.now();
  let updatedComparison = {
    ...comparison,
    status: 'passed',
    baseline: baselinePath
      ? `/images/baselines/${basename(baselinePath)}`
      : comparison.baseline,
    diffPercentage: 0,
    diff: null,
  };
  let comparisons = report.comparisons.map(item =>
    item.id === comparison.id
      ? {
          ...updatedComparison,
          initialStatus: item.initialStatus || item.status,
        }
      : item
  );

  return {
    ...report,
    timestamp,
    comparisons,
    summary: {
      total: comparisons.length,
      passed: comparisons.filter(item =>
        ['passed', 'baseline-created', 'new'].includes(item.status)
      ).length,
      failed: comparisons.filter(item => item.status === 'failed').length,
      rejected: comparisons.filter(item => item.status === 'rejected').length,
      errors: comparisons.filter(item => item.status === 'error').length,
    },
  };
}

export async function acceptTddScreenshot(
  idOrName,
  workingDir = process.cwd(),
  deps = {}
) {
  let {
    loadConfig = defaultLoadConfig,
    TddService = defaultTddService,
    writeFile = writeFileSync,
    output: commandOutput = output,
  } = deps;

  let selected = readLocalComparison(idOrName, workingDir);
  if (selected.error) {
    reportError(selected.error, commandOutput);
    return null;
  }

  let { local, comparison } = selected;
  try {
    let config = await loadConfig();
    let service = new TddService(config, local.projectDir);
    await service.loadBaseline();
    let accepted = await service.acceptBaseline(comparison);
    let signature = generateScreenshotSignature(
      comparison.name,
      comparison.properties || {},
      service.signatureProperties
    );
    let baseline = service.baselineData?.screenshots?.find(
      item => item.signature === signature
    );

    writeFile(
      join(local.vizzlyDir, 'report-data.json'),
      JSON.stringify(
        updateReportAfterAccept(local.report, comparison, baseline?.path)
      )
    );
    removeComparisonDetails(comparison, local.vizzlyDir, writeFile);

    let data = {
      id: comparison.id,
      name: comparison.name,
      status: accepted.status,
      baseline: baseline?.path ?? null,
    };
    if (commandOutput.isJson()) {
      commandOutput.data(data);
    } else {
      commandOutput.success(
        `Accepted ${comparison.name} as the local baseline`,
        {
          baseline: data.baseline,
        }
      );
    }
    return data;
  } catch (error) {
    reportError(
      `Failed to accept ${comparison.name}: ${error.message}`,
      commandOutput
    );
    return null;
  }
}
