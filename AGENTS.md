# AGENTS.md — ContextPack Guidelines for Machine and Human Contributors

## What This Repo Is
ContextPack is a 100% free, zero-runtime-dependency CLI, Node.js library, and Model Context Protocol (MCP) server for packing codebases, directories, and Git diffs into token-budgeted, LLM-ready context.

## Hard Rules
1. **Zero Runtime Dependencies**: The package must not depend on any third-party npm packages. All functionality must use Node.js standard libraries (`node:fs`, `node:path`, `node:child_process`, `node:crypto`).
2. **Deterministic Output**: Formatted output (XML, Markdown, llms.txt) must be predictable and clean.
3. **No Telemetry**: ContextPack never sends code, diffs, tokens, or telemetry over any network connection.
4. **No Fake Metrics**: Never invent download numbers, stars, testimonials, or performance metrics.
5. **Node Support**: Must remain compatible with Node.js >= 18.17.
6. **Cross-Platform**: All path operations must handle Windows CRLF/backslashes and POSIX forward slashes seamlessly.

## Test Verification
Run the native test suite:
```bash
node --test test/*.test.js
```

## MCP Tools Contract
- `pack_codebase`: `{ path, format, max_tokens, include_tree, include_git_diff, line_numbers, include, exclude }`
- `get_tree`: `{ path, max_depth, show_sizes }`
- `pack_diff`: `{ path, staged, target, max_tokens }`
- `estimate_tokens`: `{ text, path }`
