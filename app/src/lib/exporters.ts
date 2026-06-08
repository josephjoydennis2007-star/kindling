// Exporters: build PDF / DOCX / HTML / MD / TXT / JSON documents
// containing whichever sections of the project the user has selected.

import { jsPDF } from 'jspdf';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  PageBreak,
} from 'docx';
import { saveAs } from 'file-saver';
import type {
  AppState,
  Character,
  Scene,
  Shot,
  BRoll,
  Act,
  Beat,
  Note,
  ScreenplayElement,
} from '@/types';

export type ExportFormat = 'pdf' | 'docx' | 'html' | 'md' | 'txt' | 'json' | 'fountain' | 'fdx';
export type ExportTarget = 'writer' | 'director' | 'both';

export interface ExportSelection {
  format: ExportFormat;
  target: ExportTarget;
  // What blocks of content to include
  include: {
    titlePage: boolean;
    logline: boolean;
    synopsis: boolean;
    instructions: boolean;
    notes: boolean;
    acts: boolean;
    beats: boolean;
    sections: boolean;        // Writer sections list
    screenplay: boolean;      // The actual scripted pages
    scenes: boolean;          // Director scene cards
    shots: boolean;
    bRolls: boolean;
    audio: boolean;
    characters: boolean;      // master toggle
    characterIds: string[];   // sub-list (empty = none unless `allCharacters`)
    allCharacters: boolean;
  };
  // Where to write
  savePicker: 'default-folder' | 'system-dialog' | 'download';
}

// --------- Build a normalized document model ----------

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'spacer' | 'rule' | 'pageBreak' | 'list';
  text?: string;
  items?: string[];
  meta?: Record<string, string | undefined>;
  // For screenplay paragraphs:
  scrFormat?: 'scene-heading' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition';
}

function stripHtml(html: string): string {
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}

