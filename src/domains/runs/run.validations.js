/**
 * Validate test command is provided
 * @param {string|undefined} testCommand - Test command to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateTestCommand(testCommand) {
  if (!testCommand) {
    return { valid: false, error: 'No test command provided' };
  }
  return { valid: true, error: null };
}
