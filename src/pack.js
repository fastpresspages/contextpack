// src/pack.js — Core packaging engine for ContextPack.
// Assembles codebase files, directory tree, git changes, and token counts
// into LLM-optimized formats (XML, Markdown, llms.txt, JSON).
// Zero runtime dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { walkDirectory } from './walker.js';
import { buildTree } from './tree.js';
import { countTokens, getContentStats } from './tokenizer.js';
import { isGitRepo, getGitInfo, getGitDiff, getRecentCommits } from './git.js';

/**
 * Format files and context as structured XML (<documents><document>).
 * Standard XML format for Claude, GPT, and Anthropic prompt caching.
 */
export function formatXml(data) {
  const parts = [];
  parts.push('<documents>');

  if (data.tree) {
    parts.push('  <directory_structure>');
    parts.push('<![CDATA[');
    parts.push(data.tree);
    parts.push(']]>');
    parts.push('  </directory_structure>');
  }

  for (let i = 0; i < data.files.length; i++) {
    const file = data.files[i];
    parts.push(`  <document index="${i + 1}">`);
    parts.push(`    <source>${escapeXml(file.path)}</source>`);
    parts.push(`    <tokens>${file.tokens}</tokens>`);
    parts.push(`    <lines>${file.lines}</lines>`);
    parts.push(`    <bytes>${file.bytes}</bytes>`);
    parts.push('    <document_content><![CDATA[');
    parts.push(file.content);
    parts.push('    ]]></document_content>');
    parts.push('  </document>');
  }

  if (data.omitted && data.omitted.length > 0) {
    parts.push('  <omitted_files reason="token_budget_exceeded">');
    for (const o of data.omitted) {
      parts.push(`    <file path="${escapeXml(o.path)}" estimated_tokens="${o.tokens}" bytes="${o.bytes}" />`);
    }
    parts.push('  </omitted_files>');
  }

  parts.push('</documents>');
  return parts.join('\n');
}

/**
 * Format files and context as standard Markdown.
 * Great for human reading, paste-into-chat UI, and models with markdown preference.
 */
