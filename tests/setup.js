/**
 * Global test setup
 * Runs before all tests to ensure isolation from user's real config
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Create isolated test directory for VIZZLY_HOME
// This prevents tests from touching the user's real ~/.vizzly config
let testVizzlyHome = join(tmpdir(), `vizzly-test-${process.pid}-${Date.now()}`);

mkdirSync(testVizzlyHome, { recursive: true });
process.env.VIZZLY_HOME = testVizzlyHome;

// Clean up on exit
process.on('exit', () => {
  try {
    rmSync(testVizzlyHome, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});
