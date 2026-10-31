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

function moduleDependencies(filename) {
  let tree = parseSync(readFileSync(path.join(root, filename), 'utf8'), {
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    parserOpts: { plugins: ['jsx'] },
  });
  let imports = [];
  let ioCalls = [];
  traverse(tree, {
    enter({ node, scope }) {
      if (
        node.type === 'CallExpression' &&
        ((node.callee.type === 'Identifier' &&
          node.callee.name === 'fetch' &&
          !scope.getBinding('fetch')) ||
          (node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'globalThis' &&
            node.callee.property.name === 'fetch'))
      )
        ioCalls.push('fetch');
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
  return { imports, ioCalls };
}

let files = sourceRoots.flatMap(sourceFiles);
let failures = [];
let graph = new Map();
let ioImports = new Map();
let pureFiles = [];
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
  let { imports, ioCalls } = moduleDependencies(filename);
  if (ioCalls.length) ioImports.set(filename, ioCalls);
  let dependencies = [];
  let isTest = filename.endsWith('.test.js');
  let isDomain = !isTest && filename.startsWith('src/domains/');
  let isAdapter = /\.(commands|routes)\.js$/.test(filename);
  let isPureRole = /\.(normalizers|serializers|validations|rules)\.js$/.test(
    filename
  );
  if (isPureRole) pureFiles.push(filename);
  if (isDomain && path.posix.basename(filename) === 'index.js') {
    failures.push(
      `${filename}: import specific domain files instead of a barrel`
    );
  }
  for (let specifier of imports) {
    let builtin = specifier.replace(/^node:/, '');
    if (
      /^(fs|child_process|http|https|net|tls|dgram|dns|readline|worker_threads)(\/|$)/.test(
        builtin
      )
    ) {
      let effects = ioImports.get(filename) || [];
      effects.push(specifier);
      ioImports.set(filename, effects);
    }
    if (!specifier.startsWith('.')) {
      if (
        !isTest &&
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
      !isTest &&
      filename.startsWith('src/services/') &&
      target.startsWith('src/domains/')
    ) {
      failures.push(
        `${filename}: shared capabilities must not depend on ${target}`
      );
    }
    if (!isTest && target.endsWith('.test.js')) {
      failures.push(`${filename}: production code must not import ${target}`);
    }
    let targetIsAdapter = /\.(commands|routes)\.js$/.test(target);
    let sameDomain = filename.split('/')[2] === target.split('/')[2];
    if (isDomain && targetIsAdapter && (!isAdapter || !sameDomain)) {
      failures.push(`${filename}: import data operations instead of ${target}`);
    }
    if (
      !isTest &&
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
  if (!isTest && filename.startsWith('src/')) graph.set(filename, dependencies);
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

function impureDependency(filename, seen = new Set()) {
  if (seen.has(filename)) return null;
  seen.add(filename);
  if (/\.(service|commands|routes)\.js$/.test(filename)) return [filename];
  let ioImport = ioImports.get(filename)?.[0];
  if (ioImport) return [filename, ioImport];
  for (let dependency of graph.get(filename) || []) {
    let chain = impureDependency(dependency, seen);
    if (chain) return [filename, ...chain];
  }
  return null;
}
for (let filename of pureFiles) {
  let chain = impureDependency(filename);
  if (chain)
    failures.push(
      `${filename}: pure contract depends on I/O or operations: ${chain.join(' -> ')}`
    );
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Architecture checks passed for ${files.length} source and test modules.\n`
  );
}
