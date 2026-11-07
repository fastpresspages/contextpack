import test from 'node:test';
import assert from 'node:assert/strict';
import { pack, formatXml, formatMarkdown, formatLlmsTxt } from '../src/pack.js';
import { generateTree } from '../src/tree.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = resolve(__dirname, 'fixtures');

test('generateTree produces visual directory hierarchy', () => {
  const tree = generateTree(testDir, { maxDepth: 4 });
  assert.ok(tree.includes('fixtures'));
  assert.ok(tree.includes('src'));
  assert.ok(tree.includes('index.js'));
  assert.ok(tree.includes('tokens'));
});

test('pack respects token budget and flags omitted files', async () => {
  // Low token limit to force omissions
  const result = await pack({
    dir: testDir,
    maxTokens: 60,
    includeTree: true,
  });

  assert.ok(result.totalFiles > 0);
  assert.ok(result.files.length < result.totalFiles || result.omittedFiles.length > 0);
  assert.ok(result.tree);
});

test('pack formats as XML, Markdown, and llms.txt', async () => {
  const result = await pack({
    dir: testDir,
    format: 'xml',
    includeTree: false,
  });

  assert.ok(result.output.startsWith('<documents>'));
  assert.ok(result.output.includes('<document index="1">'));
  assert.ok(result.output.endsWith('</documents>'));

  const mdOutput = formatMarkdown(result);
  assert.ok(mdOutput.includes('## Codebase Contents'));
  assert.ok(mdOutput.includes('### `'));

  const llmsOutput = formatLlmsTxt(result);
  assert.ok(llmsOutput.startsWith('# Codebase Context'));
  assert.ok(llmsOutput.includes('## File: `'));
});
