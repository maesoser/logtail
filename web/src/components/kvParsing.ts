// Key-value pair parsed from log content
export interface KeyValuePair {
  key: string;
  value: string;
  rawValue: string; // Original value including quotes if present
  start: number;   // Byte offset of match start in original string
  end: number;     // Byte offset of match end in original string
}

// Check if content looks like key=value format (logfmt style)
// Examples: time="2026-03-19T17:36:23Z" level=error msg="failed to connect"
export function isKeyValueContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  // Match pattern: key=value or key="value with spaces"
  const kvPattern = /\b[a-zA-Z_][a-zA-Z0-9_-]*=(?:"[^"]*"|[^\s"]+)/g;
  const matches = trimmed.match(kvPattern);

  // Require at least 2 key-value pairs
  if (!matches || matches.length < 2) return false;

  // Require that KV pairs cover a meaningful portion of the content.
  // Calculate total characters consumed by matched pairs and divide by
  // content length. A low ratio means the pairs are sparse within a
  // larger free-form sentence — not truly structured logfmt.
  const matchedChars = matches.reduce((sum, m) => sum + m.length, 0);
  const coverageRatio = matchedChars / trimmed.length;

  // Also check that no huge gap of free text exists between pairs by
  // measuring the longest unmatched segment relative to content length.
  // First, strip all matched pairs and see what remains.
  const remainder = trimmed.replace(kvPattern, '').trim();
  const longestGap = remainder
    .split(/\s+/)
    .reduce((max, word) => Math.max(max, word.length), 0);

  // Thresholds (tuned conservatively):
  //   - KV content must account for at least 50% of the string
  //   - No single non-KV word should exceed 30 chars (avoids sentences
  //     with long words that happen to contain a couple of key=value tokens)
  return coverageRatio >= 0.5 && longestGap <= 30;
}

// Parse key=value content into individual pairs, recording each match's
// position in the original string so callers can reconstruct free-form text.
export function parseKeyValueContent(content: string): KeyValuePair[] {
  const pairs: KeyValuePair[] = [];

  // Regex to match key=value pairs
  // Handles: key=value, key="quoted value", key="value with \"escaped\" quotes"
  const kvRegex = /\b([a-zA-Z_][a-zA-Z0-9_-]*)=((?:"(?:[^"\\]|\\.)*")|(?:[^\s"]+))/g;

  let match;
  while ((match = kvRegex.exec(content)) !== null) {
    const [full, key, rawValue] = match;
    let value = rawValue;
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
      // Unescape escaped characters
      value = value.replace(/\\(.)/g, '$1');
    }
    pairs.push({
      key,
      value,
      rawValue,
      start: match.index,
      end: match.index + full.length,
    });
  }

  return pairs;
}
