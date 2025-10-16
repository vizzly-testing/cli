#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { init } from './commands/init.js';
import { uploadCommand, validateUploadOptions } from './commands/upload.js';
import { runCommand, validateRunOptions } from './commands/run.js';
import { tddCommand, validateTddOptions } from './commands/tdd.js';
import {
  tddStartCommand,
  tddStopCommand,
  tddStatusCommand,
  runDaemonChild,
} from './commands/tdd-daemon.js';
import { statusCommand, validateStatusOptions } from './commands/status.js';
import {
  finalizeCommand,
  validateFinalizeOptions,
} from './commands/finalize.js';
import { doctorCommand, validateDoctorOptions } from './commands/doctor.js';
import { loginCommand, validateLoginOptions } from './commands/login.js';
import { logoutCommand, validateLogoutOptions } from './commands/logout.js';
import { whoamiCommand, validateWhoamiOptions } from './commands/whoami.js';
import {
  projectSelectCommand,
  projectListCommand,
  projectTokenCommand,
  projectRemoveCommand,
  validateProjectOptions,
} from './commands/project.js';
import { getPackageVersion } from './utils/package-info.js';
import { loadPlugins } from './plugin-loader.js';
import { loadConfig } from './utils/config-loader.js';
import { createComponentLogger } from './utils/logger-factory.js';
import { createServiceContainer } from './container/index.js';

program
  .name('vizzly')
  .description('Vizzly CLI for visual regression testing')
  .version(getPackageVersion())
  .option('-c, --config <path>', 'Config file path')
  .option('--token <token>', 'Vizzly API token')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Machine-readable output')
  .option('--no-color', 'Disable colored output');

// Load plugins before defining commands
// We need to manually parse to get the config option early
let configPath = null;
let verboseMode = false;
for (let i = 0; i < process.argv.length; i++) {
  if (
    (process.argv[i] === '-c' || process.argv[i] === '--config') &&
    process.argv[i + 1]
  ) {
    configPath = process.argv[i + 1];
  }
  if (process.argv[i] === '-v' || process.argv[i] === '--verbose') {
    verboseMode = true;
  }
}

let config = await loadConfig(configPath, {});
let logger = createComponentLogger('CLI', {
  level: config.logLevel || (verboseMode ? 'debug' : 'warn'),
  verbose: verboseMode || false,
});
let container = await createServiceContainer(config);

let plugins = [];
try {
  plugins = await loadPlugins(configPath, config, logger);

  for (let plugin of plugins) {
    try {
      // Add timeout protection for plugin registration (5 seconds)
      let registerPromise = plugin.register(program, {
        config,
        logger,
        services: container,
      });
      let timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Plugin registration timeout (5s)')),
          5000
        )
      );

      await Promise.race([registerPromise, timeoutPromise]);
      logger.debug(`Registered plugin: ${plugin.name}`);
    } catch (error) {
      logger.warn(`Failed to register plugin ${plugin.name}: ${error.message}`);
    }
  }
} catch (error) {
  logger.debug(`Plugin loading failed: ${error.message}`);
}

program
  .command('init')
  .description('Initialize Vizzly in your project')
  .option('--force', 'Overwrite existing configuration')
  .action(async options => {
    const globalOptions = program.opts();
    await init({ ...globalOptions, ...options, plugins });
  });

