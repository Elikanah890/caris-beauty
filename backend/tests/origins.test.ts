import { describe, expect, it } from 'vitest';
import { expandOrigins } from '../src/lib/origins';

describe('expandOrigins', () => {
  it('adds the www variant for an apex origin', () => {
    expect(expandOrigins('https://cariscosmetic.co.tz')).toEqual([
      'https://cariscosmetic.co.tz',
      'https://www.cariscosmetic.co.tz'
    ]);
  });

  it('adds the apex variant for a www origin', () => {
    expect(expandOrigins('https://www.example.com')).toEqual([
      'https://www.example.com',
      'https://example.com'
    ]);
  });

  it('keeps multiple origins and removes duplicates', () => {
    expect(
      expandOrigins('https://www.example.com,https://example.com,http://localhost:3000')
    ).toEqual(['https://www.example.com', 'https://example.com', 'http://localhost:3000']);
  });

  it('does not invent variants for localhost or IP addresses', () => {
    expect(expandOrigins('http://localhost:3000,http://127.0.0.1:4000')).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:4000'
    ]);
  });
});
