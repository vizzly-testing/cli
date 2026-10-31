import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyChanges,
  fileChange,
  preflightChanges,
} from '../../services/file-changes.js';
import { readOptionalFile } from '../../services/files.js';
import { getGlobalConfigDir } from '../../services/global-config.js';
import * as output from '../../services/output.js';
import {
  getPackageName,
  getPackageVersion,
} from '../../services/package-info.js';
import {
  agentGuidanceFlag,
  agentGuidancePath,
  bundledAgentSkill,
  planAgentSetup,
} from '../setup/agent-setup.js';
import { createPrompts } from '../setup/setup-prompts.js';
import { findCliUpdatePlan, runUpdateProcess } from './cli-update.js';

let day = 24 * 60 * 60 * 1000;

async function readState(filename) {
  try {
    let state = JSON.parse(await readOptionalFile(filename));
    return state && typeof state === 'object' && !Array.isArray(state)
      ? state
      : {};
  } catch {
    return {};
  }
}

async function stateChange(filename, state) {
  return fileChange(filename, `${JSON.stringify(state, null, 2)}\n`);
}

// The registry's latest tag contains stable releases. Never suggest a downgrade
// or a prerelease, even when an unexpected registry response is cached.
export function isNewerStableVersion(candidate, current) {
  let latest = /^(\d+)\.(\d+)\.(\d+)$/.exec(candidate);
  let installed = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(
    current
  );
  if (!latest || !installed) return false;
  for (let index = 1; index <= 3; index++) {
    let difference = Number(latest[index]) - Number(installed[index]);
    if (difference) return difference > 0;
  }
  return Boolean(installed[4]);
}

export async function checkForUpdate() {
  try {
    let filename = path.join(getGlobalConfigDir(), 'updates.json');
    let response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(getPackageName())}/latest`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!response.ok) return;
    let { version } = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return;
    // Keep notice history saved while the network request was in flight.
    let state = await readState(filename);
    await applyChanges([
      await stateChange(filename, { ...state, latestVersion: version }),
    ]);
  } catch {
    // Update checks never affect the command being run.
  }
}

async function offerUpdate(cwd, { cliVersion, guidanceFlag }) {
  if (!process.stdin.isTTY) return;
  let cliPlan = cliVersion ? await findCliUpdatePlan(cwd, cliVersion) : null;
  if (!cliPlan && !guidanceFlag) return;
  let updatedCli;
  try {
    let guidancePlan;
    if (!cliPlan && guidanceFlag) {
      guidancePlan = await planAgentSetup(cwd, {
        skill: true,
        guidance: guidanceFlag === '--agent-guidance',
      });
      await preflightChanges(guidancePlan.changes);
    }
    if (cliPlan) {
      output.printErr(
        `  Apply: ${cliPlan.command} ${cliPlan.args.join(' ')} (in ${cliPlan.cwd})`
      );
      // A CLI upgrade can bring new guidance even if the current bundle matches.
      if (
        !guidanceFlag &&
        (await readOptionalFile(
          path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md')
        ))
      ) {
        guidanceFlag = await agentGuidanceFlag(cwd);
      }
    }
    if (guidanceFlag) {
      output.printErr(
        `  Refresh: vizzly init ${guidanceFlag} (replaces bundled skill files${guidanceFlag === '--agent-guidance' ? ' and the Vizzly AGENTS.md note' : ''})`
      );
    }
    if (!(await confirmUpdate())) return;
    if (cliPlan) {
      await runUpdateProcess(cliPlan.command, cliPlan.args, cliPlan.cwd);
      updatedCli = cliPlan.cliPath;
      if (guidanceFlag) {
        await runUpdateProcess(
          process.execPath,
          [cliPlan.cliPath, 'init', guidanceFlag, '--no-update-notifier'],
          cwd
        );
      }
    } else {
      await applyChanges(guidancePlan.changes);
    }
    output.printErr('  Vizzly update applied.');
  } catch (error) {
    if (error.code !== 'INIT_CANCELLED')
      output.printErr(`  Could not apply the Vizzly update: ${error.message}`);
  }
  return updatedCli;
}

async function confirmUpdate() {
  let prompts = createPrompts();
  try {
    return await prompts.confirm('Apply available Vizzly updates now?');
  } finally {
    prompts.close();
  }
}

async function planGuidanceNotice(cwd, cliVersion) {
  let installed = await readOptionalFile(
    path.join(cwd, '.agents', 'skills', 'vizzly', 'SKILL.md')
  );
  let guidance = await readState(agentGuidancePath(cwd));
  if (!installed || isNewerStableVersion(guidance.cliVersion, cliVersion))
    return null;

  let { version, files } = await bundledAgentSkill();
  if (!guidance.version) {
    let contents = await Promise.all(
      files.map(({ filename }) =>
        readOptionalFile(
          path.join(cwd, '.agents', 'skills', 'vizzly', filename)
        )
      )
    );
    if (files.every(({ content }, index) => content === contents[index]))
      guidance.version = version;
  }
  if (guidance.version === version || guidance.notifiedVersion === version)
    return null;

  let flag = await agentGuidanceFlag(cwd);
  return {
    flag,
    message: `Vizzly agent guidance has an update. Run vizzly init ${flag} to refresh it.`,
    change: await stateChange(agentGuidancePath(cwd), {
      ...guidance,
      notifiedVersion: version,
    }),
  };
}

function startUpdateCheck() {
  output.printErr('  Checking for Vizzly updates in the background…');
  let child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./update-check.js', import.meta.url))],
    { detached: true, stdio: 'ignore' }
  );
  child.on('error', () => {});
  child.unref();
}

export async function notifyUpdates(options = {}) {
  if (
    options.updateNotifier === false ||
    options.json ||
    output.isJson() ||
    !process.stderr.isTTY ||
    !process.stdout.isTTY ||
    process.env.CI ||
    'NO_UPDATE_NOTIFIER' in process.env ||
    'VIZZLY_NO_UPDATE_NOTIFIER' in process.env ||
    !['info', 'debug'].includes(output.getLogLevel())
  )
    return;

  try {
    let cwd = process.cwd();
    let filename = path.join(getGlobalConfigDir(), 'updates.json');
    let state = await readState(filename);
    let messages = [];
    let available = {};
    let cliVersion = getPackageVersion();
    if (
      isNewerStableVersion(state.latestVersion, cliVersion) &&
      state.notifiedCliVersion !== state.latestVersion
    ) {
      messages.push(
        `Vizzly ${state.latestVersion} is available (installed: ${cliVersion}). Update ${getPackageName()} with the package manager that installed it.`
      );
      state.notifiedCliVersion = state.latestVersion;
      available.cliVersion = state.latestVersion;
    }

    let guidanceNotice = await planGuidanceNotice(cwd, cliVersion);
    if (guidanceNotice) {
      messages.push(guidanceNotice.message);
      available.guidanceFlag = guidanceNotice.flag;
    }

    let checkDue =
      !Number.isFinite(state.lastCheckedAt) ||
      state.lastCheckedAt > Date.now() ||
      Date.now() - state.lastCheckedAt >= day;
    if (checkDue) state.lastCheckedAt = Date.now();
    // If state cannot be saved, stay quiet instead of repeating a notice on
    // every invocation. Setup's file preflight also protects against symlinks.
    await applyChanges([
      guidanceNotice?.change,
      await stateChange(filename, state),
    ]);
    for (let message of messages) output.printErr(`  ${message}`);
    if (checkDue) startUpdateCheck();
    return await offerUpdate(cwd, available);
  } catch {
    // Missing, malformed, or unwritable metadata must not break CLI commands.
  }
}
