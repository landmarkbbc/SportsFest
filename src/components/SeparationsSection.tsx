import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Plus, Trash2, UserX } from 'lucide-react';
import { Player, SeparationPair } from '../types/models';
import { createId } from '../services/db';
import { hasSeparationOddCycle } from '../utils/balance';

interface SearchablePlayerSelectProps {
  id: string;
  label: string;
  value: string;
  excludeId: string;
  players: Player[];
  disabled: boolean;
  onChange: (playerId: string) => void;
}

function SearchablePlayerSelect({
  id,
  label,
  value,
  excludeId,
  players,
  disabled,
  onChange,
}: SearchablePlayerSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selected = useMemo(
    () => players.find((p) => p.id === value) ?? null,
    [players, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (p.id === excludeId) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q)
      );
    });
  }, [players, excludeId, query]);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <label htmlFor={id} className="block text-[11px] font-medium text-fg-muted mb-1">
        {label}
      </label>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen((v) => !v);
        }}
        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl border border-edge bg-surface text-left text-xs flex items-center justify-between gap-1.5 hover:border-edge-hover transition-colors duration-150 disabled:opacity-60"
      >
        <span className={`truncate ${selected ? 'text-fg font-medium' : 'text-fg-muted'}`}>
          {selected ? `${selected.name} · ${selected.department}` : 'Select player...'}
        </span>
        <ChevronDown size={14} className="text-fg-muted shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 mt-1 z-30 bg-surface border border-edge rounded-xl shadow-xl p-1.5 space-y-1">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter..."
            aria-label={`Filter ${label}`}
            className="w-full min-h-[34px] px-2.5 py-1 rounded-lg border border-edge bg-nested text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
          />
          <div className="max-h-44 overflow-y-auto divide-y divide-edge/40">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-fg-muted">No matching players</p>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 text-left text-xs rounded-lg flex items-center justify-between gap-2 transition-colors duration-150 ${
                      isSelected
                        ? 'bg-nested text-fg font-semibold'
                        : 'text-fg hover:bg-nested'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[11px] text-fg-muted shrink-0">{p.department}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SeparationsSectionProps {
  isAdmin: boolean;
  players: Player[];
  pairs: SeparationPair[];
  onSaveSeparations: (pairs: SeparationPair[]) => Promise<void>;
}

