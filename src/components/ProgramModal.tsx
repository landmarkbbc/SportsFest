import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Edit3, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_PROGRAM, EventProgram, ProgramRow, Role } from '../types/models';
import { createId } from '../services/db';

interface ProgramModalProps {
  open: boolean;
  program: EventProgram | null;
  role: Role;
  onSave: (program: EventProgram) => Promise<void>;
  onClose: () => void;
}

function getManilaNowSeconds(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const getNum = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = getNum('hour') % 24;
  const minute = getNum('minute');
  const second = getNum('second');
  return hour * 3600 + minute * 60 + second;
}

function parseTimeToSeconds(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 3600 + m * 60;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDuration(diffSeconds: number): string {
  const safe = Math.max(0, diffSeconds);
  if (safe < 60) return 'less than 1 min';
  const totalMins = Math.floor(safe / 60);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0 && mins > 0) return `${hours} hr ${mins} min`;
  if (hours > 0) return `${hours} hr`;
  return `${mins} min`;
}

function formatTimeLeft(diffSeconds: number): string {
  if (diffSeconds < 60) return 'Less than 1 min left';
  return `${formatDuration(diffSeconds)} left`;
}

export function ProgramModal({
  open,
  program,
  role,
  onSave,
  onClose,
}: ProgramModalProps) {
  const isAdmin = role === 'admin';
  const sourceProgram = program ?? DEFAULT_PROGRAM;

  const [liveSeconds, setLiveSeconds] = useState<number>(() => getManilaNowSeconds());
  const [previewTime, setPreviewTime] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draftRows, setDraftRows] = useState<ProgramRow[]>([]);
  const [draftEndTime, setDraftEndTime] = useState('16:00');
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeRowRef = useRef<HTMLTableRowElement | null>(null);
  const scrolledOnOpenRef = useRef(false);

  // Reset local preview & edit state whenever popup opens/closes
  useEffect(() => {
    if (!open) {
      setPreviewTime('');
      setEditing(false);
      setEditError(null);
      scrolledOnOpenRef.current = false;
      return;
    }
    setLiveSeconds(getManilaNowSeconds());
    const id = window.setInterval(() => {
      setLiveSeconds(getManilaNowSeconds());
    }, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const sortedRows = useMemo(
    () =>
      sourceProgram.rows
        .slice()
        .sort((a, b) => a.start.localeCompare(b.start)),
    [sourceProgram.rows]
  );

  const activePreviewTime = isAdmin && /^\d{2}:\d{2}$/.test(previewTime) ? previewTime : '';
  const nowSeconds = activePreviewTime
    ? parseTimeToSeconds(activePreviewTime)
    : liveSeconds;

  const scheduleState = useMemo(() => {
    if (sortedRows.length === 0) {
      return {
        phase: 'after' as const,
        currentIndex: -1,
        remainingSeconds: 0,
        startsInSeconds: 0,
      };
    }

    const firstStartSec = parseTimeToSeconds(sortedRows[0].start);
    const endSec = parseTimeToSeconds(sourceProgram.endTime);

    if (nowSeconds < firstStartSec) {
      return {
        phase: 'before' as const,
        currentIndex: -1,
        remainingSeconds: 0,
        startsInSeconds: firstStartSec - nowSeconds,
      };
    }

    if (nowSeconds >= endSec) {
      return {
        phase: 'after' as const,
        currentIndex: -1,
        remainingSeconds: 0,
        startsInSeconds: 0,
      };
    }

    let currentIndex = -1;
    let currentEndSec = endSec;
    for (let i = 0; i < sortedRows.length; i++) {
      const startSec = parseTimeToSeconds(sortedRows[i].start);
      const nextSec =
        i + 1 < sortedRows.length ? parseTimeToSeconds(sortedRows[i + 1].start) : endSec;
      if (startSec <= nowSeconds && nowSeconds < nextSec) {
        currentIndex = i;
        currentEndSec = nextSec;
      }
    }

    return {
      phase: 'during' as const,
      currentIndex,
      remainingSeconds: Math.max(0, currentEndSec - nowSeconds),
      startsInSeconds: 0,
    };
  }, [sortedRows, sourceProgram.endTime, nowSeconds]);

  // Auto-scroll highlighted row into view once when opened
  useEffect(() => {
    if (!open || editing || scrolledOnOpenRef.current) return;
    if (scheduleState.currentIndex === -1) return;

    const raf = window.requestAnimationFrame(() => {
      if (activeRowRef.current) {
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        activeRowRef.current.scrollIntoView({
          block: 'center',
          behavior: prefersReduced ? 'auto' : 'smooth',
        });
        scrolledOnOpenRef.current = true;
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, editing, scheduleState.currentIndex]);

  if (!open) return null;

  function startEditing() {
    setDraftRows(sortedRows.map((r) => ({ ...r })));
    setDraftEndTime(sourceProgram.endTime);
    setEditError(null);
    setEditing(true);
  }

  function handleAddRow() {
    const lastStart =
      draftRows.length > 0 ? draftRows[draftRows.length - 1].start : '08:00';
    setDraftRows((prev) => [
      ...prev,
      { id: createId('prog'), start: lastStart, activity: '' },
    ]);
  }

  function handleRowChange(id: string, field: 'start' | 'activity', value: string) {
    setDraftRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  }

  function handleDeleteRow(id: string) {
    setDraftRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditError(null);

    if (draftRows.length === 0) {
      setEditError('Add at least one program row.');
      return;
    }

    const seenStarts = new Set<string>();
    for (const row of draftRows) {
      const start = row.start.trim();
      const activity = row.activity.trim();
      if (!/^\d{2}:\d{2}$/.test(start)) {
        setEditError('Every row needs a valid start time.');
        return;
      }
      if (!activity) {
        setEditError('Every row needs an activity.');
        return;
      }
      if (seenStarts.has(start)) {
        setEditError(`Duplicate start time: ${formatTime12h(start)}.`);
        return;
      }
      seenStarts.add(start);
    }

    if (!/^\d{2}:\d{2}$/.test(draftEndTime.trim())) {
      setEditError('Please choose a valid end time.');
      return;
    }

    const sorted = draftRows
      .map((r) => ({
        id: r.id,
        start: r.start.trim(),
        activity: r.activity.trim(),
      }))
      .sort((a, b) => a.start.localeCompare(b.start));

    setSaving(true);
    try {
      await onSave({
        rows: sorted,
        endTime: draftEndTime.trim(),
      });
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save program.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="program-modal-title"
    >
      <div className="bg-surface w-full sm:max-w-xl max-h-[85vh] rounded-t-2xl sm:rounded-xl border border-edge shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-edge shrink-0 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Clock size={18} className="text-fg shrink-0" />
              <h2 id="program-modal-title" className="text-[16px] font-semibold text-fg truncate">
                Program
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdmin && !editing && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150"
                >
                  <Edit3 size={14} />
                  <span>Edit</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close program"
                className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {isAdmin && !editing && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <label className="inline-flex items-center gap-2 text-xs text-fg-muted">
                <span>Preview time</span>
                <input
                  type="time"
                  value={previewTime}
                  onChange={(e) => setPreviewTime(e.target.value)}
                  aria-label="Preview time"
                  className="min-h-[34px] px-2 py-1 rounded-lg border border-edge bg-nested text-xs text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                />
              </label>
              {activePreviewTime && (
                <button
                  type="button"
                  onClick={() => setPreviewTime('')}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested transition-colors duration-150"
                >
                  Live
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {editing ? (
          <form onSubmit={handleSaveEdit} className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {editError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-status-red-fg bg-status-red-bg border border-status-red-edge rounded-lg px-3 py-2"
                >
                  {editError}
                </p>
              )}

              <div className="space-y-2">
                {draftRows.map((row) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={row.start}
                      onChange={(e) => handleRowChange(row.id, 'start', e.target.value)}
                      aria-label="Start time"
                      className="w-[110px] shrink-0 min-h-[44px] px-2 py-1.5 rounded-xl border border-edge bg-nested text-xs sm:text-sm text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                    />
                    <input
                      type="text"
                      value={row.activity}
                      maxLength={140}
                      onChange={(e) => handleRowChange(row.id, 'activity', e.target.value)}
                      placeholder="Activity"
                      aria-label="Activity"
                      className="flex-1 min-w-0 min-h-[44px] px-3 py-1.5 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.id)}
                      aria-label="Delete row"
                      className="min-w-[44px] min-h-[44px] shrink-0 flex items-center justify-center rounded-xl text-fg-muted hover:text-red-light hover:bg-nested transition-colors duration-150"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-edge">
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested inline-flex items-center gap-1.5 transition-colors duration-150"
                >
                  <Plus size={16} />
                  <span>Add row</span>
                </button>

                <label className="inline-flex items-center gap-2 text-xs font-medium text-fg-muted">
                  <span>Ends at</span>
                  <input
                    type="time"
                    value={draftEndTime}
                    onChange={(e) => setDraftEndTime(e.target.value)}
                    aria-label="Ends at"
                    className="min-h-[44px] px-2.5 py-1.5 rounded-xl border border-edge bg-nested text-sm text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                  />
                </label>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-edge bg-surface flex items-center justify-end gap-2 shrink-0 pb-safe">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setEditError(null);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Status & Preview Banners */}
            {(activePreviewTime ||
              scheduleState.phase === 'before' ||
              scheduleState.phase === 'after') && (
              <div className="px-4 pt-3 space-y-2 shrink-0">
                {activePreviewTime && (
                  <div className="px-3 py-2 rounded-lg border border-status-amber-edge bg-status-amber-bg text-xs font-medium text-status-amber-fg">
                    Previewing {formatTime12h(activePreviewTime)}
                  </div>
                )}
                {scheduleState.phase === 'before' && sortedRows.length > 0 && (
                  <div className="px-3 py-2 rounded-lg border border-edge bg-nested text-xs font-medium text-fg">
                    Starts at {formatTime12h(sortedRows[0].start)} - in{' '}
                    {formatDuration(scheduleState.startsInSeconds)}
                  </div>
                )}
                {scheduleState.phase === 'after' && (
                  <div className="px-3 py-2 rounded-lg border border-edge bg-nested text-xs font-medium text-fg-muted">
                    Program finished
                  </div>
                )}
              </div>
            )}

            {/* Scrollable Schedule Table */}
            <div className="flex-1 overflow-y-auto mt-2">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface border-y border-edge">
                  <tr>
                    <th className="py-2.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-wide text-fg-muted w-[104px]">
                      Time
                    </th>
                    <th className="py-2.5 pl-2 pr-4 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                      Activity
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {sortedRows.map((row, idx) => {
                    const isCurrent =
                      scheduleState.phase === 'during' &&
                      scheduleState.currentIndex === idx;
                    const isPast =
                      scheduleState.phase === 'after' ||
                      (scheduleState.phase === 'during' &&
                        scheduleState.currentIndex !== -1 &&
                        idx < scheduleState.currentIndex);

                    return (
                      <tr
                        key={row.id}
                        ref={isCurrent ? activeRowRef : undefined}
                        className={
                          isCurrent
                            ? 'bg-nested border-l-[3px] border-l-fg'
                            : isPast
                              ? 'opacity-50'
                              : ''
                        }
                      >
                        <td
                          className={`py-3 pl-4 pr-3 align-top text-xs sm:text-sm tabular-nums whitespace-nowrap ${
                            isCurrent ? 'font-bold text-fg' : 'font-medium text-fg-muted'
                          }`}
                        >
                          {formatTime12h(row.start)}
                        </td>
                        <td className="py-3 pl-2 pr-4 align-top">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`text-sm leading-snug break-words ${
                                isCurrent ? 'font-bold text-fg' : 'text-fg'
                              }`}
                            >
                              {row.activity}
                            </span>
                            {isCurrent && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary text-primary-fg shrink-0">
                                Now
                              </span>
                            )}
                          </div>
                          {isCurrent && (
                            <p className="text-xs text-fg-muted tabular-nums mt-1">
                              {formatTimeLeft(scheduleState.remainingSeconds)}
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
