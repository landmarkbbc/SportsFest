import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  initializeFirestore,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AppSettings,
  Bracket,
  BracketSlotSnapshot,
  ChurchesDoc,
  DEFAULT_POINTS_CHAMPION,
  DEFAULT_POINTS_PER_MATCH_WIN,
  EventProgram,
  FinalMatch,
  Game,
  GamePair,
  GamePairs,
  MassGameDoc,
  MassGameItem,
  PairMember,
  Player,
  PlayerEntry,
  SEED_GAMES,
  SeparationPair,
  SeparationsDoc,
  TeamId,
  UnpairedPlayer,
  getDefaultGameAllowsDraw,
  getDefaultGameHasDivisions,
  getDefaultGameIconKey,
  getDefaultGameMinPlayersPerTeam,
  getDefaultGameSession,
  getDefaultGameUsesSkillLevel,
} from '../types/models';
import {
  AlreadyDecidedError,
  PairingMode,
  StaleBracketError,
  applyEliminationDrawUndo,
  applyMatchDecision,
  applyMatchDraw,
  applyMatchUndo,
  applyResetScores,
  applyRestoreBackup,
  getBracketBaseKey,
  pickRoundRobinChampionState,
} from '../utils/bracket';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);

export async function ensureAnonymousAuth(): Promise<void> {
  const existingUser = await new Promise<typeof auth.currentUser>((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });

  if (existingUser) return;
  await signInAnonymously(auth);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function slugifyGameId(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 6);
  return slug ? `${slug}-${rand}` : `game_${Date.now()}_${rand}`;
}

function normalizeGame(raw: Partial<Game> & { id: string; name: string }): Game {
  const type = raw.type ?? 'individual';
  const isMass = type === 'mass';

  const session =
    raw.session === 'morning' || raw.session === 'afternoon'
      ? raw.session
      : getDefaultGameSession(raw.name);

  // Never overwrite an iconKey that is already set (including explicit null)
  const iconKey =
    raw.iconKey !== undefined
      ? raw.iconKey
      : isMass
        ? 'users'
        : getDefaultGameIconKey(raw.name);

  const usesSkillLevel = isMass
    ? false
    : raw.usesSkillLevel !== undefined
      ? Boolean(raw.usesSkillLevel)
      : getDefaultGameUsesSkillLevel(raw.name);

  const hasDivisions = isMass
    ? false
    : raw.hasDivisions !== undefined
      ? Boolean(raw.hasDivisions)
      : getDefaultGameHasDivisions(raw.name);

  const minPlayersPerTeam = isMass
    ? null
    : raw.minPlayersPerTeam !== undefined
      ? raw.minPlayersPerTeam
      : getDefaultGameMinPlayersPerTeam(raw.name);

  const pointsPerMatchWin =
    typeof raw.pointsPerMatchWin === 'number' && Number.isFinite(raw.pointsPerMatchWin)
      ? Math.max(0, Math.min(99, Math.trunc(raw.pointsPerMatchWin)))
      : DEFAULT_POINTS_PER_MATCH_WIN;

  const pointsChampion =
    typeof raw.pointsChampion === 'number' && Number.isFinite(raw.pointsChampion)
      ? Math.max(0, Math.min(99, Math.trunc(raw.pointsChampion)))
      : DEFAULT_POINTS_CHAMPION;

  const allowsDraw = isMass
    ? false
    : raw.allowsDraw !== undefined
      ? Boolean(raw.allowsDraw)
      : getDefaultGameAllowsDraw(raw.name);

  const trimmedHead = typeof raw.head === 'string' ? raw.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  return {
    id: raw.id,
    name: raw.name,
    type,
    eligibility: isMass ? 'everyone' : (raw.eligibility ?? 'everyone'),
    session,
    iconKey,
    usesSkillLevel,
    hasDivisions,
    minPlayersPerTeam,
    pointsPerMatchWin,
    pointsChampion,
    allowsDraw,
    head,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt,
  };
}

