import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync, traverse } from '@babel/core';

let root = fileURLToPath(new URL('../', import.meta.url));
let sourceRoots = ['src', 'tests', 'scripts', 'clients', 'examples', 'test-d'];
let ignored = new Set(['node_modules', 'dist', 'build', '.git', '.vizzly']);

function sourceFiles(directory) {
  if (!existsSync(path.join(root, directory))) return [];
  return readdirSync(path.join(root, directory), {
    withFileTypes: true,
  }).flatMap(entry => {
    let filename = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignored.has(entry.name) ? [] : sourceFiles(filename);
    }
    return /\.(js|jsx)$/.test(entry.name) ? [filename] : [];
  });
}

function moduleImports(filename) {
  let tree = parseSync(readFileSync(path.join(root, filename), 'utf8'), {
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    parserOpts: { plugins: ['jsx'] },
  });
  let imports = [];
  traverse(tree, {
    enter({ node }) {
      if (node.source?.type === 'StringLiteral') {
        imports.push(node.source.value);
      } else if (
        node.type === 'CallExpression' &&
        (node.callee.type === 'Import' ||
          (node.callee.type === 'Identifier' &&
            node.callee.name === 'require')) &&
        node.arguments[0]?.type === 'StringLiteral'
      ) {
        imports.push(node.arguments[0].value);
      }
    },
  });
  return imports;
}

let files = sourceRoots.flatMap(sourceFiles);
let failures = [];
let graph = new Map();
let reporterRoot = 'src/reporter/src/';
let browserContract = 'src/domains/reports/report.normalizers.js';
let oldFolders = [
  'api',
  'auth',
  'commands',
  'config',
  'context',
  'init',
  'project',
  'screenshot-server',
  'server-manager',
  'tdd',
  'test-runner',
  'uploader',
  'utils',
];
for (let folder of oldFolders) {
  let oldPath = `src/${folder}`;
  if (sourceFiles(oldPath).length) {
    failures.push(`${oldPath}: put product behavior in its owning domain`);
  }
}

for (let filename of files) {
  let imports = moduleImports(filename);
  let dependencies = [];
  let isDomain = filename.startsWith('src/domains/');
  let isAdapter = /\.(commands|routes)\.js$/.test(filename);
  let isPureRole = /\.(normalizers|serializers|validations|rules)\.js$/.test(
    filename
  );
  if (isDomain && path.posix.basename(filename) === 'index.js') {
    failures.push(
      `${filename}: import specific domain files instead of a barrel`
    );
  }
  for (let specifier of imports) {
    if (
      isPureRole &&
      /^node:(fs|child_process|http|https|net|tls)(\/|$)/.test(specifier)
    ) {
      failures.push(
        `${filename}: ${specifier} belongs in a service or adapter`
      );
    }
    if (!specifier.startsWith('.')) {
      if (
        filename.startsWith(reporterRoot) &&
        (isBuiltin(specifier) || specifier.startsWith('@vizzly-testing/cli'))
      ) {
        failures.push(`${filename}: browser code imports ${specifier}`);
      }
      continue;
    }
    let target = path.posix.normalize(
      path.posix.join(path.posix.dirname(filename), specifier)
    );
    if (!existsSync(path.join(root, target))) {
      failures.push(`${filename}: missing ${specifier}`);
      continue;
    }
    dependencies.push(target);
    if (
      filename.startsWith('src/services/') &&
      target.startsWith('src/domains/')
    ) {
      failures.push(
        `${filename}: shared capabilities must not depend on ${target}`
      );
    }
    if (isDomain && !isAdapter && /\.(commands|routes)\.js$/.test(target)) {
      failures.push(`${filename}: import data operations instead of ${target}`);
    }
    if (
      filename.startsWith(reporterRoot) &&
      target.startsWith('src/') &&
      !target.startsWith(reporterRoot) &&
      target !== browserContract
    ) {
      failures.push(
        `${filename}: backend import ${target} crosses the browser boundary`
      );
    }
  }
  if (filename.startsWith('src/')) graph.set(filename, dependencies);
}

// Detect real module cycles rather than banning useful cross-domain operations.
let visited = new Set();
let active = new Set();
let stack = [];
function visit(filename) {
  if (active.has(filename)) {
    failures.push(
      `Import cycle: ${[...stack.slice(stack.indexOf(filename)), filename].join(' -> ')}`
    );
    return;
  }
  if (visited.has(filename)) return;
  visited.add(filename);
  active.add(filename);
  stack.push(filename);
  for (let dependency of graph.get(filename) || []) visit(dependency);
  stack.pop();
  active.delete(filename);
}
for (let filename of graph.keys()) visit(filename);

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Architecture checks passed for ${files.length} source and test modules.\n`
  );
}
