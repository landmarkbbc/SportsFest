import { useEffect, useMemo, useState } from 'react';
import {
  Bracket,
  BracketGroup,
  FinalMatch,
  Game,
  MassGameDoc,
  SkillLevel,
  TeamId,
} from '../types/models';
import {
  subscribeBrackets,
  subscribeFinals,
  subscribeMassGames,
} from '../services/db';
import { DIVISION_LEVELS, getBracketDocId } from '../utils/bracket';

export const BACKUP_MATCH_POINTS_FACTOR = 1;

export interface ScoreboardChampionRow {
  id: string;
  gameId: string;
  division: SkillLevel | null;
  group?: BracketGroup;
  title: string;
  iconKey: Game['iconKey'];
  championName: string;
  championTeam: TeamId;
  pointsAwarded: number;
  isBackupExtra?: boolean;
}

export interface ScoreboardSportRow {
  id: string;
  game: Game;
  division: SkillLevel | null;
  title: string;
  bluePoints: number;
  redPoints: number;
  status: 'no_bracket' | 'no_results' | 'in_progress' | 'complete';
  massWins?: { blue: number; red: number };
}

export interface ScoreboardData {
  blueTotal: number;
  redTotal: number;
  champions: ScoreboardChampionRow[];
  sportRows: ScoreboardSportRow[];
}

function computeBracketMatchPoints(
  game: Game,
  bracket: Bracket | undefined,
  factor: number
): { bluePoints: number; redPoints: number } {
  let bluePoints = 0;
  let redPoints = 0;
  if (!bracket || factor <= 0 || game.pointsPerMatchWin <= 0) {
    return { bluePoints, redPoints };
  }
  const isTeamGame = game.type === 'team' || bracket.format === 'teammatch';
  if (isTeamGame) {
    return { bluePoints, redPoints };
  }

  for (const match of bracket.matches) {
    if (match.bye || match.sameTeam || match.winner === null) continue;
    if (match.winner === 'draw') {
      if (bracket.format === 'roundrobin') {
        const half = (game.pointsPerMatchWin / 2) * factor;
        bluePoints += half;
        redPoints += half;
      }
      continue;
    }
    const winnerSnap = match.winner === 'a' ? match.a : match.b;
    if (!winnerSnap) continue;
    const pts = game.pointsPerMatchWin * factor;
    if (winnerSnap.team === 'blue') {
      bluePoints += pts;
    } else if (winnerSnap.team === 'red') {
      redPoints += pts;
    }
  }

  return { bluePoints, redPoints };
}

function computeSportBreakdown(
  game: Game,
  mainBracket: Bracket | undefined,
  backupBracket: Bracket | undefined,
  finalDoc: FinalMatch | undefined
): {
  bluePoints: number;
  redPoints: number;
  status: ScoreboardSportRow['status'];
  championName: string | null;
  championTeam: TeamId | null;
  pointsAwarded: number;
  backupChampionName: string | null;
  backupChampionTeam: TeamId | null;
  backupIsSportChampion: boolean;
} {
  const allowBackup = game.type === 'individual';
  const activeBackup = allowBackup ? backupBracket : undefined;
  const activeFinal = allowBackup ? finalDoc : undefined;

  if (!mainBracket && !activeBackup) {
    return {
      bluePoints: 0,
      redPoints: 0,
      status: 'no_bracket',
      championName: null,
      championTeam: null,
      pointsAwarded: 0,
      backupChampionName: null,
      backupChampionTeam: null,
      backupIsSportChampion: false,
    };
  }

  const mainPts = computeBracketMatchPoints(game, mainBracket, 1);
  const backupPts = computeBracketMatchPoints(
    game,
    activeBackup,
    BACKUP_MATCH_POINTS_FACTOR
  );
  let bluePoints = mainPts.bluePoints + backupPts.bluePoints;
  let redPoints = mainPts.redPoints + backupPts.redPoints;

  const mainComplete =
    mainBracket?.status === 'complete' &&
    Boolean(mainBracket.championTeam) &&
    Boolean(mainBracket.championName);
  const backupComplete =
    activeBackup?.status === 'complete' &&
    Boolean(activeBackup.championTeam) &&
    Boolean(activeBackup.championName);

  let championName: string | null = null;
  let championTeam: TeamId | null = null;
  let pointsAwarded = 0;

  if (activeFinal) {
    if (activeFinal.winner === 'a' || activeFinal.winner === 'b') {
      const winnerSlot = activeFinal.winner === 'a' ? activeFinal.a : activeFinal.b;
      championName = winnerSlot.name;
      championTeam = winnerSlot.team;
      pointsAwarded = game.pointsChampion;
      if (winnerSlot.team === 'blue') {
        bluePoints += game.pointsChampion;
      } else {
        redPoints += game.pointsChampion;
      }
    }
  } else if (mainComplete && mainBracket?.championName && mainBracket.championTeam) {
    championName = mainBracket.championName;
    championTeam = mainBracket.championTeam;
    pointsAwarded = game.pointsChampion;
    if (mainBracket.championTeam === 'blue') {
      bluePoints += game.pointsChampion;
    } else {
      redPoints += game.pointsChampion;
    }
  }

  let status: ScoreboardSportRow['status'] = 'in_progress';
  if (
    mainComplete &&
    (!activeBackup || backupComplete) &&
    (!activeFinal || activeFinal.winner !== null)
  ) {
    status = 'complete';
  }

  return {
    bluePoints,
    redPoints,
    status,
    championName,
    championTeam,
    pointsAwarded,
    backupChampionName: backupComplete && activeBackup?.championName ? activeBackup.championName : null,
    backupChampionTeam: backupComplete && activeBackup?.championTeam ? activeBackup.championTeam : null,
    backupIsSportChampion: activeFinal?.winner === 'b',
  };
}

