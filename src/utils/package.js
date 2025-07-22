import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function getPackageInfo() {
  const packagePath = resolve(__dirname, '../../package.json');
  const content = await readFile(packagePath, 'utf-8');
  return JSON.parse(content);
}
