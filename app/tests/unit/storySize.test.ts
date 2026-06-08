import { describe, it, expect } from 'vitest';
import {
  byteSize, humanSize, assertWithinCloudLimit, isNearCloudLimit, StorySizeError,
  SAFE_DATA_LIMIT, WARN_THRESHOLD,
} from '@/lib/storySize';

describe('story size guard', () => {
  it('measures UTF-8 byte length', () => {
    expect(byteSize('abc')).toBe(3);
    expect(byteSize('é')).toBe(2);      // 2-byte char
    expect(byteSize('🎬')).toBe(4);     // 4-byte emoji
  });

  it('formats human sizes', () => {
    expect(humanSize(500)).toBe('500 B');
    expect(humanSize(2048)).toBe('2 KB');
    expect(humanSize(1_500_000)).toMatch(/MB$/);
  });

  it('accepts payloads under the safe limit', () => {
    expect(() => assertWithinCloudLimit('x'.repeat(1000))).not.toThrow();
    expect(assertWithinCloudLimit('hello')).toBe(5);
  });

  it('throws StorySizeError over the safe limit (no silent loss)', () => {
    const big = 'x'.repeat(SAFE_DATA_LIMIT + 1);
    expect(() => assertWithinCloudLimit(big)).toThrow(StorySizeError);
    try {
      assertWithinCloudLimit(big);
    } catch (e: any) {
      expect(e.name).toBe('StorySizeError');
      expect(e.bytes).toBeGreaterThan(SAFE_DATA_LIMIT);
    }
  });

  it('flags near-limit payloads for an early warning', () => {
    expect(isNearCloudLimit('x'.repeat(WARN_THRESHOLD + 100))).toBe(true);
    expect(isNearCloudLimit('x'.repeat(1000))).toBe(false);
    expect(isNearCloudLimit('x'.repeat(SAFE_DATA_LIMIT + 100))).toBe(false); // over = not "near", it's blocked
  });
});
