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
  SkillLevel,
  TeamId,
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

export function getPlayerTotalEffectiveLevel(
  player: Player,
  gameById?: ReadonlyMap<string, Game>
): number {
  return player.entries.reduce((sum, entry) => {
    const game = gameById?.get(entry.gameId);
    if (game && !game.usesSkillLevel) return sum;
    return sum + getEffectiveLevel(entry);
  }, 0);
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
  redDeptGenderCounts?: Record<DeptGenderKey, number>
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
  return (
    ROSTER_HEADCOUNT_WEIGHT * (headDiff * headDiff) +
    ROSTER_DEPARTMENT_WEIGHT * deptSqSum +
    ROSTER_DEPT_GENDER_WEIGHT * deptGenderSqSum
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
    if (!entry) continue;

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
  return games.map((g) => computeGameStats(players, g.id, proposedMap, g));
}

export function computeTotalCost(
  players: Player[],
  games: Game[] = [],
  proposedMap?: ReadonlyMap<string, TeamId>
): number {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const gameMap = new Map<string, GameBucketWithDivisions>();
  let blueTotal = 0;
  let redTotal = 0;
  const blueDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const redDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const blueDeptGenderCounts = emptyDeptGenderCounts();
  const redDeptGenderCounts = emptyDeptGenderCounts();

  for (const player of players) {
    const assignedTeam = player.team ?? proposedMap?.get(player.id) ?? null;
    if (!assignedTeam) continue;

    const dgKey = getDeptGenderKey(player);
    if (assignedTeam === 'blue') {
      blueTotal += 1;
      blueDeptCounts[player.department] += 1;
      blueDeptGenderCounts[dgKey] += 1;
    } else {
      redTotal += 1;
      redDeptCounts[player.department] += 1;
      redDeptGenderCounts[dgKey] += 1;
    }

    for (const entry of player.entries) {
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
    redDeptGenderCounts
  );
  for (const [gameId, bucket] of gameMap.entries()) {
    totalCost += computeGameBucketCost(bucket, gameById.get(gameId));
  }
  return totalCost;
}

// Fast mutable state used internally by assignment planners
interface MutableRosterState {
  buckets: Map<string, GameBucketWithDivisions>;
  gameById: Map<string, Game>;
  blueTotalPlayers: number;
  redTotalPlayers: number;
  blueDeptCounts: Record<Department, number>;
  redDeptCounts: Record<Department, number>;
  blueDeptGenderCounts: Record<DeptGenderKey, number>;
  redDeptGenderCounts: Record<DeptGenderKey, number>;
}

function buildMutableState(players: Player[], games: Game[]): MutableRosterState {
  const buckets = new Map<string, GameBucketWithDivisions>();
  const gameById = new Map(games.map((g) => [g.id, g]));
  let blueTotalPlayers = 0;
  let redTotalPlayers = 0;
  const blueDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const redDeptCounts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  const blueDeptGenderCounts = emptyDeptGenderCounts();
  const redDeptGenderCounts = emptyDeptGenderCounts();

  for (const player of players) {
    if (!player.team) continue;
    const dgKey = getDeptGenderKey(player);
    if (player.team === 'blue') {
      blueTotalPlayers += 1;
      blueDeptCounts[player.department] += 1;
      blueDeptGenderCounts[dgKey] += 1;
    } else {
      redTotalPlayers += 1;
      redDeptCounts[player.department] += 1;
      redDeptGenderCounts[dgKey] += 1;
    }

    for (const entry of player.entries) {
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
    blueTotalPlayers,
    redTotalPlayers,
    blueDeptCounts,
    redDeptCounts,
    blueDeptGenderCounts,
    redDeptGenderCounts,
  };
}

function applyPlayerToState(
  state: MutableRosterState,
  player: Player,
  team: TeamId,
  sign: 1 | -1
): void {
  const dgKey = getDeptGenderKey(player);
  if (team === 'blue') {
    state.blueTotalPlayers += sign;
    state.blueDeptCounts[player.department] += sign;
    state.blueDeptGenderCounts[dgKey] += sign;
  } else {
    state.redTotalPlayers += sign;
    state.redDeptCounts[player.department] += sign;
    state.redDeptGenderCounts[dgKey] += sign;
  }

  for (const entry of player.entries) {
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

function sumAllStateCost(state: MutableRosterState): number {
  let total = computeRosterCost(
    state.blueTotalPlayers,
    state.redTotalPlayers,
    state.blueDeptCounts,
    state.redDeptCounts,
    state.blueDeptGenderCounts,
    state.redDeptGenderCounts
  );
  for (const [gameId, bucket] of state.buckets.entries()) {
    total += computeGameBucketCost(bucket, state.gameById.get(gameId));
  }
  return total;
}

function deltaCostForSwap(
  state: MutableRosterState,
  pBlue: Player,
  pRed: Player
): number {
  const touchedGames = new Set<string>();
  for (const e of pBlue.entries) touchedGames.add(e.gameId);
  for (const e of pRed.entries) touchedGames.add(e.gameId);

  let before = computeRosterCost(
    state.blueTotalPlayers,
    state.redTotalPlayers,
    state.blueDeptCounts,
    state.redDeptCounts,
    state.blueDeptGenderCounts,
    state.redDeptGenderCounts
  );
  for (const gId of touchedGames) {
    const b = state.buckets.get(gId);
    if (b) before += computeGameBucketCost(b, state.gameById.get(gId));
  }

  applyPlayerToState(state, pBlue, 'blue', -1);
  applyPlayerToState(state, pRed, 'red', -1);
  applyPlayerToState(state, pBlue, 'red', 1);
  applyPlayerToState(state, pRed, 'blue', 1);

  let after = computeRosterCost(
    state.blueTotalPlayers,
    state.redTotalPlayers,
    state.blueDeptCounts,
    state.redDeptCounts,
    state.blueDeptGenderCounts,
    state.redDeptGenderCounts
  );
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
}

function currentRosterCost(state: MutableRosterState): number {
  return computeRosterCost(
    state.blueTotalPlayers,
    state.redTotalPlayers,
    state.blueDeptCounts,
    state.redDeptCounts,
    state.blueDeptGenderCounts,
    state.redDeptGenderCounts
  );
}

function deltaRosterCostForSwap(
  state: MutableRosterState,
  pBlue: Player,
  pRed: Player
): number {
  const before = currentRosterCost(state);
  applyPlayerToState(state, pBlue, 'blue', -1);
  applyPlayerToState(state, pRed, 'red', -1);
  applyPlayerToState(state, pBlue, 'red', 1);
  applyPlayerToState(state, pRed, 'blue', 1);
  const after = currentRosterCost(state);
  applyPlayerToState(state, pBlue, 'red', -1);
  applyPlayerToState(state, pRed, 'blue', -1);
  applyPlayerToState(state, pBlue, 'blue', 1);
  applyPlayerToState(state, pRed, 'red', 1);
  return after - before;
}

export function planBulkAssignment(allPlayers: Player[], games: Game[]): BulkAssignmentPlan {
  const gameById = new Map(games.map((g) => [g.id, g]));
  const unassigned = allPlayers.filter((p) => p.team === null);

  const withGames = unassigned
    .filter((p) => p.entries.length > 0)
    .sort((a, b) => {
      const levelDiff =
        getPlayerTotalEffectiveLevel(b, gameById) -
        getPlayerTotalEffectiveLevel(a, gameById);
      if (levelDiff !== 0) return levelDiff;
      const entryDiff = b.entries.length - a.entries.length;
      if (entryDiff !== 0) return entryDiff;
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

  const noGames = unassigned
    .filter((p) => p.entries.length === 0)
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
      return a.id.localeCompare(b.id);
    });

  const beforeCost = computeTotalCost(allPlayers, games);
  const state = buildMutableState(allPlayers, games);

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

  const afterCost = computeTotalCost(allPlayers, games, proposedMap);
  const gameComparisons: GameBalanceComparison[] = games
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
    .map((entry) => {
      const game = gameById.get(entry.gameId);
      if (!game) return null;
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
  games: Game[]
): SingleAssignmentResult {
  const existingPlayers = allPlayers.filter((p) => p.id !== targetPlayer.id);
  return {
    team: chosen,
    reason: 'Assigned manually by Admin',
    joinedGames: buildJoinedGameBalances(targetPlayer, chosen, existingPlayers, games),
  };
}

export function previewSingleTeamHint(
  targetPlayer: Player,
  team: TeamId,
  allPlayers: Player[],
  games: Game[]
): string {
  if (targetPlayer.entries.length === 0) {
    return 'No games - affects overall headcount only';
  }
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
    .map((entry) => {
      const game = gameById.get(entry.gameId);
      if (!game) return null;
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
  randomFn: () => number = Math.random
): SingleAssignmentResult {
  const existingPlayers = allPlayers.filter((p) => p.id !== targetPlayer.id);
  const state = buildMutableState(existingPlayers, games);

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
  const gameById = new Map(games.map((g) => [g.id, g]));

  let bestHighlightGameName: string | null = null;
  let fewerPlayers = false;
  let lowerSkill = false;
  let bestGapScore = -1;

  for (const entry of targetPlayer.entries) {
    const game = gameById.get(entry.gameId);
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
  if (bestHighlightGameName && fewerPlayers && lowerSkill) {
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
  gameBeforeStats: ReadonlyMap<string, GameStats>,
  gameById: ReadonlyMap<string, Game>
): string {
  for (const entry of player.entries) {
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

  if (totalsBefore[fromTeam] > totalsBefore[toTeam]) {
    return 'evens team headcount';
  }

  return `balances ${DEPT_GENDER_REASON_LABELS[dgKey]}`;
}

export function planRebalance(
  allPlayers: Player[],
  games: Game[],
  bracketsByGameId: ReadonlyMap<string, Bracket>,
  pairsByGameId: ReadonlyMap<string, GamePairs>
): RebalancePlan {
  const MAX_REBALANCE_MOVES = 8;
  const MIN_COST_DROP = 0.5;

  const gameById = new Map(games.map((g) => [g.id, g]));
  const lockedGameIds = getLockedGameIds(bracketsByGameId, pairsByGameId);

  const assignedPlayers = allPlayers.filter(
    (p): p is Player & { team: TeamId } => p.team === 'blue' || p.team === 'red'
  );

  let lockedCount = 0;
  const noGameUnlocked: (Player & { team: TeamId })[] = [];
  const withGameUnlocked: (Player & { team: TeamId })[] = [];

  for (const p of assignedPlayers) {
    const isLocked = p.entries.some((e) => lockedGameIds.has(e.gameId));
    if (isLocked) {
      lockedCount += 1;
    } else if (p.entries.length === 0) {
      noGameUnlocked.push(p);
    } else {
      withGameUnlocked.push(p);
    }
  }

  const originalTeam = new Map<string, TeamId>(assignedPlayers.map((p) => [p.id, p.team]));
  const currentTeam = new Map<string, TeamId>(assignedPlayers.map((p) => [p.id, p.team]));

  const state = buildMutableState(allPlayers, games);
  const beforeCost = sumAllStateCost(state);
  const totalsBefore = { blue: state.blueTotalPlayers, red: state.redTotalPlayers };
  const deptGenderBefore = {
    blue: { ...state.blueDeptGenderCounts },
    red: { ...state.redDeptGenderCounts },
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
          noGameScore: p.entries.length === 0 ? 2 : 0,
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
              (pBlue.entries.length === 0 ? 1 : 0) + (pRed.entries.length === 0 ? 1 : 0),
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

  // Phase 2: Only if headcount diff > 1 or any game is Unbalanced
  const headDiffAfterPhase1 = Math.abs(state.blueTotalPlayers - state.redTotalPlayers);
  if (
    (headDiffAfterPhase1 > 1 || hasAnyUnbalancedGame(state, games)) &&
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

  const changesByPlayerId: Record<string, TeamId> = {};
  const moves: RebalanceMove[] = [];

  for (const p of assignedPlayers) {
    const nextTeam = currentTeam.get(p.id)!;
    if (nextTeam !== p.team) {
      changesByPlayerId[p.id] = nextTeam;
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
          beforeGameStatsMap,
          gameById
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
  for (const game of games) {
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
  };
}
