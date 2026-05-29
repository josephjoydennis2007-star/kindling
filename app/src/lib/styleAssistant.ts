/**
 * Local style assistant. Rules-based, no AI, no cloud. Pass it the writer's
 * stripped plain-text content and it returns a list of findings.
 */

export type FindingKind = 'long-sentence' | 'passive' | 'repeated-word' | 'adverb';

export interface Finding {
  kind: FindingKind;
  text: string;     // snippet (≤ 120 chars)
  note: string;
  severity: 'info' | 'warn' | 'error';
}

const PASSIVE_RE = /\b(was|were|been|being|is|are|am|be)\s+\w+(ed|en)\b/gi;
const ADVERB_RE = /\b(very|really|just|actually|literally|basically|truly|simply|quite|rather|kind of|sort of)\b/gi;

export function analyzeText(text: string): Finding[] {
  const findings: Finding[] = [];

  // 1. Long sentences ( > 35 words )
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const wc = s.trim().split(/\s+/).filter(Boolean).length;
    if (wc > 35) {
      findings.push({
        kind: 'long-sentence',
        text: s.trim().slice(0, 120) + (s.length > 120 ? '…' : ''),
        note: `${wc} words — consider splitting`,
        severity: wc > 50 ? 'error' : 'warn',
      });
    }
  }

  // 2. Passive voice
  for (const m of text.matchAll(PASSIVE_RE)) {
    const ctx = text.slice(Math.max(0, m.index! - 30), Math.min(text.length, m.index! + 60));
    findings.push({
      kind: 'passive',
      text: ctx.trim(),
      note: `Passive: "${m[0]}"`,
      severity: 'info',
    });
  }

  // 3. Repeated words (case-insensitive, ignoring very short / stop words)
  const stopwords = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'as', 'is', 'was', 'were', 'are', 'be', 'i', 'he', 'she', 'it', 'we', 'they', 'you', 'his', 'her', 'their', 'this', 'that', 'these', 'those', 'has', 'have', 'had', 'not', 'no']);
  const wordCounts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/\b[a-z]{4,}\b/g) || []) {
    if (stopwords.has(w)) continue;
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }
  const totalWords = (text.match(/\b[a-z]{2,}\b/gi) || []).length || 1;
  for (const [w, n] of wordCounts) {
    // Flag words that appear 5+ times AND account for >0.7% of total
    if (n >= 5 && n / totalWords > 0.007) {
      findings.push({
        kind: 'repeated-word',
        text: w,
        note: `"${w}" appears ${n} times`,
        severity: n > 10 ? 'warn' : 'info',
      });
    }
  }

  // 4. Adverb / filler watch
  const adverbHits = [...text.matchAll(ADVERB_RE)];
  if (adverbHits.length > 5) {
    findings.push({
      kind: 'adverb',
      text: adverbHits.slice(0, 5).map((m) => m[0]).join(', '),
      note: `${adverbHits.length} filler adverbs — pick stronger verbs`,
      severity: adverbHits.length > 15 ? 'warn' : 'info',
    });
  }

  return findings;
}
