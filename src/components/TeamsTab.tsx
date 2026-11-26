import { useMemo, useState } from 'react';
import {
  BarChart2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Shuffle,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  Game,
  Player,
  Role,
  SportNavigationTarget,
  TeamId,
} from '../types/models';
import {
  DEPT_GENDER_GROUPS,
  DeptGenderKey,
  computeAllGameStats,
  emptyDeptGenderCounts,
  getDeptGenderKey,
  getDisplayGameBalanceStatus,
} from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';

interface TeamsTabProps {
  loading: boolean;
  players: Player[];
  games: Game[];
  role: Role;
  collapsedGroupKeys: Set<string>;
  onToggleGroupKey: (groupKey: string) => void;
  onSetCollapsedGroupKeys: (nextKeys: Set<string>) => void;
  onOpenBulkAssignPreview: () => void;
  onOpenRebalancePreview: () => void;
  onSelectSport: (target: SportNavigationTarget) => void;
  onSelectPlayer: (player: Player) => void;
}

interface DepartmentOutlineGroup {
  groupId: string;
  label: string;
  members: Player[];
}

const TEAM_OUTLINE_SPECS: {
  groupId: string;
  label: string;
  dept: Department;
  gender?: 'M' | 'F';
}[] = [
  { groupId: 'Kids', label: 'Kids', dept: 'Kids' },
  { groupId: 'YP:M', label: 'YP Males', dept: 'YP', gender: 'M' },
  { groupId: 'YP:F', label: 'YP Females', dept: 'YP', gender: 'F' },
  { groupId: 'SP:M', label: 'SP Males', dept: 'SP', gender: 'M' },
  { groupId: 'SP:F', label: 'SP Females', dept: 'SP', gender: 'F' },
  { groupId: 'Adults:M', label: 'Adults Males', dept: 'Adults', gender: 'M' },
  { groupId: 'Adults:F', label: 'Adults Females', dept: 'Adults', gender: 'F' },
];

