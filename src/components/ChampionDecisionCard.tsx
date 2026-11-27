import { useState } from 'react';
import { Check, Lock, RotateCcw, Trophy, X } from 'lucide-react';
import {
  Bracket,
  BracketSlotSnapshot,
  FinalMatch,
  Game,
  Player,
  Role,
} from '../types/models';
import {
  createFinalMatch,
  decideFinalMatch,
  deleteFinalMatch,
  undoFinalMatch,
} from '../services/db';
import {
  AlreadyDecidedError,
  StaleBracketError,
  getBracketChampionSnapshot,
} from '../utils/bracket';
import { PlayerNameWithChurch } from './PlayerMarkers';

interface ChampionDecisionCardProps {
  finalKey: string;
  game: Game;
  divisionLabel?: string | null;
  mainBracket: Bracket;
  backupBracket: Bracket;
  finalMatch: FinalMatch | null;
  playerById: ReadonlyMap<string, Player>;
  role: Role;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

export function ChampionDecisionCard({
  finalKey,
  game,
  divisionLabel = null,
  mainBracket,
  backupBracket,
  finalMatch,
  playerById,
  role,
  onShowToast,
}: ChampionDecisionCardProps) {
  const [busyMode, setBusyMode] = useState(false);
  const [pendingSide, setPendingSide] = useState<'a' | 'b' | null>(null);
  const [savingDecision, setSavingDecision] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const mainWinner = getBracketChampionSnapshot(mainBracket);
  const backupWinner = getBracketChampionSnapshot(backupBracket);
  if (!mainWinner || !backupWinner) return null;

  const canScore = role === 'admin' || role === 'scorer';
  const hasFinal = Boolean(finalMatch);

  async function handleSelectNoFinal() {
    if (!canScore || !hasFinal || busyMode) return;
    setBusyMode(true);
    try {
      await deleteFinalMatch(finalKey);
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : 'Failed to update champion decision.'
      );
    } finally {
      setBusyMode(false);
    }
  }

