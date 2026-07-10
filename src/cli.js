#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, statSync } from 'node:fs';
import { Option, program } from 'commander';
import { apiCommand, validateApiOptions } from './commands/api.js';
import {
  baselinesCommand,
  validateBaselinesOptions,
} from './commands/baselines.js';
import { buildsCommand, validateBuildsOptions } from './commands/builds.js';
import {
  comparisonsCommand,
  validateComparisonsOptions,
} from './commands/comparisons.js';
import { configCommand, validateConfigOptions } from './commands/config-cmd.js';
import {
  contextBuildCommand,
  contextComparisonCommand,
  contextReviewQueueCommand,
  contextScreenshotCommand,
  contextSimilarCommand,
  validateContextBuildOptions,
  validateContextComparisonOptions,
  validateContextReviewQueueOptions,
  validateContextScreenshotOptions,
  validateContextSimilarOptions,
} from './commands/context.js';
import { doctorCommand, validateDoctorOptions } from './commands/doctor.js';
import {
  finalizeCommand,
  validateFinalizeOptions,
} from './commands/finalize.js';
import { init } from './commands/init.js';
import { loginCommand, validateLoginOptions } from './commands/login.js';
import { logoutCommand, validateLogoutOptions } from './commands/logout.js';
import { orgsCommand, validateOrgsOptions } from './commands/orgs.js';
import { previewCommand, validatePreviewOptions } from './commands/preview.js';
import {
  projectLinkCommand,
  validateProjectLinkOptions,
} from './commands/project.js';
import {
  projectsCommand,
  validateProjectsOptions,
} from './commands/projects.js';
import {
  approveCommand,
  commentCommand,
  rejectCommand,
  validateApproveOptions,
  validateCommentOptions,
  validateRejectOptions,
} from './commands/review.js';
import { runCommand, validateRunOptions } from './commands/run.js';
import { statusCommand, validateStatusOptions } from './commands/status.js';
import { tddCommand, validateTddOptions } from './commands/tdd.js';
import {
  runDaemonChild,
  tddListCommand,
  tddStartCommand,
  tddStatusCommand,
  tddStopCommand,
  validateTddStartOptions,
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
import { withTimeout } from './utils/async-utils.js';
import { openBrowser } from './utils/browser.js';
import { colors } from './utils/colors.js';
import { loadConfig } from './utils/config-loader.js';
import { getContext } from './utils/context.js';
import { saveUserPath } from './utils/global-config.js';
import * as output from './utils/output.js';
import { getPackageVersion } from './utils/package-info.js';

// Custom help formatting with BearDen design system
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
    lines.push(`   ${c.gray('Visual regression testing from your terminal')}`);
  } else {
    // Compact header for subcommands
    lines.push(`  ${c.brand.amber(c.bold(commandPath(cmd)))}`);
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
          names: [
            'run',
            'tdd',
            'upload',
            'status',
            'context',
            'finalize',
            'preview',
            'builds',
            'comparisons',
          ],
        },
        {
          key: 'review',
          icon: '▸',
          title: 'Review',
          names: ['approve', 'reject', 'comment'],
        },
        {
          key: 'setup',
          icon: '▸',
          title: 'Setup',
          names: ['init', 'doctor', 'config', 'baselines', 'project'],
        },
        { key: 'advanced', icon: '▸', title: 'Advanced', names: ['api'] },
        {
          key: 'auth',
          icon: '▸',
          title: 'Account',
          names: ['login', 'logout', 'whoami', 'orgs', 'projects'],
        },
      ];

      let grouped = {
        core: [],
        review: [],
        setup: [],
        advanced: [],
        auth: [],
        other: [],
      };

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
    lines.push(`      ${c.dim('# Local visual review')}`);
    lines.push(`      ${c.gray('$')} ${c.white('vizzly tdd start --open')}`);
    lines.push('');
    lines.push(`      ${c.dim('# CI pipeline')}`);
    lines.push(
      `      ${c.gray('$')} ${c.white('vizzly run "pnpm test" --wait')}`
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

function commandPath(cmd) {
  let names = [];
  let current = cmd;

  while (current) {
    let name = current.name();
    if (name) {
      names.unshift(name);
    }
    current = current.parent;
  }

  return names.join(' ');
}

function extractGlobalOptionsFromArgv(argv, commandNames = null) {
  let configPath = null;
  let tokenArg = null;
  let verboseMode = false;
  let logLevelArg = null;
  let jsonArg = null;

  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '-c' || argv[i] === '--config') && argv[i + 1]) {
      configPath = argv[i + 1];
    }

    if (argv[i] === '--token' && argv[i + 1]) {
      tokenArg = argv[i + 1];
    } else if (argv[i].startsWith('--token=')) {
      tokenArg = argv[i].substring('--token='.length);
    }

    if (argv[i] === '-v' || argv[i] === '--verbose') {
      verboseMode = true;
    }

    if (argv[i] === '--log-level' && argv[i + 1]) {
      logLevelArg = argv[i + 1];
    }

    if (argv[i] === '--json') {
      let nextArg = argv[i + 1];
      let nextArgIsCommand = commandNames?.has(nextArg);

      if (nextArg && !nextArg.startsWith('-') && !nextArgIsCommand) {
        jsonArg = nextArg;
      } else {
        jsonArg = true;
      }
    } else if (argv[i].startsWith('--json=')) {
      jsonArg = argv[i].substring('--json='.length);
    }
  }

  return { configPath, tokenArg, verboseMode, logLevelArg, jsonArg };
}

