import {
  Bracket,
  BracketBackup,
  BracketFormat,
  BracketGroup,
  BracketMatch,
  BracketSlotSnapshot,
  Game,
  GamePairs,
  Player,
  SkillLevel,
  isMainEntry,
} from '../types/models';
import { getEffectiveLevel } from './balance';
import { pairToBracketSnapshot } from './pairs';

export type PairingMode = 'closest' | 'random';

export const DIVISION_LEVELS: { level: SkillLevel; label: string; shortLabel: string }[] = [
  { level: 1, label: 'Beginner (L1)', shortLabel: 'L1' },
  { level: 2, label: 'Intermediate (L2)', shortLabel: 'L2' },
  { level: 3, label: 'Advanced (L3)', shortLabel: 'L3' },
];

export class AlreadyDecidedError extends Error {
  constructor() {
    super('Already decided by another scorer');
    this.name = 'AlreadyDecidedError';
  }
}

export class StaleBracketError extends Error {
  constructor() {
    super('Already updated, refresh');
    this.name = 'StaleBracketError';
  }
}

export interface GameParticipantsSummary {
  blue: BracketSlotSnapshot[];
  red: BracketSlotSnapshot[];
  unassignedCount: number;
}

export interface RoundRobinStandingRow {
  player: BracketSlotSnapshot;
  wins: number;
  draws: number;
  losses: number;
  pts: number;
}

export function formatPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function getBracketDocId(
  gameId: string,
  division?: SkillLevel | null,
  group: BracketGroup = 'main'
): string {
  const base = division ? `${gameId}__L${division}` : gameId;
  return group === 'backup' ? `${base}__backup` : base;
}

export function isBackupBracketId(docId: string): boolean {
  return docId.endsWith('__backup');
}

export function getBracketBaseKey(docId: string): string {
  return isBackupBracketId(docId) ? docId.slice(0, -'__backup'.length) : docId;
}

export function getGamePairingMode(game: Pick<Game, 'usesSkillLevel' | 'hasDivisions'>): PairingMode {
  return game.usesSkillLevel && !game.hasDivisions ? 'closest' : 'random';
}

function sortByLevelDesc(list: BracketSlotSnapshot[]): BracketSlotSnapshot[] {
  return list.slice().sort((a, b) => {
    const la = a.level ?? 0;
    const lb = b.level ?? 0;
    if (lb !== la) return lb - la;
    return a.name.localeCompare(b.name);
  });
}

