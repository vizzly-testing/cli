#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { init } from './commands/init.js';
import { uploadCommand, validateUploadOptions } from './commands/upload.js';
import { runCommand, validateRunOptions } from './commands/run.js';
import { statusCommand, validateStatusOptions } from './commands/status.js';
import { doctorCommand, validateDoctorOptions } from './commands/doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

program
  .name('vizzly')
  .description('Vizzly CLI for visual regression testing')
  .version(packageJson.version)
  .option('-c, --config <path>', 'Config file path')
  .option('--token <token>', 'Vizzly API token')
  .option('-p, --project <id>', 'Project override')
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
  .option('--branch <branch>', 'Git branch')
  .option('--commit <sha>', 'Git commit SHA')
  .option('--message <msg>', 'Commit message')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
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
  .command('run')
  .description('Run tests with Vizzly integration')
  .argument('<command>', 'Test command to run')
  .option('--tdd', 'Enable TDD mode with auto-reload')
  .option('--port <port>', 'Port for screenshot server', '47392')
  .option('-b, --build-name <name>', 'Custom build name')
  .option('--branch <branch>', 'Git branch override')
  .option('--commit <sha>', 'Git commit SHA')
  .option('--message <msg>', 'Commit message')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--eager', 'Create build immediately (default: lazy)')
  .option('--allow-no-token', 'Allow running without API token')
  .option('--baseline-build <id>', 'Use specific build as baseline')
  .option('--baseline-comparison <id>', 'Use specific comparison as baseline')
  .action(async (command, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateRunOptions(command, options);
    if (validationErrors.length > 0) {
      console.error('Validation errors:');
      validationErrors.forEach(error => console.error(`  - ${error}`));
      process.exit(1);
    }

    await runCommand(command, options, globalOptions);
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