function normalizeJsonArgv(argv, commandNames) {
  let normalizedArgv = [...argv];

  for (let i = 0; i < normalizedArgv.length; i++) {
    if (normalizedArgv[i] !== '--json') {
      continue;
    }

    let nextArg = normalizedArgv[i + 1];
    if (nextArg && !nextArg.startsWith('-') && commandNames.has(nextArg)) {
      normalizedArgv[i] = '--json=true';
    }
  }

  return normalizedArgv;
}

function findNestedCommandRequest(
  args,
  startIndex,
  subcommandNames,
  parentName
) {
  if (!subcommandNames?.size) {
    return null;
  }

  let valueOptions = new Set(['-c', '--config', '--token', '--log-level']);

  for (let i = startIndex; i < args.length; i++) {
    let arg = args[i];

    if (arg === '--') {
      return null;
    }

    if (valueOptions.has(arg)) {
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    return {
      name: arg,
      known: subcommandNames.has(arg),
      helpCommand: `vizzly ${parentName} --help`,
    };
  }

  return null;
}

function findRequestedCommand(
  argv,
  commandNames,
  nestedCommandNames = new Map()
) {
  let valueOptions = new Set(['-c', '--config', '--token', '--log-level']);
  let args = argv.slice(2);
  let jsonValueCandidate = null;

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];

    if (arg === '--') {
      return null;
    }

    if (arg === '--json') {
      let nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-') && !commandNames.has(nextArg)) {
        jsonValueCandidate = jsonValueCandidate || nextArg;
        i++;
      }
      continue;
    }

    if (valueOptions.has(arg)) {
      i++;
      continue;
    }

    if (arg.startsWith('--json=')) {
      continue;
    }

    if (arg.startsWith('--')) {
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    let known = commandNames.has(arg);
    if (known) {
      let nestedRequest = findNestedCommandRequest(
        args,
        i + 1,
        nestedCommandNames.get(arg),
        arg
      );
      if (nestedRequest && !nestedRequest.known) {
        return nestedRequest;
      }
    }

    return {
      name: arg,
      known,
    };
  }

  if (jsonValueCandidate) {
    return {
      name: jsonValueCandidate,
      known: false,
    };
  }

  return null;
}

function getGlobalOptions() {
  let options = program.opts();
  return {
    ...options,
    noColor: options.noColor || options.color === false,
  };
}

function reportValidationErrors(errors) {
  if (output.isJson()) {
    output.error('Validation errors', null, { errors });
  } else {
    output.error('Validation errors:');
    for (let error of errors) {
      output.printErr(`  - ${error}`);
    }
  }
  process.exit(1);
}

function formatCommanderError(message) {
  return message.replace(/^error:\s*/, '').trim();
}