function shuffleList<T>(list: T[], randomFn: () => number = Math.random): T[] {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getGameParticipantsSummary(
  gameId: string,
  players: Player[],
  options?: {
    division?: SkillLevel | null;
    usesSkillLevel?: boolean;
    group?: BracketGroup;
  }
): GameParticipantsSummary {
  const blue: BracketSlotSnapshot[] = [];
  const red: BracketSlotSnapshot[] = [];
  let unassignedCount = 0;
  const division = options?.division ?? null;
  const includeLevel = options?.usesSkillLevel ?? true;
  const group = options?.group ?? 'main';

  for (const player of players) {
    const entry = player.entries.find((e) => e.gameId === gameId);
    if (!entry) continue;
    if (group === 'backup' ? isMainEntry(entry) : !isMainEntry(entry)) continue;
    const effLevel = getEffectiveLevel(entry);
    if (division !== null && effLevel !== division) {
      continue;
    }
    if (player.team === null) {
      unassignedCount += 1;
      continue;
    }
    const snap: BracketSlotSnapshot = {
      playerId: player.id,
      name: player.name,
      team: player.team,
      dept: player.department,
      level: includeLevel ? effLevel : null,
    };
    if (player.team === 'blue') blue.push(snap);
    else red.push(snap);
  }

  return {
    blue: sortByLevelDesc(blue),
    red: sortByLevelDesc(red),
    unassignedCount,
  };
}

export function estimateMatchCount(
  gameType: Game['type'],
  format: BracketFormat,
  blueCount: number,
  redCount: number
): number {
  if (gameType === 'team' || format === 'teammatch') return 1;
  if (format === 'roundrobin') return blueCount * redCount;
  // Round 1 playable matches (plus any byes = max(blue, red) - min(blue, red))
  return Math.min(blueCount, redCount);
}

function buildEliminationRound1(
  blueList: BracketSlotSnapshot[],
  redList: BracketSlotSnapshot[],
  now: number,
  pairingMode: PairingMode,
  randomFn: () => number
): BracketMatch[] {
  const blueOrdered =
    pairingMode === 'random' ? shuffleList(blueList, randomFn) : sortByLevelDesc(blueList);
  const redOrdered =
    pairingMode === 'random' ? shuffleList(redList, randomFn) : sortByLevelDesc(redList);

  const bLen = blueOrdered.length;
  const rLen = redOrdered.length;
  const diff = Math.abs(bLen - rLen);

  const byePlayers: BracketSlotSnapshot[] = [];
  let remBlue = blueOrdered;
  let remRed = redOrdered;

  if (bLen > rLen) {
    byePlayers.push(...blueOrdered.slice(0, diff));
    remBlue = blueOrdered.slice(diff);
  } else if (rLen > bLen) {
    byePlayers.push(...redOrdered.slice(0, diff));
    remRed = redOrdered.slice(diff);
  }

  const playable: BracketMatch[] = [];
  const pairCount = Math.min(remBlue.length, remRed.length);
  for (let i = 0; i < pairCount; i++) {
    playable.push({
      id: `r1_m${i + 1}`,
      round: 1,
      a: remBlue[i],
      b: remRed[i],
      winner: null,
      bye: false,
      sameTeam: false,
      decidedBy: null,
      decidedAt: null,
    });
  }

  const byes: BracketMatch[] = byePlayers.map((p, idx) => ({
    id: `r1_m${pairCount + idx + 1}`,
    round: 1,
    a: p,
    b: null,
    winner: 'a',
    bye: true,
    sameTeam: false,
    decidedBy: 'Bye',
    decidedAt: now,
  }));

  return [...playable, ...byes];
}

export function pairEliminationRound(
  survivors: BracketSlotSnapshot[],
  round: number,
  now: number,
  pairingMode: PairingMode = 'closest',
  randomFn: () => number = Math.random
): BracketMatch[] {
  const blueRaw = survivors.filter((s) => s.team === 'blue');
  const redRaw = survivors.filter((s) => s.team === 'red');

  const remBlue =
    pairingMode === 'random' ? shuffleList(blueRaw, randomFn) : sortByLevelDesc(blueRaw);
  const remRed =
    pairingMode === 'random' ? shuffleList(redRaw, randomFn) : sortByLevelDesc(redRaw);

  const playable: BracketMatch[] = [];

  if (pairingMode === 'random') {
    while (remBlue.length > 0 && remRed.length > 0) {
      const a = remBlue.shift()!;
      const b = remRed.shift()!;
      playable.push({
        id: `r${round}_m${playable.length + 1}`,
        round,
        a,
        b,
        winner: null,
        bye: false,
        sameTeam: false,
        decidedBy: null,
        decidedAt: null,
      });
    }
  } else {
    // Pair Blue vs Red by closest level first
    while (remBlue.length > 0 && remRed.length > 0) {
      let bestBi = 0;
      let bestRi = 0;
      let bestDiff = Infinity;
      let bestSum = -Infinity;

      for (let bi = 0; bi < remBlue.length; bi++) {
        for (let ri = 0; ri < remRed.length; ri++) {
          const la = remBlue[bi].level ?? 2;
          const lb = remRed[ri].level ?? 2;
          const diff = Math.abs(la - lb);
          const sum = la + lb;
          if (diff < bestDiff || (diff === bestDiff && sum > bestSum)) {
            bestDiff = diff;
            bestSum = sum;
            bestBi = bi;
            bestRi = ri;
          }
        }
      }

      const [a] = remBlue.splice(bestBi, 1);
      const [b] = remRed.splice(bestRi, 1);
      playable.push({
        id: `r${round}_m${playable.length + 1}`,
        round,
        a,
        b,
        winner: null,
        bye: false,
        sameTeam: false,
        decidedBy: null,
        decidedAt: null,
      });
    }
  }

  const leftoverRaw = remBlue.length > 0 ? remBlue : remRed;
  const leftovers =
    pairingMode === 'random'
      ? shuffleList(leftoverRaw, randomFn)
      : sortByLevelDesc(leftoverRaw);
  const byes: BracketMatch[] = [];

  if (leftovers.length % 2 === 1) {
    const byePlayer = leftovers.shift()!;
    byes.push({
      id: `r${round}_bye`,
      round,
      a: byePlayer,
      b: null,
      winner: 'a',
      bye: true,
      sameTeam: false,
      decidedBy: 'Bye',
      decidedAt: now,
    });
  }

  for (let i = 0; i < leftovers.length; i += 2) {
    playable.push({
      id: `r${round}_m${playable.length + 1}`,
      round,
      a: leftovers[i],
      b: leftovers[i + 1],
      winner: null,
      bye: false,
      sameTeam: true,
      decidedBy: null,
      decidedAt: null,
    });
  }

  if (byes.length > 0) {
    byes[0].id = `r${round}_m${playable.length + 1}`;
  }

  return [...playable, ...byes];
}

function buildRoundRobinMatches(
  blueList: BracketSlotSnapshot[],
  redList: BracketSlotSnapshot[]
): BracketMatch[] {
  const blueIsSmaller = blueList.length <= redList.length;
  const smaller = blueIsSmaller ? blueList : redList;
  const larger = blueIsSmaller ? redList : blueList;

  const matches: BracketMatch[] = [];
  for (let k = 0; k < larger.length; k++) {
    const round = k + 1;
    for (let i = 0; i < smaller.length; i++) {
      const p1 = smaller[i];
      const p2 = larger[(i + k) % larger.length];
      const a = p1.team === 'blue' ? p1 : p2;
      const b = p1.team === 'blue' ? p2 : p1;
      matches.push({
        id: `r${round}_m${i + 1}`,
        round,
        a,
        b,
        winner: null,
        bye: false,
        sameTeam: false,
        decidedBy: null,
        decidedAt: null,
      });
    }
  }
  return matches;
}

export function getTeamMinPlayersError(
  game: Pick<Game, 'name' | 'type' | 'minPlayersPerTeam'>,
  blueCount: number,
  redCount: number
): string | null {
  if (game.type !== 'team' || !game.minPlayersPerTeam || game.minPlayersPerTeam <= 0) {
    return null;
  }
  if (blueCount < game.minPlayersPerTeam || redCount < game.minPlayersPerTeam) {
    const unit = game.minPlayersPerTeam === 1 ? 'player' : 'players';
    return `${game.name} needs at least ${game.minPlayersPerTeam} ${unit} per team (Blue ${blueCount}, Red ${redCount}).`;
  }
  return null;
}

export function buildInitialBracket(
  game: Game,
  players: Player[],
  format: BracketFormat,
  options?: {
    division?: SkillLevel | null;
    group?: BracketGroup;
    gamePairs?: GamePairs | null;
    now?: number;
    randomFn?: () => number;
  }
): Bracket {
  const division = game.hasDivisions ? (options?.division ?? null) : null;
  const group: BracketGroup =
    game.type === 'individual' ? (options?.group ?? 'main') : 'main';
  const now = options?.now ?? Date.now();
  const randomFn = options?.randomFn ?? Math.random;

  let blue: BracketSlotSnapshot[];
  let red: BracketSlotSnapshot[];

  if (game.type === 'pairs') {
    if (!options?.gamePairs) {
      throw new Error('Make pairs first before creating a bracket.');
    }
    const snapshots = options.gamePairs.pairs.map((p) =>
      pairToBracketSnapshot(p, game.usesSkillLevel)
    );
    blue = sortByLevelDesc(snapshots.filter((s) => s.team === 'blue'));
    red = sortByLevelDesc(snapshots.filter((s) => s.team === 'red'));
    if (blue.length === 0 || red.length === 0) {
      throw new Error('Both Blue and Red teams must have at least 1 pair.');
    }
  } else {
    const summary = getGameParticipantsSummary(game.id, players, {
      division,
      usesSkillLevel: game.usesSkillLevel,
      group,
    });
    blue = summary.blue;
    red = summary.red;
    if (blue.length === 0 || red.length === 0) {
      throw new Error('Both Blue and Red teams must have at least 1 assigned player.');
    }
  }

  const minErr = getTeamMinPlayersError(game, blue.length, red.length);
  if (minErr) {
    throw new Error(minErr);
  }

  const pairingMode = getGamePairingMode(game);

  if (format === 'teammatch') {
    return {
      format: 'teammatch',
      status: 'active',
      matches: [
        {
          id: 'r1_m1',
          round: 1,
          a: { playerId: 'team_blue', name: 'Blue', team: 'blue', dept: null, level: null },
          b: { playerId: 'team_red', name: 'Red', team: 'red', dept: null, level: null },
          winner: null,
          bye: false,
          sameTeam: false,
          decidedBy: null,
          decidedAt: null,
        },
      ],
      championName: null,
      championTeam: null,
      division,
      group,
      createdAt: now,
      updatedAt: now,
    };
  }

  if (format === 'roundrobin') {
    const rrBlue = pairingMode === 'random' ? shuffleList(blue, randomFn) : blue;
    const rrRed = pairingMode === 'random' ? shuffleList(red, randomFn) : red;
    return {
      format: 'roundrobin',
      status: 'active',
      matches: buildRoundRobinMatches(rrBlue, rrRed),
      championName: null,
      championTeam: null,
      division,
      group,
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    format: 'elimination',
    status: 'active',
    matches: buildEliminationRound1(blue, red, now, pairingMode, randomFn),
    championName: null,
    championTeam: null,
    division,
    group,
    createdAt: now,
    updatedAt: now,
  };
}

export function computeRoundRobinStandings(bracket: Bracket): RoundRobinStandingRow[] {
  const map = new Map<string, RoundRobinStandingRow>();

  for (const match of bracket.matches) {
    if (match.a && !map.has(match.a.playerId)) {
      map.set(match.a.playerId, { player: match.a, wins: 0, draws: 0, losses: 0, pts: 0 });
    }
    if (match.b && !map.has(match.b.playerId)) {
      map.set(match.b.playerId, { player: match.b, wins: 0, draws: 0, losses: 0, pts: 0 });
    }
    if (match.winner && match.a && match.b) {
      if (match.winner === 'draw') {
        const rowA = map.get(match.a.playerId);
        const rowB = map.get(match.b.playerId);
        if (rowA) {
          rowA.draws += 1;
          rowA.pts += 0.5;
        }
        if (rowB) {
          rowB.draws += 1;
          rowB.pts += 0.5;
        }
      } else {
        const winnerRow = map.get(match.winner === 'a' ? match.a.playerId : match.b.playerId);
        const loserRow = map.get(match.winner === 'a' ? match.b.playerId : match.a.playerId);
        if (winnerRow) {
          winnerRow.wins += 1;
          winnerRow.pts += 1;
        }
        if (loserRow) loserRow.losses += 1;
      }
    }
  }

  return Array.from(map.values()).sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (x.losses !== y.losses) return x.losses - y.losses;
    return x.player.name.localeCompare(y.player.name);
  });
}

