import { useMemo, useState } from 'react';
import { Plus, Search, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  Game,
  Player,
  Role,
  TeamId,
} from '../types/models';
import { getEffectiveLevel } from '../utils/balance';
import { SportIcon } from './SportIcons';
import { TeamIndicator } from './TeamBadge';

type TeamFilter = 'all' | 'unassigned' | TeamId;

interface PlayersTabProps {
  loading: boolean;
  players: Player[];
  games: Game[];
  role: Role;
  onSelectPlayer: (player: Player) => void;
  onOpenAddPlayer: () => void;
  onOpenWalkIn: () => void;
  onOpenAssignSheet: (player: Player) => void;
}

export function PlayersTab({
  loading,
  players,
  games,
  role,
  onSelectPlayer,
  onOpenAddPlayer,
  onOpenWalkIn,
  onOpenAssignSheet,
}: PlayersTabProps) {
  const isAdmin = role === 'admin';

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [deptFilter, setDeptFilter] = useState<Department | 'all'>('all');
  const [gameFilter, setGameFilter] = useState<string>('all');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const counts = useMemo(() => {
    let blue = 0;
    let red = 0;
    let unassigned = 0;
    for (const p of players) {
      if (p.team === 'blue') blue += 1;
      else if (p.team === 'red') red += 1;
      else unassigned += 1;
    }
    return { total: players.length, blue, red, unassigned };
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (teamFilter === 'unassigned' && p.team !== null) return false;
      if (teamFilter === 'blue' && p.team !== 'blue') return false;
      if (teamFilter === 'red' && p.team !== 'red') return false;
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (gameFilter !== 'all' && !p.entries.some((e) => e.gameId === gameFilter)) return false;
      return true;
    });
  }, [players, search, teamFilter, deptFilter, gameFilter]);

  const activeExtraFiltersCount =
    (deptFilter !== 'all' ? 1 : 0) + (gameFilter !== 'all' ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Summary Row */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-surface border border-edge rounded-xl p-3">
          <p className="text-xs text-fg-muted">Total</p>
          <p className="text-lg font-semibold text-fg tabular-nums mt-0.5">
            {loading ? '—' : counts.total}
          </p>
        </div>
        <div className="bg-surface border border-edge rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
            <p className="text-xs text-fg-muted">Blue</p>
          </div>
          <p className="text-lg font-semibold text-fg tabular-nums mt-0.5">
            {loading ? '—' : counts.blue}
          </p>
        </div>
        <div className="bg-surface border border-edge rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
            <p className="text-xs text-fg-muted">Red</p>
          </div>
          <p className="text-lg font-semibold text-fg tabular-nums mt-0.5">
            {loading ? '—' : counts.red}
          </p>
        </div>
        <div className="bg-surface border border-edge rounded-xl p-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-fg-muted" aria-hidden="true" />
            <p className="text-xs text-fg-muted truncate">Unassigned</p>
          </div>
          <p className="text-lg font-semibold text-fg tabular-nums mt-0.5">
            {loading ? '—' : counts.unassigned}
          </p>
        </div>
      </div>

      {/* Search + Walk-in & Filter Trigger */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search
            size={20}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players..."
            aria-label="Search players"
            className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-medium inline-flex items-center gap-2 transition-colors duration-150 ${
              activeExtraFiltersCount > 0
                ? 'bg-primary text-primary-fg border-primary'
                : 'bg-transparent text-fg border-edge hover:bg-nested'
            }`}
          >
            <SlidersHorizontal size={20} />
            <span>Filters</span>
            {activeExtraFiltersCount > 0 && (
              <span className="text-xs tabular-nums">({activeExtraFiltersCount})</span>
            )}
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenWalkIn}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap"
            >
              <UserPlus size={20} />
              <span>Walk-in</span>
            </button>
          )}
        </div>
      </div>

      {/* Team Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'unassigned', label: 'Unassigned' },
            { key: 'blue', label: 'Blue' },
            { key: 'red', label: 'Red' },
          ] as { key: TeamFilter; label: string }[]
        ).map(({ key, label }) => {
          const active = teamFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTeamFilter(key)}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                active
                  ? 'bg-primary text-primary-fg border-primary'
                  : 'bg-surface text-fg-muted border-edge hover:text-fg'
              }`}
            >
              {key === 'blue' && (
                <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
              )}
              {key === 'red' && (
                <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
              )}
              <span>{label}</span>
            </button>
          );
        })}

        {activeExtraFiltersCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setDeptFilter('all');
              setGameFilter('all');
            }}
            className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium text-fg-muted hover:text-fg whitespace-nowrap shrink-0"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading Skeletons */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-surface border border-edge rounded-xl p-4 space-y-3 animate-pulse"
            >
              <div className="flex justify-between">
                <div className="h-5 w-36 bg-nested rounded" />
                <div className="h-5 w-20 bg-nested rounded" />
              </div>
              <div className="h-4 w-28 bg-nested rounded" />
              <div className="flex gap-2">
                <div className="h-6 w-24 bg-nested rounded" />
                <div className="h-6 w-24 bg-nested rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredPlayers.length === 0 ? (
        /* Empty State */
        <div className="bg-surface border border-edge rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-nested border border-edge flex items-center justify-center mx-auto mb-3">
            <Users size={20} className="text-fg-muted" />
          </div>
          <h3 className="text-[16px] font-semibold text-fg mb-1">
            {players.length === 0 ? 'No players registered yet' : 'No matching players'}
          </h3>
          <p className="text-sm text-fg-muted mb-4">
            {players.length === 0
              ? isAdmin
                ? 'Add your first player or register a walk-in to start building teams.'
                : 'Players will appear here as soon as an Admin adds them.'
              : 'Try adjusting your search or team, department, and game filters.'}
          </p>
          {players.length === 0 && isAdmin ? (
            <button
              type="button"
              onClick={onOpenAddPlayer}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150"
            >
              Add First Player
            </button>
          ) : players.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setTeamFilter('all');
                setDeptFilter('all');
                setGameFilter('all');
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-edge bg-transparent text-fg text-sm font-medium hover:bg-nested transition-colors duration-150"
            >
              Reset Filters
            </button>
          ) : null}
        </div>
      ) : (
        /* Player Cards Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredPlayers.map((player) => (
            <div
              key={player.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectPlayer(player)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPlayer(player);
                }
              }}
              className="bg-surface border border-edge rounded-xl p-4 hover:border-edge-hover transition-colors duration-150 cursor-pointer text-left flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-fg truncate">
                      {player.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-nested border border-edge text-fg">
                        {player.department}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {player.gender === 'M' ? 'Male (M)' : 'Female (F)'}
                      </span>
                      {player.isWalkIn && (
                        <span className="text-xs text-fg-muted">· Walk-in</span>
                      )}
                    </div>
                  </div>
                  <TeamIndicator team={player.team} compact />
                </div>

                {/* Compact Game Chips or Muted Empty Label */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {player.entries.length === 0 ? (
                    <span className="text-xs text-fg-muted">No games yet</span>
                  ) : (
                    player.entries.map((entry) => {
                      const game = gameById.get(entry.gameId);
                      const gameName = game?.name ?? entry.gameId;
                      const lvl = getEffectiveLevel(entry);
                      return (
                        <span
                          key={`${entry.slot}-${entry.gameId}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-nested border border-edge text-fg tabular-nums"
                        >
                          {game?.iconKey && (
                            <SportIcon iconKey={game.iconKey} size={13} className="text-fg" />
                          )}
                          <span>
                            {game?.usesSkillLevel ? `${gameName} - L${lvl}` : gameName}
                          </span>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {isAdmin && player.team === null && (
                <div className="pt-2 border-t border-edge flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAssignSheet(player);
                    }}
                    className="min-h-[44px] px-4 py-1.5 rounded-xl bg-primary text-primary-fg text-xs font-medium hover:bg-primary-hover transition-colors duration-150"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating "+" Add Player Button (Admin only) */}
      {isAdmin && (
        <button
          type="button"
          onClick={onOpenAddPlayer}
          aria-label="Add player"
          className="fixed right-4 bottom-20 lg:right-8 lg:bottom-8 z-30 w-14 h-14 rounded-full bg-primary text-primary-fg shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors duration-150"
        >
          <Plus size={24} />
        </button>
      )}

      {/* Filter Sheet Modal */}
      {filterSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-sheet-title"
        >
          <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 id="filter-sheet-title" className="text-[16px] font-semibold text-fg">
                Filter Players
              </h2>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                aria-label="Close filters"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-fg-muted hover:text-fg"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <span className="block text-sm font-medium text-fg mb-2">Department</span>
              <div className="grid grid-cols-5 gap-1 p-1 bg-nested border border-edge rounded-xl">
                {(['all', ...DEPARTMENTS] as const).map((dept) => {
                  const active = deptFilter === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setDeptFilter(dept)}
                      className={`min-h-[44px] px-1 rounded-lg text-xs font-medium transition-colors duration-150 ${
                        active
                          ? 'bg-primary text-primary-fg'
                          : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      {dept === 'all' ? 'All' : dept}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="filter-game-select" className="block text-sm font-medium text-fg mb-2">
                Game
              </label>
              <select
                id="filter-game-select"
                value={gameFilter}
                onChange={(e) => setGameFilter(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg"
              >
                <option value="all">All games</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeptFilter('all');
                  setGameFilter('all');
                }}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