function writeCommanderError(text) {
  let message = formatCommanderError(text);
  if (!message) {
    return;
  }

  if (output.isJson()) {
    if (message.startsWith('(')) {
      return;
    }
    output.error(message);
  } else {
    process.stderr.write(text);
    if (!text.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }
}

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
  .option(
    '--json [fields]',
    'JSON output, optionally specify fields (e.g., --json id,status,branch)'
  )
  .option('--color', 'Force colored output (even in non-TTY)')
  .option('--no-color', 'Disable colored output')
  .option(
    '--strict',
    'Fail on any error (default: be resilient, warn on non-critical issues)'
  )
  .configureHelp({ formatHelp });

program.configureOutput({
  writeErr: writeCommanderError,
});

program.showHelpAfterError('(Run vizzly --help for available commands)');
program.showSuggestionAfterError();
program.exitOverride();

// Load plugins before defining commands
// We need to manually parse to get the config option early
let { configPath, tokenArg, verboseMode, logLevelArg, jsonArg } =
  extractGlobalOptionsFromArgv(process.argv);

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
  json: jsonArg,
});

let config = await loadConfig(configPath, { token: tokenArg });
let services = createServices(config);
let pluginServices = createPluginServices(services);

let plugins = [];
try {
  plugins = await loadPlugins(configPath, config);

  for (let plugin of plugins) {
    try {
      // Add timeout protection for plugin registration (5 seconds)
      let registerPromise = plugin.register(program, {
        config,
        services: pluginServices,
        output,
      });

      await withTimeout(
        registerPromise,
        5000,
        'Plugin registration timeout (5s)'
      );

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
  .option('--agent-skill', 'Install the repo-local Vizzly agent skill')
  .option(
    '--agent-guidance',
    'Add Vizzly guidance to this project AGENTS.md and install the agent skill'
  )
  .option('--skip-agent-skill', 'Skip the Vizzly agent skill prompt')
  .action(async options => {
    let globalOptions = getGlobalOptions();
    await init({ ...globalOptions, ...options, plugins });
  });

program
  .command('upload')
  .description('Upload screenshots to Vizzly')
  .argument('<path>', 'Path to screenshots directory')
  .option('-b, --build-name <name>', 'Build name for grouping')
  .option('-m, --metadata <json>', 'Additional metadata as JSON')
  .option('--batch-size <n>', 'Upload batch size', Number)
  .option('--upload-timeout <ms>', 'Upload timeout in milliseconds', Number)
  .option('--branch <branch>', 'Git branch')
  .option('--commit <sha>', 'Git commit SHA')
  .option('--message <msg>', 'Commit message')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', Number)
  .option(
    '--min-cluster-size <pixels>',
    'Minimum changed-pixel cluster size',
    Number
  )
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
  .option('--upload-all', 'Upload all screenshots without SHA deduplication')
  .option('--parallel-id <id>', 'Unique identifier for parallel test execution')
  .action(async (path, options) => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateUploadOptions(path, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    if (!existsSync(path)) {
      output.error(`Path does not exist: ${path}`);
      process.exit(1);
    }

    if (!statSync(path).isDirectory()) {
      output.error(`Path is not a directory: ${path}`);
      process.exit(1);
    }

    let result = await uploadCommand(path, options, globalOptions);
    if (result?.exitCode) {
      process.exit(result.exitCode);
    }
  });

// TDD command with subcommands - local visual review with an interactive dashboard
const tddCmd = program
  .command('tdd')
  .description('Run tests in TDD mode with local visual review')
  .showHelpAfterError('(Run vizzly tdd --help for available commands)')
  .showSuggestionAfterError();

// TDD Start - Background server
tddCmd
  .command('start')
  .description('Start background TDD server with dashboard')
  .option('--port <port>', 'Port for TDD server')
  .option('--open', 'Open dashboard in browser')
  .option('--baseline-build <id>', 'Use specific build as baseline')
  .option('--baseline-comparison <id>', 'Use specific comparison as baseline')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', Number)
  .option(
    '--min-cluster-size <pixels>',
    'Minimum changed-pixel cluster size',
    Number
  )
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--fail-on-diff', 'Fail tests when visual differences are detected')
  .option('--token <token>', 'API token override')
  .addOption(
    new Option(
      '--daemon-child',
      'Internal: run as daemon child process'
    ).hideHelp()
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // If this is a daemon child process, run the server directly
    if (options.daemonChild) {
      await runDaemonChild(options, globalOptions);
      return;
    }

    let validationErrors = validateTddStartOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await tddStartCommand(options, globalOptions);
  });

// TDD Stop - Kill background server
tddCmd
  .command('stop')
  .description('Stop background TDD server')
  .option('--port <port>', 'Port for TDD server')
  .action(async options => {
    let globalOptions = getGlobalOptions();
    let validationErrors = validateTddStartOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }
    await tddStopCommand(options, globalOptions);
  });

// TDD Status - Check server status
tddCmd
  .command('status')
  .description('Check TDD server status')
  .option('--port <port>', 'Port for TDD server')
  .action(async options => {
    let globalOptions = getGlobalOptions();
    let validationErrors = validateTddStartOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }
    await tddStatusCommand(options, globalOptions);
  });