export function formatMarkdown(data) {
  const parts = [];
  parts.push(`# Codebase Context: ${data.rootName || path.basename(data.root)}`);
  parts.push('');
  parts.push(`- **Root:** \`${data.root}\``);
  parts.push(`- **Generated:** ${data.generatedAt}`);
  parts.push(`- **Packed Files:** ${data.files.length}`);
  parts.push(`- **Estimated Tokens:** ~${data.totalTokens?.toLocaleString() || 0}`);

  if (data.git) {
    parts.push(`- **Git Branch:** \`${data.git.branch || 'unknown'}\` (${data.git.commit ? data.git.commit.slice(0, 7) : ''})`);
  }
  parts.push('');

  if (data.tree) {
    parts.push('## Directory Structure');
    parts.push('');
    parts.push('```');
    parts.push(data.tree);
    parts.push('```');
    parts.push('');
  }

  parts.push('## Codebase Contents');
  parts.push('');

  for (const file of data.files) {
    const lang = getMarkdownLanguage(file.path);
    parts.push(`### \`${file.path}\``);
    parts.push(`*Tokens: ~${file.tokens} | Lines: ${file.lines} | Bytes: ${file.bytes}*`);
    parts.push('');
    parts.push('````' + lang);
    parts.push(file.content);
    parts.push('````');
    parts.push('');
  }

  if (data.omitted && data.omitted.length > 0) {
    parts.push('## Omitted Files (Token Budget Limit)');
    parts.push('');
    parts.push('| Path | Est. Tokens | Bytes |');
    parts.push('| --- | --- | --- |');
    for (const o of data.omitted) {
      parts.push(`| \`${o.path}\` | ~${o.tokens} | ${o.bytes} |`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Format context as llms.txt / llms-full.txt structure.
 * Complies with the llms.txt specification for AI models and search engines.
 */
export function formatLlmsTxt(data) {
  const parts = [];
  parts.push('# Codebase Context');
  parts.push('');

  if (data.tree) {
    parts.push('## Directory Structure');
    parts.push('```');
    parts.push(data.tree);
    parts.push('```');
    parts.push('');
  }

  for (const file of data.files) {
    parts.push(`## File: \`${file.path}\``);
    parts.push('');
    parts.push(file.content);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Main pack function.
 */
export async function pack(options = {}) {
  const root = path.resolve(options.dir || options.cwd || options.path || process.cwd());
  const maxTokens = Number(options.maxTokens) > 0 ? Number(options.maxTokens) : Infinity;
  const format = (options.format || 'xml').toLowerCase();
  const withTree = options.includeTree !== undefined ? Boolean(options.includeTree) : (options.withTree !== false);
  const withGit = Boolean(options.withGit);
  const withDiff = Boolean(options.withDiff);

  // 1. Walk files
  const discoveredFiles = walkDirectory(root, {
    include: options.include,
    exclude: options.exclude,
    maxFileSize: options.maxFileSize,
    ignoreGitignore: options.ignoreGitignore
  });

  const filesArray = Array.isArray(discoveredFiles) ? discoveredFiles : (discoveredFiles.files || []);

  // 2. Read contents and calculate tokens
  let fileList = [];
  for (const f of filesArray) {
    try {
      const relPath = f.relativePath || f.relPath || f.path;
      const fullPath = f.fullPath || path.resolve(root, relPath);
      const content = f.content !== undefined ? f.content : fs.readFileSync(fullPath, 'utf8');
      const stats = getContentStats(content);
      fileList.push({
        path: relPath,
        fullPath,
        bytes: f.size || f.bytes || Buffer.byteLength(content),
        content,
        lines: stats.lines,
        tokens: stats.tokens
      });
    } catch {
      // Skip unreadable files
    }
  }

  // 3. Optional priority sorting (e.g. README.md, package.json, architecture docs first)
  if (Array.isArray(options.priority) && options.priority.length > 0) {
    const priorities = options.priority;
    fileList.sort((a, b) => {
      const pA = getPriorityIndex(a.path, priorities);
      const pB = getPriorityIndex(b.path, priorities);
      if (pA !== pB) return pA - pB;
      return a.path.localeCompare(b.path);
    });
  }

  // 4. Token budgeting
  const packedFiles = [];
  const omittedFiles = [];
  let currentTokens = 0;

  // Reserve a small buffer for metadata/tree/diff
  let metadataTokens = 200; // base XML/MD wrappers
  let treeOutput = null;
  if (withTree) {
    const t = buildTree(root, {
      maxDepth: options.treeMaxDepth || options.maxDepth || 6,
      ignoreGitignore: options.ignoreGitignore,
      customIgnores: options.exclude
    });
    treeOutput = t.tree || t;
    metadataTokens += countTokens(treeOutput);
  }

  let gitData = null;
  let gitDiffData = null;

  if ((withGit || withDiff) && isGitRepo(root)) {
    if (withGit) {
      gitData = getGitInfo(root);
      gitData.recentCommits = getRecentCommits(root, 5);
      metadataTokens += 250;
    }
    if (withDiff) {
      gitDiffData = getGitDiff(root, {
        staged: options.stagedOnly,
        commit: options.diffTarget
      });
      if (gitDiffData && gitDiffData.diff) {
        metadataTokens += countTokens(gitDiffData.diff);
      }
    }
  }

  const tokenAllowance = maxTokens - metadataTokens;

  for (const file of fileList) {
    if (currentTokens + file.tokens <= tokenAllowance) {
      packedFiles.push(file);
      currentTokens += file.tokens;
    } else {
      omittedFiles.push({
        path: file.path,
        tokens: file.tokens,
        bytes: file.bytes
      });
    }
  }

  const totalTokens = currentTokens + metadataTokens;

  const resultData = {
    root,
    rootName: path.basename(root),
    generatedAt: new Date().toISOString(),
    files: packedFiles,
    omitted: omittedFiles,
    omittedFiles,
    totalFiles: fileList.length,
    totalTokens,
    fileTokens: currentTokens,
    metadataTokens,
    tree: treeOutput,
    git: gitData,
    gitDiff: gitDiffData,
    metadata: {
      root,
      generatedAt: new Date().toISOString(),
      totalFiles: fileList.length,
      totalTokens
    }
  };

  let outputText = '';
  switch (format) {
    case 'json':
      outputText = JSON.stringify(resultData, null, 2);
      break;
    case 'markdown':
    case 'md':
      outputText = formatMarkdown(resultData);
      break;
    case 'llms':
    case 'llms-txt':
      outputText = formatLlmsTxt(resultData);
      break;
    case 'xml':
    default:
      outputText = formatXml(resultData);
      break;
  }

  return {
    ...resultData,
    output: outputText,
    content: outputText,
    text: outputText
  };
}

function getPriorityIndex(filePath, priorities) {
  const norm = filePath.replace(/\\/g, '/');
  for (let i = 0; i < priorities.length; i++) {
    const p = priorities[i];
    if (norm === p || norm.startsWith(p.replace(/\*.*$/, '')) || norm.endsWith(p)) {
      return i;
    }
  }
  return 9999;
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getMarkdownLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.jsx': 'jsx',
    '.json': 'json',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.cs': 'csharp',
    '.sh': 'bash',
    '.bash': 'bash',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.xml': 'xml',
    '.svg': 'xml'
  };
  return map[ext] || '';
}
