#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { doctorCommand, validateDoctorOptions } from './commands/doctor.js';
import {
  finalizeCommand,
  validateFinalizeOptions,
} from './commands/finalize.js';
import { init } from './commands/init.js';
import {
  previewCommand,
  validatePreviewOptions,
} from './commands/preview.js';
import { loginCommand, validateLoginOptions } from './commands/login.js';
import { logoutCommand, validateLogoutOptions } from './commands/logout.js';
import {
  projectListCommand,
  projectRemoveCommand,
  projectSelectCommand,
  projectTokenCommand,
  validateProjectOptions,
} from './commands/project.js';
import { runCommand, validateRunOptions } from './commands/run.js';
import { statusCommand, validateStatusOptions } from './commands/status.js';
import { tddCommand, validateTddOptions } from './commands/tdd.js';
import {
  runDaemonChild,
  tddStartCommand,
  tddStatusCommand,
  tddStopCommand,
} from './commands/tdd-daemon.js';
import { uploadCommand, validateUploadOptions } from './commands/upload.js';
import { validateWhoamiOptions, whoamiCommand } from './commands/whoami.js';
import { createPluginServices } from './plugin-api.js';
import { loadPlugins } from './plugin-loader.js';
import { createServices } from './services/index.js';
import {
  generateStaticReport,
  getReportFileUrl,
} from './services/static-report-generator.js';
import { openBrowser } from './utils/browser.js';
import { colors } from './utils/colors.js';
import { loadConfig } from './utils/config-loader.js';
import { getContext } from './utils/context.js';
import * as output from './utils/output.js';
import { getPackageVersion } from './utils/package-info.js';

// Custom help formatting with Observatory design system
const formatHelp = (cmd, helper) => {
  let c = colors;
  let lines = [];
  let isRootCommand = !cmd.parent;
  let version = getPackageVersion();

  // Branded header with grizzly bear
  lines.push('');
  if (isRootCommand) {
    // Cute grizzly bear mascot with square eyes (like the Vizzly logo!)
    lines.push(c.brand.amber('   ʕ□ᴥ□ʔ'));
    lines.push(`   ${c.brand.amber(c.bold('vizzly'))} ${c.dim(`v${version}`)}`);
    lines.push(`   ${c.gray('Visual regression testing for UI teams')}`);
  } else {
    // Compact header for subcommands
    lines.push(`  ${c.brand.amber(c.bold('vizzly'))} ${c.white(cmd.name())}`);
    let desc = cmd.description();
    if (desc) {
      lines.push(`  ${c.gray(desc)}`);
    }
  }
  lines.push('');

  // Usage
  let usage = helper.commandUsage(cmd).replace('Usage: ', '');
  lines.push(`  ${c.dim('Usage')}  ${c.white(usage)}`);
  lines.push('');

  // Get all subcommands
  let commands = helper.visibleCommands(cmd);

  if (commands.length > 0) {
    if (isRootCommand) {
      // Group commands by category for root help with icons
      let categories = [
        {
          key: 'core',
          icon: '▸',
          title: 'Core',
          names: ['run', 'tdd', 'upload', 'status', 'finalize'],
        },
        { key: 'setup', icon: '▸', title: 'Setup', names: ['init', 'doctor'] },
        {
          key: 'auth',
          icon: '▸',
          title: 'Account',
          names: ['login', 'logout', 'whoami'],
        },
        {
          key: 'project',
          icon: '▸',
          title: 'Projects',
          names: [
            'project:select',
            'project:list',
            'project:token',
            'project:remove',
          ],
        },
      ];

      let grouped = { core: [], setup: [], auth: [], project: [], other: [] };

      for (let command of commands) {
        let name = command.name();
        if (name === 'help') continue;

        let found = false;
        for (let cat of categories) {
          if (cat.names.includes(name)) {
            grouped[cat.key].push(command);
            found = true;
            break;
          }
        }
        if (!found) grouped.other.push(command);
      }

      for (let cat of categories) {
        let cmds = grouped[cat.key];
        if (cmds.length === 0) continue;

        lines.push(`  ${c.brand.amber(cat.icon)} ${c.bold(cat.title)}`);
        for (let command of cmds) {
          let name = command.name();
          let desc = command.description() || '';
          // Truncate long descriptions
          if (desc.length > 48) desc = `${desc.substring(0, 45)}...`;
          lines.push(`      ${c.white(name.padEnd(18))} ${c.gray(desc)}`);
        }
        lines.push('');
      }

      // Plugins (other commands from plugins)
      if (grouped.other.length > 0) {
        lines.push(`  ${c.brand.amber('▸')} ${c.bold('Plugins')}`);
        for (let command of grouped.other) {
          let name = command.name();
          let desc = command.description() || '';
          if (desc.length > 48) desc = `${desc.substring(0, 45)}...`;
          lines.push(`      ${c.white(name.padEnd(18))} ${c.gray(desc)}`);
        }
        lines.push('');
      }
    } else {
      // For subcommands, simple list
      lines.push(`  ${c.brand.amber('▸')} ${c.bold('Commands')}`);
      for (let command of commands) {
        let name = command.name();
        if (name === 'help') continue;
        let desc = command.description() || '';
        if (desc.length > 48) desc = `${desc.substring(0, 45)}...`;
        lines.push(`      ${c.white(name.padEnd(18))} ${c.gray(desc)}`);
      }
      lines.push('');
    }
  }

  // Options - use dimmer styling for less visual weight
  let options = helper.visibleOptions(cmd);
  if (options.length > 0) {
    lines.push(`  ${c.brand.amber('▸')} ${c.bold('Options')}`);
    for (let option of options) {
      let flags = option.flags;
      let desc = option.description || '';
      if (desc.length > 40) desc = `${desc.substring(0, 37)}...`;
      lines.push(`      ${c.cyan(flags.padEnd(22))} ${c.dim(desc)}`);
    }
    lines.push('');
  }

  // Quick start examples (only for root command)
  if (isRootCommand) {
    lines.push(`  ${c.brand.amber('▸')} ${c.bold('Quick Start')}`);
    lines.push('');
    lines.push(`      ${c.dim('# Local visual testing')}`);
    lines.push(`      ${c.gray('$')} ${c.white('vizzly tdd start')}`);
    lines.push('');
    lines.push(`      ${c.dim('# CI pipeline')}`);
    lines.push(
      `      ${c.gray('$')} ${c.white('vizzly run "npm test" --wait')}`
    );
    lines.push('');
  }

  // Dynamic context section (only for root)
  if (isRootCommand) {
    let contextItems = getContext();
    if (contextItems.length > 0) {
      lines.push(`  ${c.dim('─'.repeat(52))}`);
      for (let item of contextItems) {
        if (item.type === 'success') {
          lines.push(
            `  ${c.green('✓')} ${c.gray(item.label)}  ${c.white(item.value)}`
          );
        } else if (item.type === 'warning') {
          lines.push(
            `  ${c.yellow('!')} ${c.gray(item.label)}  ${c.yellow(item.value)}`
          );
        } else {
          lines.push(
            `  ${c.dim('○')} ${c.gray(item.label)}  ${c.dim(item.value)}`
          );
        }
      }
      lines.push('');
    }
  }

  // Footer with links
  lines.push(`  ${c.dim('─'.repeat(52))}`);
  lines.push(
    `  ${c.dim('Docs')} ${c.cyan(c.underline('docs.vizzly.dev'))}  ${c.dim('GitHub')} ${c.cyan(c.underline('github.com/vizzly-testing/cli'))}`
  );
  lines.push('');

  return lines.join('\n');
};