// TDD List - List all running servers (for menubar app integration)
tddCmd
  .command('list')
  .description('List all running TDD servers')
  .action(async options => {
    let globalOptions = getGlobalOptions();
    await tddListCommand(options, globalOptions);
  });

// TDD Run - One-off test run with ephemeral server (generates static report)
tddCmd
  .command('run <command>')
  .description('Run tests once in TDD mode with local visual review')
  .option('--port <port>', 'Port for TDD server')
  .option('--branch <branch>', 'Git branch override')
  .option('--environment <env>', 'Environment name', 'test')
  .option('--threshold <number>', 'Comparison threshold', Number)
  .option(
    '--min-cluster-size <pixels>',
    'Minimum changed-pixel cluster size',
    Number
  )
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
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateTddOptions(command, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
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

    // If the run captured screenshots, generate a static report for review.
    let hasComparisons =
      result?.screenshotsCaptured > 0 ||
      result?.comparisons?.length > 0 ||
      result?.summary?.total > 0;
    if (hasComparisons) {
      // Note: Tests have completed at this point, so report-data.json is stable.
      // The report reflects the final state of all comparisons.
      const reportResult = await generateStaticReport(process.cwd());

      if (reportResult.success) {
        const reportUrl = getReportFileUrl(reportResult.reportPath);
        output.print(
          `  ${colors.brand.textTertiary('→')} Report: ${colors.info(reportUrl)}`
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
  .option('--threshold <number>', 'Comparison threshold', Number)
  .option(
    '--min-cluster-size <pixels>',
    'Minimum changed-pixel cluster size',
    Number
  )
  .option('--batch-size <n>', 'Upload batch size', Number)
  .option('--upload-timeout <ms>', 'Upload timeout in milliseconds', Number)
  .option('--token <token>', 'API token override')
  .option('--wait', 'Wait for build completion')
  .option('--timeout <ms>', 'Server timeout in milliseconds', '30000')
  .option('--allow-no-token', 'Allow running without API token')
  .option('--upload-all', 'Upload all screenshots without SHA deduplication')
  .option('--parallel-id <id>', 'Unique identifier for parallel test execution')
  .action(async (command, options) => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateRunOptions(command, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
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
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateStatusOptions(buildId, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await statusCommand(buildId, options, globalOptions);
  });

program
  .command('builds')
  .description('List and query builds')
  .option('-b, --build <id>', 'Get a specific build by ID')
  .option('--branch <branch>', 'Filter by branch')
  .option(
    '--status <status>',
    'Filter by status (created, pending, processing, completed, failed)'
  )
  .option('--environment <env>', 'Filter by environment')
  .option('-p, --project <slug>', 'Filter by project slug')
  .option('--org <slug>', 'Filter by organization slug')
  .option('--limit <n>', 'Maximum results to return (1-250)', Number, 20)
  .option('--offset <n>', 'Skip first N results', Number, 0)
  .option('--comparisons', 'Include comparisons when fetching a specific build')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly builds                          # List recent builds
  $ vizzly builds --branch main            # Filter by branch
  $ vizzly builds --project storybook      # Filter by project
  $ vizzly builds --project storybook --org my-org  # Disambiguate by org
  $ vizzly builds --status completed       # Filter by status
  $ vizzly builds -b abc123-def456         # Get specific build by ID
  $ vizzly builds -b abc123 --comparisons  # Include comparisons
  $ vizzly builds --json                   # Output as JSON for scripting
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateBuildsOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await buildsCommand(options, globalOptions);
  });

program
  .command('comparisons')
  .description('Query and search comparisons')
  .option('-b, --build <id>', 'Get comparisons for a specific build')
  .option('--id <id>', 'Get a specific comparison by ID')
  .option('--name <pattern>', 'Search comparisons by name (supports wildcards)')
  .option('--status <status>', 'Filter by status (identical, new, changed)')
  .option('--branch <branch>', 'Filter by branch (for name search)')
  .option('--limit <n>', 'Maximum results to return (1-250)', Number, 50)
  .option('--offset <n>', 'Skip first N results', Number, 0)
  .option('-p, --project <slug>', 'Filter by project slug')
  .option('--org <slug>', 'Filter by organization slug')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly comparisons -b abc123           # List comparisons for a build
  $ vizzly comparisons --id def456         # Get specific comparison by ID
  $ vizzly comparisons --name "Button"     # Search by screenshot name
  $ vizzly comparisons --name "Login*"     # Wildcard search
  $ vizzly comparisons --name "Button" --org my-org  # Filter by org
  $ vizzly comparisons --status changed    # Only changed comparisons
  $ vizzly comparisons --json              # Output as JSON for scripting
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateComparisonsOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await comparisonsCommand(options, globalOptions);
  });

let contextCmd = program
  .command('context')
  .description('Fetch build and diff context')
  .showHelpAfterError('(Run vizzly context --help for available commands)')
  .showSuggestionAfterError();

contextCmd
  .command('build')
  .description('Fetch build context')
  .argument('<build-id>', 'Build ID to fetch context for')
  .option('--source <source>', 'Context source: auto, cloud, or local', 'auto')
  .option('--agent', 'Output compact context for LLM agents')
  .option('--full', 'Return the full build context payload with --agent --json')
  .option(
    '--include <items>',
    'Add detail to compact agent JSON: screenshots,diffs,comments'
  )
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly context build abc123
  $ vizzly context build current --source local
  $ vizzly context build current --source local --agent
  $ vizzly context build abc123 --agent --json
  $ vizzly context build abc123 --agent --json --include diffs,comments
  $ vizzly context build abc123 --agent --json --full
`
  )
  .action(async (buildId, options) => {
    let globalOptions = getGlobalOptions();
    const validationErrors = validateContextBuildOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await contextBuildCommand(buildId, options, globalOptions);
  });

contextCmd
  .command('comparison')
  .description('Fetch a comparison context bundle')
  .argument('<comparison-id>', 'Comparison ID to fetch context for')
  .option('--source <source>', 'Context source: auto, cloud, or local', 'auto')
  .option(
    '--similar-limit <n>',
    'Maximum similar fingerprint matches to return (1-50)',
    Number
  )
  .option(
    '--recent-limit <n>',
    'Maximum recent same-name comparisons to return (1-50)',
    Number
  )
  .option(
    '--window-size <n>',
    'Historical hotspot analysis window size (1-50)',
    Number
  )
  .option('--include <items>', 'Add detail to JSON output: diffs')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly context comparison def456
  $ vizzly context comparison def456 --source local
  $ vizzly context comparison def456 --similar-limit 5 --recent-limit 5
  $ vizzly context comparison def456 --json --include diffs
  $ vizzly context comparison def456 --json
`
  )
  .action(async (comparisonId, options) => {
    let globalOptions = getGlobalOptions();
    const validationErrors = validateContextComparisonOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await contextComparisonCommand(comparisonId, options, globalOptions);
  });

