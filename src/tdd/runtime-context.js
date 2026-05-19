/**
 * Runtime context assembly for TddService constructor.
 * Keeps dependency merging and path bootstrap logic isolated and testable.
 */

export function buildTddDependencyOps(deps = {}, defaults = {}) {
  let {
    output = defaults.output,
    colors = defaults.colors,
    validatePathSecurity = defaults.validatePathSecurity,
    initializeDirectories = defaults.initializeDirectories,
    calculateHotspotCoverage = defaults.calculateHotspotCoverage,
    fs = {},
    api = {},
    metadata = {},
    baseline = {},
    comparison = {},
    signature = {},
    results = {},
  } = deps;

  let fsOps = { ...defaults.fs, ...fs };
  let apiOps = { ...defaults.api, ...api };
  let metadataOps = { ...defaults.metadata, ...metadata };
  let baselineOps = { ...defaults.baseline, ...baseline };
  let comparisonOps = { ...defaults.comparison, ...comparison };
  let signatureOps = { ...defaults.signature, ...signature };
  let resultsOps = { ...defaults.results, ...results };

  let runtimeDeps = {
    output,
    colors,
    validatePathSecurity,
    initializeDirectories,
    calculateHotspotCoverage,
    ...fsOps,
    ...apiOps,
    ...metadataOps,
    ...baselineOps,
    ...comparisonOps,
    ...signatureOps,
    ...resultsOps,
  };

  return {
    runtimeDeps,
    apiOps,
  };
}

export function resolveTddWorkingDirectory(
  workingDir,
  validatePathSecurity,
  output
) {
  try {
    return validatePathSecurity(workingDir, workingDir);
  } catch (error) {
    output.error(`Invalid working directory: ${error.message}`);
    throw new Error(`Working directory validation failed: ${error.message}`);
  }
}

export function resolveTddPaths(workingDir, initializeDirectories) {
  return initializeDirectories(workingDir);
}
