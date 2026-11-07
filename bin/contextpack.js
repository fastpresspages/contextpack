#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pack, buildTree, countTokens, formatTokens } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json version
let version = '0.1.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  if (pkg.version) version = pkg.version;
} catch {
  // fallback
}

function parseTokensArg(val) {
  if (!val) return null;
  val = String(val).trim().toLowerCase();
  if (val.endsWith('k')) {
    return Math.floor(parseFloat(val.slice(0, -1)) * 1000);
  }
  if (val.endsWith('m')) {
    return Math.floor(parseFloat(val.slice(0, -1)) * 1000000);
  }
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function printHelp() {
  console.log(`
contextpack v${version}
Pack codebases, files, and git diffs into token-budgeted, LLM-ready context.

Usage: contextpack [target_dir_or_file] [options]
  npx contextpack . -o context.xml -t 64k
  npx contextpack --git-diff --format markdown

Options:
  -o, --out <path>         Output file path (default: stdout)
  -f, --format <format>    Output format: xml (default), markdown, llms, json
  -t, --max-tokens <n>     Max token budget (e.g. 8000, 32k, 128k)
  -g, --git-diff           Include git diff and status in the pack
  --staged                 Include only staged git diff
  --diff-target <ref>      Git diff target ref (e.g. HEAD~1, main)
  --tree-only              Only print the directory structure tree
  --tokens-only            Only count and print token count for the target
  --llms-txt               Format as llms.txt / llms-full.txt layout
  --include <patterns>     Comma-separated patterns to include (e.g. "*.js,src/**")
  --exclude <patterns>     Comma-separated patterns to exclude
  --max-depth <n>          Max directory depth for tree and search (default: 8)
  --max-file-size <bytes>  Skip files larger than N bytes (default: 250KB)
  --no-tree                Omit directory tree from output context
  --no-line-numbers        Omit line numbers from file contents
  --no-git                 Do not inspect git status or diffs
  --summary                Print summary of packed files and tokens to stderr
  -v, --version            Display contextpack version
  -h, --help               Display this help text

EXAMPLES:
  # Pack current directory as XML
  contextpack . -o prompt.xml

  # Pack with a 32k token limit in Markdown format
  contextpack . -f markdown -t 32k -o prompt.md

  # Pack working tree changes + diff for code review
  contextpack . --git-diff -o review-context.xml

  # Generate llms.txt layout for AI agents
  contextpack . --llms-txt -o llms-full.txt

  # Just inspect tree and token size
  contextpack . --tokens-only
  contextpack . --tree-only
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    console.log(`contextpack v${version}`);
    process.exit(0);
  }

  let targetPath = '.';
  let outPath = null;
  let format = 'xml';
  let maxTokens = null;
  let gitDiff = false;
  let gitStaged = false;
  let diffTarget = null;
  let treeOnly = false;
  let tokensOnly = false;
  let includePatterns = [];
  let excludePatterns = [];
  let maxDepth = 8;
  let maxFileSize = 250 * 1024;
  let includeTree = true;
  let lineNumbers = true;
  let includeGit = true;
  let showSummary = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-o' || arg === '--out') {
      outPath = args[++i];
    } else if (arg === '-f' || arg === '--format') {
      const f = (args[++i] || '').toLowerCase();
      if (['xml', 'markdown', 'md', 'llms', 'json'].includes(f)) {
        format = f === 'md' ? 'markdown' : f;
      } else {
        console.error(`Error: Unknown format "${f}". Valid formats: xml, markdown, llms, json.`);
        process.exit(1);
      }
    } else if (arg === '-t' || arg === '--max-tokens') {
      maxTokens = parseTokensArg(args[++i]);
      if (maxTokens === null) {
        console.error(`Error: Invalid max-tokens value.`);
        process.exit(1);
      }
    } else if (arg === '-g' || arg === '--git-diff') {
      gitDiff = true;
    } else if (arg === '--staged') {
      gitDiff = true;
      gitStaged = true;
    } else if (arg === '--diff-target') {
      gitDiff = true;
      diffTarget = args[++i];
    } else if (arg === '--tree-only') {
      treeOnly = true;
    } else if (arg === '--tokens-only') {
      tokensOnly = true;
    } else if (arg === '--llms-txt') {
      format = 'llms';
    } else if (arg === '--include') {
      includePatterns = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--exclude') {
      excludePatterns = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--max-depth') {
      maxDepth = parseInt(args[++i], 10) || 8;
    } else if (arg === '--max-file-size') {
      maxFileSize = parseInt(args[++i], 10) || 250 * 1024;
    } else if (arg === '--no-tree') {
      includeTree = false;
    } else if (arg === '--no-line-numbers') {
      lineNumbers = false;
    } else if (arg === '--no-git') {
      includeGit = false;
    } else if (arg === '--summary') {
      showSummary = true;
    } else if (!arg.startsWith('-')) {
      targetPath = arg;
    } else {
      console.error(`Warning: Unrecognized argument "${arg}". Run contextpack --help for options.`);
    }
  }

  const resolvedTarget = path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(resolvedTarget)) {
    console.error(`Error: Target path does not exist: "${targetPath}"`);
    process.exit(1);
  }

  if (treeOnly) {
    const tree = buildTree(resolvedTarget, {
      maxDepth,
      showSize: true
    });
    console.log(tree.tree || tree);
    process.exit(0);
  }

  const result = await pack({
    dir: resolvedTarget,
    path: resolvedTarget,
    format,
    maxTokens,
    includeGitDiff: gitDiff,
    gitDiffStaged: gitStaged,
    gitDiffTarget: diffTarget,
    includeGit,
    includeTree,
    includePatterns,
    excludePatterns,
    maxDepth,
    maxFileSize,
    lineNumbers,
  });

  const outputContent = result.output || result.content || result.text;

  if (tokensOnly) {
    const totalEst = countTokens(outputContent);
    console.log(`Estimated tokens: ${formatTokens(totalEst)} (${totalEst} tokens)`);
    console.log(`Files packed: ${result.files.length}`);
    if (result.omittedFiles && result.omittedFiles.length > 0) {
      console.log(`Files omitted (budget exceeded): ${result.omittedFiles.length}`);
    }
    process.exit(0);
  }

  if (showSummary || outPath) {
    const statLines = [
      `📦 contextpack: packed ${result.files.length} file${result.files.length === 1 ? '' : 's'}`,
      `📊 estimated tokens: ${formatTokens(result.totalTokens || result.tokens)} (${result.totalTokens || result.tokens})`,
      `📄 format: ${format}`,
    ];
    if (result.omittedFiles && result.omittedFiles.length > 0) {
      statLines.push(`⚠️  omitted: ${result.omittedFiles.length} files over token budget`);
    }
    if (result.git && result.git.diff) {
      statLines.push(`🌿 git diff: ${result.git.diff.changedFiles.length} file${result.git.diff.changedFiles.length === 1 ? '' : 's'} modified`);
    }
    if (outPath) {
      statLines.push(`💾 written to: ${outPath}`);
    }
    process.stderr.write(statLines.join('\n') + '\n\n');
  }

  if (outPath) {
    const resolvedOut = path.resolve(process.cwd(), outPath);
    const parentDir = path.dirname(resolvedOut);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(resolvedOut, outputContent, 'utf8');
  } else {
    process.stdout.write(outputContent + '\n');
  }
}

main().catch((err) => {
  console.error(`contextpack error: ${err.message || err}`);
  process.exit(1);
});
