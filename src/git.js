// git.js — zero-dependency git inspector for contextpack
import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Check if directory is inside a Git repository
 * @param {string} cwd
 * @returns {boolean}
 */
export function isGitRepo(cwd = process.cwd()) {
  try {
    const out = execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get current Git branch and repository info
 * @param {string} cwd
 * @returns {{ isRepo: boolean, branch?: string, commit?: string, root?: string }}
 */
export function getGitInfo(cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    return { isRepo: false };
  }

  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    const branch = execSync('git branch --show-current', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    }).trim() || 'HEAD (detached)';

    const commit = execSync('git rev-parse --short HEAD', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    return {
      isRepo: true,
      root: path.normalize(root),
      branch,
      commit,
    };
  } catch {
    return { isRepo: false };
  }
}

/**
 * Get Git diff output
 * @param {string} cwd
 * @param {object} [options]
 * @param {boolean} [options.staged=false] - Only staged diff
 * @param {string} [options.against] - Commit or branch to diff against (e.g. 'main', 'HEAD~1')
 * @param {number} [options.maxBytes=500000] - Cutoff for huge diffs
 * @returns {{ diff: string, truncated: boolean, filesChanged: string[] }}
 */
export function getGitDiff(cwd = process.cwd(), options = {}) {
  const { staged = false, against = '', maxBytes = 500000 } = options;

  if (!isGitRepo(cwd)) {
    return { diff: '', truncated: false, filesChanged: [] };
  }

  let args = 'diff --no-color';
  if (staged) {
    args += ' --cached';
  }
  if (against) {
    args += ` ${against}`;
  }

  try {
    const rawDiff = execSync(`git ${args}`, {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 15000,
    });

    // Also get list of changed files
    const fileListArgs = staged ? 'diff --name-only --cached' : (against ? `diff --name-only ${against}` : 'diff --name-only');
    const rawFiles = execSync(`git ${fileListArgs}`, {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 10000,
    });
    const filesChanged = rawFiles.split('\n').map(s => s.trim()).filter(Boolean);

    let diff = rawDiff;
    let truncated = false;
    if (Buffer.byteLength(diff, 'utf8') > maxBytes) {
      diff = diff.slice(0, maxBytes) + '\n\n... [diff truncated: exceeded max size limit] ...\n';
      truncated = true;
    }

    return {
      diff,
      truncated,
      filesChanged,
    };
  } catch {
    return { diff: '', truncated: false, filesChanged: [] };
  }
}

/**
 * Get recent Git commit log
 * @param {string} cwd
 * @param {number} [limit=5]
 * @returns {Array<{ hash: string, author: string, date: string, message: string }>}
 */
export function getRecentCommits(cwd = process.cwd(), limit = 5) {
  if (!isGitRepo(cwd)) {
    return [];
  }

  try {
    const format = '%h|%an|%ad|%s';
    const logOut = execSync(`git log -n ${limit} --date=short --pretty=format:"${format}"`, {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 10000,
    });

    return logOut
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [hash, author, date, ...rest] = line.split('|');
        return {
          hash: hash || '',
          author: author || '',
          date: date || '',
          message: rest.join('|') || '',
        };
      });
  } catch {
    return [];
  }
}
