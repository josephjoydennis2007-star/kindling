import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeStorage } from '@/lib/safeStorage';

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

describe('safeStorage (freeze-proof persist storage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads and writes through to localStorage normally', () => {
    safeStorage.setItem('k', 'v');
    expect(safeStorage.getItem('k')).toBe('v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('NEVER throws on a quota error — this is what stops the app freezing', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw quotaError(); });
    // The whole point: this must not throw even though the disk is "full".
    expect(() => safeStorage.setItem('big', 'x'.repeat(1000))).not.toThrow();
    spy.mockRestore();
    // Value still readable from the in-memory mirror so the session stays correct.
    expect(safeStorage.getItem('big')).toBe('x'.repeat(1000));
  });

  it('reclaims legacy swp_state_/swp_history_ keys then retries the write', () => {
    // Seed poisoning legacy blobs that the old fallback used to dump in.
    localStorage.setItem('swp_state_abc', 'huge');
    localStorage.setItem('swp_history_abc', 'huge');
    let calls = 0;
    const real = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      calls += 1;
      // Fail the first write (the real target) to force a reclaim+retry.
      if (calls === 1) throw quotaError();
      return real(k, v);
    });
    safeStorage.setItem('kindling-storage', '{"ok":true}');
    spy.mockRestore();
    // Legacy keys were purged to make room.
    expect(localStorage.getItem('swp_state_abc')).toBeNull();
    expect(localStorage.getItem('swp_history_abc')).toBeNull();
    // And the retry persisted the real value.
    expect(localStorage.getItem('kindling-storage')).toBe('{"ok":true}');
  });

  it('removeItem clears both disk and memory mirror', () => {
    safeStorage.setItem('k', 'v');
    safeStorage.removeItem('k');
    expect(safeStorage.getItem('k')).toBeNull();
  });
});
