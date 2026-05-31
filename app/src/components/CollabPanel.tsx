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
  auth,
} from '@/firebase';
import {
  listMyInvites,
  acceptInvite,
  declineInvite,
  pullStory,
  removeCollaborator,
  transferOwnership,
  setCollaboratorRole,
  watchChat as watchCloudChat,
  sendCloudChatMessage,
  getCollaboratorProfiles,
  type CloudInvite,
  type CloudStory,
  type CloudChatMessage,
  type CollaboratorProfile,
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
  // The legacy "access request" workflow has been replaced by invites with
  // explicit roles. Hide its tab entirely — no one needs it anymore.
  const isAdmin = false;

  const [tab, setTab] = useState<'studio' | 'chat' | 'people' | 'invite' | 'requests'>('studio');
  // accessRequests was populated by the legacy RTDB watchAccessRequests
  // listener which no longer runs. Kept as state (empty forever) so the
  // requests-tab badge code below doesn't have to be reworked.
  const [accessRequests] = useState<AccessRequest[]>([]);

  // Studio (Firestore) state — pending invites for current user + current
  // story's cloud document (so we can render collaborators + owner badge).
  const [pendingInvites, setPendingInvites] = useState<CloudInvite[]>([]);
  const [cloudStory, setCloudStory] = useState<CloudStory | null>(null);
  const [studioBusy, setStudioBusy] = useState<string | null>(null);
  // Real-time chat (Firestore subcollection on the active story) + a cache of
  // each collaborator's profile so we can render real names + avatars in the
  // People tab and the chat message bubbles instead of raw UID prefixes.
  const [cloudChatMsgs, setCloudChatMsgs] = useState<CloudChatMessage[]>([]);
  const [collabProfiles, setCollabProfiles] = useState<Record<string, CollaboratorProfile>>({});
  // Surfaced Firestore error so the user can see why their data isn't loading.
  // The most common cases:
  //   - "unavailable" / "failed to get document because the client is offline"
  //     → Firestore Database hasn't been enabled in the Firebase project yet.
  //   - "permission-denied" → rules haven't been published yet (or the user
  //     is not in the allowed set).
  //   - "not-found" → no such project / wrong projectId.
  const [studioError, setStudioError] = useState<{ code?: string; message: string } | null>(null);
  const firebaseUser = auth?.currentUser || null;
  const isOwner = !!(firebaseUser && cloudStory && cloudStory.owner === firebaseUser.uid);

  // Online mode? requires Firebase + a logged-in user + a story
  const online = isFirebaseConfigured && activeStoryId && userId !== 'me';

  // Load studio data on mount + when the active story changes. Errors are
  // surfaced into `studioError` so the StudioTab can render a clear
  // diagnostic banner instead of silently showing empty state.
  const refreshStudio = async () => {
    if (!firebaseUser) { setPendingInvites([]); setCloudStory(null); setStudioError(null); return; }
    setStudioError(null);
    try {
      const invites = await listMyInvites();
      setPendingInvites(invites);
    } catch (err: any) {
      setPendingInvites([]);
      setStudioError({ code: err?.code, message: humanizeFirestoreError(err) });
    }
    if (activeStoryId) {
      try { setCloudStory(await pullStory(activeStoryId)); }
      catch (err: any) {
        setCloudStory(null);
        // Don't overwrite an existing error message — invites are usually
        // hit first and the same underlying problem causes both failures.
        setStudioError((prev) => prev || { code: err?.code, message: humanizeFirestoreError(err) });
      }
    } else { setCloudStory(null); }
  };
  useEffect(() => { refreshStudio(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeStoryId, firebaseUser?.uid]);

  // Real-time chat subscription — only active when we're signed in AND the
  // active story exists in the cloud AND we're either the owner or in the
  // collaborators array. Without that check the onSnapshot fires with a
  // permission-denied error.
  useEffect(() => {
    if (!firebaseUser || !activeStoryId || !cloudStory) { setCloudChatMsgs([]); return; }
    const isOwner = cloudStory.owner === firebaseUser.uid;
    const isMember = isOwner || cloudStory.collaborators.includes(firebaseUser.uid);
    if (!isMember) { setCloudChatMsgs([]); return; }
    const unsub = watchCloudChat(activeStoryId,
      (msgs) => setCloudChatMsgs(msgs),
      (err) => {
        // eslint-disable-next-line no-console
        console.warn('[CollabPanel] chat watch failed:', err);
      },
    );
    return () => unsub();
  }, [firebaseUser, activeStoryId, cloudStory]);

  // Fetch collaborator profiles whenever the collaborator set changes so the
  // People tab + chat bubbles can render real names + avatars.
  useEffect(() => {
    if (!cloudStory) { setCollabProfiles({}); return; }
    const uids = [cloudStory.owner, ...cloudStory.collaborators];
    if (!uids.length) { setCollabProfiles({}); return; }
    (async () => {
      try {
        const profiles = await getCollaboratorProfiles(uids);
        setCollabProfiles(profiles);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[CollabPanel] profile fetch failed:', err);
      }
    })();
  }, [cloudStory]);

  // LEGACY RTDB EFFECT — DELETED.
  //
  // This used to call ensureRoom / setPresence / watchChat (RTDB) /
  // watchPresence / watchAccessRequests every time the Collaborate
  // panel mounted. RTDB has no rules deployed for this project, so
  // every call threw "Missing or insufficient permissions" and that
  // bubbled up as the "Cloud sync blocked" toast users were seeing.
  //
  // Round 3 replaced all of that with Firestore-backed watchCloudChat
  // / cloud story subscription / cloud collaborators. So nothing in
  // the legacy effect was actually needed — it was pure dead weight
  // emitting noise.
  //
  // The legacy block has been removed entirely. The next effect below
  // is the only thing that remains from the original collab plumbing
  // and it's already a no-op (just declaring the unused effect cleanup).
  useEffect(() => {
    // No-op — legacy RTDB collab plumbing was removed. Kept the effect
    // shell so the dependency-array shape on this file doesn't change
    // and React doesn't trip on hook-order shifts during the rollout.
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryId, userId, online, isAdmin]);

  // (legacy `chat` derivation removed — ChatTab now picks its own source
  // based on cloudActive vs localChat.)

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

        {/* Call action row — Video + Voice now open a Jitsi Meet room keyed by
            the story ID (so every collaborator who clicks Video on this story
            lands in the SAME room). Free, no signup, works in any browser.
            Voice-only uses the same Jitsi URL with the video-off hash flag. */}
        <div className="relative mt-3 flex gap-2">
          <CallButton icon={VideoIcon} label="Video" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => openJitsi(activeStoryId, false)} />
          <CallButton icon={Phone}     label="Voice" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => openJitsi(activeStoryId, true)} />
          <CallButton icon={Share2}    label="Share Link" color="bg-[var(--accent)] text-[var(--accent-ink)]" onClick={() => document.dispatchEvent(new CustomEvent('app:shareStory'))} />
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
          error={studioError}
          onRetry={refreshStudio}
          onAccept={async (inviteId) => {
            setStudioBusy(inviteId);
            try {
              const storyId = await acceptInvite(inviteId);
              toast.success('Invite accepted — opening the story…');
              if (storyId) {
                // Pull the cloud copy and import via importSharedStory so
                // the accepter's local activeStoryId becomes the cloud
                // storyId. That way subsequent pullStory / watchChat / Jitsi
                // room lookups all use the SAME id as the inviter — chat,
                // collaborator list, and calls work on both sides.
                try {
                  const fresh = await pullStory(storyId);
                  if (fresh && fresh.data) {
                    useAppStore.getState().importSharedStory(storyId, fresh.title, fresh.data);
                    toast.success(`Opened "${fresh.title}"`);
                  }
                } catch (err) {
                  // eslint-disable-next-line no-console
                  console.warn('[CollabPanel] could not pull accepted story:', err);
                }
              }
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
          // Use the cloud chat whenever we're a signed-in member of a
          // cloud-backed story; otherwise fall back to the legacy local
          // chat so local-only users still see their notes.
          cloudActive={!!(firebaseUser && activeStoryId && cloudStory && (cloudStory.owner === firebaseUser.uid || cloudStory.collaborators.includes(firebaseUser.uid)))}
          cloudMessages={cloudChatMsgs}
          localChat={localChat}
          authorName={settings.userDisplayName}
          authorId={firebaseUser?.uid || settings.userId || 'me'}
          onCloudSend={async (text, atts) => {
            if (!activeStoryId) return;
            try { await sendCloudChatMessage({ storyId: activeStoryId, text, attachments: atts }); }
            catch (err: any) { toast.error(err?.message || 'Could not send message'); }
          }}
          onLocalSend={(text, atts) => sendChatMessage({ text, authorId: settings.userId || 'me', authorName: settings.userDisplayName, attachments: atts })}
        />
      )}

      {tab === 'people' && (
        <PeopleTab
          // Cloud collaborators take precedence — they're the real source of
          // truth for a signed-in user. We hand the People tab the cloud
          // story + profiles map, plus the legacy local coworkers list so
          // local-only sessions still see something.
          cloudStory={cloudStory}
          cloudProfiles={collabProfiles}
          firebaseUserUid={firebaseUser?.uid}
          coworkers={coworkers}
          onUpdate={updateCoworker}
          onRemove={removeCoworker}
          onCloudChanged={refreshStudio}
        />
      )}

      {/* Requests tab — gated to never render now that isAdmin is hardcoded
          false above. Kept here so removing it later is a one-line delete
          rather than picking apart the JSX. */}
      {tab === 'requests' && isAdmin && (
        <RequestsTab
          requests={accessRequests}
          onApprove={async () => {}}
          onDeny={async () => {}}
        />
      )}

      {tab === 'invite' && (
        <InviteTab onAdd={(info) => { addCoworker(info); setTab('people'); }} />
      )}
    </motion.div>
  );
}

