export type Role = 'viewer' | 'scorer' | 'admin';

export type TeamId = 'blue' | 'red';

export type Department = 'Kids' | 'YP' | 'SP' | 'Adults';

export type Gender = 'M' | 'F';

export type GameType = 'individual' | 'pairs' | 'team';

export type Eligibility = 'everyone' | 'men' | 'women';

export type GameSession = 'morning' | 'afternoon';

export type SportIconKey =
  | 'pawn'
  | 'tileS'
  | 'cubeW'
  | 'shuttlecock'
  | 'dartboard'
  | 'stars3'
  | 'conch'
  | 'paddle'
  | 'basketball'
  | 'volleyball';

export type EntrySlot = 'morning' | 'afternoon' | 'secondary' | 'tertiary';

export type SkillLevel = 1 | 2 | 3;

export type BalanceStatus = 'Balanced' | 'Fair' | 'Unbalanced';

export type DisplayBalanceStatus = BalanceStatus | 'No players' | 'Not assigned yet';

export type AppTab = 'sports' | 'scoreboard' | 'teams' | 'players' | 'settings';

export interface PlayerEntry {
  slot: EntrySlot;
  gameId: string;
  selfLevel: SkillLevel;
  overrideLevel?: SkillLevel | null;
}

export interface Game {
  id: string;
  name: string;
  type: GameType;
  eligibility: Eligibility;
  session: GameSession;
  iconKey: SportIconKey | null;
  usesSkillLevel: boolean;
  hasDivisions: boolean;
  minPlayersPerTeam: number | null;
  pointsPerMatchWin: number;
  pointsChampion: number;
  createdAt: number;
  updatedAt?: number;
}

export interface Player {
  id: string;
  name: string;
  department: Department;
  gender: Gender;
  entries: PlayerEntry[];
  team: TeamId | null;
  isWalkIn: boolean;
  isDemo: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface AppSettings {
  adminPinHash: string;
  scorerPinHash: string;
  initialized: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProgramRow {
  id: string;
  start: string;
  activity: string;
}

export interface EventProgram {
  rows: ProgramRow[];
  endTime: string;
  updatedAt?: number;
}

export const DEFAULT_PROGRAM: EventProgram = {
  rows: [
    { id: 'prog_01', start: '07:00', activity: 'Setup' },
    { id: 'prog_02', start: '07:45', activity: 'Registration opens' },
    { id: 'prog_03', start: '08:15', activity: 'Opening prayer, welcome, rules' },
    { id: 'prog_04', start: '08:25', activity: 'Devotion' },
    { id: 'prog_05', start: '08:40', activity: 'Warm-up' },
    { id: 'prog_06', start: '08:50', activity: 'Mass active games' },
    { id: 'prog_07', start: '10:00', activity: 'Move to morning stations' },
    { id: 'prog_08', start: '10:05', activity: 'Morning games' },
    { id: 'prog_09', start: '11:45', activity: 'Final bell' },
    { id: 'prog_10', start: '12:00', activity: 'Lunch (buffet)' },
    { id: 'prog_11', start: '12:30', activity: 'Morning awards' },
    { id: 'prog_12', start: '12:50', activity: 'On deck' },
    { id: 'prog_13', start: '13:00', activity: 'Volleyball, ladies' },
    { id: 'prog_14', start: '13:34', activity: 'Volleyball, men' },
    { id: 'prog_15', start: '14:08', activity: 'Basketball, women' },
    { id: 'prog_16', start: '14:40', activity: 'Basketball, men' },
    { id: 'prog_17', start: '15:15', activity: 'Final tally, awards, closing prayer' },
    { id: 'prog_18', start: '15:30', activity: 'Cleanup and loading' },
  ],
  endTime: '16:00',
};

// Match Brackets (Part 2)
export type BracketFormat = 'elimination' | 'roundrobin' | 'teammatch';
export type BracketStatus = 'active' | 'complete';

export interface BracketSlotSnapshot {
  playerId: string;
  name: string;
  team: TeamId;
  dept: Department | null;
  level: SkillLevel | null;
}

export interface BracketMatch {
  id: string;
  round: number;
  a: BracketSlotSnapshot | null;
  b: BracketSlotSnapshot | null;
  winner: 'a' | 'b' | null;
  bye: boolean;
  sameTeam: boolean;
  decidedBy: string | null;
  decidedAt: number | null;
}

export interface Bracket {
  format: BracketFormat;
  status: BracketStatus;
  matches: BracketMatch[];
  championName: string | null;
  championTeam: TeamId | null;
  division?: SkillLevel | null;
  createdAt: number;
  updatedAt?: number;
}

export const DEPARTMENTS: Department[] = ['Kids', 'YP', 'SP', 'Adults'];

export const ENTRY_SLOTS: { key: EntrySlot; label: string }[] = [
  { key: 'morning', label: 'Morning game' },
  { key: 'afternoon', label: 'Afternoon game' },
  { key: 'secondary', label: 'Secondary game' },
  { key: 'tertiary', label: 'Tertiary game' },
];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
};

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  individual: 'Individual',
  pairs: 'Pairs',
  team: 'Team',
};