export function getRoundRobinTiedLeaders(bracket: Bracket): BracketSlotSnapshot[] {
  if (bracket.format !== 'roundrobin' || bracket.status === 'complete') return [];
  if (bracket.matches.length === 0 || !bracket.matches.every((m) => m.winner !== null)) {
    return [];
  }
  const standings = computeRoundRobinStandings(bracket);
  if (standings.length === 0) return [];
  const maxPts = standings[0].pts;
  const tied = standings.filter((row) => row.pts === maxPts).map((row) => row.player);
  return tied.length > 1 ? tied : [];
}

export function getBracketChampionSnapshot(
  bracket: Bracket
): BracketSlotSnapshot | null {
  if (
    bracket.status !== 'complete' ||
    !bracket.championName ||
    !bracket.championTeam
  ) {
    return null;
  }
  if (bracket.format === 'teammatch') {
    return {
      playerId: bracket.championTeam === 'blue' ? 'team_blue' : 'team_red',
      name: bracket.championName,
      team: bracket.championTeam,
      dept: null,
      level: null,
    };
  }
  if (bracket.format === 'elimination') {
    let topRound = -1;
    let topSlot: BracketSlotSnapshot | null = null;
    for (const m of bracket.matches) {
      if (m.round >= topRound && (m.winner === 'a' || m.winner === 'b')) {
        topRound = m.round;
        topSlot = m.winner === 'a' ? m.a : m.b;
      }
    }
    return (
      topSlot ?? {
        playerId: '',
        name: bracket.championName,
        team: bracket.championTeam,
        dept: null,
        level: null,
      }
    );
  }
  const standings = computeRoundRobinStandings(bracket);
  const exact =
    standings.find(
      (s) =>
        s.player.name === bracket.championName &&
        s.player.team === bracket.championTeam
    ) ??
    standings.find((s) => s.player.name === bracket.championName) ??
    standings[0];
  return (
    exact?.player ?? {
      playerId: '',
      name: bracket.championName,
      team: bracket.championTeam,
      dept: null,
      level: null,
    }
  );
}

