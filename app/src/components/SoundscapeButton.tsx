import { useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';

/**
 * Tiny built-in soundscape generator. No audio files — we generate noise +
 * a low-pass filter live with the Web Audio API. Three modes:
 *   - rain:    white noise → low-pass → gain (sounds like steady rain)
 *   - brown:   brown noise → gentle low-pass (deep, calming "rumble")
 *   - cafe:    pink noise + 60Hz tone (soft hum like a coffee shop)
 *
 * Volume + selection are local state. Cleaned up when component unmounts.
 */
type Mode = 'off' | 'rain' | 'brown' | 'cafe';

export default function SoundscapeButton() {
  const [mode, setMode] = useState<Mode>('off');
  const [vol, setVol] = useState(0.4);
  const [open, setOpen] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{ source?: AudioBufferSourceNode; filter?: BiquadFilterNode; gain?: GainNode; osc?: OscillatorNode }>({});

  const stop = () => {
    try {
      nodesRef.current.source?.stop();
      nodesRef.current.osc?.stop();
    } catch {}
    nodesRef.current = {};
  };

  useEffect(() => () => stop(), []);

  useEffect(() => {
    stop();
    if (mode === 'off') return;
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current!;
    // Re-create a 2-second noise loop
    const sampleRate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const data = buf.getChannelData(0);
    if (mode === 'brown') {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    } else if (mode === 'cafe') {
      // Pink-ish noise via Voss algorithm (cheap)
      const rows = 16;
      const arr = new Array(rows).fill(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < rows; j++) {
          if (Math.random() < 1 / rows) {
            sum -= arr[j];
            arr[j] = Math.random() * 2 - 1;
            sum += arr[j];
          }
        }
        data[i] = sum / rows;
      }
    } else {
      // White noise (rain)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = mode === 'rain' ? 2200 : mode === 'brown' ? 380 : 1500;
    filter.Q.value = 0.4;

    const gain = ctx.createGain();
    gain.gain.value = vol;

    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    nodesRef.current = { source, filter, gain };

    if (mode === 'cafe') {
      // Add a tiny 60Hz hum for café warmth
      const osc = ctx.createOscillator();
      osc.frequency.value = 60;
      const oscGain = ctx.createGain();
      oscGain.gain.value = vol * 0.08;
      osc.connect(oscGain).connect(ctx.destination);
      osc.start();
      nodesRef.current.osc = osc;
    }

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Volume changes without restarting the source
  useEffect(() => {
    if (nodesRef.current.gain) nodesRef.current.gain.gain.value = vol;
  }, [vol]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={mode === 'off' ? 'Soundscape' : `Soundscape: ${mode}`}
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
          mode === 'off' ? 'text-[var(--text-muted)] hover:bg-[var(--hover)]' : 'text-[var(--accent)] bg-[var(--accent)]/10'
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {mode === 'off' ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        <Music className="w-3 h-3" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full right-0 mb-1 w-48 bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden">
          {(['off', 'rain', 'brown', 'cafe'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); }}
              className={`block w-full text-left px-3 py-1.5 text-xs ${
                mode === m ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              }`}
              role="menuitemradio"
              aria-checked={mode === m}
            >
              {m === 'off' ? 'Off' : m === 'rain' ? '🌧 Steady rain' : m === 'brown' ? '🌊 Deep rumble' : '☕ Café hum'}
            </button>
          ))}
          {mode !== 'off' && (
            <div className="px-3 py-2 border-t border-[var(--border)]">
              <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">Volume</div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vol}
                onChange={(e) => setVol(Number(e.target.value))}
                className="w-full accent-[var(--accent)]"
                aria-label="Soundscape volume"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
