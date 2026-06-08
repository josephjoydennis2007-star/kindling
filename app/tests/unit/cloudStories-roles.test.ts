import { describe, it, expect, vi } from 'vitest';

// cloudStories imports '@/firebase' at module load (which would init Firebase).
// Stub it so we can unit-test the pure permission helpers in isolation.
vi.mock('@/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import {
  resolveStoryRole,
  canEditWriter,
  canEditDirector,
  canComment,
  isInviteRoleCompatible,
  type CloudStory,
} from '@/lib/cloudStories';

const story = (over: Partial<CloudStory>): CloudStory => ({
  id: 's1', owner: 'owner1', collaborators: [], shareable: false, title: 'T', data: '', ...over,
});

describe('story role resolution', () => {
  it('owner always has full access', () => {
    expect(resolveStoryRole(story({ owner: 'me' }), 'me')).toBe('both');
  });
  it('collaborator gets their assigned role (defaults to both)', () => {
    const s = story({ collaborators: ['c1'], collaboratorRoles: { c1: 'writer' } });
    expect(resolveStoryRole(s, 'c1')).toBe('writer');
    const s2 = story({ collaborators: ['c2'] });
    expect(resolveStoryRole(s2, 'c2')).toBe('both');
  });
  it('non-member has no role', () => {
    expect(resolveStoryRole(story({}), 'stranger')).toBeNull();
    expect(resolveStoryRole(null, 'x')).toBeNull();
  });
  it('capability helpers map roles correctly', () => {
    expect(canEditWriter('writer')).toBe(true);
    expect(canEditWriter('director')).toBe(false);
    expect(canEditDirector('director')).toBe(true);
    expect(canEditDirector('writer')).toBe(false);
    expect(canEditWriter('both')).toBe(true);
    expect(canEditDirector('both')).toBe(true);
    expect(canComment('producer')).toBe(true);
    expect(canComment(null)).toBe(false);
  });
});

describe('invite role compatibility', () => {
  it('both/unknown always compatible', () => {
    expect(isInviteRoleCompatible('writer', null).ok).toBe(true);
    expect(isInviteRoleCompatible('writer', { role: 'both', acceptOppositeRole: false }).ok).toBe(true);
    expect(isInviteRoleCompatible('both', { role: 'writer', acceptOppositeRole: false }).ok).toBe(true);
  });
  it('opposite role blocked unless accepted', () => {
    expect(isInviteRoleCompatible('writer', { role: 'director', acceptOppositeRole: false }).ok).toBe(false);
    expect(isInviteRoleCompatible('writer', { role: 'director', acceptOppositeRole: true }).ok).toBe(true);
  });
});