export function computeScoreboard(
  games: Game[],
  bracketsByGameId: Map<string, Bracket>,
  massGamesByGameId: Map<string, MassGameDoc> = new Map(),
  finalsByKey: Map<string, FinalMatch> = new Map()
): ScoreboardData {
  let blueTotal = 0;
  let redTotal = 0;
  const champions: ScoreboardChampionRow[] = [];
  const sportRows: ScoreboardSportRow[] = [];

  for (const game of games) {
    if (game.type === 'mass') {
      const items = massGamesByGameId.get(game.id)?.items ?? [];
      let bluePoints = 0;
      let redPoints = 0;
      let blueWins = 0;
      let redWins = 0;
      for (const item of items) {
        if (item.winner === 'blue') {
          blueWins += 1;
          bluePoints += item.points;
        } else if (item.winner === 'red') {
          redWins += 1;
          redPoints += item.points;
        }
      }
      const decided = blueWins + redWins;
      const status: ScoreboardSportRow['status'] =
        items.length === 0 || decided === 0
          ? 'no_results'
          : decided === items.length
            ? 'complete'
            : 'in_progress';

      blueTotal += bluePoints;
      redTotal += redPoints;
      sportRows.push({
        id: game.id,
        game,
        division: null,
        title: game.name,
        bluePoints,
        redPoints,
        status,
        massWins: { blue: blueWins, red: redWins },
      });
      continue;
    }

    if (game.hasDivisions) {
      for (const div of DIVISION_LEVELS) {
        const docId = getBracketDocId(game.id, div.level);
        const backupDocId = getBracketDocId(game.id, div.level, 'backup');
        const title = `${game.name} - ${div.label}`;
        const result = computeSportBreakdown(
          game,
          bracketsByGameId.get(docId),
          bracketsByGameId.get(backupDocId),
          finalsByKey.get(docId)
        );
        blueTotal += result.bluePoints;
        redTotal += result.redPoints;
        sportRows.push({
          id: docId,
          game,
          division: div.level,
          title,
          bluePoints: result.bluePoints,
          redPoints: result.redPoints,
          status: result.status,
        });
        if (result.championName && result.championTeam) {
          champions.push({
            id: docId,
            gameId: game.id,
            division: div.level,
            group: result.backupIsSportChampion ? 'backup' : 'main',
            title,
            iconKey: game.iconKey,
            championName: result.championName,
            championTeam: result.championTeam,
            pointsAwarded: result.pointsAwarded,
          });
        }
        if (
          result.backupChampionName &&
          result.backupChampionTeam &&
          !result.backupIsSportChampion
        ) {
          champions.push({
            id: backupDocId,
            gameId: game.id,
            division: div.level,
            group: 'backup',
            title: `${title} - backup bracket winner`,
            iconKey: game.iconKey,
            championName: result.backupChampionName,
            championTeam: result.backupChampionTeam,
            pointsAwarded: 0,
            isBackupExtra: true,
          });
        }
      }
    } else {
      const docId = game.id;
      const backupDocId = getBracketDocId(game.id, null, 'backup');
      const result = computeSportBreakdown(
        game,
        bracketsByGameId.get(docId),
        bracketsByGameId.get(backupDocId),
        finalsByKey.get(docId)
      );
      blueTotal += result.bluePoints;
      redTotal += result.redPoints;
      sportRows.push({
        id: docId,
        game,
        division: null,
        title: game.name,
        bluePoints: result.bluePoints,
        redPoints: result.redPoints,
        status: result.status,
      });
      if (result.championName && result.championTeam) {
        champions.push({
          id: docId,
          gameId: game.id,
          division: null,
          group: result.backupIsSportChampion ? 'backup' : 'main',
          title: game.name,
          iconKey: game.iconKey,
          championName: result.championName,
          championTeam: result.championTeam,
          pointsAwarded: result.pointsAwarded,
        });
      }
      if (
        result.backupChampionName &&
        result.backupChampionTeam &&
        !result.backupIsSportChampion
      ) {
        champions.push({
          id: backupDocId,
          gameId: game.id,
          division: null,
          group: 'backup',
          title: `${game.name} - backup bracket winner`,
          iconKey: game.iconKey,
          championName: result.backupChampionName,
          championTeam: result.backupChampionTeam,
          pointsAwarded: 0,
          isBackupExtra: true,
        });
      }
    }
  }

  return {
    blueTotal,
    redTotal,
    champions,
    sportRows,
  };
}