program
  .name('vizzly')
  .description('Vizzly CLI for visual regression testing')
  .version(getPackageVersion())
  .option('-c, --config <path>', 'Config file path')
  .option('--token <token>', 'Vizzly API token')
  .option('-v, --verbose', 'Verbose output (shorthand for --log-level debug)')
  .option(
    '--log-level <level>',
    'Log level: debug, info, warn, error (default: info, or VIZZLY_LOG_LEVEL env var)'
  )
  .option('--json', 'Machine-readable output')
  .option('--color', 'Force colored output (even in non-TTY)')
  .option('--no-color', 'Disable colored output')
  .configureHelp({ formatHelp });

// Load plugins before defining commands
// We need to manually parse to get the config option early
let configPath = null;
let verboseMode = false;
let logLevelArg = null;
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
  if (process.argv[i] === '--log-level' && process.argv[i + 1]) {
    logLevelArg = process.argv[i + 1];
  }
}

// Configure output early
// Priority: --log-level > --verbose > VIZZLY_LOG_LEVEL env var > default ('info')
// Color priority: --no-color (off) > --color (on) > auto-detect
let colorOverride;
if (process.argv.includes('--no-color')) {
  colorOverride = false;
} else if (process.argv.includes('--color')) {
  colorOverride = true;
}
output.configure({
  logLevel: logLevelArg,
  verbose: verboseMode,
  color: colorOverride,
  json: process.argv.includes('--json'),
});

const config = await loadConfig(configPath, {});
const services = createServices(config);
const pluginServices = createPluginServices(services);

