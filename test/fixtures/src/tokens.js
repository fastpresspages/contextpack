// Sample tokens counter file for testing
export const tokenMultiplier = 4;
export function calculateTokens(str) {
  return Math.ceil(str.length / tokenMultiplier);
}