export function useBracketsAndScoreboard(
  authReady: boolean,
  games: Game[],
  onSyncError: (message: string) => void
): {
  bracketsByGameId: Map<string, Bracket>;
  massGamesByGameId: Map<string, MassGameDoc>;
  finalsByKey: Map<string, FinalMatch>;
  bracketsLoaded: boolean;
  massGamesLoaded: boolean;
  finalsLoaded: boolean;
  scoreboard: ScoreboardData;
} {
  const [bracketsByGameId, setBracketsByGameId] = useState<Map<string, Bracket>>(
    () => new Map()
  );
  const [massGamesByGameId, setMassGamesByGameId] = useState<Map<string, MassGameDoc>>(
    () => new Map()
  );
  const [finalsByKey, setFinalsByKey] = useState<Map<string, FinalMatch>>(
    () => new Map()
  );
  const [bracketsLoaded, setBracketsLoaded] = useState(false);
  const [massGamesLoaded, setMassGamesLoaded] = useState(false);
  const [finalsLoaded, setFinalsLoaded] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    const unsubBrackets = subscribeBrackets(
      (data) => {
        setBracketsByGameId(data);
        setBracketsLoaded(true);
      },
      (err) => {
        setBracketsLoaded(true);
        onSyncError(`Brackets sync error: ${err.message}`);
      }
    );

    const unsubMassGames = subscribeMassGames(
      (data) => {
        setMassGamesByGameId(data);
        setMassGamesLoaded(true);
      },
      (err) => {
        setMassGamesLoaded(true);
        onSyncError(`Mass games sync error: ${err.message}`);
      }
    );

    const unsubFinals = subscribeFinals(
      (data) => {
        setFinalsByKey(data);
        setFinalsLoaded(true);
      },
      (err) => {
        setFinalsLoaded(true);
        onSyncError(`Finals sync error: ${err.message}`);
      }
    );

    return () => {
      unsubBrackets();
      unsubMassGames();
      unsubFinals();
    };
  }, [authReady, onSyncError]);

  const scoreboard = useMemo(
    () => computeScoreboard(games, bracketsByGameId, massGamesByGameId, finalsByKey),
    [games, bracketsByGameId, massGamesByGameId, finalsByKey]
  );

  return {
    bracketsByGameId,
    massGamesByGameId,
    finalsByKey,
    bracketsLoaded,
    massGamesLoaded,
    finalsLoaded,
    scoreboard,
  };
}