let plugins = [];
try {
  plugins = await loadPlugins(configPath, config);

  for (const plugin of plugins) {
    try {
      // Add timeout protection for plugin registration (5 seconds)
      const registerPromise = plugin.register(program, {
        config,
        services: pluginServices,
        output,
        // Backwards compatibility alias for plugins using old API
        logger: output,
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Plugin registration timeout (5s)')),
          5000
        )
      );

      await Promise.race([registerPromise, timeoutPromise]);
      output.debug(`Registered plugin: ${plugin.name}`);
    } catch (error) {
      output.warn(`Failed to register plugin ${plugin.name}: ${error.message}`);
    }
  }
} catch (error) {
  output.debug(`Plugin loading failed: ${error.message}`);
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
      process.exit(1);
    }

    await uploadCommand(path, options, globalOptions);
  });

// TDD command with subcommands - Local visual testing with interactive dashboard
const tddCmd = program
  .command('tdd')
  .description('Run tests in TDD mode with local visual comparisons');

// TDD Start - Background server
tddCmd
  .command('start')
  .description('Start background TDD server with dashboard')
  .option('--port <port>', 'Port for TDD server', '47392')
  .option('--open', 'Open dashboard in browser')
  .option('--baseline-build <id>', 'Use specific build as baseline')
  .option('--baseline-comparison <id>', 'Use specific comparison as baseline')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', parseFloat)
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--fail-on-diff', 'Fail tests when visual differences are detected')
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

// TDD Run - One-off test run with ephemeral server (generates static report)
tddCmd
  .command('run <command>')
  .description('Run tests once in TDD mode with local visual comparisons')
  .option('--port <port>', 'Port for TDD server', '47392')
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
  .option('--fail-on-diff', 'Fail tests when visual differences are detected')
  .option('--no-open', 'Skip opening report in browser')
  .action(async (command, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validateTddOptions(command, options);
    if (validationErrors.length > 0) {
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
      process.exit(1);
    }

    const { result, cleanup } = await tddCommand(
      command,
      options,
      globalOptions
    );

    // Track cleanup state to prevent double cleanup
    let isCleaningUp = false;
    const handleCleanup = async () => {
      if (isCleaningUp) return;
      isCleaningUp = true;
      await cleanup();
    };

    // Set up cleanup on process signals
    const sigintHandler = () => {
      handleCleanup().then(() => process.exit(result?.exitCode || 0));
    };
    const sigtermHandler = () => {
      handleCleanup().then(() => process.exit(result?.exitCode || 0));
    };

    process.once('SIGINT', sigintHandler);
    process.once('SIGTERM', sigtermHandler);

    // If there are comparisons, generate static report
    const hasComparisons = result?.comparisons?.length > 0;
    if (hasComparisons) {
      // Note: Tests have completed at this point, so report-data.json is stable.
      // The report reflects the final state of all comparisons.
      const reportResult = await generateStaticReport(process.cwd());

      if (reportResult.success) {
        const reportUrl = getReportFileUrl(reportResult.reportPath);
        output.print(
          `  ${colors.brand.textTertiary('→')} Report: ${colors.blue(reportUrl)}`
        );
        output.blank();

        // Open report in browser unless --no-open
        if (options.open !== false) {
          await openBrowser(reportUrl);
        }
      } else {
        output.warn(`Failed to generate static report: ${reportResult.error}`);
      }
    }

    // Remove signal handlers before normal cleanup to prevent double cleanup
    process.off('SIGINT', sigintHandler);
    process.off('SIGTERM', sigtermHandler);

    await handleCleanup();
    process.exit(result?.exitCode || 0);
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
      process.exit(1);
    }

    try {
      const result = await runCommand(command, options, globalOptions);
      if (result && !result.success && result.exitCode > 0) {
        process.exit(result.exitCode);
      }
    } catch (error) {
      output.error('Command failed', error);
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
      process.exit(1);
    }

    await finalizeCommand(parallelId, options, globalOptions);
  });

program
  .command('preview')
  .description('Upload static files as a preview for a build')
  .argument('<path>', 'Path to static files (dist/, build/, out/)')
  .option('-b, --build <id>', 'Build ID to attach preview to')
  .option('-p, --parallel-id <id>', 'Look up build by parallel ID')
  .option('--base <path>', 'Override auto-detected base path')
  .option('--open', 'Open preview URL in browser after upload')
  .action(async (path, options) => {
    const globalOptions = program.opts();

    // Validate options
    const validationErrors = validatePreviewOptions(path, options);
    if (validationErrors.length > 0) {
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
      process.exit(1);
    }

    await previewCommand(path, options, globalOptions);
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
      output.error('Validation errors:');
      for (let error of validationErrors) {
        output.printErr(`  - ${error}`);
      }
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
