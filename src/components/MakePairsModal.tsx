import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { Game, Player, TeamId } from '../types/models';
import { saveGamePairs } from '../services/db';
import {
  EditablePairsDraft,
  PairSwapLocation,
  buildInitialGamePairs,
  getPairSpread,
  swapPairDraftPlayers,
  toFirestoreGamePairs,
} from '../utils/pairs';

interface MakePairsModalProps {
  open: boolean;
  game: Game;
  players: Player[];
  onClose: () => void;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

function isSameLocation(a: PairSwapLocation | null, b: PairSwapLocation): boolean {
  if (!a || a.team !== b.team || a.kind !== b.kind) return false;
  if (a.kind === 'pair' && b.kind === 'pair') {
    return a.pairId === b.pairId && a.memberIndex === b.memberIndex;
  }
  if (a.kind === 'unpaired' && b.kind === 'unpaired') {
    return a.playerId === b.playerId;
  }
  return false;
}

function isBlockedTarget(selected: PairSwapLocation | null, target: PairSwapLocation): boolean {
  if (!selected) return false;
  if (selected.team !== target.team) return true;
  if (selected.kind === 'pair' && target.kind === 'pair' && selected.pairId === target.pairId) {
    return selected.memberIndex !== target.memberIndex;
  }
  if (selected.kind === 'unpaired' && target.kind === 'unpaired') {
    return selected.playerId !== target.playerId;
  }
  return false;
}

export function MakePairsModal({
  open,
  game,
  players,
  onClose,
  onShowToast,
}: MakePairsModalProps) {
  const [draft, setDraft] = useState<EditablePairsDraft>({ pairs: [], unpaired: [] });
  const [selected, setSelected] = useState<PairSwapLocation | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(buildInitialGamePairs(game, players));
    setSelected(null);
    setSaving(false);
    // Re-seed draft when sheet opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, game.id]);

  if (!open) return null;

  const bluePairs = draft.pairs.filter((p) => p.team === 'blue');
  const redPairs = draft.pairs.filter((p) => p.team === 'red');
  const blueUnpaired = draft.unpaired.filter((u) => u.team === 'blue');
  const redUnpaired = draft.unpaired.filter((u) => u.team === 'red');

  const canConfirm = bluePairs.length >= 1 && redPairs.length >= 1;

  function handlePlayerTap(location: PairSwapLocation) {
    if (saving) return;
    if (!selected) {
      setSelected(location);
      return;
    }
    if (isSameLocation(selected, location)) {
      setSelected(null);
      return;
    }
    if (isBlockedTarget(selected, location)) {
      return;
    }
    setDraft((prev) => swapPairDraftPlayers(prev, selected, location));
    setSelected(null);
  }

  async function handleConfirm() {
    if (!canConfirm || saving) return;
    setSaving(true);
    try {
      await saveGamePairs(game.id, toFirestoreGamePairs(draft));
      onShowToast('success', `Pairs saved for ${game.name}.`);
      onClose();
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save pairs.'
      );
    } finally {
      setSaving(false);
    }
  }

