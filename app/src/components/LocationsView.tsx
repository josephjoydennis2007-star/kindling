import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Trash2, Camera, ExternalLink, DollarSign, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

/**
 * LocationsView — production scouting workspace for the director.
 *
 * A flat list of physical locations the production needs. For each:
 *   - Name + address + scout photos (data URLs)
 *   - INT/EXT + day/night
 *   - Permit + access notes
 *   - Cost estimate
 *   - Linked scenes (referenced by slug, not enforced)
 *
 * Stored on screenplay.locations as a JSON-serializable array. Distinct
 * from the per-scene SLUG line in the writer's editor — this is the
 * production side of "we actually need to film here on these dates."
 */

interface Location {
  id: string;
  name: string;
  address: string;
  intExt: 'int' | 'ext' | 'both';
  timeOfDay: 'day' | 'night' | 'both';
  notes: string;
  permitStatus: 'unknown' | 'inquired' | 'granted' | 'denied';
  cost: string;          // free-text so user can type any currency
  photos: string[];      // data URLs
  linkedSceneIds: string[];
}

function loadLocations(raw: unknown): Location[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x: any): x is Location => x && typeof x === 'object' && typeof x.name === 'string');
}

const PERMIT_COLORS: Record<Location['permitStatus'], string> = {
  unknown: '#6b7280',
  inquired: '#c89651',
  granted: '#5c8b7e',
  denied: '#9c4736',
};

