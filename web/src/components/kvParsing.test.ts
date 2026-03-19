import { describe, it, expect } from 'vitest';
import { isKeyValueContent, parseKeyValueContent } from './kvParsing';

// ---------------------------------------------------------------------------
// isKeyValueContent
// ---------------------------------------------------------------------------

describe('isKeyValueContent', () => {
  describe('true positives — should detect as KV', () => {
    it('recognises classic logfmt', () => {
      expect(isKeyValueContent('time="2026-03-19T17:36:23Z" level=error msg="failed to connect"')).toBe(true);
    });

    it('recognises bare-value pairs', () => {
      expect(isKeyValueContent('level=info component=api latency=120ms status=200')).toBe(true);
    });

    it('ignores leading/trailing whitespace', () => {
      expect(isKeyValueContent('  level=info msg="ok"  ')).toBe(true);
    });

    it('handles numeric and boolean values', () => {
      expect(isKeyValueContent('retries=3 success=true')).toBe(true);
    });
  });

  describe('true negatives — should NOT detect as KV', () => {
    it('rejects empty string', () => {
      expect(isKeyValueContent('')).toBe(false);
    });

    it('rejects plain sentence that happens to contain two assignments', () => {
      // Long free-form sentence with incidental key=value tokens
      expect(
        isKeyValueContent('Connection to db01 failed: timeout=30s retries=3 (error connecting to backend service)')
      ).toBe(false);
    });

    it('rejects single key=value pair', () => {
      expect(isKeyValueContent('level=info')).toBe(false);
    });

    it('rejects message where KV coverage is too low', () => {
      // Only 2 short KV pairs buried in a long sentence
      expect(
        isKeyValueContent(
          'The quick brown fox jumped over the lazy dog and the cat sat on the mat level=info status=ok'
        )
      ).toBe(false);
    });

    it('rejects plain text with no KV pairs', () => {
      expect(isKeyValueContent('Server started successfully on port 8080')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// parseKeyValueContent
// ---------------------------------------------------------------------------

describe('parseKeyValueContent', () => {
  it('parses bare values', () => {
    const pairs = parseKeyValueContent('level=info status=200');
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ key: 'level', value: 'info', rawValue: 'info' });
    expect(pairs[1]).toMatchObject({ key: 'status', value: '200', rawValue: '200' });
  });

  it('parses quoted values and strips surrounding quotes', () => {
    const pairs = parseKeyValueContent('msg="hello world" level=error');
    expect(pairs[0]).toMatchObject({ key: 'msg', value: 'hello world', rawValue: '"hello world"' });
  });

  it('unescapes backslash sequences inside quoted values', () => {
    const pairs = parseKeyValueContent('msg="say \\"hi\\"" level=info');
    expect(pairs[0].value).toBe('say "hi"');
  });

  it('records correct start/end offsets', () => {
    const content = 'level=info status=200';
    const pairs = parseKeyValueContent(content);
    expect(content.slice(pairs[0].start, pairs[0].end)).toBe('level=info');
    expect(content.slice(pairs[1].start, pairs[1].end)).toBe('status=200');
  });

  it('records correct offsets for quoted pairs', () => {
    const content = 'msg="hello world" level=error';
    const pairs = parseKeyValueContent(content);
    expect(content.slice(pairs[0].start, pairs[0].end)).toBe('msg="hello world"');
    expect(content.slice(pairs[1].start, pairs[1].end)).toBe('level=error');
  });

  it('handles mixed quoted and bare values', () => {
    const content = 'time="2026-03-19T17:36:23Z" level=error msg="failed to connect" retries=3';
    const pairs = parseKeyValueContent(content);
    expect(pairs).toHaveLength(4);
    expect(pairs.map((p) => p.key)).toEqual(['time', 'level', 'msg', 'retries']);
  });

  it('returns empty array for content with no KV pairs', () => {
    expect(parseKeyValueContent('plain log message')).toHaveLength(0);
  });

  it('preserves rawValue with quotes intact', () => {
    const pairs = parseKeyValueContent('msg="hello world"');
    expect(pairs[0].rawValue).toBe('"hello world"');
  });

  it('handles keys with hyphens and underscores', () => {
    const pairs = parseKeyValueContent('http-status=404 error_code=NOT_FOUND');
    expect(pairs[0].key).toBe('http-status');
    expect(pairs[1].key).toBe('error_code');
  });

  describe('free-text interleaving (start/end coverage)', () => {
    it('accounts for prefix free text', () => {
      const content = 'ERROR: level=error status=500';
      const pairs = parseKeyValueContent(content);
      // "ERROR: " is before first pair
      expect(content.slice(0, pairs[0].start)).toBe('ERROR: ');
    });

    it('accounts for suffix free text', () => {
      const content = 'level=error status=500 (see logs)';
      const pairs = parseKeyValueContent(content);
      const last = pairs[pairs.length - 1];
      expect(content.slice(last.end)).toBe(' (see logs)');
    });

    it('accounts for interstitial free text', () => {
      const content = 'level=error [context] status=500';
      const pairs = parseKeyValueContent(content);
      expect(content.slice(pairs[0].end, pairs[1].start)).toBe(' [context] ');
    });
  });
});