  function renderTeamSection(team: TeamId) {
    const isBlue = team === 'blue';
    const teamPairs = isBlue ? bluePairs : redPairs;
    const teamUnpaired = isBlue ? blueUnpaired : redUnpaired;
    const spread = getPairSpread(teamPairs);

    return (
      <section className="space-y-3">
        <div
          className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 ${
            isBlue
              ? 'bg-blue-tint border-blue-edge'
              : 'bg-red-tint border-red-edge'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isBlue ? 'bg-blue-team' : 'bg-red-team'
              }`}
              aria-hidden="true"
            />
            <h3
              className={`text-sm font-semibold ${
                isBlue ? 'text-blue-light' : 'text-red-light'
              }`}
            >
              {isBlue ? 'Blue Team' : 'Red Team'}
            </h3>
          </div>
          <span className="text-xs font-medium text-fg tabular-nums">
            {teamPairs.length} {teamPairs.length === 1 ? 'pair' : 'pairs'}
          </span>
        </div>

        {teamPairs.length === 0 ? (
          <div className="bg-surface border border-edge rounded-xl p-4 text-xs text-fg-muted">
            Need at least 2 assigned {isBlue ? 'Blue' : 'Red'} players to form a pair.
          </div>
        ) : (
          <div className="space-y-2.5">
            {teamPairs.map((pair, idx) => (
              <div
                key={pair.id}
                className="bg-surface border border-edge rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-fg-muted tabular-nums">
                    Pair {idx + 1}
                  </span>
                  <span
                    title={`Combined level ${pair.combined}`}
                    className="px-2 py-0.5 rounded-md bg-nested border border-edge text-xs font-semibold text-fg tabular-nums"
                  >
                    L{pair.combined}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {pair.members.map((member, memberIdx) => {
                    const loc: PairSwapLocation = {
                      kind: 'pair',
                      team,
                      pairId: pair.id,
                      memberIndex: memberIdx as 0 | 1,
                    };
                    const active = isSameLocation(selected, loc);
                    const blocked = isBlockedTarget(selected, loc);

                    return (
                      <button
                        key={member.playerId}
                        type="button"
                        disabled={blocked || saving}
                        onClick={() => handlePlayerTap(loc)}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors duration-150 ${
                          active
                            ? 'border-2 border-fg bg-nested'
                            : blocked
                              ? 'border-edge bg-nested/60 opacity-45 cursor-not-allowed'
                              : 'border-edge bg-nested hover:border-edge-hover cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
                          <span className="text-sm font-medium text-fg break-words leading-snug">
                            {member.name}
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface border border-edge text-fg-muted shrink-0">
                            {member.dept}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 rounded bg-surface border border-edge text-xs font-medium text-fg tabular-nums">
                            L{member.level}
                          </span>
                          {active && (
                            <span className="text-[11px] font-semibold text-fg">
                              Tap again to cancel
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {teamUnpaired.length > 0 && (
          <div className="bg-surface border border-dashed border-edge rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg-muted">No partner</span>
              <span className="text-[11px] text-fg-muted">Excluded from bracket</span>
            </div>
            <div className="space-y-1.5">
              {teamUnpaired.map((u) => {
                const loc: PairSwapLocation = {
                  kind: 'unpaired',
                  team,
                  playerId: u.playerId,
                };
                const active = isSameLocation(selected, loc);
                const blocked = isBlockedTarget(selected, loc);

                return (
                  <button
                    key={u.playerId}
                    type="button"
                    disabled={blocked || saving}
                    onClick={() => handlePlayerTap(loc)}
                    className={`w-full min-h-[44px] px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-colors duration-150 ${
                      active
                        ? 'border-2 border-fg bg-nested'
                        : blocked
                          ? 'border-edge bg-nested/60 opacity-45 cursor-not-allowed'
                          : 'border-edge bg-nested hover:border-edge-hover cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1">
                      <span className="text-sm font-medium text-fg break-words leading-snug">
                        {u.name}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface border border-edge text-fg-muted shrink-0">
                        {u.dept}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 rounded bg-surface border border-edge text-xs font-medium text-fg tabular-nums">
                        L{u.level}
                      </span>
                      {active && (
                        <span className="text-[11px] font-semibold text-fg">
                          Tap again to cancel
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {spread && (
          <p className="text-xs font-medium text-fg-muted tabular-nums px-0.5">
            Pair spread: lowest {spread.min} - highest {spread.max}
          </p>
        )}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-page flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="make-pairs-title"
    >
      {/* Top Header */}
      <header className="bg-surface border-b border-edge px-4 lg:px-8 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h2
            id="make-pairs-title"
            className="text-[16px] font-semibold text-fg truncate"
          >
            Make pairs · {game.name}
          </h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Tap a player, then tap another player on the same team to swap partners.
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          aria-label="Close"
          className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
        >
          <X size={20} />
        </button>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {!game.usesSkillLevel && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-edge bg-surface text-xs text-fg-muted">
              <Info size={16} className="shrink-0 mt-0.5 text-fg-muted" />
              <p>Pairs are random because skill levels are off</p>
            </div>
          )}

          {selected && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-fg bg-surface text-xs text-fg">
              <span>
                Select another {selected.team === 'blue' ? 'Blue' : 'Red'} player to swap
                with, or tap the selected player again to cancel.
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-2 py-1 rounded-lg border border-edge hover:bg-nested text-xs font-medium shrink-0"
              >
                Cancel swap
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {renderTeamSection('blue')}
            {renderTeamSection('red')}
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <footer className="bg-surface border-t border-edge px-4 lg:px-8 py-3 pb-safe shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {!canConfirm && (
            <p className="text-xs font-medium text-red-light text-center sm:text-left">
              Both Blue and Red must have at least 1 pair before confirming.
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="flex-1 sm:flex-none sm:min-w-[120px] min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canConfirm || saving}
              onClick={() => void handleConfirm()}
              className="flex-1 sm:flex-none sm:min-w-[140px] min-h-[44px] px-5 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Confirm pairs'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
