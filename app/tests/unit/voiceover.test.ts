import { describe, it, expect } from 'vitest';
import { pcm16ToWav, stripCues } from '@/lib/voiceover';

describe('voiceover', () => {
  it('stripCues removes [VISUAL:]/[TEXT:] cues and markdown noise', () => {
    const s = stripCues('# Hook\nYou wake up. [VISUAL: alarm clock] **No sound.** [TEXT: DAY 1]');
    expect(s).not.toContain('[');
    expect(s).not.toContain('VISUAL');
    expect(s).not.toContain('#');
    expect(s).not.toContain('**');
    expect(s).toContain('You wake up.');
    expect(s).toContain('No sound.');
  });

  it('pcm16ToWav produces a valid 44-byte-header mono WAV', async () => {
    const pcm = new Uint8Array(48000); // 1s of silence @24kHz 16-bit
    const wav = pcm16ToWav(pcm, 24000);
    expect(wav.type).toBe('audio/wav');
    expect(wav.size).toBe(44 + pcm.length);
    const buf = new Uint8Array(await wav.arrayBuffer());
    const ascii = (off: number, len: number) => String.fromCharCode(...buf.slice(off, off + len));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    const dv = new DataView(buf.buffer);
    expect(dv.getUint32(24, true)).toBe(24000); // sample rate
    expect(dv.getUint16(22, true)).toBe(1);     // mono
    expect(dv.getUint16(34, true)).toBe(16);    // bits/sample
    expect(dv.getUint32(40, true)).toBe(pcm.length);
  });
});