export function getBracketChampionPlayerId(bracket: Bracket): string | null {
  if (bracket.status !== 'complete' || !bracket.championName || bracket.format === 'teammatch') {
    return null;
  }
  return getBracketChampionSnapshot(bracket)?.playerId || null;
}

export function applyMatchDecision(
  bracket: Bracket,
  matchId: string,
  side: 'a' | 'b',
  decidedBy: string,
  now: number = Date.now(),
  pairingMode?: PairingMode,
  randomFn: () => number = Math.random
): Bracket {
  const idx = bracket.matches.findIndex((m) => m.id === matchId);
  if (idx === -1) {
    throw new Error('Match not found.');
  }

  const target = bracket.matches[idx];
  if (target.winner !== null) {
    throw new AlreadyDecidedError();
  }

  const chosenSnapshot = side === 'a' ? target.a : target.b;
  if (!chosenSnapshot) {
    throw new Error('Invalid winner selection.');
  }

  const updatedMatches = bracket.matches.map((m, i) =>
    i === idx
      ? {
          ...m,
          winner: side,
          decidedBy,
          decidedAt: now,
        }
      : m
  );

  let status = bracket.status;
  let championName = bracket.championName;
  let championTeam = bracket.championTeam;

  if (bracket.format === 'teammatch') {
    status = 'complete';
    championName = chosenSnapshot.name;
    championTeam = chosenSnapshot.team;
  } else if (bracket.format === 'roundrobin') {
    const allDecided = updatedMatches.every((m) => m.winner !== null);
    if (allDecided) {
      const standings = computeRoundRobinStandings({ ...bracket, matches: updatedMatches });
      const topPts = standings[0]?.pts ?? 0;
      const leaders = standings.filter((s) => s.pts === topPts);
      if (leaders.length === 1) {
        status = 'complete';
        championName = leaders[0].player.name;
        championTeam = leaders[0].player.team;
      }
    }
  } else {
    // Single elimination: if every match of target.round is decided and next round doesn't exist yet
    const round = target.round;
    const roundMatches = updatedMatches.filter((m) => m.round === round);
    const allRoundDecided = roundMatches.every((m) => m.winner !== null);
    const hasLaterRound = updatedMatches.some((m) => m.round > round);

    if (allRoundDecided && !hasLaterRound) {
      const survivors = roundMatches.map((m) => (m.winner === 'a' ? m.a! : m.b!));
      if (survivors.length === 1) {
        status = 'complete';
        championName = survivors[0].name;
        championTeam = survivors[0].team;
      } else {
        const inferredMode: PairingMode =
          pairingMode ??
          (bracket.division ||
          updatedMatches.some((m) => (m.a && m.a.level === null) || (m.b && m.b.level === null))
            ? 'random'
            : 'closest');
        const nextRoundMatches = pairEliminationRound(
          survivors,
          round + 1,
          now,
          inferredMode,
          randomFn
        );
        updatedMatches.push(...nextRoundMatches);
      }
    }
  }

  return {
    ...bracket,
    status,
    matches: updatedMatches,
    championName,
    championTeam,
    updatedAt: now,
  };
}

