import { deepMerge } from '../config/core.js';
import {
  createConfigContent,
  readConfigScaffold,
} from '../utils/config-content.js';

export function planConfig(config, settings = {}, force = false) {
  let scaffold = ['javascript', 'typescript'].includes(config.format)
    ? readConfigScaffold(config.source)
    : null;
  if (config.exists && !force) {
    if (!Object.keys(settings).length)
      return { change: null, requirements: [] };
    if (!['json', 'package'].includes(config.format) && scaffold === null) {
      let current = config.parsedConfig;
      if (
        current &&
        JSON.stringify(deepMerge(current, settings)) === JSON.stringify(current)
      ) {
        return { change: null, requirements: [] };
      }
      return {
        change: null,
        requirements: [
          `Add these settings to ${config.configPath}: ${JSON.stringify(settings)}`,
        ],
      };
    }
  }
  let values =
    config.exists && !force
      ? deepMerge(scaffold || config.parsedConfig || {}, settings)
      : settings;
  let after;
  if (config.format === 'package') {
    let pkg = { ...config.packageConfig, vizzly: values };
    let indent = config.source?.match(/\n([ \t]+)\S/)?.[1] || '  ';
    after = `${JSON.stringify(pkg, null, indent)}\n`;
  } else {
    after = createConfigContent(values, config.format);
  }
  return {
    change:
      after === config.source
        ? null
        : {
            path: config.configPath,
            before: config.source,
            after,
          },
    requirements: [],
  };
}

export function quoteArgument(value, platform = process.platform) {
  if (platform === 'win32') {
    if (/[%!"\r\n]/.test(value)) {
      throw new Error(
        'This command needs manual quoting on Windows. Run your existing tests with vizzly tdd run.'
      );
    }
    return `"${value}"`;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function packageCommand(manager, script) {
  if (
    !['npm', 'pnpm', 'yarn', 'bun'].includes(manager) ||
    !/^[\w:.-]+$/.test(script)
  )
    return null;
  return `${manager} run ${script}`;
}