export default function LocationsView() {
  const screenplay = useAppStore((s) => s.screenplay);
  const scenes = useAppStore((s) => s.scenes);
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);

  const [locations, setLocations] = useState<Location[]>(loadLocations((screenplay as any).locations));
  const [activeId, setActiveId] = useState<string | null>(locations[0]?.id ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = locations.find((l) => l.id === activeId) ?? null;

  const persist = (next: Location[]) => {
    setLocations(next);
    updateScreenplayField('locations' as any, next);
  };

  const addLocation = () => {
    const id = `loc_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const loc: Location = {
      id, name: 'New location', address: '', intExt: 'int', timeOfDay: 'day',
      notes: '', permitStatus: 'unknown', cost: '', photos: [], linkedSceneIds: [],
    };
    persist([loc, ...locations]);
    setActiveId(id);
  };

  const updateActive = (patch: Partial<Location>) => {
    if (!active) return;
    persist(locations.map((l) => (l.id === active.id ? { ...l, ...patch } : l)));
  };

  const deleteActive = () => {
    if (!active) return;
    if (!confirm(`Delete "${active.name}"?`)) return;
    const next = locations.filter((l) => l.id !== active.id);
    persist(next);
    setActiveId(next[0]?.id ?? null);
    toast.success('Deleted');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !active) return;
    if (!file.type.startsWith('image/')) { toast.error('Only image files'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      updateActive({ photos: [...active.photos, reader.result as string] });
      toast.success('Photo added');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (idx: number) => {
    if (!active) return;
    updateActive({ photos: active.photos.filter((_, i) => i !== idx) });
  };

  const toggleScene = (sceneId: string) => {
    if (!active) return;
    const has = active.linkedSceneIds.includes(sceneId);
    updateActive({
      linkedSceneIds: has
        ? active.linkedSceneIds.filter((s) => s !== sceneId)
        : [...active.linkedSceneIds, sceneId],
    });
  };

  const totalEstimate = useMemo(() => {
    return locations.reduce((acc, l) => {
      const n = parseFloat(l.cost.replace(/[^0-9.]/g, ''));
      return acc + (isFinite(n) ? n : 0);
    }, 0);
  }, [locations]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex"
    >
      {/* Left list */}
      <aside className="w-[300px] border-r border-[var(--rule)] flex flex-col bg-[var(--panel)]">
        <header className="p-3 border-b border-[var(--rule)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              Locations
            </h2>
          </div>
          <button
            onClick={addLocation}
            title="Add location"
            className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </header>

        <div className="px-3 py-2 border-b border-[var(--rule)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
          <span>{locations.length} location{locations.length === 1 ? '' : 's'}</span>
          {totalEstimate > 0 && <span>Est. ${totalEstimate.toLocaleString()}</span>}
        </div>

        <div className="flex-1 overflow-y-auto">
          {locations.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] px-4">
              No locations yet. Add the first place you need to shoot.
            </div>
          ) : (
            locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setActiveId(loc.id)}
                className={`w-full text-left px-3 py-2 border-b border-[var(--rule)] transition-colors ${
                  loc.id === activeId ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[var(--text)] truncate flex-1">{loc.name}</span>
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: PERMIT_COLORS[loc.permitStatus] }}
                    title={`Permit: ${loc.permitStatus}`}
                  />
                </div>
                <div className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                  {loc.address || 'No address'} · {loc.intExt.toUpperCase()} · {loc.timeOfDay}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Detail */}
      <main className="flex-1 overflow-y-auto">
        {!active ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] px-6 text-center">
            <MapPin className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Pick or add a location to start scouting.</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto p-6 sm:p-10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-widest font-bold text-[var(--text-muted)]">
                Location
              </span>
              <button
                onClick={deleteActive}
                title="Delete location"
                className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              value={active.name}
              onChange={(e) => updateActive({ name: e.target.value })}
              className="w-full bg-transparent border-0 text-2xl font-display font-bold text-[var(--text)] focus:outline-none mb-3"
              placeholder="Location name…"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  Address
                </label>
                <input
                  value={active.address}
                  onChange={(e) => updateActive({ address: e.target.value })}
                  className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="123 Sunset Blvd, Los Angeles"
                />
                {active.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(active.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-0.5 mt-1"
                  >
                    Open in maps <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  <DollarSign className="w-3 h-3 inline" /> Cost estimate
                </label>
                <input
                  value={active.cost}
                  onChange={(e) => updateActive({ cost: e.target.value })}
                  className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                  placeholder="$1,500/day"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  Type
                </label>
                <div className="flex gap-1">
                  {(['int', 'ext', 'both'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => updateActive({ intExt: v })}
                      className={`flex-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1.5 rounded-md transition-colors ${
                        active.intExt === v
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                          : 'bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  Time
                </label>
                <div className="flex gap-1">
                  {(['day', 'night', 'both'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => updateActive({ timeOfDay: v })}
                      className={`flex-1 text-[10px] uppercase tracking-wider font-bold px-2 py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${
                        active.timeOfDay === v
                          ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                          : 'bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {v === 'day' ? <Sun className="w-3 h-3" /> : v === 'night' ? <Moon className="w-3 h-3" /> : null}
                      {v.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  Permit
                </label>
                <select
                  value={active.permitStatus}
                  onChange={(e) => updateActive({ permitStatus: e.target.value as Location['permitStatus'] })}
                  className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="unknown">Unknown</option>
                  <option value="inquired">Inquired</option>
                  <option value="granted">Granted</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
            </div>

            {/* Photos */}
            <section className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">
                  Scout photos
                </label>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:text-[var(--text)]"
                >
                  <Camera className="w-3 h-3" /> Upload photo
                </button>
              </div>
              {active.photos.length === 0 ? (
                <div className="text-xs text-[var(--text-muted)] py-4 text-center border border-dashed border-[var(--rule)] rounded-md">
                  No photos yet.
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {active.photos.map((src, i) => (
                    <div key={i} className="relative group bg-[var(--card)] border border-[var(--rule)] rounded-md overflow-hidden">
                      <img src={src} alt={`Scout ${i + 1}`} className="w-full aspect-video object-cover" />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Notes */}
            <section className="mb-4">
              <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                Notes
              </label>
              <textarea
                value={active.notes}
                onChange={(e) => updateActive({ notes: e.target.value })}
                rows={4}
                placeholder="Parking availability, access hours, neighbor concerns, sound considerations, contact name + phone…"
                className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] resize-y focus:outline-none focus:border-[var(--accent)]"
              />
            </section>

            {/* Linked scenes */}
            {scenes.length > 0 && (
              <section className="mb-4">
                <label className="block text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)] mb-1">
                  Used by scenes
                </label>
                <div className="flex flex-wrap gap-1">
                  {scenes.map((sc) => {
                    const on = active.linkedSceneIds.includes(sc.id);
                    return (
                      <button
                        key={sc.id}
                        onClick={() => toggleScene(sc.id)}
                        className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${
                          on
                            ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                            : 'bg-[var(--card)] border border-[var(--rule)] text-[var(--text-secondary)] hover:bg-[var(--hover)]'
                        }`}
                      >
                        {sc.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoUpload}
      />
    </motion.div>
  );
}
