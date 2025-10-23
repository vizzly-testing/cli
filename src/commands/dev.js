/**
 * Dev command - Local development mode with visual testing
 * This is the new unified command that replaces 'tdd'
 */

import { tddCommand, validateTddOptions } from './tdd.js';
import {
  tddStartCommand,
  tddStopCommand,
  tddStatusCommand,
} from './tdd-daemon.js';

/**
 * Dev command - runs tests with local visual comparisons
 * This is an alias for tddCommand but with dev-focused messaging
 *
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @returns {Promise<{result: Object, cleanup: Function}>}
 */
export async function devCommand(testCommand, options = {}, globalOptions = {}) {
  return tddCommand(testCommand, options, globalOptions);
}

/**
 * Dev start - Start background dev server
 * Alias for tddStartCommand with dev-focused messaging
 *
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @returns {Promise<void>}
 */
export async function devStartCommand(options = {}, globalOptions = {}) {
  return tddStartCommand(options, globalOptions);
}

/**
 * Dev stop - Stop background dev server
 * Alias for tddStopCommand
 *
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @returns {Promise<void>}
 */
export async function devStopCommand(options = {}, globalOptions = {}) {
  return tddStopCommand(options, globalOptions);
}

/**
 * Dev status - Check dev server status
 * Alias for tddStatusCommand
 *
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 * @returns {Promise<void>}
 */
export async function devStatusCommand(options = {}, globalOptions = {}) {
  return tddStatusCommand(options, globalOptions);
}

/**
 * Validate dev command options
 * Uses the same validation as TDD since they're functionally identical
 *
 * @param {string} testCommand - Test command to execute
 * @param {Object} options - Command options
 * @returns {Array<string>} Array of validation error messages
 */
export function validateDevOptions(testCommand, options) {
  return validateTddOptions(testCommand, options);
}
