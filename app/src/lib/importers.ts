// Universal importer: accepts .json, .txt, .md, .fountain, .html
// and produces a Partial<AppState> suitable for use with importStory.

import type { ScreenplayElement } from '@/types';

function genId(prefix = 'el'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function detectFormat(filename: string): 'json' | 'fountain' | 'md' | 'html' | 'txt' | 'fdx' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.fdx')) return 'fdx';
  if (lower.endsWith('.fountain')) return 'fountain';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  return 'txt';
}

/**
 * Fountain → ScreenplayElement[]. Fountain syntax we recognize:
 *   - Scene headings: lines starting with INT./EXT./EST. (case-insensitive) OR
 *     a line starting with "." that is not "..."
 *   - Character: ALL CAPS line followed by dialogue (we treat any ALL-CAPS line
 *     <= 40 chars as character).
 *   - Parenthetical: line wrapped in (..)
 *   - Dialogue: lines that follow a character cue, not blank
 *   - Transition: ends with "TO:" OR starts with ">"
 *   - Action: everything else
 */
function fountainToElements(text: string): ScreenplayElement[] {
  const lines = text.split(/\r?\n/);
  const out: ScreenplayElement[] = [];
  let inDialogue = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trim();
    if (!stripped) { out.push({ id: genId(), type: 'action', content: '', sceneId: null }); inDialogue = false; continue; }
    // skip title page block lines like "Title: ..."
    if (i === 0 && /^[A-Z][A-Za-z ]+:/.test(stripped)) {
      while (i < lines.length && lines[i].trim()) i++;
      continue;
    }
    if (/^(int|ext|i\/e|est)[\. ]/i.test(stripped) || (/^\.[A-Z]/.test(stripped) && !stripped.startsWith('...'))) {
      out.push({ id: genId(), type: 'scene-heading', content: escape(stripped.replace(/^\./, '')), sceneId: null });
      inDialogue = false; continue;
    }
    if (/^>/.test(stripped) || /TO:\s*$/.test(stripped)) {
      out.push({ id: genId(), type: 'transition', content: escape(stripped.replace(/^>\s*/, '')), sceneId: null });
      inDialogue = false; continue;
    }
    if (/^\(.+\)$/.test(stripped) && inDialogue) {
      out.push({ id: genId(), type: 'parenthetical', content: escape(stripped), sceneId: null });
      continue;
    }
    if (/^[A-Z][A-Z0-9 .\-']{1,40}$/.test(stripped) && stripped.length <= 40 && lines[i + 1] && lines[i + 1].trim()) {
      out.push({ id: genId(), type: 'character', content: escape(stripped), sceneId: null });
      inDialogue = true; continue;
    }
    if (inDialogue) {
      out.push({ id: genId(), type: 'dialogue', content: escape(stripped), sceneId: null });
      continue;
    }
    out.push({ id: genId(), type: 'action', content: escape(stripped), sceneId: null });
  }
  return out;
}

/**
 * Final Draft .fdx → ScreenplayElement[]. FDX is XML; each <Paragraph Type="..">
 * maps cleanly to our element types.
 */
function fdxToElements(xml: string): ScreenplayElement[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const out: ScreenplayElement[] = [];
  const map: Record<string, ScreenplayElement['type']> = {
    'scene heading': 'scene-heading',
    'action': 'action',
    'character': 'character',
    'parenthetical': 'parenthetical',
    'dialogue': 'dialogue',
    'transition': 'transition',
    'shot': 'action',
    'general': 'action',
    'cast list': 'action',
  };
  doc.querySelectorAll('Paragraph').forEach((p) => {
    const type = (p.getAttribute('Type') || 'Action').toLowerCase();
    const mapped = map[type] || 'action';
    const text = Array.from(p.querySelectorAll('Text')).map((t) => t.textContent || '').join('').trim();
    if (text || mapped === 'scene-heading') out.push({ id: genId(), type: mapped, content: escape(text), sceneId: null });
  });
  return out;
}

/**
 * Inline markdown → HTML converter (small, dependency-free).
 * Handles **bold**, *italic*, _italic_, `code`, [link](url), and ![alt](url).
 */
function mdInline(s: string): string {
  // Escape first so we don't double-escape inserted HTML below
  let out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Images: ![alt](src)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => `<img src="${src}" alt="${alt}" />`);
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noreferrer">${t}</a>`);
  // Inline code
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // Bold (**) and italic (* or _)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<![*_])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '<em>$1</em>');
  return out;
}

/**
 * Convert a Markdown document into a series of ScreenplayElements. Headings,
 * paragraphs, blockquotes and lists are preserved; consecutive list/quote
 * lines collapse into one HTML block so the writer renders them as a real
 * list/quote rather than dumping raw # / - characters.
 */
function mdToElements(text: string): ScreenplayElement[] {
  const lines = text.split(/\r?\n/);
  const out: ScreenplayElement[] = [];
  let i = 0;

  // helpers
  const pushAction = (html: string) =>
    out.push({ id: genId(), type: 'action', content: html, sceneId: null });
  const pushSceneHeading = (html: string) =>
    out.push({ id: genId(), type: 'scene-heading', content: html, sceneId: null });

  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();

    // blank line → paragraph break
    if (!stripped) {
      pushAction('');
      i++;
      continue;
    }

    // ATX heading: # … ######
    const hm = stripped.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (hm) {
      const level = hm[1].length;
      const tag = level <= 2 ? 'scene-heading' : 'action';
      const content = `<strong>${mdInline(hm[2])}</strong>`;
      if (tag === 'scene-heading') pushSceneHeading(content);
      else pushAction(`<strong>${mdInline(hm[2])}</strong>`);
      i++;
      continue;
    }

    // Fenced code block ```
    if (/^```/.test(stripped)) {
      i++;
      const buf: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      pushAction(`<pre><code>${buf.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`);
      continue;
    }

    // Unordered list
    if (/^[-*+] +/.test(stripped)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+] +/.test(lines[i].trim())) {
        items.push(`<li>${mdInline(lines[i].trim().replace(/^[-*+] +/, ''))}</li>`);
        i++;
      }
      pushAction(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. +/.test(stripped)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. +/.test(lines[i].trim())) {
        items.push(`<li>${mdInline(lines[i].trim().replace(/^\d+\. +/, ''))}</li>`);
        i++;
      }
      pushAction(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Blockquote
    if (/^> /.test(stripped)) {
      const quoted: string[] = [];
      while (i < lines.length && /^> /.test(lines[i].trim())) {
        quoted.push(mdInline(lines[i].trim().replace(/^>\s?/, '')));
        i++;
      }
      pushAction(`<blockquote>${quoted.join('<br/>')}</blockquote>`);
      continue;
    }

    // Plain paragraph — gather lines until blank
    const para: string[] = [stripped];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    pushAction(mdInline(para.join(' ')));
  }

  return out;
}

export function importText(text: string, format: 'json' | 'fountain' | 'md' | 'html' | 'txt' | 'fdx'): any | null {
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
    } else if (format === 'md') {
      elements.push(...mdToElements(raw));
    } else if (format === 'fountain') {
      elements.push(...fountainToElements(raw));
    } else if (format === 'fdx') {
      elements.push(...fdxToElements(raw));
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
