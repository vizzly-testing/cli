import { createColors } from './colors.js';

/**
 * Display help information for the CLI
 * @param {Object} globalOptions - Global CLI options
 */
export function showHelp(globalOptions = {}) {
  const colors = createColors({ useColor: !globalOptions.noColor });

  if (globalOptions.json) {
    console.log(
      JSON.stringify({
        status: 'info',
        message: 'Vizzly CLI Help',
        commands: [
          { name: 'run', description: 'Run tests with Vizzly visual testing' },
          { name: 'upload', description: 'Upload screenshots to Vizzly' },
          { name: 'init', description: 'Initialize Vizzly configuration' },
        ],
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  console.log('');
  console.log(colors.cyan(colors.bold('🔍 Vizzly CLI')));
  console.log(colors.dim('Visual testing tool for UI developers'));
  console.log('');

  console.log(colors.yellow(colors.bold('Available Commands:')));
  console.log('');
  console.log(
    `  ${colors.green(colors.bold('run'))}     Run tests with Vizzly visual testing`
  );
  console.log(
    `  ${colors.green(colors.bold('upload'))}  Upload screenshots to Vizzly`
  );
  console.log(
    `  ${colors.green(colors.bold('init'))}    Initialize Vizzly configuration`
  );
  console.log('');

  console.log(
    colors.dim('Use ') +
      colors.cyan('vizzly <command> --help') +
      colors.dim(' for command-specific options')
  );
  console.log('');
}

/**
 * Show error for unknown command
 * @param {string} command - Unknown command name
 * @param {Object} globalOptions - Global CLI options
 */
export function showUnknownCommand(command, globalOptions = {}) {
  const colors = createColors({ useColor: !globalOptions.noColor });

  if (globalOptions.json) {
    console.error(
      JSON.stringify({
        status: 'error',
        message: `Unknown command: ${command}`,
        availableCommands: ['run', 'upload', 'init'],
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }

  console.error(colors.red(`✖ Unknown command: ${command}`));
  console.error('');
  console.error(colors.dim('Available commands: run, upload, init'));
  console.error('');
  process.exit(1);
}
