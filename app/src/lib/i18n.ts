/**
 * Tiny, zero-dependency i18n. Lookups are keyed strings ("tab.writer", "btn.save",
 * etc.). If a key is missing in the chosen locale we fall back to English.
 *
 * Read the locale from `useAppStore.getState().settings.locale`. The translate
 * helper takes the locale as an argument so call sites stay reactive.
 */

import { useAppStore } from '@/store/useAppStore';

export type Locale = 'en' | 'es' | 'fr';

type Dict = Record<string, string>;

const EN: Dict = {
  // tabs
  'tab.dashboard': 'Home',
  'tab.writer':    'Writer',
  'tab.director':  'Director',
  'tab.plot':      'Plot',
  'tab.calendar':  'Calendar',
  'tab.workspace': 'Workspace',
  // sidebar
  'sb.stories':       'Stories',
  'sb.new_story':     'New story',
  'sb.instructions':  'Instructions',
  'sb.notes':         'Notes',
  'sb.characters':    'Characters',
  'sb.history':       'History',
  'sb.collaborate':   'Collaborate',
  'sb.ai_helper':     'AI Helper',
  'sb.assets':        'Assets',
  'sb.app_settings':  'App Settings',
  'sb.export':        'Export',
  'sb.import':        'Import',
  'sb.local_profile': 'Local profile',
  'sb.account':       'Account',
  'sb.sign_out':      'Sign out',
  'sb.reset_session': 'Reset session',
  // buttons
  'btn.save':         'Save',
  'btn.cancel':       'Cancel',
  'btn.add':          'Add',
  'btn.delete':       'Delete',
  'btn.export':       'Export',
  'btn.focus':        'Focus',
  'btn.send':         'Send',
  'btn.reports':      'Reports',
};

const ES: Dict = {
  'tab.dashboard': 'Inicio',
  'tab.writer':    'Escritor',
  'tab.director':  'Director',
  'tab.plot':      'Trama',
  'tab.calendar':  'Calendario',
  'tab.workspace': 'Espacio',
  'sb.stories':       'Historias',
  'sb.new_story':     'Nueva historia',
  'sb.instructions':  'Instrucciones',
  'sb.notes':         'Notas',
  'sb.characters':    'Personajes',
  'sb.history':       'Historial',
  'sb.collaborate':   'Colaborar',
  'sb.ai_helper':     'Asistente IA',
  'sb.assets':        'Recursos',
  'sb.app_settings':  'Ajustes',
  'sb.export':        'Exportar',
  'sb.import':        'Importar',
  'sb.local_profile': 'Perfil local',
  'sb.account':       'Cuenta',
  'sb.sign_out':      'Cerrar sesión',
  'sb.reset_session': 'Reiniciar sesión',
  'btn.save':         'Guardar',
  'btn.cancel':       'Cancelar',
  'btn.add':          'Añadir',
  'btn.delete':       'Eliminar',
  'btn.export':       'Exportar',
  'btn.focus':        'Enfocar',
  'btn.send':         'Enviar',
  'btn.reports':      'Informes',
};

const FR: Dict = {
  'tab.dashboard': 'Accueil',
  'tab.writer':    'Écriture',
  'tab.director':  'Réalisation',
  'tab.plot':      'Trame',
  'tab.calendar':  'Calendrier',
  'tab.workspace': 'Atelier',
  'sb.stories':       'Histoires',
  'sb.new_story':     'Nouvelle histoire',
  'sb.instructions':  'Instructions',
  'sb.notes':         'Notes',
  'sb.characters':    'Personnages',
  'sb.history':       'Historique',
  'sb.collaborate':   'Collaborer',
  'sb.ai_helper':     'Assistant IA',
  'sb.assets':        'Médias',
  'sb.app_settings':  'Paramètres',
  'sb.export':        'Exporter',
  'sb.import':        'Importer',
  'sb.local_profile': 'Profil local',
  'sb.account':       'Compte',
  'sb.sign_out':      'Déconnexion',
  'sb.reset_session': 'Réinitialiser la session',
  'btn.save':         'Enregistrer',
  'btn.cancel':       'Annuler',
  'btn.add':          'Ajouter',
  'btn.delete':       'Supprimer',
  'btn.export':       'Exporter',
  'btn.focus':        'Focus',
  'btn.send':         'Envoyer',
  'btn.reports':      'Rapports',
};

const DICTS: Record<Locale, Dict> = { en: EN, es: ES, fr: FR };

/** Translate by key. Argument is optional — defaults to current store locale. */
export function t(key: string, locale?: Locale): string {
  const lang = locale || ((useAppStore.getState().settings as any).locale as Locale) || 'en';
  return DICTS[lang]?.[key] || EN[key] || key;
}

export function localeName(loc: Locale): string {
  return loc === 'en' ? 'English' : loc === 'es' ? 'Español' : 'Français';
}

export const LOCALES: Locale[] = ['en', 'es', 'fr'];