function buildBlocks(state: Partial<AppState>, sel: ExportSelection, storyTitle: string): Block[] {
  const blocks: Block[] = [];
  const { include, target } = sel;
  const sp = state.screenplay!;

  // ------ TITLE PAGE ------
  if (include.titlePage) {
    blocks.push({ kind: 'h1', text: sp.title || storyTitle });
    if (sp.author) blocks.push({ kind: 'p', text: `Written by ${sp.author}` });
    if (sp.contact) blocks.push({ kind: 'p', text: sp.contact });
    blocks.push({ kind: 'spacer' });
    blocks.push({ kind: 'rule' });
  }
  if (include.logline && sp.logline) {
    blocks.push({ kind: 'h3', text: 'LOGLINE' });
    blocks.push({ kind: 'p', text: sp.logline });
  }
  if (include.synopsis && sp.synopsis) {
    blocks.push({ kind: 'h3', text: 'SYNOPSIS' });
    blocks.push({ kind: 'p', text: sp.synopsis });
  }
  if (include.instructions && sp.instructions) {
    blocks.push({ kind: 'h3', text: 'INSTRUCTIONS / NOTES TO SELF' });
    sp.instructions.split('\n').forEach((line: string) => blocks.push({ kind: 'p', text: line }));
  }

  // ------ CHARACTERS ------
  if (include.characters) {
    const chars: Character[] = state.characters || [];
    const toShow = include.allCharacters
      ? chars
      : chars.filter((c) => include.characterIds.includes(c.id));
    if (toShow.length) {
      blocks.push({ kind: 'pageBreak' });
      blocks.push({ kind: 'h2', text: 'CHARACTERS' });
      toShow.forEach((c) => {
        blocks.push({ kind: 'h3', text: c.name });
        const facts: string[] = [];
        if (c.age) facts.push(`Age: ${c.age}`);
        if (c.occupation) facts.push(`Occupation: ${c.occupation}`);
        if (facts.length) blocks.push({ kind: 'p', text: facts.join('  ·  ') });
        if (c.description) blocks.push({ kind: 'p', text: c.description });
        if (c.personality) { blocks.push({ kind: 'h4', text: 'Personality' }); blocks.push({ kind: 'p', text: c.personality }); }
        if (c.goals) { blocks.push({ kind: 'h4', text: 'Goals' }); blocks.push({ kind: 'p', text: c.goals }); }
        if (c.motivation) { blocks.push({ kind: 'h4', text: 'Motivation' }); blocks.push({ kind: 'p', text: c.motivation }); }
        if (c.conflict) { blocks.push({ kind: 'h4', text: 'Conflict' }); blocks.push({ kind: 'p', text: c.conflict }); }
        if (c.backstory) { blocks.push({ kind: 'h4', text: 'Backstory' }); blocks.push({ kind: 'p', text: c.backstory }); }
        if (c.relationships) { blocks.push({ kind: 'h4', text: 'Relationships' }); blocks.push({ kind: 'p', text: c.relationships }); }
        if (c.notes) { blocks.push({ kind: 'h4', text: 'Notes' }); blocks.push({ kind: 'p', text: c.notes }); }
        if (c.tags && c.tags.length) blocks.push({ kind: 'p', text: 'Tags: ' + c.tags.join(', ') });
        blocks.push({ kind: 'spacer' });
      });
    }
  }

  // ------ NOTES ------
  if (include.notes && state.notes && state.notes.length) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'h2', text: 'NOTES' });
    state.notes.forEach((n: Note) => {
      blocks.push({ kind: 'h4', text: n.category.toUpperCase() });
      blocks.push({ kind: 'p', text: n.text });
    });
  }

  // ------ ACTS / BEATS (PlotBoard) ------
  if (include.acts && state.plotBoard?.acts?.length) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'h2', text: 'PLOT BOARD' });
    state.plotBoard.acts.forEach((a: Act) => {
      blocks.push({ kind: 'h3', text: a.title });
      if (include.beats) {
        const beats = (a.beatIds || []).map((id) => state.beats?.[id]).filter(Boolean) as Beat[];
        beats.forEach((b) => {
          if (b.title || b.description) {
            blocks.push({ kind: 'h4', text: b.title || '(untitled beat)' });
            if (b.description) blocks.push({ kind: 'p', text: b.description });
            if (b.tags?.length) blocks.push({ kind: 'p', text: 'Tags: ' + b.tags.join(', ') });
          }
        });
      }
    });
  }

  // ------ WRITER SECTIONS ------
  if (include.sections && sp.sections?.length) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'h2', text: 'WRITER SECTIONS' });
    sp.sections.forEach((s) => {
      blocks.push({ kind: 'h3', text: s.name });
      if (s.description) blocks.push({ kind: 'p', text: s.description });
    });
  }

  // ------ SCREENPLAY PAGES (Writer) ------
  const wantWriter = target === 'writer' || target === 'both';
  if (wantWriter && include.screenplay && sp.elements?.length) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'h2', text: 'SCREENPLAY' });
    sp.elements.forEach((el: ScreenplayElement) => {
      const t = stripHtml(el.content).trim();
      if (!t && el.type !== 'scene-heading') return;
      blocks.push({ kind: 'p', text: t, scrFormat: el.type });
    });
  }

  // ------ DIRECTOR ------
  const wantDirector = target === 'director' || target === 'both';
  if (wantDirector && include.scenes && state.scenes?.length) {
    blocks.push({ kind: 'pageBreak' });
    blocks.push({ kind: 'h2', text: 'DIRECTOR — SCENES' });
    state.scenes.forEach((s: Scene) => {
      blocks.push({ kind: 'h3', text: s.heading || s.name });
      if (s.description) blocks.push({ kind: 'p', text: s.description });
      blocks.push({ kind: 'p', text: `Status: ${s.status}` });
      if (s.content) {
        const t = stripHtml(s.content).trim();
        if (t) blocks.push({ kind: 'p', text: t });
      }

      if (include.shots) {
        const shots = (s.shotIds || []).map((id) => state.shots?.[id]).filter(Boolean) as Shot[];
        if (shots.length) blocks.push({ kind: 'h4', text: 'Shots' });
        shots.forEach((sh, i) => {
          const head = `Shot ${i + 1}` + (sh.shotType ? ` — ${sh.shotType}` : '') + (sh.camera ? `  ·  ${sh.camera}` : '');
          blocks.push({ kind: 'p', text: head });
          if (sh.description) blocks.push({ kind: 'p', text: sh.description });
          if (include.audio && (sh.audioNote || sh.audioFile)) {
            blocks.push({ kind: 'p', text: 'AUDIO: ' + (sh.audioNote || '(attached audio file)') });
          }
          if (include.bRolls && sh.bRollIds?.length) {
            const brolls = sh.bRollIds.map((id) => state.bRolls?.[id]).filter(Boolean) as BRoll[];
            if (brolls.length) {
              blocks.push({ kind: 'list', items: brolls.map((b) => `B-roll: ${b.description || '(empty)'}`) });
            }
          }
        });
      }
    });
  }

  return blocks;
}

