import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
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
  DEFAULT_POINTS_CHAMPION,
  DEFAULT_POINTS_PER_MATCH_WIN,
  EventProgram,
  Game,
  GamePairs,
  Player,
  SEED_GAMES,
  TeamId,
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
  const session =
    raw.session === 'morning' || raw.session === 'afternoon'
      ? raw.session
      : getDefaultGameSession(raw.name);

  // Never overwrite an iconKey that is already set (including explicit null)
  const iconKey =
    raw.iconKey !== undefined ? raw.iconKey : getDefaultGameIconKey(raw.name);

  const usesSkillLevel =
    raw.usesSkillLevel !== undefined
      ? Boolean(raw.usesSkillLevel)
      : getDefaultGameUsesSkillLevel(raw.name);

  const hasDivisions =
    raw.hasDivisions !== undefined
      ? Boolean(raw.hasDivisions)
      : getDefaultGameHasDivisions(raw.name);

  const minPlayersPerTeam =
    raw.minPlayersPerTeam !== undefined
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

  const allowsDraw =
    raw.allowsDraw !== undefined
      ? Boolean(raw.allowsDraw)
      : getDefaultGameAllowsDraw(raw.name);

  const trimmedHead = typeof raw.head === 'string' ? raw.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  return {
    id: raw.id,
    name: raw.name,
    type: raw.type ?? 'individual',
    eligibility: raw.eligibility ?? 'everyone',
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

export async function createGame(input: GameInput): Promise<Game> {
  const now = Date.now();
  const id = slugifyGameId(input.name);
  const usesSkillLevel = input.type === 'individual' && input.hasDivisions ? true : input.usesSkillLevel;
  const hasDivisions = input.type === 'individual' && usesSkillLevel ? input.hasDivisions : false;
  const minPlayersPerTeam =
    input.type === 'team' && input.minPlayersPerTeam && input.minPlayersPerTeam > 0
      ? Math.trunc(input.minPlayersPerTeam)
      : null;
  const allowsDraw = input.type === 'individual' ? Boolean(input.allowsDraw) : false;
  const trimmedHead = typeof input.head === 'string' ? input.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  const game: Game = {
    id,
    name: input.name.trim(),
    type: input.type,
    eligibility: input.eligibility,
    session: input.session,
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
    await setDoc(doc(db, 'games', id), game);
    return game;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `games/${id}`);
  }
}

export async function updateGame(
  gameId: string,
  updates: GameInput
): Promise<void> {
  const usesSkillLevel =
    updates.type === 'individual' && updates.hasDivisions ? true : updates.usesSkillLevel;
  const hasDivisions =
    updates.type === 'individual' && usesSkillLevel ? updates.hasDivisions : false;
  const minPlayersPerTeam =
    updates.type === 'team' && updates.minPlayersPerTeam && updates.minPlayersPerTeam > 0
      ? Math.trunc(updates.minPlayersPerTeam)
      : null;
  const allowsDraw = updates.type === 'individual' ? Boolean(updates.allowsDraw) : false;
  const trimmedHead = typeof updates.head === 'string' ? updates.head.trim().slice(0, 40) : '';
  const head = trimmedHead.length > 0 ? trimmedHead : null;

  try {
    await updateDoc(doc(db, 'games', gameId), {
      name: updates.name.trim(),
      type: updates.type,
      eligibility: updates.eligibility,
      session: updates.session,
      iconKey: updates.iconKey,
      usesSkillLevel,
      hasDivisions,
      minPlayersPerTeam,
      allowsDraw,
      head,
      updatedAt: Date.now(),
    });
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
  players: Player[]
): Promise<number> {
  const affectedPlayers = players.filter((p) =>
    p.entries.some((e) => e.gameId === gameId)
  );
  const now = Date.now();
  const CHUNK_SIZE = 400;

  type Op =
    | { kind: 'deleteGame' }
    | { kind: 'updatePlayer'; player: Player };

  const ops: Op[] = [
    { kind: 'deleteGame' },
    ...affectedPlayers.map((player) => ({ kind: 'updatePlayer' as const, player })),
  ];

  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      for (const op of chunk) {
        if (op.kind === 'deleteGame') {
          batch.delete(doc(db, 'games', gameId));
        } else {
          const remainingEntries = op.player.entries
            .filter((e) => e.gameId !== gameId)
            .map((e) => ({
              slot: e.slot,
              gameId: e.gameId,
              selfLevel: e.selfLevel,
              overrideLevel: e.overrideLevel ?? null,
            }));
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
export async function createPlayer(
  input: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Player> {
  const now = Date.now();
  const id = createId(input.isWalkIn ? 'walkin' : 'player');
  const sanitizedEntries = input.entries.map((entry) => ({
    slot: entry.slot,
    gameId: entry.gameId,
    selfLevel: entry.selfLevel,
    overrideLevel: entry.overrideLevel ?? null,
  }));

  const player: Player = {
    id,
    name: input.name.trim(),
    department: input.department,
    gender: input.gender,
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
  updates: Pick<Player, 'name' | 'department' | 'gender' | 'entries' | 'isWalkIn'> & {
    team?: TeamId | null;
  }
): Promise<void> {
  const sanitizedEntries = updates.entries.map((entry) => ({
    slot: entry.slot,
    gameId: entry.gameId,
    selfLevel: entry.selfLevel,
    overrideLevel: entry.overrideLevel ?? null,
  }));

  const payload: Record<string, unknown> = {
    name: updates.name.trim(),
    department: updates.department,
    gender: updates.gender,
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

export async function resetAllTeamAssignments(players: Player[]): Promise<void> {
  const assigned = players.filter((p) => p.team !== null);
  if (assigned.length === 0) return;

  const now = Date.now();
  const CHUNK_SIZE = 400;

  try {
    for (let i = 0; i < assigned.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = assigned.slice(i, i + CHUNK_SIZE);
      for (const player of chunk) {
        batch.update(doc(db, 'players', player.id), {
          team: null,
          updatedAt: now,
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'players');
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
      const next = applyMatchUndo(current, matchId, Date.now());
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
      const next = applyResetScores(current, actorRole, Date.now());
      tx.update(ref, {
        status: next.status,
        matches: next.matches,
        championName: next.championName,
        championTeam: next.championTeam,
        backup: next.backup,
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
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.delete(ref);
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `brackets/${gameId}`);
  }
}
