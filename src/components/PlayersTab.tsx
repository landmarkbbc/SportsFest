import { useMemo, useState } from 'react';
import { Check, ChevronDown, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  Game,
  Player,
  Role,
  TeamId,
} from '../types/models';
import { getEffectiveLevel, getRegularEntries } from '../utils/balance';
import { SportIcon } from './SportIcons';
import { TeamIndicator } from './TeamBadge';

type TeamFilter = 'all' | 'unassigned' | TeamId;
type SortOption = 'az' | 'latest';

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
  const [sortBy, setSortBy] = useState<SortOption>('az');
  const [openMenu, setOpenMenu] = useState<'dept' | 'game' | null>(null);

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
    const filtered = players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (teamFilter === 'unassigned' && p.team !== null) return false;
      if (teamFilter === 'blue' && p.team !== 'blue') return false;
      if (teamFilter === 'red' && p.team !== 'red') return false;
      if (deptFilter !== 'all' && p.department !== deptFilter) return false;
      if (
        gameFilter === 'none' &&
        getRegularEntries(p, gameById).length > 0
      ) {
        return false;
      }
      if (
        gameFilter !== 'all' &&
        gameFilter !== 'none' &&
        !p.entries.some((e) => e.gameId === gameFilter)
      ) {
        return false;
      }
      return true;
    });

    return filtered.slice().sort((a, b) => {
      if (sortBy === 'latest') {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return a.id.localeCompare(b.id);
      }
      const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      if (nameCmp !== 0) return nameCmp;
      return a.id.localeCompare(b.id);
    });
  }, [players, search, teamFilter, deptFilter, gameFilter, sortBy, gameById]);

  const selectedGameLabel =
    gameFilter === 'all'
      ? 'Game'
      : gameFilter === 'none'
        ? 'No sports selected'
        : (gameById.get(gameFilter)?.name ?? 'Game');

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

      {/* Search + Walk-in */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
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

        {isAdmin && (
          <button
            type="button"
            onClick={onOpenWalkIn}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested inline-flex items-center gap-2 transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            <UserPlus size={20} />
            <span>Walk-in</span>
          </button>
        )}
      </div>

      {/* Compact Single-Line Filter & Sort Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap">
        <button
          type="button"
          onClick={() => setOpenMenu('dept')}
          aria-expanded={openMenu === 'dept'}
          className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
            deptFilter !== 'all'
              ? 'bg-primary text-primary-fg border-primary'
              : 'bg-surface text-fg-muted border-edge hover:text-fg'
          }`}
        >
          <span>{deptFilter === 'all' ? 'Department' : deptFilter}</span>
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu('game')}
          aria-expanded={openMenu === 'game'}
          className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 inline-flex items-center gap-1 ${
            gameFilter !== 'all'
              ? 'bg-primary text-primary-fg border-primary'
              : 'bg-surface text-fg-muted border-edge hover:text-fg'
          }`}
        >
          <span>{selectedGameLabel}</span>
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          onClick={() => setSortBy('az')}
          aria-pressed={sortBy === 'az'}
          className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 inline-flex items-center ${
            sortBy === 'az'
              ? 'bg-primary text-primary-fg border-primary'
              : 'bg-surface text-fg-muted border-edge hover:text-fg'
          }`}
        >
          A-Z
        </button>

        <button
          type="button"
          onClick={() => setSortBy('latest')}
          aria-pressed={sortBy === 'latest'}
          className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium border transition-colors duration-150 whitespace-nowrap shrink-0 inline-flex items-center ${
            sortBy === 'latest'
              ? 'bg-primary text-primary-fg border-primary'
              : 'bg-surface text-fg-muted border-edge hover:text-fg'
          }`}
        >
          Latest
        </button>
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
                      {player.church?.trim() && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-nested border border-edge text-fg-muted">
                          {player.church.trim()}
                        </span>
                      )}
                      {player.isWalkIn && (
                        <span className="text-xs text-fg-muted">· Walk-in</span>
                      )}
                    </div>
                  </div>
                  <TeamIndicator team={player.team} compact />
                </div>

                {/* Compact Game Chips or Muted Empty Label */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(() => {
                    const regularEntries = getRegularEntries(player, gameById);
                    if (regularEntries.length === 0) {
                      return <span className="text-xs text-fg-muted">No games yet</span>;
                    }
                    return regularEntries.map((entry) => {
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
                    });
                  })()}
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

      {/* Department / Game Filter Menu Sheet */}
      {openMenu && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="filter-menu-title"
          onClick={() => setOpenMenu(null)}
        >
          <div
            className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-4 shadow-xl max-h-[75vh] flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-edge shrink-0">
              <h2 id="filter-menu-title" className="text-[16px] font-semibold text-fg">
                {openMenu === 'dept' ? 'Department' : 'Game'}
              </h2>
              <button
                type="button"
                onClick={() => setOpenMenu(null)}
                aria-label="Close menu"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-fg-muted hover:text-fg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto pt-2 space-y-1">
              {openMenu === 'dept' ? (
                (['all', ...DEPARTMENTS] as const).map((dept) => {
                  const active = deptFilter === dept;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => {
                        setDeptFilter(dept);
                        setOpenMenu(null);
                      }}
                      className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors duration-150 ${
                        active
                          ? 'bg-nested text-fg'
                          : 'text-fg-muted hover:bg-nested hover:text-fg'
                      }`}
                    >
                      <span>{dept === 'all' ? 'All' : dept}</span>
                      {active && <Check size={16} className="text-fg shrink-0" />}
                    </button>
                  );
                })
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setGameFilter('all');
                      setOpenMenu(null);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors duration-150 ${
                      gameFilter === 'all'
                        ? 'bg-nested text-fg'
                        : 'text-fg-muted hover:bg-nested hover:text-fg'
                    }`}
                  >
                    <span>All</span>
                    {gameFilter === 'all' && <Check size={16} className="text-fg shrink-0" />}
                  </button>

                  {games
                    .filter((g) => g.type !== 'mass')
                    .map((g) => {
                    const active = gameFilter === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setGameFilter(g.id);
                          setOpenMenu(null);
                        }}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-colors duration-150 ${
                          active
                            ? 'bg-nested text-fg'
                            : 'text-fg-muted hover:bg-nested hover:text-fg'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {g.iconKey && (
                            <SportIcon iconKey={g.iconKey} size={16} className="text-fg shrink-0" />
                          )}
                          <span className="truncate">{g.name}</span>
                        </span>
                        {active && <Check size={16} className="text-fg shrink-0" />}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setGameFilter('none');
                      setOpenMenu(null);
                    }}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors duration-150 ${
                      gameFilter === 'none'
                        ? 'bg-nested text-fg'
                        : 'text-fg-muted hover:bg-nested hover:text-fg'
                    }`}
                  >
                    <span>No sports selected</span>
                    {gameFilter === 'none' && <Check size={16} className="text-fg shrink-0" />}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
