#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { init } from './commands/init.js';
import { uploadCommand, validateUploadOptions } from './commands/upload.js';
import { runCommand, validateRunOptions } from './commands/run.js';
import { tddCommand, validateTddOptions } from './commands/tdd.js';
import { statusCommand, validateStatusOptions } from './commands/status.js';
import { doctorCommand, validateDoctorOptions } from './commands/doctor.js';
import { getPackageVersion } from './utils/package-info.js';

program
  .name('vizzly')
  .description('Vizzly CLI for visual regression testing')
  .version(getPackageVersion())
  .option('-c, --config <path>', 'Config file path')
  .option('--token <token>', 'Vizzly API token')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Machine-readable output')
  .option('--no-color', 'Disable colored output');

program
  .command('init')
  .description('Initialize Vizzly in your project')
  .option('--force', 'Overwrite existing configuration')
  .action(async options => {
    const globalOptions = program.opts();
    await init({ ...globalOptions, ...options });
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

program
  .command('tdd')
  .description('Run tests in TDD mode with local visual comparisons')
  .argument('<command>', 'Test command to run')
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
  .option('--allow-no-token', 'Allow running without API token (no baselines)')
  .action(async (command, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateTddOptions(command, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    const result = await tddCommand(command, options, globalOptions);
    if (result && !result.success && result.exitCode > 0) {
      process.exit(result.exitCode);
    }
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

program.parse();
