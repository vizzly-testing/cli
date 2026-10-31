import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

let execFileAsync = promisify(execFile);
let KEYCHAIN_SERVICE = 'vizzly-cli';

export function canUseKeychain(platform = process.platform, env = process.env) {
  return platform === 'darwin' && env.VIZZLY_DISABLE_KEYCHAIN !== 'true';
}

export async function saveSecret(account, secret, options = {}) {
  let {
    service = KEYCHAIN_SERVICE,
    platform = process.platform,
    env = process.env,
    execFileFn = execFileAsync,
  } = options;

  if (!canUseKeychain(platform, env)) {
    return false;
  }

  try {
    try {
      await execFileFn('security', [
        'delete-generic-password',
        '-s',
        service,
        '-a',
        account,
      ]);
    } catch {
      // Missing secrets are fine; add-generic-password creates the current value.
    }

    await execFileFn('security', [
      'add-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
      secret,
      '-U',
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function getSecret(account, options = {}) {
  let {
    service = KEYCHAIN_SERVICE,
    platform = process.platform,
    env = process.env,
    execFileFn = execFileAsync,
  } = options;

  if (!canUseKeychain(platform, env)) {
    return null;
  }

  try {
    let { stdout } = await execFileFn('security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function deleteSecret(account, options = {}) {
  let {
    service = KEYCHAIN_SERVICE,
    platform = process.platform,
    env = process.env,
    execFileFn = execFileAsync,
  } = options;

  if (!canUseKeychain(platform, env)) {
    return false;
  }

  try {
    await execFileFn('security', [
      'delete-generic-password',
      '-s',
      service,
      '-a',
      account,
    ]);
    return true;
  } catch {
    return false;
  }
}
