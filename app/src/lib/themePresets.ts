/**
 * Theme presets — apply with one click. Each preset is a partial AppSettings
 * patch. The custom-theme renderer in App.tsx already takes these vars and
 * pumps them through the CSS variable system, so a preset just becomes a
 * single updateSettings({...preset}) call.
 */

import type { AppSettings } from '@/types';

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  preview: { bg: string; accent: string; text: string };
  patch: Partial<AppSettings>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Inky black with electric violet accents.',
    preview: { bg: '#0a0a14', accent: '#a78bfa', text: '#e8e8f4' },
    patch: {
      theme: 'custom',
      bgColor: '#0a0a14',
      sidebarColor: '#11111f',
      panelColor: '#161624',
      borderColor: '#24243a',
      textColor: '#e8e8f4',
      textSecondaryColor: '#9a9ab0',
      primaryColor: '#7c3aed',
      accentColor: '#a78bfa',
    },
  },
  {
    id: 'daylight',
    label: 'Daylight',
    description: 'Crisp paper-white with editorial blue.',
    preview: { bg: '#f7f8fb', accent: '#2563eb', text: '#0f172a' },
    patch: {
      theme: 'custom',
      bgColor: '#f7f8fb',
      sidebarColor: '#eef0f5',
      panelColor: '#ffffff',
      borderColor: '#dbe0e8',
      textColor: '#0f172a',
      textSecondaryColor: '#475569',
      primaryColor: '#2563eb',
      accentColor: '#3b82f6',
    },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Warm dusk gradient with peach accents.',
    preview: { bg: '#1c1117', accent: '#fb923c', text: '#fce7d8' },
    patch: {
      theme: 'custom',
      bgColor: '#1c1117',
      sidebarColor: '#241623',
      panelColor: '#2c1c28',
      borderColor: '#42273a',
      textColor: '#fce7d8',
      textSecondaryColor: '#d4a98a',
      primaryColor: '#f97316',
      accentColor: '#fb923c',
    },
  },
];