  async function handleSelectPlayFinal() {
    if (!canScore || hasFinal || busyMode || !mainWinner || !backupWinner) return;
    setBusyMode(true);
    try {
      await createFinalMatch(finalKey, mainWinner, backupWinner);
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create final match.'
      );
    } finally {
      setBusyMode(false);
    }
  }

  async function handleConfirmWinner() {
    if (!canScore || !pendingSide || savingDecision) return;
    setSavingDecision(true);
    try {
      const actor = role === 'admin' ? 'Admin' : 'Scorer';
      await decideFinalMatch(finalKey, pendingSide, actor);
      setPendingSide(null);
    } catch (err) {
      if (err instanceof AlreadyDecidedError) {
        onShowToast('error', 'Already decided by another scorer');
        setPendingSide(null);
      } else if (err instanceof StaleBracketError) {
        onShowToast('error', 'Already updated, refresh');
        setPendingSide(null);
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Failed to save final result.'
        );
      }
    } finally {
      setSavingDecision(false);
    }
  }

  async function handleUndoFinal() {
    if (!canScore || undoing) return;
    setUndoing(true);
    try {
      await undoFinalMatch(finalKey);
      onShowToast('success', 'Final result undone.');
    } catch (err) {
      if (err instanceof StaleBracketError) {
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Could not undo final match.'
        );
      }
    } finally {
      setUndoing(false);
    }
  }

  const renderSummaryWinner = (
    slot: BracketSlotSnapshot,
    label: 'Main' | 'Backup'
  ) => (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-nested border border-edge">
      <div className="flex items-center gap-2 min-w-0">
        <span className="px-1.5 py-0.5 rounded bg-surface border border-edge text-[11px] font-medium text-fg-muted shrink-0">
          {label}
        </span>
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            slot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
          }`}
          aria-hidden="true"
        />
        <PlayerNameWithChurch
          name={slot.name}
          church={slot.playerId ? playerById.get(slot.playerId)?.church : undefined}
          className="text-sm font-medium text-fg break-words"
        />
      </div>
      <span
        className={`text-xs font-semibold shrink-0 ${
          slot.team === 'blue' ? 'text-blue-light' : 'text-red-light'
        }`}
      >
        {slot.team === 'blue' ? 'Blue' : 'Red'}
      </span>
    </div>
  );

  const pendingSlot =
    finalMatch && pendingSide
      ? pendingSide === 'a'
        ? finalMatch.a
        : finalMatch.b
      : null;

  const finalWinnerSlot =
    finalMatch && (finalMatch.winner === 'a' || finalMatch.winner === 'b')
      ? finalMatch.winner === 'a'
        ? finalMatch.a
        : finalMatch.b
      : null;

  return (
    <section className="bg-surface border border-edge rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy size={16} className="text-fg shrink-0" />
          <h3 className="text-sm font-semibold text-fg">
            Champion decision{divisionLabel ? ` · ${divisionLabel}` : ''}
          </h3>
        </div>
        {finalMatch && finalMatch.winner === null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-status-amber-bg text-status-amber-fg border border-status-amber-edge shrink-0">
            Final pending
          </span>
        )}
      </div>

      {/* Winners summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {renderSummaryWinner(mainWinner, 'Main')}
        {renderSummaryWinner(backupWinner, 'Backup')}
      </div>

      {/* Decision options */}
      {canScore ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busyMode}
            onClick={() => void handleSelectNoFinal()}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors duration-150 disabled:opacity-50 ${
              !hasFinal
                ? 'border-2 border-fg bg-nested text-fg'
                : 'border-edge bg-transparent text-fg-muted hover:text-fg hover:bg-nested'
            }`}
          >
            No final (main winner is champion)
          </button>
          <button
            type="button"
            disabled={busyMode}
            onClick={() => void handleSelectPlayFinal()}
            className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors duration-150 disabled:opacity-50 ${
              hasFinal
                ? 'border-2 border-fg bg-nested text-fg'
                : 'border-edge bg-transparent text-fg-muted hover:text-fg hover:bg-nested'
            }`}
          >
            Play a final: main winner vs backup winner
          </button>
        </div>
      ) : (
        <p className="text-xs text-fg-muted">
          {hasFinal
            ? 'Final scheduled: main winner vs backup winner.'
            : 'No final — main winner is champion.'}
        </p>
      )}

      {/* Final Match Card */}
      {finalMatch && (
        <div className="rounded-xl border border-edge bg-nested p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 min-h-[20px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-fg">
                Final: Main vs Backup
              </span>
              {finalMatch.sameTeam && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface border border-edge text-fg-muted">
                  Same-team
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {finalMatch.winner !== null && (
                <Lock size={13} className="text-fg-muted shrink-0" aria-label="Match decided" />
              )}
              {canScore && finalMatch.winner !== null && (
                <button
                  type="button"
                  disabled={undoing}
                  onClick={() => void handleUndoFinal()}
                  className="min-h-[28px] px-2 py-0.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface border border-transparent hover:border-edge inline-flex items-center gap-1 transition-colors duration-150 disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  <span>{undoing ? 'Undoing...' : 'Undo'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {(
              [
                { side: 'a' as const, label: 'Main', slot: finalMatch.a },
                { side: 'b' as const, label: 'Backup', slot: finalMatch.b },
              ] as const
            ).map(({ side, label, slot }) => {
              const isLocked = finalMatch.winner !== null;
              const isWinner = finalMatch.winner === side;
              const isLoser = isLocked && !isWinner;
              const interactive = canScore && !isLocked;
              const winnerRowStyle =
                slot.team === 'blue'
                  ? 'bg-blue-tint border-blue-edge'
                  : 'bg-red-tint border-red-edge';
              const winnerCheckStyle =
                slot.team === 'blue' ? 'bg-blue-team text-fg' : 'bg-red-team text-fg';

              const rowClasses = [
                'w-full min-h-[44px] px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-all duration-200',
                isWinner
                  ? winnerRowStyle
                  : isLoser
                    ? 'bg-surface border-edge opacity-50'
                    : interactive
                      ? 'bg-surface border-edge hover:bg-nested active:bg-nested cursor-pointer'
                      : 'bg-surface border-edge',
              ].join(' ');

              const inner = (
                <>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0 flex-1">
                    <span className="px-1.5 py-0.5 rounded bg-nested border border-edge text-[11px] font-medium text-fg-muted shrink-0">
                      {label}
                    </span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        slot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                      }`}
                      aria-hidden="true"
                    />
                    <PlayerNameWithChurch
                      name={slot.name}
                      church={
                        slot.playerId ? playerById.get(slot.playerId)?.church : undefined
                      }
                      className="text-sm font-medium text-fg break-words leading-snug"
                    />
                    {slot.dept && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
                        {slot.dept}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {game.usesSkillLevel && slot.level !== null && (
                      <span className="px-1.5 py-0.5 rounded-md bg-nested border border-edge text-xs font-medium text-fg tabular-nums">
                        L{slot.level}
                      </span>
                    )}
                    {isWinner && (
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${winnerCheckStyle}`}
                      >
                        <Check size={14} strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                </>
              );

              return interactive ? (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPendingSide(side)}
                  className={rowClasses}
                >
                  {inner}
                </button>
              ) : (
                <div key={side} className={rowClasses}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sport Champion Banner when Final is decided */}
      {finalWinnerSlot && (
        <div
          className={`rounded-xl border p-3.5 flex items-center gap-3 ${
            finalWinnerSlot.team === 'blue'
              ? 'bg-blue-tint border-blue-edge'
              : 'bg-red-tint border-red-edge'
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-fg ${
              finalWinnerSlot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
            }`}
          >
            <Trophy size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {divisionLabel ? `Sport Champion · ${divisionLabel}` : 'Sport Champion'}
            </p>
            <p className="text-sm font-semibold text-fg break-words">
              <PlayerNameWithChurch
                name={finalWinnerSlot.name}
                church={
                  finalWinnerSlot.playerId
                    ? playerById.get(finalWinnerSlot.playerId)?.church
                    : undefined
                }
              />
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  finalWinnerSlot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-xs font-semibold ${
                  finalWinnerSlot.team === 'blue' ? 'text-blue-light' : 'text-red-light'
                }`}
              >
                {finalWinnerSlot.team === 'blue' ? 'Blue Team' : 'Red Team'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Final Winner Modal */}
      {pendingSlot && pendingSide && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-final-winner-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="confirm-final-winner-title"
                  className="text-[16px] font-semibold text-fg break-words"
                >
                  {pendingSlot.name} wins?
                </h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      pendingSlot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs text-fg-muted">
                    {pendingSide === 'a' ? 'Main winner' : 'Backup winner'} ·{' '}
                    {pendingSlot.team === 'blue' ? 'Blue Team' : 'Red Team'}
                    {pendingSlot.dept ? ` · ${pendingSlot.dept}` : ''}
                    {game.usesSkillLevel && pendingSlot.level !== null
                      ? ` · L${pendingSlot.level}`
                      : ''}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={savingDecision}
                onClick={() => setPendingSide(null)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={savingDecision}
                onClick={() => setPendingSide(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingDecision}
                onClick={() => void handleConfirmWinner()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                {savingDecision ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