export const ELIGIBILITY_LABELS: Record<Eligibility, string> = {
  everyone: 'Everyone',
  men: 'Men only',
  women: 'Women only',
};

export const GAME_SESSION_LABELS: Record<GameSession, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
};

export function getDefaultGameSession(name: string): GameSession {
  if (/volleyball|basketball|badminton|table tennis|darts/i.test(name)) {
    return 'afternoon';
  }
  return 'morning';
}

export function getDefaultGameIconKey(name: string): SportIconKey | null {
  const lower = name.toLowerCase();
  if (lower.includes('chess')) return 'pawn';
  if (lower.includes('scrabble')) return 'tileS';
  if (lower.includes('word factory')) return 'cubeW';
  if (lower.includes('sungka')) return 'conch';
  if (lower.includes('generals')) return 'stars3';
  if (lower.includes('table tennis')) return 'paddle';
  if (lower.includes('badminton')) return 'shuttlecock';
  if (lower.includes('darts')) return 'dartboard';
  if (lower.includes('volleyball')) return 'volleyball';
  if (lower.includes('basketball')) return 'basketball';
  return null;
}

export function getDefaultGameUsesSkillLevel(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('chess') || lower.includes('basketball');
}

export function getDefaultGameHasDivisions(name: string): boolean {
  return name.toLowerCase().includes('chess');
}

export function getDefaultGameMinPlayersPerTeam(name: string): number | null {
  return name.toLowerCase().includes('basketball') ? 5 : null;
}

export const DEFAULT_POINTS_PER_MATCH_WIN = 1;
export const DEFAULT_POINTS_CHAMPION = 3;

export const SEED_GAMES: Array<Omit<Game, 'createdAt' | 'updatedAt'>> = [
  { id: 'chess', name: 'Chess', type: 'individual', eligibility: 'everyone', session: 'morning', iconKey: 'pawn', usesSkillLevel: true, hasDivisions: true, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'scrabble', name: 'Scrabble', type: 'individual', eligibility: 'everyone', session: 'morning', iconKey: 'tileS', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'sungka', name: 'Sungka', type: 'individual', eligibility: 'everyone', session: 'morning', iconKey: 'conch', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'word-factory', name: 'Word Factory', type: 'individual', eligibility: 'everyone', session: 'morning', iconKey: 'cubeW', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'game-of-the-generals', name: 'Game of the Generals', type: 'individual', eligibility: 'everyone', session: 'morning', iconKey: 'stars3', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'table-tennis', name: 'Table Tennis', type: 'individual', eligibility: 'everyone', session: 'afternoon', iconKey: 'paddle', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'badminton', name: 'Badminton', type: 'individual', eligibility: 'everyone', session: 'afternoon', iconKey: 'shuttlecock', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'darts', name: 'Darts', type: 'pairs', eligibility: 'everyone', session: 'afternoon', iconKey: 'dartboard', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'volleyball-men', name: 'Volleyball - Men', type: 'team', eligibility: 'men', session: 'afternoon', iconKey: 'volleyball', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'volleyball-ladies', name: 'Volleyball - Ladies', type: 'team', eligibility: 'women', session: 'afternoon', iconKey: 'volleyball', usesSkillLevel: false, hasDivisions: false, minPlayersPerTeam: null, pointsPerMatchWin: 1, pointsChampion: 3 },
  { id: 'basketball-men', name: 'Basketball - Men', type: 'team', eligibility: 'men', session: 'afternoon', iconKey: 'basketball', usesSkillLevel: true, hasDivisions: false, minPlayersPerTeam: 5, pointsPerMatchWin: 1, pointsChampion: 3 },
];
