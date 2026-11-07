import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { walkDirectory, isBinaryBuffer, parseGitignore } from '../src/walker.js';

test('isBinaryBuffer correctly detects binary data', () => {
  const textBuf = Buffer.from('Hello, world! This is plain UTF-8 text.\nLine 2.\n');
  assert.equal(isBinaryBuffer(textBuf), false);

  const binBuf = Buffer.from([0x48, 0x65, 0x6c, 0x00, 0x6f]); // Contains null byte
  assert.equal(isBinaryBuffer(binBuf), true);
});

test('parseGitignore parses lines into regular expressions', () => {
  const gitignoreContent = `
# Comment line
node_modules/
*.log
!important.log
dist
`;
  const patterns = parseGitignore(gitignoreContent);
  assert.equal(patterns.length, 4);
  assert.equal(patterns[0].pattern, 'node_modules/');
  assert.equal(patterns[1].pattern, '*.log');
  assert.equal(patterns[2].pattern, '!important.log');
  assert.equal(patterns[3].pattern, 'dist');
});

test('walkDirectory walks files respecting ignores, extensions and sizes', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'cp-walk-test-'));
  try {
    mkdirSync(path.join(tempDir, 'src'));
    mkdirSync(path.join(tempDir, 'node_modules'));
    mkdirSync(path.join(tempDir, '.git'));

    writeFileSync(path.join(tempDir, 'package.json'), '{"name": "test"}');
    writeFileSync(path.join(tempDir, 'src', 'index.js'), 'console.log("hello");');
    writeFileSync(path.join(tempDir, 'src', 'large.txt'), 'A'.repeat(5000));
    writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), 'module.exports = {};');
    writeFileSync(path.join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');
    writeFileSync(path.join(tempDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]));

    const result = walkDirectory(tempDir, {
      maxFileSize: 2000,
    });

    const relPaths = result.files.map((f) => f.relativePath.replace(/\\/g, '/'));
    assert.ok(relPaths.includes('package.json'));
    assert.ok(relPaths.includes('src/index.js'));
    // node_modules and .git should be ignored
    assert.ok(!relPaths.some((p) => p.includes('node_modules')));
    assert.ok(!relPaths.some((p) => p.includes('.git')));
    // image.png should be ignored (binary)
    assert.ok(!relPaths.includes('image.png'));
    // large.txt should be skipped due to maxFileSize
    assert.ok(!relPaths.includes('src/large.txt'));
    assert.equal(result.skipped.length > 0, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