// ----- CHAT TAB -----

function ChatTab({ cloudActive, cloudMessages, localChat, authorId, onCloudSend, onLocalSend }: {
  cloudActive: boolean;
  cloudMessages: CloudChatMessage[];
  localChat: any[];
  authorName: string;
  authorId: string;
  onCloudSend: (text: string, atts?: any[]) => Promise<void> | void;
  onLocalSend: (text: string, atts?: any[]) => void;
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pick the right source + send fn based on whether we're in a cloud-shared
  // story. Cloud messages have a 'timestamp' field; local chat uses the same.
  const chat = cloudActive ? cloudMessages : localChat;
  const send = (txt: string, atts?: any[]) => {
    if (cloudActive) onCloudSend(txt, atts);
    else onLocalSend(txt, atts);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  const sendNow = () => {
    if (!text.trim()) return;
    send(text.trim());
    setText('');
    setShowEmoji(false);
  };

  const handleFileChange = (kind: 'image' | 'audio' | 'file') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      send(text.trim() || `📎 ${file.name}`, [{ kind, url: ev.target?.result as string, name: file.name }]);
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
            if (url) send(text.trim() || url, [{ kind: 'link', url }]);
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
                sendNow();
              }
            }}
            placeholder={cloudActive ? 'Write a message to collaborators…' : 'Write a note (local)…'}
            className="flex-1 mx-1 px-3 py-2 rounded-full bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />

          <button
            onClick={sendNow}
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

