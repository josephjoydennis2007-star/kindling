import { describe, it, expect } from 'vitest';
import { chunkScript, buildCues, scriptToSrt } from '@/lib/captions';

const SCRIPT = 'You wake up and the world is silent. [VISUAL: empty street] No cars. No birds. Nothing. ' +
  'For three days straight, every single sound on Earth has simply stopped existing, and nobody can explain why it happened.';

describe('captions', () => {
  it('chunks a script into caption-sized pieces (≤ 84 chars each)', () => {
    const chunks = chunkScript(SCRIPT);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(84);
    // Cues stripped
    expect(chunks.join(' ')).not.toContain('[VISUAL');
  });

  it('builds sequential, non-overlapping cues', () => {
    const cues = buildCues(SCRIPT);
    expect(cues[0].start).toBe(0);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 5);
      expect(cues[i].end).toBeGreaterThan(cues[i].start);
    }
  });

  it('scales the timeline to a known voiceover duration', () => {
    const cues = buildCues(SCRIPT, { totalSeconds: 30 });
    expect(cues[cues.length - 1].end).toBeCloseTo(30, 1);
  });

  it('renders valid SRT (numbering, arrow timestamps, blank-line separated)', () => {
    const srt = scriptToSrt(SCRIPT);
    expect(srt).toMatch(/^1\n00:00:00,000 --> 00:00:\d{2},\d{3}\n/);
    expect(srt).toContain(' --> ');
    const blocks = srt.trim().split('\n\n');
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks[1].startsWith('2\n')).toBe(true);
  });

  it('handles empty input gracefully', () => {
    expect(scriptToSrt('')).toBe('');
    expect(buildCues('   ')).toEqual([]);
  });
});
