#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

let execFileAsync = promisify(execFile);

function log(message) {
  console.log(`[smoke:prod:pack] ${message}`);
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON: ${error.message}\n${text}`);
  }
}

async function run(command, args, options = {}) {
  let { stdout, stderr } = await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024 * 20,
    ...options,
  });

  if (stderr?.trim()) {
    process.stderr.write(stderr);
  }

  return stdout;
}

async function runPackaged(binPath, args, env) {
  let stdout = await run(process.execPath, [binPath, ...args], { env });
  let parsed = readJson(stdout, `vizzly ${args.join(' ')}`);

  if (parsed.status !== 'data') {
    throw new Error(
      `Unexpected CLI status for ${args.join(' ')}: ${parsed.status}`
    );
  }

  return parsed.data;
}

async function loadAuth(sourceHome) {
  let configPath = join(sourceHome, 'config.json');

  if (!existsSync(configPath)) {
    throw new Error(
      `No Vizzly auth config found at ${configPath}. Run "vizzly login" before prod smoke.`
    );
  }

  let config = readJson(await readFile(configPath, 'utf8'), configPath);

  if (!config.auth?.accessToken) {
    throw new Error(
      `No user access token found in ${configPath}. Run "vizzly login" first.`
    );
  }

  return config.auth;
}

async function revokeProjectToken({
  apiUrl,
  auth,
  organizationSlug,
  projectSlug,
  tokenId,
}) {
  if (!tokenId) {
    return;
  }

  let response = await fetch(
    `${apiUrl}/api/project/${projectSlug}/tokens/${tokenId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'X-Organization': organizationSlug,
      },
    }
  );

  if (!response.ok) {
    let body = await response.text();
    throw new Error(
      `Failed to revoke smoke token ${tokenId}: ${response.status} ${body}`
    );
  }
}

async function main() {
  let apiUrl =
    process.env.VIZZLY_PROD_SMOKE_API_URL || 'https://app.vizzly.dev';
  let organizationSlug = process.env.VIZZLY_PROD_SMOKE_ORG || 'vizzly';
  let projectSlug = process.env.VIZZLY_PROD_SMOKE_PROJECT || 'frontend';
  let sourceHome = process.env.VIZZLY_HOME || join(homedir(), '.vizzly');
  let keepTmp = process.env.VIZZLY_PROD_SMOKE_KEEP_TMP === 'true';
  let workspace = process.cwd();
  let tmpRoot = await mkdtemp(join(tmpdir(), 'vizzly-prod-smoke-'));
  let smokeHome = join(tmpRoot, 'home');
  let packDir = join(tmpRoot, 'pack');
  let installDir = join(tmpRoot, 'install');
  let cacheDir = join(tmpRoot, 'npm-cache');
  let tokenId = null;

  try {
    log('building CLI');
    await run('npm', ['run', 'build'], { cwd: workspace });

    log('packing CLI');
    await mkdir(packDir, { recursive: true });
    let packOutput = await run(
      'npm',
      ['pack', '--pack-destination', packDir, '--cache', cacheDir],
      { cwd: workspace }
    );
    let tarballName = packOutput.trim().split('\n').at(-1);
    let tarballPath = join(packDir, tarballName);

    log(`installing ${tarballName}`);
    await mkdir(installDir, { recursive: true });
    await writeFile(
      join(installDir, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }, null, 2)
    );
    await run(
      'npm',
      [
        'install',
        '--omit=dev',
        '--ignore-scripts',
        '--cache',
        cacheDir,
        tarballPath,
      ],
      { cwd: installDir }
    );

    let binPath = join(
      installDir,
      'node_modules',
      '@vizzly-testing',
      'cli',
      'bin',
      'vizzly.js'
    );
    let auth = await loadAuth(sourceHome);
    await mkdir(smokeHome, { recursive: true });
    await writeFile(
      join(smokeHome, 'config.json'),
      JSON.stringify({ auth }, null, 2),
      { mode: 0o600 }
    );

    let env = {
      ...process.env,
      VIZZLY_API_URL: apiUrl,
      VIZZLY_HOME: smokeHome,
      VIZZLY_DISABLE_KEYCHAIN: 'true',
    };

    log('verifying user auth');
    let whoami = await runPackaged(binPath, ['whoami', '--json'], env);
    if (!whoami.authenticated) {
      throw new Error(
        'Packaged CLI did not authenticate with copied smoke auth.'
      );
    }

    log(`linking ${organizationSlug}/${projectSlug}`);
    let link = await runPackaged(
      binPath,
      [
        'project',
        'link',
        `${organizationSlug}/${projectSlug}`,
        '--name',
        `prod-smoke-${Date.now()}`,
        '--json',
      ],
      env
    );

    let smokeConfig = readJson(
      await readFile(join(smokeHome, 'config.json'), 'utf8'),
      'smoke config'
    );
    let linkedProject = Object.values(smokeConfig.projectLink?.links || {})[0];
    tokenId = linkedProject?.tokenId || null;

    if (!link.linked || !tokenId) {
      throw new Error('Project link did not create a scoped smoke token.');
    }

    delete smokeConfig.auth;
    await writeFile(
      join(smokeHome, 'config.json'),
      JSON.stringify(smokeConfig, null, 2),
      {
        mode: 0o600,
      }
    );

    log('verifying linked project token');
    let builds = await runPackaged(
      binPath,
      ['builds', '--project', projectSlug, '--limit', '1', '--json'],
      env
    );
    let build = builds.builds?.[0];

    if (!build?.id) {
      throw new Error(
        `No production builds found for ${organizationSlug}/${projectSlug}.`
      );
    }

    log(`fetching compact agent context for ${build.id}`);
    let context = await runPackaged(
      binPath,
      ['context', 'build', build.id, '--source', 'cloud', '--agent', '--json'],
      env
    );

    if (context.resource !== 'build_agent_context') {
      throw new Error(`Expected build_agent_context, got ${context.resource}`);
    }

    if (context.screenshots) {
      throw new Error(
        'Compact agent context unexpectedly included screenshots by default.'
      );
    }

    if (
      !Array.isArray(context.next_actions) ||
      context.next_actions.length === 0
    ) {
      throw new Error('Compact agent context did not include next actions.');
    }

    log('revoking smoke token');
    await revokeProjectToken({
      apiUrl,
      auth,
      organizationSlug,
      projectSlug,
      tokenId,
    });
    tokenId = null;

    log('passed');
  } finally {
    if (tokenId) {
      try {
        let auth = await loadAuth(sourceHome);
        await revokeProjectToken({
          apiUrl,
          auth,
          organizationSlug,
          projectSlug,
          tokenId,
        });
      } catch (error) {
        console.error(
          `[smoke:prod:pack] failed to revoke smoke token: ${error.message}`
        );
      }
    }

    if (keepTmp) {
      log(`kept temp dir: ${tmpRoot}`);
    } else {
      await rm(tmpRoot, { recursive: true, force: true });
    }

    if (existsSync(join(workspace, '$HOME'))) {
      await rm(join(workspace, '$HOME'), { recursive: true, force: true });
    }
  }
}

await main();
