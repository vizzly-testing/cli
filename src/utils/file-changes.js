import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readOptionalFile } from './config-discovery.js';

export async function fileChange(filename, after) {
  let before = await readOptionalFile(filename);
  return before === after ? null : { path: filename, before, after };
}

async function writableParent(filename) {
  let parent = path.dirname(filename);
  while (true) {
    try {
      await access(parent, constants.W_OK);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(parent) === parent) {
        throw error;
      }
      parent = path.dirname(parent);
    }
  }
}

async function checkChange(change) {
  // Reject redirects in parent folders too, including explicit config paths.
  // Top-level OS aliases such as /tmp on macOS are safe to follow.
  for (
    let parent = path.dirname(change.path);
    path.dirname(parent) !== parent;
    parent = path.dirname(parent)
  ) {
    try {
      if (
        path.dirname(parent) !== path.parse(parent).root &&
        (await lstat(parent)).isSymbolicLink()
      ) {
        throw new Error(`Setup will not write through a symlink: ${parent}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let info;
  try {
    info = await lstat(change.path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (info?.isSymbolicLink()) {
    throw new Error(`Setup will not replace a symlink: ${change.path}`);
  }
  let current = await readOptionalFile(change.path);
  if (current !== change.before) {
    throw new Error(`${change.path} changed during setup; run init again.`);
  }
  if (current !== null) {
    if (!info.isFile()) {
      throw new Error(`Setup needs a regular file: ${change.path}`);
    }
    await access(change.path, constants.W_OK);
  }
  await writableParent(change.path);
}

export async function preflightChanges(changes) {
  for (let change of changes.filter(Boolean)) await checkChange(change);
}

export async function applyChanges(changes) {
  let planned = changes.filter(Boolean);
  await preflightChanges(planned);
  let completed = [];
  try {
    for (let change of planned) {
      await checkChange(change);
      await mkdir(path.dirname(change.path), { recursive: true });
      if (change.before === null) {
        await writeFile(change.path, change.after, { flag: 'wx' });
      } else {
        let temporary = `${change.path}.${randomUUID()}.tmp`;
        try {
          let { mode } = await lstat(change.path);
          await writeFile(temporary, change.after, { flag: 'wx', mode });
          await rename(temporary, change.path);
        } finally {
          await rm(temporary, { force: true });
        }
      }
      completed.push({
        path: change.path,
        status: 'written',
      });
    }
  } catch (error) {
    error.completed = completed;
    throw error;
  }
  return completed;
}