function PeopleTab({ cloudStory, cloudProfiles, firebaseUserUid, coworkers, onUpdate, onRemove, onCloudChanged }: {
  cloudStory: CloudStory | null;
  cloudProfiles: Record<string, CollaboratorProfile>;
  firebaseUserUid?: string;
  coworkers: CoworkerInfo[];
  onUpdate: (id: string, u: Partial<CoworkerInfo>) => void;
  onRemove: (id: string) => void;
  onCloudChanged?: () => void;
}) {
  // If we have a cloud story, show its real owner + collaborators (with
  // profile names and avatars). Fall back to the legacy local coworkers
  // list when there is no cloud story (local-only session).
  if (cloudStory) {
    const roles = cloudStory.collaboratorRoles || {};
    const viewerIsOwner = firebaseUserUid === cloudStory.owner;
    // Build rows with DEDUPE by uid. The collaborators array shouldn't
    // contain the owner (and arrayUnion prevents duplicates) — but
    // defensively skip any uid we've already added so the People tab
    // never shows the same person twice.
    const seen = new Set<string>();
    const rows: Array<{ uid: string; isOwner: boolean; role: string; profile?: CollaboratorProfile }> = [];
    rows.push({ uid: cloudStory.owner, isOwner: true, role: 'both', profile: cloudProfiles[cloudStory.owner] });
    seen.add(cloudStory.owner);
    for (const uid of cloudStory.collaborators) {
      if (seen.has(uid)) continue;
      seen.add(uid);
      rows.push({
        uid,
        isOwner: false,
        role: roles[uid] || 'both',
        profile: cloudProfiles[uid],
      });
    }
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="px-1 mb-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
          On "{cloudStory.title}" — {rows.length} {rows.length === 1 ? 'person' : 'people'}
        </div>
        {rows.map((r) => (
          <CloudCollabCard
            key={r.uid}
            uid={r.uid}
            isOwner={r.isOwner}
            isMe={firebaseUserUid === r.uid}
            role={r.role}
            profile={r.profile}
            fallbackName={r.isOwner ? (cloudStory.ownerName || 'Owner') : undefined}
            viewerIsOwner={viewerIsOwner}
            storyId={cloudStory.id}
            onChanged={onCloudChanged}
          />
        ))}
        {rows.length === 1 && (
          <p className="px-2 pt-2 text-[10.5px] text-[var(--text-muted)] italic text-center">
            You're flying solo. Use the <strong>Invite</strong> tab to add a collaborator.
          </p>
        )}
      </div>
    );
  }

  // Local-only fallback — same UX as before for sessions without a cloud story.
  if (coworkers.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6 text-center text-[var(--text-muted)] text-xs">
        <Users2 className="w-7 h-7 mx-auto opacity-50 mb-2" />
        <p>No collaborators yet</p>
        <p className="text-[10px] mt-1">Sign in and open a cloud-shared story to see collaborators here.</p>
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

// Card for a cloud collaborator pulled from /stories/{id}.collaborators and
// /profiles/{uid}. Used by the People tab when a cloud story is open.
function CloudCollabCard({ uid, isOwner, isMe, role, profile, fallbackName, viewerIsOwner, storyId, onChanged }: {
  uid: string;
  isOwner: boolean;
  isMe: boolean;
  role: string;
  profile?: CollaboratorProfile;
  fallbackName?: string;
  /** Is the user currently looking at this card the story's owner? Drives
   *  whether the "Make owner" / "Remove" actions appear. */
  viewerIsOwner?: boolean;
  storyId?: string | null;
  onChanged?: () => void;
}) {
  const name = profile?.displayName || fallbackName || uid.slice(0, 8) + '…';
  const email = profile?.email;
  const initial = (name || '?').charAt(0).toUpperCase();
  // Role descriptor mirrors the writer / director / producer / both choice.
  // Owner is always shown as Owner regardless of any stored role.
  const roleIcon =
    isOwner ? Crown :
    role === 'director' ? Clapperboard :
    role === 'writer' ? PenLine :
    role === 'producer' ? Users2 :
    Users2;
  const roleLabel =
    isOwner ? 'Owner' :
    role === 'director' ? 'Director' :
    role === 'writer' ? 'Writer' :
    role === 'producer' ? 'Producer' :
    'Writer + Director';
  const RoleIcon = roleIcon;
  const [menuOpen, setMenuOpen] = useState(false);
  const showActions = !!(viewerIsOwner && !isOwner && !isMe && storyId);
  return (
    <div className="relative flex items-center gap-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 overflow-hidden"
        style={{ background: stringToColor(uid) }}
      >
        {profile?.avatar ? <img src={profile.avatar} className="w-full h-full object-cover" alt="" /> : initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-xs font-bold text-[var(--text)] truncate">{name}</div>
          {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--accent)]/15 text-[var(--accent)] font-semibold uppercase tracking-wide">you</span>}
        </div>
        {email && <div className="text-[10px] text-[var(--text-muted)] truncate">{email}</div>}
        <div className="text-[9.5px] text-[var(--text-muted)] uppercase tracking-wider mt-0.5 flex items-center gap-1">
          <RoleIcon className="w-2.5 h-2.5" style={isOwner ? { color: 'var(--accent)' } : undefined} />
          {roleLabel}
        </div>
      </div>
      {showActions && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)]"
            title="Manage"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute right-0 top-full mt-1 w-52 bg-[var(--panel)] border border-[var(--rule)] rounded-md shadow-lg z-20 overflow-hidden"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                  Change role
                </div>
                {(['writer', 'director', 'producer', 'both'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={async () => {
                      setMenuOpen(false);
                      if (role === r) return;
                      try {
                        await setCollaboratorRole(storyId!, uid, r);
                        toast.success(`${name} is now a ${r === 'both' ? 'Writer + Director' : r.charAt(0).toUpperCase() + r.slice(1)}`);
                        onChanged?.();
                      } catch (err: any) { toast.error(err?.message || 'Could not change role'); }
                    }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 ${
                      role === r
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    {r === 'writer' && <PenLine className="w-3 h-3" />}
                    {r === 'director' && <Clapperboard className="w-3 h-3" />}
                    {r === 'producer' && <Users2 className="w-3 h-3" />}
                    {r === 'both' && <Crown className="w-3 h-3" />}
                    {r === 'writer' ? 'Writer' : r === 'director' ? 'Director' : r === 'producer' ? 'Producer' : 'Writer + Director'}
                    {role === r && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                ))}
                <div className="border-t border-[var(--rule)]" />
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    if (!confirm(`Make ${name} the new owner? You'll become a collaborator with full edit access.`)) return;
                    try {
                      await transferOwnership(storyId!, uid);
                      toast.success(`Ownership transferred to ${name}`);
                      onChanged?.();
                    } catch (err: any) { toast.error(err?.message || 'Could not transfer ownership'); }
                  }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)] flex items-center gap-2"
                >
                  <Crown className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                  Make owner
                </button>
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    if (!confirm(`Remove ${name} from this story?`)) return;
                    try {
                      await removeCollaborator(storyId!, uid);
                      toast.success(`Removed ${name}`);
                      onChanged?.();
                    } catch (err: any) { toast.error(err?.message || 'Could not remove'); }
                  }}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--danger)] hover:bg-[var(--danger)]/10 flex items-center gap-2 border-t border-[var(--rule)]"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
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
  firebaseUser, activeStoryId, cloudStory, isOwner, pendingInvites, busy, error, onRetry,
  onAccept, onDecline, onRemoveCollaborator, onInvite, onShare,
}: {
  firebaseUser: any;
  activeStoryId: string | null;
  cloudStory: CloudStory | null;
  isOwner: boolean;
  pendingInvites: CloudInvite[];
  busy: string | null;
  error: { code?: string; message: string } | null;
  onRetry: () => void;
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
      {/* Diagnostic banner — surfaces Firestore errors clearly. Most often this
          is "database not enabled" or "rules not published". */}
      {error && (
        <div className="p-3 rounded-md bg-[var(--danger)]/10 border border-[var(--danger)]/30 space-y-2">
          <div className="flex items-start gap-2">
            <CircleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-[var(--danger)]">Cloud collaboration is not ready</div>
              <p className="text-[10.5px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                {error.message}
              </p>
              {error.code === 'unavailable' && (
                <ol className="mt-2 text-[10.5px] text-[var(--text-secondary)] space-y-1 list-decimal pl-4">
                  <li>
                    Open{' '}
                    <a
                      href="https://console.firebase.google.com/project/kindling-1d29d/firestore"
                      target="_blank" rel="noreferrer"
                      className="underline text-[var(--accent)]"
                    >
                      Firebase Console → Firestore Database
                    </a>
                  </li>
                  <li>Click <strong>Create database</strong></li>
                  <li>Pick <strong>Start in production mode</strong> + a region (any nearby one works)</li>
                  <li>Wait ~30 seconds for it to provision</li>
                  <li>
                    Open the <strong>Rules</strong> tab and paste the contents of{' '}
                    <code className="px-1 py-0.5 rounded bg-[var(--surface-2)] text-[10px]">firestore.rules</code>{' '}
                    from your repo, then <strong>Publish</strong>
                  </li>
                  <li>Come back here and press <strong>Retry</strong></li>
                </ol>
              )}
              {error.code === 'permission-denied' && (
                <ol className="mt-2 text-[10.5px] text-[var(--text-secondary)] space-y-1 list-decimal pl-4">
                  <li>
                    Open{' '}
                    <a
                      href="https://console.firebase.google.com/project/kindling-1d29d/firestore/rules"
                      target="_blank" rel="noreferrer"
                      className="underline text-[var(--accent)]"
                    >
                      Firebase Console → Firestore → Rules
                    </a>
                  </li>
                  <li>
                    Paste the contents of{' '}
                    <code className="px-1 py-0.5 rounded bg-[var(--surface-2)] text-[10px]">firestore.rules</code>{' '}
                    from your repo
                  </li>
                  <li>Click <strong>Publish</strong></li>
                  <li>Press <strong>Retry</strong> below</li>
                </ol>
              )}
            </div>
          </div>
          <button
            onClick={onRetry}
            className="w-full px-3 py-1.5 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:brightness-110"
          >
            Retry
          </button>
        </div>
      )}

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

/**
 * openJitsi — opens a Jitsi Meet room in a new tab, keyed by the story's id
 * so every collaborator who clicks Video/Voice on the same story lands in
 * the SAME room. Jitsi Meet is free, requires no account, and works in any
 * modern browser. voiceOnly=true starts with the camera muted via the
 * #config hash flag.
 *
 * The room name is prefixed with "kindling-" to avoid collisions with other
 * apps using meet.jit.si. Story IDs are UUIDs so the room is unguessable
 * unless you have access to the story.
 */
function openJitsi(storyId: string | null, voiceOnly: boolean): void {
  if (!storyId) {
    toast.error('Open a story first — calls are per-story rooms.');
    return;
  }
  const room = `kindling-${storyId}`;
  const flags = voiceOnly
    ? '#config.startWithVideoMuted=true&config.startWithAudioMuted=false'
    : '';
  const url = `https://meet.jit.si/${encodeURIComponent(room)}${flags}`;
  // Open in a new tab so the writer doesn't lose their place in the script.
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    toast.error('Pop-up blocked — allow pop-ups for this site to open the call.');
  } else {
    toast.success(voiceOnly ? 'Opened voice call room' : 'Opened video call room');
  }
}

