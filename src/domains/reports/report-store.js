import {
  existsSync as defaultExistsSync,
  readFileSync as defaultReadFileSync,
  unlinkSync as defaultUnlinkSync,
  writeFileSync as defaultWriteFileSync,
} from 'node:fs';
import { join as defaultJoin } from 'node:path';
import * as defaultOutput from '../../services/output.js';
import { createEmptyReport } from './report-state.js';

/** The local report has one lightweight watched file and one heavy-details file. */
export function createReportStore(workingDir, io = {}) {
  let {
    existsSync = defaultExistsSync,
    readFileSync = defaultReadFileSync,
    writeFileSync = defaultWriteFileSync,
    unlinkSync = defaultUnlinkSync,
    join = defaultJoin,
    output = defaultOutput,
  } = io;
  let paths = {
    report: join(workingDir, '.vizzly', 'report-data.json'),
    details: join(workingDir, '.vizzly', 'comparison-details.json'),
    baseline: join(workingDir, '.vizzly', 'baselines', 'metadata.json'),
  };

  function readJson(filename) {
    return existsSync(filename)
      ? JSON.parse(readFileSync(filename, 'utf8'))
      : null;
  }

  function readReport() {
    return readJson(paths.report);
  }

  function readBaselineMetadata() {
    try {
      return readJson(paths.baseline);
    } catch {
      return null;
    }
  }

  function readSnapshot() {
    let report = readReport();
    return report ? { ...report, baseline: readBaselineMetadata() } : null;
  }

  function readDetails() {
    try {
      return readJson(paths.details) || {};
    } catch (error) {
      output.debug('Failed to read comparison details:', error);
      return {};
    }
  }

  function writeReport(report) {
    writeFileSync(paths.report, JSON.stringify(report));
  }

  function updateDetails(id, fields) {
    let hasData = Object.values(fields).some(
      value => value != null && (!Array.isArray(value) || value.length > 0)
    );
    if (!hasData) return;
    let details = readDetails();
    details[id] = fields;
    writeFileSync(paths.details, JSON.stringify(details));
  }

  function removeDetails(id) {
    let details = readDetails();
    delete details[id];
    writeFileSync(paths.details, JSON.stringify(details));
  }

  function reset() {
    writeReport(createEmptyReport(Date.now()));
    if (existsSync(paths.details))
      writeFileSync(paths.details, JSON.stringify({}));
  }

  function clear() {
    for (let filename of [paths.report, paths.details]) {
      if (existsSync(filename)) unlinkSync(filename);
    }
  }

  return {
    paths,
    readReport,
    readSnapshot,
    readBaselineMetadata,
    readDetails,
    writeReport,
    updateDetails,
    removeDetails,
    reset,
    clear,
  };
}
