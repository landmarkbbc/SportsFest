import {
  BracketSlotSnapshot,
  Game,
  GamePair,
  GamePairs,
  PairMember,
  Player,
  SkillLevel,
  TeamId,
} from '../types/models';
import { getEffectiveLevel } from './balance';

export interface EditableUnpairedMember extends PairMember {
  team: TeamId;
}

export interface EditablePairsDraft {
  pairs: GamePair[];
  unpaired: EditableUnpairedMember[];
}

export type PairSwapLocation =
  | { kind: 'pair'; team: TeamId; pairId: string; memberIndex: 0 | 1 }
  | { kind: 'unpaired'; team: TeamId; playerId: string };

function shuffleArray<T>(items: T[], randomFn: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makePairId(team: TeamId, index: number): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `pair_${team}_${index + 1}_${Date.now().toString(36)}_${rand}`;
}

export function buildInitialGamePairs(
  game: Game,
  players: Player[],
  randomFn: () => number = Math.random
): EditablePairsDraft {
  const pairs: GamePair[] = [];
  const unpaired: EditableUnpairedMember[] = [];

  for (const team of ['blue', 'red'] as const) {
    const members: PairMember[] = [];
    for (const player of players) {
      if (player.team !== team) continue;
      const entry = player.entries.find((e) => e.gameId === game.id);
      if (!entry) continue;
      const level: SkillLevel = game.usesSkillLevel ? getEffectiveLevel(entry) : 2;
      members.push({
        playerId: player.id,
        name: player.name,
        level,
        dept: player.department,
      });
    }

    const ordered = game.usesSkillLevel
      ? members.slice().sort((a, b) => b.level - a.level || a.name.localeCompare(b.name))
      : shuffleArray(members, randomFn);

    if (ordered.length % 2 === 1) {
      const midIdx = Math.floor(ordered.length / 2);
      const [leftOut] = ordered.splice(midIdx, 1);
      if (leftOut) {
        unpaired.push({ ...leftOut, team });
      }
    }

    const pairCount = Math.floor(ordered.length / 2);
    for (let i = 0; i < pairCount; i++) {
      const first = ordered[i];
      const second = ordered[ordered.length - 1 - i];
      pairs.push({
        id: makePairId(team, i),
        team,
        members: [first, second],
        combined: first.level + second.level,
      });
    }
  }

  return { pairs, unpaired };
}

export function getPairSpread(
  teamPairs: GamePair[]
): { min: number; max: number } | null {
  if (teamPairs.length === 0) return null;
  let min = teamPairs[0].combined;
  let max = teamPairs[0].combined;
  for (let i = 1; i < teamPairs.length; i++) {
    const c = teamPairs[i].combined;
    if (c < min) min = c;
    if (c > max) max = c;
  }
  return { min, max };
}

export function swapPairDraftPlayers(
  draft: EditablePairsDraft,
  from: PairSwapLocation,
  to: PairSwapLocation
): EditablePairsDraft {
  if (from.team !== to.team) return draft;
  if (from.kind === 'pair' && to.kind === 'pair' && from.pairId === to.pairId) {
    return draft;
  }
  if (from.kind === 'unpaired' && to.kind === 'unpaired') {
    return draft;
  }

  const nextPairs = draft.pairs.map((p) => ({
    ...p,
    members: [p.members[0], p.members[1]] as [PairMember, PairMember],
  }));
  const nextUnpaired = draft.unpaired.map((u) => ({ ...u }));

  const readMember = (loc: PairSwapLocation): PairMember | null => {
    if (loc.kind === 'pair') {
      const pair = nextPairs.find((p) => p.id === loc.pairId && p.team === loc.team);
      return pair ? pair.members[loc.memberIndex] : null;
    }
    const found = nextUnpaired.find(
      (u) => u.playerId === loc.playerId && u.team === loc.team
    );
    if (!found) return null;
    return {
      playerId: found.playerId,
      name: found.name,
      level: found.level,
      dept: found.dept,
    };
  };

  const a = readMember(from);
  const b = readMember(to);
  if (!a || !b) return draft;

  const writeMember = (loc: PairSwapLocation, member: PairMember) => {
    if (loc.kind === 'pair') {
      const pair = nextPairs.find((p) => p.id === loc.pairId && p.team === loc.team);
      if (pair) {
        pair.members[loc.memberIndex] = member;
        pair.combined = pair.members[0].level + pair.members[1].level;
      }
    } else {
      const idx = nextUnpaired.findIndex(
        (u) => u.playerId === loc.playerId && u.team === loc.team
      );
      if (idx !== -1) {
        nextUnpaired[idx] = { ...member, team: loc.team };
      }
    }
  };

  writeMember(from, b);
  writeMember(to, a);

  return { pairs: nextPairs, unpaired: nextUnpaired };
}

export function toFirestoreGamePairs(draft: EditablePairsDraft): GamePairs {
  return {
    pairs: draft.pairs.map((p) => ({
      id: p.id,
      team: p.team,
      members: [
        {
          playerId: p.members[0].playerId,
          name: p.members[0].name,
          level: p.members[0].level,
          dept: p.members[0].dept,
        },
        {
          playerId: p.members[1].playerId,
          name: p.members[1].name,
          level: p.members[1].level,
          dept: p.members[1].dept,
        },
      ],
      combined: p.members[0].level + p.members[1].level,
    })),
    unpaired: draft.unpaired.map((u) => ({
      playerId: u.playerId,
      name: u.name,
      team: u.team,
    })),
  };
}

export function hasPairsRosterChanged(
  gamePairs: GamePairs,
  gameId: string,
  players: Player[]
): boolean {
  const savedTeamById = new Map<string, TeamId>();
  for (const pair of gamePairs.pairs) {
    for (const member of pair.members) {
      savedTeamById.set(member.playerId, pair.team);
    }
  }
  for (const u of gamePairs.unpaired) {
    savedTeamById.set(u.playerId, u.team);
  }

  const currentAssigned = players.filter(
    (p) => p.team !== null && p.entries.some((e) => e.gameId === gameId)
  );
  if (currentAssigned.length !== savedTeamById.size) return true;
  for (const p of currentAssigned) {
    if (savedTeamById.get(p.id) !== p.team) return true;
  }
  return false;
}

export function pairToBracketSnapshot(
  pair: GamePair,
  usesSkillLevel = true
): BracketSlotSnapshot {
  return {
    playerId: pair.id,
    name: `${pair.members[0].name} & ${pair.members[1].name}`,
    team: pair.team,
    level: usesSkillLevel ? pair.combined : 0,
    dept: '',
  };
}
