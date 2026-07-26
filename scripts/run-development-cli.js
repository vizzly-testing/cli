import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let targets = {
  production: {
    apiUrl: null,
    home: join(homedir(), '.vizzly', 'development', 'production'),
  },
  local: {
    apiUrl: 'http://localhost:3000',
    home: join(homedir(), '.vizzly', 'development', 'local'),
  },
};

/**
 * Resolve the durable dogfood project token before starting the CLI.
 *
 * Resolving the saved account at the development boundary makes API target,
 * Vizzly home, and credential one atomic choice instead of inheriting an
 * unrelated token from the shell.
 *
 * @param {string} home - Target-specific Vizzly home.
 * @returns {string|null} Existing project token, without logging it.
 */
function getDevelopmentToken(home) {
  let configPath = join(home, 'config.json');
  if (!existsSync(configPath)) {
    return null;
  }

  let config = JSON.parse(readFileSync(configPath, 'utf8'));
  let account = config.projectLink?.active;
  let link = account ? config.projectLink.links?.[account] : null;
  if (!link) {
    return null;
  }

  if (link.storage !== 'keychain') {
    return link.token || null;
  }

  try {
    return (
      execFileSync(
        'security',
        ['find-generic-password', '-s', 'vizzly-cli', '-a', account, '-w'],
        { encoding: 'utf8' }
      ).trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * Run this checkout against one deterministic dogfood target.
 *
 * The development launcher owns target selection so ignored `.envrc` state
 * cannot cross a localhost API with production project credentials. Separate
 * Vizzly homes keep each linked project token durable without adding profiles,
 * migrations, or commands to the published CLI.
 *
 * @param {'production'|'local'} targetName - Dogfood target selected by pnpm.
 * @param {string[]} args - CLI arguments to forward unchanged.
 * @returns {number} Child-process exit code.
 */
function runDevelopmentCli(targetName, args) {
  let target = targets[targetName];
  if (!target) {
    process.stderr.write(
      `Unknown development target "${targetName}". Use production or local.\n`
    );
    return 1;
  }

  let env = {
    ...process.env,
    VIZZLY_HOME: target.home,
  };

  let token = getDevelopmentToken(target.home);
  if (token) {
    env.VIZZLY_TOKEN = token;
  } else {
    delete env.VIZZLY_TOKEN;
  }

  if (target.apiUrl) {
    env.VIZZLY_API_URL = target.apiUrl;
  } else {
    delete env.VIZZLY_API_URL;
  }

  let cliPath = fileURLToPath(new URL('../bin/vizzly.js', import.meta.url));
  let result = spawnSync(process.execPath, [cliPath, ...args], {
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    process.stderr.write(
      `Unable to start the development CLI: ${result.error.message}\n`
    );
    return 1;
  }

  return result.status ?? 1;
}

let [targetName, ...args] = process.argv.slice(2);
if (args[0] === '--') {
  args = args.slice(1);
}
process.exitCode = runDevelopmentCli(targetName, args);
