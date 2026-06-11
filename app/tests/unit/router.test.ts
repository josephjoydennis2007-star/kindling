import { describe, it, expect } from 'vitest';
import { routeFor, parseRoute } from '@/lib/router';

describe('router (URL ↔ state mapping)', () => {
  it('builds story routes', () => {
    expect(routeFor('abc123', 'storyboard')).toBe('/s/abc123/storyboard');
    expect(routeFor('abc123', 'writer')).toBe('/s/abc123/writer');
  });

  it('builds storyless routes', () => {
    expect(routeFor(null, 'youtube')).toBe('/youtube');
    expect(routeFor(null, 'dashboard')).toBe('/');
  });

  it('home is global — dashboard maps to / even with a story open', () => {
    expect(routeFor('abc123', 'dashboard')).toBe('/');
  });

  it('parses story routes', () => {
    expect(parseRoute('/s/abc123/storyboard')).toEqual({ storyId: 'abc123', tab: 'storyboard' });
    expect(parseRoute('/s/abc123/director')).toEqual({ storyId: 'abc123', tab: 'director' });
  });

  it('defaults a story route with no/invalid tab to writer', () => {
    expect(parseRoute('/s/abc123')).toEqual({ storyId: 'abc123', tab: 'writer' });
    expect(parseRoute('/s/abc123/not-a-tab')).toEqual({ storyId: 'abc123', tab: 'writer' });
  });

  it('parses root and youtube', () => {
    expect(parseRoute('/')).toEqual({ storyId: null, tab: 'dashboard' });
    expect(parseRoute('/youtube')).toEqual({ storyId: null, tab: 'youtube' });
  });

  it('leaves unknown paths alone (no opinion)', () => {
    expect(parseRoute('/some/random/path')).toEqual({ storyId: null, tab: null });
  });

  it('round-trips ids that need encoding', () => {
    const id = 'story_mq72zqjt_1';
    expect(parseRoute(routeFor(id, 'plot'))).toEqual({ storyId: id, tab: 'plot' });
  });
});
