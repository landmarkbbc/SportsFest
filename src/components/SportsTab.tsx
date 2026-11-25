import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import {
  ELIGIBILITY_LABELS,
  GAME_TYPE_LABELS,
  Game,
  Player,
} from '../types/models';
import { computeAllGameStats, getDisplayGameBalanceStatus } from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';

interface SportsTabProps {
  loading: boolean;
  games: Game[];
  players: Player[];
  onSelectGame: (game: Game) => void;
}

export function SportsTab({
  loading,
  games,
  players,
  onSelectGame,
}: SportsTabProps) {
  const statsByGameId = useMemo(() => {
    const list = computeAllGameStats(players, games);
    return new Map(list.map((s) => [s.gameId, s]));
  }, [players, games]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border border-edge rounded-xl p-3 sm:p-4 h-40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="bg-surface border border-edge rounded-xl p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-nested border border-edge flex items-center justify-center mx-auto mb-3">
          <Trophy size={20} className="text-fg-muted" />
        </div>
        <h3 className="text-[16px] font-semibold text-fg mb-1">No sports configured</h3>
        <p className="text-sm text-fg-muted">
          An Admin can add games in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
      {games.map((game) => {
        const stats = statsByGameId.get(game.id);
        const blueCount = stats?.blue.headcount ?? 0;
        const redCount = stats?.red.headcount ?? 0;
        const unassignedCount = stats?.unassignedCount ?? 0;
        const totalParticipants = blueCount + redCount + unassignedCount;
        const assignedTotal = blueCount + redCount;
        const bluePercent = assignedTotal > 0 ? Math.round((blueCount / assignedTotal) * 100) : 50;
        const displayStatus = stats ? getDisplayGameBalanceStatus(stats) : 'No players';

        return (
          <button
            key={game.id}
            type="button"
            onClick={() => onSelectGame(game)}
            className="bg-surface border border-edge rounded-xl p-3 sm:p-4 hover:border-edge-hover transition-colors duration-150 text-left flex flex-col justify-between gap-3 min-h-[44px]"
          >
            <div className="space-y-2 w-full">
              <div className="flex items-start gap-2">
                {game.iconKey && (
                  <SportIcon
                    iconKey={game.iconKey}
                    size={24}
                    className="text-fg mt-0.5"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-[16px] font-semibold text-fg leading-snug break-words">
                    {game.name}
                  </h3>
                </div>
              </div>

              <p className="text-xs text-fg-muted leading-snug">
                {GAME_TYPE_LABELS[game.type]}
                {game.eligibility !== 'everyone' ? ` · ${ELIGIBILITY_LABELS[game.eligibility]}` : ''}
                {' · '}
                <span className="tabular-nums">
                  {totalParticipants} {totalParticipants === 1 ? 'player' : 'players'}
                </span>
              </p>

              {game.head && (
                <p className="text-xs font-medium text-[#4ADE80] leading-snug break-words">
                  In-charge: {game.head}
                </p>
              )}

              <div>
                <BalanceBadge status={displayStatus} />
              </div>
            </div>

            <div className="w-full space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-1 text-xs tabular-nums flex-wrap">
                <span className="inline-flex items-center gap-1 font-medium text-blue-light">
                  <span className="w-2 h-2 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
                  Blue {blueCount}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-red-light">
                  Red {redCount}
                  <span className="w-2 h-2 rounded-full bg-red-team shrink-0" aria-hidden="true" />
                </span>
              </div>

              {unassignedCount > 0 && (
                <p className="text-xs text-fg-muted tabular-nums">
                  {unassignedCount} unassigned
                </p>
              )}

              <div className="h-2 w-full rounded-full overflow-hidden bg-nested flex">
                {assignedTotal === 0 ? (
                  <div className="w-full h-full bg-edge" />
                ) : (
                  <>
                    <div
                      className="h-full bg-blue-team transition-all duration-150"
                      style={{ width: `${bluePercent}%` }}
                    />
                    <div
                      className="h-full bg-red-team transition-all duration-150"
                      style={{ width: `${100 - bluePercent}%` }}
                    />
                  </>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