export function applyMatchDraw(
  bracket: Bracket,
  matchId: string,
  decidedBy: string,
  now: number = Date.now()
): Bracket {
  const idx = bracket.matches.findIndex((m) => m.id === matchId);
  if (idx === -1) {
    throw new Error('Match not found.');
  }

  const target = bracket.matches[idx];
  if (target.bye) {
    throw new Error('Cannot record a draw on a bye match.');
  }
  if (target.winner !== null) {
    throw new AlreadyDecidedError();
  }

  if (bracket.format === 'roundrobin') {
    const updatedMatches = bracket.matches.map((m, i) =>
      i === idx
        ? {
            ...m,
            winner: 'draw' as const,
            decidedBy,
            decidedAt: now,
          }
        : m
    );

    let status = bracket.status;
    let championName = bracket.championName;
    let championTeam = bracket.championTeam;

    const allDecided = updatedMatches.every((m) => m.winner !== null);
    if (allDecided) {
      const standings = computeRoundRobinStandings({ ...bracket, matches: updatedMatches });
      const topPts = standings[0]?.pts ?? 0;
      const leaders = standings.filter((s) => s.pts === topPts);
      if (leaders.length === 1) {
        status = 'complete';
        championName = leaders[0].player.name;
        championTeam = leaders[0].player.team;
      }
    }

    return {
      ...bracket,
      status,
      matches: updatedMatches,
      championName,
      championTeam,
      updatedAt: now,
    };
  }

  if (bracket.format === 'elimination') {
    const updatedMatches = bracket.matches.map((m, i) =>
      i === idx
        ? {
            ...m,
            drawCount: (m.drawCount ?? 0) + 1,
          }
        : m
    );
    return {
      ...bracket,
      matches: updatedMatches,
      updatedAt: now,
    };
  }

  throw new Error('Draws are not supported for this match format.');
}

