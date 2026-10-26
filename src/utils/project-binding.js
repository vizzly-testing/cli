import path from 'node:path';
import { VizzlyError } from '../errors/vizzly-error.js';
import { createConfigContent, readConfigScaffold } from './config-content.js';
import { discoverConfig } from './config-discovery.js';
import { applyChanges } from './file-changes.js';

function sameProject(left, right) {
  return (
    left?.organizationSlug === right.organizationSlug &&
    left?.projectSlug === right.projectSlug
  );
}

function bindingValues(project, apiUrl) {
  return {
    ...(apiUrl !== 'https://app.vizzly.dev' ? { apiUrl } : {}),
    project,
  };
}

function javascriptBinding(values) {
  return `export default ${JSON.stringify(values, null, 2)};\n`;
}

export async function planProjectBinding({
  cwd = process.cwd(),
  configPath = null,
  project,
  apiUrl = 'https://app.vizzly.dev',
  currentProject,
  currentApiUrl,
}) {
  let config = await discoverConfig({ cwd, configPath });
  let filename = config.configPath || path.join(cwd, 'vizzly.config.js');
  let values = bindingValues(project, apiUrl);
  let plan = {
    status: 'ready',
    configPath: filename,
    before: config.source,
    after: null,
  };

  if (
    config.exists &&
    sameProject(currentProject, project) &&
    currentApiUrl === apiUrl
  ) {
    return plan;
  }

  if (!config.exists) {
    if (['javascript', 'typescript'].includes(config.format)) {
      plan.after = javascriptBinding(values);
    } else if (config.format === 'json') {
      plan.after = `${JSON.stringify(values, null, 2)}\n`;
    } else {
      throw new VizzlyError(
        `Cannot create a project binding in ${filename}. Use a JavaScript, TypeScript, or JSON config.`,
        'PROJECT_CONFIG_FORMAT'
      );
    }
    return plan;
  }

  if (config.format === 'package' || config.format === 'json') {
    let document = JSON.parse(config.source);
    let existing =
      config.format === 'package' ? document.vizzly || {} : document;
    let updated = { ...existing, ...values };
    if (apiUrl === 'https://app.vizzly.dev' && existing.apiUrl) {
      updated.apiUrl = apiUrl;
    }
    let result =
      config.format === 'package' ? { ...document, vizzly: updated } : updated;
    let indent = config.source.match(/\n([ \t]+)\S/)?.[1] || '  ';
    plan.after = `${JSON.stringify(result, null, indent)}\n`;
    return plan;
  }

  let scaffold = ['javascript', 'typescript'].includes(config.format)
    ? readConfigScaffold(config.source)
    : null;
  if (scaffold !== null) {
    plan.after = createConfigContent({ ...scaffold, ...values }, config.format);
    return plan;
  }

  // A freshly scaffolded config contains only comments. Add the binding without
  // interpreting or rewriting executable configuration supplied by the user.
  let comments = String.raw`(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*`;
  let emptyModule = new RegExp(
    `^${comments}export\\s+default\\s*\\{${comments}\\}\\s*;?\\s*$`
  );
  if (
    ['javascript', 'typescript'].includes(config.format) &&
    emptyModule.test(config.source)
  ) {
    let propertyText = JSON.stringify(values, null, 2).slice(1, -1);
    let closingBrace = config.source.lastIndexOf('}');
    plan.after = `${config.source.slice(0, closingBrace).trimEnd()}\n${propertyText}\n${config.source.slice(closingBrace)}`;
    return plan;
  }

  return {
    ...plan,
    status: 'manual',
    instructions: `Add these fields to ${filename}, then run project link again:\n${JSON.stringify(values, null, 2)}`,
  };
}

export async function writeProjectBinding(plan) {
  if (plan.status !== 'ready' || plan.after === null) {
    return;
  }
  await applyChanges([
    { path: plan.configPath, before: plan.before, after: plan.after },
  ]);
}
