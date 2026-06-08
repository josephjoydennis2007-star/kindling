import { describe, it, expect } from 'vitest';
import { looksLikeVideo } from '@/lib/mediaViewer';

describe('mediaViewer.looksLikeVideo', () => {
  it('detects common video extensions', () => {
    expect(looksLikeVideo('https://x.com/clip.mp4')).toBe(true);
    expect(looksLikeVideo('a.webm')).toBe(true);
    expect(looksLikeVideo('a.MOV')).toBe(true);
    expect(looksLikeVideo('https://x.com/clip.mp4?token=abc')).toBe(true);
  });
  it('rejects images / non-video', () => {
    expect(looksLikeVideo('a.png')).toBe(false);
    expect(looksLikeVideo('https://x.com/frame.jpg')).toBe(false);
    expect(looksLikeVideo('')).toBe(false);
  });
});