export function applyEliminationDrawUndo(
  bracket: Bracket,
  matchId: string,
  now: number = Date.now()
): Bracket {
  const idx = bracket.matches.findIndex((m) => m.id === matchId);
  if (idx === -1) {
    throw new Error('Match not found.');
  }
  const target = bracket.matches[idx];
  if (target.winner !== null || (target.drawCount ?? 0) <= 0) {
    throw new Error('Cannot undo draw on this match.');
  }
  const updatedMatches = bracket.matches.map((m, i) =>
    i === idx
      ? {
          ...m,
          drawCount: (m.drawCount ?? 0) - 1,
        }
      : m
  );
  return {
    ...bracket,
    matches: updatedMatches,
    updatedAt: now,
  };
}

export interface EliminationUndoImpact {
  laterRounds: number[];
  laterDecidedCount: number;
}

export function canUndoMatch(_bracket: Bracket, match: BracketMatch): boolean {
  return !match.bye && match.winner !== null;
}

export function getEliminationUndoImpact(
  bracket: Bracket,
  matchId: string
): EliminationUndoImpact {
  if (bracket.format !== 'elimination') {
    return { laterRounds: [], laterDecidedCount: 0 };
  }
  const target = bracket.matches.find((m) => m.id === matchId);
  if (!target) {
    return { laterRounds: [], laterDecidedCount: 0 };
  }
  const laterResults = bracket.matches.filter(
    (m) => m.round > target.round && !m.bye && (m.winner !== null || (m.drawCount ?? 0) > 0)
  );
  const laterRounds = Array.from(new Set(laterResults.map((m) => m.round))).sort((a, b) => a - b);
  return {
    laterRounds,
    laterDecidedCount: laterResults.length,
  };
}