// Subscriptions (real-time onSnapshot)
export function subscribeGames(
  onData: (games: Game[], fromCache: boolean) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'games'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const games: Game[] = snapshot.docs.map((d) =>
        normalizeGame(d.data() as Partial<Game> & { id: string; name: string })
      );
      onData(games, snapshot.metadata.fromCache);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'games');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export function subscribePlayers(
  onData: (players: Player[], fromCache: boolean) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'players'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const players: Player[] = snapshot.docs.map((d) => {
        const data = d.data() as Player;
        return {
          ...data,
          church: typeof data.church === 'string' ? data.church.trim() : '',
          entries: Array.isArray(data.entries) ? data.entries : [],
        };
      });
      onData(players, snapshot.metadata.fromCache);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'players');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export function subscribeSettings(
  onData: (settings: AppSettings | null, exists: boolean, fromCache: boolean) => void,
  onError: (error: Error) => void
): () => void {
  const ref = doc(db, 'settings', 'app');
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null, false, snapshot.metadata.fromCache);
      } else {
        onData(snapshot.data() as AppSettings, true, snapshot.metadata.fromCache);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'settings/app');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export function subscribeProgram(
  onData: (program: EventProgram | null) => void,
  onError: (error: Error) => void
): () => void {
  const ref = doc(db, 'settings', 'program');
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
      } else {
        const data = snapshot.data() as Partial<EventProgram>;
        onData({
          rows: Array.isArray(data.rows) ? data.rows : [],
          endTime: typeof data.endTime === 'string' ? data.endTime : '16:00',
          updatedAt: data.updatedAt,
        });
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'settings/program');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveProgram(program: EventProgram): Promise<void> {
  const sortedRows = program.rows
    .map((r) => ({
      id: r.id,
      start: r.start.trim(),
      activity: r.activity.trim(),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  try {
    await setDoc(doc(db, 'settings', 'program'), {
      rows: sortedRows,
      endTime: program.endTime.trim(),
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/program');
  }
}

export function subscribeSeparations(
  onData: (pairs: SeparationPair[]) => void,
  onError: (error: Error) => void
): () => void {
  const ref = doc(db, 'settings', 'separations');
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        onData([]);
      } else {
        const data = snapshot.data() as Partial<SeparationsDoc>;
        const pairs = Array.isArray(data.pairs)
          ? data.pairs.filter(
              (p): p is SeparationPair =>
                Boolean(
                  p &&
                    typeof p.id === 'string' &&
                    typeof p.aId === 'string' &&
                    typeof p.bId === 'string' &&
                    p.aId &&
                    p.bId &&
                    p.aId !== p.bId
                )
            )
          : [];
        onData(pairs);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'settings/separations');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveSeparations(pairs: SeparationPair[]): Promise<void> {
  const sanitized = pairs
    .filter((p) => p.id && p.aId && p.bId && p.aId !== p.bId)
    .map((p) => ({
      id: p.id,
      aId: p.aId,
      bId: p.bId,
    }));
  try {
    await setDoc(doc(db, 'settings', 'separations'), {
      pairs: sanitized,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/separations');
  }
}

export function sortChurchNames(names: string[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of names) {
    const trimmed = typeof raw === 'string' ? raw.trim().slice(0, 40) : '';
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower === 'main church' || seen.has(lower)) continue;
    seen.add(lower);
    clean.push(trimmed);
  }
  return clean.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function subscribeChurches(
  onData: (names: string[]) => void,
  onError: (error: Error) => void
): () => void {
  const ref = doc(db, 'settings', 'churches');
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        onData([]);
      } else {
        const data = snapshot.data() as Partial<ChurchesDoc>;
        onData(Array.isArray(data.names) ? sortChurchNames(data.names) : []);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, 'settings/churches');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function addChurchName(rawName: string): Promise<string> {
  const clean = rawName.trim().slice(0, 40);
  if (!clean) {
    throw new Error('Church name is required.');
  }
  if (clean.toLowerCase() === 'main church') {
    throw new Error('Name cannot be "Main church".');
  }
  const ref = doc(db, 'settings', 'churches');
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current: string[] =
        snap.exists() && Array.isArray((snap.data() as Partial<ChurchesDoc>).names)
          ? sortChurchNames((snap.data() as Partial<ChurchesDoc>).names!)
          : [];
      if (current.some((n) => n.toLowerCase() === clean.toLowerCase())) {
        throw new Error('Church already exists.');
      }
      tx.set(ref, {
        names: sortChurchNames([...current, clean]),
        updatedAt: Date.now(),
      });
    });
    return clean;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Church already exists.' ||
        error.message === 'Church name is required.' ||
        error.message === 'Name cannot be "Main church".')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'settings/churches');
  }
}

export async function renameChurchAndUpdatePlayers(
  oldName: string,
  rawNewName: string,
  existingNames: string[],
  players: Player[]
): Promise<void> {
  const cleanNew = rawNewName.trim().slice(0, 40);
  if (!cleanNew) {
    throw new Error('Church name is required.');
  }
  if (cleanNew.toLowerCase() === 'main church') {
    throw new Error('Name cannot be "Main church".');
  }
  if (
    existingNames.some(
      (n) => n !== oldName && n.toLowerCase() === cleanNew.toLowerCase()
    )
  ) {
    throw new Error('Church already exists.');
  }
  const nextNames = sortChurchNames(
    existingNames.map((n) => (n === oldName ? cleanNew : n))
  );
  const affectedPlayers = players.filter((p) => (p.church ?? '').trim() === oldName);
  const now = Date.now();
  const CHUNK_SIZE = 400;

  try {
    if (affectedPlayers.length < CHUNK_SIZE) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'churches'), { names: nextNames, updatedAt: now });
      for (const p of affectedPlayers) {
        batch.update(doc(db, 'players', p.id), { church: cleanNew, updatedAt: now });
      }
      await batch.commit();
    } else {
      await setDoc(doc(db, 'settings', 'churches'), { names: nextNames, updatedAt: now });
      for (let i = 0; i < affectedPlayers.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        for (const p of affectedPlayers.slice(i, i + CHUNK_SIZE)) {
          batch.update(doc(db, 'players', p.id), { church: cleanNew, updatedAt: now });
        }
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/churches');
  }
}

export async function deleteChurchAndUpdatePlayers(
  targetName: string,
  existingNames: string[],
  players: Player[]
): Promise<void> {
  const nextNames = sortChurchNames(existingNames.filter((n) => n !== targetName));
  const affectedPlayers = players.filter((p) => (p.church ?? '').trim() === targetName);
  const now = Date.now();
  const CHUNK_SIZE = 400;

  try {
    if (affectedPlayers.length < CHUNK_SIZE) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'churches'), { names: nextNames, updatedAt: now });
      for (const p of affectedPlayers) {
        batch.update(doc(db, 'players', p.id), { church: '', updatedAt: now });
      }
      await batch.commit();
    } else {
      await setDoc(doc(db, 'settings', 'churches'), { names: nextNames, updatedAt: now });
      for (let i = 0; i < affectedPlayers.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        for (const p of affectedPlayers.slice(i, i + CHUNK_SIZE)) {
          batch.update(doc(db, 'players', p.id), { church: '', updatedAt: now });
        }
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/churches');
  }
}

// Settings & PINs
export async function saveInitialPins(
  adminPinHash: string,
  scorerPinHash: string,
  seedGamesIfEmpty: boolean
): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);

  const settingsPayload: AppSettings = {
    adminPinHash,
    scorerPinHash,
    initialized: true,
    createdAt: now,
    updatedAt: now,
  };
  batch.set(doc(db, 'settings', 'app'), settingsPayload);

  if (seedGamesIfEmpty) {
    SEED_GAMES.forEach((seed, idx) => {
      const gameDoc: Game = {
        ...seed,
        createdAt: now + idx,
        updatedAt: now + idx,
      };
      batch.set(doc(db, 'games', gameDoc.id), gameDoc);
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/app');
  }
}

export async function updatePins(
  adminPinHash: string,
  scorerPinHash: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'settings', 'app'), {
      adminPinHash,
      scorerPinHash,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'settings/app');
  }
}

