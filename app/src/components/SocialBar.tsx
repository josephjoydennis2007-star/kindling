import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coffee,
  ChevronUp,
  X,
  Lock,
  Compass,
  Globe,
  Image as ImageIcon,
  MessageCircle,
  Film,
  Music2,
  Briefcase,
  Newspaper,
  Search,
} from 'lucide-react';

interface Props {
  enabled: boolean;
  onDisable?: () => void;
  onActivity?: (site: string) => void; // admin notification hook
}

type Site = { id: string; label: string; url: string; svg: string; color: string; group: 'video' | 'social' | 'community' | 'create' | 'inspire' | 'music' };

const SITES: Site[] = [
  // VIDEO
  { id: 'youtube',   label: 'YouTube',   url: 'https://www.youtube.com',   color: '#FF0000', group: 'video',
    svg: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.4 3.5 12 3.5 12 3.5s-7.4 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c2 .6 9.4.6 9.4.6s7.4 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z' },
  { id: 'vimeo',     label: 'Vimeo',     url: 'https://vimeo.com',         color: '#19B7EA', group: 'video',
    svg: 'M23.98 6.34c-.1 2.34-1.73 5.55-4.9 9.62-3.27 4.27-6.04 6.4-8.3 6.4-1.4 0-2.59-1.3-3.55-3.88L5.31 9.1c-.71-2.58-1.48-3.88-2.3-3.88-.18 0-.81.38-1.88 1.13l-1.13-1.45C1.39 4 2.5 3 3.6 2c1.5-1.32 2.65-2 3.4-2.07 1.79-.17 2.9 1.06 3.34 3.7.47 2.84.8 4.6.97 5.28.53 2.39 1.1 3.58 1.72 3.58.49 0 1.22-.77 2.2-2.32.97-1.55 1.5-2.73 1.55-3.55.13-1.27-.36-1.9-1.55-1.9-.56 0-1.13.13-1.72.4.97-3.18 2.83-4.72 5.57-4.63 2.04.06 3 1.38 2.9 3.96z' },
  { id: 'tiktok',    label: 'TikTok',    url: 'https://www.tiktok.com',    color: '#69C9D0', group: 'video',
    svg: 'M19.6 5.8a5.7 5.7 0 0 1-3.4-3.5h-3.4v13.2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3c.3 0 .7 0 1 .2v-3.6a6.6 6.6 0 0 0-1-.1 6.5 6.5 0 0 0 0 13 6.5 6.5 0 0 0 6.5-6.5V8.7a9 9 0 0 0 5.4 1.8V7a5.8 5.8 0 0 1-2.1-1.2z' },
  { id: 'twitch',    label: 'Twitch',    url: 'https://www.twitch.tv',     color: '#9146FF', group: 'video',
    svg: 'M2.1 0 .5 4v17h6v3h3l3-3h5l5-5V0H2.1zM21 13l-3 3h-5l-3 3v-3H5V2h16v11zM18 5h-3v6h3V5zM12 5H9v6h3V5z' },
  { id: 'letterboxd',label: 'Letterboxd',url: 'https://letterboxd.com',    color: '#00d735', group: 'video',
    svg: 'M3.6 12a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 0 0-7.2 0zm13.6 0a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 0 0-7.2 0z' },

  // SOCIAL
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com', color: '#E1306C', group: 'social',
    svg: 'M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.4 2.23.07 1.26.08 1.64.08 4.85s0 3.6-.07 4.85c-.05 1.17-.25 1.8-.42 2.23a3.8 3.8 0 0 1-.9 1.38c-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.4-1.26.07-1.64.08-4.85.08s-3.6 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.42a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.4-2.23C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.5 0-4.74.07-1.07.05-1.66.23-2.05.38a3.6 3.6 0 0 0-1.3.85 3.6 3.6 0 0 0-.85 1.3c-.15.4-.33.98-.38 2.05C2.6 9.85 2.6 10.2 2.6 12s0 2.15.07 3.39c.05 1.07.23 1.66.38 2.05a3.6 3.6 0 0 0 .85 1.3 3.6 3.6 0 0 0 1.3.85c.4.15.98.33 2.05.38 1.24.07 1.6.07 4.74.07s3.5 0 4.74-.07c1.07-.05 1.66-.23 2.05-.38a3.6 3.6 0 0 0 1.3-.85c.38-.4.62-.78.85-1.3.15-.4.33-.98.38-2.05.07-1.24.07-1.6.07-3.39s0-2.15-.07-3.39c-.05-1.07-.23-1.66-.38-2.05a3.6 3.6 0 0 0-.85-1.3 3.6 3.6 0 0 0-1.3-.85c-.4-.15-.98-.33-2.05-.38C15.5 4 15.15 4 12 4zm0 3.06A4.94 4.94 0 1 1 12 17a4.94 4.94 0 0 1 0-9.94zm0 8.14a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm6.3-8.34a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z' },
  { id: 'twitter',   label: 'X',         url: 'https://twitter.com',       color: '#FFFFFF', group: 'social',
    svg: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  { id: 'facebook',  label: 'Facebook',  url: 'https://facebook.com',      color: '#1877F2', group: 'social',
    svg: 'M24 12a12 12 0 1 0-13.9 11.9V15.5H7.1V12h3v-2.6c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z' },
  { id: 'pinterest', label: 'Pinterest', url: 'https://www.pinterest.com', color: '#E60023', group: 'social',
    svg: 'M12 0a12 12 0 0 0-4.4 23.2c-.1-1-.2-2.5 0-3.5l1.5-6.5s-.4-.8-.4-2c0-1.8 1-3.2 2.4-3.2 1.1 0 1.6.8 1.6 1.8 0 1.1-.7 2.8-1.1 4.4-.3 1.3.7 2.4 2 2.4 2.4 0 4.2-2.5 4.2-6.2 0-3.2-2.3-5.5-5.6-5.5-3.8 0-6.1 2.9-6.1 5.9 0 1.2.4 2.4 1 3.1.1.1.1.2.1.4l-.4 1.5c-.1.3-.2.3-.5.2-2-1-3.3-3.9-3.3-6.3 0-5.1 3.7-9.8 10.7-9.8 5.6 0 10 4 10 9.4 0 5.6-3.5 10.1-8.4 10.1a4.3 4.3 0 0 1-3.7-1.9l-1 3.9c-.4 1.4-1.4 3.1-2 4.2A12 12 0 1 0 12 0z' },
  { id: 'snapchat',  label: 'Snapchat',  url: 'https://www.snapchat.com',  color: '#FFFC00', group: 'social',
    svg: 'M12.2 0c4 0 7 2.6 7 6.7v3.2c1.5.7 2.2 1 2.5 1.5.4.7-.7 1.6-2.4 2.2-.4.2-1.4.5-1.7.9-.2.4-.3 1.4 1.3 1.7 2 .5 2.6 1.3 2.6 1.7 0 .8-2.6 1.3-3.6 1.5-.2.5-.4 1.2-.6 1.5-.4.5-.9.4-2 .4-1 0-1.7.4-2.7 1-1 .7-2 1.3-3.4 1.3-1.5 0-2.5-.6-3.5-1.3-1-.6-1.7-1-2.7-1-1 0-1.6 0-2-.4-.2-.3-.4-1-.6-1.5-1-.2-3.6-.7-3.6-1.5 0-.4.6-1.2 2.6-1.7 1.6-.3 1.5-1.3 1.3-1.7-.3-.4-1.3-.7-1.7-.9C.4 13 -.7 12.1-.3 11.4c.3-.5 1-.8 2.5-1.5V6.7C2.2 2.6 5.3 0 9.3 0z' },

  // COMMUNITY
  { id: 'discord',   label: 'Discord',   url: 'https://discord.com',       color: '#5865F2', group: 'community',
    svg: 'M20.3 4.4A19.7 19.7 0 0 0 15.6 3l-.2.4a18.3 18.3 0 0 0-6.8 0L8.4 3a19.6 19.6 0 0 0-4.6 1.4A20.7 20.7 0 0 0 .1 17.6 19.9 19.9 0 0 0 6.2 21l.5-.7c-1-.4-2-1-3-1.6l.3-.2a14 14 0 0 0 12 0l.3.2c-1 .7-2 1.3-3 1.7l.5.6a19.7 19.7 0 0 0 6-3.4 20.7 20.7 0 0 0-3.5-13.2zM8 15.4c-1.2 0-2.2-1.1-2.2-2.5 0-1.4 1-2.5 2.2-2.5 1.3 0 2.2 1.1 2.2 2.5 0 1.4-1 2.5-2.2 2.5zm8 0c-1.2 0-2.2-1.1-2.2-2.5 0-1.4 1-2.5 2.2-2.5 1.3 0 2.2 1.1 2.2 2.5 0 1.4-1 2.5-2.2 2.5z' },
  { id: 'reddit',    label: 'Reddit',    url: 'https://www.reddit.com',    color: '#FF4500', group: 'community',
    svg: 'M12 0A12 12 0 1 0 24 12 12 12 0 0 0 12 0zm6.3 13.5a3.6 3.6 0 0 1 .05.65c0 3.3-3.86 6-8.6 6s-8.6-2.7-8.6-6c0-.22.02-.43.06-.65a2 2 0 1 1 2.2-3.18 10.7 10.7 0 0 1 5.4-1.5l1-4.7 3.4.7a1.4 1.4 0 1 1-.1.7l-3-.6-.9 4a10.7 10.7 0 0 1 5.5 1.5 2 2 0 1 1 1.6 3.18z' },
  { id: 'linkedin',  label: 'LinkedIn',  url: 'https://www.linkedin.com',  color: '#0A66C2', group: 'community',
    svg: 'M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.65-1.85 3.4-1.85 3.63 0 4.3 2.39 4.3 5.5v6.24zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.72v20.56C0 23.23.8 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z' },
  { id: 'whatsapp',  label: 'WhatsApp',  url: 'https://web.whatsapp.com',  color: '#25D366', group: 'community',
    svg: 'M17.5 14.4l-2.2-1.1c-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-.9-.9-1.5-1.9-1.7-2.2-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.1-.3.2-.5.1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.4c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 2.6 1.1 2.6.7 3 .7.4 0 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1 0-.1-.2-.2-.5-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.6 1.4 5.2L2 22l5-1.3a10 10 0 0 0 5 1.3c5.5 0 10-4.5 10-10S17.5 2 12 2z' },
  { id: 'telegram',  label: 'Telegram',  url: 'https://web.telegram.org',  color: '#26A5E4', group: 'community',
    svg: 'M22 2L1 11l6 2 2 6 3-4 5 4 5-17zM9 14l-1 3v-3l9-8-8 8z' },

  // CREATE
  { id: 'behance',   label: 'Behance',   url: 'https://www.behance.net',   color: '#1769FF', group: 'create',
    svg: 'M6.9 4.3H0v15.4h7.1c3.3 0 6.4-1.6 6.4-5.2 0-2.2-1.1-3.9-3.4-4.4 1.7-.8 2.5-2.2 2.5-4.1 0-3.4-2.5-4.4-5.7-1.7zM3.4 7h2.8c1.2 0 2.3.3 2.3 1.7 0 1.3-.9 1.8-2.1 1.8H3.4V7zm3.7 10H3.4v-4h3.7c1.5 0 2.5.6 2.5 2 0 1.5-1.1 2-2.5 2zm15.5-4.8c-.4-2.6-1.9-4.3-4.5-4.3-2.5 0-4.2 1.8-4.6 4.3-.1.4-.1.8-.1 1.2 0 3.2 1.7 5.5 5 5.5 2.4 0 4-1 4.7-3.3h-2.8c-.3.8-.9 1.2-1.8 1.2-1.4 0-2.1-.8-2.2-2.2h6.5c0-.8-.1-1.6-.2-2.4zM16.4 12c.1-1.4.9-2.1 2.2-2.1 1.2 0 1.9.8 1.9 2.1H16.4zm.9-6h5v1.2h-5V6z' },
  { id: 'dribbble',  label: 'Dribbble',  url: 'https://dribbble.com',      color: '#EA4C89', group: 'create',
    svg: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm7.9 5.5a10.3 10.3 0 0 1 2.3 6.4c-.3 0-3.6-.7-6.9-.3l-.2-.5-.6-1.4c3.6-1.5 5.2-3.6 5.4-4.2zM12 2.1c2.5 0 4.8.9 6.6 2.5-.2.3-1.6 2.3-5 3.6-1.6-2.9-3.4-5.2-3.6-5.6.7-.3 1.4-.5 2-.5zM7.6 3.5c.4.5 2 2.9 3.6 5.7-4.6 1.2-8.7 1.2-9.1 1.2C2.7 7.5 4.9 4.8 7.6 3.5zM2 12v-.2c.5 0 5.2.1 10.2-1.4l1 1.8c-.2 0-.3.1-.4.1-5.1 1.6-7.8 6-8 6.4A10 10 0 0 1 2 12zm10 9.8c-2.2 0-4.3-.8-6-2.1.1-.3 2.3-4.5 8-6.4 3 7.8 2 7 2 7-1.2.4-2.5.7-4 .5zm5.7-.9c0-.1-.7-3.8-2.2-7.4 3.2-.5 6 .3 6.4.4-.5 3.1-2.3 5.8-4.8 7z' },
  { id: 'figma',     label: 'Figma',     url: 'https://www.figma.com',     color: '#A259FF', group: 'create',
    svg: 'M15.85 8.65a3.85 3.85 0 1 1-7.7 0 3.85 3.85 0 0 1 7.7 0zM8 17.15a3.85 3.85 0 1 0 0 7.7v-7.7zm0-15.3a3.85 3.85 0 1 0 0 7.7H12V1.85H8zm0 7.7a3.85 3.85 0 1 0 0 7.7H12V9.55H8zM12 1.85V9.55h3.85a3.85 3.85 0 1 0 0-7.7H12z' },
  { id: 'notion',    label: 'Notion',    url: 'https://www.notion.so',     color: '#FFFFFF', group: 'create',
    svg: 'M4.5 4.7c.7.6 1 .5 2.3.4l12.2-.7c.3 0 .1-.3-.1-.3l-2-1.5c-.4-.3-.9-.6-1.9-.5L3 3c-.4 0-.5.2-.4.4l1.9 1.3zM5 7v12.9c0 .7.4 1 1.2.9l13.4-.8c.8-.04 1-.5 1-1V6.2c0-.5-.2-.7-.6-.7L5.7 6.4c-.5 0-.7.3-.7.6zm13.2.7c.1.4 0 .8-.4.8l-.6.1v9.3c-.5.3-1 .5-1.4.5-.7 0-.9-.2-1.4-.8L9.7 11v6.5l1.3.3s0 .8-1.1.8l-3 .2c-.1-.2 0-.6.4-.7l.7-.2V9.3l-1.1-.1c-.1-.4.1-1 .8-1l3.3-.2 4.5 6.9V8.9l-1-.1c-.1-.5.2-.9.6-.9l3-.2z' },
  { id: 'github',    label: 'GitHub',    url: 'https://github.com',        color: '#FFFFFF', group: 'create',
    svg: 'M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1.1-.8.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.4-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.3v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3' },

  // MUSIC / AUDIO
  { id: 'spotify',   label: 'Spotify',   url: 'https://open.spotify.com',  color: '#1DB954', group: 'music',
    svg: 'M12 0a12 12 0 1 0 12 12A12 12 0 0 0 12 0zm5.7 17.3a.7.7 0 0 1-1 .2 14.4 14.4 0 0 0-8.7-2.1.7.7 0 1 1-.2-1.4 15.8 15.8 0 0 1 9.6 2.3c.4.2.5.6.3 1zm1.5-3.3a.9.9 0 0 1-1.2.3c-3.4-2.1-8.6-2.7-12.6-1.5a.9.9 0 1 1-.5-1.7c4.6-1.4 10.3-.7 14.2 1.7.4.3.5.8.1 1.2zm.1-3.4c-4.1-2.4-10.8-2.7-14.7-1.5a1 1 0 1 1-.6-2c4.5-1.4 12-1.1 16.6 1.7a1.1 1.1 0 0 1-1.3 1.8z' },
  { id: 'soundcloud',label: 'SoundCloud',url: 'https://soundcloud.com',    color: '#FF7700', group: 'music',
    svg: 'M11.6 7.2c-.8 0-1.6.4-2.1 1V18h7.4c1.8 0 3.3-1.5 3.3-3.3 0-1.8-1.5-3.3-3.3-3.3-.4 0-.8 0-1.1.2A4 4 0 0 0 11.6 7.2zM7.5 9.7v8.3h1V9.9c-.3-.1-.6-.2-1-.2zm-2 1v7.3h1v-7.5c-.4 0-.7.1-1 .2zm-2 1.5V18h1v-6c-.4 0-.7 0-1 .2zm-2 1.6V18h1v-4.2H1.5z' },
  { id: 'applemusic',label: 'Apple Music',url:'https://music.apple.com',   color: '#FA243C', group: 'music',
    svg: 'M19.2 0H4.8A4.8 4.8 0 0 0 0 4.8v14.4A4.8 4.8 0 0 0 4.8 24h14.4a4.8 4.8 0 0 0 4.8-4.8V4.8A4.8 4.8 0 0 0 19.2 0zm-1.9 17.7c0 1.6-1 2.7-2.3 2.9-1.2.2-2.2-.5-2.4-1.6-.2-1 .4-2 1.5-2.4l1.6-.4V8.4l-7 1.6v7.9c0 1.6-1 2.7-2.3 2.9-1.3.2-2.3-.5-2.4-1.6-.2-1.1.4-2 1.5-2.4l1.5-.4V6l9.3-2v13.7z' },

  // INSPIRE / EXTRA
  { id: 'medium',    label: 'Medium',    url: 'https://medium.com',        color: '#FFFFFF', group: 'inspire',
    svg: 'M2.85 5.92c0-.16-.06-.3-.18-.42L1.05 3.84V3.6h4.7L9.4 11.7l3.2-8.1H17v.24l-1.4 1.36c-.13.1-.2.25-.18.4v9.7c-.02.16.04.31.17.4l1.4 1.37v.23h-7v-.23l1.45-1.4c.14-.14.14-.18.14-.4V7.3l-4 10.6h-.55L3.3 7.32v7.1c-.05.3.05.6.27.8l1.9 2.27v.23H.2v-.23l1.9-2.27c.2-.2.3-.5.26-.8V5.93z' },
  { id: 'quora',     label: 'Quora',     url: 'https://www.quora.com',     color: '#B92B27', group: 'inspire',
    svg: 'M12.7 18.7c-.85-1.7-1.8-3.4-3.7-3.4-.4 0-.8.1-1.1.2l-.6-1.3c.8-.7 2-1.3 3.6-1.3 2.5 0 3.7 1.2 4.7 2.7.6-1.2.9-2.7.9-4.6 0-4.7-1.5-7-4.4-7-2.9 0-4.4 2.3-4.4 7 0 4.7 1.5 7 4.4 7 .2 0 .4 0 .6-.05zm-.8 3.3c-5.8 0-9.4-3.7-9.4-9.7C2.5 6.4 6.2 2.7 12 2.7c5.6 0 9.4 3.7 9.4 9.6 0 3.4-1.2 6-3.1 7.8.7 1 1.4 1.7 2.5 1.7.5 0 1-.1 1.4-.3l.4 1.2c-.6.3-1.6.6-3.1.6-2.3 0-3.6-1.1-4.6-2.4-.7.2-1.4.3-2.2.3z' },
];

const COFFEE: Site = { id: 'lofi', label: 'Lofi/Focus', url: 'https://www.youtube.com/results?search_query=lofi+beats+for+writing', color: '#FFB300', group: 'music', svg: '' };

const GROUPS = [
  { id: 'video',     label: 'Video',     icon: Film,        color: 'from-blue-500 to-indigo-600' },
  { id: 'social',    label: 'Social',    icon: ImageIcon,   color: 'from-pink-500 to-rose-600' },
  { id: 'community', label: 'Community', icon: MessageCircle,color: 'from-emerald-500 to-teal-600' },
  { id: 'create',    label: 'Create',    icon: Briefcase,   color: 'from-amber-500 to-orange-600' },
  { id: 'music',     label: 'Music',     icon: Music2,      color: 'from-violet-500 to-fuchsia-600' },
  { id: 'inspire',   label: 'Inspire',   icon: Newspaper,   color: 'from-zinc-500 to-zinc-700' },
] as const;

export default function SocialBar({ enabled, onActivity }: Props) {
  const [expanded, setExpanded] = useState<'hidden' | 'mini' | 'full'>('hidden');
  const [search, setSearch] = useState('');

  if (!enabled) {
    return (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-[10px] text-zinc-500 flex items-center gap-1.5 backdrop-blur-sm">
        <Lock className="w-3 h-3" /> Social bar disabled by admin
      </div>
    );
  }

  const open = (s: Site) => {
    onActivity?.(s.label);
    window.open(s.url, '_blank', 'noopener,noreferrer');
  };

  const MINI = ['youtube', 'instagram', 'tiktok', 'twitter', 'discord', 'spotify'];
  const filtered = SITES.filter((s) =>
    s.label.toLowerCase().includes(search.toLowerCase()) ||
    s.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      {/* Center floating trigger */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 pointer-events-auto">
        <AnimatePresence>
          {expanded === 'mini' && (
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              className="px-3 py-2 rounded-2xl bg-[var(--panel)]/90 backdrop-blur-md border border-[var(--border)] shadow-2xl flex items-center gap-1"
            >
              {SITES.filter((s) => MINI.includes(s.id)).map((s) => (
                <SocialIcon key={s.id} site={s} onClick={() => open(s)} />
              ))}
              <SocialIcon site={COFFEE} onClick={() => open(COFFEE)} fallbackIcon={Coffee} />
              <button
                onClick={() => setExpanded('full')}
                className="ml-1 p-2 rounded-full text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--accent)]"
                title="Explore all"
              >
                <Compass className="w-4 h-4" />
              </button>
              <button
                onClick={() => setExpanded('hidden')}
                className="p-2 rounded-full text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                title="Hide"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setExpanded((v) => (v === 'hidden' ? 'mini' : v === 'mini' ? 'full' : 'hidden'))}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-600 text-white text-[10px] font-bold shadow-lg uppercase tracking-wider"
        >
          <ChevronUp className={`w-3 h-3 transition-transform ${expanded !== 'hidden' ? 'rotate-180' : ''}`} />
          {expanded === 'full' ? 'Close' : 'Social'}
        </motion.button>
      </div>

      {/* Full explorer overlay */}
      <AnimatePresence>
        {expanded === 'full' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-8"
            onClick={() => setExpanded('hidden')}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl max-h-[85vh] bg-[var(--panel)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 flex items-center justify-center shadow">
                  <Compass className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-[var(--text)]">Social Explorer</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Quick links for inspiration · {SITES.length} sites</div>
                </div>
                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--card)] border border-[var(--border)]">
                  <Search className="w-3 h-3 text-[var(--text-muted)]" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search…"
                    className="bg-transparent text-xs outline-none w-40 text-[var(--text)]"
                  />
                </div>
                <button
                  onClick={() => setExpanded('hidden')}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {GROUPS.map((g) => {
                  const items = filtered.filter((s) => s.group === g.id);
                  if (items.length === 0) return null;
                  return (
                    <section key={g.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${g.color} flex items-center justify-center shadow-sm`}>
                          <g.icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">{g.label}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{items.length}</div>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => open(s)}
                            className="group p-3 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)] transition-all flex flex-col items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text)]"
                          >
                            <SiteGlyph site={s} />
                            <div className="text-[10px] font-semibold">{s.label}</div>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="text-center py-12 text-[var(--text-muted)] text-xs">
                    <Globe className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    No site matches "{search}"
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SocialIcon({ site, onClick, fallbackIcon: Fallback }: { site: Site; onClick: () => void; fallbackIcon?: any }) {
  return (
    <button
      onClick={onClick}
      title={site.label}
      className="p-2 rounded-full hover:bg-[var(--hover)] transition-all hover:scale-110"
      style={{ color: site.color }}
    >
      {site.svg ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <path d={site.svg} />
        </svg>
      ) : Fallback ? <Fallback className="w-4 h-4" /> : null}
    </button>
  );
}

function SiteGlyph({ site }: { site: Site }) {
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center shadow"
      style={{ backgroundColor: site.color === '#FFFFFF' ? '#27272a' : site.color + '22', color: site.color, border: `1px solid ${site.color}55` }}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d={site.svg} />
      </svg>
    </div>
  );
}
