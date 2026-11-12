import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, open, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applyChanges } from '../../shared/file-changes.js';
import { withLocalLock } from '../../shared/local-lock.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import {
  DIRECTORY_PROJECT_LINK_FILENAME,
  MAX_DIRECTORY_PROJECT_LINK_BYTES,
  validateDirectoryProjectLink,
  validateProjectApiOrigin,
} from './directory-link.validations.js';
import {
  directoryProjectScope,
  isPackageDirectory,
  optionalFileInfo,
  safeProjectDirectory,
} from './directory-link-scope.js';

function unsafeRecord(filename) {
  return new VizzlyError(
    `Project links require a regular file with no symlinks or hard links: ${filename}`,
    'PROJECT_LINK_UNSAFE_PATH',
    { path: filename }
  );
}

async function readBinding(directory) {
  await safeProjectDirectory(directory);
  let filename = path.join(directory, DIRECTORY_PROJECT_LINK_FILENAME);
  let info = await optionalFileInfo(filename);
  if (!info) return { binding: null, source: null };
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw unsafeRecord(filename);
  }
  let handle;
  try {
    handle = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    let current = await handle.stat();
    if (!current.isFile() || current.nlink !== 1) throw unsafeRecord(filename);
    if (current.size > MAX_DIRECTORY_PROJECT_LINK_BYTES) {
      throw new VizzlyError(
        `Project link exceeds 16 KiB: ${filename}`,
        'PROJECT_LINK_INVALID',
        { path: filename }
      );
    }
    let bytes = Buffer.alloc(MAX_DIRECTORY_PROJECT_LINK_BYTES + 1);
    let { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_DIRECTORY_PROJECT_LINK_BYTES) {
      throw new VizzlyError(
        `Project link exceeds 16 KiB: ${filename}`,
        'PROJECT_LINK_INVALID',
        { path: filename }
      );
    }
    let source = bytes.subarray(0, bytesRead).toString('utf8');
    let document;
    try {
      document = JSON.parse(source);
    } catch {
      throw new VizzlyError(
        `Project link is not valid JSON: ${filename}`,
        'PROJECT_LINK_INVALID',
        { path: filename }
      );
    }
    return { binding: validateDirectoryProjectLink(document), source };
  } catch (error) {
    if (['ELOOP', 'ENXIO', 'EISDIR'].includes(error.code))
      throw unsafeRecord(filename);
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function findDirectoryProjectLink({
  cwd = process.cwd(),
  directory,
  apiOrigin,
} = {}) {
  let scope = await directoryProjectScope({ cwd, directory });
  let current = scope.directory;
  while (true) {
    let record = await readBinding(current);
    let result = {
      ...record,
      path: path.join(current, DIRECTORY_PROJECT_LINK_FILENAME),
      directory: current,
      root: scope.root,
    };
    if (record.binding) {
      let origin =
        apiOrigin === undefined
          ? undefined
          : validateProjectApiOrigin(apiOrigin);
      if (origin && record.binding.apiOrigin !== origin) {
        throw new VizzlyError(
          `The project link uses ${record.binding.apiOrigin}, but this command uses ${origin}. Select that API explicitly or relink this directory.`,
          'PROJECT_LINK_ORIGIN_MISMATCH',
          {
            path: result.path,
            apiOrigin: origin,
            linkedApiOrigin: record.binding.apiOrigin,
          }
        );
      }
      return result;
    }
    if (
      directory !== undefined ||
      current === scope.root ||
      (await isPackageDirectory(current))
    ) {
      return result;
    }
    current = path.dirname(current);
  }
}

export async function writeDirectoryProjectLink(options) {
  let { directory, expectedBefore } = options;
  let binding = validateDirectoryProjectLink(options.binding);
  let physicalDirectory = await safeProjectDirectory(directory);
  let filename = path.join(physicalDirectory, DIRECTORY_PROJECT_LINK_FILENAME);
  return await withLocalLock(filename, async () => {
    let { binding: previous, source } = await readBinding(physicalDirectory);
    let result = {
      binding,
      previous,
      path: filename,
      directory: physicalDirectory,
      source,
    };
    if (previous && JSON.stringify(previous) === JSON.stringify(binding)) {
      return { ...result, status: 'unchanged' };
    }
    if (Object.hasOwn(options, 'expectedBefore') && source !== expectedBefore) {
      throw new VizzlyError(
        `${filename} changed while selecting a project. Run project link again.`,
        'PROJECT_LINK_CONFLICT',
        { path: filename }
      );
    }
    let after = `${JSON.stringify(binding, null, 2)}\n`;
    try {
      if (source === null) {
        let temporary = `${filename}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, after, { flag: 'wx' });
          await safeProjectDirectory(physicalDirectory);
          await link(temporary, filename);
        } finally {
          await rm(temporary, { force: true });
        }
      } else {
        await applyChanges([{ path: filename, before: source, after }]);
      }
    } catch (error) {
      if (
        ['EEXIST', 'ENOENT'].includes(error.code) ||
        error.message.includes('changed during setup')
      ) {
        throw new VizzlyError(
          `${filename} changed while selecting a project. Run project link again.`,
          'PROJECT_LINK_CONFLICT',
          { path: filename }
        );
      }
      throw error;
    }
    return { ...result, source: after, status: 'written' };
  });
}
