import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(__dirname, '../bin/contextpack.js');

describe('CLI execution', () => {
  test('prints help with -h or --help', () => {
    const stdout = execFileSync(process.execPath, [binPath, '--help'], { encoding: 'utf8' });
    assert.match(stdout, /Usage: contextpack/);
    assert.match(stdout, /Options:/);
    assert.match(stdout, /--max-tokens/);
    assert.match(stdout, /--tree-only/);
  });

  test('prints version with -v or --version', () => {
    const stdout = execFileSync(process.execPath, [binPath, '--version'], { encoding: 'utf8' });
    assert.match(stdout, /0\.1\.0/);
  });

  test('runs tree-only on directory', () => {
    const stdout = execFileSync(process.execPath, [binPath, __dirname, '--tree-only'], { encoding: 'utf8' });
    assert.match(stdout, /test/);
    assert.match(stdout, /tokenizer\.test\.js/);
  });

  test('runs tokens-only estimate', () => {
    const stdout = execFileSync(process.execPath, [binPath, __dirname, '--tokens-only'], { encoding: 'utf8' });
    assert.match(stdout, /tokens/i);
    assert.match(stdout, /Estimated tokens:/);
  });

  test('runs packaging with json format', () => {
    const stdout = execFileSync(process.execPath, [binPath, __dirname, '--format', 'json', '--max-tokens', '10k'], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.metadata);
    assert.ok(Array.isArray(parsed.files));
    assert.ok(parsed.files.length > 0);
  });

  test('runs packaging with xml format', () => {
    const stdout = execFileSync(process.execPath, [binPath, __dirname, '--format', 'xml', '--max-tokens', '10k'], { encoding: 'utf8' });
    assert.match(stdout, /<documents>/);
    assert.match(stdout, /<document index=/);
    assert.match(stdout, /<\/documents>/);
  });
});
