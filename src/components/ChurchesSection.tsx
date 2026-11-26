import { useMemo, useState } from 'react';
import { Check, ChevronDown, Church, Edit3, Trash2, X } from 'lucide-react';
import { Player } from '../types/models';
import { ConfirmDialog } from './TeamBadge';

interface ChurchesSectionProps {
  isAdmin: boolean;
  churches: string[];
  players: Player[];
  onRenameChurch: (oldName: string, newName: string) => Promise<void>;
  onDeleteChurch: (name: string) => Promise<void>;
}

export function ChurchesSection({
  isAdmin,
  churches,
  players,
  onRenameChurch,
  onDeleteChurch,
}: ChurchesSectionProps) {
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const countByChurch = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) {
      const key = (p.church ?? '').trim();
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [players]);

  function startRename(name: string) {
    setEditingName(name);
    setDraftName(name);
    setRenameError('');
  }

  function cancelRename() {
    setEditingName(null);
    setDraftName('');
    setRenameError('');
  }

  async function saveRename(oldName: string) {
    const clean = draftName.trim();
    if (!clean) {
      setRenameError('Church name is required.');
      return;
    }
    if (clean.length > 40) {
      setRenameError('Max 40 characters.');
      return;
    }
    if (clean.toLowerCase() === 'main church') {
      setRenameError('Name cannot be "Main church".');
      return;
    }
    if (churches.some((c) => c !== oldName && c.toLowerCase() === clean.toLowerCase())) {
      setRenameError('A church with that name already exists.');
      return;
    }
    if (clean === oldName) {
      cancelRename();
      return;
    }
    setSaving(true);
    try {
      await onRenameChurch(oldName, clean);
      cancelRename();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename church.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await onDeleteChurch(deleteTarget);
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  }

  const mainCount = countByChurch.get('') ?? 0;
  const deletePlayerCount = deleteTarget ? (countByChurch.get(deleteTarget) ?? 0) : 0;

  return (
    <section className="lg:col-span-2 bg-surface border border-edge rounded-xl px-4 sm:px-5 py-2.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Church size={20} className="text-fg shrink-0" />
          <span className="text-[16px] font-semibold text-fg">Churches</span>
          {churches.length > 0 && (
            <span className="text-xs text-fg-muted tabular-nums">
              ({churches.length + 1})
            </span>
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
        <div className="pt-3 pb-2.5 border-t border-edge mt-2 space-y-2.5">
          {!isAdmin && (
            <p className="text-xs text-fg-muted">
              Admin only. Scorer and Viewer cannot edit.
            </p>
          )}

          <div className="divide-y divide-edge">
            {/* Fixed first row: Main church */}
            <div className="py-2.5 first:pt-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">Main church</p>
                <p className="text-xs text-fg-muted tabular-nums">
                  {mainCount} {mainCount === 1 ? 'player' : 'players'} · Default
                </p>
              </div>
            </div>

            {churches.map((churchName) => {
              const count = countByChurch.get(churchName) ?? 0;
              const isEditing = editingName === churchName;

              return (
                <div key={churchName} className="py-2.5 last:pb-0">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={draftName}
                          maxLength={40}
                          autoFocus
                          disabled={saving}
                          onChange={(e) => {
                            setDraftName(e.target.value);
                            if (renameError) setRenameError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void saveRename(churchName);
                            } else if (e.key === 'Escape') {
                              cancelRename();
                            }
                          }}
                          aria-label={`Rename ${churchName}`}
                          className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl border border-edge bg-nested text-sm text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveRename(churchName)}
                          aria-label="Save church name"
                          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl bg-primary text-primary-fg hover:bg-primary-hover shrink-0 disabled:opacity-50"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={cancelRename}
                          aria-label="Cancel rename"
                          className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl border border-edge text-fg-muted hover:text-fg hover:bg-nested shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {renameError && (
                        <p className="text-xs font-medium text-status-amber-fg">
                          {renameError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">
                          {churchName}
                        </p>
                        <p className="text-xs text-fg-muted tabular-nums">
                          {count} {count === 1 ? 'player' : 'players'}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => startRename(churchName)}
                            aria-label={`Rename ${churchName}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested disabled:opacity-50"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setDeleteTarget(churchName)}
                            aria-label={`Delete ${churchName}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget ?? 'church'}?`}
        description={`${deletePlayerCount} ${
          deletePlayerCount === 1 ? 'player' : 'players'
        } will become Main church.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        busy={saving}
      />
    </section>
  );
}
