import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Trophy, X } from 'lucide-react';
import {
  Bracket,
  DEPARTMENTS,
  ELIGIBILITY_LABELS,
  GAME_SESSION_LABELS,
  GAME_TYPE_LABELS,
  Game,
  GamePair,
  GamePairs,
  MassGameDoc,
  Player,
  PlayerEntry,
  Role,
  SKILL_LEVEL_LABELS,
  SkillLevel,
  isMainEntry,
} from '../types/models';
import {
  removePlayerGameEntry,
  restorePlayerGameEntry,
  setPlayerEntryAdmitted,
} from '../services/db';
import {
  computeGameStats,
  getDisplayGameBalanceStatus,
  getEffectiveLevel,
} from '../utils/balance';
import {
  DIVISION_LEVELS,
  getBracketChampionPlayerId,
  getBracketDocId,
  getGameParticipantsSummary,
} from '../utils/bracket';
import { BracketView } from './BracketView';
import { MassGameView } from './MassGameView';
import { ChurchMarker, PlayerNameWithChurch, SlotBadge } from './PlayerMarkers';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';
import { ToastAction } from './Toast';

interface SportDetailViewProps {
  game: Game;
  players: Player[];
  bracketsByGameId: Map<string, Bracket>;
  pairsByGameId: Map<string, GamePairs>;
  massGamesByGameId: Map<string, MassGameDoc>;
  role: Role;
  initialDivision?: SkillLevel | null;
  initialTab?: 'matches' | 'players';
  focusTarget?: 'ongoing';
  navKey?: number;
  backLabel?: string;
  onBack: () => void;
  onOpenPlayerDetails: (player: Player) => void;
  onShowToast: (
    type: 'success' | 'error',
    text: string,
    options?: { durationMs?: number; warningText?: string; action?: ToastAction }
  ) => void;
}

interface ParticipantRowItem {
  player: Player;
  entry: PlayerEntry;
  effectiveLevel: SkillLevel;
}

function PlayerListRow({
  item,
  showLevel,
  onTap,
}: {
  item: ParticipantRowItem;
  showLevel: boolean;
  onTap: (player: Player, entry: PlayerEntry) => void;
}) {
  const { player, entry, effectiveLevel } = item;
  return (
    <li className="border-b border-edge last:border-b-0">
      <button
        type="button"
        onClick={() => onTap(player, entry)}
        className="w-full text-left flex items-start justify-between gap-2 py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-nested transition-colors duration-150"
      >
        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
          <PlayerNameWithChurch
            name={player.name}
            church={player.church}
            className="text-sm font-medium text-fg leading-snug break-words"
          />
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
            {player.department}
          </span>
          <SlotBadge slot={entry.slot} />
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
      </button>
    </li>
  );
}

function PairListRow({
  pair,
  gameId,
  playerById,
  showLevel,
  onTapMember,
}: {
  pair: GamePair;
  gameId: string;
  playerById: ReadonlyMap<string, Player>;
  showLevel: boolean;
  onTapMember: (player: Player, entry: PlayerEntry | undefined) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-2 py-2 border-b border-edge last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1">
        {pair.members.map((member) => {
          const livePlayer = playerById.get(member.playerId);
          const entry = livePlayer?.entries.find((e) => e.gameId === gameId);
          const isWithdrawn = Boolean(member.withdrawn);
          return (
            <button
              key={member.playerId}
              type="button"
              disabled={!livePlayer}
              onClick={() => livePlayer && onTapMember(livePlayer, entry)}
              className="w-full text-left flex items-center flex-wrap gap-x-1.5 gap-y-1 px-1.5 -mx-1.5 py-0.5 rounded-lg hover:bg-nested transition-colors duration-150 disabled:opacity-75"
            >
              <PlayerNameWithChurch
                name={livePlayer?.name ?? member.name}
                church={livePlayer?.church}
                className={`text-sm font-medium leading-snug break-words ${
                  isWithdrawn ? 'text-fg-muted line-through' : 'text-fg'
                }`}
              />
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                {livePlayer?.department ?? member.dept}
              </span>
              <SlotBadge slot={entry?.slot} />
              {isWithdrawn && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg shrink-0">
                  Withdrawn
                </span>
              )}
            </button>
          );
        })}
      </div>
      {showLevel && (
        <span
          title={`Combined level ${pair.combined}`}
          className="px-1.5 py-0.5 rounded-md bg-nested border border-edge text-xs font-medium text-fg tabular-nums shrink-0 mt-0.5"
        >
          L{pair.combined}
        </span>
      )}
    </li>
  );
}