// Games CRUD
export type GameInput = Pick<
  Game,
  | 'name'
  | 'type'
  | 'eligibility'
  | 'session'
  | 'iconKey'
  | 'usesSkillLevel'
  | 'hasDivisions'
  | 'minPlayersPerTeam'
  | 'allowsDraw'
  | 'head'
>;

function buildMassGameItems(count: number): MassGameItem[] {
  const safeCount = Math.max(1, Math.min(20, Math.trunc(count)));
  return Array.from({ length: safeCount }, (_, idx) => ({
    id: createId('mg'),
    name: `Game ${idx + 1}`,
    winner: null,
    points: 1,
  }));
}

export async function createGame(
  input: GameInput,
  massGameCount?: number
): Promise<Game> {
  const now = Date.now();
  const id = slugifyGameId(input.name);
  const isMass = input.type === 'mass';
  const usesSkillLevel = isMass
    ? false
    : input.type === 'individual' && input.hasDivisions
      ? true
      : input.usesSkillLevel;
  const hasDivisions = isMass
    ? false
    : input.type === 'individual' && usesSkillLevel
      ? input.hasDivisions
      : false;
  const minPlayersPerTeam =
    !isMass && input.type === 'team' && input.minPlayersPerTeam && input.minPlayersPerTeam > 0
      ? Math.trunc(input.minPlayersPerTeam)
      : null;
  const allowsDraw =
    !isMass && input.type === 'individual' ? Boolean(input.allowsDraw) : false;
  const trimmedHead = typeof input.head === 'string' ? input.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  const game: Game = {
    id,
    name: input.name.trim(),
    type: input.type,
    eligibility: isMass ? 'everyone' : input.eligibility,
    session: isMass ? 'morning' : input.session,
    iconKey: input.iconKey,
    usesSkillLevel,
    hasDivisions,
    minPlayersPerTeam,
    pointsPerMatchWin: DEFAULT_POINTS_PER_MATCH_WIN,
    pointsChampion: DEFAULT_POINTS_CHAMPION,
    allowsDraw,
    head,
    createdAt: now,
    updatedAt: now,
  };

  try {
    if (isMass) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'games', id), game);
      batch.set(doc(db, 'massgames', id), {
        items: buildMassGameItems(massGameCount ?? 1),
        updatedAt: now,
      });
      await batch.commit();
    } else {
      await setDoc(doc(db, 'games', id), game);
    }
    return game;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${id}`);
  }
}

export async function updateGame(
  gameId: string,
  updates: GameInput,
  massGameCount?: number
): Promise<void> {
  const isMass = updates.type === 'mass';
  const usesSkillLevel = isMass
    ? false
    : updates.type === 'individual' && updates.hasDivisions
      ? true
      : updates.usesSkillLevel;
  const hasDivisions = isMass
    ? false
    : updates.type === 'individual' && usesSkillLevel
      ? updates.hasDivisions
      : false;
  const minPlayersPerTeam =
    !isMass && updates.type === 'team' && updates.minPlayersPerTeam && updates.minPlayersPerTeam > 0
      ? Math.trunc(updates.minPlayersPerTeam)
      : null;
  const allowsDraw =
    !isMass && updates.type === 'individual' ? Boolean(updates.allowsDraw) : false;
  const trimmedHead = typeof updates.head === 'string' ? updates.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  const gamePatch = {
    name: updates.name.trim(),
    type: updates.type,
    eligibility: isMass ? 'everyone' : updates.eligibility,
    session: isMass ? 'morning' : updates.session,
    iconKey: updates.iconKey,
    usesSkillLevel,
    hasDivisions,
    minPlayersPerTeam,
    allowsDraw,
    head,
    updatedAt: Date.now(),
  };

  try {
    if (isMass) {
      const targetCount = Math.max(1, Math.min(20, Math.trunc(massGameCount ?? 1)));
      const gameRef = doc(db, 'games', gameId);
      const massRef = doc(db, 'massgames', gameId);
      await runTransaction(db, async (tx) => {
        const massSnap = await tx.get(massRef);
        const existingItems: MassGameItem[] =
          massSnap.exists() && Array.isArray((massSnap.data() as Partial<MassGameDoc>).items)
            ? ((massSnap.data() as Partial<MassGameDoc>).items as MassGameItem[])
            : [];
        let nextItems: MassGameItem[];
        if (targetCount > existingItems.length) {
          const added = Array.from(
            { length: targetCount - existingItems.length },
            (_, idx) => ({
              id: createId('mg'),
              name: `Game ${existingItems.length + idx + 1}`,
              winner: null,
              points: 1,
            })
          );
          nextItems = [...existingItems, ...added];
        } else {
          nextItems = existingItems.slice(0, targetCount);
        }
        tx.set(massRef, { items: nextItems, updatedAt: gamePatch.updatedAt });
        tx.update(gameRef, gamePatch);
      });
    } else {
      await updateDoc(doc(db, 'games', gameId), gamePatch);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `games/${gameId}`);
  }
}

export async function updateGamePoints(
  gameId: string,
  pointsPerMatchWin: number,
  pointsChampion: number
): Promise<void> {
  const win = Math.max(0, Math.min(99, Math.trunc(pointsPerMatchWin)));
  const champ = Math.max(0, Math.min(99, Math.trunc(pointsChampion)));
  try {
    await updateDoc(doc(db, 'games', gameId), {
      pointsPerMatchWin: win,
      pointsChampion: champ,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `games/${gameId}`);
  }
}

export async function deleteGameAndCleanupPlayers(
  gameId: string,
  players: Player[],
  isMass: boolean = false
): Promise<number> {
  const affectedPlayers = players.filter((p) =>
    p.entries.some((e) => e.gameId === gameId)
  );
  const now = Date.now();
  const CHUNK_SIZE = 400;

  type Op =
    | { kind: 'deleteGame' }
    | { kind: 'deleteMassGame' }
    | { kind: 'updatePlayer'; player: Player };

  const ops: Op[] = [
    { kind: 'deleteGame' },
    ...(isMass ? [{ kind: 'deleteMassGame' as const }] : []),
    ...affectedPlayers.map((player) => ({ kind: 'updatePlayer' as const, player })),
  ];

  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      for (const op of chunk) {
        if (op.kind === 'deleteGame') {
          batch.delete(doc(db, 'games', gameId));
        } else if (op.kind === 'deleteMassGame') {
          batch.delete(doc(db, 'massgames', gameId));
        } else {
          const remainingEntries = op.player.entries
            .filter((e) => e.gameId !== gameId)
            .map(sanitizePlayerEntry);
          batch.update(doc(db, 'players', op.player.id), {
            entries: remainingEntries,
            updatedAt: now,
          });
        }
      }
      await batch.commit();
    }
    return affectedPlayers.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `games/${gameId}`);
  }
}

// Players CRUD & Team Assignments
function sanitizePlayerEntry(entry: PlayerEntry): PlayerEntry {
  const isAdmittedSecondary =
    (entry.slot === 'secondary' || entry.slot === 'tertiary') && entry.admitted === true;
  return {
    slot: entry.slot,
    gameId: entry.gameId,
    selfLevel: entry.selfLevel,
    overrideLevel: entry.overrideLevel ?? null,
    ...(isAdmittedSecondary ? { admitted: true } : {}),
  };
}

export async function createPlayer(
  input: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Player> {
  const now = Date.now();
  const id = createId(input.isWalkIn ? 'walkin' : 'player');
  const sanitizedEntries = input.entries.map(sanitizePlayerEntry);

  const player: Player = {
    id,
    name: input.name.trim(),
    department: input.department,
    gender: input.gender,
    church: (input.church ?? '').trim().slice(0, 40),
    entries: sanitizedEntries,
    team: input.team,
    isWalkIn: input.isWalkIn,
    isDemo: input.isDemo,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'players', id), player);
    return player;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `players/${id}`);
  }
}

export async function updatePlayer(
  playerId: string,
  updates: Pick<Player, 'name' | 'department' | 'gender' | 'church' | 'entries' | 'isWalkIn'> & {
    team?: TeamId | null;
  }
): Promise<void> {
  const sanitizedEntries = updates.entries.map(sanitizePlayerEntry);

  const payload: Record<string, unknown> = {
    name: updates.name.trim(),
    department: updates.department,
    gender: updates.gender,
    church: (updates.church ?? '').trim().slice(0, 40),
    entries: sanitizedEntries,
    isWalkIn: updates.isWalkIn,
    updatedAt: Date.now(),
  };

  if (updates.team !== undefined) {
    payload.team = updates.team;
  }

  try {
    await updateDoc(doc(db, 'players', playerId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
  }
}

export async function deletePlayer(playerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'players', playerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `players/${playerId}`);
  }
}

export type PairsUndoState =
  | { kind: 'none' }
  | { kind: 'clearWithdrawn' }
  | { kind: 'restoreUnpaired'; unpairedItem: UnpairedPlayer }
  | { kind: 'restorePair'; pair: GamePair; pairIndex: number };

export interface RemovePlayerGameResult {
  entry: PlayerEntry;
  pairsUndo: PairsUndoState;
}

function sanitizePairMember(m: PairMember): PairMember {
  return {
    playerId: m.playerId,
    name: m.name,
    level: m.level,
    dept: m.dept,
    ...(m.withdrawn ? { withdrawn: true } : {}),
  };
}

function sanitizePair(p: GamePair): GamePair {
  return {
    id: p.id,
    team: p.team,
    members: [sanitizePairMember(p.members[0]), sanitizePairMember(p.members[1])],
    combined: p.combined,
  };
}

function sanitizeUnpaired(u: UnpairedPlayer): UnpairedPlayer {
  return {
    playerId: u.playerId,
    name: u.name,
    team: u.team,
  };
}

export async function removePlayerGameEntry(
  playerId: string,
  gameId: string
): Promise<RemovePlayerGameResult | null> {
  const playerRef = doc(db, 'players', playerId);
  const pairsRef = doc(db, 'pairs', gameId);
  const bracketRef = doc(db, 'brackets', gameId);

  try {
    return await runTransaction(db, async (tx) => {
      const [playerSnap, pairsSnap, bracketSnap] = await Promise.all([
        tx.get(playerRef),
        tx.get(pairsRef),
        tx.get(bracketRef),
      ]);

      if (!playerSnap.exists()) {
        throw new Error('Player not found.');
      }

      const data = playerSnap.data() as Player;
      const currentEntries = Array.isArray(data.entries) ? data.entries : [];
      const removed = currentEntries.find((e) => e.gameId === gameId) ?? null;
      if (!removed) return null;

      const remaining = currentEntries
        .filter((e) => e.gameId !== gameId)
        .map(sanitizePlayerEntry);

      let pairsUndo: PairsUndoState = { kind: 'none' };

      if (pairsSnap.exists()) {
        const pairsData = pairsSnap.data() as Partial<GamePairs>;
        const currentPairs: GamePair[] = Array.isArray(pairsData.pairs)
          ? pairsData.pairs.map(sanitizePair)
          : [];
        const currentUnpaired: UnpairedPlayer[] = Array.isArray(pairsData.unpaired)
          ? pairsData.unpaired.map(sanitizeUnpaired)
          : [];

        const pairIndex = currentPairs.findIndex(
          (p) => p.members[0].playerId === playerId || p.members[1].playerId === playerId
        );
        const unpairedItem = currentUnpaired.find((u) => u.playerId === playerId);

        if (bracketSnap.exists()) {
          if (pairIndex !== -1) {
            const nextPairs = currentPairs.map((p, idx) => {
              if (idx !== pairIndex) return p;
              return {
                ...p,
                members: [
                  p.members[0].playerId === playerId
                    ? { ...p.members[0], withdrawn: true }
                    : p.members[0],
                  p.members[1].playerId === playerId
                    ? { ...p.members[1], withdrawn: true }
                    : p.members[1],
                ] as [PairMember, PairMember],
              };
            });
            pairsUndo = { kind: 'clearWithdrawn' };
            tx.update(pairsRef, { pairs: nextPairs });
          }
        } else if (pairIndex !== -1) {
          const targetPair = currentPairs[pairIndex];
          const partner =
            targetPair.members[0].playerId === playerId
              ? targetPair.members[1]
              : targetPair.members[0];
          const nextPairs = currentPairs.filter((_, idx) => idx !== pairIndex);
          const nextUnpaired = currentUnpaired
            .filter((u) => u.playerId !== playerId)
            .concat(
              currentUnpaired.some((u) => u.playerId === partner.playerId)
                ? []
                : [{ playerId: partner.playerId, name: partner.name, team: targetPair.team }]
            );
          pairsUndo = {
            kind: 'restorePair',
            pair: sanitizePair(targetPair),
            pairIndex,
          };
          tx.update(pairsRef, {
            pairs: nextPairs,
            unpaired: nextUnpaired,
          });
        } else if (unpairedItem) {
          const nextUnpaired = currentUnpaired.filter((u) => u.playerId !== playerId);
          pairsUndo = {
            kind: 'restoreUnpaired',
            unpairedItem: sanitizeUnpaired(unpairedItem),
          };
          tx.update(pairsRef, { unpaired: nextUnpaired });
        }
      }

      tx.update(playerRef, {
        entries: remaining,
        updatedAt: Date.now(),
      });

      return {
        entry: sanitizePlayerEntry(removed),
        pairsUndo,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Player not found.') {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
  }
}

export async function restorePlayerGameEntry(
  playerId: string,
  result: RemovePlayerGameResult
): Promise<void> {
  const { entry, pairsUndo } = result;
  const playerRef = doc(db, 'players', playerId);
  const pairsRef = doc(db, 'pairs', entry.gameId);

  try {
    await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      const pairsSnap =
        pairsUndo.kind !== 'none' ? await tx.get(pairsRef) : null;

      if (!playerSnap.exists()) {
        throw new Error('Player not found.');
      }

      const data = playerSnap.data() as Player;
      const currentEntries = Array.isArray(data.entries) ? data.entries : [];
      if (!currentEntries.some((e) => e.gameId === entry.gameId)) {
        if (currentEntries.some((e) => e.slot === entry.slot)) {
          throw new Error('That slot is now used by another sport.');
        }
        const nextEntries = [
          ...currentEntries.map(sanitizePlayerEntry),
          sanitizePlayerEntry(entry),
        ];
        tx.update(playerRef, {
          entries: nextEntries,
          updatedAt: Date.now(),
        });
      }

      if (pairsSnap && pairsSnap.exists()) {
        const pairsData = pairsSnap.data() as Partial<GamePairs>;
        const currentPairs: GamePair[] = Array.isArray(pairsData.pairs)
          ? pairsData.pairs.map(sanitizePair)
          : [];
        const currentUnpaired: UnpairedPlayer[] = Array.isArray(pairsData.unpaired)
          ? pairsData.unpaired.map(sanitizeUnpaired)
          : [];

        if (pairsUndo.kind === 'clearWithdrawn') {
          const nextPairs = currentPairs.map((p) => ({
            ...p,
            members: [
              p.members[0].playerId === playerId
                ? sanitizePairMember({ ...p.members[0], withdrawn: false })
                : p.members[0],
              p.members[1].playerId === playerId
                ? sanitizePairMember({ ...p.members[1], withdrawn: false })
                : p.members[1],
            ] as [PairMember, PairMember],
          }));
          tx.update(pairsRef, { pairs: nextPairs });
        } else if (pairsUndo.kind === 'restoreUnpaired') {
          const alreadyInPairs = currentPairs.some(
            (p) => p.members[0].playerId === playerId || p.members[1].playerId === playerId
          );
          const alreadyInUnpaired = currentUnpaired.some((u) => u.playerId === playerId);
          if (!alreadyInPairs && !alreadyInUnpaired) {
            tx.update(pairsRef, {
              unpaired: [...currentUnpaired, sanitizeUnpaired(pairsUndo.unpairedItem)],
            });
          }
        } else if (pairsUndo.kind === 'restorePair') {
          const restored = sanitizePair(pairsUndo.pair);
          const idA = restored.members[0].playerId;
          const idB = restored.members[1].playerId;
          const nextUnpaired = currentUnpaired.filter(
            (u) => u.playerId !== idA && u.playerId !== idB
          );
          const conflict = currentPairs.some(
            (p) =>
              p.id === restored.id ||
              p.members[0].playerId === idA ||
              p.members[1].playerId === idA ||
              p.members[0].playerId === idB ||
              p.members[1].playerId === idB
          );
          if (!conflict) {
            const nextPairs = currentPairs.slice();
            const insertIdx = Math.max(0, Math.min(pairsUndo.pairIndex, nextPairs.length));
            nextPairs.splice(insertIdx, 0, restored);
            tx.update(pairsRef, {
              pairs: nextPairs,
              unpaired: nextUnpaired,
            });
          } else if (nextUnpaired.length !== currentUnpaired.length) {
            tx.update(pairsRef, { unpaired: nextUnpaired });
          }
        }
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Player not found.' ||
        error.message === 'That slot is now used by another sport.')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
  }
}

export async function setPlayerEntryAdmitted(
  playerId: string,
  gameId: string,
  admitted: boolean
): Promise<void> {
  const playerRef = doc(db, 'players', playerId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(playerRef);
      if (!snap.exists()) {
        throw new Error('Player not found.');
      }
      const data = snap.data() as Player;
      const currentEntries = Array.isArray(data.entries) ? data.entries : [];
      let found = false;
      const nextEntries = currentEntries.map((e) => {
        if (e.gameId !== gameId) return sanitizePlayerEntry(e);
        found = true;
        return sanitizePlayerEntry({ ...e, admitted });
      });
      if (!found) {
        throw new Error('Player entry not found.');
      }
      tx.update(playerRef, {
        entries: nextEntries,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Player not found.' || error.message === 'Player entry not found.')
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
  }
}

export async function assignPlayerTeam(
  playerId: string,
  team: TeamId
): Promise<void> {
  try {
    await updateDoc(doc(db, 'players', playerId), {
      team,
      updatedAt: Date.now(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `players/${playerId}`);
  }
}

export async function assignBulkTeams(
  assignments: Record<string, TeamId>
): Promise<void> {
  const entries = Object.entries(assignments);
  if (entries.length === 0) return;

  const now = Date.now();
  const CHUNK_SIZE = 400;

  try {
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = entries.slice(i, i + CHUNK_SIZE);
      for (const [playerId, team] of chunk) {
        batch.update(doc(db, 'players', playerId), {
          team,
          updatedAt: now,
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'players');
  }
}

export async function resetWholeEvent(): Promise<void> {
  const readCollection = async (name: string) => {
    try {
      return await getDocs(collection(db, name));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, name);
    }
  };

  const [playersSnap, bracketsSnap, pairsSnap, massSnap, finalsSnap] = await Promise.all([
    readCollection('players'),
    readCollection('brackets'),
    readCollection('pairs'),
    readCollection('massgames'),
    readCollection('finals'),
  ]);

  type ResetOp =
    | { kind: 'clearTeam'; id: string }
    | { kind: 'deleteDoc'; col: 'brackets' | 'pairs' | 'finals'; id: string }
    | { kind: 'clearMass'; id: string; items: MassGameItem[] };

  const ops: ResetOp[] = [];

  for (const d of playersSnap.docs) {
    const team = (d.data() as Partial<Player>).team;
    if (team !== null && team !== undefined) {
      ops.push({ kind: 'clearTeam', id: d.id });
    }
  }
  for (const d of bracketsSnap.docs) {
    ops.push({ kind: 'deleteDoc', col: 'brackets', id: d.id });
  }
  for (const d of pairsSnap.docs) {
    ops.push({ kind: 'deleteDoc', col: 'pairs', id: d.id });
  }
  for (const d of finalsSnap.docs) {
    ops.push({ kind: 'deleteDoc', col: 'finals', id: d.id });
  }
  for (const d of massSnap.docs) {
    const normalized = normalizeMassGameDoc(d.data() as Partial<MassGameDoc>);
    if (normalized.items.some((item) => item.winner !== null)) {
      ops.push({
        kind: 'clearMass',
        id: d.id,
        items: normalized.items.map((item) => ({ ...item, winner: null })),
      });
    }
  }

  if (ops.length === 0) return;

  const now = Date.now();
  const CHUNK_SIZE = 400;

  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + CHUNK_SIZE)) {
        if (op.kind === 'clearTeam') {
          batch.update(doc(db, 'players', op.id), { team: null });
        } else if (op.kind === 'deleteDoc') {
          batch.delete(doc(db, op.col, op.id));
        } else {
          batch.update(doc(db, 'massgames', op.id), {
            items: op.items,
            updatedAt: now,
          });
        }
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reset');
  }
}

// Pairs (all mutations use runTransaction)
export function subscribePairs(
  onData: (pairsByGameId: Map<string, GamePairs>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'pairs'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const map = new Map<string, GamePairs>();
      for (const d of snapshot.docs) {
        const data = d.data() as Partial<GamePairs>;
        map.set(d.id, {
          pairs: Array.isArray(data.pairs) ? data.pairs : [],
          unpaired: Array.isArray(data.unpaired) ? data.unpaired : [],
        });
      }
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'pairs');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function saveGamePairs(gameId: string, gamePairs: GamePairs): Promise<void> {
  const pairsRef = doc(db, 'pairs', gameId);
  const bracketRef = doc(db, 'brackets', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const bracketSnap = await tx.get(bracketRef);
      if (bracketSnap.exists()) {
        throw new Error('Reset the bracket first to change pairs.');
      }
      tx.set(pairsRef, {
        pairs: gamePairs.pairs,
        unpaired: gamePairs.unpaired,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Reset the bracket first')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `pairs/${gameId}`);
  }
}

// Match Brackets (all mutations use runTransaction)
export function subscribeBrackets(
  onData: (bracketsByGameId: Map<string, Bracket>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'brackets'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const map = new Map<string, Bracket>();
      for (const d of snapshot.docs) {
        map.set(d.id, d.data() as Bracket);
      }
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'brackets');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function createBracket(gameId: string, bracket: Bracket): Promise<void> {
  const ref = doc(db, 'brackets', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        throw new Error('A bracket already exists for this game.');
      }
      tx.set(ref, bracket);
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, `brackets/${gameId}`);
  }
}

export async function decideBracketMatch(
  bracketDocId: string,
  matchId: string,
  side: 'a' | 'b',
  decidedBy: string,
  pairingMode?: PairingMode,
  expected?: { drawCount?: number }
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      const target = current.matches.find((m) => m.id === matchId);
      if (!target) {
        throw new StaleBracketError();
      }
      if (
        expected?.drawCount !== undefined &&
        target.winner === null &&
        (target.drawCount ?? 0) !== expected.drawCount
      ) {
        throw new StaleBracketError();
      }
      const next = applyMatchDecision(current, matchId, side, decidedBy, Date.now(), pairingMode);
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        updatedAt: next.updatedAt,
      });
      return next;
    });
  } catch (error) {
    if (error instanceof AlreadyDecidedError || error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function recordBracketDraw(
  bracketDocId: string,
  matchId: string,
  decidedBy: string,
  expected?: { drawCount?: number }
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      const target = current.matches.find((m) => m.id === matchId);
      if (!target) {
        throw new StaleBracketError();
      }
      if (
        expected?.drawCount !== undefined &&
        target.winner === null &&
        (target.drawCount ?? 0) !== expected.drawCount
      ) {
        throw new StaleBracketError();
      }
      const next = applyMatchDraw(current, matchId, decidedBy, Date.now());
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        updatedAt: next.updatedAt,
      });
      return next;
    });
  } catch (error) {
    if (error instanceof AlreadyDecidedError || error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function undoEliminationDraw(
  bracketDocId: string,
  matchId: string,
  expectedVersion?: number
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      if (
        expectedVersion !== undefined &&
        (current.updatedAt ?? current.createdAt) !== expectedVersion
      ) {
        throw new StaleBracketError();
      }
      const next = applyEliminationDrawUndo(current, matchId, Date.now());
      tx.update(ref, {
        matches: next.matches,
        updatedAt: next.updatedAt,
      });
      return next;
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function undoBracketMatch(
  bracketDocId: string,
  matchId: string,
  expectedVersion?: number
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  const finalRef = doc(db, 'finals', getBracketBaseKey(bracketDocId));
  try {
    return await runTransaction(db, async (tx) => {
      const [snap, finalSnap] = await Promise.all([tx.get(ref), tx.get(finalRef)]);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      if (
        expectedVersion !== undefined &&
        (current.updatedAt ?? current.createdAt) !== expectedVersion
      ) {
        throw new StaleBracketError();
      }
      const next = applyMatchUndo(current, matchId, Date.now());
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        updatedAt: next.updatedAt,
      });
      if (finalSnap.exists()) {
        tx.delete(finalRef);
      }
      return next;
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('Cannot undo')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function resetBracketScores(
  bracketDocId: string,
  actorRole: string,
  expectedVersion?: number
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  const finalRef = doc(db, 'finals', getBracketBaseKey(bracketDocId));
  try {
    return await runTransaction(db, async (tx) => {
      const [snap, finalSnap] = await Promise.all([tx.get(ref), tx.get(finalRef)]);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      if (
        expectedVersion !== undefined &&
        (current.updatedAt ?? current.createdAt) !== expectedVersion
      ) {
        throw new StaleBracketError();
      }
      const next = applyResetScores(current, actorRole, Date.now());
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        backup: next.backup,
        updatedAt: next.updatedAt,
      });
      if (finalSnap.exists()) {
        tx.delete(finalRef);
      }
      return next;
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function restoreBracketBackup(
  bracketDocId: string,
  expectedVersion?: number
): Promise<Bracket> {
  const ref = doc(db, 'brackets', bracketDocId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      if (
        expectedVersion !== undefined &&
        (current.updatedAt ?? current.createdAt) !== expectedVersion
      ) {
        throw new StaleBracketError();
      }
      const next = applyRestoreBackup(current, Date.now());
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        backup: null,
        updatedAt: next.updatedAt,
      });
      return next;
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${bracketDocId}`);
  }
}