contextCmd
  .command('screenshot')
  .description('Fetch screenshot context and historical memory')
  .argument('<name>', 'Screenshot name')
  .option('--source <source>', 'Context source: auto, cloud, or local', 'auto')
  .option('-p, --project <slug-or-id>', 'Project scope for user auth lookups')
  .option('--org <slug>', 'Organization slug when project slug is ambiguous')
  .option(
    '--recent-limit <n>',
    'Maximum recent comparisons to return (1-50)',
    Number
  )
  .option(
    '--window-size <n>',
    'Historical hotspot analysis window size (1-50)',
    Number
  )
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly context screenshot Dashboard
  $ vizzly context screenshot Dashboard --source local
  $ vizzly context screenshot Dashboard --project storybook --org acme
  $ vizzly context screenshot Dashboard --json
`
  )
  .action(async (name, options) => {
    let globalOptions = getGlobalOptions();
    const validationErrors = validateContextScreenshotOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await contextScreenshotCommand(name, options, globalOptions);
  });

contextCmd
  .command('similar')
  .description('Fetch project-scoped matches for a fingerprint hash')
  .argument('<fingerprint-hash>', 'Fingerprint hash to search for')
  .option('--source <source>', 'Context source: auto, cloud, or local', 'auto')
  .option('-p, --project <slug-or-id>', 'Project scope for user auth lookups')
  .option('--org <slug>', 'Organization slug when project slug is ambiguous')
  .option('--limit <n>', 'Maximum matches to return (1-50)', Number)
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly context similar fp-dashboard
  $ vizzly context similar fp-dashboard --project storybook --org acme
  $ vizzly context similar fp-dashboard --json
`
  )
  .action(async (fingerprintHash, options) => {
    let globalOptions = getGlobalOptions();
    const validationErrors = validateContextSimilarOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await contextSimilarCommand(fingerprintHash, options, globalOptions);
  });

