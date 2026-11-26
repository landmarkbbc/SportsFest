import { useEffect, useMemo, useState } from 'react';
import { Bracket, Game, SkillLevel, TeamId } from '../types/models';
import { subscribeBrackets } from '../services/db';
import { DIVISION_LEVELS, getBracketDocId } from '../utils/bracket';

export interface ScoreboardChampionRow {
  id: string;
  gameId: string;
  division: SkillLevel | null;
  title: string;
  iconKey: Game['iconKey'];
  championName: string;
  championTeam: TeamId;
  pointsAwarded: number;
}

export interface ScoreboardSportRow {
  id: string;
  game: Game;
  division: SkillLevel | null;
  title: string;
  bluePoints: number;
  redPoints: number;
  status: 'no_bracket' | 'in_progress' | 'complete';
}

export interface ScoreboardData {
  blueTotal: number;
  redTotal: number;
  champions: ScoreboardChampionRow[];
  sportRows: ScoreboardSportRow[];
}

function computeBracketBreakdown(
  game: Game,
  bracket: Bracket | undefined
): {
  bluePoints: number;
  redPoints: number;
  status: ScoreboardSportRow['status'];
  championName: string | null;
  championTeam: TeamId | null;
  pointsAwarded: number;
} {
  if (!bracket) {
    return {
      bluePoints: 0,
      redPoints: 0,
      status: 'no_bracket',
      championName: null,
      championTeam: null,
      pointsAwarded: 0,
    };
  }

  let bluePoints = 0;
  let redPoints = 0;
  const isTeamGame = game.type === 'team' || bracket.format === 'teammatch';

  if (!isTeamGame && game.pointsPerMatchWin > 0) {
    for (const match of bracket.matches) {
      if (match.bye || match.sameTeam || match.winner === null) continue;
      if (match.winner === 'draw') {
        if (bracket.format === 'roundrobin') {
          const half = game.pointsPerMatchWin / 2;
          bluePoints += half;
          redPoints += half;
        }
        continue;
      }
      const winnerSnap = match.winner === 'a' ? match.a : match.b;
      if (!winnerSnap) continue;
      if (winnerSnap.team === 'blue') {
        bluePoints += game.pointsPerMatchWin;
      } else if (winnerSnap.team === 'red') {
        redPoints += game.pointsPerMatchWin;
      }
    }
  }

  const isComplete =
    bracket.status === 'complete' &&
    Boolean(bracket.championTeam) &&
    Boolean(bracket.championName);

  if (isComplete && bracket.championTeam) {
    if (bracket.championTeam === 'blue') {
      bluePoints += game.pointsChampion;
    } else {
      redPoints += game.pointsChampion;
    }
  }

  return {
    bluePoints,
    redPoints,
    status: bracket.status === 'complete' ? 'complete' : 'in_progress',
    championName: isComplete ? bracket.championName : null,
    championTeam: isComplete ? bracket.championTeam : null,
    pointsAwarded: isComplete ? game.pointsChampion : 0,
  };
}

export function computeScoreboard(
  games: Game[],
  bracketsByGameId: Map<string, Bracket>
): ScoreboardData {
  let blueTotal = 0;
  let redTotal = 0;
  const champions: ScoreboardChampionRow[] = [];
  const sportRows: ScoreboardSportRow[] = [];

  for (const game of games) {
    if (game.hasDivisions) {
      for (const div of DIVISION_LEVELS) {
        const docId = getBracketDocId(game.id, div.level);
        const title = `${game.name} - ${div.label}`;
        const result = computeBracketBreakdown(game, bracketsByGameId.get(docId));
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
            title,
            iconKey: game.iconKey,
            championName: result.championName,
            championTeam: result.championTeam,
            pointsAwarded: result.pointsAwarded,
          });
        }
      }
    } else {
      const docId = game.id;
      const result = computeBracketBreakdown(game, bracketsByGameId.get(docId));
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
          title: game.name,
          iconKey: game.iconKey,
          championName: result.championName,
          championTeam: result.championTeam,
          pointsAwarded: result.pointsAwarded,
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
  bracketsLoaded: boolean;
  scoreboard: ScoreboardData;
} {
  const [bracketsByGameId, setBracketsByGameId] = useState<Map<string, Bracket>>(
    () => new Map()
  );
  const [bracketsLoaded, setBracketsLoaded] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    const unsub = subscribeBrackets(
      (data) => {
        setBracketsByGameId(data);
        setBracketsLoaded(true);
      },
      (err) => {
        setBracketsLoaded(true);
        onSyncError(`Brackets sync error: ${err.message}`);
      }
    );

    return () => {
      unsub();
    };
  }, [authReady, onSyncError]);

  const scoreboard = useMemo(
    () => computeScoreboard(games, bracketsByGameId),
    [games, bracketsByGameId]
  );

  return {
    bracketsByGameId,
    bracketsLoaded,
    scoreboard,
  };
}
