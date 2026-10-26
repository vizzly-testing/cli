import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOptionalFile } from '../utils/config-discovery.js';
import { fileChange } from '../utils/file-changes.js';

let sourcePath = fileURLToPath(
  new URL('../../skills/vizzly/', import.meta.url)
);
let start = '<!-- vizzly-agent-guidance -->';
let end = '<!-- /vizzly-agent-guidance -->';

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

function upsertGuidance(source) {
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
    return `${content.slice(0, begin)}${block.trimEnd()}${content.slice(finish + end.length)}`;
  }
  return content.trim() ? `${content.trimEnd()}\n\n${block}` : block;
}

async function skillFiles(directory, prefix = '') {
  let files = [];
  for (let entry of await readdir(directory, { withFileTypes: true })) {
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

export async function planAgentSetup(cwd, { skill, guidance, refresh }) {
  if (!skill && !guidance) return { changes: [] };
  let targetPath = path.join(cwd, '.agents', 'skills', 'vizzly');
  let existing = await readOptionalFile(path.join(targetPath, 'SKILL.md'));
  let changes = [];
  if (!existing || refresh) {
    for (let filename of await skillFiles(sourcePath)) {
      changes.push(
        await fileChange(
          path.join(targetPath, filename),
          await readOptionalFile(path.join(sourcePath, filename))
        )
      );
    }
    // This file belonged to the previous bundled skill, not the portable one.
    if (refresh)
      changes.push(
        await fileChange(path.join(targetPath, 'agents', 'openai.yaml'), null)
      );
  }
  let skillStatus = 'installed';
  if (existing) skillStatus = changes.some(Boolean) ? 'refreshed' : 'exists';
  let agentSkill = {
    status: skillStatus,
    sourcePath,
    targetPath,
  };
  let agentGuidance;
  if (guidance) {
    let agentsPath = path.join(cwd, 'AGENTS.md');
    let before = await readOptionalFile(agentsPath);
    let after = upsertGuidance(before);
    changes.push(before === after ? null : { path: agentsPath, before, after });
    let status = 'exists';
    if (before !== after) {
      status = before?.includes(start) ? 'refreshed' : 'updated';
      if (before === null) status = 'created';
    }
    agentGuidance = { status, agentsPath };
  }
  return { changes: changes.filter(Boolean), agentSkill, agentGuidance };
}