contextCmd
  .command('review-queue')
  .description('Fetch pending review context for a project')
  .option('--source <source>', 'Context source: auto, cloud, or local', 'auto')
  .option('-p, --project <slug-or-id>', 'Project scope for user auth lookups')
  .option('--org <slug>', 'Organization slug when project slug is ambiguous')
  .option('--limit <n>', 'Maximum comparisons to return (1-100)', Number)
  .option('--offset <n>', 'Skip first N comparisons', Number)
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly context review-queue --project storybook --org acme
  $ vizzly context review-queue --source local
  $ vizzly context review-queue --limit 10
  $ vizzly context review-queue --json
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();
    const validationErrors = validateContextReviewQueueOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await contextReviewQueueCommand(options, globalOptions);
  });

program
  .command('config')
  .description('Display current configuration')
  .argument(
    '[key]',
    'Specific config key to get (dot notation, e.g., comparison.threshold)'
  )
  .action(async (key, options) => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateConfigOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await configCommand(key, options, globalOptions);
  });

program
  .command('baselines')
  .description('List and query local TDD baselines')
  .option('--name <pattern>', 'Filter baselines by name (supports wildcards)')
  .option('--info <name>', 'Get detailed info for a specific baseline')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly baselines                       # List all local baselines
  $ vizzly baselines --name "Button*"      # Filter by name pattern
  $ vizzly baselines --info "homepage"     # Get details for specific baseline
  $ vizzly baselines --json                # Output as JSON for scripting

Note: Baselines are stored locally in .vizzly/baselines/ during TDD mode.
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateBaselinesOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await baselinesCommand(options, globalOptions);
  });

program
  .command('api')
  .description('Make raw API requests (for power users)')
  .argument('<endpoint>', 'API endpoint (e.g., /api/sdk/builds)')
  .option(
    '-X, --method <method>',
    'HTTP method (GET or POST for approve/reject/comment)',
    'GET'
  )
  .option('-d, --data <json>', 'Request body (JSON)')
  .option(
    '-H, --header <header>',
    'Add header (key:value), can be repeated',
    (val, prev) => (prev ? [...prev, val] : [val])
  )
  .option(
    '-q, --query <param>',
    'Add query param (key=value), can be repeated',
    (val, prev) => (prev ? [...prev, val] : [val])
  )
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly api /api/sdk/builds                    # List builds
  $ vizzly api /api/sdk/builds -q limit=5         # With query params
  $ vizzly api /api/sdk/builds/abc123             # Get specific build
  $ vizzly api /api/sdk/comparisons/abc123/approve -X POST
  $ vizzly api /api/sdk/builds/abc123/comments -X POST -d '{"content":"Nice!"}'

