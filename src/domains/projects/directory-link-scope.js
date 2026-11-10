import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { DIRECTORY_PROJECT_LINK_FILENAME } from './directory-link.validations.js';

let run = promisify(execFile);

export async function optionalFileInfo(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function safeProjectDirectory(directory, cwd = process.cwd()) {
  // Inspect before normalizing: a/../b must not hide a symlink in a.
  let input = path.isAbsolute(directory) ? directory : `${cwd}/${directory}`;
  let current = path.parse(input).root;
  for (let part of input.split(path.sep).filter(Boolean)) {
    current = `${current}${current.endsWith(path.sep) ? '' : path.sep}${part}`;
    let info = await optionalFileInfo(current);
    if (
      info?.isSymbolicLink() &&
      path.dirname(current) !== path.parse(current).root
    ) {
      throw new VizzlyError(
        `Project links cannot use a symlink directory: ${current}`,
        'PROJECT_LINK_UNSAFE_PATH',
        { path: current }
      );
    }
    if (!info?.isDirectory() && !info?.isSymbolicLink()) {
      throw new VizzlyError(
        `Project link directory does not exist: ${current}`,
        'PROJECT_LINK_DIRECTORY_INVALID',
        { path: current }
      );
    }
  }
  return await realpath(input);
}

export async function projectGitRoot(directory) {
  try {
    let { stdout } = await run('git', ['rev-parse', '--show-toplevel'], {
      cwd: directory,
      encoding: 'utf8',
      // Git environment overrides must not redirect this local scope lookup.
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
      ),
    });
    return await realpath(stdout.trim());
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 128) return null;
    throw error;
  }
}

export function withinProjectDirectory(directory, root) {
  let relative = path.relative(root, directory);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

export async function directoryProjectScope({
  cwd = process.cwd(),
  directory,
} = {}) {
  let start = await safeProjectDirectory(cwd);
  let selected =
    directory === undefined
      ? start
      : await safeProjectDirectory(directory, start);
  let root = await projectGitRoot(start);
  if (root && !withinProjectDirectory(selected, root)) {
    throw new VizzlyError(
      'The project link directory must be inside the current Git checkout.',
      'PROJECT_LINK_UNSAFE_PATH',
      { directory: selected, root }
    );
  }
  let selectedRoot = await projectGitRoot(selected);
  return { directory: selected, root: selectedRoot || selected };
}

export async function isPackageDirectory(directory) {
  return Boolean(await optionalFileInfo(path.join(directory, 'package.json')));
}

async function isWorkspaceDirectory(directory) {
  if (await optionalFileInfo(path.join(directory, 'pnpm-workspace.yaml')))
    return true;
  let manifest = await optionalFileInfo(path.join(directory, 'package.json'));
  if (!manifest?.isFile() || manifest.isSymbolicLink()) return false;
  try {
    let document = JSON.parse(
      await readFile(path.join(directory, 'package.json'), 'utf8')
    );
    return Boolean(document.workspaces);
  } catch {
    return false;
  }
}

export async function resolveDirectoryProjectLinkScope(options = {}) {
  let scope = await directoryProjectScope(options);
  if (options.directory === undefined) {
    while (
      !(await isPackageDirectory(scope.directory)) &&
      scope.directory !== scope.root
    ) {
      scope.directory = path.dirname(scope.directory);
    }
    if (await isWorkspaceDirectory(scope.directory)) {
      throw new VizzlyError(
        'Choose the app directory with --directory <path>. To link the workspace root intentionally, use --directory .',
        'PROJECT_LINK_DIRECTORY_REQUIRED',
        { directory: scope.directory, root: scope.root }
      );
    }
  }
  return {
    ...scope,
    path: path.join(scope.directory, DIRECTORY_PROJECT_LINK_FILENAME),
  };
}
