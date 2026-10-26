let header = `// Vizzly supplies defaults. Uncomment only settings you want to change.
// Configuration: https://docs.vizzly.dev/integration/cli/
export default {
`;
let footer = `  // comparison: { threshold: 2, minClusterSize: 2 },
  // upload: { screenshotsDir: './screenshots' },
};
`;

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
  return `${header}${properties ? `${properties},\n` : ''}${footer}`;
}

// Only edit an unchanged scaffold. Parse its JSON settings without evaluating
// executable config, and leave any handwritten source for the user to update.
export function readConfigScaffold(source) {
  if (!source?.startsWith(header) || !source.endsWith(footer)) return null;
  let properties = source.slice(header.length, -footer.length).trim();
  try {
    let settings = JSON.parse(`{${properties.replace(/,$/, '')}}`);
    return createConfigContent(settings) === source ? settings : null;
  } catch {
    return null;
  }
}
