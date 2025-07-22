import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { loadConfig } from '../utils/config-loader.js';
import { ConsoleUI } from '../utils/console-ui.js';
import { container } from '../container/index.js';

/**
 * Doctor command implementation - Run diagnostics to check environment
 * @param {Object} options - Command options
 * @param {Object} globalOptions - Global CLI options
 */
export async function doctorCommand(_options = {}, globalOptions = {}) {
  // Create UI handler
  const ui = new ConsoleUI({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });

  // Ensure cleanup on exit
  process.on('SIGINT', () => ui.cleanup());
  process.on('exit', () => ui.cleanup());

  const diagnostics = {
    environment: {},
    configuration: {},
    connectivity: {},
    dependencies: {},
    permissions: {},
  };

  let hasErrors = false;

  try {
    ui.info('Running Vizzly environment diagnostics...');

    // 1. Check Node.js version
    ui.startSpinner('Checking Node.js version...');
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
    diagnostics.environment.nodeVersion = nodeVersion;
    diagnostics.environment.nodeVersionValid = nodeMajor >= 20;

    if (nodeMajor >= 20) {
      ui.success(`✓ Node.js version: ${nodeVersion} (supported)`);
    } else {
      console.error(`✗ Node.js version: ${nodeVersion} (requires >= 20.0.0)`);
      hasErrors = true;
    }

    // 2. Check npm version
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      diagnostics.environment.npmVersion = npmVersion;
      ui.success(`✓ npm version: ${npmVersion}`);
    } catch {
      console.error('✗ npm not found in PATH');
      diagnostics.environment.npmVersion = null;
      hasErrors = true;
    }

    // 3. Check package.json
    ui.progress('Checking package.json...');
    const packageJsonPath = './package.json';
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        diagnostics.environment.packageJson = true;
        diagnostics.environment.projectName = packageJson.name || 'unnamed';
        ui.success(
          `✓ package.json found (project: ${packageJson.name || 'unnamed'})`
        );
      } catch {
        console.error('✗ package.json exists but is invalid JSON');
        diagnostics.environment.packageJson = false;
        hasErrors = true;
      }
    } else {
      ui.warning('⚠ package.json not found (not in a Node.js project?)');
      diagnostics.environment.packageJson = false;
    }

    // 4. Check Vizzly configuration
    ui.progress('Checking Vizzly configuration...');
    try {
      const config = await loadConfig(globalOptions.config);
      diagnostics.configuration.configFound = true;
      diagnostics.configuration.apiKey = !!config.apiKey;
      diagnostics.configuration.apiUrl = config.apiUrl;

      if (config.apiKey) {
        ui.success('✓ API token configured');
      } else {
        console.error(
          '✗ API token not found (set VIZZLY_TOKEN or use --token)'
        );
        hasErrors = true;
      }

      ui.success(`✓ API URL configured: ${config.apiUrl}`);

      if (globalOptions.verbose) {
        ui.info('Configuration details:', {
          serverPort: config.server?.port || 3001,
          buildEnvironment: config.build?.environment || 'test',
          threshold: config.comparison?.threshold || 0.01,
        });
      }
    } catch (error) {
      console.error('✗ Failed to load configuration:', error.message);
      diagnostics.configuration.configFound = false;
      hasErrors = true;
    }

    // 5. Check API connectivity (if token available)
    if (diagnostics.configuration.apiKey) {
      ui.progress('Testing API connectivity...');
      try {
        const config = await loadConfig(globalOptions.config, globalOptions);
        const apiService = await container.get('apiService', config);

        // Test basic API connectivity
        await apiService.validateToken();
        ui.success('✓ API connectivity working');
        diagnostics.connectivity.apiReachable = true;
      } catch (error) {
        console.error(`✗ API connectivity failed: ${error.message}`);
        diagnostics.connectivity.apiReachable = false;
        diagnostics.connectivity.apiError = error.message;
        hasErrors = true;
      }
    } else {
      ui.warning('⚠ Skipping API connectivity test (no token configured)');
      diagnostics.connectivity.apiReachable = null;
    }

    // 6. Check required dependencies
    ui.progress('Checking dependencies...');
    const requiredDeps = ['commander', 'cosmiconfig', 'colorette'];
    const packageJsonPath2 = './package.json';

    if (existsSync(packageJsonPath2)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath2, 'utf8'));
        const allDeps = {
          ...(packageJson.dependencies || {}),
          ...(packageJson.devDependencies || {}),
        };

        requiredDeps.forEach(dep => {
          if (allDeps[dep]) {
            ui.success(`✓ ${dep} dependency found`);
            diagnostics.dependencies[dep] = allDeps[dep];
          } else {
            ui.warning(`⚠ ${dep} not found in package.json`);
            diagnostics.dependencies[dep] = null;
          }
        });
      } catch {
        ui.error('✗ Could not check dependencies');
      }
    }

    // 7. Check file permissions
    ui.progress('Checking file permissions...');
    try {
      // Check if we can write to current directory
      const testFile = './.vizzly-test-write';
      writeFileSync(testFile, 'test');
      unlinkSync(testFile);
      ui.success('✓ Write permissions in current directory');
      diagnostics.permissions.currentDirWritable = true;
    } catch {
      console.error('✗ Cannot write to current directory');
      diagnostics.permissions.currentDirWritable = false;
      hasErrors = true;
    }

    // 8. Check for common issues
    ui.progress('Checking for common issues...');

    // Check if running in CI
    const isCI =
      process.env.CI === 'true' ||
      process.env.CONTINUOUS_INTEGRATION === 'true';
    if (isCI) {
      ui.info('ℹ Running in CI environment');
      diagnostics.environment.ci = true;
    } else {
      diagnostics.environment.ci = false;
    }

    // Check port availability (basic check)
    await new Promise(resolve => {
      try {
        const net = require('net');
        const server = net.createServer();
        server.on('error', () => {
          ui.warning('⚠ Default port 3001 may be in use');
          diagnostics.environment.defaultPortAvailable = false;
          resolve();
        });
        server.listen(3001, () => {
          server.close(() => {
            ui.success('✓ Default port 3001 is available');
            diagnostics.environment.defaultPortAvailable = true;
            resolve();
          });
        });
      } catch {
        ui.warning('⚠ Default port 3001 may be in use');
        diagnostics.environment.defaultPortAvailable = false;
        resolve();
      }
    });

    // Final summary
    ui.stopSpinner();

    if (hasErrors) {
      console.error('Diagnostics completed with errors');
      ui.info('Please fix the issues above before using Vizzly CLI');
    } else {
      ui.success('All diagnostics passed! Vizzly CLI is ready to use');
    }

    // Output full diagnostics in JSON mode or verbose
    if (globalOptions.json || globalOptions.verbose) {
      ui.data({
        summary: {
          passed: !hasErrors,
          errors: hasErrors,
          timestamp: new Date().toISOString(),
        },
        diagnostics,
      });
    }

    // Provide helpful next steps
    if (!hasErrors && !globalOptions.json) {
      ui.info('Next steps:');
      console.log(
        '  1. Try uploading screenshots: vizzly upload ./screenshots'
      );
      console.log('  2. Or integrate with tests: vizzly run "npm test"');
      console.log('  3. See help: vizzly --help');
    }
  } catch (error) {
    console.error('Failed to run diagnostics:', error.message);
    hasErrors = true;
  } finally {
    ui.cleanup();

    // Exit with error code if diagnostics failed
    if (hasErrors) {
      process.exit(1);
    }
  }
}

/**
 * Validate doctor options (no specific validation needed)
 * @param {Object} options - Command options
 */
export function validateDoctorOptions() {
  return []; // No validation errors for doctor command
}
