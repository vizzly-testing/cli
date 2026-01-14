/**
 * Session management for build context
 *
 * Tracks the current build ID so subsequent commands (like `vizzly preview`)
 * can automatically attach to the right build without passing IDs around.
 *
 * Two mechanisms:
 * 1. Session file (.vizzly/session.json) - for local dev and same CI job
 * 2. GitHub Actions env ($GITHUB_ENV) - for cross-step persistence in GHA
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

let SESSION_DIR = '.vizzly';
let SESSION_FILE = 'session.json';
let SESSION_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get the session file path
 * @param {string} [cwd] - Working directory (defaults to process.cwd())
 * @returns {string} Path to session file
 */
export function getSessionPath(cwd = process.cwd()) {
  return join(cwd, SESSION_DIR, SESSION_FILE);
}

/**
 * Write build context to session file and GitHub Actions env
 *
 * @param {Object} context - Build context
 * @param {string} context.buildId - The build ID
 * @param {string} [context.branch] - Git branch
 * @param {string} [context.commit] - Git commit SHA
 * @param {string} [context.parallelId] - Parallel build ID
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @param {Object} [options.env] - Environment variables (defaults to process.env)
 */
export function writeSession(context, options = {}) {
  let { cwd = process.cwd(), env = process.env } = options;

  let session = {
    buildId: context.buildId,
    branch: context.branch || null,
    commit: context.commit || null,
    parallelId: context.parallelId || null,
    createdAt: new Date().toISOString(),
  };

  // Write session file
  let sessionPath = getSessionPath(cwd);
  let sessionDir = dirname(sessionPath);

  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }

  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, {
    mode: 0o600,
  });

  // Write to GitHub Actions environment
  if (env.GITHUB_ENV) {
    appendFileSync(env.GITHUB_ENV, `VIZZLY_BUILD_ID=${context.buildId}\n`);
  }

  // Also write to GitHub Actions output if we're in a step
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `build-id=${context.buildId}\n`);
  }
}

/**
 * Read build context from session file or environment
 *
 * Priority:
 * 1. VIZZLY_BUILD_ID environment variable
 * 2. Session file (if recent and optionally matching branch)
 *
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 * @param {string} [options.currentBranch] - Current git branch (for validation)
 * @param {Object} [options.env] - Environment variables
 * @param {number} [options.maxAgeMs] - Max session age in ms
 * @returns {Object|null} Session context or null if not found/invalid
 */
export function readSession(options = {}) {
  let {
    cwd = process.cwd(),
    currentBranch = null,
    env = process.env,
    maxAgeMs = SESSION_MAX_AGE_MS,
  } = options;

  // Check environment variable first
  if (env.VIZZLY_BUILD_ID) {
    return {
      buildId: env.VIZZLY_BUILD_ID,
      source: 'environment',
    };
  }

  // Try session file
  let sessionPath = getSessionPath(cwd);

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    let content = readFileSync(sessionPath, 'utf-8');
    let session = JSON.parse(content);

    // Validate required field
    if (!session.buildId) {
      return null;
    }

    // Check age
    let createdAt = new Date(session.createdAt);
    let age = Date.now() - createdAt.getTime();

    if (age > maxAgeMs) {
      return {
        ...session,
        source: 'session_file',
        expired: true,
        age,
      };
    }

    // Check branch match (if current branch provided)
    let branchMismatch = false;
    if (currentBranch && session.branch && session.branch !== currentBranch) {
      branchMismatch = true;
    }

    return {
      ...session,
      source: 'session_file',
      expired: false,
      branchMismatch,
      age,
    };
  } catch {
    return null;
  }
}

/**
 * Clear the session file
 *
 * @param {Object} [options] - Options
 * @param {string} [options.cwd] - Working directory
 */
export function clearSession(options = {}) {
  let { cwd = process.cwd() } = options;
  let sessionPath = getSessionPath(cwd);

  try {
    if (existsSync(sessionPath)) {
      writeFileSync(sessionPath, '');
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Format session age for display
 *
 * @param {number} ageMs - Age in milliseconds
 * @returns {string} Human-readable age
 */
export function formatSessionAge(ageMs) {
  let seconds = Math.floor(ageMs / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}
