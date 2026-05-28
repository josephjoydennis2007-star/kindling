import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import type { Character } from '@/types';

interface MentionListProps {
  characters: Character[];
  onSelect: (char: Character) => void;
  command: any;
  rect: { left: number; bottom: number; top: number } | null;
}

export default function MentionList({ characters, onSelect, command, rect }: MentionListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [characters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!characters.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % characters.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + characters.length) % characters.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (characters[selectedIndex]) handleSelect(characters[selectedIndex]);
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [characters, selectedIndex, command]);

  useEffect(() => {
    const el = containerRef.current?.children[selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = (char: Character) => {
    if (command) command({ id: char.id, label: char.name });
    onSelect(char);
  };

  if (!characters.length || !rect) return null;

  // Position below the caret, flipping above if near the bottom of the viewport.
  const estimatedHeight = Math.min(characters.length * 52 + 8, 260);
  const spaceBelow = window.innerHeight - rect.bottom;
  const showAbove = spaceBelow < estimatedHeight + 12;
  const top = showAbove ? rect.top - estimatedHeight - 6 : rect.bottom + 6;
  const left = Math.min(rect.left, window.innerWidth - 240);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: showAbove ? 5 : -5, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="mention-dropdown"
      style={{ position: 'fixed', top, left }}
    >
      {characters.map((char, index) => (
        <div
          key={char.id}
          className={`mention-option ${index === selectedIndex ? 'active' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); handleSelect(char); }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="opt-avatar" style={{ background: char.image ? 'transparent' : char.color }}>
            {char.image ? <img src={char.image} alt={char.name} /> : char.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[var(--text)] truncate">{char.name}</div>
            {char.description && (
              <div className="text-[10px] text-[var(--text-muted)] truncate">{char.description}</div>
            )}
          </div>
          <User className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
        </div>
      ))}
    </motion.div>
  );
}