export function countResettableResults(bracket: Bracket): number {
  return bracket.matches.filter(
    (m) => !m.bye && (m.winner !== null || (m.drawCount ?? 0) > 0)
  ).length;
}

export function applyMatchUndo(
  bracket: Bracket,
  matchId: string,
  now: number = Date.now()
): Bracket {
  const target = bracket.matches.find((m) => m.id === matchId);
  if (!target) {
    throw new StaleBracketError();
  }
  if (!canUndoMatch(bracket, target)) {
    throw new StaleBracketError();
  }

  const trimmed =
    bracket.format === 'roundrobin'
      ? bracket.matches
      : bracket.matches.filter((m) => m.round <= target.round);

  const updatedMatches = trimmed.map((m) =>
    m.id === matchId
      ? {
          ...m,
          winner: null,
          decidedBy: null,
          decidedAt: null,
        }
      : m
  );

  return {
    ...bracket,
    status: 'active',
    matches: updatedMatches,
    championName: null,
    championTeam: null,
    updatedAt: now,
  };
}

export function applyResetScores(
  bracket: Bracket,
  actorRole: string,
  now: number = Date.now()
): Bracket {
  if (countResettableResults(bracket) === 0) {
    throw new StaleBracketError();
  }

  const backup: BracketBackup = {
    at: now,
    by: actorRole,
    matches: bracket.matches,
    status: bracket.status,
    championName: bracket.championName,
    championTeam: bracket.championTeam,
  };

  const baseMatches =
    bracket.format === 'elimination'
      ? bracket.matches.filter((m) => m.round === 1)
      : bracket.matches;

  const resetMatches = baseMatches.map((m) =>
    m.bye
      ? m
      : {
          ...m,
          winner: null,
          decidedBy: null,
          decidedAt: null,
          drawCount: 0,
        }
  );

  return {
    ...bracket,
    status: 'active',
    matches: resetMatches,
    championName: null,
    championTeam: null,
    backup,
    updatedAt: now,
  };
}

export function applyRestoreBackup(
  bracket: Bracket,
  now: number = Date.now()
): Bracket {
  if (!bracket.backup) {
    throw new StaleBracketError();
  }
  return {
    ...bracket,
    status: bracket.backup.status,
    matches: bracket.backup.matches,
    championName: bracket.backup.championName,
    championTeam: bracket.backup.championTeam,
    backup: null,
    updatedAt: now,
  };
}

export function pickRoundRobinChampionState(
  bracket: Bracket,
  winner: BracketSlotSnapshot,
  now: number = Date.now()
): Bracket {
  if (bracket.format !== 'roundrobin') {
    throw new Error('Champion selection is only used for round robin ties.');
  }
  const tied = getRoundRobinTiedLeaders(bracket);
  if (!tied.some((p) => p.playerId === winner.playerId)) {
    throw new Error('Selected player is not tied for first.');
  }
  return {
    ...bracket,
    status: 'complete',
    championName: winner.name,
    championTeam: winner.team,
    updatedAt: now,
  };
}