// --------- Format-specific writers ----------

function blocksToHtml(blocks: Block[], title: string): string {
  let body = '';
  for (const b of blocks) {
    if (b.kind === 'pageBreak') body += '<div class="page-break"></div>';
    else if (b.kind === 'rule') body += '<hr/>';
    else if (b.kind === 'spacer') body += '<div style="height:12px"></div>';
    else if (b.kind === 'list') body += '<ul>' + (b.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
    else if (b.kind === 'h1') body += `<h1>${escapeHtml(b.text || '')}</h1>`;
    else if (b.kind === 'h2') body += `<h2>${escapeHtml(b.text || '')}</h2>`;
    else if (b.kind === 'h3') body += `<h3>${escapeHtml(b.text || '')}</h3>`;
    else if (b.kind === 'h4') body += `<h4>${escapeHtml(b.text || '')}</h4>`;
    else {
      const cls = b.scrFormat ? ` class="scr ${b.scrFormat}"` : '';
      body += `<p${cls}>${escapeHtml(b.text || '')}</p>`;
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Courier New', monospace; max-width: 8.5in; margin: 1in auto; padding: 0 1in; color: #111; line-height: 1.5; }
  h1 { text-align:center; font-size: 28px; margin-bottom: 24px; }
  h2 { border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 32px; }
  h3 { margin-top: 20px; }
  h4 { margin: 10px 0 4px; color: #444; }
  hr { border:0; border-top: 1px solid #999; margin: 18px 0; }
  ul { padding-left: 22px; }
  .page-break { page-break-after: always; height: 0; }
  p.scr.scene-heading { text-transform: uppercase; font-weight: 700; margin-top: 18px; }
  p.scr.character    { text-transform: uppercase; text-align: center; margin-top: 14px; margin-bottom: 0; }
  p.scr.parenthetical{ text-align: center; font-style: italic; margin: 0; }
  p.scr.dialogue     { margin: 0 1.5in; }
  p.scr.transition   { text-transform: uppercase; text-align: right; margin-top: 16px; }
  p.scr.action       { margin: 8px 0; }
</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'pageBreak' || b.kind === 'rule') out.push('\n---\n');
    else if (b.kind === 'spacer') out.push('');
    else if (b.kind === 'list') (b.items || []).forEach((i) => out.push(`- ${i}`));
    else if (b.kind === 'h1') out.push(`# ${b.text}`);
    else if (b.kind === 'h2') out.push(`## ${b.text}`);
    else if (b.kind === 'h3') out.push(`### ${b.text}`);
    else if (b.kind === 'h4') out.push(`#### ${b.text}`);
    else {
      if (b.scrFormat === 'scene-heading') out.push(`**${(b.text || '').toUpperCase()}**`);
      else if (b.scrFormat === 'character') out.push(`> **${(b.text || '').toUpperCase()}**`);
      else if (b.scrFormat === 'parenthetical') out.push(`> _(${b.text})_`);
      else if (b.scrFormat === 'dialogue') out.push(`> ${b.text}`);
      else if (b.scrFormat === 'transition') out.push(`**${(b.text || '').toUpperCase()}**`);
      else out.push(b.text || '');
    }
    out.push('');
  }
  return out.join('\n');
}

function blocksToText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'pageBreak' || b.kind === 'rule') out.push('', '------------------------------------------------------------', '');
    else if (b.kind === 'spacer') out.push('');
    else if (b.kind === 'list') (b.items || []).forEach((i) => out.push('  - ' + i));
    else if (b.kind === 'h1') { out.push('', (b.text || '').toUpperCase(), '='.repeat((b.text || '').length)); }
    else if (b.kind === 'h2') { out.push('', (b.text || '').toUpperCase(), '-'.repeat((b.text || '').length)); }
    else if (b.kind === 'h3') { out.push('', (b.text || '').toUpperCase()); }
    else if (b.kind === 'h4') { out.push('', (b.text || '')); }
    else {
      const t = b.text || '';
      if (b.scrFormat === 'scene-heading') out.push('', t.toUpperCase());
      else if (b.scrFormat === 'character') out.push('', '\t\t\t' + t.toUpperCase());
      else if (b.scrFormat === 'parenthetical') out.push('\t\t\t(' + t.replace(/^\(|\)$/g, '') + ')');
      else if (b.scrFormat === 'dialogue') out.push('\t\t' + t);
      else if (b.scrFormat === 'transition') out.push('', '\t\t\t\t\t' + t.toUpperCase());
      else out.push(t);
    }
  }
  return out.join('\n');
}

