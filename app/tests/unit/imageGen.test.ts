import { describe, it, expect } from 'vitest';
import { framePrompt, thumbnailPrompt } from '@/lib/imageGen';

describe('imageGen prompt builders', () => {
  it('framePrompt weaves shot facts into a cinematic prompt', () => {
    const p = framePrompt({ description: 'MAX leaps the fence', shotType: 'WIDE', scene: 'Backyard chase' });
    expect(p).toContain('wide shot');
    expect(p).toContain('MAX leaps the fence');
    expect(p).toContain('scene: Backyard chase');
    expect(p.toLowerCase()).toContain('cinematic');
  });

  it('framePrompt strips [TEXT: …] style cues from descriptions', () => {
    const p = framePrompt({ description: 'A lighthouse at dusk [TEXT: WAIT FOR IT]' });
    expect(p).not.toContain('WAIT FOR IT');
    expect(p).toContain('A lighthouse at dusk');
  });

  it('framePrompt works with minimal input', () => {
    const p = framePrompt({});
    expect(p.length).toBeGreaterThan(20); // still a usable style prompt
  });

  it('thumbnailPrompt includes the idea and overlay text space', () => {
    const p = thumbnailPrompt('what if you never slept', 'NO SLEEP');
    expect(p).toContain('what if you never slept');
    expect(p).toContain('"NO SLEEP"');
    expect(p.toLowerCase()).toContain('thumbnail');
  });

  it('thumbnailPrompt without overlay still reserves title space', () => {
    const p = thumbnailPrompt('moon disappears');
    expect(p).toContain('for title text');
  });
});
