import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import {
  getBranch as getCIBranch,
  getCommit as getCICommit,
  getCommitMessage as getCICommitMessage,
  getPullRequestNumber,
} from './ci-env.js';

const execAsync = promisify(exec);

export async function getCommonAncestor(commit1, commit2, cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync(`git merge-base ${commit1} ${commit2}`, {
      cwd,
    });
    return stdout.trim();
  } catch {
    // If merge-base fails (e.g., no common ancestor), return null
    return null;
  }
}

export async function getCurrentCommitSha(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function getCurrentBranch(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd,
    });
    return stdout.trim();
  } catch {
    // Fallback strategy: use a simple, non-recursive approach
    // to avoid circular dependency with getDefaultBranch()
    return getCurrentBranchFallback(cwd);
  }
}

/**
 * Fallback strategy for getCurrentBranch that doesn't depend on getDefaultBranch()
 * to avoid circular dependencies. Uses a simple heuristic approach.
 */
async function getCurrentBranchFallback(cwd = process.cwd()) {
  // Try common default branches in order of likelihood
  const commonBranches = ['main', 'master', 'develop', 'dev'];

  for (const branch of commonBranches) {
    try {
      await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, {
        cwd,
      });
      return branch;
    } catch {}
  }

  // If none of the common branches exist, try to get any local branch
  try {
    const { stdout } = await execAsync(
      'git branch --format="%(refname:short)"',
      { cwd }
    );
    const branches = stdout
      .trim()
      .split('\n')
      .filter(b => b.trim());
    if (branches.length > 0) {
      return branches[0]; // Return the first available branch
    }
  } catch {
    // Git branch command failed
  }

  // Last resort: return null to indicate we couldn't determine the branch
  // This allows calling code to handle the situation (e.g., prompt user or use 'main')
  return null;
}

export async function getDefaultBranch(cwd = process.cwd()) {
  try {
    // Try to get the default branch from remote origin
    const { stdout } = await execAsync(
      'git symbolic-ref refs/remotes/origin/HEAD',
      { cwd }
    );
    const defaultBranch = stdout.trim().replace('refs/remotes/origin/', '');
    return defaultBranch;
  } catch {
    try {
      // Fallback: try to get default branch from git config
      const { stdout } = await execAsync(
        'git config --get init.defaultBranch',
        { cwd }
      );
      return stdout.trim();
    } catch {
      try {
        // Fallback: check if main exists
        await execAsync('git show-ref --verify --quiet refs/heads/main', {
          cwd,
        });
        return 'main';
      } catch {
        try {
          // Fallback: check if master exists
          await execAsync('git show-ref --verify --quiet refs/heads/master', {
            cwd,
          });
          return 'master';
        } catch {
          // If we're not in a git repo or no branches exist, return null
          // This allows the calling code to handle the situation appropriately
          return null;
        }
      }
    }
  }
}

export function generateBuildName() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `Build ${timestamp}`;
}

/**
 * Get the current commit message
 * @param {string} cwd - Working directory
 * @returns {Promise<string|null>} Commit message or null if not available
 */
export async function getCommitMessage(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git log -1 --pretty=%B', { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Detect commit message with override and environment variable support
 * @param {string} override - Commit message override from CLI
 * @param {string} cwd - Working directory
 * @returns {Promise<string|null>} Commit message or null if not available
 */
export async function detectCommitMessage(
  override = null,
  cwd = process.cwd()
) {
  if (override) return override;

  // Try CI environment variables first
  const ciCommitMessage = getCICommitMessage();
  if (ciCommitMessage) return ciCommitMessage;

  // Fallback to regular git log
  return await getCommitMessage(cwd);
}

/**
 * Check if the working directory is a git repository
 * @param {string} cwd - Working directory
 * @returns {Promise<boolean>}
 */
export async function isGitRepository(cwd = process.cwd()) {
  try {
    await execAsync('git rev-parse --git-dir', { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git status information
 * @param {string} cwd - Working directory
 * @returns {Promise<Object|null>} Git status info or null
 */
export async function getGitStatus(cwd = process.cwd()) {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd });
    const changes = stdout
      .trim()
      .split('\n')
      .filter(line => line);

    return {
      hasChanges: changes.length > 0,
      changes: changes.map(line => ({
        status: line.substring(0, 2),
        file: line.substring(3),
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Detect branch with override support
 * @param {string} override - Branch override from CLI
 * @param {string} cwd - Working directory
 * @returns {Promise<string>}
 */
export async function detectBranch(override = null, cwd = process.cwd()) {
  if (override) return override;

  // Try CI environment variables first
  const ciBranch = getCIBranch();
  if (ciBranch) return ciBranch;

  // Fallback to git command when no CI environment variables
  const currentBranch = await getCurrentBranch(cwd);
  return currentBranch || 'unknown';
}

/**
 * Detect commit SHA with override support
 * @param {string} override - Commit override from CLI
 * @param {string} cwd - Working directory
 * @returns {Promise<string|null>}
 */
export async function detectCommit(override = null, cwd = process.cwd()) {
  if (override) return override;

  // Try CI environment variables first
  const ciCommit = getCICommit();
  if (ciCommit) return ciCommit;

  // Fallback to git command when no CI environment variables
  return await getCurrentCommitSha(cwd);
}

/**
 * Generate build name with git information
 * @param {string} override - Build name override from CLI
 * @param {string} cwd - Working directory
 * @returns {Promise<string>}
 */
export async function generateBuildNameWithGit(
  override = null,
  cwd = process.cwd()
) {
  if (override) return override;

  const branch = await getCurrentBranch(cwd);
  const shortSha = await getCurrentCommitSha(cwd);

  if (branch && shortSha) {
    const shortCommit = shortSha.substring(0, 7);
    return `${branch}-${shortCommit}`;
  }

  return generateBuildName();
}

/**
 * Detect pull request number from CI environment
 * @returns {number|null} Pull request number or null if not in PR context
 */
export function detectPullRequestNumber() {
  return getPullRequestNumber();
}
