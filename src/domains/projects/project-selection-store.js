import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { getGlobalConfigDir } from '../../shared/global-config.js';

async function selectionPath({ apiUrl, directory, repositories }) {
  let key = JSON.stringify([
    new URL(apiUrl).origin,
    await realpath(directory),
    [...repositories].sort(),
  ]);
  let digest = createHash('sha256').update(key).digest('hex');
  return join(getGlobalConfigDir(), 'project-selections', `${digest}.json`);
}

export async function readProjectSelection(scope) {
  let filename = await selectionPath(scope);
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function saveProjectSelection(scope, project) {
  let filename = await selectionPath(scope);
  let temporary = `${filename}.${randomUUID()}.tmp`;
  await mkdir(join(getGlobalConfigDir(), 'project-selections'), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await writeFile(temporary, JSON.stringify({ id: project.id }), {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}
