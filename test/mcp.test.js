import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../mcp/server.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures', 'sample-repo');

test('mcp: initialize request returns server info and capabilities', async () => {
  const req = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  const res = await handleRequest(req);
  assert.equal(res.jsonrpc, '2.0');
  assert.equal(res.id, 1);
  assert.equal(res.result.serverInfo.name, 'contextpack');
  assert.ok(res.result.capabilities.tools);
});

test('mcp: ping request returns empty object', async () => {
  const res = await handleRequest({ jsonrpc: '2.0', id: 2, method: 'ping' });
  assert.deepEqual(res.result, {});
});

test('mcp: tools/list returns available tools', async () => {
  const res = await handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.ok(Array.isArray(res.result.tools));
  const toolNames = res.result.tools.map(t => t.name);
  assert.ok(toolNames.includes('pack_codebase'));
  assert.ok(toolNames.includes('get_tree'));
  assert.ok(toolNames.includes('pack_diff'));
  assert.ok(toolNames.includes('estimate_tokens'));
});

test('mcp: tools/call pack_codebase executes on fixture directory', async () => {
  const res = await handleRequest({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'pack_codebase',
      arguments: {
        path: fixturesDir,
        format: 'xml',
        includeTree: true
      }
    }
  });

  assert.ok(res.result);
  assert.ok(res.result.content);
  assert.equal(res.result.content[0].type, 'text');
  const text = res.result.content[0].text;
  assert.match(text, /<documents>/);
  assert.match(text, /index\.js/);
  assert.match(text, /SAMPLE REPO/);
});

test('mcp: tools/call get_tree returns visual directory tree', async () => {
  const res = await handleRequest({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'get_tree',
      arguments: {
        path: fixturesDir
      }
    }
  });

  const text = res.result.content[0].text;
  assert.match(text, /sample-repo/);
  assert.match(text, /index\.js/);
  assert.match(text, /helpers\.js/);
});

test('mcp: tools/call estimate_tokens calculates tokens for text', async () => {
  const res = await handleRequest({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'estimate_tokens',
      arguments: {
        text: 'function helloWorld() {\n  return 42;\n}'
      }
    }
  });

  const text = res.result.content[0].text;
  const parsed = JSON.parse(text);
  assert.ok(parsed.tokens > 0);
  assert.equal(parsed.lines, 3);
});

test('mcp: unknown tool returns error result', async () => {
  const res = await handleRequest({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'non_existent_tool',
      arguments: {}
    }
  });

  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /Unknown tool/);
});
