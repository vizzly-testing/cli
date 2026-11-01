import { readFile } from 'node:fs/promises';

export async function readOptionalFile(filename) {
  try {
    return await readFile(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
