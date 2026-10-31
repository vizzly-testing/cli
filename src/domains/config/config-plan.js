function createConfigContent(format) {
  if (format === 'json' || format === 'yaml') return '{}\n';
  if (!['javascript', 'typescript'].includes(format)) {
    throw new Error(
      `Cannot generate ${format} config. Use a .js, .ts or .json file.`
    );
  }
  return `// Vizzly supplies defaults. Uncomment only settings you want to change.
// Configuration: https://docs.vizzly.dev/integration/cli/
export default {
  // comparison: { threshold: 2, minClusterSize: 2 },
  // upload: { screenshotsDir: './screenshots' },
};
`;
}

export function planConfig(config) {
  let after;
  if (config.format === 'package') {
    let pkg = { ...config.packageConfig, vizzly: {} };
    let indent = config.source?.match(/\n([ \t]+)\S/)?.[1] || '  ';
    after = `${JSON.stringify(pkg, null, indent)}\n`;
  } else {
    after = createConfigContent(config.format);
  }
  return { path: config.configPath, before: config.source, after };
}