/**
 * Plain Fountain format — the de facto markdown-for-screenwriters spec.
 * Other apps (Highland, Final Draft, WriterDuet, KIT Scenarist…) read it.
 * https://fountain.io/syntax
 */
const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;

function blocksToFountain(blocks: Block[], title: string, author?: string): string {
  const out: string[] = [];
  // ── Title page (Fountain key:value block, blank line ends it) ──
  out.push(`Title: ${title || 'Untitled'}`);
  out.push('Credit: Written by');
  if (author) out.push(`Author: ${author}`);
  out.push('');

  // Fountain is a SCREENPLAY interchange format — emit only the scripted
  // elements (not prose sections like logline/synopsis/characters, which
  // would import as Action noise in other tools). Scene numbers as #n#.
  let sceneNo = 0;
  for (const b of blocks) {
    if (!b.scrFormat) continue;
    const t = (b.text || '').trim();
    if (!t) continue;
    switch (b.scrFormat) {
      case 'scene-heading': {
        sceneNo++;
        let h = t.toUpperCase();
        // Force a scene heading with a leading dot if it doesn't look like one.
        if (!SCENE_HEADING_RE.test(h)) h = `.${h}`;
        out.push('', `${h} #${sceneNo}#`);
        break;
      }
      case 'character':
        out.push('', t.toUpperCase());
        break;
      case 'parenthetical':
        out.push(`(${t.replace(/^\(|\)$/g, '')})`);
        break;
      case 'dialogue':
        out.push(t);
        break;
      case 'transition':
        out.push('', `> ${t.toUpperCase().replace(/^>\s*/, '')}`);
        break;
      default:
        out.push('', t); // action
    }
  }
  return out.join('\n') + '\n';
}

/**
 * Final Draft .fdx — XML the FinalDraft.app reads natively. We emit a minimal
 * but valid FinalDraft 5 document with one <Paragraph Type="..."> per element.
 */
