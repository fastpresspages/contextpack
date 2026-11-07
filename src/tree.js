/**
 * contextpack - tree generator (zero dependencies)
 * Formats directory structures into clean ASCII/Unicode trees.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_IGNORE = new Set([
  '.git', 'node_modules', '.DS_Store', 'Thumbs.db', 'dist', 'build', 'out',
  '.next', '.nuxt', '.svelte-kit', 'coverage', '.cache', '.turbo',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'
]);

/**
 * Build a visual directory tree string
 * @param {string} rootDir
 * @param {object} options
 * @param {number} [options.maxDepth=5]
 * @param {Set<string>} [options.ignore]
 * @param {boolean} [options.showSize=false]
 * @returns {{ tree: string, fileCount: number, dirCount: number, totalBytes: number }}
 */
export function buildTree(rootDir, options = {}) {
  const maxDepth = options.maxDepth ?? 5;
  const ignoreSet = options.ignore ? new Set([...DEFAULT_IGNORE, ...options.ignore]) : DEFAULT_IGNORE;
  const showSize = Boolean(options.showSize);

  let fileCount = 0;
  let dirCount = 0;
  let totalBytes = 0;

  const lines = [path.basename(path.resolve(rootDir)) + '/'];

  function walk(currentDir, prefix, depth) {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Filter and sort entries: directories first, then alphabetical
    const filtered = entries.filter((e) => !ignoreSet.has(e.name));
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < filtered.length; i++) {
      const entry = filtered[i];
      const isLast = i === filtered.length - 1;
      const pointer = isLast ? '└── ' : '├── ';
      const subPrefix = isLast ? '    ' : '│   ';
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        dirCount++;
        lines.push(`${prefix}${pointer}${entry.name}/`);
        walk(fullPath, `${prefix}${subPrefix}`, depth + 1);
      } else if (entry.isFile()) {
        fileCount++;
        let sizeStr = '';
        try {
          const stat = fs.statSync(fullPath);
          totalBytes += stat.size;
          if (showSize) {
            sizeStr = ` (${formatBytes(stat.size)})`;
          }
        } catch {
          // ignore stat errors
        }
        lines.push(`${prefix}${pointer}${entry.name}${sizeStr}`);
      }
    }
  }

  walk(path.resolve(rootDir), '', 1);

  return {
    tree: lines.join('\n'),
    fileCount,
    dirCount,
    totalBytes
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function generateTree(rootDir, options = {}) {
  const res = buildTree(rootDir, options);
  return res.tree;
}