export async function pickBracketChampion(
  gameId: string,
  winner: BracketSlotSnapshot,
  expectedVersion?: number
): Promise<void> {
  const ref = doc(db, 'brackets', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as Bracket;
      if (
        expectedVersion !== undefined &&
        (current.updatedAt ?? current.createdAt) !== expectedVersion
      ) {
        throw new StaleBracketError();
      }
      const next = pickRoundRobinChampionState(current, winner, Date.now());
      tx.update(ref, {
        status: next.status,
        championName: next.championName,
        championTeam: next.championTeam,
        updatedAt: next.updatedAt,
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `brackets/${gameId}`);
  }
}

export async function deleteBracket(gameId: string): Promise<void> {
  const ref = doc(db, 'brackets', gameId);
  const finalRef = doc(db, 'finals', getBracketBaseKey(gameId));
  try {
    await runTransaction(db, async (tx) => {
      const [snap, finalSnap] = await Promise.all([tx.get(ref), tx.get(finalRef)]);
      if (snap.exists()) {
        tx.delete(ref);
      }
      if (finalSnap.exists()) {
        tx.delete(finalRef);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `brackets/${gameId}`);
  }
}

// Finals (Main vs Backup championship match; all mutations use runTransaction)
export function subscribeFinals(
  onData: (finalsByKey: Map<string, FinalMatch>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'finals'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const map = new Map<string, FinalMatch>();
      for (const d of snapshot.docs) {
        map.set(d.id, d.data() as FinalMatch);
      }
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'finals');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function createFinalMatch(
  finalKey: string,
  mainWinner: BracketSlotSnapshot,
  backupWinner: BracketSlotSnapshot
): Promise<void> {
  const ref = doc(db, 'finals', finalKey);
  const now = Date.now();
  const payload: FinalMatch = {
    a: mainWinner,
    b: backupWinner,
    winner: null,
    sameTeam: mainWinner.team === backupWinner.team,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return;
      tx.set(ref, payload);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `finals/${finalKey}`);
  }
}

export async function deleteFinalMatch(finalKey: string): Promise<void> {
  const ref = doc(db, 'finals', finalKey);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.delete(ref);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `finals/${finalKey}`);
  }
}

export async function decideFinalMatch(
  finalKey: string,
  side: 'a' | 'b',
  decidedBy: string
): Promise<void> {
  const ref = doc(db, 'finals', finalKey);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = snap.data() as FinalMatch;
      if (current.winner !== null) {
        throw new AlreadyDecidedError();
      }
      const now = Date.now();
      tx.update(ref, {
        winner: side,
        decidedBy,
        decidedAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof AlreadyDecidedError || error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `finals/${finalKey}`);
  }
}

export async function undoFinalMatch(finalKey: string): Promise<void> {
  const ref = doc(db, 'finals', finalKey);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const now = Date.now();
      tx.update(ref, {
        winner: null,
        decidedBy: null,
        decidedAt: null,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `finals/${finalKey}`);
  }
}

// Mass Games (all mutations use runTransaction)
function normalizeMassGameDoc(raw: Partial<MassGameDoc>): MassGameDoc {
  const items: MassGameItem[] = Array.isArray(raw.items)
    ? raw.items.map((item, idx) => ({
        id: typeof item?.id === 'string' && item.id ? item.id : `mg_${idx + 1}`,
        name:
          typeof item?.name === 'string' && item.name.trim()
            ? item.name.trim().slice(0, 40)
            : `Game ${idx + 1}`,
        winner: item?.winner === 'blue' || item?.winner === 'red' ? item.winner : null,
        points:
          typeof item?.points === 'number' && Number.isFinite(item.points)
            ? Math.max(0, Math.min(99, Math.round(item.points * 10) / 10))
            : 1,
      }))
    : [];
  return {
    items,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
  };
}

function isTxContentionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'aborted' || code === 'failed-precondition';
}