function buildTeamDepartmentGroups(members: Player[]): DepartmentOutlineGroup[] {
  return TEAM_OUTLINE_SPECS.map((spec) => ({
    groupId: spec.groupId,
    label: spec.label,
    members: members
      .filter(
        (p) =>
          p.department === spec.dept &&
          (spec.gender === undefined || p.gender === spec.gender)
      )
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function countByDepartment(members: Player[]): Record<Department, number> {
  const counts: Record<Department, number> = { Kids: 0, YP: 0, SP: 0, Adults: 0 };
  for (const player of members) {
    counts[player.department] += 1;
  }
  return counts;
}

function countByDeptGender(members: Player[]): Record<DeptGenderKey, number> {
  const counts = emptyDeptGenderCounts();
  for (const player of members) {
    counts[getDeptGenderKey(player)] += 1;
  }
  return counts;
}

export function TeamsTab({
  loading,
  players,
  games,
  role,
  collapsedGroupKeys,
  onToggleGroupKey,
  onSetCollapsedGroupKeys,
  onOpenBulkAssignPreview,
  onOpenRebalancePreview,
  onSelectSport,
  onSelectPlayer,
}: TeamsTabProps) {
  const isAdmin = role === 'admin';
  const [compareOpen, setCompareOpen] = useState(false);

  const unassignedCount = useMemo(
    () => players.filter((p) => p.team === null).length,
    [players]
  );

  const bluePlayers = useMemo(
    () => players.filter((p) => p.team === 'blue'),
    [players]
  );

  const redPlayers = useMemo(
    () => players.filter((p) => p.team === 'red'),
    [players]
  );

  const blueGroups = useMemo(
    () => buildTeamDepartmentGroups(bluePlayers.filter((p) => p.entries.length > 0)),
    [bluePlayers]
  );

  const redGroups = useMemo(
    () => buildTeamDepartmentGroups(redPlayers.filter((p) => p.entries.length > 0)),
    [redPlayers]
  );

  const blueNoSportsGroups = useMemo(
    () =>
      buildTeamDepartmentGroups(bluePlayers.filter((p) => p.entries.length === 0)).filter(
        (g) => g.members.length > 0
      ),
    [bluePlayers]
  );

  const redNoSportsGroups = useMemo(
    () =>
      buildTeamDepartmentGroups(redPlayers.filter((p) => p.entries.length === 0)).filter(
        (g) => g.members.length > 0
      ),
    [redPlayers]
  );

  const blueDeptCounts = useMemo(
    () => countByDepartment(bluePlayers),
    [bluePlayers]
  );

  const redDeptCounts = useMemo(
    () => countByDepartment(redPlayers),
    [redPlayers]
  );

  const blueDeptGenderCounts = useMemo(
    () => countByDeptGender(bluePlayers),
    [bluePlayers]
  );

  const redDeptGenderCounts = useMemo(
    () => countByDeptGender(redPlayers),
    [redPlayers]
  );

  const allVisibleGroupKeys = useMemo(() => {
    const keys: string[] = [];
    if (bluePlayers.length > 0) {
      for (const g of blueGroups) {
        if (g.members.length > 0) keys.push(`blue:${g.groupId}`);
      }
      if (blueNoSportsGroups.length > 0) keys.push('blue:no-sports');
    }
    if (redPlayers.length > 0) {
      for (const g of redGroups) {
        if (g.members.length > 0) keys.push(`red:${g.groupId}`);
      }
      if (redNoSportsGroups.length > 0) keys.push('red:no-sports');
    }
    return keys;
  }, [bluePlayers.length, redPlayers.length, blueGroups, redGroups, blueNoSportsGroups.length, redNoSportsGroups.length]);

  const allCollapsed =
    allVisibleGroupKeys.length > 0 &&
    allVisibleGroupKeys.every((k) => collapsedGroupKeys.has(k));

  const allGameStats = useMemo(
    () => computeAllGameStats(players, games),
    [players, games]
  );

  function handleToggleExpandCollapseAll() {
    if (allCollapsed) {
      onSetCollapsedGroupKeys(new Set());
    } else {
      onSetCollapsedGroupKeys(new Set(allVisibleGroupKeys));
    }
  }

  function renderTeamColumn(
    team: TeamId,
    members: Player[],
    groups: DepartmentOutlineGroup[],
    noSportsGroups: DepartmentOutlineGroup[]
  ) {
    const isBlue = team === 'blue';
    const noSportsCount = noSportsGroups.reduce((sum, g) => sum + g.members.length, 0);
    const noSportsKey = `${team}:no-sports`;
    const isNoSportsCollapsed = collapsedGroupKeys.has(noSportsKey);

    return (
      <section
        aria-label={`${isBlue ? 'Blue' : 'Red'} team roster`}
        className="bg-surface border border-edge rounded-xl overflow-hidden flex flex-col min-h-0 h-full"
      >
        {/* Sticky Team Column Header */}
        <div
          className={`sticky top-0 z-10 px-3 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
            isBlue
              ? 'bg-blue-tint-surface border-blue-edge text-blue-light'
              : 'bg-red-tint-surface border-red-edge text-red-light'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isBlue ? 'bg-blue-team' : 'bg-red-team'
              }`}
              aria-hidden="true"
            />
            <h2 className="text-sm font-semibold truncate">{isBlue ? 'Blue' : 'Red'}</h2>
          </div>
          <span className="text-xs font-semibold tabular-nums shrink-0">{members.length}</span>
        </div>

        {/* Independently Scrollable Column Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-2">
          {members.length === 0 ? (
            <div className="py-8 px-2 text-center">
              <div className="w-10 h-10 rounded-xl bg-nested border border-edge flex items-center justify-center mx-auto mb-2">
                <Users size={18} className="text-fg-muted" />
              </div>
              <p className="text-xs font-medium text-fg">
                No {isBlue ? 'Blue' : 'Red'} players yet
              </p>
              <p className="text-xs text-fg-muted mt-1">
                {unassignedCount > 0
                  ? 'Assign players to build this team.'
                  : 'Add players in the Players tab.'}
              </p>
            </div>
          ) : (
            <>
              {groups.map((group) => {
                const key = `${team}:${group.groupId}`;
                const isEmpty = group.members.length === 0;
                const isCollapsed = collapsedGroupKeys.has(key);

                if (isEmpty) {
                  return (
                    <div key={group.groupId} className="px-1.5 py-[6px] flex items-center text-left">
                      <span className="text-xs font-medium text-fg-muted leading-snug tabular-nums">
                        {group.label} (0)
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={group.groupId}>
                    <button
                      type="button"
                      aria-expanded={!isCollapsed}
                      onClick={() => onToggleGroupKey(key)}
                      className="w-full px-1.5 py-[6px] rounded-lg hover:bg-nested transition-colors duration-150 flex items-start gap-1.5 text-left"
                    >
                      <ChevronRight
                        size={16}
                        className={`text-fg-muted shrink-0 mt-0.5 transition-transform duration-150 ${
                          isCollapsed ? '' : 'rotate-90'
                        }`}
                      />
                      <span className="text-xs font-semibold text-fg leading-snug break-words flex-1">
                        {group.label}{' '}
                        <span className="font-medium text-fg-muted tabular-nums">
                          ({group.members.length})
                        </span>
                      </span>
                    </button>

                    {!isCollapsed && (
                      <ul className="pl-6 pr-1 pt-0.5">
                        {group.members.map((player) => (
                          <li key={player.id} className="flex items-start gap-1.5">
                            <span
                              className="text-fg-muted text-sm leading-[1.3] py-[2px] select-none shrink-0"
                              aria-hidden="true"
                            >
                              •
                            </span>
                            <button
                              type="button"
                              onClick={() => onSelectPlayer(player)}
                              className="text-left text-sm leading-[1.3] text-fg hover:underline break-words py-[2px] flex-1"
                            >
                              {player.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              {noSportsCount > 0 && (
                <div className="pt-2 mt-2 border-t-2 border-edge-hover">
                  <button
                    type="button"
                    aria-expanded={!isNoSportsCollapsed}
                    onClick={() => onToggleGroupKey(noSportsKey)}
                    className="w-full px-1.5 py-[6px] rounded-lg hover:bg-nested transition-colors duration-150 flex items-start gap-1.5 text-left"
                  >
                    <ChevronRight
                      size={16}
                      className={`text-fg-muted shrink-0 mt-0.5 transition-transform duration-150 ${
                        isNoSportsCollapsed ? '' : 'rotate-90'
                      }`}
                    />
                    <span className="text-xs font-semibold text-fg leading-snug break-words flex-1">
                      No sports selected{' '}
                      <span className="font-medium text-fg-muted tabular-nums">
                        ({noSportsCount})
                      </span>
                    </span>
                  </button>

                  {!isNoSportsCollapsed && (
                    <div className="pl-4 pt-0.5 space-y-1.5">
                      {noSportsGroups.map((sub) => (
                        <div key={sub.groupId}>
                          <div className="px-1.5 py-0.5 text-xs font-semibold text-fg leading-snug break-words">
                            {sub.label}{' '}
                            <span className="font-medium text-fg-muted tabular-nums">
                              ({sub.members.length})
                            </span>
                          </div>
                          <ul className="pl-4 pr-1">
                            {sub.members.map((player) => (
                              <li key={player.id} className="flex items-start gap-1.5">
                                <span
                                  className="text-fg-muted text-sm leading-[1.3] py-[2px] select-none shrink-0"
                                  aria-hidden="true"
                                >
                                  •
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onSelectPlayer(player)}
                                  className="text-left text-sm leading-[1.3] text-fg hover:underline break-words py-[2px] flex-1"
                                >
                                  {player.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-160px)] lg:h-[calc(100dvh-112px)] min-h-[420px] gap-3">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        {isAdmin ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={unassignedCount === 0}
              onClick={onOpenBulkAssignPreview}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-primary text-primary-fg text-xs sm:text-sm font-medium hover:bg-primary-hover inline-flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-45"
            >
              <Sparkles size={18} />
              <span>Assign all unassigned</span>
            </button>
            <span className="text-xs font-medium text-fg-muted tabular-nums">
              {unassignedCount} unassigned
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-fg-muted tabular-nums">
            {unassignedCount} unassigned
          </span>
        )}

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenRebalancePreview}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150"
            >
              <Shuffle size={16} />
              <span>Re-balance</span>
            </button>
          )}
          {allVisibleGroupKeys.length > 0 && (
            <button
              type="button"
              onClick={handleToggleExpandCollapseAll}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150"
            >
              {allCollapsed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}
              <span>{allCollapsed ? 'Expand all' : 'Collapse all'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-xs sm:text-sm font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150"
          >
            <BarChart2 size={18} />
            <span>Compare</span>
          </button>
        </div>
      </div>

      {/* Two Equal Independent-Scroll Columns */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:gap-4 flex-1 min-h-0">
          <div className="bg-surface border border-edge rounded-xl animate-pulse" />
          <div className="bg-surface border border-edge rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:gap-4 flex-1 min-h-0">
          {renderTeamColumn('blue', bluePlayers, blueGroups, blueNoSportsGroups)}
          {renderTeamColumn('red', redPlayers, redGroups, redNoSportsGroups)}
        </div>
      )}

      {/* Full-Screen Compare Sheet */}
      {compareOpen && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-stretch lg:items-center justify-center lg:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-sheet-title"
        >
          <div className="bg-surface w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-4xl lg:rounded-xl lg:border lg:border-edge lg:shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
              <div>
                <h2 id="compare-sheet-title" className="text-[16px] font-semibold text-fg">
                  Compare Blue & Red
                </h2>
                <p className="text-xs text-fg-muted tabular-nums">
                  Blue {bluePlayers.length} · Red {redPlayers.length} · Unassigned {unassignedCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                aria-label="Close compare"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Departments (all players) */}
              <div>
                <h3 className="text-[16px] font-semibold text-fg mb-3">
                  Departments (all players)
                </h3>
                <div className="bg-nested border border-edge rounded-xl p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    {DEPARTMENTS.map((dept) => (
                      <div
                        key={dept}
                        className="p-2.5 rounded-lg bg-surface border border-edge text-xs"
                      >
                        <p className="text-fg-muted font-medium">{dept}</p>
                        <p className="text-sm font-semibold text-fg tabular-nums mt-1">
                          <span className="text-blue-light">{blueDeptCounts[dept]}</span>
                          <span className="text-fg-muted font-normal"> vs </span>
                          <span className="text-red-light">{redDeptCounts[dept]}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Department by gender (all players) */}
              <div>
                <h3 className="text-[16px] font-semibold text-fg mb-3">
                  Department by gender (all players)
                </h3>
                <div className="bg-nested border border-edge rounded-xl p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    {DEPT_GENDER_GROUPS.map((group) => (
                      <div
                        key={group.key}
                        className="p-2.5 rounded-lg bg-surface border border-edge text-xs"
                      >
                        <p className="text-fg-muted font-medium">{group.label}</p>
                        <p className="text-sm font-semibold text-fg tabular-nums mt-1">
                          <span className="text-blue-light">{blueDeptGenderCounts[group.key]}</span>
                          <span className="text-fg-muted font-normal"> vs </span>
                          <span className="text-red-light">{redDeptGenderCounts[group.key]}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {games.length === 0 ? (
                <p className="text-sm text-fg-muted text-center py-8">No games configured yet.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {games.map((game) => {
                    const stats = allGameStats.find((s) => s.gameId === game.id);
                    if (!stats) return null;
                    const displayStatus = getDisplayGameBalanceStatus(stats);

                    return (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => {
                          setCompareOpen(false);
                          onSelectSport({ gameId: game.id });
                        }}
                        className="w-full text-left bg-nested border border-edge hover:border-edge-hover rounded-xl p-4 space-y-3 transition-colors duration-150"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {game.iconKey && (
                              <SportIcon
                                iconKey={game.iconKey}
                                size={18}
                                className="text-fg"
                              />
                            )}
                            <h3 className="text-[16px] font-semibold text-fg truncate">
                              {game.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <BalanceBadge status={displayStatus} />
                            <ChevronRight
                              size={16}
                              className="text-fg-muted shrink-0"
                              aria-hidden="true"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-blue-tint border border-blue-edge">
                            <div className="flex items-center gap-1.5 font-semibold text-blue-light mb-1">
                              <span
                                className="w-2 h-2 rounded-full bg-blue-team"
                                aria-hidden="true"
                              />
                              <span>Blue</span>
                            </div>
                            <p className="text-sm font-semibold text-fg tabular-nums">
                              {stats.blue.headcount}{' '}
                              {stats.blue.headcount === 1 ? 'player' : 'players'}
                              {game.usesSkillLevel ? ` · Skill ${stats.blue.totalLevel}` : ''}
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-red-tint border border-red-edge">
                            <div className="flex items-center gap-1.5 font-semibold text-red-light mb-1">
                              <span
                                className="w-2 h-2 rounded-full bg-red-team"
                                aria-hidden="true"
                              />
                              <span>Red</span>
                            </div>
                            <p className="text-sm font-semibold text-fg tabular-nums">
                              {stats.red.headcount}{' '}
                              {stats.red.headcount === 1 ? 'player' : 'players'}
                              {game.usesSkillLevel ? ` · Skill ${stats.red.totalLevel}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-edge text-center">
                          {DEPARTMENTS.map((dept) => (
                            <div key={dept} className="text-xs">
                              <p className="text-fg-muted">{dept}</p>
                              <p className="font-medium text-fg tabular-nums mt-0.5">
                                <span className="text-blue-light">
                                  {stats.blue.deptHeadcount[dept]}
                                </span>
                                {' / '}
                                <span className="text-red-light">
                                  {stats.red.deptHeadcount[dept]}
                                </span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-edge bg-surface shrink-0 pb-safe">
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
