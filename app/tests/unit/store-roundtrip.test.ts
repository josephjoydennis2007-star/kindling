import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/store/useAppStore';

/**
 * Round-trip guard: a story imported via importStory() must come back out of
 * exportStory() with its content intact. This is the exact invariant that
 * broke during the cloud-sync bugs — losing it = losing the user's work.
 */
const sampleStory = {
  screenplay: {
    title: 'Test Film',
    author: '', contact: '', logline: 'A logline', synopsis: '',
    instructions: '', started: true,
    elements: [
      { id: 'e1', type: 'scene-heading', content: 'INT. ROOM - DAY', sceneId: null },
      { id: 'e2', type: 'action', content: 'She enters.', sceneId: null },
      { id: 'e3', type: 'dialogue', content: 'Hello.', sceneId: null },
    ],
    sections: [], assets: [], world: [], locations: [], outlinePoints: [],
  },
  scenes: [
    { id: 'sc1', name: 'Opening', heading: 'Opening', content: '', description: '', color: '#3b82f6', status: 'todo', shotIds: ['sh1'], order: 0 },
  ],
  shots: {
    sh1: {
      id: 'sh1', sceneId: 'sc1', description: 'Wide on the room', shotType: 'WIDE',
      camera: 'static', bRollIds: [], order: 0, lens: '35mm', durationSec: 4,
      storyboard: 'https://ex.com/first.png', lastFrame: 'https://ex.com/last.png', needsLastFrame: true,
    },
  },
  bRolls: {},
  characters: [
    { id: 'c1', name: 'ANA', displayName: 'Ana', description: '', color: '#6366f1', image: null,
      backstory: '', goals: '', personality: '', age: '', occupation: '', motivation: '',
      conflict: '', relationships: '', notes: '', voiceAudio: null, tags: [], createdAt: 1 },
  ],
  plotBoard: { acts: [] },
  beats: {},
  notes: [],
  version: '2.0',
  exportedAt: 123,
};

describe('story import/export round-trip', () => {
  beforeEach(() => {
    useAppStore.getState().importStory(JSON.stringify(sampleStory));
  });

  it('imports a valid story', () => {
    const ok = useAppStore.getState().importStory(JSON.stringify(sampleStory));
    expect(ok).toBe(true);
  });

  it('rejects malformed payloads instead of corrupting state', () => {
    expect(useAppStore.getState().importStory('{"nope":1}')).toBe(false);
    expect(useAppStore.getState().importStory('not json')).toBe(false);
  });

  it('preserves screenplay, scenes, shots and characters through a round-trip', () => {
    const out = JSON.parse(useAppStore.getState().exportStory());
    expect(out.screenplay.elements.length).toBe(3);
    expect(out.scenes.length).toBe(1);
    expect(out.characters.length).toBe(1);
    expect(out.characters[0].name).toBe('ANA');
    expect(Object.keys(out.shots).length).toBe(1);
  });

  it('keeps shot frame fields (shotType, first + last frame)', () => {
    const out = JSON.parse(useAppStore.getState().exportStory());
    const shot = Object.values(out.shots)[0] as any;
    expect(shot.shotType).toBe('WIDE');
    expect(shot.storyboard).toBe('https://ex.com/first.png');
    expect(shot.lastFrame).toBe('https://ex.com/last.png');
    expect(shot.needsLastFrame).toBe(true);
  });
});
