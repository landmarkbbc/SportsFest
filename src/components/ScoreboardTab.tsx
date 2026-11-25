import { Trophy } from 'lucide-react';
import { ScoreboardData, ScoreboardSportRow } from '../hooks/useScoreboard';
import { formatPoints } from '../utils/bracket';
import { SportIcon } from './SportIcons';

interface ScoreboardTabProps {
  loading: boolean;
  scoreboard: ScoreboardData;
}

function StatusPill({ status }: { status: ScoreboardSportRow['status'] }) {
  if (status === 'complete') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-status-green-bg text-status-green-fg border border-status-green-edge shrink-0">
        Complete
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-status-amber-bg text-status-amber-fg border border-status-amber-edge shrink-0">
        In progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-status-gray-bg text-status-gray-fg border border-edge shrink-0">
      No bracket
    </span>
  );
}

export function ScoreboardTab({ loading, scoreboard }: ScoreboardTabProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-xl bg-surface border border-edge animate-pulse" />
        <div className="h-32 rounded-xl bg-surface border border-edge animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 rounded-xl bg-surface border border-edge animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const diff = Math.round((scoreboard.blueTotal - scoreboard.redTotal) * 10) / 10;
  const leadText =
    diff === 0
      ? 'Tied'
      : diff > 0
        ? `Blue leads by ${formatPoints(diff)}`
        : `Red leads by ${formatPoints(Math.abs(diff))}`;

  return (
    <div className="space-y-6">
      {/* Top Score Card */}
      <section
        aria-label="Overall team score"
        className="bg-surface border border-edge rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-blue-edge bg-blue-tint p-4 text-center">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-light">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-team" aria-hidden="true" />
              <span>Blue</span>
            </div>
            <p className="text-[36px] sm:text-[42px] font-bold leading-none text-blue-light tabular-nums mt-2">
              {formatPoints(scoreboard.blueTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-red-edge bg-red-tint p-4 text-center">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-light">
              <span className="w-2.5 h-2.5 rounded-full bg-red-team" aria-hidden="true" />
              <span>Red</span>
            </div>
            <p className="text-[36px] sm:text-[42px] font-bold leading-none text-red-light tabular-nums mt-2">
              {formatPoints(scoreboard.redTotal)}
            </p>
          </div>
        </div>

        <p className="text-center text-sm font-semibold text-fg tabular-nums">
          {leadText}
        </p>
      </section>

      {/* Champions Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-fg" />
          <h2 className="text-[16px] font-semibold text-fg">Champions</h2>
        </div>

        {scoreboard.champions.length === 0 ? (
          <div className="bg-surface border border-edge rounded-xl p-4 text-sm text-fg-muted">
            No champions crowned yet.
          </div>
        ) : (
          <div className="bg-surface border border-edge rounded-xl divide-y divide-edge">
            {scoreboard.champions.map((row) => {
              const isBlue = row.championTeam === 'blue';
              return (
                <div
                  key={row.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {row.iconKey && (
                      <SportIcon iconKey={row.iconKey} size={18} className="text-fg-muted" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-fg-muted truncate">{row.title}</p>
                      <p className="text-sm font-semibold text-fg truncate">
                        {row.championName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                        isBlue ? 'text-blue-light' : 'text-red-light'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isBlue ? 'bg-blue-team' : 'bg-red-team'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{isBlue ? 'Blue' : 'Red'}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-nested border border-edge text-xs font-semibold text-fg tabular-nums">
                      +{formatPoints(row.pointsAwarded)} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* By Sport Section */}
      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-fg">By sport</h2>

        {scoreboard.sportRows.length === 0 ? (
          <div className="bg-surface border border-edge rounded-xl p-4 text-sm text-fg-muted">
            No sports configured yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scoreboard.sportRows.map((row) => (
              <div
                key={row.id}
                className="bg-surface border border-edge rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.game.iconKey && (
                      <SportIcon iconKey={row.game.iconKey} size={18} className="text-fg" />
                    )}
                    <h3 className="text-sm font-semibold text-fg leading-snug break-words">
                      {row.title}
                    </h3>
                  </div>
                  <StatusPill status={row.status} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-edge text-xs tabular-nums">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-blue-light">
                    <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                    <span>Blue {formatPoints(row.bluePoints)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-red-light">
                    <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                    <span>Red {formatPoints(row.redPoints)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
