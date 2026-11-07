// src/walker.js — Zero-dependency file tree walker with gitignore and binary filtering.
// Apache-2.0 · FastPress Labs
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  'target',
  '.output',
  'vendor',
  'out',
  '.gradle',
  '.bundle'
]);

export const DEFAULT_IGNORE_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'composer.lock',
  '.DS_Store',
  'Thumbs.db'
]);

export const BINARY_EXTENSIONS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff', '.svgz',
  // Audio & Video
  '.mp4', '.mov', '.avi', '.mkv', '.webm', '.mp3', '.wav', '.ogg', '.flac',
  // Archives
  '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar', '.bz2',
  // Documents / Binaries
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.class', '.pyc',
  // Source maps
  '.map'
]);

/**
 * Checks if a buffer contains null bytes (binary heuristic).
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isBinaryBuffer(buffer) {
  const checkLen = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Simple glob-to-regex converter for gitignore style rules.
 * Handles *, **, ?, and basic path anchors.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function patternToRegex(pattern) {
  let p = pattern.trim();
  if (p.startsWith('/')) p = p.slice(1);
  const trailingSlash = p.endsWith('/');
  if (trailingSlash) p = p.slice(0, -1);

  let regexStr = '';
  let i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          regexStr += '(?:.+/)?';
          i += 3;
          continue;
        } else {
          regexStr += '.*';
          i += 2;
          continue;
        }
      } else {
        regexStr += '[^/]*';
        i++;
        continue;
      }
    } else if (c === '?') {
      regexStr += '[^/]';
      i++;
      continue;
    } else if (['.', '+', '(', ')', '[', ']', '{', '}', '^', '$', '|', '\\'].includes(c)) {
      regexStr += '\\' + c;
      i++;
      continue;
    } else {
      regexStr += c;
      i++;
    }
  }

  // Anchor to path boundaries
  if (p.includes('/')) {
    return new RegExp(`^${regexStr}${trailingSlash ? '(/.*)?$' : '(/.*)?$'}`);
  } else {
    return new RegExp(`(^|/)${regexStr}${trailingSlash ? '(/.*)?$' : '(/.*)?$'}`);
  }
}

/**
 * Parses .gitignore file contents into an array of rule objects.
 * @param {string} content
 * @returns {Array<{ regex: RegExp, negate: boolean }>}
 */
export function parseGitignore(content) {
  const rules = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    let negate = false;
    let ruleText = trimmed;
    if (ruleText.startsWith('!')) {
      negate = true;
      ruleText = ruleText.slice(1).trim();
    }
    if (!ruleText) continue;
    rules.push({ regex: patternToRegex(ruleText), negate, pattern: trimmed });
  }
  return rules;
}

/**
 * Walk directory and collect readable text files.
 * @param {string} dir Root directory
 * @param {object} [options]
 * @param {number} [options.maxFileSize=262144] 256KB default
 * @param {boolean} [options.includeHidden=false]
 * @param {boolean} [options.respectGitignore=true]
 * @param {string[]} [options.ignorePatterns=[]]
 * @param {string[]} [options.includePatterns=[]]
 * @returns {Array<{ relPath: string, absPath: string, size: number, mtime: Date }>}
 */
export function walkFiles(dir, options = {}) {
  const rootDir = path.resolve(dir);
  const maxFileSize = options.maxFileSize ?? 256 * 1024;
  const includeHidden = options.includeHidden ?? false;
  const respectGitignore = options.respectGitignore ?? true;
  const customIgnorePatterns = options.ignorePatterns || [];
  const customIncludePatterns = options.includePatterns || [];

  const customIgnoreRegexes = customIgnorePatterns.map(patternToRegex);
  const customIncludeRegexes = customIncludePatterns.map(patternToRegex);

  // Load root .gitignore if present
  let gitignoreRules = [];
  if (respectGitignore) {
    const rootGitignore = path.join(rootDir, '.gitignore');
    if (fs.existsSync(rootGitignore)) {
      try {
        gitignoreRules = parseGitignore(fs.readFileSync(rootGitignore, 'utf8'));
      } catch {
        // ignore read error
      }
    }
  }

  function isIgnored(relPath, isDirectory) {
    const normalized = relPath.replace(/\\/g, '/');
    const basename = path.basename(relPath);

    // Default directory ignore
    if (isDirectory && DEFAULT_IGNORE_DIRS.has(basename)) return true;
    if (!isDirectory && DEFAULT_IGNORE_FILES.has(basename)) return true;

    // Hidden check
    if (!includeHidden && basename.startsWith('.') && basename !== '.') {
      return true;
    }

    // Binary check by extension
    if (!isDirectory) {
      const ext = path.extname(basename).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) return true;
    }

    // Custom ignore rules
    for (const reg of customIgnoreRegexes) {
      if (reg.test(normalized)) return true;
    }

    // Gitignore rules
    if (respectGitignore && gitignoreRules.length > 0) {
      let ignoredByGitignore = false;
      for (const rule of gitignoreRules) {
        if (rule.regex.test(normalized)) {
          ignoredByGitignore = !rule.negate;
        }
      }
      if (ignoredByGitignore) return true;
    }

    return false;
  }

  const results = [];
  const skipped = [];

  function traverse(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        if (!isIgnored(relPath, true)) {
          traverse(fullPath);
        }
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (isIgnored(relPath, false)) continue;

        // Custom include check (if specified, only match files that fit)
        if (customIncludeRegexes.length > 0) {
          const normalized = relPath.replace(/\\/g, '/');
          const matched = customIncludeRegexes.some(r => r.test(normalized));
          if (!matched) continue;
        }

        try {
          const stat = fs.statSync(fullPath);
          const normalizedRel = relPath.replace(/\\/g, '/');

          if (stat.size > maxFileSize) {
            skipped.push({
              path: fullPath,
              relPath: normalizedRel,
              relativePath: normalizedRel,
              size: stat.size,
              bytes: stat.size,
              reason: 'size_exceeded'
            });
            continue;
          }

          // Check if binary via initial chunk
          const fd = fs.openSync(fullPath, 'r');
          const buf = Buffer.alloc(512);
          const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
          fs.closeSync(fd);

          if (isBinaryBuffer(buf.subarray(0, bytesRead))) {
            continue;
          }

          results.push({
            path: fullPath,
            absPath: fullPath,
            relPath: normalizedRel,
            relativePath: normalizedRel,
            size: stat.size,
            bytes: stat.size,
            mtime: stat.mtime
          });
        } catch {
          // Skip unreadable or broken symlink
        }
      }
    }
  }

  traverse(rootDir);
  results.sort((a, b) => a.relPath.localeCompare(b.relPath));
  results.files = results;
  results.skipped = skipped;
  return results;
}

export const walkDirectory = walkFiles;
