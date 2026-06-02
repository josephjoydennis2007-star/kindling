import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Globe2, Plus, Trash2, MapPin, BookOpen, ScrollText, Users2, Cog, Lightbulb, Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';

/**
 * WorldView — the worldbuilding wiki workspace.
 *
 * Stores a flat list of "world items" categorized into Locations, Lore,
 * Rules, Factions, Items, and Terms. Designed so a writer can build up
 * the universe of their story in one place — separate from the characters
 * (which have their own deeper editor) and the script itself.
 *
 * Data shape (persisted on screenplay.world as a string[] of JSON blobs
 * so we don't need a schema migration): { id, kind, name, body, tags }.
 */

const KINDS = [
  { id: 'location',  label: 'Location',  icon: MapPin,    color: '#5c8b7e' },
  { id: 'lore',      label: 'Lore',      icon: ScrollText, color: '#a45a9c' },
  { id: 'rule',      label: 'Rule',      icon: Cog,       color: '#c89651' },
  { id: 'faction',   label: 'Faction',   icon: Users2,    color: '#7a82c4' },
  { id: 'item',      label: 'Item',      icon: BookOpen,  color: '#9c4736' },
  { id: 'term',      label: 'Term',      icon: Lightbulb, color: '#5b7bb3' },
] as const;

type WorldKind = typeof KINDS[number]['id'];
interface WorldItem {
  id: string;
  kind: WorldKind;
  name: string;
  body: string;
  tags: string[];
}

function loadItems(raw: unknown): WorldItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x: any): x is WorldItem => x && typeof x === 'object' && typeof x.name === 'string');
}

export default function WorldView() {
  const screenplay = useAppStore((s) => s.screenplay);
  const updateScreenplayField = useAppStore((s) => s.updateScreenplayField);

  const [items, setItems] = useState<WorldItem[]>(loadItems((screenplay as any).world));
  const [filter, setFilter] = useState<WorldKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== 'all' && it.kind !== filter) return false;
      if (!needle) return true;
      return (
        it.name.toLowerCase().includes(needle) ||
        it.body.toLowerCase().includes(needle) ||
        it.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [items, filter, search]);

  const active = items.find((it) => it.id === activeId) || filtered[0] || null;

  const persist = (next: WorldItem[]) => {
    setItems(next);
    updateScreenplayField('world' as any, next);
  };

  const addItem = (kind: WorldKind) => {
    const id = `w_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    const name = KINDS.find((k) => k.id === kind)?.label || 'New item';
    const next: WorldItem = { id, kind, name: `New ${name.toLowerCase()}`, body: '', tags: [] };
    persist([next, ...items]);
    setActiveId(id);
  };

  const updateActive = (patch: Partial<WorldItem>) => {
    if (!active) return;
    persist(items.map((it) => (it.id === active.id ? { ...it, ...patch } : it)));
  };

  const deleteActive = () => {
    if (!active) return;
    if (!confirm(`Delete "${active.name}"?`)) return;
    const next = items.filter((it) => it.id !== active.id);
    persist(next);
    setActiveId(next[0]?.id ?? null);
    toast.success('Deleted');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full flex"
    >
      {/* Left rail: filters + list */}
      <aside className="w-[280px] border-r border-[var(--rule)] flex flex-col bg-[var(--panel)]">
        <header className="p-3 border-b border-[var(--rule)]">
          <div className="flex items-center gap-2 mb-2">
            <Globe2 className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-xs uppercase tracking-widest font-bold text-[var(--text-secondary)]">
              World wiki
            </h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2 w-3 h-3 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items, tags, descriptions…"
              className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md pl-7 pr-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </header>

        {/* Kind filters */}
        <div className="px-2 py-2 border-b border-[var(--rule)] flex flex-wrap gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md transition-colors ${
              filter === 'all'
                ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
            }`}
          >
            All
          </button>
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setFilter(k.id)}
              className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md transition-colors ${
                filter === k.id
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {/* Add buttons */}
        <div className="px-2 py-2 border-b border-[var(--rule)] grid grid-cols-3 gap-1">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => addItem(k.id)}
              title={`Add ${k.label}`}
              className="flex flex-col items-center gap-0.5 py-1.5 rounded-md text-[10px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
            >
              <k.icon className="w-3.5 h-3.5" style={{ color: k.color }} />
              <span>{k.label}</span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] px-4">
              No world items yet. Add a Location, Lore, or Rule above.
            </div>
          ) : (
            filtered.map((it) => {
              const meta = KINDS.find((k) => k.id === it.kind)!;
              const isActive = it.id === activeId;
              return (
                <button
                  key={it.id}
                  onClick={() => setActiveId(it.id)}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--rule)] transition-colors ${
                    isActive ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <meta.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} />
                    <span className="text-xs font-medium text-[var(--text)] truncate flex-1">
                      {it.name || `Untitled ${meta.label.toLowerCase()}`}
                    </span>
                  </div>
                  {it.body && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-1 line-clamp-1">{it.body}</p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right: detail editor */}
      <main className="flex-1 overflow-y-auto">
        {!active ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] px-6 text-center">
            <Globe2 className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">Pick or create a world item to start writing about it.</p>
            <button
              onClick={() => addItem('location')}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              <Plus className="w-3.5 h-3.5" /> Add a location
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto p-6 sm:p-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[var(--text-muted)]">
                {(() => {
                  const meta = KINDS.find((k) => k.id === active.kind)!;
                  return (
                    <>
                      <meta.icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
                      {meta.label}
                    </>
                  );
                })()}
              </div>
              <button
                onClick={deleteActive}
                title="Delete this item"
                className="text-[var(--text-muted)] hover:text-[var(--danger)] p-1 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={active.name}
              onChange={(e) => updateActive({ name: e.target.value })}
              className="w-full bg-transparent border-0 text-2xl font-display font-bold text-[var(--text)] focus:outline-none mb-3"
              placeholder="Name…"
            />
            <input
              type="text"
              value={active.tags.join(', ')}
              onChange={(e) => updateActive({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              placeholder="Tags (comma separated)"
              className="w-full bg-transparent border-0 border-b border-[var(--rule)] text-xs text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] pb-1 mb-4"
            />
            <textarea
              value={active.body}
              onChange={(e) => updateActive({ body: e.target.value })}
              rows={20}
              placeholder="Describe this item — geography, history, rules, relationships…"
              className="w-full bg-[var(--card)] border border-[var(--rule)] rounded-md px-3 py-2 text-sm text-[var(--text)] resize-y focus:outline-none focus:border-[var(--accent)] font-serif leading-relaxed"
            />
          </div>
        )}
      </main>
    </motion.div>
  );
}
