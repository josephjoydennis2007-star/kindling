import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import type { Character } from '@/types';

interface CharacterWorkspacePanelProps {
  character: Character | null;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Character>) => void;
}

export default function CharacterWorkspacePanel({ character, onClose, onUpdate }: CharacterWorkspacePanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    profile: true,
    psychology: true,
    relationships: false,
    plot: false,
    notes: false,
  });

  if (!character) return null;

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (field: keyof Character, value: any) => {
    onUpdate(character.id, { [field]: value });
  };

  const sections = [
    {
      key: 'profile',
      label: 'Profile',
      fields: [
        { label: 'Full Name', key: 'name', value: character.name },
        { label: 'Display Name', key: 'displayName', value: character.displayName },
        { label: 'Age', key: 'age', value: character.age },
        { label: 'Occupation', key: 'occupation', value: character.occupation },
        { label: 'Pronouns', key: 'pronouns', value: character.pronouns || '' },
      ],
    },
    {
      key: 'psychology',
      label: 'Psychology & Drive',
      fields: [
        { label: 'Archetype', key: 'archetype', value: character.archetype || '' },
        { label: 'Want (Conscious)', key: 'want', value: character.want || '', type: 'textarea' },
        { label: 'Need (Unconscious)', key: 'need', value: character.need || '', type: 'textarea' },
        { label: 'Fear / Wound', key: 'fear', value: character.fear || '', type: 'textarea' },
        { label: 'Secret', key: 'secret', value: character.secret || '', type: 'textarea' },
      ],
    },
    {
      key: 'relationships',
      label: 'Relationships & Bonds',
      fields: [
        { label: 'Relationships', key: 'relationships', value: character.relationships || '', type: 'textarea' },
      ],
    },
    {
      key: 'plot',
      label: 'Plot & Conflict',
      fields: [
        { label: 'Goals', key: 'goals', value: character.goals || '', type: 'textarea' },
        { label: 'Motivation', key: 'motivation', value: character.motivation || '', type: 'textarea' },
        { label: 'Conflict', key: 'conflict', value: character.conflict || '', type: 'textarea' },
      ],
    },
    {
      key: 'notes',
      label: 'Background & Notes',
      fields: [
        { label: 'Backstory', key: 'backstory', value: character.backstory || '', type: 'textarea' },
        { label: 'Personality', key: 'personality', value: character.personality || '', type: 'textarea' },
        { label: 'Voice / Speech', key: 'voiceOf', value: character.voiceOf || '', type: 'textarea' },
        { label: 'Notes', key: 'notes', value: character.notes || '', type: 'textarea' },
      ],
    },
  ];

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="w-72 bg-[var(--panel)] border-l border-[var(--border)] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--border)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden"
            style={{ background: character.image ? 'transparent' : character.color }}
          >
            {character.image ? (
              <img src={character.image} alt={character.name} className="w-full h-full object-cover" />
            ) : (
              character.name.charAt(0)
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-[var(--text)] truncate">{character.name}</div>
            {character.age && <div className="text-[10px] text-[var(--text-muted)]">{character.age} yrs old</div>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors flex-shrink-0"
          title="Close character panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sections.map((section) => (
          <div key={section.key} className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center justify-between p-2.5 hover:bg-[var(--hover)] transition-colors"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {section.label}
              </span>
              {expandedSections[section.key] ? (
                <ChevronUp className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              )}
            </button>

            <AnimatePresence>
              {expandedSections[section.key] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-[var(--border)] p-2.5 space-y-2.5"
                >
                  {section.fields.map((field) => (
                    <div key={field.key}>
                      <label className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)] block mb-1">
                        {field.label}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={(character as any)[field.key] || ''}
                          onChange={(e) => updateField(field.key as keyof Character, e.target.value)}
                          placeholder={`Enter ${field.label.toLowerCase()}…`}
                          className="w-full min-h-[60px] p-1.5 bg-[var(--bg)] border border-[var(--border)] rounded text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={(character as any)[field.key] || ''}
                          onChange={(e) => updateField(field.key as keyof Character, e.target.value)}
                          placeholder={`Enter ${field.label.toLowerCase()}…`}
                          className="w-full px-2 py-1 bg-[var(--bg)] border border-[var(--border)] rounded text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
                        />
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border)] p-3 flex gap-2 flex-shrink-0">
        <button
          onClick={() => {
            const summary = `${character.name} (${character.age || 'age unknown'}) - ${character.occupation || 'no occupation listed'}\n\nWant: ${character.want || 'n/a'}\nNeed: ${character.need || 'n/a'}`;
            navigator.clipboard.writeText(summary);
          }}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded text-[10px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          title="Copy character summary to clipboard"
        >
          <Copy className="w-3 h-3" />
          Copy
        </button>
      </div>
    </motion.div>
  );
}
