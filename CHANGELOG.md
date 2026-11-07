# Changelog

All notable changes to ContextPack will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-26

### Added
- Core token approximation heuristic calibrated for LLM code understanding.
- Directory walker with `.gitignore` compliance, binary detection, and default ignore lists.
- Visual ASCII/Unicode directory tree generator with byte formatting and depth control.
- Git integration for staged/unstaged diff extraction and commit metadata.
- Context pack engine with support for XML (`<documents><document>`), Markdown, and `llms.txt`.
- Token budgeting system with `maxTokens` enforcement and omitted file tracking.
- CLI executable `bin/contextpack.js` with comprehensive flags.
- Stdio MCP Server `bin/contextpack-mcp.js` exposing `pack_codebase`, `get_tree`, `pack_diff`, and `estimate_tokens`.
- Composite GitHub Action `action.yml` for CI/CD pipelines.
- Complete `node:test` suite with 23 passing unit and integration tests.
- Zero-build static landing page and interactive packer.
