// Minimal Firestore-signaled WebRTC P2P call. Works for any two peers in the
// same room. Caller publishes an offer + ICE; callee writes an answer + ICE.
// Audio-only by default; video toggled in constraints.

import {
  createCall,
  updateCall,
  watchCall,
  pushCandidate,
  watchCandidates,
  isFirebaseConfigured,
} from '@/firebase';

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type CallHandle = {
  hangup: () => void;
  callId: string;
  pc: RTCPeerConnection;
  remoteStream: MediaStream;
};

export async function startCall(roomId: string, withVideo: boolean, callerId: string, onRemote: (s: MediaStream) => void): Promise<CallHandle | null> {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured — set up VITE_FIREBASE_* env vars first (see SETUP.md).');
  const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
  const pc = new RTCPeerConnection(ICE);
  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    onRemote(remoteStream);
  };
  local.getTracks().forEach((t) => pc.addTrack(t, local));

  const r = await createCall(roomId, callerId);
  if (!r) throw new Error('Could not create call doc');
  const { callId } = r;

  // ICE for caller
  pc.onicecandidate = (e) => {
    if (e.candidate) pushCandidate(roomId, callId, 'caller', e.candidate.toJSON());
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await updateCall(roomId, callId, { offer: { type: offer.type, sdp: offer.sdp }, state: 'ringing', video: withVideo, callerId });

  const unsubCall = watchCall(roomId, callId, async (data) => {
    if (data?.answer && pc.signalingState !== 'closed' && !pc.remoteDescription) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
    if (data?.state === 'ended') {
      hangup();
    }
  });
  const unsubIce = watchCandidates(roomId, callId, 'callee', async (cand) => {
    try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
  });

  const hangup = () => {
    try { pc.close(); } catch {}
    local.getTracks().forEach((t) => t.stop());
    unsubCall(); unsubIce();
    updateCall(roomId, callId, { state: 'ended' });
  };

  return { hangup, callId, pc, remoteStream };
}

export async function answerCall(roomId: string, callId: string, withVideo: boolean, onRemote: (s: MediaStream) => void): Promise<CallHandle | null> {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured.');
  const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
  const pc = new RTCPeerConnection(ICE);
  const remoteStream = new MediaStream();
  pc.ontrack = (e) => {
    e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    onRemote(remoteStream);
  };
  local.getTracks().forEach((t) => pc.addTrack(t, local));

  pc.onicecandidate = (e) => {
    if (e.candidate) pushCandidate(roomId, callId, 'callee', e.candidate.toJSON());
  };

  const unsubCall = watchCall(roomId, callId, async (data) => {
    if (data?.offer && pc.signalingState === 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await updateCall(roomId, callId, { answer: { type: answer.type, sdp: answer.sdp }, state: 'connected' });
    }
    if (data?.state === 'ended') hangup();
  });
  const unsubIce = watchCandidates(roomId, callId, 'caller', async (cand) => {
    try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
  });

  const hangup = () => {
    try { pc.close(); } catch {}
    local.getTracks().forEach((t) => t.stop());
    unsubCall(); unsubIce();
    updateCall(roomId, callId, { state: 'ended' });
  };

  return { hangup, callId, pc, remoteStream };
}
