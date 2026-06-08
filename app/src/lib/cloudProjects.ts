/**
 * Cloud sync for Projects — /projects/{id} in Firestore, owned by the user.
 * Mirrors the local Project so the Kindling Connector (and other devices) can
 * read a project's master prompt + instructions + knowledge and build stories
 * that fit it. Knowledge is stored as a JSON string to keep the doc simple.
 */
import { doc, collection, setDoc, getDocs, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/firebase';
import type { Project, ProjectKnowledge } from '@/types';

export async function pushProject(p: Project): Promise<void> {
  const user = auth?.currentUser;
  if (!user) return;
  await setDoc(doc(db, 'projects', p.id), {
    owner: user.uid,
    name: p.name,
    about: p.about || '',
    instructions: p.instructions || '',
    defaultType: p.defaultType || '',
    knowledge: JSON.stringify(p.knowledge || []),
    createdAt: p.createdAt || Date.now(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function listMyProjects(): Promise<Project[]> {
  const user = auth?.currentUser;
  if (!user) return [];
  const snap = await getDocs(query(collection(db, 'projects'), where('owner', '==', user.uid)));
  return snap.docs.map((d) => {
    const r = d.data() as any;
    let knowledge: ProjectKnowledge[] = [];
    try { knowledge = JSON.parse(r.knowledge || '[]'); } catch { /* ignore */ }
    return {
      id: d.id,
      name: r.name || 'Untitled Project',
      about: r.about || '',
      instructions: r.instructions || '',
      defaultType: r.defaultType || undefined,
      knowledge,
      createdAt: r.createdAt?.toMillis?.() || r.createdAt || Date.now(),
      updatedAt: r.updatedAt?.toMillis?.() || Date.now(),
    } as Project;
  });
}

export async function deleteProjectCloud(id: string): Promise<void> {
  await deleteDoc(doc(db, 'projects', id));
}