program
  .command('upload')
  .description('Upload screenshots to Vizzly')
  .argument('<path>', 'Path to screenshots directory or file')
  .option('-b, --build-name <name>', 'Build name for grouping')
  .option('-m, --metadata <json>', 'Additional metadata as JSON')
  .option('--batch-size <n>', 'Upload batch size', v => parseInt(v, 10))
  .option('--upload-timeout <ms>', 'Upload timeout in milliseconds', v =>
    parseInt(v, 10)
  )
  .option('--branch <branch>', 'Git branch')
  .option('--commit <sha>', 'Git commit SHA')
  .option('--message <msg>', 'Commit message')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
  .option('--upload-all', 'Upload all screenshots without SHA deduplication')
  .option('--parallel-id <id>', 'Unique identifier for parallel test execution')
  .action(async (path, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateUploadOptions(path, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await uploadCommand(path, options, globalOptions);
  });

// TDD command with subcommands
const tddCmd = program
  .command('tdd')
  .description('Run tests in TDD mode with local visual comparisons');

// TDD Start - Background server
tddCmd
  .command('start')
  .description('Start background TDD server')
  .option('--port <port>', 'Port for screenshot server', '47392')
  .option('--open', 'Open dashboard in browser')
  .option('--baseline-build <id>', 'Use specific build as baseline')
  .option('--baseline-comparison <id>', 'Use specific comparison as baseline')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--token <token>', 'API token override')
  .option('--daemon-child', 'Internal: run as daemon child process')
  .action(async options => {
    const globalOptions = program.opts();

    // If this is a daemon child process, run the server directly
    if (options.daemonChild) {
      await runDaemonChild(options, globalOptions);
      return;
    }

    await tddStartCommand(options, globalOptions);
  });

// TDD Stop - Kill background server
tddCmd
  .command('stop')
  .description('Stop background TDD server')
  .action(async options => {
    const globalOptions = program.opts();
    await tddStopCommand(options, globalOptions);
  });

// TDD Status - Check server status
tddCmd
  .command('status')
  .description('Check TDD server status')
  .action(async options => {
    const globalOptions = program.opts();
    await tddStatusCommand(options, globalOptions);
  });

// TDD Run - One-off test run (primary workflow)
tddCmd
  .command('run <command>')
  .description('Run tests once in TDD mode with local visual comparisons')
  .option('--port <port>', 'Port for screenshot server', '47392')
  .option('--branch <branch>', 'Git branch override')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--token <token>', 'API token override')
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--baseline-build <id>', 'Use specific build as baseline')
  .option('--baseline-comparison <id>', 'Use specific comparison as baseline')
  .option(
    '--set-baseline',
    'Accept current screenshots as new baseline (overwrites existing)'
  )
  .action(async (command, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateTddOptions(command, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    const { result, cleanup } = await tddCommand(
      command,
      options,
      globalOptions
    );

    // Set up cleanup on process signals
    const handleCleanup = async () => {
      await cleanup();
    };

    process.once('SIGINT', () => {
      handleCleanup().then(() => process.exit(1));
    });

    process.once('SIGTERM', () => {
      handleCleanup().then(() => process.exit(1));
    });

    if (result && !result.success && result.exitCode > 0) {
      await cleanup();
      process.exit(result.exitCode);
    }

    await cleanup();
  });

program
  .command('run')
  .description('Run tests with Vizzly integration')
  .argument('<command>', 'Test command to run')
  .option('--port <port>', 'Port for screenshot server', '47392')
  .option('-b, --build-name <name>', 'Custom build name')
  .option('--branch <branch>', 'Git branch override')
  .option('--commit <sha>', 'Git commit SHA')
  .option('--message <msg>', 'Commit message')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--allow-no-token', 'Allow running without API token')
  .option('--upload-all', 'Upload all screenshots without SHA deduplication')
  .option('--parallel-id <id>', 'Unique identifier for parallel test execution')
  .action(async (command, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateRunOptions(command, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    try {
      const result = await runCommand(command, options, globalOptions);
      if (result && !result.success && result.exitCode > 0) {
        process.exit(result.exitCode);
      }
    } catch (error) {
      console.error('Command failed:', error.message);
      if (globalOptions.verbose) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check the status of a build')
  .argument('<build-id>', 'Build ID to check status for')
  .action(async (buildId, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateStatusOptions(buildId, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await statusCommand(buildId, options, globalOptions);
  });

program
  .command('finalize')
  .description('Finalize a parallel build after all shards complete')
  .argument('<parallel-id>', 'Parallel ID to finalize')
  .action(async (parallelId, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateFinalizeOptions(parallelId, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await finalizeCommand(parallelId, options, globalOptions);
  });

program
  .command('doctor')
  .description('Run diagnostics to check your environment and configuration')
  .option('--api', 'Include API connectivity checks')
  .action(async options => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateDoctorOptions(options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await doctorCommand(options, globalOptions);
  });

program
  .command('login')
  .description('Authenticate with your Vizzly account')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateLoginOptions(options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await loginCommand(options, globalOptions);
  });

program
  .command('logout')
  .description('Clear stored authentication tokens')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateLogoutOptions(options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await logoutCommand(options, globalOptions);
  });

program
  .command('whoami')
  .description('Show current authentication status and user information')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateWhoamiOptions(options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await whoamiCommand(options, globalOptions);
  });

program
  .command('project:select')
  .description('Configure project for current directory')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateProjectOptions(options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await projectSelectCommand(options, globalOptions);
  });

program
  .command('project:list')
  .description('Show all configured projects')
  .action(async options => {
    const globalOptions = program.opts();

    await projectListCommand(options, globalOptions);
  });

program
  .command('project:token')
  .description('Show project token for current directory')
  .action(async options => {
    const globalOptions = program.opts();

    await projectTokenCommand(options, globalOptions);
  });

program
  .command('project:remove')
  .description('Remove project configuration for current directory')
  .action(async options => {
    const globalOptions = program.opts();

    await projectRemoveCommand(options, globalOptions);
  });

program.parse();
