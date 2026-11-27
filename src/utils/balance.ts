import {
  BalanceStatus,
  Bracket,
  DEPARTMENTS,
  Department,
  DisplayBalanceStatus,
  Game,
  GamePairs,
  Gender,
  Player,
  PlayerEntry,
  SeparationPair,
  SkillLevel,
  TeamId,
  isMainEntry,
} from '../types/models';

export const COST_WEIGHTS = {
  TOTAL_LEVEL_DIFF: 3,
  HEADCOUNT_DIFF: 2,
  DEPT_HEADCOUNT_DIFF: 1,
  DEPT_LEVEL_DIFF: 1,
} as const;

export const ROSTER_HEADCOUNT_WEIGHT = 2;
export const ROSTER_DEPARTMENT_WEIGHT = 3;
export const ROSTER_DEPT_GENDER_WEIGHT = 2;
export const ROSTER_CHURCH_WEIGHT = 0.5;
export const SEPARATION_PENALTY = 1000;

export function getPlayerChurchKey(player: Pick<Player, 'church'>): string {
  return (player.church ?? '').trim();
}

export interface ChurchTeamCount {
  key: string;
  label: string;
  blue: number;
  red: number;
  total: number;
}

export function computeChurchCounts(
  players: readonly Player[],
  proposedMap?: ReadonlyMap<string, TeamId>
): ChurchTeamCount[] {
  const map = new Map<string, { blue: number; red: number; total: number }>();
  for (const p of players) {
    const key = getPlayerChurchKey(p);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { blue: 0, red: 0, total: 0 };
      map.set(key, bucket);
    }
    bucket.total += 1;
    const team = p.team ?? proposedMap?.get(p.id) ?? null;
    if (team === 'blue') bucket.blue += 1;
    else if (team === 'red') bucket.red += 1;
  }
  return Array.from(map.entries())
    .filter(([, counts]) => counts.total > 0)
    .map(([key, counts]) => ({
      key,
      label: key || 'Main church',
      blue: counts.blue,
      red: counts.red,
      total: counts.total,
    }))
    .sort((a, b) => {
      if (a.key === '' && b.key !== '') return -1;
      if (b.key === '' && a.key !== '') return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

export type DeptGenderKey =
  | 'Kids'
  | 'YP:M'
  | 'YP:F'
  | 'SP:M'
  | 'SP:F'
  | 'Adults:M'
  | 'Adults:F';

export const DEPT_GENDER_GROUPS: {
  key: DeptGenderKey;
  label: string;
  dept: Department;
  gender?: Gender;
}[] = [
  { key: 'Kids', label: 'Kids', dept: 'Kids' },
  { key: 'YP:M', label: 'YP males', dept: 'YP', gender: 'M' },
  { key: 'YP:F', label: 'YP females', dept: 'YP', gender: 'F' },
  { key: 'SP:M', label: 'SP males', dept: 'SP', gender: 'M' },
  { key: 'SP:F', label: 'SP females', dept: 'SP', gender: 'F' },
  { key: 'Adults:M', label: 'Adults males', dept: 'Adults', gender: 'M' },
  { key: 'Adults:F', label: 'Adults females', dept: 'Adults', gender: 'F' },
];

export function getDeptGenderKey(
  player: Pick<Player, 'department' | 'gender'>
): DeptGenderKey {
  if (player.department === 'Kids') return 'Kids';
  return `${player.department}:${player.gender}` as DeptGenderKey;
}

export function emptyDeptGenderCounts(): Record<DeptGenderKey, number> {
  return {
    Kids: 0,
    'YP:M': 0,
    'YP:F': 0,
    'SP:M': 0,
    'SP:F': 0,
    'Adults:M': 0,
    'Adults:F': 0,
  };
}

export const BALANCE_THRESHOLDS = {
  BALANCED_MAX_HEADCOUNT_DIFF: 1,
  BALANCED_MAX_LEVEL_DIFF: 2,
  FAIR_MAX_HEADCOUNT_DIFF: 2,
  FAIR_MAX_LEVEL_DIFF: 4,
} as const;

export const MAX_SWAP_ITERATIONS = 3000;

export function getEffectiveLevel(entry: PlayerEntry): SkillLevel {
  return entry.overrideLevel ?? entry.selfLevel;
}

export function getRegularEntries(
  player: Pick<Player, 'entries'>,
  gameById?: ReadonlyMap<string, Game>
): PlayerEntry[] {
  if (!gameById) return player.entries;
  return player.entries.filter((entry) => {
    const game = gameById.get(entry.gameId);
    return !game || game.type !== 'mass';
  });
}

export function getRegularMainEntries(
  player: Pick<Player, 'entries'>,
  gameById?: ReadonlyMap<string, Game>
): PlayerEntry[] {
  return getRegularEntries(player, gameById).filter(isMainEntry);
}

export function getPlayerTotalEffectiveLevel(
  player: Player,
  gameById?: ReadonlyMap<string, Game>
): number {
  return getRegularMainEntries(player, gameById).reduce((sum, entry) => {
    const game = gameById?.get(entry.gameId);
    if (game && !game.usesSkillLevel) return sum;
    return sum + getEffectiveLevel(entry);
  }, 0);
}

export interface UnresolvedSeparation {
  id: string;
  aName: string;
  bName: string;
  team: TeamId;
}

function getActiveSeparations(
  separations: readonly SeparationPair[],
  playerById: ReadonlyMap<string, Player>
): SeparationPair[] {
  const seen = new Set<string>();
  const active: SeparationPair[] = [];
  for (const pair of separations) {
    if (!pair.aId || !pair.bId || pair.aId === pair.bId) continue;
    if (!playerById.has(pair.aId) || !playerById.has(pair.bId)) continue;
    const key = pair.aId < pair.bId ? `${pair.aId}::${pair.bId}` : `${pair.bId}::${pair.aId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    active.push(pair);
  }
  return active;
}

function getSeparationPartnerIds(
  separations: readonly SeparationPair[],
  playerById: ReadonlyMap<string, Player>
): Set<string> {
  const ids = new Set<string>();
  for (const pair of getActiveSeparations(separations, playerById)) {
    ids.add(pair.aId);
    ids.add(pair.bId);
  }
  return ids;
}

export function getSeparationConflictsForTeam(
  playerId: string,
  targetTeam: TeamId,
  players: readonly Player[],
  separations: readonly SeparationPair[]
): Player[] {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const conflicts: Player[] = [];
  const seen = new Set<string>();
  for (const pair of getActiveSeparations(separations, playerById)) {
    const partnerId =
      pair.aId === playerId ? pair.bId : pair.bId === playerId ? pair.aId : null;
    if (!partnerId || seen.has(partnerId)) continue;
    const partner = playerById.get(partnerId);
    if (partner && partner.team === targetTeam) {
      seen.add(partnerId);
      conflicts.push(partner);
    }
  }
  return conflicts.sort((a, b) => a.name.localeCompare(b.name));
}

export function hasSeparationOddCycle(
  separations: readonly SeparationPair[],
  players: readonly Player[]
): boolean {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const adj = new Map<string, string[]>();
  for (const pair of getActiveSeparations(separations, playerById)) {
    if (!adj.has(pair.aId)) adj.set(pair.aId, []);
    if (!adj.has(pair.bId)) adj.set(pair.bId, []);
    adj.get(pair.aId)!.push(pair.bId);
    adj.get(pair.bId)!.push(pair.aId);
  }
  const color = new Map<string, 0 | 1>();
  for (const start of adj.keys()) {
    if (color.has(start)) continue;
    color.set(start, 0);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const curr = queue[i];
      const currColor = color.get(curr)!;
      for (const next of adj.get(curr) ?? []) {
        const nextColor = color.get(next);
        if (nextColor === undefined) {
          color.set(next, currColor === 0 ? 1 : 0);
          queue.push(next);
        } else if (nextColor === currColor) {
          return true;
        }
      }
    }
  }
  return false;
}

function findUnresolvedSeparations(
  separations: readonly SeparationPair[],
  playerById: ReadonlyMap<string, Player>,
  getTeam: (playerId: string) => TeamId | null
): UnresolvedSeparation[] {
  const unresolved: UnresolvedSeparation[] = [];
  for (const pair of getActiveSeparations(separations, playerById)) {
    const teamA = getTeam(pair.aId);
    const teamB = getTeam(pair.bId);
    if (teamA && teamA === teamB) {
      const playerA = playerById.get(pair.aId)!;
      const playerB = playerById.get(pair.bId)!;
      unresolved.push({
        id: pair.id,
        aName: playerA.name,
        bName: playerB.name,
        team: teamA,
      });
    }
  }
  return unresolved;
}

export function isGenderEligibleForGame(gender: Gender, game: Game): boolean {
  if (game.eligibility === 'everyone') return true;
  if (game.eligibility === 'men') return gender === 'M';
  return gender === 'F';
}

export function getGameBalanceBadge(
  headcountDiff: number,
  totalLevelDiff: number,
  game?: Pick<Game, 'usesSkillLevel'>
): BalanceStatus {
  const absHead = Math.abs(headcountDiff);
  if (game && !game.usesSkillLevel) {
    if (absHead <= BALANCE_THRESHOLDS.BALANCED_MAX_HEADCOUNT_DIFF) {
      return 'Balanced';
    }
    if (absHead <= BALANCE_THRESHOLDS.FAIR_MAX_HEADCOUNT_DIFF) {
      return 'Fair';
    }
    return 'Unbalanced';
  }

  const absLevel = Math.abs(totalLevelDiff);
  if (
    absHead <= BALANCE_THRESHOLDS.BALANCED_MAX_HEADCOUNT_DIFF &&
    absLevel <= BALANCE_THRESHOLDS.BALANCED_MAX_LEVEL_DIFF
  ) {
    return 'Balanced';
  }
  if (
    absHead <= BALANCE_THRESHOLDS.FAIR_MAX_HEADCOUNT_DIFF &&
    absLevel <= BALANCE_THRESHOLDS.FAIR_MAX_LEVEL_DIFF
  ) {
    return 'Fair';
  }
  return 'Unbalanced';
}

export interface TeamGameMetrics {
  headcount: number;
  totalLevel: number;
  deptHeadcount: Record<Department, number>;
  deptLevel: Record<Department, number>;
}

export interface GameStats {
  gameId: string;
  blue: TeamGameMetrics;
  red: TeamGameMetrics;
  unassignedCount: number;
  totalAssigned: number;
  headcountDiff: number;
  totalLevelDiff: number;
  cost: number;
  badge: BalanceStatus;
}

export function getDisplayGameBalanceStatus(stats: GameStats): DisplayBalanceStatus {
  const totalParticipants = stats.totalAssigned + stats.unassignedCount;
  if (totalParticipants === 0) return 'No players';
  if (stats.unassignedCount > 0 || (stats.blue.headcount === 0 && stats.red.headcount === 0)) {
    return 'Not assigned yet';
  }
  return stats.badge;
}

function emptyTeamMetrics(): TeamGameMetrics {
  return {
    headcount: 0,
    totalLevel: 0,
    deptHeadcount: { Kids: 0, YP: 0, SP: 0, Adults: 0 },
    deptLevel: { Kids: 0, YP: 0, SP: 0, Adults: 0 },
  };
}

interface GameBucketWithDivisions {
  blue: TeamGameMetrics;
  red: TeamGameMetrics;
  divisions: Record<SkillLevel, { blue: TeamGameMetrics; red: TeamGameMetrics }>;
}

function createEmptyBucket(): GameBucketWithDivisions {
  return {
    blue: emptyTeamMetrics(),
    red: emptyTeamMetrics(),
    divisions: {
      1: { blue: emptyTeamMetrics(), red: emptyTeamMetrics() },
      2: { blue: emptyTeamMetrics(), red: emptyTeamMetrics() },
      3: { blue: emptyTeamMetrics(), red: emptyTeamMetrics() },
    },
  };
}

export function computeGameCostFromMetrics(
  blue: TeamGameMetrics,
  red: TeamGameMetrics,
  usesSkillLevel: boolean = true
): number {
  if (blue.headcount === 0 && red.headcount === 0) return 0;

  const headcountDiff = blue.headcount - red.headcount;
  let deptHeadSqSum = 0;
  for (const dept of DEPARTMENTS) {
    const dh = blue.deptHeadcount[dept] - red.deptHeadcount[dept];
    deptHeadSqSum += dh * dh;
  }

  if (!usesSkillLevel) {
    return (
      COST_WEIGHTS.HEADCOUNT_DIFF * (headcountDiff * headcountDiff) +
      COST_WEIGHTS.DEPT_HEADCOUNT_DIFF * deptHeadSqSum
    );
  }

  const totalLevelDiff = blue.totalLevel - red.totalLevel;
  let deptLevelSqSum = 0;
  for (const dept of DEPARTMENTS) {
    const dl = blue.deptLevel[dept] - red.deptLevel[dept];
    deptLevelSqSum += dl * dl;
  }

  return (
    COST_WEIGHTS.TOTAL_LEVEL_DIFF * (totalLevelDiff * totalLevelDiff) +
    COST_WEIGHTS.HEADCOUNT_DIFF * (headcountDiff * headcountDiff) +
    COST_WEIGHTS.DEPT_HEADCOUNT_DIFF * deptHeadSqSum +
    COST_WEIGHTS.DEPT_LEVEL_DIFF * deptLevelSqSum
  );
}

function computeGameBucketCost(
  bucket: GameBucketWithDivisions,
  game?: Game
): number {
  if (game && !game.usesSkillLevel) {
    return computeGameCostFromMetrics(bucket.blue, bucket.red, false);
  }

  if (game && game.usesSkillLevel && game.hasDivisions) {
    // Treat each skill level (1, 2, 3) as its own sub-game with headcount weight doubled
    let cost = 0;
    const divisionHeadWeight = COST_WEIGHTS.HEADCOUNT_DIFF * 2;
    for (const lvl of [1, 2, 3] as SkillLevel[]) {
      const div = bucket.divisions[lvl];
      if (div.blue.headcount === 0 && div.red.headcount === 0) continue;
      const headDiff = div.blue.headcount - div.red.headcount;
      let deptHeadSqSum = 0;
      for (const dept of DEPARTMENTS) {
        const dh = div.blue.deptHeadcount[dept] - div.red.deptHeadcount[dept];
        deptHeadSqSum += dh * dh;
      }
      cost +=
        divisionHeadWeight * (headDiff * headDiff) +
        COST_WEIGHTS.DEPT_HEADCOUNT_DIFF * deptHeadSqSum;
    }
    return cost;
  }

  return computeGameCostFromMetrics(bucket.blue, bucket.red, true);
}

export function computeRosterCost(
  blueTotal: number,
  redTotal: number,
  blueDeptCounts: Record<Department, number>,
  redDeptCounts: Record<Department, number>,
  blueDeptGenderCounts?: Record<DeptGenderKey, number>,
  redDeptGenderCounts?: Record<DeptGenderKey, number>,
  blueChurchCounts?: ReadonlyMap<string, number>,
  redChurchCounts?: ReadonlyMap<string, number>
): number {
  const headDiff = blueTotal - redTotal;
  let deptSqSum = 0;
  for (const dept of DEPARTMENTS) {
    const d = blueDeptCounts[dept] - redDeptCounts[dept];
    deptSqSum += d * d;
  }
  let deptGenderSqSum = 0;
  if (blueDeptGenderCounts && redDeptGenderCounts) {
    for (const group of DEPT_GENDER_GROUPS) {
      const dg = blueDeptGenderCounts[group.key] - redDeptGenderCounts[group.key];
      deptGenderSqSum += dg * dg;
    }
  }
  let churchSqSum = 0;
  if (blueChurchCounts || redChurchCounts) {
    const seen = new Set<string>();
    if (blueChurchCounts) {
      for (const [key, bCount] of blueChurchCounts.entries()) {
        seen.add(key);
        const dc = bCount - (redChurchCounts?.get(key) ?? 0);
        churchSqSum += dc * dc;
      }
    }
    if (redChurchCounts) {
      for (const [key, rCount] of redChurchCounts.entries()) {
        if (seen.has(key)) continue;
        const dc = (blueChurchCounts?.get(key) ?? 0) - rCount;
        churchSqSum += dc * dc;
      }
    }
  }
  return (
    ROSTER_HEADCOUNT_WEIGHT * (headDiff * headDiff) +
    ROSTER_DEPARTMENT_WEIGHT * deptSqSum +
    ROSTER_DEPT_GENDER_WEIGHT * deptGenderSqSum +
    ROSTER_CHURCH_WEIGHT * churchSqSum
  );
}

export function computeGameStats(
  players: Player[],
  gameId: string,
  proposedMap?: ReadonlyMap<string, TeamId>,
  game?: Game
): GameStats {
  const bucket = createEmptyBucket();
  let unassignedCount = 0;

  for (const player of players) {
    const entry = player.entries.find((e) => e.gameId === gameId);
    if (!entry || !isMainEntry(entry)) continue;

    const assignedTeam = player.team ?? proposedMap?.get(player.id) ?? null;
    if (!assignedTeam) {
      unassignedCount += 1;
      continue;
    }

    const level = getEffectiveLevel(entry);
    const target = assignedTeam === 'blue' ? bucket.blue : bucket.red;
    target.headcount += 1;
    target.totalLevel += level;
    target.deptHeadcount[player.department] += 1;
    target.deptLevel[player.department] += level;

    const divTarget =
      assignedTeam === 'blue'
        ? bucket.divisions[level].blue
        : bucket.divisions[level].red;
    divTarget.headcount += 1;
    divTarget.totalLevel += level;
    divTarget.deptHeadcount[player.department] += 1;
    divTarget.deptLevel[player.department] += level;
  }

  const headcountDiff = Math.abs(bucket.blue.headcount - bucket.red.headcount);
  const totalLevelDiff = Math.abs(bucket.blue.totalLevel - bucket.red.totalLevel);

  return {
    gameId,
    blue: bucket.blue,
    red: bucket.red,
    unassignedCount,
    totalAssigned: bucket.blue.headcount + bucket.red.headcount,
    headcountDiff,
    totalLevelDiff,
    cost: computeGameBucketCost(bucket, game),
    badge: getGameBalanceBadge(headcountDiff, totalLevelDiff, game),
  };
}

export function computeAllGameStats(
  players: Player[],
  games: Game[],
  proposedMap?: ReadonlyMap<string, TeamId>
): GameStats[] {
  return games
    .filter((g) => g.type !== 'mass')
    .map((g) => computeGameStats(players, g.id, proposedMap, g));
}

export function computeTotalCost(
  players: Player[],
  games: Game[] = [],
  proposedMap?: ReadonlyMap<string, TeamId>,
  separations: readonly SeparationPair[] = []
): number {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const gameMap = new Map<string, GameBucketWithDivisions>();
  const teamByPlayerId = new Map<string, TeamId>();
  let blueTotal = 0;
  let redTotal = 0;
  const blueDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const redDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const blueDeptGenderCounts = emptyDeptGenderCounts();
  const redDeptGenderCounts = emptyDeptGenderCounts();
  const blueChurchCounts = new Map<string, number>();
  const redChurchCounts = new Map<string, number>();

  for (const player of players) {
    const assignedTeam = player.team ?? proposedMap?.get(player.id) ?? null;
    if (!assignedTeam) continue;
    teamByPlayerId.set(player.id, assignedTeam);

    const dgKey = getDeptGenderKey(player);
    const churchKey = getPlayerChurchKey(player);
    if (assignedTeam === 'blue') {
      blueTotal += 1;
      blueDeptCounts[player.department] += 1;
      blueDeptGenderCounts[dgKey] += 1;
      blueChurchCounts.set(churchKey, (blueChurchCounts.get(churchKey) ?? 0) + 1);
    } else {
      redTotal += 1;
      redDeptCounts[player.department] += 1;
      redDeptGenderCounts[dgKey] += 1;
      redChurchCounts.set(churchKey, (redChurchCounts.get(churchKey) ?? 0) + 1);
    }

    for (const entry of player.entries) {
      if (!isMainEntry(entry) || gameById.get(entry.gameId)?.type === 'mass') continue;
      let bucket = gameMap.get(entry.gameId);
      if (!bucket) {
        bucket = createEmptyBucket();
        gameMap.set(entry.gameId, bucket);
      }
      const level = getEffectiveLevel(entry);
      const target = assignedTeam === 'blue' ? bucket.blue : bucket.red;
      target.headcount += 1;
      target.totalLevel += level;
      target.deptHeadcount[player.department] += 1;
      target.deptLevel[player.department] += level;

      const divTarget =
        assignedTeam === 'blue'
          ? bucket.divisions[level].blue
          : bucket.divisions[level].red;
      divTarget.headcount += 1;
      divTarget.totalLevel += level;
      divTarget.deptHeadcount[player.department] += 1;
      divTarget.deptLevel[player.department] += level;
    }
  }

  let totalCost = computeRosterCost(
    blueTotal,
    redTotal,
    blueDeptCounts,
    redDeptCounts,
    blueDeptGenderCounts,
    redDeptGenderCounts,
    blueChurchCounts,
    redChurchCounts
  );
  for (const [gameId, bucket] of gameMap.entries()) {
    totalCost += computeGameBucketCost(bucket, gameById.get(gameId));
  }
  for (const pair of getActiveSeparations(separations, playerById)) {
    const teamA = teamByPlayerId.get(pair.aId);
    if (teamA && teamA === teamByPlayerId.get(pair.bId)) {
      totalCost += SEPARATION_PENALTY;
    }
  }
  return totalCost;
}

// Fast mutable state used internally by assignment planners
interface MutableRosterState {
  buckets: Map<string, GameBucketWithDivisions>;
  gameById: Map<string, Game>;
  teamByPlayerId: Map<string, TeamId>;
  separationPairs: SeparationPair[];
  blueTotalPlayers: number;
  redTotalPlayers: number;
  blueDeptCounts: Record<Department, number>;
  redDeptCounts: Record<Department, number>;
  blueDeptGenderCounts: Record<DeptGenderKey, number>;
  redDeptGenderCounts: Record<DeptGenderKey, number>;
  blueChurchCounts: Map<string, number>;
  redChurchCounts: Map<string, number>;
}

function buildMutableState(
  players: Player[],
  games: Game[],
  separations: readonly SeparationPair[] = []
): MutableRosterState {
  const buckets = new Map<string, GameBucketWithDivisions>();
  const gameById = new Map(games.map((g) => [g.id, g]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const teamByPlayerId = new Map<string, TeamId>();
  let blueTotalPlayers = 0;
  let redTotalPlayers = 0;
  const blueDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const redDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const blueDeptGenderCounts = emptyDeptGenderCounts();
  const redDeptGenderCounts = emptyDeptGenderCounts();
  const blueChurchCounts = new Map<string, number>();
  const redChurchCounts = new Map<string, number>();

  for (const player of players) {
    if (!player.team) continue;
    teamByPlayerId.set(player.id, player.team);
    const dgKey = getDeptGenderKey(player);
    const churchKey = getPlayerChurchKey(player);
    if (player.team === 'blue') {
      blueTotalPlayers += 1;
      blueDeptCounts[player.department] += 1;
      blueDeptGenderCounts[dgKey] += 1;
      blueChurchCounts.set(churchKey, (blueChurchCounts.get(churchKey) ?? 0) + 1);
    } else {
      redTotalPlayers += 1;
      redDeptCounts[player.department] += 1;
      redDeptGenderCounts[dgKey] += 1;
      redChurchCounts.set(churchKey, (redChurchCounts.get(churchKey) ?? 0) + 1);
    }

    for (const entry of player.entries) {
      if (!isMainEntry(entry) || gameById.get(entry.gameId)?.type === 'mass') continue;
      let bucket = buckets.get(entry.gameId);
      if (!bucket) {
        bucket = createEmptyBucket();
        buckets.set(entry.gameId, bucket);
      }
      const level = getEffectiveLevel(entry);
      const target = player.team === 'blue' ? bucket.blue : bucket.red;
      target.headcount += 1;
      target.totalLevel += level;
      target.deptHeadcount[player.department] += 1;
      target.deptLevel[player.department] += level;

      const divTarget =
        player.team === 'blue'
          ? bucket.divisions[level].blue
          : bucket.divisions[level].red;
      divTarget.headcount += 1;
      divTarget.totalLevel += level;
      divTarget.deptHeadcount[player.department] += 1;
      divTarget.deptLevel[player.department] += level;
    }
  }

  return {
    buckets,
    gameById,
    teamByPlayerId,
    separationPairs: getActiveSeparations(separations, playerById),
    blueTotalPlayers,
    redTotalPlayers,
    blueDeptCounts,
    redDeptCounts,
    blueDeptGenderCounts,
    redDeptGenderCounts,
    blueChurchCounts,
    redChurchCounts,
  };
}

function applyPlayerToState(
  state: MutableRosterState,
  player: Player,
  team: TeamId,
  sign: 1 | -1
): void {
  if (sign === 1) {
    state.teamByPlayerId.set(player.id, team);
  } else {
    state.teamByPlayerId.delete(player.id);
  }

  const dgKey = getDeptGenderKey(player);
  const churchKey = getPlayerChurchKey(player);
  if (team === 'blue') {
    state.blueTotalPlayers += sign;
    state.blueDeptCounts[player.department] += sign;
    state.blueDeptGenderCounts[dgKey] += sign;
    state.blueChurchCounts.set(
      churchKey,
      (state.blueChurchCounts.get(churchKey) ?? 0) + sign
    );
  } else {
    state.redTotalPlayers += sign;
    state.redDeptCounts[player.department] += sign;
    state.redDeptGenderCounts[dgKey] += sign;
    state.redChurchCounts.set(
      churchKey,
      (state.redChurchCounts.get(churchKey) ?? 0) + sign
    );
  }

  for (const entry of player.entries) {
    if (!isMainEntry(entry) || state.gameById.get(entry.gameId)?.type === 'mass') continue;
    let bucket = state.buckets.get(entry.gameId);
    if (!bucket) {
      bucket = createEmptyBucket();
      state.buckets.set(entry.gameId, bucket);
    }
    const level = getEffectiveLevel(entry);
    const target = team === 'blue' ? bucket.blue : bucket.red;
    target.headcount += sign;
    target.totalLevel += sign * level;
    target.deptHeadcount[player.department] += sign;
    target.deptLevel[player.department] += sign * level;

    const divTarget =
      team === 'blue'
        ? bucket.divisions[level].blue
        : bucket.divisions[level].red;
    divTarget.headcount += sign;
    divTarget.totalLevel += sign * level;
    divTarget.deptHeadcount[player.department] += sign;
    divTarget.deptLevel[player.department] += sign * level;
  }
}

function computeStateSeparationCost(state: MutableRosterState): number {
  let penalty = 0;
  for (const pair of state.separationPairs) {
    const teamA = state.teamByPlayerId.get(pair.aId);
    if (teamA && teamA === state.teamByPlayerId.get(pair.bId)) {
      penalty += SEPARATION_PENALTY;
    }
  }
  return penalty;
}

function computeLocalSeparationCost(
  state: MutableRosterState,
  id1: string,
  id2: string
): number {
  let penalty = 0;
  for (const pair of state.separationPairs) {
    if (
      pair.aId !== id1 &&
      pair.bId !== id1 &&
      pair.aId !== id2 &&
      pair.bId !== id2
    ) {
      continue;
    }
    const teamA = state.teamByPlayerId.get(pair.aId);
    if (teamA && teamA === state.teamByPlayerId.get(pair.bId)) {
      penalty += SEPARATION_PENALTY;
    }
  }
  return penalty;
}

function sumAllStateCost(state: MutableRosterState): number {
  let total = computeRosterCost(
    state.blueTotalPlayers,
    state.redTotalPlayers,
    state.blueDeptCounts,
    state.redDeptCounts,
    state.blueDeptGenderCounts,
    state.redDeptGenderCounts,
    state.blueChurchCounts,
    state.redChurchCounts
  );
  for (const [gameId, bucket] of state.buckets.entries()) {
    total += computeGameBucketCost(bucket, state.gameById.get(gameId));
  }
  total += computeStateSeparationCost(state);
  return total;
}

function deltaCostForSwap(
  state: MutableRosterState,
  pBlue: Player,
  pRed: Player
): number {
  const touchedGames = new Set<string>();
  for (const e of pBlue.entries) {
    if (isMainEntry(e) && state.gameById.get(e.gameId)?.type !== 'mass') {
      touchedGames.add(e.gameId);
    }
  }
  for (const e of pRed.entries) {
    if (isMainEntry(e) && state.gameById.get(e.gameId)?.type !== 'mass') {
      touchedGames.add(e.gameId);
    }
  }

  let before =
    computeRosterCost(
      state.blueTotalPlayers,
      state.redTotalPlayers,
      state.blueDeptCounts,
      state.redDeptCounts,
      state.blueDeptGenderCounts,
      state.redDeptGenderCounts,
      state.blueChurchCounts,
      state.redChurchCounts
    ) + computeLocalSeparationCost(state, pBlue.id, pRed.id);
  for (const gId of touchedGames) {
    const b = state.buckets.get(gId);
    if (b) before += computeGameBucketCost(b, state.gameById.get(gId));
  }

  applyPlayerToState(state, pBlue, 'blue', -1);
  applyPlayerToState(state, pRed, 'red', -1);
  applyPlayerToState(state, pBlue, 'red', 1);
  applyPlayerToState(state, pRed, 'blue', 1);

  let after =
    computeRosterCost(
      state.blueTotalPlayers,
      state.redTotalPlayers,
      state.blueDeptCounts,
      state.redDeptCounts,
      state.blueDeptGenderCounts,
      state.redDeptGenderCounts,
      state.blueChurchCounts,
      state.redChurchCounts
    ) + computeLocalSeparationCost(state, pBlue.id, pRed.id);
  for (const gId of touchedGames) {
    const b = state.buckets.get(gId);
    if (b) after += computeGameBucketCost(b, state.gameById.get(gId));
  }

  // Revert back
  applyPlayerToState(state, pBlue, 'red', -1);
  applyPlayerToState(state, pRed, 'blue', -1);
  applyPlayerToState(state, pBlue, 'blue', 1);
  applyPlayerToState(state, pRed, 'red', 1);

  return after - before;
}

export interface GameBalanceComparison {
  game: Game;
  before: GameStats;
  after: GameStats;
}

export interface BulkDepartmentComparison {
  before: {
    blue: Record<Department, number>;
    red: Record<Department, number>;
  };
  after: {
    blue: Record<Department, number>;
    red: Record<Department, number>;
  };
}

export interface BulkAssignmentPlan {
  proposedBlue: Player[];
  proposedRed: Player[];
  proposedTeamByPlayerId: Record<string, TeamId>;
  beforeCost: number;
  afterCost: number;
  iterationsUsed: number;
  gameComparisons: GameBalanceComparison[];
  departmentComparison: BulkDepartmentComparison;
  deptGenderAfter: {
    blue: Record<DeptGenderKey, number>;
    red: Record<DeptGenderKey, number>;
  };
  churchAfter: ChurchTeamCount[];
  unresolvedSeparations: UnresolvedSeparation[];
}

function currentRosterCost(state: MutableRosterState): number {
  return (
    computeRosterCost(
      state.blueTotalPlayers,
      state.redTotalPlayers,
      state.blueDeptCounts,
      state.redDeptCounts,
      state.blueDeptGenderCounts,
      state.redDeptGenderCounts,
      state.blueChurchCounts,
      state.redChurchCounts
    ) + computeStateSeparationCost(state)
  );
}

function deltaRosterCostForSwap(
  state: MutableRosterState,
  pBlue: Player,
  pRed: Player
): number {
  const before =
    computeRosterCost(
      state.blueTotalPlayers,
      state.redTotalPlayers,
      state.blueDeptCounts,
      state.redDeptCounts,
      state.blueDeptGenderCounts,
      state.redDeptGenderCounts,
      state.blueChurchCounts,
      state.redChurchCounts
    ) + computeLocalSeparationCost(state, pBlue.id, pRed.id);
  applyPlayerToState(state, pBlue, 'blue', -1);
  applyPlayerToState(state, pRed, 'red', -1);
  applyPlayerToState(state, pBlue, 'red', 1);
  applyPlayerToState(state, pRed, 'blue', 1);
  const after =
    computeRosterCost(
      state.blueTotalPlayers,
      state.redTotalPlayers,
      state.blueDeptCounts,
      state.redDeptCounts,
      state.blueDeptGenderCounts,
      state.redDeptGenderCounts,
      state.blueChurchCounts,
      state.redChurchCounts
    ) + computeLocalSeparationCost(state, pBlue.id, pRed.id);
  applyPlayerToState(state, pBlue, 'red', -1);
  applyPlayerToState(state, pRed, 'blue', -1);
  applyPlayerToState(state, pBlue, 'blue', 1);
  applyPlayerToState(state, pRed, 'red', 1);
  return after - before;
}

export function planBulkAssignment(
  allPlayers: Player[],
  games: Game[],
  separations: readonly SeparationPair[] = []
): BulkAssignmentPlan {
  const regularGames = games.filter((g) => g.type !== 'mass');
  const gameById = new Map(games.map((g) => [g.id, g]));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const rulePlayerIds = getSeparationPartnerIds(separations, playerById);
  const unassigned = allPlayers.filter((p) => p.team === null);

  const withGames = unassigned
    .filter((p) => getRegularMainEntries(p, gameById).length > 0)
    .sort((a, b) => {
      const levelDiff =
        getPlayerTotalEffectiveLevel(b, gameById) -
        getPlayerTotalEffectiveLevel(a, gameById);
      if (levelDiff !== 0) return levelDiff;
      const entryDiff =
        getRegularMainEntries(b, gameById).length - getRegularMainEntries(a, gameById).length;
      if (entryDiff !== 0) return entryDiff;
      const ruleDiff = (rulePlayerIds.has(b.id) ? 1 : 0) - (rulePlayerIds.has(a.id) ? 1 : 0);
      if (ruleDiff !== 0) return ruleDiff;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

  const noGames = unassigned
    .filter((p) => getRegularMainEntries(p, gameById).length === 0)
    .sort((a, b) => {
      const ruleDiff = (rulePlayerIds.has(b.id) ? 1 : 0) - (rulePlayerIds.has(a.id) ? 1 : 0);
      if (ruleDiff !== 0) return ruleDiff;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

  const beforeCost = computeTotalCost(allPlayers, games, undefined, separations);
  const state = buildMutableState(allPlayers, games, separations);

  // Phase 1: Players with at least one game (full cost + local swaps)
  const withGamesBlue: Player[] = [];
  const withGamesRed: Player[] = [];

  for (const player of withGames) {
    applyPlayerToState(state, player, 'blue', 1);
    const blueCost = sumAllStateCost(state);
    applyPlayerToState(state, player, 'blue', -1);

    applyPlayerToState(state, player, 'red', 1);
    const redCost = sumAllStateCost(state);
    applyPlayerToState(state, player, 'red', -1);

    let chosen: TeamId;
    if (blueCost < redCost) {
      chosen = 'blue';
    } else if (redCost < blueCost) {
      chosen = 'red';
    } else if (state.blueTotalPlayers !== state.redTotalPlayers) {
      chosen = state.blueTotalPlayers < state.redTotalPlayers ? 'blue' : 'red';
    } else {
      chosen = 'blue';
    }

    applyPlayerToState(state, player, chosen, 1);
    if (chosen === 'blue') {
      withGamesBlue.push(player);
    } else {
      withGamesRed.push(player);
    }
  }

  let iterationsUsed = 0;
  while (iterationsUsed < MAX_SWAP_ITERATIONS && withGamesBlue.length > 0 && withGamesRed.length > 0) {
    let bestDelta = 0;
    let bestBlueIdx = -1;
    let bestRedIdx = -1;

    for (let bi = 0; bi < withGamesBlue.length; bi++) {
      for (let ri = 0; ri < withGamesRed.length; ri++) {
        const delta = deltaCostForSwap(state, withGamesBlue[bi], withGamesRed[ri]);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestBlueIdx = bi;
          bestRedIdx = ri;
        }
      }
    }

    if (bestBlueIdx === -1 || bestRedIdx === -1) {
      break;
    }

    const pBlue = withGamesBlue[bestBlueIdx];
    const pRed = withGamesRed[bestRedIdx];

    applyPlayerToState(state, pBlue, 'blue', -1);
    applyPlayerToState(state, pRed, 'red', -1);
    applyPlayerToState(state, pBlue, 'red', 1);
    applyPlayerToState(state, pRed, 'blue', 1);

    withGamesBlue[bestBlueIdx] = pRed;
    withGamesRed[bestRedIdx] = pBlue;
    iterationsUsed += 1;
  }

  // Phase 2: Players with no games, placed last using only roster-level terms
  const noGamesBlue: Player[] = [];
  const noGamesRed: Player[] = [];

  for (const player of noGames) {
    applyPlayerToState(state, player, 'blue', 1);
    const blueCost = currentRosterCost(state);
    applyPlayerToState(state, player, 'blue', -1);

    applyPlayerToState(state, player, 'red', 1);
    const redCost = currentRosterCost(state);
    applyPlayerToState(state, player, 'red', -1);

    let chosen: TeamId;
    if (blueCost < redCost) {
      chosen = 'blue';
    } else if (redCost < blueCost) {
      chosen = 'red';
    } else if (state.blueTotalPlayers !== state.redTotalPlayers) {
      chosen = state.blueTotalPlayers < state.redTotalPlayers ? 'blue' : 'red';
    } else {
      chosen = 'blue';
    }

    applyPlayerToState(state, player, chosen, 1);
    if (chosen === 'blue') {
      noGamesBlue.push(player);
    } else {
      noGamesRed.push(player);
    }
  }

  while (iterationsUsed < MAX_SWAP_ITERATIONS && noGamesBlue.length > 0 && noGamesRed.length > 0) {
    let bestDelta = 0;
    let bestBlueIdx = -1;
    let bestRedIdx = -1;

    for (let bi = 0; bi < noGamesBlue.length; bi++) {
      for (let ri = 0; ri < noGamesRed.length; ri++) {
        const delta = deltaRosterCostForSwap(state, noGamesBlue[bi], noGamesRed[ri]);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestBlueIdx = bi;
          bestRedIdx = ri;
        }
      }
    }

    if (bestBlueIdx === -1 || bestRedIdx === -1) {
      break;
    }

    const pBlue = noGamesBlue[bestBlueIdx];
    const pRed = noGamesRed[bestRedIdx];

    applyPlayerToState(state, pBlue, 'blue', -1);
    applyPlayerToState(state, pRed, 'red', -1);
    applyPlayerToState(state, pBlue, 'red', 1);
    applyPlayerToState(state, pRed, 'blue', 1);

    noGamesBlue[bestBlueIdx] = pRed;
    noGamesRed[bestRedIdx] = pBlue;
    iterationsUsed += 1;
  }

  const proposedBlue = [...withGamesBlue, ...noGamesBlue];
  const proposedRed = [...withGamesRed, ...noGamesRed];

  const proposedMap = new Map<string, TeamId>();
  const proposedTeamByPlayerId: Record<string, TeamId> = {};
  for (const p of proposedBlue) {
    proposedMap.set(p.id, 'blue');
    proposedTeamByPlayerId[p.id] = 'blue';
  }
  for (const p of proposedRed) {
    proposedMap.set(p.id, 'red');
    proposedTeamByPlayerId[p.id] = 'red';
  }

  const afterCost = computeTotalCost(allPlayers, games, proposedMap, separations);
  const unresolvedSeparations = findUnresolvedSeparations(
    separations,
    playerById,
    (id) => proposedMap.get(id) ?? playerById.get(id)?.team ?? null
  );
  const gameComparisons: GameBalanceComparison[] = regularGames
    .map((game) => ({
      game,
      before: computeGameStats(allPlayers, game.id, undefined, game),
      after: computeGameStats(allPlayers, game.id, proposedMap, game),
    }))
    .filter((item) => item.after.totalAssigned > 0 || item.before.unassignedCount > 0);

  const beforeDeptBlue: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const beforeDeptRed: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const afterDeptBlue: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const afterDeptRed: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const afterDeptGenderBlue = emptyDeptGenderCounts();
  const afterDeptGenderRed = emptyDeptGenderCounts();

  for (const p of allPlayers) {
    const dgKey = getDeptGenderKey(p);
    if (p.team === 'blue') {
      beforeDeptBlue[p.department] += 1;
      afterDeptBlue[p.department] += 1;
      afterDeptGenderBlue[dgKey] += 1;
    } else if (p.team === 'red') {
      beforeDeptRed[p.department] += 1;
      afterDeptRed[p.department] += 1;
      afterDeptGenderRed[dgKey] += 1;
    } else {
      const proposed = proposedMap.get(p.id);
      if (proposed === 'blue') {
        afterDeptBlue[p.department] += 1;
        afterDeptGenderBlue[dgKey] += 1;
      } else if (proposed === 'red') {
        afterDeptRed[p.department] += 1;
        afterDeptGenderRed[dgKey] += 1;
      }
    }
  }

  return {
    proposedBlue,
    proposedRed,
    proposedTeamByPlayerId,
    beforeCost,
    afterCost,
    iterationsUsed,
    gameComparisons,
    departmentComparison: {
      before: { blue: beforeDeptBlue, red: beforeDeptRed },
      after: { blue: afterDeptBlue, red: afterDeptRed },
    },
    deptGenderAfter: {
      blue: afterDeptGenderBlue,
      red: afterDeptGenderRed,
    },
    churchAfter: computeChurchCounts(allPlayers, proposedMap),
    unresolvedSeparations,
  };
}

export interface JoinedGameBalance {
  game: Game;
  badge: BalanceStatus;
  blueCount: number;
  redCount: number;
  blueLevel: number;
  redLevel: number;
}

export interface SingleAssignmentResult {
  team: TeamId;
  reason: string;
  joinedGames: JoinedGameBalance[];
  unresolvedSeparations?: UnresolvedSeparation[];
}

function buildJoinedGameBalances(
  targetPlayer: Player,
  chosen: TeamId,
  existingPlayers: Player[],
  games: Game[]
): JoinedGameBalance[] {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const proposedMap = new Map<string, TeamId>([[targetPlayer.id, chosen]]);
  const updatedList = [...existingPlayers, { ...targetPlayer, team: chosen }];

  return targetPlayer.entries
    .filter(isMainEntry)
    .map((entry) => {
      const game = gameById.get(entry.gameId);
      if (!game || game.type === 'mass') return null;
      const stats = computeGameStats(updatedList, game.id, proposedMap, game);
      return {
        game,
        badge: stats.badge,
        blueCount: stats.blue.headcount,
        redCount: stats.red.headcount,
        blueLevel: stats.blue.totalLevel,
        redLevel: stats.red.totalLevel,
      };
    })
    .filter((item): item is JoinedGameBalance => item !== null);
}

export function buildManualSingleAssignmentResult(
  targetPlayer: Player,
  chosen: TeamId,
  allPlayers: Player[],
  games: Game[],
  separations: readonly SeparationPair[] = []
): SingleAssignmentResult {
  const existingPlayers = allPlayers.filter((p) => p.id !== targetPlayer.id);
  const conflicts = getSeparationConflictsForTeam(
    targetPlayer.id,
    chosen,
    existingPlayers,
    separations
  );
  return {
    team: chosen,
    reason: 'Assigned manually by Admin',
    joinedGames: buildJoinedGameBalances(targetPlayer, chosen, existingPlayers, games),
    unresolvedSeparations: conflicts.map((partner) => ({
      id: `${targetPlayer.id}::${partner.id}`,
      aName: targetPlayer.name,
      bName: partner.name,
      team: chosen,
    })),
  };
}

export function previewSingleTeamHint(
  targetPlayer: Player,
  team: TeamId,
  allPlayers: Player[],
  games: Game[]
): string {
  const existingPlayers = allPlayers.filter((p) => p.id !== targetPlayer.id);
  const joined = buildJoinedGameBalances(targetPlayer, team, existingPlayers, games);
  if (joined.length === 0) {
    return 'No games - affects overall headcount only';
  }

  const severity: Record<BalanceStatus, number> = {
    Unbalanced: 3,
    Fair: 2,
    Balanced: 1,
  };

  let worst = joined[0];
  for (const item of joined) {
    if (severity[item.badge] > severity[worst.badge]) {
      worst = item;
    }
  }
  return `${worst.game.name} would be ${worst.badge}`;
}

export interface MoveGameBalanceDiff {
  game: Game;
  before: BalanceStatus;
  after: BalanceStatus;
}

export function previewMovePlayerGameBalances(
  player: Player,
  updatedEntries: PlayerEntry[],
  targetTeam: TeamId,
  allPlayers: Player[],
  games: Game[]
): MoveGameBalanceDiff[] {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const others = allPlayers.filter((p) => p.id !== player.id);
  const beforePlayers = [...others, player];
  const afterPlayers = [...others, { ...player, entries: updatedEntries, team: targetTeam }];

  return updatedEntries
    .filter(isMainEntry)
    .map((entry) => {
      const game = gameById.get(entry.gameId);
      if (!game || game.type === 'mass') return null;
      const beforeStats = computeGameStats(beforePlayers, game.id, undefined, game);
      const afterStats = computeGameStats(afterPlayers, game.id, undefined, game);
      return {
        game,
        before: beforeStats.badge,
        after: afterStats.badge,
      };
    })
    .filter((item): item is MoveGameBalanceDiff => item !== null);
}

export function planSingleAssignment(
  targetPlayer: Player,
  allPlayers: Player[],
  games: Game[],
  randomFn: () => number = Math.random,
  separations: readonly SeparationPair[] = []
): SingleAssignmentResult {
  const existingPlayers = allPlayers.filter((p) => p.id !== targetPlayer.id);
  const state = buildMutableState(
    [...existingPlayers, { ...targetPlayer, team: null }],
    games,
    separations
  );

  applyPlayerToState(state, targetPlayer, 'blue', 1);
  const blueCost = sumAllStateCost(state);
  applyPlayerToState(state, targetPlayer, 'blue', -1);

  applyPlayerToState(state, targetPlayer, 'red', 1);
  const redCost = sumAllStateCost(state);
  applyPlayerToState(state, targetPlayer, 'red', -1);

  let chosen: TeamId;
  if (blueCost < redCost) {
    chosen = 'blue';
  } else if (redCost < blueCost) {
    chosen = 'red';
  } else if (state.blueTotalPlayers !== state.redTotalPlayers) {
    chosen = state.blueTotalPlayers < state.redTotalPlayers ? 'blue' : 'red';
  } else {
    chosen = randomFn() < 0.5 ? 'blue' : 'red';
  }

  // Generate clear one-line reason
  const teamLabel = chosen === 'blue' ? 'Blue' : 'Red';
  const otherTeam: TeamId = chosen === 'blue' ? 'red' : 'blue';
  const conflictsOnChosen = getSeparationConflictsForTeam(
    targetPlayer.id,
    chosen,
    existingPlayers,
    separations
  );
  const conflictsOnOther = getSeparationConflictsForTeam(
    targetPlayer.id,
    otherTeam,
    existingPlayers,
    separations
  );
  const gameById = new Map(games.map((g) => [g.id, g]));

  let bestHighlightGameName: string | null = null;
  let fewerPlayers = false;
  let lowerSkill = false;
  let bestGapScore = -1;

  for (const entry of targetPlayer.entries) {
    if (!isMainEntry(entry)) continue;
    const game = gameById.get(entry.gameId);
    if (game?.type === 'mass') continue;
    const b = state.buckets.get(entry.gameId);
    const effLvl = getEffectiveLevel(entry);

    if (game?.hasDivisions && game.usesSkillLevel) {
      const divChosen = b ? b.divisions[effLvl][chosen] : emptyTeamMetrics();
      const divOther = b ? b.divisions[effLvl][otherTeam] : emptyTeamMetrics();
      const divHcGap = divOther.headcount - divChosen.headcount;
      const score = Math.max(0, divHcGap) * 4;
      if (score > bestGapScore && divHcGap > 0) {
        bestGapScore = score;
        bestHighlightGameName = `${game.name} (L${effLvl})`;
        fewerPlayers = true;
        lowerSkill = false;
      }
      continue;
    }

    const chosenMetrics = b ? b[chosen] : emptyTeamMetrics();
    const otherMetrics = b ? b[otherTeam] : emptyTeamMetrics();
    const hcGap = otherMetrics.headcount - chosenMetrics.headcount;
    const lvlGap = game?.usesSkillLevel
      ? otherMetrics.totalLevel - chosenMetrics.totalLevel
      : 0;
    const score = Math.max(0, hcGap) * 2 + Math.max(0, lvlGap);

    if (score > bestGapScore && (hcGap > 0 || lvlGap > 0)) {
      bestGapScore = score;
      bestHighlightGameName = game?.name ?? null;
      fewerPlayers = hcGap > 0;
      lowerSkill = lvlGap > 0;
    }
  }

  let reason: string;
  if (conflictsOnOther.length > conflictsOnChosen.length) {
    reason = `Kept apart from ${conflictsOnOther.map((p) => p.name).join(', ')}`;
  } else if (bestHighlightGameName && fewerPlayers && lowerSkill) {
    reason = `${teamLabel} had fewer ${bestHighlightGameName} players and lower total skill`;
  } else if (bestHighlightGameName && fewerPlayers) {
    reason = `${teamLabel} had fewer ${bestHighlightGameName} players`;
  } else if (bestHighlightGameName && lowerSkill) {
    reason = `${teamLabel} had lower total skill in ${bestHighlightGameName}`;
  } else if (state.blueTotalPlayers !== state.redTotalPlayers) {
    reason = `${teamLabel} had fewer total team members`;
  } else {
    reason = `${teamLabel} kept overall game and department balance closest`;
  }

  return {
    team: chosen,
    reason,
    joinedGames: buildJoinedGameBalances(targetPlayer, chosen, existingPlayers, games),
    unresolvedSeparations: conflictsOnChosen.map((partner) => ({
      id: `${targetPlayer.id}::${partner.id}`,
      aName: targetPlayer.name,
      bName: partner.name,
      team: chosen,
    })),
  };
}

export function getLockedGameIds(
  bracketsByGameId: ReadonlyMap<string, Bracket>,
  pairsByGameId: ReadonlyMap<string, GamePairs>
): Set<string> {
  const locked = new Set<string>();
  for (const gameId of pairsByGameId.keys()) {
    locked.add(gameId);
  }
  for (const docId of bracketsByGameId.keys()) {
    const divIdx = docId.lastIndexOf('__L');
    const gameId = divIdx > 0 ? docId.slice(0, divIdx) : docId;
    locked.add(gameId);
  }
  return locked;
}

export interface RebalanceMove {
  player: Player;
  fromTeam: TeamId;
  toTeam: TeamId;
  reason: string;
}

export interface RebalanceGameBadgeChange {
  game: Game;
  before: GameStats;
  after: GameStats;
  beforeBadge: DisplayBalanceStatus;
  afterBadge: DisplayBalanceStatus;
}

export interface RebalancePlan {
  lockedCount: number;
  beforeCost: number;
  afterCost: number;
  moves: RebalanceMove[];
  changesByPlayerId: Record<string, TeamId>;
  totalsBefore: { blue: number; red: number };
  totalsAfter: { blue: number; red: number };
  deptGenderBefore: {
    blue: Record<DeptGenderKey, number>;
    red: Record<DeptGenderKey, number>;
  };
  deptGenderAfter: {
    blue: Record<DeptGenderKey, number>;
    red: Record<DeptGenderKey, number>;
  };
  changedGames: RebalanceGameBadgeChange[];
  unresolvedSeparations: UnresolvedSeparation[];
}

const DEPT_GENDER_REASON_LABELS: Record<DeptGenderKey, string> = {
  Kids: 'Kids',
  'YP:M': 'YP Males',
  'YP:F': 'YP Females',
  'SP:M': 'SP Males',
  'SP:F': 'SP Females',
  'Adults:M': 'Adults Males',
  'Adults:F': 'Adults Females',
};

function hasAnyUnbalancedGame(state: MutableRosterState, games: Game[]): boolean {
  for (const game of games) {
    const bucket = state.buckets.get(game.id);
    if (!bucket) continue;
    if (bucket.blue.headcount === 0 && bucket.red.headcount === 0) continue;
    const badge = getGameBalanceBadge(
      bucket.blue.headcount - bucket.red.headcount,
      bucket.blue.totalLevel - bucket.red.totalLevel,
      game
    );
    if (badge === 'Unbalanced') return true;
  }
  return false;
}

function buildRebalanceMoveReason(
  player: Player,
  fromTeam: TeamId,
  toTeam: TeamId,
  totalsBefore: { blue: number; red: number },
  deptGenderBefore: { blue: Record<DeptGenderKey, number>; red: Record<DeptGenderKey, number> },
  churchBefore: { blue: ReadonlyMap<string, number>; red: ReadonlyMap<string, number> },
  gameBeforeStats: ReadonlyMap<string, GameStats>,
  gameById: ReadonlyMap<string, Game>,
  resolvedPartners: string[] = []
): string {
  if (resolvedPartners.length > 0) {
    return `separates from ${resolvedPartners.join(', ')}`;
  }

  for (const entry of player.entries) {
    if (!isMainEntry(entry)) continue;
    const g = gameById.get(entry.gameId);
    const st = gameBeforeStats.get(entry.gameId);
    if (!g || !st) continue;
    const fromCount = st[fromTeam].headcount;
    const toCount = st[toTeam].headcount;
    const fromLvl = st[fromTeam].totalLevel;
    const toLvl = st[toTeam].totalLevel;
    if (st.badge === 'Unbalanced' || fromCount > toCount || (g.usesSkillLevel && fromLvl > toLvl)) {
      return g.usesSkillLevel && fromLvl > toLvl && fromCount <= toCount
        ? `balances ${g.name} skill`
        : `balances ${g.name}`;
    }
  }

  const dgKey = getDeptGenderKey(player);
  if (deptGenderBefore[fromTeam][dgKey] > deptGenderBefore[toTeam][dgKey]) {
    return `evens ${DEPT_GENDER_REASON_LABELS[dgKey]}`;
  }

  const churchKey = getPlayerChurchKey(player);
  if ((churchBefore[fromTeam].get(churchKey) ?? 0) > (churchBefore[toTeam].get(churchKey) ?? 0)) {
    return `evens ${churchKey || 'Main church'}`;
  }

  if (totalsBefore[fromTeam] > totalsBefore[toTeam]) {
    return 'evens team headcount';
  }

  return `balances ${DEPT_GENDER_REASON_LABELS[dgKey]}`;
}

export function planRebalance(
  allPlayers: Player[],
  games: Game[],
  bracketsByGameId: ReadonlyMap<string, Bracket>,
  pairsByGameId: ReadonlyMap<string, GamePairs>,
  separations: readonly SeparationPair[] = []
): RebalancePlan {
  const MAX_REBALANCE_MOVES = 8;
  const MIN_COST_DROP = 0.5;

  const regularGames = games.filter((g) => g.type !== 'mass');
  const gameById = new Map(games.map((g) => [g.id, g]));
  const playerById = new Map(allPlayers.map((p) => [p.id, p]));
  const lockedGameIds = getLockedGameIds(bracketsByGameId, pairsByGameId);

  const assignedPlayers = allPlayers.filter(
    (p): p is Player & { team: TeamId } => p.team === 'blue' || p.team === 'red'
  );

  let lockedCount = 0;
  const noGameUnlocked: (Player & { team: TeamId })[] = [];
  const withGameUnlocked: (Player & { team: TeamId })[] = [];

  for (const p of assignedPlayers) {
    const regularMainEntries = getRegularMainEntries(p, gameById);
    const isLocked = regularMainEntries.some((e) => lockedGameIds.has(e.gameId));
    if (isLocked) {
      lockedCount += 1;
    } else if (regularMainEntries.length === 0) {
      noGameUnlocked.push(p);
    } else {
      withGameUnlocked.push(p);
    }
  }

  const originalTeam = new Map<string, TeamId>(assignedPlayers.map((p) => [p.id, p.team]));
  const currentTeam = new Map<string, TeamId>(assignedPlayers.map((p) => [p.id, p.team]));

  const state = buildMutableState(allPlayers, games, separations);
  const beforeCost = sumAllStateCost(state);
  const totalsBefore = { blue: state.blueTotalPlayers, red: state.redTotalPlayers };
  const deptGenderBefore = {
    blue: { ...state.blueDeptGenderCounts },
    red: { ...state.redDeptGenderCounts },
  };
  const churchBefore = {
    blue: new Map(state.blueChurchCounts),
    red: new Map(state.redChurchCounts),
  };

  function getMovedCountWithPatch(patches: [string, TeamId][]): number {
    const patchMap = new Map(patches);
    let count = 0;
    for (const [id, orig] of originalTeam.entries()) {
      const next = patchMap.get(id) ?? currentTeam.get(id)!;
      if (next !== orig) count += 1;
    }
    return count;
  }

  type CandidateStep =
    | {
        kind: 'single';
        player: Player;
        fromTeam: TeamId;
        toTeam: TeamId;
        improvement: number;
        noGameScore: number;
        movedAfter: number;
      }
    | {
        kind: 'swap';
        pBlue: Player;
        pRed: Player;
        improvement: number;
        noGameScore: number;
        movedAfter: number;
      };

  function runPhase(candidates: (Player & { team: TeamId })[], prioritizeNoGames: boolean) {
    while (true) {
      const baseCost = sumAllStateCost(state);
      let best: CandidateStep | null = null;

      const isBetter = (next: CandidateStep): boolean => {
        if (next.improvement < MIN_COST_DROP) return false;
        if (!best) return true;
        if (next.improvement > best.improvement + 1e-9) return true;
        if (Math.abs(next.improvement - best.improvement) <= 1e-9) {
          if (prioritizeNoGames && next.noGameScore !== best.noGameScore) {
            return next.noGameScore > best.noGameScore;
          }
          if (next.movedAfter !== best.movedAfter) {
            return next.movedAfter < best.movedAfter;
          }
        }
        return false;
      };

      // Single moves
      for (const p of candidates) {
        const cur = currentTeam.get(p.id)!;
        const next: TeamId = cur === 'blue' ? 'red' : 'blue';
        const movedAfter = getMovedCountWithPatch([[p.id, next]]);
        if (movedAfter > MAX_REBALANCE_MOVES) continue;

        applyPlayerToState(state, p, cur, -1);
        applyPlayerToState(state, p, next, 1);
        const newCost = sumAllStateCost(state);
        applyPlayerToState(state, p, next, -1);
        applyPlayerToState(state, p, cur, 1);

        const step: CandidateStep = {
          kind: 'single',
          player: p,
          fromTeam: cur,
          toTeam: next,
          improvement: baseCost - newCost,
          noGameScore: getRegularMainEntries(p, gameById).length === 0 ? 2 : 0,
          movedAfter,
        };
        if (isBetter(step)) best = step;
      }

      // Cross-team swaps
      const blues = candidates.filter((p) => currentTeam.get(p.id) === 'blue');
      const reds = candidates.filter((p) => currentTeam.get(p.id) === 'red');
      for (const pBlue of blues) {
        for (const pRed of reds) {
          const movedAfter = getMovedCountWithPatch([
            [pBlue.id, 'red'],
            [pRed.id, 'blue'],
          ]);
          if (movedAfter > MAX_REBALANCE_MOVES) continue;

          const delta = deltaCostForSwap(state, pBlue, pRed);
          const step: CandidateStep = {
            kind: 'swap',
            pBlue,
            pRed,
            improvement: -delta,
            noGameScore:
              (getRegularMainEntries(pBlue, gameById).length === 0 ? 1 : 0) +
              (getRegularMainEntries(pRed, gameById).length === 0 ? 1 : 0),
            movedAfter,
          };
          if (isBetter(step)) best = step;
        }
      }

      if (!best) break;

      if (best.kind === 'single') {
        applyPlayerToState(state, best.player, best.fromTeam, -1);
        applyPlayerToState(state, best.player, best.toTeam, 1);
        currentTeam.set(best.player.id, best.toTeam);
      } else {
        applyPlayerToState(state, best.pBlue, 'blue', -1);
        applyPlayerToState(state, best.pRed, 'red', -1);
        applyPlayerToState(state, best.pBlue, 'red', 1);
        applyPlayerToState(state, best.pRed, 'blue', 1);
        currentTeam.set(best.pBlue.id, 'red');
        currentTeam.set(best.pRed.id, 'blue');
      }
    }
  }

  // Phase 1: Players with NO game entries
  runPhase(noGameUnlocked, true);

  // Phase 2: Only if headcount diff > 1, any game is Unbalanced, or separation conflict remains
  const headDiffAfterPhase1 = Math.abs(state.blueTotalPlayers - state.redTotalPlayers);
  if (
    (headDiffAfterPhase1 > 1 ||
      hasAnyUnbalancedGame(state, regularGames) ||
      computeStateSeparationCost(state) > 0) &&
    getMovedCountWithPatch([]) < MAX_REBALANCE_MOVES
  ) {
    runPhase([...noGameUnlocked, ...withGameUnlocked], true);
  }

  const afterCost = sumAllStateCost(state);
  const totalsAfter = { blue: state.blueTotalPlayers, red: state.redTotalPlayers };
  const deptGenderAfter = {
    blue: { ...state.blueDeptGenderCounts },
    red: { ...state.redDeptGenderCounts },
  };

  const beforeGameStatsList = computeAllGameStats(allPlayers, games);
  const beforeGameStatsMap = new Map(beforeGameStatsList.map((s) => [s.gameId, s]));

  const activeSeparations = state.separationPairs;
  const unresolvedSeparations = findUnresolvedSeparations(
    activeSeparations,
    playerById,
    (id) => currentTeam.get(id) ?? null
  );

  const changesByPlayerId: Record<string, TeamId> = {};
  const moves: RebalanceMove[] = [];

  for (const p of assignedPlayers) {
    const nextTeam = currentTeam.get(p.id)!;
    if (nextTeam !== p.team) {
      changesByPlayerId[p.id] = nextTeam;
      const resolvedPartners: string[] = [];
      for (const pair of activeSeparations) {
        const partnerId =
          pair.aId === p.id ? pair.bId : pair.bId === p.id ? pair.aId : null;
        if (!partnerId) continue;
        if (originalTeam.get(partnerId) === p.team && currentTeam.get(partnerId) === p.team) {
          const partnerName = playerById.get(partnerId)?.name;
          if (partnerName) resolvedPartners.push(partnerName);
        }
      }
      moves.push({
        player: p,
        fromTeam: p.team,
        toTeam: nextTeam,
        reason: buildRebalanceMoveReason(
          p,
          p.team,
          nextTeam,
          totalsBefore,
          deptGenderBefore,
          churchBefore,
          beforeGameStatsMap,
          gameById,
          resolvedPartners
        ),
      });
    }
  }

  moves.sort((a, b) => {
    if (a.fromTeam !== b.fromTeam) return a.fromTeam.localeCompare(b.fromTeam);
    return a.player.name.localeCompare(b.player.name);
  });

  const afterPlayers = allPlayers.map((p) => {
    const next = changesByPlayerId[p.id];
    return next ? { ...p, team: next } : p;
  });

  const changedGames: RebalanceGameBadgeChange[] = [];
  for (const game of regularGames) {
    const before = beforeGameStatsMap.get(game.id) ?? computeGameStats(allPlayers, game.id, undefined, game);
    const after = computeGameStats(afterPlayers, game.id, undefined, game);
    const beforeBadge = getDisplayGameBalanceStatus(before);
    const afterBadge = getDisplayGameBalanceStatus(after);
    if (beforeBadge !== afterBadge) {
      changedGames.push({ game, before, after, beforeBadge, afterBadge });
    }
  }

  return {
    lockedCount,
    beforeCost,
    afterCost,
    moves,
    changesByPlayerId,
    totalsBefore,
    totalsAfter,
    deptGenderBefore,
    deptGenderAfter,
    changedGames,
    unresolvedSeparations,
  };
}
