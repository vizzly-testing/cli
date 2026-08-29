import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

let testDir = path.dirname(fileURLToPath(import.meta.url));
let skillDir = path.resolve(testDir, '..', '..', 'skills', 'vizzly');

function readFrontmatter(content) {
  let match = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');

  return Object.fromEntries(
    match[1].split('\n').map(line => {
      let separator = line.indexOf(':');
      assert.ok(separator > 0, `Invalid frontmatter line: ${line}`);
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim(),
      ];
    })
  );
}

describe('packaged Vizzly agent skill', () => {
  it('uses the portable Agent Skills structure', async () => {
    let skillPath = path.join(skillDir, 'SKILL.md');
    let content = await readFile(skillPath, 'utf8');
    let frontmatter = readFrontmatter(content);

    assert.deepStrictEqual(
      new Set(Object.keys(frontmatter)),
      new Set(['name', 'description'])
    );
    assert.match(frontmatter.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(frontmatter.name.length <= 64);
    assert.ok(frontmatter.description.length > 0);
    assert.ok(frontmatter.description.length <= 1024);
    await assert.rejects(
      access(path.join(skillDir, 'agents', 'openai.yaml')),
      error => error.code === 'ENOENT'
    );
  });

  it('keeps every referenced guide portable and available', async () => {
    let skillPath = path.join(skillDir, 'SKILL.md');
    let content = await readFile(skillPath, 'utf8');
    let references = [
      ...content.matchAll(/\]\((references\/[^)]+\.md)\)/g),
    ].map(match => match[1]);

    assert.ok(references.length > 0);

    for (let reference of references) {
      let referenceContent = await readFile(
        path.join(skillDir, reference),
        'utf8'
      );
      assert.doesNotMatch(referenceContent, /\$vizzly|Codex|Claude|OpenAI/);
    }
  });
});