export function subscribeMassGames(
  onData: (massGamesByGameId: Map<string, MassGameDoc>) => void,
  onError: (error: Error) => void
): () => void {
  const q = query(collection(db, 'massgames'));
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      const map = new Map<string, MassGameDoc>();
      for (const d of snapshot.docs) {
        map.set(d.id, normalizeMassGameDoc(d.data() as Partial<MassGameDoc>));
      }
      onData(map);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'massgames');
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  );
}

export async function toggleMassGameWinner(
  gameId: string,
  itemId: string,
  team: TeamId,
  expectedWinner: TeamId | null
): Promise<void> {
  const ref = doc(db, 'massgames', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>);
      const idx = current.items.findIndex((i) => i.id === itemId);
      if (idx === -1) {
        throw new StaleBracketError();
      }
      if (current.items[idx].winner !== expectedWinner) {
        throw new StaleBracketError();
      }
      const nextWinner: TeamId | null = current.items[idx].winner === team ? null : team;
      const nextItems = current.items.map((item, i) =>
        i === idx ? { ...item, winner: nextWinner } : item
      );
      tx.update(ref, {
        items: nextItems,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) throw error;
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}

export async function renameMassGameItem(
  gameId: string,
  itemId: string,
  nextName: string,
  expectedName: string
): Promise<void> {
  const cleanName = nextName.trim().slice(0, 40);
  if (!cleanName) {
    throw new Error('Game name is required.');
  }
  const ref = doc(db, 'massgames', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>);
      const idx = current.items.findIndex((i) => i.id === itemId);
      if (idx === -1 || current.items[idx].name !== expectedName) {
        throw new StaleBracketError();
      }
      const nextItems = current.items.map((item, i) =>
        i === idx ? { ...item, name: cleanName } : item
      );
      tx.update(ref, {
        items: nextItems,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) throw error;
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}

export async function updateMassGameItemPoints(
  gameId: string,
  itemId: string,
  points: number
): Promise<void> {
  const clamped = Number.isFinite(points)
    ? Math.max(0, Math.min(99, Math.round(points * 10) / 10))
    : 0;
  const ref = doc(db, 'massgames', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>);
      const idx = current.items.findIndex((i) => i.id === itemId);
      if (idx === -1) return;
      const nextItems = current.items.map((item, i) =>
        i === idx ? { ...item, points: clamped } : item
      );
      tx.update(ref, {
        items: nextItems,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) throw error;
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}

export async function resetMassGameResults(
  gameId: string,
  expectedUpdatedAt?: number
): Promise<void> {
  const ref = doc(db, 'massgames', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>);
      if (
        expectedUpdatedAt !== undefined &&
        (current.updatedAt ?? 0) !== expectedUpdatedAt
      ) {
        throw new StaleBracketError();
      }
      const nextItems = current.items.map((item) => ({ ...item, winner: null }));
      tx.update(ref, {
        items: nextItems,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (error instanceof StaleBracketError) throw error;
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}

export async function addMassGameItem(gameId: string): Promise<MassGameItem> {
  const ref = doc(db, 'massgames', gameId);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists()
        ? normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>)
        : { items: [] };
      if (current.items.length >= 20) {
        throw new Error('Maximum 20 games');
      }
      const usedNums = new Set<number>();
      for (const item of current.items) {
        const m = /^game\s+(\d+)$/i.exec(item.name.trim());
        if (m) usedNums.add(Number(m[1]));
      }
      let n = current.items.length + 1;
      while (usedNums.has(n)) n += 1;
      const newItem: MassGameItem = {
        id: createId('mg'),
        name: `Game ${n}`,
        winner: null,
        points: 1,
      };
      tx.set(ref, {
        items: [...current.items, newItem],
        updatedAt: Date.now(),
      });
      return newItem;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Maximum 20 games') throw error;
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}

export async function deleteMassGameItem(
  gameId: string,
  itemId: string
): Promise<void> {
  const ref = doc(db, 'massgames', gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new StaleBracketError();
      }
      const current = normalizeMassGameDoc(snap.data() as Partial<MassGameDoc>);
      if (current.items.length <= 1) {
        throw new Error('A mass game needs at least 1 game');
      }
      const nextItems = current.items.filter((i) => i.id !== itemId);
      if (nextItems.length === current.items.length) {
        throw new StaleBracketError();
      }
      tx.update(ref, {
        items: nextItems,
        updatedAt: Date.now(),
      });
    });
  } catch (error) {
    if (
      error instanceof StaleBracketError ||
      (error instanceof Error && error.message === 'A mass game needs at least 1 game')
    ) {
      throw error;
    }
    if (isTxContentionError(error)) throw new StaleBracketError();
    handleFirestoreError(error, OperationType.UPDATE, `massgames/${gameId}`);
  }
}
