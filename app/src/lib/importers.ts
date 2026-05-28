// Universal importer: accepts .json, .txt, .md, .fountain, .html
// and produces a Partial<AppState> suitable for use with importStory.

import type { ScreenplayElement } from '@/types';

function genId(prefix = 'el'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function detectFormat(filename: string): 'json' | 'fountain' | 'md' | 'html' | 'txt' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.fountain')) return 'fountain';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'txt';
}

export function importText(text: string, format: 'json' | 'fountain' | 'md' | 'html' | 'txt'): any | null {
  try {
    if (format === 'json') {
      const data = JSON.parse(text);
      if (!data.screenplay) return null;
      return data;
    }

    const elements: ScreenplayElement[] = [];
    let raw = text;
    if (format === 'html') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      doc.querySelectorAll('p').forEach((p) => {
        const cls = p.className || 'action';
        elements.push({
          id: genId(),
          type: (cls as any) || 'action',
          content: p.innerHTML,
          sceneId: null,
        });
      });
    } else {
      raw.split(/\r?\n/).forEach((line) => {
        const stripped = line.trim();
        if (!stripped) {
          elements.push({ id: genId(), type: 'action', content: '', sceneId: null });
          return;
        }
        let type: ScreenplayElement['type'] = 'action';
        // Fountain-ish detection
        if (/^(int|ext|i\/e|est)[\. ]/i.test(stripped)) type = 'scene-heading';
        else if (/^[A-Z][A-Z0-9 .\-']{1,40}$/.test(stripped) && stripped.length <= 40) type = 'character';
        else if (/^\(.+\)$/.test(stripped)) type = 'parenthetical';
        else if (/^(>.+<|fade in|fade out|cut to|smash cut|dissolve to)/i.test(stripped)) type = 'transition';
        else if (format === 'md') {
          if (/^#{1,2} /.test(stripped)) type = 'scene-heading';
        }
        elements.push({ id: genId(), type, content: escape(stripped), sceneId: null });
      });
    }

    return {
      screenplay: {
        title: '',
        author: '',
        contact: '',
        logline: '',
        synopsis: '',
        instructions: '',
        started: true,
        elements,
        sections: [],
        activeSectionId: null,
      },
      scenes: [],
      shots: {},
      bRolls: {},
      characters: [],
      notes: [],
    };
  } catch (e) {
    console.error('importText error', e);
    return null;
  }
}

function escape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function importFromFile(file: File): Promise<any | null> {
  const text = await file.text();
  const format = detectFormat(file.name);
  return importText(text, format);
}
