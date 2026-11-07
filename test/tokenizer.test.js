import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { countTokens, formatTokens, getContentStats } from '../src/tokenizer.js';

describe('tokenizer', () => {
  test('counts tokens on empty or non-string inputs', () => {
    assert.equal(countTokens(''), 0);
    assert.equal(countTokens(null), 0);
    assert.equal(countTokens(undefined), 0);
  });

  test('approximates tokens for code snippets realistically', () => {
    const code = `function helloWorld() {\n  console.log("Hello, world!");\n  return 42;\n}`;
    const tokens = countTokens(code);
    assert.ok(tokens > 10 && tokens < 35, `Token count ${tokens} should be in reasonable range`);
  });

  test('formats tokens cleanly with k/M suffixes', () => {
    assert.equal(formatTokens(0), '0');
    assert.equal(formatTokens(850), '850');
    assert.equal(formatTokens(1200), '1.2k');
    assert.equal(formatTokens(128000), '128.0k');
    assert.equal(formatTokens(1500000), '1.5M');
  });

  test('getContentStats returns accurate breakdown', () => {
    const text = 'Line 1\nLine 2\nLine 3\n';
    const stats = getContentStats(text);
    assert.equal(stats.lines, 4);
    assert.equal(stats.characters, text.length);
    assert.ok(stats.tokens > 0);
    assert.equal(stats.bytes, Buffer.byteLength(text, 'utf8'));
  });
});