Note: POST is restricted to approve, reject, and comment endpoints.
Most operations have dedicated commands (builds, comparisons, approve, etc.).
`
  )
  .action(async (endpoint, options) => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateApiOptions(endpoint, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await apiCommand(endpoint, options, globalOptions);
  });

program
  .command('approve')
  .description('Approve a comparison')
  .argument('<comparison-id>', 'Comparison ID to approve')
  .option('-m, --comment <message>', 'Optional comment explaining the approval')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly approve abc123-def456-7890     # Approve a comparison
  $ vizzly approve abc123 -m "LGTM"       # Approve with comment
  $ vizzly approve abc123 --json          # Output as JSON for scripting

Workflow:
  1. List comparisons: vizzly comparisons -b <build-id>
  2. Review the changes in the web UI or via URLs in the output
  3. Approve: vizzly approve <comparison-id>
`
  )
  .action(async (comparisonId, options) => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateApproveOptions(comparisonId, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await approveCommand(comparisonId, options, globalOptions);
  });

program
  .command('reject')
  .description('Reject a comparison')
  .argument('<comparison-id>', 'Comparison ID to reject')
  .option('-r, --reason <message>', 'Required reason for rejection')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly reject abc123 -r "Button color is wrong"
  $ vizzly reject abc123 --reason "Needs design review"
  $ vizzly reject abc123 -r "Regression" --json

Workflow:
  1. List comparisons: vizzly comparisons -b <build-id>
  2. Review the changes in the web UI or via URLs in the output
  3. Reject with reason: vizzly reject <comparison-id> -r "reason"
`
  )
  .action(async (comparisonId, options) => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateRejectOptions(comparisonId, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await rejectCommand(comparisonId, options, globalOptions);
  });

program
  .command('comment')
  .description('Add a comment to a build')
  .argument('<build-id>', 'Build ID to comment on')
  .argument('<message>', 'Comment message')
  .option(
    '-t, --type <type>',
    'Comment type: general, approval, rejection',
    'general'
  )
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly comment abc123 "Looks good overall"
  $ vizzly comment abc123 "Approved" -t approval
  $ vizzly comment abc123 "Please fix the header" -t rejection
  $ vizzly comment abc123 "CI feedback" --json

Workflow:
  1. Get build ID: vizzly builds --branch main
  2. Add comment: vizzly comment <build-id> "Your message"
`
  )
  .action(async (buildId, message, options) => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateCommentOptions(buildId, message, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await commentCommand(buildId, message, options, globalOptions);
  });

program
  .command('orgs')
  .description('List organizations you have access to')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly orgs                            # List all organizations
  $ vizzly orgs --json                     # Output as JSON for scripting

Note: Shows organizations from your user account (via vizzly login)
or the single organization for a project token.
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateOrgsOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await orgsCommand(options, globalOptions);
  });

program
  .command('projects')
  .description('List projects you have access to')
  .option('--org <slug>', 'Filter by organization slug')
  .option('--limit <n>', 'Maximum results to return (1-250)', Number, 50)
  .option('--offset <n>', 'Skip first N results', Number, 0)
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly projects                        # List all projects
  $ vizzly projects --org my-company       # Filter by organization
  $ vizzly projects --json                 # Output as JSON for scripting

Workflow:
  1. List orgs: vizzly orgs
  2. List projects: vizzly projects --org <org-slug>
  3. Query builds: vizzly builds
`
  )
  .action(async options => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateProjectsOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await projectsCommand(options, globalOptions);
  });

let projectCommand = program
  .command('project')
  .description('Manage the project linked to this local checkout')
  .showHelpAfterError('(Run vizzly project --help for available commands)')
  .showSuggestionAfterError();

projectCommand
  .command('link [selector]')
  .description('Link a Vizzly project for cloud uploads')
  .option('--org <slug>', 'Organization slug')
  .option('--project <slug>', 'Project slug')
  .option('--name <name>', 'Credential name shown in Vizzly')
  .option('--expires-at <iso>', 'Optional token expiration timestamp')
  .addHelpText(
    'after',
    `
Examples:
  $ vizzly project link vizzly/storybook
  $ vizzly project link --org vizzly --project storybook

