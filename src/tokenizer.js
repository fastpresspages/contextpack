// Fast, zero-dependency token estimation heuristic for LLMs (Claude, GPT-4o, etc.).
// In code and natural language, tokens average ~3.7 to 4.0 characters, but whitespace,
// punctuation, and indentation create token boundaries.

/**
 * Estimates the number of tokens in a string.
 * @param {string} text
 * @returns {number}
 */
export function countTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  if (text.length === 0) return 0;

  // Code-aware token count heuristic:
  // 1. Matches words/identifiers, numbers, punctuation sequences, and whitespace chunks.
  // 2. Average ratio for UTF-8 code is ~3.7 chars per token.
  const len = text.length;
  if (len < 50) {
    // For very short strings, words + punctuation count is more accurate
    const tokens = text.match(/\w+|[^\w\s]|\s+/g);
    return tokens ? tokens.length : 1;
  }

  // Fast regex-free token estimation for large files:
  // Combines word boundaries, punctuation clusters, and character length.
  let spaces = 0;
  let newlines = 0;
  let punctuation = 0;

  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code === 32 || code === 9) spaces++;
    else if (code === 10) newlines++;
    else if (
      (code >= 33 && code <= 47) ||
      (code >= 58 && code <= 64) ||
      (code >= 91 && code <= 96) ||
      (code >= 123 && code <= 126)
    ) {
      punctuation++;
    }
  }

  // Empirically calibrated against cl100k_base & Claude tokenizer on codebases:
  // Raw chars / 3.8 + extra weight for dense punctuation and indentation
  const baseTokens = len / 3.85;
  const punctAdjustment = punctuation * 0.15;
  const newlineAdjustment = newlines * 0.1;

  const estimated = Math.round(baseTokens + punctAdjustment + newlineAdjustment);
  return Math.max(1, estimated);
}

/**
 * Returns formatted token count with k/M suffix.
 * @param {number} tokens
 * @returns {string}
 */
export function formatTokens(tokens) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}

/**
 * Returns file stats: characters, lines, estimated tokens, and bytes.
 * @param {string} content
 * @returns {{ characters: number, lines: number, tokens: number, bytes: number }}
 */
export function getContentStats(content) {
  const characters = content.length;
  const lines = content.length === 0 ? 0 : (content.match(/\n/g) || []).length + 1;
  const tokens = countTokens(content);
  const bytes = Buffer.byteLength(content, 'utf8');
  return { characters, lines, tokens, bytes };
}
