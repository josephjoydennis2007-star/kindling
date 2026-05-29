/**
 * Tiny dependency-free confetti burst for milestone celebrations.
 *
 * Spawns a fixed-position container of emoji particles that drift down with
 * randomized horizontal velocity + spin, then cleans itself up. No animation
 * library, no canvas, no external dep — just plain DOM + a couple of
 * CSS keyframes injected once per page.
 *
 * Why emoji? They're already styled, scale crisply on any DPR, and feel
 * playful in a screenplay app without needing a heavy SVG sprite.
 */

const STYLE_ID = 'kindling-confetti-style';
const EMOJIS = ['🎉', '✨', '🎊', '🎬', '📝', '🌟', '🎈'];

function injectStyleOnce() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes kindling-confetti-fall {
      0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
      100% { transform: translate3d(var(--dx, 0px), 105vh, 0) rotate(var(--spin, 360deg)); opacity: 0.9; }
    }
    .kindling-confetti-particle {
      position: fixed;
      top: 0;
      left: 50%;
      font-size: 24px;
      pointer-events: none;
      will-change: transform, opacity;
      animation: kindling-confetti-fall var(--dur, 2.6s) ease-in forwards;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Play a short three-note arpeggio (C5 → E5 → G5, major triad ascending)
 * via Web Audio. ~600 ms total. Self-contained: creates an AudioContext on
 * the fly and tears it down. If the browser blocks audio (user hasn't
 * interacted yet) we silently no-op — celebrate() always still runs the
 * visual burst.
 */
function chime() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      // Quick ADSR — instant attack, gentle decay so it doesn't feel sharp.
      const start = now + i * 0.12;
      const peak = 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    // Close the context once the sound finishes so we don't leak.
    setTimeout(() => { try { ctx.close(); } catch {} }, 1000);
  } catch {
    // Autoplay block or no audio support — no-op.
  }
}

/**
 * Fire `count` particles + a short chime. Defaults are tuned for a single
 * goal-hit moment; pass `count: 30` for a bigger burst.
 */
export function celebrate(count = 18) {
  if (typeof document === 'undefined') return;
  chime();
  injectStyleOnce();

  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);

  // Deterministic-ish randomness: we mix Math.random for spread but Math.random
  // is fine here since this is a celebratory burst, not test logic.
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'kindling-confetti-particle';
    p.textContent = EMOJIS[i % EMOJIS.length];
    // Spread the starting positions across the top of the viewport instead of
    // all dropping from the centre — feels more like a burst, less like a fountain.
    const startX = (Math.random() * 100) - 50; // -50% .. +50% of viewport width
    const dx = (Math.random() * 200) - 100;    // drift
    const spin = (Math.random() * 720) - 360;
    const dur = 2.2 + Math.random() * 1.4;
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--spin', `${spin}deg`);
    p.style.setProperty('--dur', `${dur}s`);
    p.style.transform = `translateX(${startX}vw)`;
    container.appendChild(p);
  }

  // Garbage-collect once the longest particle finishes (~3.6s).
  setTimeout(() => container.remove(), 4000);
}

// ─── Daily goal-hit tracker ────────────────────────────────────────────────
//
// We only want to celebrate once per day, on the FIRST crossing of the goal.
// We persist the last-celebrated YYYY-MM-DD to localStorage.

const KEY = 'kindling-goal-celebrated';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns true and persists today's date the FIRST time it's called today. */
export function markGoalCelebrated(): boolean {
  try {
    if (localStorage.getItem(KEY) === today()) return false;
    localStorage.setItem(KEY, today());
    return true;
  } catch {
    return false;
  }
}
