/**
 * Beat-sheet templates. Each template lists a series of beats grouped into
 * acts. When applied, the Plot board clears any existing acts/beats (after
 * confirmation) and inserts these so the user can rename and elaborate.
 */

import type { BeatType } from '@/types';

export interface BeatSheetBeat {
  title: string;
  hint: string;
  beatType?: BeatType;
}

export interface BeatSheetAct {
  title: string;
  beats: BeatSheetBeat[];
}

export interface BeatSheet {
  id: string;
  label: string;
  description: string;
  source: string;
  acts: BeatSheetAct[];
}

export const BEAT_SHEETS: BeatSheet[] = [
  {
    id: 'save-the-cat',
    label: 'Save the Cat (15 beats)',
    source: 'Blake Snyder',
    description: 'A classic 15-beat structure for accessible feature films.',
    acts: [
      {
        title: 'Act I',
        beats: [
          { title: 'Opening Image', hint: 'A visual that captures the protagonist\'s status quo', beatType: 'setup' },
          { title: 'Theme Stated', hint: 'A character voices the story\'s theme', beatType: 'setup' },
          { title: 'Setup', hint: 'Establish the world, want, and flaws', beatType: 'setup' },
          { title: 'Catalyst', hint: 'The inciting incident', beatType: 'inciting' },
          { title: 'Debate', hint: 'Should the hero accept the call?', beatType: 'turn' },
        ],
      },
      {
        title: 'Act II — A',
        beats: [
          { title: 'Break Into Two', hint: 'The hero commits to the new world', beatType: 'turn' },
          { title: 'B Story', hint: 'A subplot — usually love or mentor', beatType: 'setup' },
          { title: 'Fun & Games', hint: 'The promise of the premise', beatType: 'setup' },
          { title: 'Midpoint', hint: 'False victory or false defeat', beatType: 'midpoint' },
        ],
      },
      {
        title: 'Act II — B',
        beats: [
          { title: 'Bad Guys Close In', hint: 'External pressure tightens', beatType: 'crisis' },
          { title: 'All Is Lost', hint: 'The lowest point — symbolic death', beatType: 'crisis' },
          { title: 'Dark Night of the Soul', hint: 'Inner reckoning', beatType: 'crisis' },
        ],
      },
      {
        title: 'Act III',
        beats: [
          { title: 'Break Into Three', hint: 'New plan emerges from synthesis', beatType: 'turn' },
          { title: 'Finale', hint: 'Hero executes the new plan', beatType: 'climax' },
          { title: 'Final Image', hint: 'Mirror of the Opening Image — shows change', beatType: 'payoff' },
        ],
      },
    ],
  },
  {
    id: 'heros-journey',
    label: "Hero's Journey (12 stages)",
    source: 'Joseph Campbell / Christopher Vogler',
    description: 'The monomyth — universal across cultures.',
    acts: [
      {
        title: 'Departure',
        beats: [
          { title: 'Ordinary World', hint: 'Hero\'s normal life before the story', beatType: 'setup' },
          { title: 'Call to Adventure', hint: 'A challenge or quest is presented', beatType: 'inciting' },
          { title: 'Refusal of the Call', hint: 'Hesitation or fear', beatType: 'turn' },
          { title: 'Meeting the Mentor', hint: 'A guide provides advice or a gift', beatType: 'setup' },
          { title: 'Crossing the Threshold', hint: 'Hero commits to the journey', beatType: 'turn' },
        ],
      },
      {
        title: 'Initiation',
        beats: [
          { title: 'Tests, Allies, Enemies', hint: 'Trials of the new world', beatType: 'crisis' },
          { title: 'Approach to the Inmost Cave', hint: 'Preparation for the central ordeal', beatType: 'crisis' },
          { title: 'Ordeal', hint: 'Hero faces death — literal or symbolic', beatType: 'climax' },
          { title: 'Reward (Seizing the Sword)', hint: 'Hero takes possession of the prize', beatType: 'payoff' },
        ],
      },
      {
        title: 'Return',
        beats: [
          { title: 'The Road Back', hint: 'Drive to complete the adventure', beatType: 'turn' },
          { title: 'Resurrection', hint: 'Final test — hero is reborn', beatType: 'climax' },
          { title: 'Return with the Elixir', hint: 'Hero returns changed, with a gift for community', beatType: 'payoff' },
        ],
      },
    ],
  },
  {
    id: 'story-circle',
    label: 'Story Circle (8 beats)',
    source: 'Dan Harmon',
    description: 'Compact Hero\'s Journey — great for episodic TV.',
    acts: [
      {
        title: 'The Circle',
        beats: [
          { title: 'You (Comfort)', hint: 'A character is in a zone of comfort', beatType: 'setup' },
          { title: 'Need', hint: 'They want something', beatType: 'setup' },
          { title: 'Go', hint: 'They enter an unfamiliar situation', beatType: 'inciting' },
          { title: 'Search', hint: 'They adapt to it', beatType: 'crisis' },
          { title: 'Find', hint: 'They get what they wanted', beatType: 'midpoint' },
          { title: 'Take', hint: 'They pay a heavy price', beatType: 'crisis' },
          { title: 'Return', hint: 'They return to their familiar situation', beatType: 'turn' },
          { title: 'Change', hint: 'They have changed', beatType: 'payoff' },
        ],
      },
    ],
  },
  {
    id: 'three-act',
    label: 'Three-Act (8 beats)',
    source: 'Aristotle / Syd Field',
    description: 'The fundamental three-act paradigm.',
    acts: [
      {
        title: 'Act I — Setup',
        beats: [
          { title: 'Hook', hint: 'Grab attention in the first pages', beatType: 'hook' },
          { title: 'Inciting Incident', hint: 'The event that disrupts equilibrium', beatType: 'inciting' },
          { title: 'Plot Point 1', hint: 'Crossing from Act I to II — point of no return', beatType: 'turn' },
        ],
      },
      {
        title: 'Act II — Confrontation',
        beats: [
          { title: 'Pinch Point', hint: 'Reminder of the antagonistic force', beatType: 'crisis' },
          { title: 'Midpoint', hint: 'Reversal that raises stakes', beatType: 'midpoint' },
          { title: 'Plot Point 2', hint: 'Crisis that propels Act III', beatType: 'turn' },
        ],
      },
      {
        title: 'Act III — Resolution',
        beats: [
          { title: 'Climax', hint: 'Confrontation and decision', beatType: 'climax' },
          { title: 'Resolution', hint: 'New normal', beatType: 'payoff' },
        ],
      },
    ],
  },
];