function blocksToFdx(blocks: Block[], title: string, author?: string): string {
  const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const typeMap: Record<string, string> = {
    'scene-heading': 'Scene Heading',
    'action': 'Action',
    'character': 'Character',
    'parenthetical': 'Parenthetical',
    'dialogue': 'Dialogue',
    'transition': 'Transition',
  };
  const paragraphs: string[] = [];
  let sceneNo = 0;
  for (const b of blocks) {
    // FDX is a SCREENPLAY format — only emit scripted elements so the body
    // isn't polluted with prose sections as Action.
    if (!b.scrFormat) continue;
    let t = (b.text || '').trim();
    if (!t) continue;
    const fdxType = typeMap[b.scrFormat] || 'Action';
    if (b.scrFormat === 'scene-heading') {
      sceneNo++;
      paragraphs.push(`    <Paragraph Number="${sceneNo}" Type="Scene Heading">\n      <Text>${escAttr(t.toUpperCase())}</Text>\n    </Paragraph>`);
    } else {
      if (b.scrFormat === 'character' || b.scrFormat === 'transition') t = t.toUpperCase();
      if (b.scrFormat === 'parenthetical') t = `(${t.replace(/^\(|\)$/g, '')})`;
      paragraphs.push(`    <Paragraph Type="${fdxType}">\n      <Text>${escAttr(t)}</Text>\n    </Paragraph>`);
    }
  }
  const tp: string[] = [
    `      <Paragraph Alignment="Center"><Text>${escAttr(title || 'Untitled')}</Text></Paragraph>`,
    `      <Paragraph Alignment="Center"><Text></Text></Paragraph>`,
    `      <Paragraph Alignment="Center"><Text>Written by</Text></Paragraph>`,
  ];
  if (author) tp.push(`      <Paragraph Alignment="Center"><Text>${escAttr(author)}</Text></Paragraph>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paragraphs.join('\n')}
  </Content>
  <TitlePage>
    <Content>
${tp.join('\n')}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}

function blocksToPdfBlob(blocks: Block[], title: string, author?: string): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();   // 612pt (8.5")
  const pageH = doc.internal.pageSize.getHeight();  // 792pt (11")
  // Industry spec: 1.5" left, 1" right/top/bottom. Courier 12pt at 6 lines/inch
  // (12pt leading) → 54 lines in the 9" writable column.
  const mL = 108, mR = 72, mT = 72, mB = 72;
  const LH = 12;
  let y = mT;
  let pageNum = 1;
  let sceneNo = 0;

  doc.setProperties({ title });
  doc.setFont('courier', 'normal');
  doc.setFontSize(12);

  const drawPageNumber = () => {
    if (pageNum <= 1) return; // title/first page unnumbered
    doc.setFont('courier', 'normal');
    doc.setFontSize(12);
    const s = `${pageNum}.`;
    doc.text(s, pageW - mR - doc.getTextWidth(s), mT - 36); // top-right, 0.5" down
  };
  const newPage = () => { doc.addPage(); pageNum++; y = mT; drawPageNumber(); };
  const ensure = (h: number) => { if (y + h > pageH - mB) newPage(); };

  const writeWrapped = (text: string, opts: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; indentLeft?: number; indentRight?: number; upper?: boolean }) => {
    const size = opts.size || 12;
    doc.setFont('courier', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const indentL = opts.indentLeft || 0;
    const indentR = opts.indentRight || 0;
    const width = Math.max(40, pageW - mL - mR - indentL - indentR);
    const lines = doc.splitTextToSize(opts.upper ? text.toUpperCase() : text, width) as string[];
    const lh = size === 12 ? LH : size * 1.2;
    for (const ln of lines) {
      ensure(lh);
      let x = mL + indentL;
      if (opts.align === 'center') x = (pageW - doc.getTextWidth(ln)) / 2;
      else if (opts.align === 'right') x = pageW - mR - doc.getTextWidth(ln);
      doc.text(ln, x, y);
      y += lh;
    }
  };

  // ── Title page: if the document opens with an h1 (the title block), render
  //    a proper centered title page and start the script on a fresh page. ──
  let i = 0;
  if (blocks[0]?.kind === 'h1') {
    y = pageH * 0.4;
    doc.setFont('courier', 'bold');
    doc.setFontSize(16);
    for (const ln of doc.splitTextToSize((blocks[0].text || title || 'Untitled').toUpperCase(), pageW - mL - mR) as string[]) {
      doc.text(ln, (pageW - doc.getTextWidth(ln)) / 2, y); y += 22;
    }
    i = 1;
    y += 28;
    doc.setFont('courier', 'normal');
    doc.setFontSize(12);
    if (author) { const s = `Written by ${author}`; doc.text(s, (pageW - doc.getTextWidth(s)) / 2, y); y += 16; }
    // Consume the title-page prose blocks (Written by / contact) so they don't
    // repeat in the body.
    while (blocks[i] && blocks[i].kind === 'p') i++;
    while (blocks[i] && (blocks[i].kind === 'spacer' || blocks[i].kind === 'rule')) i++;
    newPage();
  }

  for (; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'pageBreak') { newPage(); continue; }
    if (b.kind === 'spacer') { y += 8; continue; }
    if (b.kind === 'rule') {
      ensure(12); doc.setDrawColor(150); doc.line(mL, y, pageW - mR, y); y += 10; continue;
    }
    if (b.kind === 'list') { (b.items || []).forEach((it) => writeWrapped('• ' + it, { size: 11, indentLeft: 12 })); y += 4; continue; }
    if (b.kind === 'h1') { y += 6; writeWrapped(b.text || '', { size: 18, bold: true, align: 'center', upper: true }); y += 10; continue; }
    if (b.kind === 'h2') { y += 8; writeWrapped(b.text || '', { size: 15, bold: true, upper: true }); y += 6; continue; }
    if (b.kind === 'h3') { y += 6; writeWrapped(b.text || '', { size: 13, bold: true, upper: true }); y += 4; continue; }
    if (b.kind === 'h4') { y += 4; writeWrapped(b.text || '', { size: 11, bold: true }); y += 2; continue; }

    const t = b.text || '';
    switch (b.scrFormat) {
      case 'scene-heading': {
        y += LH; // blank line before a scene
        ensure(LH);
        sceneNo++;
        const num = String(sceneNo);
        doc.setFont('courier', 'bold'); doc.setFontSize(12);
        doc.text(num, mL - 36, y);            // scene number in the left margin
        doc.text(num, pageW - mR + 12, y);    // ...and the right margin
        writeWrapped(t, { size: 12, bold: true, upper: true });
        continue;
      }
      case 'character':
        writeWrapped(t, { size: 12, upper: true, indentLeft: 158 }); continue;        // ~3.7" from page left
      case 'parenthetical':
        writeWrapped(`(${t.replace(/^\(|\)$/g, '')})`, { size: 12, indentLeft: 115, indentRight: 150 }); continue;
      case 'dialogue':
        writeWrapped(t, { size: 12, indentLeft: 72, indentRight: 108 }); continue;     // 2.5"–6" column
      case 'transition':
        y += LH; writeWrapped(t, { size: 12, upper: true, align: 'right' }); continue;
      default:
        writeWrapped(t, { size: 12 }); continue;                                        // action, full width
    }
  }

  return doc.output('blob');
}

async function blocksToDocxBlob(blocks: Block[], title: string): Promise<Blob> {
  const children: Paragraph[] = [];

  const para = (text: string, opts?: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; upper?: boolean; indent?: number }) => {
    children.push(
      new Paragraph({
        alignment: opts?.align,
        indent: opts?.indent ? { left: opts.indent } : undefined,
        children: [
          new TextRun({
            text: opts?.upper ? text.toUpperCase() : text,
            bold: opts?.bold,
            font: 'Courier New',
            size: opts?.size || 22,
          }),
        ],
      }),
    );
  };

  for (const b of blocks) {
    if (b.kind === 'pageBreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    if (b.kind === 'rule' || b.kind === 'spacer') {
      children.push(new Paragraph({ children: [] }));
      continue;
    }
    if (b.kind === 'list') {
      (b.items || []).forEach((i) =>
        children.push(new Paragraph({ text: i, bullet: { level: 0 } })),
      );
      continue;
    }
    const headingMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
      h1: HeadingLevel.HEADING_1,
      h2: HeadingLevel.HEADING_2,
      h3: HeadingLevel.HEADING_3,
      h4: HeadingLevel.HEADING_4,
    };
    if (b.kind in headingMap) {
      children.push(
        new Paragraph({
          heading: headingMap[b.kind as keyof typeof headingMap],
          alignment: b.kind === 'h1' ? AlignmentType.CENTER : AlignmentType.LEFT,
          children: [
            new TextRun({ text: (b.text || '').toUpperCase(), bold: true, font: 'Courier New' }),
          ],
        }),
      );
      continue;
    }

    const t = b.text || '';
    if (b.scrFormat === 'scene-heading') para(t, { bold: true, upper: true, size: 24 });
    else if (b.scrFormat === 'character') para(t, { bold: true, upper: true, align: AlignmentType.CENTER });
    else if (b.scrFormat === 'parenthetical') para(`(${t.replace(/^\(|\)$/g, '')})`, { align: AlignmentType.CENTER });
    else if (b.scrFormat === 'dialogue') para(t, { indent: 2200 });
    else if (b.scrFormat === 'transition') para(t, { bold: true, upper: true, align: AlignmentType.RIGHT });
    else para(t);
  }

  const doc = new Document({
    title,
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

// --------- Save helpers ----------

export function sanitizeFilename(title: string, fallback: string) {
  return (
    (title || fallback)
      .trim()
      .replace(/[^a-z0-9\-_ ]/gi, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || fallback
  );
}

export async function writeToFolder(
  folderHandle: any,
  filename: string,
  data: Blob | string,
): Promise<boolean> {
  try {
    if (!folderHandle || typeof folderHandle.getFileHandle !== 'function') return false;
    // request permission if needed
    if (folderHandle.queryPermission) {
      let perm = await folderHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') perm = await folderHandle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') return false;
    }
    const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

// --------- Top-level entry ----------

export async function exportProject(
  state: Partial<AppState>,
  sel: ExportSelection,
  storyTitle: string,
  opts: { folderHandle?: any | null } = {},
): Promise<{ ok: boolean; filename: string; method: 'folder' | 'download'; }> {
  const blocks = buildBlocks(state, sel, storyTitle);
  const baseName = sanitizeFilename(storyTitle, 'screenplay');

  let blob: Blob;
  let filename: string;

  switch (sel.format) {
    case 'pdf': {
      blob = blocksToPdfBlob(blocks, storyTitle, state.screenplay?.author);
      filename = `${baseName}.pdf`;
      break;
    }
    case 'docx': {
      blob = await blocksToDocxBlob(blocks, storyTitle);
      filename = `${baseName}.docx`;
      break;
    }
    case 'html': {
      blob = new Blob([blocksToHtml(blocks, storyTitle)], { type: 'text/html;charset=utf-8' });
      filename = `${baseName}.html`;
      break;
    }
    case 'md': {
      blob = new Blob([blocksToMarkdown(blocks)], { type: 'text/markdown;charset=utf-8' });
      filename = `${baseName}.md`;
      break;
    }
    case 'json': {
      // include only what was selected, plus the selection itself
      const payload = { selection: sel, storyTitle, ...state };
      blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      filename = `${baseName}.json`;
      break;
    }
    case 'fountain': {
      blob = new Blob([blocksToFountain(blocks, storyTitle, state.screenplay?.author)], { type: 'text/plain;charset=utf-8' });
      filename = `${baseName}.fountain`;
      break;
    }
    case 'fdx': {
      blob = new Blob([blocksToFdx(blocks, storyTitle, state.screenplay?.author)], { type: 'application/xml;charset=utf-8' });
      filename = `${baseName}.fdx`;
      break;
    }
    case 'txt':
    default: {
      blob = new Blob([blocksToText(blocks)], { type: 'text/plain;charset=utf-8' });
      filename = `${baseName}.txt`;
    }
  }

  // Try folder first
  if (sel.savePicker === 'default-folder' && opts.folderHandle) {
    const ok = await writeToFolder(opts.folderHandle, filename, blob);
    if (ok) return { ok: true, filename, method: 'folder' };
  }

  // System file dialog (Chrome / Edge with File System Access API)
  if (sel.savePicker === 'system-dialog' && (window as any).showSaveFilePicker) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { ok: true, filename, method: 'folder' };
    } catch {
      // user cancelled — fall through to download
    }
  }

  // Plain download
  saveAs(blob, filename);
  return { ok: true, filename, method: 'download' };
}
