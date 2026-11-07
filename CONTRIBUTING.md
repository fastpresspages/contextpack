# Contributing to ContextPack

Thank you for contributing to ContextPack! We welcome pull requests, bug fixes, and ideas.

## Principles

1. **Zero Runtime Dependencies**: The core library, CLI, and MCP server must rely only on standard Node.js APIs (`node:fs`, `node:path`, `node:child_process`, `node:crypto`). Do not add external npm dependencies.
2. **Deterministic & Fast**: Codebase traversal, token counting, and formatting must be fast and predictable across Windows, macOS, and Linux.
3. **No Telemetry**: ContextPack never sends code, diffs, tokens, or telemetry over the network.
4. **Tested**: All new features or fixes must include tests in `test/` running on `node:test`.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/fastpresspages/contextpack.git
cd contextpack

# Run tests (no install needed)
node --test test/*.test.js

# Test CLI
node bin/contextpack.js . --tokens-only
```

## Pull Request Checklist

- [ ] Tests pass cleanly with `node --test test/*.test.js`
- [ ] No npm runtime dependencies added
- [ ] Cross-platform path handling (`path.normalize`, `replace(/\\/g, '/')`)
- [ ] Documentation updated if CLI flags or MCP methods changed
