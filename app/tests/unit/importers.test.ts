import { describe, it, expect } from 'vitest';
import { importText } from '@/lib/importers';

describe('Fountain import fidelity', () => {
  const fountain = `Title: Test Film
Credit: Written by
Author: Jane Doe

INT. ROOM - DAY #1#

She enters.

ANA
Hello there.
(softly)
Goodbye.

> CUT TO:

.A FORCED HEADING #2#

He waits.
`;

  it('parses elements without the title page leaking into the body', () => {
    const r = importText(fountain, 'fountain');
    const els = r.screenplay.elements.filter((e: any) => e.content !== '');
    expect(els.some((e: any) => /Title:|Credit:|Author:|Jane Doe/.test(e.content))).toBe(false);
  });

  it('strips #n# scene numbers and leading "." from headings', () => {
    const r = importText(fountain, 'fountain');
    const headings = r.screenplay.elements.filter((e: any) => e.type === 'scene-heading').map((e: any) => e.content);
    expect(headings).toContain('INT. ROOM - DAY');
    expect(headings).toContain('A FORCED HEADING');
    expect(headings.join(' ')).not.toMatch(/#/);
  });

  it('recognizes character, parenthetical, dialogue and transition', () => {
    const r = importText(fountain, 'fountain');
    const types = new Set(r.screenplay.elements.map((e: any) => e.type));
    expect(types.has('character')).toBe(true);
    expect(types.has('parenthetical')).toBe(true);
    expect(types.has('dialogue')).toBe(true);
    expect(types.has('transition')).toBe(true);
    expect(r.screenplay.elements.some((e: any) => e.type === 'transition' && /CUT TO/.test(e.content))).toBe(true);
  });
});

describe('FDX import fidelity', () => {
  const fdx = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Number="1" Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>She enters.</Text></Paragraph>
    <Paragraph Type="Character"><Text>ANA</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>Hello.</Text></Paragraph>
  </Content>
  <TitlePage>
    <Content>
      <Paragraph Alignment="Center"><Text>Test Film</Text></Paragraph>
      <Paragraph Alignment="Center"><Text>Jane Doe</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`;

  it('reads only the body, not the title page', () => {
    const r = importText(fdx, 'fdx');
    const els = r.screenplay.elements;
    // Title-page text must NOT appear in the body.
    expect(els.some((e: any) => /Test Film|Jane Doe/.test(e.content))).toBe(false);
    expect(els.find((e: any) => e.type === 'scene-heading')?.content).toBe('INT. ROOM - DAY');
    expect(els.some((e: any) => e.type === 'character' && e.content === 'ANA')).toBe(true);
  });
});
