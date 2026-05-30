import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users2,
  Phone,
  Video as VideoIcon,
  Send,
  Paperclip,
  Image as ImageIcon,
  Mic,
  Link as LinkIcon,
  Smile,
  Share2,
  UserPlus,
  Circle,
  Crown,
  PenLine,
  Clapperboard,
  Eye,
  Copy,
  Check,
  CircleAlert,
  Trash2,
  Bell,
  MoreVertical,
  ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import type { CoworkerInfo, AccessRequest } from '@/types';
import {
  isFirebaseConfigured,
  ensureRoom,
  watchChat,
  watchPresence,
  setPresence,
  leavePresence,
  watchAccessRequests,
  approveAccessRequest,
  denyAccessRequest,
  auth,
} from '@/firebase';
import {
  listMyInvites,
  acceptInvite,
  declineInvite,
  pullStory,
  removeCollaborator,
  type CloudInvite,
  type CloudStory,
} from '@/lib/cloudStories';

interface Props {
  onClose: () => void;
}

const EMOJI = ['😀', '😂', '😍', '🔥', '🎬', '✍️', '🎵', '🎙️', '🎥', '💡', '✅', '🙏', '👏', '🎉', '👀', '🤝', '💯', '🚀', '🌟', '❤️'];

const ROLES: { id: CoworkerInfo['role']; label: string; icon: any; color: string }[] = [
  { id: 'admin',    label: 'Admin',    icon: Crown,        color: 'text-amber-400' },
  { id: 'writer',   label: 'Writer',   icon: PenLine,      color: 'text-blue-400' },
  { id: 'director', label: 'Director', icon: Clapperboard, color: 'text-purple-400' },
  { id: 'viewer',   label: 'Viewer',   icon: Eye,          color: 'text-zinc-400' },
];

