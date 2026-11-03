import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { getGlobalConfigDir } from '../../shared/global-config.js';
import { withLocalLock } from '../../shared/local-lock.js';
import * as output from '../../shared/output.js';
import {
  canUseKeychain,
  deleteSecret,
  getSecret,
  saveSecret,
} from '../../shared/secret-store.js';
import { VizzlyError } from '../../shared/vizzly-error.js';
import { getApiUrl } from '../config/environment.js';

export function authOrigin(apiUrl = getApiUrl()) {
  let url = new URL(apiUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new VizzlyError(
      'Use an HTTP or HTTPS API origin without credentials.',
      'INVALID_API_URL'
    );
  }
  return url.origin;
}

export function getAuthStoragePath(
  apiUrl = getApiUrl(),
  home = getGlobalConfigDir()
) {
  let key = createHash('sha256').update(authOrigin(apiUrl)).digest('hex');
  return join(resolve(home), 'auth', `${key}.json`);
}

function storageError() {
  return new VizzlyError(
    'Unable to read your saved login. Unlock the system credential store or run vizzly login to save a new session.',
    'AUTH_STORAGE_UNAVAILABLE'
  );
}

function tokenData(auth) {
  return Object.fromEntries(
    ['accessToken', 'refreshToken', 'expiresAt', 'user', 'authorization']
      .filter(key => auth[key] !== undefined)
      .map(key => [key, auth[key]])
  );
}

async function writeRecord(filename, record) {
  let directory = dirname(filename);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  let temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(record, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function createTokenStore(options = {}) {
  let apiUrl = authOrigin(options.apiUrl);
  let home = resolve(options.home || getGlobalConfigDir());
  let filename = getAuthStoragePath(apiUrl, home);
  let env = options.env || process.env;
  let platform = options.platform || process.platform;
  let storage =
    options.storage ||
    env.VIZZLY_AUTH_STORAGE ||
    (env.VIZZLY_HOME || options.home ? 'file' : 'auto');
  if (!['auto', 'file', 'keychain'].includes(storage)) {
    throw new VizzlyError(
      'VIZZLY_AUTH_STORAGE must be file, keychain, or auto.',
      'INVALID_AUTH_STORAGE'
    );
  }
  let secretOptions = {
    service: 'vizzly-cli-user-session',
    platform,
    env,
    ...(options.execFileFn ? { execFileFn: options.execFileFn } : {}),
  };
  let account = createHash('sha256').update(`${home}|${apiUrl}`).digest('hex');
  let lockKey = `vizzly-auth|${process.getuid?.() ?? 'user'}|${home}|${apiUrl}`;

  async function getTokens() {
    let record;
    try {
      record = JSON.parse(await readFile(filename, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw storageError();
      return null;
    }
    if (record.apiUrl !== apiUrl) throw storageError();
    if (record.storage === 'keychain') {
      let secret = await getSecret(account, secretOptions);
      if (!secret) throw storageError();
      try {
        let auth = JSON.parse(secret);
        if (!auth.accessToken) throw storageError();
        return tokenData(auth);
      } catch {
        throw storageError();
      }
    }
    if (record.storage !== 'file') throw storageError();
    return record.accessToken ? tokenData(record) : null;
  }

  async function saveTokens(auth) {
    let tokens = tokenData(auth);
    let useKeychain = storage !== 'file' && canUseKeychain(platform, env);
    let saved =
      useKeychain &&
      (await saveSecret(account, JSON.stringify(tokens), secretOptions));
    if (storage === 'keychain' && !saved) throw storageError();
    if (storage === 'auto' && useKeychain && !saved) {
      output.warn(
        'System credential storage is unavailable. Saving this login in an owner-only credential file.'
      );
    }
    let metadata = {
      version: 1,
      apiUrl,
      storage: saved ? 'keychain' : 'file',
      expiresAt: tokens.expiresAt,
      user: tokens.user,
      authorization: tokens.authorization,
    };
    await writeRecord(filename, saved ? metadata : { ...metadata, ...tokens });
  }

  async function clearTokens() {
    await writeRecord(filename, { version: 1, apiUrl, storage: 'file' });
    if (storage !== 'file') await deleteSecret(account, secretOptions);
  }

  async function withRefreshLock(operation, lockOptions) {
    try {
      return await withLocalLock(lockKey, operation, lockOptions);
    } catch (error) {
      if (error.code === 'LOCAL_LOCK_UNAVAILABLE') {
        throw new VizzlyError(
          'Another CLI operation or local service is using the session lock. Retry this command after it finishes.',
          'AUTH_SESSION_BUSY'
        );
      }
      throw error;
    }
  }
  return { apiUrl, getTokens, saveTokens, clearTokens, withRefreshLock };
}

export async function getAuthTokens(apiUrl) {
  return await createTokenStore({ apiUrl }).getTokens();
}

export async function saveAuthTokens(auth, apiUrl) {
  await createTokenStore({ apiUrl }).saveTokens(auth);
}

export async function clearAuthTokens(apiUrl) {
  await createTokenStore({ apiUrl }).clearTokens();
}

function hasValidAccessToken(auth, now = Date.now()) {
  if (!auth?.accessToken || !auth.authorization) return false;
  if (!auth.expiresAt) return true;
  return now < Date.parse(auth.expiresAt) - 5 * 60 * 1000;
}

export async function hasValidTokens(apiUrl) {
  return hasValidAccessToken(await getAuthTokens(apiUrl));
}

export async function getAccessToken(apiUrl) {
  let auth = await getAuthTokens(apiUrl);
  return hasValidAccessToken(auth) ? auth.accessToken : null;
}
