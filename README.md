<div align="center">

# ContextPack 📦

**Pack codebases, directories, and Git diffs into token-budgeted, LLM-ready context.**

[![CI](https://github.com/fastpresspages/contextpack/actions/workflows/ci.yml/badge.svg)](https://github.com/fastpresspages/contextpack/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-3DDC84?labelColor=08080A)](https://github.com/fastpresspages/contextpack/blob/main/LICENSE)
[![Runtime Dependencies: 0](https://img.shields.io/badge/dependencies-0-A78BFA?labelColor=08080A)](https://github.com/fastpresspages/contextpack)
[![Node >= 18.17](https://img.shields.io/badge/node-%3E%3D%2018.17-C6FF4A?labelColor=08080A)](https://nodejs.org)
[![MCP Server](https://img.shields.io/badge/MCP-stdio%20ready-38BDF8?labelColor=08080A)](https://modelcontextprotocol.io)

[Website](https://fastpresspages.github.io/contextpack/) ·
[MCP Spec](https://modelcontextprotocol.io) ·
[GitHub Action](https://github.com/fastpresspages/contextpack/blob/main/action.yml) ·
[FastPress Labs](https://github.com/fastpresspages)

</div>

---

ContextPack is a **100% free, zero-runtime-dependency CLI, Node.js library, and Model Context Protocol (MCP) server** that turns any codebase, subdirectory, or Git diff into clean, token-budgeted context for Claude, GPT, DeepSeek, and coding agents.

It formats context in Anthropic-standard XML (`<documents><document>`), Markdown, or `llms-full.txt`, includes an ASCII/Unicode directory tree, integrates staged/unstaged Git diffs, and respects token budgets so your prompts never overflow.

## Why ContextPack?

- ⚡ **Zero runtime dependencies**: Pure Node.js standard library (`node:fs`, `node:path`, `node:child_process`, `node:crypto`). Fast startup, zero supply-chain risk.
- 🎯 **Token-Budget Aware**: Specify `--max-tokens 32k` (or `64k`, `128k`). ContextPack prioritizes key files and warns if files had to be omitted.
- 🤖 **First-Class MCP Server**: Native stdio MCP server (`contextpack-mcp`) ready for Claude Code, OpenCode, Cursor, and Zed with tools for `pack_codebase`, `get_tree`, `pack_diff`, and `estimate_tokens`.
- 📁 **Smart Filtering**: Automatically respects `.gitignore`, skips binary files, and ignores build artifacts (`node_modules`, `dist`, lockfiles).
- 🔄 **Git Diff Integration**: Pack only changed files, staged files, or append full git diffs with line-level context.
- 🛠️ **Composite GitHub Action**: Pack repos in CI/CD pipelines and export token counts and packed artifacts for LLM review steps.

---

## Quick Start

### 1. Run via npx (no install required)

```bash
# Pack current directory into Anthropic XML format
npx -p github:fastpresspages/contextpack contextpack .

# Pack into Markdown with a 32,000 token budget
npx -p github:fastpresspages/contextpack contextpack src/ -f markdown -t 32k -o context.md

# Pack only Git diff & modified files against main
npx -p github:fastpresspages/contextpack contextpack . --git-diff --diff-target main -o diff-context.xml

# Just generate an ASCII directory tree with file sizes
npx -p github:fastpresspages/contextpack contextpack . --tree-only

# Generate an llms-full.txt file for your documentation site
npx -p github:fastpresspages/contextpack contextpack . --llms-txt -o site/llms-full.txt
```

### 2. Connect to AI Agents via MCP

Add ContextPack to your Claude Desktop, OpenCode, or Cursor MCP configuration:

```json
{
  "mcpServers": {
    "contextpack": {
      "command": "npx",
      "args": ["-y", "-p", "github:fastpresspages/contextpack", "contextpack-mcp"]
    }
  }
}
```

Available MCP tools:
- `pack_codebase`: Pack directory or files into token-capped XML, Markdown, or llms.txt.
- `get_tree`: Return visual directory structure with token estimates and file counts.
- `pack_diff`: Pack staged or unstaged Git diffs with changed file contents.
- `estimate_tokens`: Fast token count approximation for any text or local file.

---

## Output Formats

### 1. XML (`--format xml` / default)
Strict prompt structure modeled on Anthropic best practices:
```xml
<documents>
<directory_tree>
├── src/
│   ├── index.js (1.2 KB)
│   └── pack.js (8.4 KB)
└── package.json (820 B)
</directory_tree>

<document index="1">
<source>src/index.js</source>
<document_content>
1: export * from './pack.js';
...
</document_content>
</document>
</documents>
```

### 2. Markdown (`--format markdown`)
Clean, human-readable markdown with language code blocks:
```markdown
# Codebase Context

## Directory Tree
\`\`\`
...
\`\`\`

## Codebase Contents

### `src/index.js`
\`\`\`javascript
1: export * from './pack.js';
...
\`\`\`
```

### 3. LLMS Full Text (`--format llms` / `--llms-txt`)
Structured context designed for `/llms-full.txt` endpoints following the llms.txt convention.

---

## CLI Options

```
Usage: contextpack [target_dir_or_file] [options]

Options:
  -o, --out <path>            Write output to file instead of stdout
  -f, --format <format>       Output format: xml, markdown, llms, json (default: xml)
  -t, --max-tokens <tokens>   Token budget ceiling (e.g. 16k, 32k, 128k, 200000)
  -g, --git-diff              Include Git diff in output
      --staged                Include only staged changes in Git diff
      --diff-target <ref>     Git ref to diff against (e.g. main, HEAD~1)
      --tree-only             Output only the visual directory tree
      --tokens-only           Calculate and print token estimation only
      --llms-txt              Shortcut for --format llms
      --include <pattern>     Comma-separated glob-style patterns to include
      --exclude <pattern>     Comma-separated glob-style patterns to exclude
      --max-depth <n>         Maximum directory traversal depth (default: 8)
      --max-file-size <kb>    Max file size in KB to include (default: 500)
      --no-tree               Omit the directory tree from context
      --no-line-numbers       Omit 1-based line numbers in file content
      --summary               Print packing summary to stderr
  -v, --version               Show ContextPack version
  -h, --help                  Show help information
```

---

## GitHub Action

Use `fastpresspages/contextpack` in your GitHub Workflows to prepare context for automated AI PR reviews, changelog generation, or docs updates:

```yaml
- name: Pack Repository Context
  uses: fastpresspages/contextpack@main
  id: pack
  with:
    path: '.'
    format: 'xml'
    max-tokens: '64k'
    with-tree: 'true'
    git-diff: 'true'
    out: 'context.xml'

- name: Inspect Packing Stats
  run: |
    echo "Packed ${{ steps.pack.outputs.files }} files"
    echo "Total tokens: ${{ steps.pack.outputs.tokens }}"
    echo "Omitted files: ${{ steps.pack.outputs.omitted }}"
```

---

## Node.js Programmatic API

ContextPack can be imported directly in ESM or Node 18+:

```javascript
import { pack, countTokens, buildTree } from 'contextpack';

const result = await pack({
  path: './src',
  format: 'xml',
  maxTokens: 32000,
  includeTree: true,
  includeGitDiff: false
});

console.log(`Packed ${result.totalFiles} files (${result.tokens} tokens)`);
console.log(result.output);
```

---

## Verification & Testing

ContextPack includes a comprehensive native test suite using `node:test`:

```bash
# Run unit & integration tests
node --test test/*.test.js

# Test CLI directly
node bin/contextpack.js . --tokens-only
```

---

## License

Apache-2.0. Maintained by [FastPress Labs](https://github.com/fastpresspages). Free forever, no telemetry, no paid APIs.
