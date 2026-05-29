/**
 * Local-only writing-stats tracker. Records, per day, the cumulative word
 * count of the active story. Streaks are computed from the days that have
 * any recorded activity. Nothing leaves the device.
 */

const KEY = 'kindling-writing-stats';

interface StatsBlob {
  // YYYY-MM-DD → words (cumulative count of the most recent save that day)
  [date: string]: number;
}

function load(): StatsBlob {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function save(b: StatsBlob) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch {}
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordWords(words: number) {
  const b = load();
  const t = today();
  // Always record today's count — even small writes count as activity.
  b[t] = Math.max(b[t] || 0, words);
  save(b);
}

export function getStats() {
  const b = load();
  const dates = Object.keys(b).sort();
  const t = today();
  const todayWords = b[t] || 0;

  // Build last-30-days array (oldest → newest)
  const series: { date: string; words: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    series.push({ date: key, words: b[key] || 0 });
  }
  // Last 90 days for the dashboard line chart.
  const series90: { date: string; words: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    series90.push({ date: key, words: b[key] || 0 });
  }

  // Streak: count consecutive days back from today that have > 0 words
  const cur = (() => {
    let s = 0;
    const now2 = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(now2);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if ((b[key] || 0) > 0) s++;
      else break;
    }
    return s;
  })();

  // Longest streak: scan all dates
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of dates) {
    if (!b[k]) continue;
    const d = new Date(k + 'T00:00:00');
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      if (diff === 1) run++; else run = 1;
    } else { run = 1; }
    if (run > longest) longest = run;
    prev = d;
  }

  return { today: todayWords, streak: cur, longest, series, series90 };
}