export default function CollabPanel({ onClose }: Props) {
  const coworkers = useAppStore((s) => s.coworkers);
  const localChat = useAppStore((s) => s.chat);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const sendChatMessage = useAppStore((s) => s.sendChatMessage);
  const addCoworker = useAppStore((s) => s.addCoworker);
  const removeCoworker = useAppStore((s) => s.removeCoworker);
  const updateCoworker = useAppStore((s) => s.updateCoworker);
  const activeStoryId = useAppStore((s) => s.activeStoryId);

  const userId = settings.userId || 'me';
  const userName = settings.userDisplayName || 'You';
  const isAdmin = settings.userRole === 'admin';

  const [tab, setTab] = useState<'studio' | 'chat' | 'people' | 'invite' | 'requests'>('studio');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [cloudChat, setCloudChat] = useState<any[] | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);

  // Studio (Firestore) state — pending invites for current user + current
  // story's cloud document (so we can render collaborators + owner badge).
  const [pendingInvites, setPendingInvites] = useState<CloudInvite[]>([]);
  const [cloudStory, setCloudStory] = useState<CloudStory | null>(null);
  const [studioBusy, setStudioBusy] = useState<string | null>(null);
  const firebaseUser = auth?.currentUser || null;
  const isOwner = !!(firebaseUser && cloudStory && cloudStory.owner === firebaseUser.uid);

  // Online mode? requires Firebase + a logged-in user + a story
  const online = isFirebaseConfigured && activeStoryId && userId !== 'me';

  // Load studio data on mount + when the active story changes. Both calls
  // tolerate permission errors — if Firestore rules block them we just
  // render the empty state and a helpful hint.
  const refreshStudio = async () => {
    if (!firebaseUser) { setPendingInvites([]); setCloudStory(null); return; }
    try {
      const invites = await listMyInvites();
      setPendingInvites(invites);
    } catch { setPendingInvites([]); }
    if (activeStoryId) {
      try { setCloudStory(await pullStory(activeStoryId)); }
      catch { setCloudStory(null); }
    } else { setCloudStory(null); }
  };
  useEffect(() => { refreshStudio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeStoryId, firebaseUser?.uid]);

  // Ensure room & subscribe
  useEffect(() => {
    if (!online || !activeStoryId) return;
    let unsubChat = () => {};
    let unsubPresence = () => {};
    let unsubRequests = () => {};
    (async () => {
      const id = await ensureRoom(activeStoryId, userId);
      if (!id) return;
      setRoomId(id);
      await setPresence(id, userId, { name: userName, role: settings.userRole, status: 'online' });
      unsubChat = watchChat(id, (msgs) => setCloudChat(msgs));
      unsubPresence = watchPresence(id, () => {});
      if (isAdmin) {
        unsubRequests = watchAccessRequests(id, (reqs) => setAccessRequests(reqs));
      }
    })();
    const heartbeat = setInterval(() => {
      if (roomId) setPresence(roomId, userId, { name: userName, role: settings.userRole, status: 'online' });
    }, 25000);
    return () => {
      unsubChat();
      unsubPresence();
      unsubRequests();
      clearInterval(heartbeat);
      if (roomId) leavePresence(roomId, userId).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryId, userId, online, isAdmin]);

  const chat = cloudChat ?? localChat;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="h-full flex flex-col bg-[var(--panel)]"
    >
      {/* Header — custom design */}
      <div className="relative px-4 py-3 border-b border-[var(--border)] overflow-hidden">
        <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--accent)_0%,_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shadow-lg">
                <Users2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-[var(--text)]">Studio Room</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {coworkers.filter((c) => c.status === 'online').length} online · {coworkers.length} collaborators
                </div>
              </div>
              {/* Overlapping avatar row showing presence. Online users get a
                  green ring, offline a muted ring. Caps at 5 + (+N) overflow. */}
              {coworkers.length > 0 && (
                <div className="hidden sm:flex -space-x-2 ml-3">
                  {coworkers.slice(0, 5).map((c) => {
                    const onlineNow = c.status === 'online';
                    return (
                      <div
                        key={c.id}
                        title={`${c.name} · ${c.role || 'collaborator'} · ${onlineNow ? 'online' : 'offline'}`}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 ${onlineNow ? 'border-emerald-400' : 'border-zinc-500'}`}
                        style={{ background: stringToColor(c.id || c.name) }}
                      >
                        {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full rounded-full object-cover" /> : (c.name || '?').charAt(0).toUpperCase()}
                      </div>
                    );
                  })}
                  {coworkers.length > 5 && (
                    <div className="w-7 h-7 rounded-full bg-[var(--card)] border-2 border-[var(--border)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">
                      +{coworkers.length - 5}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Call action row */}
        <div className="relative mt-3 flex gap-2">
          <CallButton icon={VideoIcon} label="Video" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => toast.info('Video call needs a signaling backend (Firebase/WebRTC) — UI ready.')} />
          <CallButton icon={Phone}     label="Voice" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => toast.info('Voice call needs a signaling backend — UI ready.')} />
          <CallButton icon={Share2}    label="Share Link" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => copyInviteLink()} />
          <CallButton icon={Bell}      label="Ping" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => toast.success('Ping sent to active coworkers')} />
        </div>

        {/* Live sync — uses the cloud provider you've already set up to poll
            for changes every 15s. Zero-backend, free, multi-user. */}
        <div className="relative mt-3 px-3 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center gap-2">
          <button
            onClick={() => {
              const cur = (settings as any).liveSync;
              updateSettings({ liveSync: !cur } as any);
              toast.success(cur ? 'Live sync paused' : 'Live sync on — pulling every 15s');
            }}
            className={`w-9 h-5 rounded-full transition-all ${(settings as any).liveSync ? 'bg-emerald-500' : 'bg-[var(--border)]'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${(settings as any).liveSync ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold text-[var(--text)]">Live sync via cloud</div>
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              {(settings as any).liveSync ? 'On — pulls every 15s, pushes on save.' : 'Off. Needs a configured cloud provider in Settings.'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)] bg-[var(--sidebar)] overflow-x-auto">
        {[
          { id: 'studio' as const, label: 'Studio', icon: Crown, badge: pendingInvites.length },
          { id: 'chat' as const,   label: 'Chat',   icon: Send,  badge: 0 },
          { id: 'people' as const, label: 'People', icon: Users2, badge: 0 },
          ...(isAdmin ? [{ id: 'requests' as const, label: 'Requests', icon: ClipboardList, badge: 0 }] : []),
          { id: 'invite' as const, label: 'Invite', icon: UserPlus, badge: 0 },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all whitespace-nowrap ${
              tab === t.id ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.id === 'requests' && accessRequests.filter((r) => r.status === 'pending').length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/30 text-red-300">
                {accessRequests.filter((r) => r.status === 'pending').length}
              </span>
            )}
            {t.id === 'studio' && t.badge > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent)]/30 text-[var(--accent)]">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'studio' && (
        <StudioTab
          firebaseUser={firebaseUser}
          activeStoryId={activeStoryId}
          cloudStory={cloudStory}
          isOwner={isOwner}
          pendingInvites={pendingInvites}
          busy={studioBusy}
          onAccept={async (inviteId) => {
            setStudioBusy(inviteId);
            try {
              await acceptInvite(inviteId);
              toast.success('Invite accepted — you are now a collaborator');
              await refreshStudio();
            } catch (err: any) {
              toast.error(err?.message || 'Could not accept invite');
            } finally { setStudioBusy(null); }
          }}
          onDecline={async (inviteId) => {
            setStudioBusy(inviteId);
            try {
              await declineInvite(inviteId);
              toast.success('Invite declined');
              await refreshStudio();
            } catch (err: any) {
              toast.error(err?.message || 'Could not decline invite');
            } finally { setStudioBusy(null); }
          }}
          onRemoveCollaborator={async (uid) => {
            if (!activeStoryId) return;
            setStudioBusy(uid);
            try {
              await removeCollaborator(activeStoryId, uid);
              toast.success('Collaborator removed');
              await refreshStudio();
            } catch (err: any) {
              toast.error(err?.message || 'Could not remove collaborator');
            } finally { setStudioBusy(null); }
          }}
          onInvite={() => document.dispatchEvent(new CustomEvent('app:invite'))}
          onShare={() => document.dispatchEvent(new CustomEvent('app:shareStory'))}
        />
      )}

      {tab === 'chat' && (
        <ChatTab
          chat={chat}
          authorName={settings.userDisplayName}
          authorId={settings.userId || 'me'}
          onSend={(text, atts) => sendChatMessage({ text, authorId: settings.userId || 'me', authorName: settings.userDisplayName, attachments: atts })}
        />
      )}

      {tab === 'people' && (
        <PeopleTab
          coworkers={coworkers}
          onUpdate={updateCoworker}
          onRemove={removeCoworker}
        />
      )}

      {tab === 'requests' && isAdmin && roomId && (
        <RequestsTab
          requests={accessRequests}
          onApprove={(id) => approveAccessRequest(roomId, id)}
          onDeny={(id) => denyAccessRequest(roomId, id)}
        />
      )}

      {tab === 'invite' && (
        <InviteTab onAdd={(info) => { addCoworker(info); setTab('people'); }} />
      )}
    </motion.div>
  );
}

// ----- CHAT TAB -----

function ChatTab({ chat, authorId, onSend }: {
  chat: any[];
  authorName: string;
  authorId: string;
  onSend: (text: string, atts?: any[]) => void;
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  const send = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
    setShowEmoji(false);
  };

  const handleFileChange = (kind: 'image' | 'audio' | 'file') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onSend(text.trim() || `📎 ${file.name}`, [{ kind, url: ev.target?.result as string, name: file.name }]);
      setText('');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {chat.length === 0 && (
          <div className="text-center py-10 text-[var(--text-muted)] text-xs">
            <Send className="w-7 h-7 mx-auto opacity-50 mb-2" />
            <p>No messages yet</p>
            <p className="text-[10px] mt-1">Say hi to your collaborators 👋</p>
          </div>
        )}
        {chat.map((m) => {
          const mine = m.authorId === authorId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow ${
                mine
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] text-white rounded-br-sm'
                  : 'bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
              }`}>
                {!mine && <div className="text-[10px] font-bold text-[var(--accent)] mb-0.5">{m.authorName}</div>}
                <div className="text-xs whitespace-pre-wrap break-words leading-snug">{m.text}</div>
                {m.attachments?.map((a: any, i: number) => (
                  <Attachment key={i} att={a} />
                ))}
                <div className={`text-[9px] mt-1 ${mine ? 'text-blue-100/70' : 'text-[var(--text-muted)]'} text-right`}>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--sidebar)] p-2 relative">
        <AnimatePresence>
          {showEmoji && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full left-2 right-2 mb-1 p-2 bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-2xl grid grid-cols-10 gap-1"
            >
              {EMOJI.map((e) => (
                <button
                  key={e}
                  onClick={() => { setText((t) => t + e); setShowEmoji(false); }}
                  className="text-xl hover:scale-125 transition-transform"
                >
                  {e}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1">
          <button onClick={() => imgInput.current?.click()} title="Image" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]">
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => audioInput.current?.click()} title="Audio" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]">
            <Mic className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => fileInput.current?.click()} title="File" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]">
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => {
            const url = prompt('Paste a link:');
            if (url) onSend(text.trim() || url, [{ kind: 'link', url }]);
          }} title="Link" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]">
            <LinkIcon className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowEmoji((v) => !v)} title="Emoji" className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--hover)]">
            <Smile className="w-3.5 h-3.5" />
          </button>

          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…"
            className="flex-1 mx-1 px-3 py-2 rounded-full bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />

          <button
            onClick={send}
            disabled={!text.trim()}
            className="p-2 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-white shadow disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hidden file inputs */}
        <input ref={imgInput} type="file" accept="image/*" hidden onChange={handleFileChange('image')} />
        <input ref={audioInput} type="file" accept="audio/*" hidden onChange={handleFileChange('audio')} />
        <input ref={fileInput} type="file" hidden onChange={handleFileChange('file')} />
      </div>
    </div>
  );
}

function Attachment({ att }: { att: any }) {
  if (att.kind === 'image') return <img src={att.url} alt="" className="mt-1 rounded-md max-h-48 object-cover" />;
  if (att.kind === 'audio') return <audio controls src={att.url} className="mt-1 w-full h-7" />;
  if (att.kind === 'link') return <a href={att.url} target="_blank" rel="noreferrer" className="mt-1 underline text-[11px] truncate block">{att.url}</a>;
  return (
    <a href={att.url} download={att.name} className="mt-1 flex items-center gap-1 text-[11px] underline">
      <Paperclip className="w-3 h-3" /> {att.name || 'file'}
    </a>
  );
}

// ----- PEOPLE TAB -----

function PeopleTab({ coworkers, onUpdate, onRemove }: {
  coworkers: CoworkerInfo[];
  onUpdate: (id: string, u: Partial<CoworkerInfo>) => void;
  onRemove: (id: string) => void;
}) {
  if (coworkers.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 text-center text-[var(--text-muted)] text-xs">
        <Users2 className="w-7 h-7 mx-auto opacity-50 mb-2" />
        <p>No collaborators yet</p>
        <p className="text-[10px] mt-1">Use the <strong>Invite</strong> tab above to add someone.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {coworkers.map((c) => (
        <CoworkerCard key={c.id} coworker={c} onUpdate={(u) => onUpdate(c.id, u)} onRemove={() => onRemove(c.id)} />
      ))}
    </div>
  );
}

function CoworkerCard({ coworker, onUpdate, onRemove }: {
  coworker: CoworkerInfo;
  onUpdate: (u: Partial<CoworkerInfo>) => void;
  onRemove: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const role = ROLES.find((r) => r.id === coworker.role) || ROLES[3];
  const statusColor = {
    online: 'text-emerald-400 fill-emerald-400',
    typing: 'text-blue-400 fill-blue-400',
    away: 'text-yellow-400 fill-yellow-400',
    offline: 'text-zinc-500 fill-zinc-500',
  }[coworker.status];

  return (
    <div className="relative p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-sm font-bold text-white overflow-hidden">
            {coworker.avatar ? <img src={coworker.avatar} className="w-full h-full object-cover" /> : coworker.name.charAt(0).toUpperCase()}
          </div>
          <Circle className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${statusColor}`} strokeWidth={3} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-xs font-bold text-[var(--text)] truncate">{coworker.name}</div>
            <role.icon className={`w-3 h-3 ${role.color}`} />
          </div>
          <div className="text-[10px] text-[var(--text-muted)] truncate">
            {coworker.status}{coworker.currentSection ? ` · in ${coworker.currentSection}` : ''}
          </div>
        </div>
        <button
          onClick={() => setMenu((v) => !v)}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-2 p-2 bg-[var(--panel)] border border-[var(--border)] rounded-lg space-y-1.5"
          >
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-1">Role</div>
            <div className="flex flex-wrap gap-1">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onUpdate({ role: r.id })}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border ${
                    coworker.role === r.id ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  <r.icon className="w-3 h-3" /> {r.label}
                </button>
              ))}
            </div>

            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider mt-2 mb-1">Permissions</div>
            <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={coworker.socialAllowed ?? true}
                onChange={(e) => onUpdate({ socialAllowed: e.target.checked })}
                className="accent-[var(--accent)]"
              />
              Allow social media bar
            </label>

            <button
              onClick={onRemove}
              className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-red-400 bg-red-500/10 hover:bg-red-500/20"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ----- INVITE TAB -----

function InviteTab({ onAdd }: { onAdd: (info: Partial<CoworkerInfo>) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CoworkerInfo['role']>('writer');
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => buildInviteLink(role), [role]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Invite link copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  const shareNative = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title: 'Join my Kindling studio', url: link });
      } catch { /* user cancelled */ }
    } else {
      copy();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="p-4 rounded-xl bg-[var(--accent-soft)] border border-[var(--border)]">
        <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">
          <Share2 className="w-3 h-3" /> Private invite link
        </div>
        <div className="flex items-center gap-1.5 bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="flex-1 px-3 py-2 text-[11px] text-[var(--text-secondary)] truncate font-mono">
            {link}
          </div>
          <button onClick={copy} className="p-2 text-[var(--text-muted)] hover:text-[var(--accent)]" title="Copy">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button
          onClick={shareNative}
          className="mt-2 w-full px-3 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg)] text-xs font-bold flex items-center justify-center gap-1.5 hover:brightness-110"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share via Messages, Email, Slack…
        </button>
        <p className="mt-2 text-[10px] text-[var(--text-muted)] flex items-start gap-1">
          <CircleAlert className="w-3 h-3 mt-0.5 flex-shrink-0" />
          For real cross-internet sessions, deploy this app and enable Cloud Sync.
        </p>
      </div>

      <div className="p-4 bg-[var(--card)] border border-[var(--border)] rounded-xl space-y-2">
        <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">
          Add coworker manually
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)]"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="w-full px-3 py-2 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs outline-none focus:border-[var(--accent)]"
        />
        <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--text-muted)]">Role</div>
        <div className="grid grid-cols-2 gap-1.5">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-md border text-[11px] transition-all ${
                role === r.id
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)]'
              }`}
            >
              <r.icon className={`w-3.5 h-3.5 ${role === r.id ? '' : r.color}`} />
              {r.label}
            </button>
          ))}
        </div>
        <button
          disabled={!name.trim()}
          onClick={() => {
            onAdd({ name: name.trim(), email: email.trim() || undefined, role });
            setName(''); setEmail('');
            toast.success('Coworker added — they will appear online when they connect.');
          }}
          className="mt-2 w-full px-3 py-2 rounded-md bg-[var(--accent)] text-[var(--bg)] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

// ----- REQUESTS TAB (admin only) -----

function RequestsTab({ requests, onApprove, onDeny }: {
  requests: AccessRequest[];
  onApprove: (id: string) => Promise<void>;
  onDeny: (id: string) => Promise<void>;
}) {
  const [processing, setProcessing] = useState<string | null>(null);

  const pending = requests.filter((r) => r.status === 'pending');
  const handled = requests.filter((r) => r.status !== 'pending');

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      await onApprove(id);
      toast.success('Access granted');
    } catch (err: any) {
      toast.error(`Error: ${err?.message || 'Failed to approve'}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleDeny = async (id: string) => {
    setProcessing(id);
    try {
      await onDeny(id);
      toast.info('Request denied');
    } catch (err: any) {
      toast.error(`Error: ${err?.message || 'Failed to deny'}`);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {pending.length === 0 && handled.length === 0 && (
        <div className="text-center py-10 text-[var(--text-muted)] text-xs">
          <ClipboardList className="w-7 h-7 mx-auto opacity-50 mb-2" />
          <p>No access requests yet</p>
          <p className="text-[10px] mt-1">Blocked collaborators can request access here</p>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <div className="text-[10px] uppercase font-bold text-[var(--accent)] tracking-wider">
            Pending Requests ({pending.length})
          </div>
          {pending.map((req) => (
            <div key={req.id} className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center text-xs font-bold text-white">
                  {req.requesterName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[var(--text)]">{req.requesterName}</div>
                  {req.requesterEmail && <div className="text-[10px] text-[var(--text-muted)]">{req.requesterEmail}</div>}
                  <div className="text-[10px] text-[var(--text-muted)] mt-1">
                    Requested {new Date(req.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => handleApprove(req.id)}
                  disabled={processing === req.id}
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  <Check className="w-3 h-3 inline mr-1" /> Approve
                </button>
                <button
                  onClick={() => handleDeny(req.id)}
                  disabled={processing === req.id}
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-red-500/20 text-red-300 text-[11px] font-semibold hover:bg-red-500/30 disabled:opacity-50"
                >
                  <X className="w-3 h-3 inline mr-1" /> Deny
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {handled.length > 0 && (
        <>
          <div className="mt-4 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
            Previous Decisions
          </div>
          {handled.map((req) => (
            <div key={req.id} className="p-2 bg-[var(--panel)] border border-[var(--border)]/50 rounded-lg opacity-60">
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--text-secondary)]">{req.requesterName}</div>
                <span className={`text-[10px] font-bold ${req.status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {req.status === 'approved' ? '✓ Approved' : '✕ Denied'}
                </span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ----- STUDIO TAB (Firestore-backed) -----
//
// This is the "real" multi-user surface that pairs with the Share / Invite
// dialogs in the TopBar ⋯ menu. It shows:
//
//   1. Pending invites — anything sent to YOUR email that you haven't
//      accepted or declined. Big Accept / Decline buttons.
//   2. Collaborators on this story — owner badge + collaborator list
//      pulled from the Firestore doc. Owner sees a Remove button per
//      collaborator.
//   3. Quick actions — Share story + Invite collaborator (route to the
//      same dialogs as the TopBar ⋯ menu).

function StudioTab({
  firebaseUser, activeStoryId, cloudStory, isOwner, pendingInvites, busy,
  onAccept, onDecline, onRemoveCollaborator, onInvite, onShare,
}: {
  firebaseUser: any;
  activeStoryId: string | null;
  cloudStory: CloudStory | null;
  isOwner: boolean;
  pendingInvites: CloudInvite[];
  busy: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onRemoveCollaborator: (uid: string) => void;
  onInvite: () => void;
  onShare: () => void;
}) {
  if (!firebaseUser) {
    return (
      <div className="flex-1 overflow-y-auto p-6 text-center text-[var(--text-muted)] text-xs">
        <Crown className="w-8 h-8 mx-auto opacity-40 mb-3" style={{ color: 'var(--accent)' }} />
        <p className="text-[var(--text)] font-semibold text-sm">Sign in to collaborate</p>
        <p className="text-[10px] mt-1.5">Cloud collaboration uses your Firebase account.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4">
      {/* Pending invites — only shown when there's at least one */}
      {pendingInvites.length > 0 && (
        <section>
          <div className="px-1 mb-2 text-[10px] uppercase tracking-widest text-[var(--accent)] font-bold flex items-center gap-1.5">
            <UserPlus className="w-3 h-3" />
            Pending invites ({pendingInvites.length})
          </div>
          <ul className="space-y-2">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="p-3 bg-[var(--card)] border border-[var(--accent)]/30 rounded-lg">
                <div className="text-[11px] font-bold text-[var(--text)]">{inv.storyTitle}</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Invited by <span className="text-[var(--text-secondary)]">{inv.fromName}</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => onAccept(inv.id)}
                    disabled={busy === inv.id}
                    className="flex-1 px-2 py-1.5 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                  <button
                    onClick={() => onDecline(inv.id)}
                    disabled={busy === inv.id}
                    className="flex-1 px-2 py-1.5 rounded-md bg-[var(--surface-2)] text-[var(--text-secondary)] text-[11px] font-semibold border border-[var(--rule)] hover:bg-[var(--hover)] disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <X className="w-3 h-3" /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Collaborators on this story (owner + collaborators array) */}
      <section>
        <div className="px-1 mb-2 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
          On this story
        </div>
        {!activeStoryId || !cloudStory ? (
          <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-[11px] text-[var(--text-muted)]">
            {!activeStoryId
              ? 'Open a story to see its collaborators.'
              : 'This story has not been pushed to the cloud yet — press Ctrl+S to sync.'}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {/* Owner */}
            <li className="flex items-center gap-2.5 p-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: stringToColor(cloudStory.owner) }}
              >
                {(cloudStory.ownerName || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-[var(--text)] truncate">
                  {cloudStory.ownerName || 'Owner'}
                  {cloudStory.owner === firebaseUser.uid && <span className="text-[var(--text-muted)] font-normal"> (you)</span>}
                </div>
                <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5" style={{ color: 'var(--accent)' }} /> Owner
                </div>
              </div>
            </li>

            {/* Collaborators */}
            {cloudStory.collaborators.map((uid) => (
              <li key={uid} className="flex items-center gap-2.5 p-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: stringToColor(uid) }}
                >
                  {uid.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-[var(--text)] truncate">
                    {uid === firebaseUser.uid ? 'You' : uid.slice(0, 8) + '…'}
                  </div>
                  <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1">
                    <PenLine className="w-2.5 h-2.5" /> Collaborator
                  </div>
                </div>
                {isOwner && uid !== firebaseUser.uid && (
                  <button
                    onClick={() => onRemoveCollaborator(uid)}
                    disabled={busy === uid}
                    title="Remove collaborator"
                    className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </li>
            ))}

            {cloudStory.collaborators.length === 0 && (
              <li className="p-2.5 text-[10.5px] text-[var(--text-muted)] italic text-center">
                No collaborators yet — invite someone below.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onShare}
          disabled={!activeStoryId}
          className="flex flex-col items-center gap-1 p-3 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Share2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-semibold text-[var(--text)]">Share story</span>
        </button>
        <button
          onClick={onInvite}
          disabled={!activeStoryId}
          className="flex flex-col items-center gap-1 p-3 rounded-md bg-[var(--card)] border border-[var(--border)] hover:border-[var(--accent)]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <UserPlus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-[10px] font-semibold text-[var(--text)]">Invite by email</span>
        </button>
      </section>

      {pendingInvites.length === 0 && cloudStory?.collaborators.length === 0 && (
        <p className="text-[10px] text-[var(--text-muted)] text-center px-3 pt-2">
          Tip: invites are stored privately. Only the person whose email matches will see them.
        </p>
      )}
    </div>
  );
}

// ----- helpers -----

function CallButton({ icon: Icon, label, color, onClick }: { icon: any; label: string; color: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg ${color} text-white shadow-md`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="text-[9px] font-bold tracking-wider">{label.toUpperCase()}</span>
    </motion.button>
  );
}

function buildInviteLink(role: string): string {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const token = Math.random().toString(36).slice(2, 10);
  return `${base}?invite=${token}&role=${role}`;
}

async function copyInviteLink() {
  const link = buildInviteLink('writer');
  try {
    await navigator.clipboard.writeText(link);
    toast.success('Invite link copied to clipboard');
  } catch {
    toast.error('Could not copy');
  }
}

// Deterministic colour from a string — used for avatar fallbacks so the
// same user always gets the same hue.
function stringToColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
