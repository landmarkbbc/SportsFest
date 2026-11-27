import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import {
  BracketFormat,
  BracketGroup,
  Game,
  GamePairs,
  Player,
  SkillLevel,
} from '../types/models';
import { createBracket } from '../services/db';
import {
  DIVISION_LEVELS,
  buildInitialBracket,
  estimateMatchCount,
  getBracketDocId,
  getGameParticipantsSummary,
  getTeamMinPlayersError,
} from '../utils/bracket';

interface CreateBracketModalProps {
  open: boolean;
  game: Game;
  players: Player[];
  gamePairs?: GamePairs | null;
  division?: SkillLevel | null;
  group?: BracketGroup;
  onClose: () => void;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

export function CreateBracketModal({
  open,
  game,
  players,
  gamePairs = null,
  division = null,
  group = 'main',
  onClose,
  onShowToast,
}: CreateBracketModalProps) {
  const defaultFormat: BracketFormat =
    game.type === 'team' ? 'teammatch' : 'elimination';
  const [format, setFormat] = useState<BracketFormat>(defaultFormat);
  const [submitting, setSubmitting] = useState(false);

  const effectiveGroup: BracketGroup =
    game.type === 'individual' ? group : 'main';

  useEffect(() => {
    if (open) {
      setFormat(game.type === 'team' ? 'teammatch' : 'elimination');
      setSubmitting(false);
    }
  }, [open, game.id, game.type, division, effectiveGroup]);

  const activeDivision = game.hasDivisions ? division : null;
  const divisionLabel = activeDivision
    ? DIVISION_LEVELS.find((d) => d.level === activeDivision)?.label ?? `L${activeDivision}`
    : null;

  const summary = useMemo(
    () =>
      getGameParticipantsSummary(game.id, players, {
        division: activeDivision,
        usesSkillLevel: game.usesSkillLevel,
        group: effectiveGroup,
      }),
    [game.id, game.usesSkillLevel, players, activeDivision, effectiveGroup]
  );

  if (!open) return null;

  const isPairs = game.type === 'pairs';
  const blueCount = isPairs
    ? (gamePairs?.pairs.filter((p) => p.team === 'blue').length ?? 0)
    : summary.blue.length;
  const redCount = isPairs
    ? (gamePairs?.pairs.filter((p) => p.team === 'red').length ?? 0)
    : summary.red.length;
  const excludedCount = isPairs
    ? (gamePairs?.unpaired.length ?? 0)
    : summary.unassignedCount;
  const missingTeam = blueCount === 0 || redCount === 0;
  const minPlayersError = getTeamMinPlayersError(game, blueCount, redCount);
  const isBlocked = missingTeam || Boolean(minPlayersError);
  const matchCount = estimateMatchCount(game.type, format, blueCount, redCount);
  const byeCount =
    format === 'elimination' ? Math.abs(blueCount - redCount) : 0;
  const roundRobinRounds =
    format === 'roundrobin' ? Math.max(blueCount, redCount) : 0;

  async function handleCreate() {
    if (isBlocked || submitting) return;
    setSubmitting(true);
    try {
      const bracketDocId = getBracketDocId(game.id, activeDivision, effectiveGroup);
      const bracket = buildInitialBracket(game, players, format, {
        division: activeDivision,
        group: effectiveGroup,
        gamePairs,
      });
      await createBracket(bracketDocId, bracket);
      const targetLabel = divisionLabel ? `${game.name} · ${divisionLabel}` : game.name;
      onShowToast(
        'success',
        effectiveGroup === 'backup'
          ? `Backup bracket created for ${targetLabel}.`
          : `Bracket created for ${targetLabel}.`
      );
      onClose();
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create bracket.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-bracket-title"
    >
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="create-bracket-title"
              className="text-[16px] font-semibold text-fg"
            >
              {effectiveGroup === 'backup' ? 'Create backup bracket' : 'Create bracket'}
            </h2>
            <p className="text-xs text-fg-muted mt-0.5 truncate">
              {divisionLabel ? `${game.name} · ${divisionLabel}` : game.name}
              {effectiveGroup === 'backup' ? ' · Backup players' : ''}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Participant counts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-blue-edge bg-blue-tint">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-team" aria-hidden="true" />
              <span className="text-xs font-semibold text-blue-light">Blue</span>
            </div>
            <p className="text-lg font-semibold text-fg tabular-nums">
              {blueCount}{' '}
              <span className="text-xs font-normal text-fg-muted">
                {isPairs
                  ? blueCount === 1
                    ? 'pair'
                    : 'pairs'
                  : blueCount === 1
                    ? 'player'
                    : 'players'}
              </span>
            </p>
          </div>

          <div className="p-3 rounded-xl border border-red-edge bg-red-tint">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-team" aria-hidden="true" />
              <span className="text-xs font-semibold text-red-light">Red</span>
            </div>
            <p className="text-lg font-semibold text-fg tabular-nums">
              {redCount}{' '}
              <span className="text-xs font-normal text-fg-muted">
                {isPairs
                  ? redCount === 1
                    ? 'pair'
                    : 'pairs'
                  : redCount === 1
                    ? 'player'
                    : 'players'}
              </span>
            </p>
          </div>
        </div>

        {excludedCount > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-status-amber-edge bg-status-amber-bg text-status-amber-fg">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              <span className="font-semibold tabular-nums">{excludedCount}</span>{' '}
              {isPairs ? 'unpaired' : 'unassigned'}{' '}
              {excludedCount === 1 ? 'player is' : 'players are'} excluded.{' '}
              {isPairs
                ? 'Only confirmed Blue and Red pairs are included.'
                : 'Only assigned Blue and Red players are included.'}
            </p>
          </div>
        )}

        {/* Format choices */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide">
            Format
          </p>

          {game.type === 'team' ? (
            <div className="w-full min-h-[44px] px-4 py-3 rounded-xl border-2 border-fg bg-nested text-left">
              <p className="text-sm font-semibold text-fg">
                Single Blue vs Red match
              </p>
              <p className="text-xs text-fg-muted mt-0.5">
                One team match decides the champion.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setFormat('elimination')}
                className={`w-full min-h-[44px] px-4 py-3 rounded-xl border text-left transition-colors duration-150 ${
                  format === 'elimination'
                    ? 'border-2 border-fg bg-nested'
                    : 'border-edge bg-surface hover:bg-nested'
                }`}
              >
                <p className="text-sm font-semibold text-fg">
                  Single elimination
                </p>
                <p className="text-xs text-fg-muted mt-0.5">
                  Round-by-round Blue vs Red matchups; winners advance.
                </p>
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setFormat('roundrobin')}
                className={`w-full min-h-[44px] px-4 py-3 rounded-xl border text-left transition-colors duration-150 ${
                  format === 'roundrobin'
                    ? 'border-2 border-fg bg-nested'
                    : 'border-edge bg-surface hover:bg-nested'
                }`}
              >
                <p className="text-sm font-semibold text-fg">Round robin</p>
                <p className="text-xs text-fg-muted mt-0.5">
                  Every Blue {isPairs ? 'pair' : 'player'} faces every Red{' '}
                  {isPairs ? 'pair' : 'player'} once.
                </p>
              </button>

              <button
                type="button"
                disabled
                className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-edge bg-nested text-left opacity-55 cursor-not-allowed"
              >
                <p className="text-sm font-medium text-fg-muted">
                  Double elimination (coming soon)
                </p>
              </button>
            </div>
          )}
        </div>

        {/* Match count summary */}
        <div className="p-3 rounded-xl border border-edge bg-nested flex items-center justify-between text-xs gap-2">
          <span className="text-fg-muted">Matches</span>
          {missingTeam ? (
            <span className="font-medium text-red-light text-right">
              Need at least 1 Blue and 1 Red {isPairs ? 'pair' : 'player'}
            </span>
          ) : format === 'elimination' ? (
            <span className="font-semibold text-fg tabular-nums">
              {matchCount} Round 1 {matchCount === 1 ? 'match' : 'matches'}
              {byeCount > 0 ? ` · ${byeCount} ${byeCount === 1 ? 'bye' : 'byes'}` : ''}
            </span>
          ) : format === 'roundrobin' ? (
            <span className="font-semibold text-fg tabular-nums">
              {matchCount} {matchCount === 1 ? 'match' : 'matches'} across{' '}
              {roundRobinRounds} {roundRobinRounds === 1 ? 'round' : 'rounds'}
            </span>
          ) : (
            <span className="font-semibold text-fg tabular-nums">
              1 match (Blue vs Red)
            </span>
          )}
        </div>

        {minPlayersError ? (
          <p className="text-xs text-red-light font-medium">{minPlayersError}</p>
        ) : (
          missingTeam && (
            <p className="text-xs text-red-light font-medium">
              {isPairs
                ? 'Both Blue and Red need at least one pair before creating a bracket.'
                : 'Assign at least one player to both Blue and Red before creating a bracket.'}
            </p>
          )
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isBlocked || submitting}
            onClick={() => void handleCreate()}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create bracket'}
          </button>
        </div>
      </div>
    </div>
  );
}