Note: run "vizzly login" first. The linked credential is project-scoped and is
used for cloud uploads; your user login remains separate for review actions.
`
  )
  .action(async (selector, options) => {
    let globalOptions = getGlobalOptions();

    const validationErrors = validateProjectLinkOptions(selector, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await projectLinkCommand(selector, options, globalOptions);
  });

program
  .command('finalize')
  .description('Finalize a parallel build after all shards complete')
  .argument('<parallel-id>', 'Parallel ID to finalize')
  .action(async (parallelId, options) => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateFinalizeOptions(parallelId, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await finalizeCommand(parallelId, options, globalOptions);
  });

program
  .command('preview')
  .description('Upload static files as a preview for a build')
  .argument('[path]', 'Path to static files (dist/, build/, out/)')
  .option('-b, --build <id>', 'Build ID to attach preview to')
  .option('--base <path>', 'Override auto-detected base path')
  .option('--open', 'Open preview URL in browser after upload')
  .option('--dry-run', 'Show what would be uploaded without uploading')
  .option(
    '--public-link',
    'Acknowledge that preview URL grants access to anyone with the link (required for private projects)'
  )
  .option(
    '-x, --exclude <pattern>',
    'Exclude files/dirs (repeatable, e.g. -x "*.log" -x "temp/")',
    (val, prev) => (prev ? [...prev, val] : [val])
  )
  .option(
    '-i, --include <pattern>',
    'Override default exclusions (repeatable, e.g. -i package.json -i tests/)',
    (val, prev) => (prev ? [...prev, val] : [val])
  )
  .action(async (path, options) => {
    let globalOptions = getGlobalOptions();

    // Show helpful error if path is missing
    if (!path) {
      output.error('Path to static files is required');
      if (!globalOptions.json) {
        output.blank();
        output.print('  Upload your build output directory:');
        output.blank();
        output.print('    vizzly preview ./dist');
        output.print('    vizzly preview ./build');
        output.print('    vizzly preview ./out');
        output.blank();
      }
      process.exit(1);
    }

    // Validate options
    const validationErrors = validatePreviewOptions(path, options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await previewCommand(path, options, globalOptions);
  });

program
  .command('doctor')
  .description('Run diagnostics to check your environment and configuration')
  .option('--api', 'Include API connectivity checks')
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateDoctorOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await doctorCommand(options, globalOptions);
  });

program
  .command('login')
  .description('Authenticate with your Vizzly account')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateLoginOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await loginCommand(options, globalOptions);
  });

program
  .command('logout')
  .description('Clear stored authentication tokens')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateLogoutOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await logoutCommand(options, globalOptions);
  });

program
  .command('whoami')
  .description('Show current authentication status and user information')
  .option('--api-url <url>', 'API URL override')
  .action(async options => {
    let globalOptions = getGlobalOptions();

    // Validate options
    const validationErrors = validateWhoamiOptions(options);
    if (validationErrors.length > 0) {
      reportValidationErrors(validationErrors);
    }

    await whoamiCommand(options, globalOptions);
  });

// Save user's PATH for menubar app (non-blocking, runs in background)
// This auto-configures the menubar app so it can find package runners/node
saveUserPath().catch(() => {});

let commandNames = new Set(program.commands.map(command => command.name()));
let nestedCommandNames = new Map(
  program.commands.map(command => [
    command.name(),
    new Set(command.commands.map(subcommand => subcommand.name())),
  ])
);
let normalizedArgv = normalizeJsonArgv(process.argv, commandNames);
let normalizedGlobals = extractGlobalOptionsFromArgv(
  normalizedArgv,
  commandNames
);

output.configure({
  logLevel: normalizedGlobals.logLevelArg,
  verbose: normalizedGlobals.verboseMode,
  color: colorOverride,
  json: normalizedGlobals.jsonArg,
  resetTimer: false,
});

let requestedCommand = findRequestedCommand(
  normalizedArgv,
  commandNames,
  nestedCommandNames
);
if (requestedCommand && !requestedCommand.known) {
  output.error(`unknown command '${requestedCommand.name}'`);
  if (!output.isJson() && requestedCommand.helpCommand) {
    output.printErr(
      `(Run ${requestedCommand.helpCommand} for available commands)`
    );
  }
  process.exit(1);
}

try {
  program.parse(normalizedArgv);
} catch (error) {
  if (error.exitCode == null) {
    output.error('Unexpected CLI error', error);
  }
  process.exit(error.exitCode ?? 1);
}
