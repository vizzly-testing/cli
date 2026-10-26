import { deepMerge } from '../config/core.js';

export function createConfigContent(settings = {}, format = 'javascript') {
  if (format === 'json' || format === 'yaml') {
    return `${JSON.stringify(settings, null, 2)}\n`;
  }
  if (!['javascript', 'typescript'].includes(format)) {
    throw new Error(
      `Cannot generate ${format} config. Use a .js, .ts or .json file.`
    );
  }
  let properties = JSON.stringify(settings, null, 2).slice(1, -1).trim();
  let body = properties ? `${properties},\n` : '';
  return `// Vizzly supplies defaults. Uncomment only settings you want to change.
// Configuration: https://docs.vizzly.dev/integration/cli/
export default {
${body}  // comparison: { threshold: 2, minClusterSize: 2 },
  // upload: { screenshotsDir: './screenshots' },
};
`;
}

export function planConfig(config, settings = {}, force = false) {
  if (config.exists && !force) {
    if (!Object.keys(settings).length)
      return { change: null, requirements: [] };
    if (!['json', 'package', 'yaml'].includes(config.format)) {
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
      ? deepMerge(config.parsedConfig || {}, settings)
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