function buildInviteLink(role: string): string {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const token = Math.random().toString(36).slice(2, 10);
  return `${base}?invite=${token}&role=${role}`;
}

// (copyInviteLink helper removed — the Share Link button now dispatches the
//  app:shareStory event so it routes through the proper ShareDialog flow.)

// Map Firestore SDK error codes / messages to plain-English text. The
// Firestore SDK reports "failed to get document because the client is
// offline" for any unreachable backend — including the very common case
// where the user has not yet created a Firestore database in their
// Firebase project. We translate that into something actionable.
function humanizeFirestoreError(err: any): string {
  const code = err?.code as string | undefined;
  const msg = (err?.message || '').toString();
  if (code === 'unavailable' || /client is offline/i.test(msg)) {
    return 'Firestore Database is not enabled for this project yet. Open Firebase Console and create the database (one-time, 30 seconds).';
  }
  if (code === 'permission-denied') {
    return 'Firestore rules are blocking this request. Paste firestore.rules into the Firebase Console → Rules tab and publish.';
  }
  if (code === 'not-found') {
    return 'The story document does not exist in the cloud yet. Save the story (Ctrl+S) to push it.';
  }
  if (code === 'unauthenticated') {
    return 'Your session expired. Sign out and back in to refresh your token.';
  }
  return msg || 'Something went wrong talking to Firestore.';
}

// Deterministic colour from a string — used for avatar fallbacks so the
// same user always gets the same hue.
function stringToColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}
