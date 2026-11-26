import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Game, MassGameDoc, MassGameItem, Role, TeamId } from '../types/models';
import {
  addMassGameItem,
  deleteMassGameItem,
  renameMassGameItem,
  resetMassGameResults,
  toggleMassGameWinner,
} from '../services/db';
import { StaleBracketError, formatPoints } from '../utils/bracket';
import { SportIcon } from './SportIcons';
import { ConfirmDialog } from './TeamBadge';

interface MassGameViewProps {
  game: Game;
  massDoc: MassGameDoc | null;
  role: Role;
  backLabel?: string;
  onBack: () => void;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

function getErrorText(err: unknown, fallback: string): string {
  if (err instanceof StaleBracketError) return err.message;
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as { error?: unknown };
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error;
  } catch {
    // Plain message
  }
  return err.message || fallback;
}

export function MassGameView({
  game,
  massDoc,
  role,
  backLabel,
  onBack,
  onShowToast,
}: MassGameViewProps) {
  const canEdit = role === 'admin' || role === 'scorer';
  const items = massDoc?.items ?? [];

  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MassGameItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!pendingScrollId) return;
    if (!items.some((i) => i.id === pendingScrollId)) return;
    const el = cardRefs.current.get(pendingScrollId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setPendingScrollId(null);
  }, [items, pendingScrollId]);

  let blueWins = 0;
  let redWins = 0;
  let bluePoints = 0;
  let redPoints = 0;
  for (const item of items) {
    if (item.winner === 'blue') {
      blueWins += 1;
      bluePoints += item.points;
    } else if (item.winner === 'red') {
      redWins += 1;
      redPoints += item.points;
    }
  }
  const decidedCount = blueWins + redWins;

  async function handleToggleWinner(item: MassGameItem, team: TeamId) {
    if (!canEdit || busyItemId === item.id) return;
    setBusyItemId(item.id);
    try {
      await toggleMassGameWinner(game.id, item.id, team, item.winner);
    } catch (err) {
      onShowToast('error', getErrorText(err, 'Failed to update result.'));
    } finally {
      setBusyItemId((prev) => (prev === item.id ? null : prev));
    }
  }

  function startEditingName(item: MassGameItem) {
    if (!canEdit) return;
    setEditingItemId(item.id);
    setNameDraft(item.name);
  }

  function cancelEditingName() {
    setEditingItemId(null);
    setNameDraft('');
  }

  async function handleSaveName(item: MassGameItem) {
    if (!canEdit || savingName) return;
    const clean = nameDraft.trim().slice(0, 40);
    if (!clean) {
      onShowToast('error', 'Game name is required.');
      return;
    }
    if (clean === item.name) {
      cancelEditingName();
      return;
    }
    setSavingName(true);
    try {
      await renameMassGameItem(game.id, item.id, clean, item.name);
      cancelEditingName();
    } catch (err) {
      onShowToast('error', getErrorText(err, 'Failed to rename game.'));
    } finally {
      setSavingName(false);
    }
  }

  async function handleConfirmReset() {
    if (!canEdit || resetting) return;
    setResetting(true);
    try {
      await resetMassGameResults(game.id, massDoc?.updatedAt ?? 0);
      setResetOpen(false);
      onShowToast('success', 'All results cleared.');
    } catch (err) {
      onShowToast('error', getErrorText(err, 'Failed to clear results.'));
    } finally {
      setResetting(false);
    }
  }

  function handleRequestDelete(item: MassGameItem) {
    if (!canEdit) return;
    if (items.length <= 1) {
      onShowToast('error', 'A mass game needs at least 1 game');
      return;
    }
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!canEdit || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMassGameItem(game.id, deleteTarget.id);
      if (editingItemId === deleteTarget.id) cancelEditingName();
      setDeleteTarget(null);
    } catch (err) {
      onShowToast('error', getErrorText(err, 'Failed to delete game.'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddGame() {
    if (!canEdit || adding || items.length >= 20) return;
    setAdding(true);
    try {
      const created = await addMassGameItem(game.id);
      setEditingItemId(created.id);
      setNameDraft(created.name);
      setPendingScrollId(created.id);
    } catch (err) {
      onShowToast('error', getErrorText(err, 'Failed to add game.'));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface border border-edge rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
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
            <h2 className="text-[20px] font-semibold text-fg leading-snug break-words">
              {game.name}
            </h2>
          </div>

          {canEdit && (
            <button
              type="button"
              disabled={decidedCount === 0 || resetting}
              onClick={() => setResetOpen(true)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-45"
            >
              <RotateCcw size={15} />
              <span>Reset results</span>
            </button>
          )}
        </div>

        <p className="text-xs text-fg-muted">Mass game - everyone plays</p>

        {game.head && (
          <p className="text-xs font-medium text-[#4ADE80] leading-snug break-words">
            In-charge: {game.head}
          </p>
        )}
      </div>

      {/* Tally Card */}
      <div className="bg-surface border border-edge rounded-xl p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-blue-edge bg-blue-tint">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-blue-light">Blue</span>
            </div>
            <p className="text-xl font-bold text-fg tabular-nums">
              {blueWins}{' '}
              <span className="text-xs font-normal text-fg-muted">
                {blueWins === 1 ? 'win' : 'wins'}
              </span>
            </p>
            <p className="text-xs font-medium text-blue-light tabular-nums mt-0.5">
              {formatPoints(bluePoints)} {bluePoints === 1 ? 'pt' : 'pts'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-red-edge bg-red-tint">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-team shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-red-light">Red</span>
            </div>
            <p className="text-xl font-bold text-fg tabular-nums">
              {redWins}{' '}
              <span className="text-xs font-normal text-fg-muted">
                {redWins === 1 ? 'win' : 'wins'}
              </span>
            </p>
            <p className="text-xs font-medium text-red-light tabular-nums mt-0.5">
              {formatPoints(redPoints)} {redPoints === 1 ? 'pt' : 'pts'}
            </p>
          </div>
        </div>
      </div>

      {/* Inner Game Cards */}
      {items.length === 0 ? (
        <div className="bg-surface border border-edge rounded-xl p-6 text-center text-sm text-fg-muted">
          No games configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isEditingName = editingItemId === item.id;
            const isBusy = busyItemId === item.id;
            const blueWon = item.winner === 'blue';
            const redWon = item.winner === 'red';
            const hasWinner = item.winner !== null;
            const ptsText = `${formatPoints(item.points)} ${item.points === 1 ? 'pt' : 'pts'}`;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(item.id, el);
                  else cardRefs.current.delete(item.id);
                }}
                className="bg-surface border border-edge rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {isEditingName ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleSaveName(item);
                      }}
                      className="flex items-center gap-1.5 flex-1 min-w-0"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={nameDraft}
                        maxLength={40}
                        disabled={savingName}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditingName();
                          }
                        }}
                        aria-label="Edit game name"
                        className="flex-1 min-w-0 min-h-[38px] px-2.5 py-1 rounded-lg border border-edge bg-nested text-sm font-semibold text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                      />
                      <button
                        type="submit"
                        disabled={savingName}
                        aria-label="Save name"
                        className="min-w-[38px] min-h-[38px] rounded-lg bg-primary text-primary-fg inline-flex items-center justify-center hover:bg-primary-hover disabled:opacity-50"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={savingName}
                        onClick={cancelEditingName}
                        aria-label="Cancel rename"
                        className="min-w-[38px] min-h-[38px] rounded-lg border border-edge text-fg-muted hover:text-fg hover:bg-nested inline-flex items-center justify-center disabled:opacity-50"
                      >
                        <X size={16} />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <h3 className="text-[15px] font-semibold text-fg leading-snug break-words">
                        {item.name}
                      </h3>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEditingName(item)}
                          aria-label={`Rename ${item.name}`}
                          className="w-8 h-8 rounded-lg text-fg-muted hover:text-fg hover:bg-nested inline-flex items-center justify-center shrink-0 transition-colors duration-150"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasWinner && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
                          blueWon
                            ? 'bg-blue-tint border-blue-edge text-blue-light'
                            : 'bg-red-tint border-red-edge text-red-light'
                        }`}
                      >
                        Winner
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-nested border border-edge text-xs font-medium text-fg-muted tabular-nums">
                      {ptsText}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRequestDelete(item)}
                        aria-label={`Delete ${item.name}`}
                        className="min-w-[44px] min-h-[44px] -my-2 -mr-2 rounded-xl text-fg-muted hover:text-status-red-fg hover:bg-nested inline-flex items-center justify-center transition-colors duration-150"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Blue & Red Winner Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={blueWon}
                        onClick={() => void handleToggleWinner(item, 'blue')}
                        className={`min-h-[52px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 disabled:opacity-60 ${
                          blueWon
                            ? 'bg-blue-team/25 border-blue-team text-blue-light'
                            : redWon
                              ? 'bg-nested border-edge text-blue-light opacity-45 hover:opacity-75'
                              : 'bg-nested border-edge text-blue-light hover:bg-blue-tint hover:border-blue-edge'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
                        <span>Blue</span>
                        {blueWon && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-team text-fg ml-0.5">
                            <Check size={13} strokeWidth={2.5} />
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        aria-pressed={redWon}
                        onClick={() => void handleToggleWinner(item, 'red')}
                        className={`min-h-[52px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold transition-all duration-150 disabled:opacity-60 ${
                          redWon
                            ? 'bg-red-team/25 border-red-team text-red-light'
                            : blueWon
                              ? 'bg-nested border-edge text-red-light opacity-45 hover:opacity-75'
                              : 'bg-nested border-edge text-red-light hover:bg-red-tint hover:border-red-edge'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-red-team shrink-0" aria-hidden="true" />
                        <span>Red</span>
                        {redWon && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-team text-fg ml-0.5">
                            <Check size={13} strokeWidth={2.5} />
                          </span>
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className={`min-h-[52px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold ${
                          blueWon
                            ? 'bg-blue-team/25 border-blue-team text-blue-light'
                            : redWon
                              ? 'bg-nested border-edge text-blue-light opacity-45'
                              : 'bg-nested border-edge text-blue-light'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
                        <span>Blue</span>
                        {blueWon && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-team text-fg ml-0.5">
                            <Check size={13} strokeWidth={2.5} />
                          </span>
                        )}
                      </div>

                      <div
                        className={`min-h-[52px] px-4 py-2.5 rounded-xl border flex items-center justify-center gap-2 text-sm font-semibold ${
                          redWon
                            ? 'bg-red-team/25 border-red-team text-red-light'
                            : blueWon
                              ? 'bg-nested border-edge text-red-light opacity-45'
                              : 'bg-nested border-edge text-red-light'
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-red-team shrink-0" aria-hidden="true" />
                        <span>Red</span>
                        {redWon && (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-team text-fg ml-0.5">
                            <Check size={13} strokeWidth={2.5} />
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={adding || items.length >= 20}
            onClick={() => void handleAddGame()}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested inline-flex items-center justify-center gap-1.5 transition-colors duration-150 disabled:opacity-45"
          >
            <Plus size={16} />
            <span>{adding ? 'Adding game...' : 'Add game'}</span>
          </button>
          {items.length >= 20 && (
            <p className="text-xs text-fg-muted text-center">Maximum 20 games</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={resetOpen}
        title={`Clear all ${decidedCount} ${decidedCount === 1 ? 'result' : 'results'}?`}
        description="Every inner game winner in this mass game will be cleared."
        confirmLabel="Clear results"
        onConfirm={() => void handleConfirmReset()}
        onCancel={() => setResetOpen(false)}
        busy={resetting}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? 'game'}?`}
        description={
          deleteTarget?.winner ? 'Its result and points will be removed.' : ''
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
        busy={deleting}
      />
    </div>
  );
}
