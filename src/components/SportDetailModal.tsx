import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import {
  Bracket,
  DEPARTMENTS,
  ELIGIBILITY_LABELS,
  GAME_SESSION_LABELS,
  GAME_TYPE_LABELS,
  Game,
  Player,
  PlayerEntry,
  Role,
  SKILL_LEVEL_LABELS,
  SkillLevel,
} from '../types/models';
import {
  computeGameStats,
  getDisplayGameBalanceStatus,
  getEffectiveLevel,
} from '../utils/balance';
import {
  DIVISION_LEVELS,
  getBracketDocId,
  getGameParticipantsSummary,
} from '../utils/bracket';
import { BracketView } from './BracketView';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';

interface SportDetailViewProps {
  game: Game;
  players: Player[];
  bracketsByGameId: Map<string, Bracket>;
  role: Role;
  onBack: () => void;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

interface ParticipantRowItem {
  player: Player;
  entry: PlayerEntry;
  effectiveLevel: SkillLevel;
}

function PlayerListRow({
  item,
  showLevel,
}: {
  item: ParticipantRowItem;
  showLevel: boolean;
}) {
  const { player, entry, effectiveLevel } = item;
  return (
    <li className="flex items-start justify-between gap-2 py-2 border-b border-edge last:border-b-0">
      <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
        <span className="text-sm font-medium text-fg leading-snug break-words">
          {player.name}
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
          {player.department}
        </span>
      </div>
      {showLevel && (
        <span
          title={SKILL_LEVEL_LABELS[effectiveLevel]}
          className="px-1.5 py-0.5 rounded-md bg-nested border border-edge text-xs font-medium text-fg tabular-nums shrink-0"
        >
          L{effectiveLevel}
          {entry.overrideLevel ? '*' : ''}
        </span>
      )}
    </li>
  );
}

export function SportDetailView({
  game,
  players,
  bracketsByGameId,
  role,
  onBack,
  onShowToast,
}: SportDetailViewProps) {
  const hasExistingBracket = useMemo(() => {
    if (game.hasDivisions) {
      return DIVISION_LEVELS.some((d) =>
        bracketsByGameId.has(getBracketDocId(game.id, d.level))
      );
    }
    return bracketsByGameId.has(game.id);
  }, [game.id, game.hasDivisions, bracketsByGameId]);

  const [subTab, setSubTab] = useState<'matches' | 'players'>(() =>
    hasExistingBracket ? 'matches' : 'players'
  );
  const [activeDivision, setActiveDivision] = useState<SkillLevel>(1);

  useEffect(() => {
    setSubTab(hasExistingBracket ? 'matches' : 'players');
    setActiveDivision(1);
    // Reset default tab only when switching to a different game
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id]);

  const stats = computeGameStats(players, game.id, undefined, game);
  const displayStatus = getDisplayGameBalanceStatus(stats);

  const participants: ParticipantRowItem[] = players
    .map((player) => {
      const entry = player.entries.find((e) => e.gameId === game.id);
      if (!entry) return null;
      return {
        player,
        entry,
        effectiveLevel: getEffectiveLevel(entry),
      };
    })
    .filter((item): item is ParticipantRowItem => item !== null)
    .sort((a, b) =>
      game.usesSkillLevel
        ? b.effectiveLevel - a.effectiveLevel || a.player.name.localeCompare(b.player.name)
        : a.player.name.localeCompare(b.player.name)
    );

  const blueGroup = participants.filter((p) => p.player.team === 'blue');
  const redGroup = participants.filter((p) => p.player.team === 'red');
  const unassignedGroup = participants.filter((p) => p.player.team === null);

  const divisionSummaries = useMemo(() => {
    if (!game.hasDivisions) return [];
    return DIVISION_LEVELS.map((d) => {
      const summary = getGameParticipantsSummary(game.id, players, {
        division: d.level,
        usesSkillLevel: game.usesSkillLevel,
      });
      const bracket =
        bracketsByGameId.get(getBracketDocId(game.id, d.level)) ?? null;
      return {
        ...d,
        blueCount: summary.blue.length,
        redCount: summary.red.length,
        bracket,
      };
    });
  }, [game.hasDivisions, game.id, game.usesSkillLevel, players, bracketsByGameId]);

  const activeBracket = game.hasDivisions
    ? bracketsByGameId.get(getBracketDocId(game.id, activeDivision)) ?? null
    : bracketsByGameId.get(game.id) ?? null;

  return (
    <div className="space-y-4">
      {/* a. Header */}
      <div className="bg-surface border border-edge rounded-xl p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to sports"
              className="w-11 h-11 rounded-full border border-edge bg-transparent hover:bg-nested hover:border-edge-hover text-fg inline-flex items-center justify-center shrink-0 transition-colors duration-150"
            >
              <ArrowLeft size={18} />
            </button>
            {game.iconKey && (
              <SportIcon iconKey={game.iconKey} size={24} className="text-fg" />
            )}
            <h2 className="text-[20px] font-semibold text-fg leading-snug">
              {game.name}
            </h2>
            <BalanceBadge status={displayStatus} />
          </div>
          <p className="text-xs text-fg-muted mt-1">
            {GAME_TYPE_LABELS[game.type]} · {ELIGIBILITY_LABELS[game.eligibility]} ·{' '}
            {GAME_SESSION_LABELS[game.session]} ·{' '}
            <span className="tabular-nums">
              {participants.length} {participants.length === 1 ? 'player' : 'players'}
            </span>
          </p>
          {game.head && (
            <p className="text-xs font-medium text-[#4ADE80] leading-snug break-words mt-1">
              In-charge: {game.head}
            </p>
          )}
          {game.type === 'team' && game.minPlayersPerTeam && game.minPlayersPerTeam > 0 && (
            <p className="text-xs font-medium text-fg mt-1.5 tabular-nums">
              Minimum {game.minPlayersPerTeam}{' '}
              {game.minPlayersPerTeam === 1 ? 'player' : 'players'} per team required
            </p>
          )}
        </div>

        {/* Champions Summary for division games */}
        {game.hasDivisions && (
          <div className="pt-3 border-t border-edge">
            <div className="flex items-center gap-1.5 mb-2">
              <Trophy size={14} className="text-fg" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Champions
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {divisionSummaries.map((d) => {
                const isComplete =
                  d.bracket?.status === 'complete' &&
                  Boolean(d.bracket.championName) &&
                  Boolean(d.bracket.championTeam);
                return (
                  <div
                    key={d.level}
                    className="px-3 py-2 rounded-lg border border-edge bg-nested flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-fg-muted shrink-0">
                      {d.label}
                    </span>
                    {isComplete && d.bracket ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg min-w-0">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            d.bracket.championTeam === 'blue'
                              ? 'bg-blue-team'
                              : 'bg-red-team'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{d.bracket.championName}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-fg-muted">pending</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Segmented Control: Matches | Players */}
      <div
        role="tablist"
        aria-label="Sport view"
        className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-edge"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'matches'}
          onClick={() => setSubTab('matches')}
          className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors duration-150 ${
            subTab === 'matches'
              ? 'bg-primary text-primary-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          Matches
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'players'}
          onClick={() => setSubTab('players')}
          className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors duration-150 ${
            subTab === 'players'
              ? 'bg-primary text-primary-fg'
              : 'text-fg-muted hover:text-fg'
          }`}
        >
          Players
        </button>
      </div>

      {subTab === 'matches' ? (
        <div className="space-y-4">
          {game.hasDivisions && (
            <div
              role="tablist"
              aria-label="Skill divisions"
              className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-surface border border-edge"
            >
              {divisionSummaries.map((d) => {
                const active = activeDivision === d.level;
                return (
                  <button
                    key={d.level}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveDivision(d.level)}
                    className={`min-h-[44px] px-2 py-1.5 rounded-lg flex flex-col items-center justify-center transition-colors duration-150 ${
                      active
                        ? 'bg-primary text-primary-fg'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="text-xs font-semibold leading-tight">{d.label}</span>
                    <span
                      className={`text-[11px] tabular-nums mt-0.5 ${
                        active ? 'text-primary-fg/80' : 'text-fg-muted'
                      }`}
                    >
                      B {d.blueCount} · R {d.redCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <BracketView
            game={game}
            players={players}
            bracket={activeBracket}
            division={game.hasDivisions ? activeDivision : null}
            role={role}
            onShowToast={onShowToast}
          />
        </div>
      ) : (
        <>
          {/* b. Two team summary cards side by side (Blue, Red) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl border border-blue-edge bg-blue-tint">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-team" aria-hidden="true" />
                <span className="text-xs font-semibold text-blue-light">Blue Team</span>
              </div>
              <p className="text-xl font-semibold text-fg tabular-nums">
                {stats.blue.headcount}{' '}
                <span className="text-xs font-normal text-fg-muted">
                  {stats.blue.headcount === 1 ? 'player' : 'players'}
                </span>
              </p>
              {game.usesSkillLevel && (
                <p className="text-xs text-fg-muted tabular-nums mt-0.5">
                  Total skill: {stats.blue.totalLevel}
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-red-edge bg-red-tint">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-team" aria-hidden="true" />
                <span className="text-xs font-semibold text-red-light">Red Team</span>
              </div>
              <p className="text-xl font-semibold text-fg tabular-nums">
                {stats.red.headcount}{' '}
                <span className="text-xs font-normal text-fg-muted">
                  {stats.red.headcount === 1 ? 'player' : 'players'}
                </span>
              </p>
              {game.usesSkillLevel && (
                <p className="text-xs text-fg-muted tabular-nums mt-0.5">
                  Total skill: {stats.red.totalLevel}
                </p>
              )}
            </div>
          </div>

          {/* c. Two columns directly under the matching team (Blue left, Red right) */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="bg-surface border border-edge rounded-xl p-3 sm:p-4">
              {blueGroup.length === 0 ? (
                <p className="text-xs text-fg-muted">No Blue players yet.</p>
              ) : (
                <ul>
                  {blueGroup.map((item) => (
                    <PlayerListRow
                      key={item.player.id}
                      item={item}
                      showLevel={game.usesSkillLevel}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-surface border border-edge rounded-xl p-3 sm:p-4">
              {redGroup.length === 0 ? (
                <p className="text-xs text-fg-muted">No Red players yet.</p>
              ) : (
                <ul>
                  {redGroup.map((item) => (
                    <PlayerListRow
                      key={item.player.id}
                      item={item}
                      showLevel={game.usesSkillLevel}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* d. Unassigned card */}
          <div className="bg-surface border border-edge rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-fg-muted" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-fg">Unassigned</h3>
              </div>
              <span className="text-xs text-fg-muted tabular-nums">{unassignedGroup.length}</span>
            </div>
            {unassignedGroup.length === 0 ? (
              <p className="text-xs text-fg-muted">No unassigned players.</p>
            ) : (
              <ul>
                {unassignedGroup.map((item) => (
                  <PlayerListRow
                    key={item.player.id}
                    item={item}
                    showLevel={game.usesSkillLevel}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* e. Department Comparison at the very bottom */}
          <div className="bg-surface border border-edge rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-nested border-b border-edge">
              <h3 className="text-sm font-semibold text-fg">Department Comparison</h3>
            </div>
            <div className="grid grid-cols-4 divide-x divide-edge text-center">
              {DEPARTMENTS.map((dept) => (
                <div key={dept} className="p-3">
                  <p className="text-xs font-medium text-fg-muted mb-1">{dept}</p>
                  <p className="text-xs font-semibold text-fg tabular-nums">
                    <span className="text-blue-light">B {stats.blue.deptHeadcount[dept]}</span>
                    {' / '}
                    <span className="text-red-light">R {stats.red.deptHeadcount[dept]}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