export function SeparationsSection({
  isAdmin,
  players,
  pairs,
  onSaveSeparations,
}: SeparationsSectionProps) {
  const [open, setOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<SeparationPair[]>([]);
  const [pendingById, setPendingById] = useState<
    Record<string, { aId: string; bId: string; error?: string }>
  >({});
  const [saving, setSaving] = useState(false);

  const sortedPlayers = useMemo(
    () => players.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const oddCycle = useMemo(
    () => hasSeparationOddCycle(pairs, players),
    [pairs, players]
  );

  const allRows = useMemo(() => {
    const savedIds = new Set(pairs.map((p) => p.id));
    const filteredDrafts = draftRows.filter((d) => !savedIds.has(d.id));
    return [
      ...pairs.map((p) => ({ ...p, isDraft: false })),
      ...filteredDrafts.map((d) => ({ ...d, isDraft: true })),
    ];
  }, [pairs, draftRows]);

  async function handleSelectChange(
    rowId: string,
    isDraft: boolean,
    field: 'aId' | 'bId',
    nextPlayerId: string
  ) {
    const base =
      pendingById[rowId] ??
      allRows.find((r) => r.id === rowId) ?? { aId: '', bId: '' };
    const nextA = field === 'aId' ? nextPlayerId : base.aId;
    const nextB = field === 'bId' ? nextPlayerId : base.bId;

    if (isDraft) {
      setDraftRows((prev) =>
        prev.map((d) => (d.id === rowId ? { ...d, aId: nextA, bId: nextB } : d))
      );
    }

    if (!nextA || !nextB) {
      setPendingById((prev) => ({
        ...prev,
        [rowId]: { aId: nextA, bId: nextB },
      }));
      return;
    }

    const isDuplicate = pairs.some(
      (p) =>
        p.id !== rowId &&
        ((p.aId === nextA && p.bId === nextB) || (p.aId === nextB && p.bId === nextA))
    );

    if (isDuplicate) {
      setPendingById((prev) => ({
        ...prev,
        [rowId]: {
          aId: nextA,
          bId: nextB,
          error: 'This pair is already in the Keep apart list.',
        },
      }));
      return;
    }

    setPendingById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });

    const nextPairs = pairs.some((p) => p.id === rowId)
      ? pairs.map((p) => (p.id === rowId ? { id: rowId, aId: nextA, bId: nextB } : p))
      : [...pairs, { id: rowId, aId: nextA, bId: nextB }];

    setSaving(true);
    try {
      await onSaveSeparations(nextPairs);
      if (isDraft) {
        setDraftRows((prev) => prev.filter((d) => d.id !== rowId));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRow(rowId: string, isDraft: boolean) {
    setPendingById((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
    if (isDraft) {
      setDraftRows((prev) => prev.filter((d) => d.id !== rowId));
      return;
    }
    setSaving(true);
    try {
      await onSaveSeparations(pairs.filter((p) => p.id !== rowId));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="lg:col-span-2 bg-surface border border-edge rounded-xl px-4 sm:px-5 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <UserX size={20} className="text-fg shrink-0" />
          <span className="text-[16px] font-semibold text-fg">Keep apart</span>
          {pairs.length > 0 && (
            <span className="text-xs text-fg-muted tabular-nums">({pairs.length})</span>
          )}
        </div>
        <ChevronDown
          size={18}
          className={`text-fg-muted shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="pt-3 pb-2.5 border-t border-edge mt-2 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-fg-muted">
              {isAdmin
                ? 'Keep selected pairs on opposite teams during team assignment and re-balance.'
                : 'Admin only. Scorer and Viewer cannot edit.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setDraftRows((prev) => [
                    ...prev,
                    { id: createId('sep'), aId: '', bId: '' },
                  ])
                }
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-primary text-primary-fg text-xs font-medium hover:bg-primary-hover inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Plus size={16} />
                <span>Add row</span>
              </button>
            )}
          </div>

          {oddCycle && (
            <div
              role="status"
              className="flex items-start gap-2 p-2.5 rounded-xl border border-status-amber-edge bg-status-amber-bg text-status-amber-fg text-xs font-medium leading-snug"
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>These rules cannot all be satisfied with two teams.</span>
            </div>
          )}

          {allRows.length === 0 ? (
            <p className="text-xs text-fg-muted py-2">No keep-apart rules added yet.</p>
          ) : (
            <div className="space-y-2.5">
              {allRows.map((row) => {
                const pending = pendingById[row.id];
                const aId = pending ? pending.aId : row.aId;
                const bId = pending ? pending.bId : row.bId;
                const playerA = aId ? playerById.get(aId) : undefined;
                const playerB = bId ? playerById.get(bId) : undefined;
                const hasRemovedPlayer =
                  !row.isDraft &&
                  !pending &&
                  (Boolean(row.aId && !playerA) || Boolean(row.bId && !playerB));

                if (hasRemovedPlayer) {
                  return (
                    <div
                      key={row.id}
                      className="p-3 rounded-xl border border-edge bg-nested/60 opacity-75 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-fg-muted">Player removed</p>
                        <p className="text-[11px] text-fg-muted truncate">
                          {(playerA?.name ?? 'Removed player')} · {(playerB?.name ?? 'Removed player')}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDeleteRow(row.id, false)}
                          aria-label="Delete rule"
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-surface shrink-0 disabled:opacity-50"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  );
                }

                const bothAssignedSame =
                  playerA &&
                  playerB &&
                  playerA.team !== null &&
                  playerA.team === playerB.team;

                return (
                  <div
                    key={row.id}
                    className="p-3 rounded-xl border border-edge bg-nested space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                      <div className="grid grid-cols-2 gap-2 flex-1 min-w-0">
                        <SearchablePlayerSelect
                          id={`sep-a-${row.id}`}
                          label="Person A"
                          value={aId}
                          excludeId={bId}
                          players={sortedPlayers}
                          disabled={!isAdmin || saving}
                          onChange={(pid) =>
                            void handleSelectChange(row.id, row.isDraft, 'aId', pid)
                          }
                        />
                        <SearchablePlayerSelect
                          id={`sep-b-${row.id}`}
                          label="Person B"
                          value={bId}
                          excludeId={aId}
                          players={sortedPlayers}
                          disabled={!isAdmin || saving}
                          onChange={(pid) =>
                            void handleSelectChange(row.id, row.isDraft, 'bId', pid)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        {playerA && playerB && (
                          bothAssignedSame ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold bg-status-red-bg border border-status-red-edge text-status-red-fg whitespace-nowrap">
                              {playerA.team === 'blue' ? 'Both on Blue' : 'Both on Red'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-surface border border-edge text-fg-muted whitespace-nowrap">
                              Apart
                            </span>
                          )
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteRow(row.id, row.isDraft)}
                            aria-label="Delete rule"
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-surface disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {pending?.error && (
                      <p className="text-xs font-medium text-status-amber-fg">
                        {pending.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