export function SportDetailView({
  game,
  players,
  bracketsByGameId,
  pairsByGameId,
  massGamesByGameId,
  role,
  initialDivision,
  initialTab,
  focusTarget,
  navKey,
  backLabel,
  onBack,
  onOpenPlayerDetails,
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

  const [subTab, setSubTab] = useState<'matches' | 'players'>(
    () => initialTab ?? (hasExistingBracket ? 'matches' : 'players')
  );
  const [activeDivision, setActiveDivision] = useState<SkillLevel>(
    () => initialDivision ?? 1
  );
  const [actionTarget, setActionTarget] = useState<{
    player: Player;
    entry: PlayerEntry;
  } | null>(null);
  const [confirmRemoveTarget, setConfirmRemoveTarget] = useState<{
    player: Player;
    entry: PlayerEntry;
    inBracket: boolean;
  } | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setSubTab(initialTab ?? (hasExistingBracket ? 'matches' : 'players'));
    setActiveDivision(initialDivision ?? 1);
    setActionTarget(null);
    setConfirmRemoveTarget(null);
    // Reset default tab only when switching game or navigating from another screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.id, navKey]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

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

  const mainParticipants = participants.filter((p) => isMainEntry(p.entry));
  const backupParticipants = participants
    .filter((p) => !isMainEntry(p.entry))
    .slice()
    .sort((a, b) => a.player.name.localeCompare(b.player.name));

  const blueGroup = mainParticipants.filter((p) => p.player.team === 'blue');
  const redGroup = mainParticipants.filter((p) => p.player.team === 'red');
  const unassignedGroup = mainParticipants.filter((p) => p.player.team === null);

  const backupBlue = backupParticipants.filter((p) => p.player.team === 'blue');
  const backupRed = backupParticipants.filter((p) => p.player.team === 'red');
  const backupUnassigned = backupParticipants.filter((p) => p.player.team === null);

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

  const gamePairs =
    game.type === 'pairs' ? pairsByGameId.get(game.id) ?? null : null;

  const bluePairs = useMemo(
    () => (gamePairs ? gamePairs.pairs.filter((p) => p.team === 'blue') : []),
    [gamePairs]
  );
  const redPairs = useMemo(
    () => (gamePairs ? gamePairs.pairs.filter((p) => p.team === 'red') : []),
    [gamePairs]
  );
  const blueUnpaired = useMemo(
    () => (gamePairs ? gamePairs.unpaired.filter((u) => u.team === 'blue') : []),
    [gamePairs]
  );
  const redUnpaired = useMemo(
    () => (gamePairs ? gamePairs.unpaired.filter((u) => u.team === 'red') : []),
    [gamePairs]
  );

  function isPlayerInCurrentBracketOrPairs(player: Player): boolean {
    const playerPairIds = new Set<string>();
    if (gamePairs) {
      for (const pair of gamePairs.pairs) {
        if (
          pair.members[0].playerId === player.id ||
          pair.members[1].playerId === player.id
        ) {
          playerPairIds.add(pair.id);
        }
      }
      if (playerPairIds.size > 0) return true;
      if (gamePairs.unpaired.some((u) => u.playerId === player.id)) return true;
    }

    const bracketsToCheck: Bracket[] = [];
    if (game.hasDivisions) {
      for (const d of DIVISION_LEVELS) {
        const b = bracketsByGameId.get(getBracketDocId(game.id, d.level));
        if (b) bracketsToCheck.push(b);
      }
    } else {
      const b = bracketsByGameId.get(game.id);
      if (b) bracketsToCheck.push(b);
    }

    for (const bracket of bracketsToCheck) {
      for (const match of bracket.matches) {
        if (match.a?.playerId === player.id || match.b?.playerId === player.id) {
          return true;
        }
        if (
          (game.type === 'team' || bracket.format === 'teammatch') &&
          player.team !== null
        ) {
          const teamSlotId = player.team === 'blue' ? 'team_blue' : 'team_red';
          if (match.a?.playerId === teamSlotId || match.b?.playerId === teamSlotId) {
            return true;
          }
        }
        if (
          (match.a?.playerId && playerPairIds.has(match.a.playerId)) ||
          (match.b?.playerId && playerPairIds.has(match.b.playerId))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function formatWriteError(err: unknown, fallback: string): string {
    if (!(err instanceof Error)) return fallback;
    try {
      const parsed = JSON.parse(err.message) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
    } catch {
      // Plain error message
    }
    return err.message || fallback;
  }

  function handleTapPlayer(player: Player, entry?: PlayerEntry) {
    if (role === 'viewer') {
      onOpenPlayerDetails(player);
      return;
    }
    const targetEntry = entry ?? player.entries.find((e) => e.gameId === game.id);
    if (!targetEntry) {
      onOpenPlayerDetails(player);
      return;
    }
    setActionTarget({ player, entry: targetEntry });
  }

  async function executeRemove(
    player: Player,
    _entry: PlayerEntry,
    inBracket: boolean,
    withUndoToast: boolean
  ) {
    setRemoving(true);
    try {
      const result = await removePlayerGameEntry(player.id, game.id);
      setActionTarget(null);
      setConfirmRemoveTarget(null);
      if (!result) return;

      if (withUndoToast) {
        onShowToast('success', `Removed from ${game.name}`, {
          durationMs: 5000,
          warningText: inBracket
            ? 'This player is in the current bracket. The bracket is not changed automatically.'
            : undefined,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await restorePlayerGameEntry(player.id, result);
              } catch (err) {
                onShowToast(
                  'error',
                  formatWriteError(err, 'Could not restore sport entry.')
                );
              }
            },
          },
        });
      } else {
        onShowToast('success', `Removed from ${game.name}`);
      }
    } catch (err) {
      onShowToast(
        'error',
        formatWriteError(err, `Failed to remove from ${game.name}.`)
      );
    } finally {
      setRemoving(false);
    }
  }

  async function handleSetAdmitted(admitted: boolean) {
    if (!actionTarget || removing) return;
    const { player } = actionTarget;
    const hasBracketOrPairs = hasExistingBracket || pairsByGameId.has(game.id);
    setRemoving(true);
    try {
      await setPlayerEntryAdmitted(player.id, game.id, admitted);
      setActionTarget(null);
      onShowToast(
        'success',
        admitted ? `Admitted to ${game.name}` : 'Moved back to backup',
        {
          durationMs: 5000,
          warningText: hasBracketOrPairs ? 'Existing bracket not changed' : undefined,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await setPlayerEntryAdmitted(player.id, game.id, !admitted);
              } catch (err) {
                onShowToast(
                  'error',
                  formatWriteError(
                    err,
                    admitted ? 'Could not move back to backup.' : 'Could not admit player.'
                  )
                );
              }
            },
          },
        }
      );
    } catch (err) {
      onShowToast(
        'error',
        formatWriteError(
          err,
          admitted ? `Failed to admit to ${game.name}.` : 'Failed to move back to backup.'
        )
      );
    } finally {
      setRemoving(false);
    }
  }

  function handleRequestRemoveFromPopup() {
    if (!actionTarget) return;
    const { player, entry } = actionTarget;
    const inBracket = isPlayerInCurrentBracketOrPairs(player);
    if (!isMainEntry(entry)) {
      void executeRemove(player, entry, inBracket, true);
    } else {
      setActionTarget(null);
      setConfirmRemoveTarget({ player, entry, inBracket });
    }
  }

  if (game.type === 'mass') {
    return (
      <MassGameView
        game={game}
        massDoc={massGamesByGameId.get(game.id) ?? null}
        role={role}
        backLabel={backLabel}
        onBack={onBack}
        onShowToast={onShowToast}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* a. Header */}
      <div className="bg-surface border border-edge rounded-xl p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel ?? 'Back to sports'}
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
              {mainParticipants.length} {mainParticipants.length === 1 ? 'player' : 'players'}
              {backupParticipants.length > 0 ? ` - ${backupParticipants.length} backup` : ''}
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
                    {isComplete && d.bracket ? (() => {
                      const champId = game.type !== 'pairs' ? getBracketChampionPlayerId(d.bracket) : null;
                      const champChurch = champId ? playerById.get(champId)?.church : undefined;
                      return (
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
                          <ChurchMarker church={champChurch} />
                        </span>
                      );
                    })() : (
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
            gamePairs={gamePairs}
            division={game.hasDivisions ? activeDivision : null}
            role={role}
            focusTarget={focusTarget}
            navKey={navKey}
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
              {gamePairs ? (
                bluePairs.length === 0 && blueUnpaired.length === 0 ? (
                  <p className="text-xs text-fg-muted">No Blue players yet.</p>
                ) : (
                  <ul>
                    {bluePairs.map((pair) => (
                      <PairListRow
                        key={pair.id}
                        pair={pair}
                        gameId={game.id}
                        playerById={playerById}
                        showLevel={game.usesSkillLevel}
                        onTapMember={handleTapPlayer}
                      />
                    ))}
                    {blueUnpaired.map((u) => {
                      const livePlayer = playerById.get(u.playerId);
                      const entry = livePlayer?.entries.find((e) => e.gameId === game.id);
                      return (
                        <li key={u.playerId} className="border-b border-edge last:border-b-0">
                          <button
                            type="button"
                            disabled={!livePlayer}
                            onClick={() => livePlayer && handleTapPlayer(livePlayer, entry)}
                            className="w-full text-left flex items-start justify-between gap-2 py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-nested transition-colors duration-150 disabled:opacity-75"
                          >
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
                              <PlayerNameWithChurch
                                name={livePlayer?.name ?? u.name}
                                church={livePlayer?.church}
                                className="text-sm font-medium text-fg-muted leading-snug break-words"
                              />
                              {livePlayer && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                                  {livePlayer.department}
                                </span>
                              )}
                              <SlotBadge slot={entry?.slot} />
                            </div>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                              No partner
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : blueGroup.length === 0 ? (
                <p className="text-xs text-fg-muted">No Blue players yet.</p>
              ) : (
                <ul>
                  {blueGroup.map((item) => (
                    <PlayerListRow
                      key={item.player.id}
                      item={item}
                      showLevel={game.usesSkillLevel}
                      onTap={handleTapPlayer}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-surface border border-edge rounded-xl p-3 sm:p-4">
              {gamePairs ? (
                redPairs.length === 0 && redUnpaired.length === 0 ? (
                  <p className="text-xs text-fg-muted">No Red players yet.</p>
                ) : (
                  <ul>
                    {redPairs.map((pair) => (
                      <PairListRow
                        key={pair.id}
                        pair={pair}
                        gameId={game.id}
                        playerById={playerById}
                        showLevel={game.usesSkillLevel}
                        onTapMember={handleTapPlayer}
                      />
                    ))}
                    {redUnpaired.map((u) => {
                      const livePlayer = playerById.get(u.playerId);
                      const entry = livePlayer?.entries.find((e) => e.gameId === game.id);
                      return (
                        <li key={u.playerId} className="border-b border-edge last:border-b-0">
                          <button
                            type="button"
                            disabled={!livePlayer}
                            onClick={() => livePlayer && handleTapPlayer(livePlayer, entry)}
                            className="w-full text-left flex items-start justify-between gap-2 py-2 px-1.5 -mx-1.5 rounded-lg hover:bg-nested transition-colors duration-150 disabled:opacity-75"
                          >
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
                              <PlayerNameWithChurch
                                name={livePlayer?.name ?? u.name}
                                church={livePlayer?.church}
                                className="text-sm font-medium text-fg-muted leading-snug break-words"
                              />
                              {livePlayer && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                                  {livePlayer.department}
                                </span>
                              )}
                              <SlotBadge slot={entry?.slot} />
                            </div>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                              No partner
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : redGroup.length === 0 ? (
                <p className="text-xs text-fg-muted">No Red players yet.</p>
              ) : (
                <ul>
                  {redGroup.map((item) => (
                    <PlayerListRow
                      key={item.player.id}
                      item={item}
                      showLevel={game.usesSkillLevel}
                      onTap={handleTapPlayer}
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
                    onTap={handleTapPlayer}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Backup players section */}
          {backupParticipants.length > 0 && (
            <div className="bg-surface border border-edge rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-fg tabular-nums">
                Backup players ({backupParticipants.length})
              </h3>
              <div className="grid grid-cols-2 gap-3 items-start">
                <div className="bg-nested border border-edge rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                    <span className="text-xs font-semibold text-blue-light">Blue</span>
                  </div>
                  {backupBlue.length === 0 ? (
                    <p className="text-xs text-fg-muted">None</p>
                  ) : (
                    <ul>
                      {backupBlue.map((item) => (
                        <PlayerListRow
                          key={item.player.id}
                          item={item}
                          showLevel={false}
                          onTap={handleTapPlayer}
                        />
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-nested border border-edge rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                    <span className="text-xs font-semibold text-red-light">Red</span>
                  </div>
                  {backupRed.length === 0 ? (
                    <p className="text-xs text-fg-muted">None</p>
                  ) : (
                    <ul>
                      {backupRed.map((item) => (
                        <PlayerListRow
                          key={item.player.id}
                          item={item}
                          showLevel={false}
                          onTap={handleTapPlayer}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {backupUnassigned.length > 0 && (
                <div className="pt-2 border-t border-edge">
                  <p className="text-xs font-medium text-fg-muted mb-1 tabular-nums">
                    Unassigned ({backupUnassigned.length})
                  </p>
                  <ul>
                    {backupUnassigned.map((item) => (
                      <PlayerListRow
                        key={item.player.id}
                        item={item}
                        showLevel={false}
                        onTap={handleTapPlayer}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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

      {/* Player Action Popup (Admin / Scorer) */}
      {actionTarget && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sport-player-action-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-4 sm:p-5 shadow-xl space-y-4 pb-safe">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="sport-player-action-title"
                  className="text-[16px] font-semibold text-fg break-words"
                >
                  <PlayerNameWithChurch
                    name={actionTarget.player.name}
                    church={actionTarget.player.church}
                  />{' '}
                  · {actionTarget.player.department}
                </h2>
              </div>
              <button
                type="button"
                disabled={removing}
                onClick={() => setActionTarget(null)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={removing}
                onClick={() => {
                  const p = actionTarget.player;
                  setActionTarget(null);
                  onOpenPlayerDetails(p);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                Details
              </button>
              {!isMainEntry(actionTarget.entry) ? (
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => void handleSetAdmitted(true)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-edge bg-transparent text-fg text-sm font-medium hover:bg-nested transition-colors duration-150 disabled:opacity-50"
                >
                  Admit to main group
                </button>
              ) : (actionTarget.entry.slot === 'secondary' ||
                  actionTarget.entry.slot === 'tertiary') &&
                actionTarget.entry.admitted === true ? (
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => void handleSetAdmitted(false)}
                  className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-edge bg-transparent text-fg text-sm font-medium hover:bg-nested transition-colors duration-150 disabled:opacity-50"
                >
                  Move back to backup
                </button>
              ) : null}
              <button
                type="button"
                disabled={removing}
                onClick={handleRequestRemoveFromPopup}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-red-edge bg-transparent text-red-light text-sm font-medium hover:bg-red-tint transition-colors duration-150 disabled:opacity-50"
              >
                {removing ? 'Removing...' : `Remove from ${game.name}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Game Remove Confirmation Dialog */}
      {confirmRemoveTarget && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sport-player-remove-title"
        >
          <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-4 pb-safe">
            <h2
              id="sport-player-remove-title"
              className="text-[16px] font-semibold text-fg leading-snug"
            >
              {confirmRemoveTarget.player.name}&apos;s main{' '}
              {confirmRemoveTarget.entry.slot === 'afternoon2' ||
              confirmRemoveTarget.entry.slot === 'afternoon3'
                ? 'afternoon'
                : confirmRemoveTarget.entry.slot}{' '}
              game is {game.name}. Remove them from it?
            </h2>

            {confirmRemoveTarget.inBracket && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl border border-status-amber-edge bg-status-amber-bg text-status-amber-fg text-xs font-medium leading-snug">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <span>
                  This player is in the current bracket. The bracket is not changed automatically.
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled={removing}
                onClick={() => setConfirmRemoveTarget(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() =>
                  void executeRemove(
                    confirmRemoveTarget.player,
                    confirmRemoveTarget.entry,
                    confirmRemoveTarget.inBracket,
                    false
                  )
                }
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-red-tint border border-red-edge text-red-light text-sm font-medium hover:bg-red-team/25 transition-colors duration-150 disabled:opacity-50"
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
