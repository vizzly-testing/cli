import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOptionalFile } from '../utils/config-discovery.js';
import { fileChange } from '../utils/file-changes.js';
import { getPackageVersion } from '../utils/package-info.js';

let sourcePath = fileURLToPath(
  new URL('../../skills/vizzly/', import.meta.url)
);
let start = '<!-- vizzly-agent-guidance -->';
let end = '<!-- /vizzly-agent-guidance -->';

export function agentGuidancePath(cwd) {
  return path.join(cwd, '.vizzly', 'agent-guidance.json');
}

export async function agentGuidanceFlag(cwd) {
  let agents = await readOptionalFile(path.join(cwd, 'AGENTS.md'));
  return agents?.includes(start) ? '--agent-guidance' : '--agent-skill';
}

function guidanceContent() {
  return `${start}
## Visual testing with Vizzly

For user-facing changes, use the repo-local Vizzly skill at
\`.agents/skills/vizzly/SKILL.md\`.

- Check existing screenshots and diffs before and after the change.
- Use the repository's existing visual test command.
- For cloud reviews, discover supported requests with
  \`vizzly api schema --json\` and inspect baseline, current, and diff images
  together.
- For local results, use \`vizzly context ... --json\`.

Don't approve or reject changes, or replace baselines, unless the task asks
for it.
${end}
`;
}

function addGuidance(source) {
  let content = source || '';
  let starts = content.split(start).length - 1;
  let ends = content.split(end).length - 1;
  let begin = content.indexOf(start);
  let finish = content.indexOf(end);
  if (starts !== ends || starts > 1 || (starts && finish < begin)) {
    throw new Error(
      'Repair the incomplete or duplicate Vizzly guidance markers in AGENTS.md before running init.'
    );
  }
  let block = guidanceContent();
  if (starts) {
    return (
      content.slice(0, begin) +
      block.trimEnd() +
      content.slice(finish + end.length)
    );
  }
  return content.trim() ? `${content.trimEnd()}\n\n${block}` : block;
}

async function skillFiles(directory, prefix = '') {
  let files = [];
  let entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (let entry of entries) {
    let relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await skillFiles(path.join(directory, entry.name), relative))
      );
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

export async function bundledAgentSkill() {
  let files = [];
  let hash = createHash('sha256');
  for (let filename of await skillFiles(sourcePath)) {
    let content = await readOptionalFile(path.join(sourcePath, filename));
    files.push({ filename, content });
    hash.update(JSON.stringify([filename.split(path.sep).join('/'), content]));
  }
  hash.update(guidanceContent());
  return { files, version: hash.digest('hex') };
}

export async function planAgentSetup(cwd, { skill, guidance }) {
  if (!skill && !guidance) return { changes: [] };
  let targetPath = path.join(cwd, '.agents', 'skills', 'vizzly');
  let existing = await readOptionalFile(path.join(targetPath, 'SKILL.md'));
  let skillChanges = [];
  let bundled = await bundledAgentSkill();
  for (let { filename, content } of bundled.files) {
    skillChanges.push(
      await fileChange(path.join(targetPath, filename), content)
    );
  }
  let skillStatus = 'installed';
  if (existing) skillStatus = skillChanges.some(Boolean) ? 'updated' : 'exists';
  let agentSkill = {
    status: skillStatus,
    sourcePath,
    targetPath,
    version: bundled.version,
  };
  let changes = [...skillChanges];
  let agentGuidance;
  if (guidance) {
    let agentsPath = path.join(cwd, 'AGENTS.md');
    let before = await readOptionalFile(agentsPath);
    let after = addGuidance(before);
    changes.push(before === after ? null : { path: agentsPath, before, after });
    let status = 'exists';
    if (before !== after) {
      status = before === null ? 'created' : 'updated';
    }
    agentGuidance = { status, agentsPath };
  }
  let installedGuidance = {
    version: bundled.version,
    cliVersion: getPackageVersion(),
  };
  changes.push(
    await fileChange(
      agentGuidancePath(cwd),
      `${JSON.stringify(installedGuidance, null, 2)}\n`
    )
  );
  return { changes: changes.filter(Boolean), agentSkill, agentGuidance };
}
