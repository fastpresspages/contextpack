#!/usr/bin/env node
/**
 * ContextPack MCP server — zero runtime dependencies, stdio JSON-RPC transport.
 *
 * Any MCP-compatible agent or client (Claude Code, Cursor, OpenCode, Windsurf, Zed...)
 * can pack codebases, inspect trees, get token-budgeted context, and analyze git diffs.
 */
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import {
  pack,
  formatXml,
  formatMarkdown,
  formatLlmsTxt,
  generateTree,
  countTokens,
  formatTokens,
  getContentStats,
  getGitDiff,
  getGitInfo,
  isGitRepo,
} from '../src/index.js';

const VERSION = '0.1.0';

const TOOLS = [
  {
    name: 'pack_codebase',
    title: 'Pack codebase into LLM context',
    description:
      'Pack a project or directory into token-budgeted, LLM-optimized context (<documents><document> XML, Markdown, or llms.txt). Respects .gitignore, skips binaries, builds directory tree, and enforces token limits cleanly.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the directory to pack. Defaults to current directory.',
          default: '.',
        },
        format: {
          type: 'string',
          enum: ['xml', 'markdown', 'llms', 'json'],
          default: 'xml',
          description: 'Output format: xml (<documents><document>), markdown, llms (llms-full.txt style), or json.',
        },
        max_tokens: {
          type: 'integer',
          description: 'Optional maximum token budget (e.g. 32000, 64000, 128000). Files exceeding the budget are omitted cleanly.',
        },
        include: {
          type: 'string',
          description: 'Comma-separated patterns to include (e.g. "src/**/*.js,README.md").',
        },
        exclude: {
          type: 'string',
          description: 'Comma-separated patterns to exclude in addition to defaults.',
        },
        max_depth: {
          type: 'integer',
          default: 10,
          description: 'Maximum directory recursion depth.',
        },
        include_tree: {
          type: 'boolean',
          default: true,
          description: 'Whether to include visual directory tree in header.',
        },
        include_line_numbers: {
          type: 'boolean',
          default: false,
          description: 'Prefix lines with 1-based line numbers.',
        },
        include_git_diff: {
          type: 'boolean',
          default: false,
          description: 'Include current git diff (working tree changes) in metadata.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_tree',
    title: 'Get visual directory tree with token metrics',
    description:
      'Generate a visual directory tree of a project showing file structure, sizes, and token counts while respecting .gitignore and ignore rules.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          default: '.',
          description: 'Directory path to visualize.',
        },
        max_depth: {
          type: 'integer',
          default: 4,
          description: 'Maximum depth to display.',
        },
        show_tokens: {
          type: 'boolean',
          default: true,
          description: 'Include estimated token counts next to files.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'pack_diff',
    title: 'Pack git diff with context',
    description:
      'Extract working tree or staged git diff with commit info and token statistics for code review or summarization.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          default: '.',
          description: 'Repository root or subfolder.',
        },
        staged: {
          type: 'boolean',
          default: false,
          description: 'If true, inspect staged changes instead of unstaged.',
        },
        target: {
          type: 'string',
          description: 'Optional branch/commit ref to diff against (e.g. "main" or "HEAD~1").',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'xml', 'json'],
          default: 'markdown',
          description: 'Output format.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'estimate_tokens',
    title: 'Estimate tokens for text or file',
    description:
      'Calculate fast BPE-calibrated token count, line count, character count, and byte size for provided text or a file on disk.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Raw text string to estimate.',
        },
        file_path: {
          type: 'string',
          description: 'File path to read and estimate.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const INSTRUCTIONS = `ContextPack prepares token-budgeted, LLM-optimized context from local repositories and codebases.

Key features:
1. pack_codebase: Assemble an entire repo or directory into XML (<documents><document>), Markdown, or llms-full.txt format with token budgets.
2. get_tree: Generate an ASCII/Unicode directory tree showing structure and token counts.
3. pack_diff: Grab current git diffs with token metrics.
4. estimate_tokens: Fast token count heuristic calibrated against frontier LLMs.

All operations are read-only and zero-dependency.`;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function error(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

export async function handleRequest(request) {
  const { id, method, params } = request || {};
  const isNotification = id === undefined || id === null;

  let result;

  if (method === 'initialize') {
    result = {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'contextpack', version: VERSION, title: 'ContextPack' },
      instructions: INSTRUCTIONS,
    };
  } else if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null;
  } else if (method === 'ping') {
    result = {};
  } else if (method === 'tools/list') {
    result = { tools: TOOLS };
  } else if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};

    try {
      if (name === 'pack_codebase') {
        const targetPath = resolve(args.path || '.');
        const includeList = args.include ? (Array.isArray(args.include) ? args.include : args.include.split(',').map((s) => s.trim()).filter(Boolean)) : undefined;
        const excludeList = args.exclude ? (Array.isArray(args.exclude) ? args.exclude : args.exclude.split(',').map((s) => s.trim()).filter(Boolean)) : undefined;

        const data = await pack({
          cwd: targetPath,
          maxTokens: args.max_tokens ?? args.maxTokens,
          maxDepth: args.max_depth ?? args.maxDepth ?? 10,
          includeTree: (args.includeTree ?? args.include_tree) !== false,
          includeLineNumbers: Boolean(args.include_line_numbers ?? args.includeLineNumbers),
          includeGitDiff: Boolean(args.include_git_diff ?? args.includeGitDiff),
          include: includeList,
          exclude: excludeList,
          format: args.format || 'xml',
        });

        const outputText = data.output || data.text || data.content;

        result = {
          content: [{ type: 'text', text: outputText }],
          structuredContent: {
            totalFiles: data.totalFiles || data.stats?.total_files,
            totalTokens: data.totalTokens || data.stats?.total_tokens,
            formattedTokens: formatTokens(data.totalTokens || data.stats?.total_tokens || 0),
            omittedFilesCount: (data.omittedFiles || data.omitted_files)?.length || 0,
            format: args.format || 'xml',
          },
          isError: false,
        };
      } else if (name === 'get_tree') {
        const targetPath = resolve(args.path || '.');
        const treeText = generateTree(targetPath, {
          maxDepth: args.max_depth ?? args.maxDepth ?? 4,
          showSize: args.show_size ?? args.showSize ?? true,
        });

        result = {
          content: [{ type: 'text', text: treeText }],
          isError: false,
        };
      } else if (name === 'pack_diff') {
        const targetPath = resolve(args.path || '.');
        if (!isGitRepo(targetPath)) {
          result = {
            content: [{ type: 'text', text: `Directory "${targetPath}" is not inside a git repository.` }],
            isError: true,
          };
        } else {
          const gitInfo = getGitInfo(targetPath);
          const diffInfo = getGitDiff(targetPath, {
            staged: Boolean(args.staged),
            target: args.target,
          });

          if (args.format === 'json') {
            result = {
              content: [{ type: 'text', text: JSON.stringify({ git: gitInfo, diff: diffInfo }, null, 2) }],
              isError: false,
            };
          } else {
            const lines = [
              `# Git Diff Report`,
              `- **Repository:** ${gitInfo.root}`,
              `- **Branch:** ${gitInfo.branch || 'detached'}`,
              `- **Commit:** ${gitInfo.commit || 'unknown'}`,
              `- **Scope:** ${args.staged ? 'Staged changes' : (args.target ? `Diff against ${args.target}` : 'Working tree changes')}`,
              `- **Changed Files:** ${diffInfo.files.length}`,
              `- **Estimated Diff Tokens:** ~${formatTokens(diffInfo.tokens)} (${diffInfo.tokens.toLocaleString()})`,
              '',
              '## Files Changed',
              ...(diffInfo.files.length > 0 ? diffInfo.files.map((f) => `- \`${f}\``) : ['_No changes detected._']),
              '',
            ];

            if (diffInfo.diff) {
              lines.push('## Diff Content', '```diff', diffInfo.diff, '```');
            }

            result = {
              content: [{ type: 'text', text: lines.join('\n') }],
              structuredContent: {
                branch: gitInfo.branch,
                changedFiles: diffInfo.files,
                diffTokens: diffInfo.tokens,
              },
              isError: false,
            };
          }
        }
      } else if (name === 'estimate_tokens') {
        let textToAnalyze = '';
        let source = '';

        if (args.text) {
          textToAnalyze = args.text;
          source = 'raw_text';
        } else if (args.file_path || args.filePath) {
          const p = resolve(args.file_path || args.filePath);
          textToAnalyze = readFileSync(p, 'utf8');
          source = p;
        } else {
          result = {
            content: [{ type: 'text', text: 'Please provide either "text" or "file_path".' }],
            isError: true,
          };
        }

        if (!result) {
          const stats = getContentStats(textToAnalyze);
          result = {
            content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
            structuredContent: stats,
            isError: false,
          };
        }
      } else {
        result = { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
      }
    } catch (err) {
      result = {
        content: [{ type: 'text', text: `ContextPack error: ${err.message}` }],
        isError: true,
      };
    }
  } else if (method === 'resources/list') {
    result = { resources: [] };
  } else if (method === 'prompts/list') {
    result = { prompts: [] };
  } else {
    if (isNotification) return null;
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }

  if (isNotification) return null;

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  };
}

// ── stdio transport ─────────────────────────────────────────────────────────
const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || /server\.js$/i.test(process.argv[1] || '');

if (isMain) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queue = Promise.resolve();

  rl.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        error(null, -32700, 'Parse error');
        return;
      }
      try {
        const response = await handleRequest(request);
        if (response !== null) send(response);
      } catch (err) {
        error(request.id ?? null, err.code || -32603, err.message || 'Internal error');
      }
    });
  });

  rl.on('close', () => {
    queue.finally(() => process.exit(0));
  });
}
