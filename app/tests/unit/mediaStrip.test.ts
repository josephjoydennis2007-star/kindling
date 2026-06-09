import { describe, it, expect } from 'vitest';
import { estimateMediaBytes, stripHeavyMedia } from '@/lib/mediaStrip';

const bigData = 'data:image/png;base64,' + 'A'.repeat(5000);

function sample() {
  return {
    screenplay: {
      title: 'T',
      assets: [
        { id: 'a1', name: 'frame', kind: 'image', data: bigData, size: 5000, addedAt: 1 },
        { id: 'a2', name: 'remote', kind: 'image', data: 'https://example.com/x.png', size: 0, addedAt: 2 },
      ],
    },
    shots: {
      s1: { id: 's1', storyboard: bigData, lastFrame: 'https://cdn/y.png', audioFile: bigData },
      s2: { id: 's2', storyboard: null, lastFrame: null },
    },
    characters: [
      { id: 'c1', name: 'Max', image: bigData },
      { id: 'c2', name: 'Jo', image: 'https://cdn/jo.png' },
    ],
    bRolls: {
      b1: { id: 'b1', shotId: 's1', description: 'cutaway', frame: bigData },
      b2: { id: 'b2', shotId: 's1', description: 'insert', frame: 'https://cdn/b.png' },
    },
  } as any;
}

describe('mediaStrip', () => {
  it('estimates only inline base64 bytes (ignores remote URLs)', () => {
    const bytes = estimateMediaBytes(sample());
    // a1 + s1.storyboard + s1.audioFile + c1.image + b1.frame = 5 inline blobs.
    expect(bytes).toBe(bigData.length * 5);
  });

  it('strips inline base64 but KEEPS remote URLs and text/structure', () => {
    const { slim, removedCount, bytesFreed } = stripHeavyMedia(sample());
    expect(removedCount).toBe(5);
    expect(bytesFreed).toBe(bigData.length * 5);

    // Inline removed:
    expect(slim.screenplay!.assets[0].data).toBe('');
    expect(slim.shots!.s1.storyboard).toBeNull();
    expect(slim.shots!.s1.audioFile).toBeNull();
    expect(slim.characters![0].image).toBeNull();
    expect((slim as any).bRolls.b1.frame).toBeNull();

    // Remote URLs untouched:
    expect(slim.screenplay!.assets[1].data).toBe('https://example.com/x.png');
    expect(slim.shots!.s1.lastFrame).toBe('https://cdn/y.png');
    expect(slim.characters![1].image).toBe('https://cdn/jo.png');
    expect((slim as any).bRolls.b2.frame).toBe('https://cdn/b.png');

    // Text/structure intact:
    expect(slim.screenplay!.title).toBe('T');
    expect(slim.shots!.s2.id).toBe('s2');
    expect((slim as any).bRolls.b1.description).toBe('cutaway');
  });

  it('handles empty / partial snapshots without throwing', () => {
    expect(estimateMediaBytes(null)).toBe(0);
    expect(estimateMediaBytes({})).toBe(0);
    const r = stripHeavyMedia({});
    expect(r.removedCount).toBe(0);
  });
});
