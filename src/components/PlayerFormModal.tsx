import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Trash2, X } from 'lucide-react';
import {
  DEPARTMENTS,
  Department,
  ENTRY_SLOTS,
  EntrySlot,
  GAME_SESSION_LABELS,
  Game,
  Gender,
  Player,
  PlayerEntry,
  Role,
  SKILL_LEVEL_LABELS,
  SkillLevel,
  TeamId,
} from '../types/models';
import {
  MoveGameBalanceDiff,
  getEffectiveLevel,
  isGenderEligibleForGame,
  previewMovePlayerGameBalances,
} from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge, ConfirmDialog, TeamIndicator } from './TeamBadge';

export type WalkInTeamChoice = 'auto' | 'blue' | 'red' | 'unassigned';

interface SlotDraft {
  gameId: string;
  selfLevel: SkillLevel;
  overrideLevel: SkillLevel | null;
}

type DraftBySlot = Record<EntrySlot, SlotDraft>;

interface PlayerFormModalProps {
  open: boolean;
  mode: 'add' | 'edit' | 'walkin';
  player: Player | null;
  allPlayers: Player[];
  role: Role;
  games: Game[];
  onClose: () => void;
  onSavePlayer: (payload: {
    name: string;
    department: Department;
    gender: Gender;
    entries: PlayerEntry[];
    isWalkIn: boolean;
    walkInChoice: WalkInTeamChoice;
    editTeam?: TeamId | null;
  }) => Promise<void>;
  onDeletePlayer?: (playerId: string) => Promise<void>;
}

function buildInitialDrafts(player: Player | null): DraftBySlot {
  const base: DraftBySlot = {
    morning: { gameId: '', selfLevel: 2, overrideLevel: null },
    afternoon: { gameId: '', selfLevel: 2, overrideLevel: null },
    secondary: { gameId: '', selfLevel: 2, overrideLevel: null },
    tertiary: { gameId: '', selfLevel: 2, overrideLevel: null },
  };
  if (!player) return base;
  for (const entry of player.entries) {
    base[entry.slot] = {
      gameId: entry.gameId,
      selfLevel: entry.selfLevel,
      overrideLevel: entry.overrideLevel ?? null,
    };
  }
  return base;
}

function isGameEligibleForSlot(slot: EntrySlot, game: Game, gender: Gender): boolean {
  if (!isGenderEligibleForGame(gender, game)) return false;
  if (slot === 'morning') return game.session === 'morning';
  if (slot === 'afternoon') return game.session === 'afternoon';
  return true;
}

export function PlayerFormModal({
  open,
  mode,
  player,
  allPlayers,
  role,
  games,
  onClose,
  onSavePlayer,
  onDeletePlayer,
}: PlayerFormModalProps) {
  const isAdmin = role === 'admin';
  const readOnly = !isAdmin;

  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('YP');
  const [gender, setGender] = useState<Gender>('M');
  const [drafts, setDrafts] = useState<DraftBySlot>(() => buildInitialDrafts(null));
  const [walkInChoice, setWalkInChoice] = useState<WalkInTeamChoice>('auto');
  const [editTeam, setEditTeam] = useState<TeamId | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Move team confirmation state (when assigned player switches Blue <-> Red)
  const [moveConfirmData, setMoveConfirmData] = useState<{
    fromTeam: TeamId;
    toTeam: TeamId;
    entries: PlayerEntry[];
    diffs: MoveGameBalanceDiff[];
  } | null>(null);

  // Validation errors
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? '');
    setDepartment(player?.department ?? 'YP');
    setGender(player?.gender ?? 'M');
    setDrafts(buildInitialDrafts(player));
    setWalkInChoice('auto');
    setEditTeam(player?.team ?? null);
    setSubmitted(false);
    setConfirmDeleteOpen(false);
    setMoveConfirmData(null);
  }, [open, player, mode]);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  const initialEntryGameIdBySlot = useMemo(() => {
    const map = new Map<EntrySlot, string>();
    if (player) {
      for (const e of player.entries) {
        map.set(e.slot, e.gameId);
      }
    }
    return map;
  }, [player]);

  const validation = useMemo(() => {
    const errors: {
      name?: string;
      slots: Partial<Record<EntrySlot, string>>;
    } = { slots: {} };

    if (!name.trim()) {
      errors.name = 'Player name is required.';
    }

    const seenGameIds = new Map<string, EntrySlot>();

    for (const { key } of ENTRY_SLOTS) {
      const gId = drafts[key].gameId;
      if (!gId) continue;

      const game = gameById.get(gId);
      const isExistingInSlot = initialEntryGameIdBySlot.get(key) === gId;

      if (game && !isGenderEligibleForGame(gender, game) && !isExistingInSlot) {
        errors.slots[key] = `${game.name} is not eligible for ${gender === 'M' ? 'Men' : 'Women'}.`;
      } else if (seenGameIds.has(gId)) {
        errors.slots[key] = 'Same game cannot appear twice for one player.';
      } else {
        seenGameIds.set(gId, key);
      }
    }

    const hasErrors = Boolean(errors.name) || Object.keys(errors.slots).length > 0;

    return { errors, hasErrors };
  }, [name, drafts, gender, gameById, initialEntryGameIdBySlot]);

  if (!open) return null;

  function updateSlot(slot: EntrySlot, patch: Partial<SlotDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], ...patch },
    }));
  }

  function collectEntries(): PlayerEntry[] {
    const entries: PlayerEntry[] = [];
    for (const { key } of ENTRY_SLOTS) {
      const d = drafts[key];
      if (!d.gameId) continue;
      entries.push({
        slot: key,
        gameId: d.gameId,
        selfLevel: d.selfLevel,
        overrideLevel: isAdmin ? d.overrideLevel : null,
      });
    }
    return entries;
  }

  async function executeSave(entries: PlayerEntry[]) {
    setSaving(true);
    try {
      await onSavePlayer({
        name: name.trim(),
        department,
        gender,
        entries,
        isWalkIn: mode === 'walkin' ? true : Boolean(player?.isWalkIn),
        walkInChoice: mode === 'walkin' ? walkInChoice : 'unassigned',
        editTeam: mode === 'edit' && isAdmin ? editTeam : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setSubmitted(true);
    if (validation.hasErrors) return;

    const entries = collectEntries();

    // Section 10: If Admin changed an already-assigned player's team (Blue <-> Red), ask confirmation first
    if (
      mode === 'edit' &&
      isAdmin &&
      player &&
      player.team !== null &&
      editTeam !== null &&
      player.team !== editTeam
    ) {
      const diffs = previewMovePlayerGameBalances(player, entries, editTeam, allPlayers, games);
      setMoveConfirmData({
        fromTeam: player.team,
        toTeam: editTeam,
        entries,
        diffs,
      });
      return;
    }

    await executeSave(entries);
  }

  async function handleConfirmMoveSave() {
    if (!moveConfirmData) return;
    await executeSave(moveConfirmData.entries);
    setMoveConfirmData(null);
  }

  async function handleDelete() {
    if (!player || !onDeletePlayer) return;
    setDeleting(true);
    try {
      await onDeletePlayer(player.id);
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const title = readOnly
    ? 'Player Details'
    : mode === 'walkin'
      ? 'Register Walk-In'
      : mode === 'edit'
        ? 'Edit Player'
        : 'Add Player';

  return (
    <div
      className="fixed inset-0 z-40 bg-overlay flex items-stretch lg:items-center justify-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-modal-title"
    >
      <div className="bg-surface w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-2xl lg:rounded-xl lg:border lg:border-edge lg:shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 id="player-modal-title" className="text-[16px] font-semibold text-fg truncate">
              {title}
            </h2>
            {player && <TeamIndicator team={player.team} compact />}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {readOnly && player ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            <div>
              <p className="text-xs text-fg-muted mb-1">Full Name</p>
              <p className="text-[20px] font-semibold text-fg">{player.name}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-nested border border-edge rounded-xl p-3">
                <p className="text-xs text-fg-muted mb-1">Department</p>
                <p className="text-sm font-semibold text-fg">{player.department}</p>
              </div>
              <div className="bg-nested border border-edge rounded-xl p-3">
                <p className="text-xs text-fg-muted mb-1">Gender</p>
                <p className="text-sm font-semibold text-fg">
                  {player.gender === 'M' ? 'Male (M)' : 'Female (F)'}
                </p>
              </div>
              <div className="bg-nested border border-edge rounded-xl p-3">
                <p className="text-xs text-fg-muted mb-1">Team</p>
                <TeamIndicator team={player.team} compact />
              </div>
            </div>

            <div>
              <h3 className="text-[16px] font-semibold text-fg mb-3">Registered Games</h3>
              {player.entries.length === 0 ? (
                <div className="p-4 rounded-xl border border-edge bg-nested">
                  <p className="text-sm text-fg-muted">No games yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {player.entries.map((entry) => {
                    const game = gameById.get(entry.gameId);
                    const eff = getEffectiveLevel(entry);
                    const slotLabel = ENTRY_SLOTS.find((s) => s.key === entry.slot)?.label ?? entry.slot;
                    return (
                      <div
                        key={entry.slot}
                        className="flex items-center justify-between p-3 rounded-xl border border-edge bg-nested"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {game?.iconKey && (
                            <SportIcon iconKey={game.iconKey} size={18} className="text-fg" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-fg">
                              {game?.name ?? 'Unknown game'}
                            </p>
                            <p className="text-xs text-fg-muted">{slotLabel}</p>
                          </div>
                        </div>
                        {game?.usesSkillLevel && (
                          <div className="text-right">
                            <p className="text-xs font-semibold text-fg tabular-nums">
                              L{eff} · {SKILL_LEVEL_LABELS[eff]}
                            </p>
                            {entry.overrideLevel && (
                              <p className="text-xs text-fg-muted">
                                Self: L{entry.selfLevel}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <form id="player-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="player-name" className="block text-sm font-medium text-fg mb-1.5">
                Player Name
              </label>
              <input
                id="player-name"
                type="text"
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Joshua Santos"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
              />
              {submitted && validation.errors.name && (
                <p className="mt-1.5 text-xs font-medium text-status-red-fg">{validation.errors.name}</p>
              )}
            </div>

            {/* Department & Gender */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-sm font-medium text-fg mb-1.5">Department</span>
                <div className="grid grid-cols-4 gap-1 p-1 bg-nested border border-edge rounded-xl">
                  {DEPARTMENTS.map((dept) => {
                    const active = department === dept;
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => setDepartment(dept)}
                        className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-primary-fg'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-fg mb-1.5">Gender</span>
                <div className="grid grid-cols-2 gap-1 p-1 bg-nested border border-edge rounded-xl">
                  {(['M', 'F'] as Gender[]).map((g) => {
                    const active = gender === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={`min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-primary-fg'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {g === 'M' ? 'Male (M)' : 'Female (F)'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Edit Player Team Segmented Control (Admin only, directly below Gender) */}
            {mode === 'edit' && isAdmin && player && (
              <div>
                <span className="block text-sm font-medium text-fg mb-1.5">Team</span>
                <div
                  className={`grid gap-1 p-1 bg-nested border border-edge rounded-xl ${
                    player.team === null ? 'grid-cols-3' : 'grid-cols-2'
                  }`}
                >
                  {player.team === null && (
                    <button
                      type="button"
                      onClick={() => setEditTeam(null)}
                      className={`min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center gap-1.5 ${
                        editTeam === null
                          ? 'bg-surface text-fg border border-edge'
                          : 'text-fg-muted hover:text-fg'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-fg-muted" aria-hidden="true" />
                      <span>Unassigned</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditTeam('blue')}
                    className={`min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center gap-1.5 ${
                      editTeam === 'blue'
                        ? 'bg-blue-tint text-blue-light border border-blue-edge'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                    <span>Blue</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTeam('red')}
                    className={`min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center gap-1.5 ${
                      editTeam === 'red'
                        ? 'bg-red-tint text-red-light border border-red-edge'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                    <span>Red</span>
                  </button>
                </div>
              </div>
            )}

            {/* Walk-in Team Segmented Control */}
            {mode === 'walkin' && (
              <div>
                <span className="block text-sm font-medium text-fg mb-1.5">Team</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-nested border border-edge rounded-xl">
                  <button
                    type="button"
                    onClick={() => setWalkInChoice('auto')}
                    className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center ${
                      walkInChoice === 'auto'
                        ? 'bg-primary text-primary-fg'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    Automatic
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInChoice('blue')}
                    className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center gap-1.5 ${
                      walkInChoice === 'blue'
                        ? 'bg-blue-tint text-blue-light border border-blue-edge'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                    <span>Blue</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInChoice('red')}
                    className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center gap-1.5 ${
                      walkInChoice === 'red'
                        ? 'bg-red-tint text-red-light border border-red-edge'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                    <span>Red</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalkInChoice('unassigned')}
                    className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 inline-flex items-center justify-center ${
                      walkInChoice === 'unassigned'
                        ? 'bg-surface text-fg border border-edge'
                        : 'text-fg-muted hover:text-fg'
                    }`}
                  >
                    Leave unassigned
                  </button>
                </div>
              </div>
            )}

            {/* Game Entries */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-semibold text-fg">Game Entries</h3>
                <span className="text-xs text-fg-muted">Optional · up to 4</span>
              </div>

              {ENTRY_SLOTS.map(({ key, label }) => {
                const slotDraft = drafts[key];
                const slotError = validation.errors.slots[key];
                const selectedGame = slotDraft.gameId ? gameById.get(slotDraft.gameId) : undefined;

                const otherSelectedGameIds = new Set(
                  ENTRY_SLOTS.filter((s) => s.key !== key)
                    .map((s) => drafts[s.key].gameId)
                    .filter(Boolean)
                );

                const filteredGamesForSlot = games.filter(
                  (g) =>
                    isGameEligibleForSlot(key, g, gender) &&
                    (!otherSelectedGameIds.has(g.id) || g.id === slotDraft.gameId)
                );
                const selectedOutsideFilter =
                  selectedGame && !filteredGamesForSlot.some((g) => g.id === selectedGame.id);

                return (
                  <div
                    key={key}
                    className="p-4 rounded-xl border border-edge bg-nested space-y-3"
                  >
                    <label htmlFor={`slot-${key}`} className="block text-sm font-semibold text-fg">
                      {label}
                    </label>

                    <select
                      id={`slot-${key}`}
                      value={slotDraft.gameId}
                      onChange={(e) => updateSlot(key, { gameId: e.target.value })}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-surface text-sm text-fg focus:outline-none focus:ring-2 focus:ring-fg"
                    >
                      <option value="">None</option>
                      {selectedOutsideFilter && selectedGame && (
                        <option value={selectedGame.id}>
                          {selectedGame.name} ({GAME_SESSION_LABELS[selectedGame.session]})
                        </option>
                      )}
                      {filteredGamesForSlot.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.type}
                          {key === 'secondary' || key === 'tertiary'
                            ? ` · ${GAME_SESSION_LABELS[g.session]}`
                            : ''}
                          )
                        </option>
                      ))}
                    </select>

                    {/* Level Selector (only shown when selected game enables skill levels) */}
                    {slotDraft.gameId && selectedGame?.usesSkillLevel && (
                      <div className="space-y-3 pt-1">
                        <div>
                          <span className="block text-xs font-medium text-fg-muted mb-1.5">
                            Self-rated Level
                          </span>
                          <div className="grid grid-cols-3 gap-1 p-1 bg-surface border border-edge rounded-xl">
                            {([1, 2, 3] as SkillLevel[]).map((lvl) => {
                              const active = slotDraft.selfLevel === lvl;
                              return (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => updateSlot(key, { selfLevel: lvl })}
                                  className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 ${
                                    active
                                      ? 'bg-primary text-primary-fg'
                                      : 'text-fg-muted hover:text-fg'
                                  }`}
                                >
                                  L{lvl} {SKILL_LEVEL_LABELS[lvl]}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Admin-only Override Level */}
                        {isAdmin && (
                          <div className="pt-2 border-t border-edge">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-medium text-fg">
                                Override level (Admin)
                              </span>
                              <span className="text-xs text-fg-muted">
                                Self-rated: L{slotDraft.selfLevel} {SKILL_LEVEL_LABELS[slotDraft.selfLevel]}
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 p-1 bg-surface border border-edge rounded-xl">
                              <button
                                type="button"
                                onClick={() => updateSlot(key, { overrideLevel: null })}
                                className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 ${
                                  slotDraft.overrideLevel === null
                                    ? 'bg-primary text-primary-fg'
                                    : 'text-fg-muted hover:text-fg'
                                }`}
                              >
                                None
                              </button>
                              {([1, 2, 3] as SkillLevel[]).map((lvl) => {
                                const active = slotDraft.overrideLevel === lvl;
                                return (
                                  <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => updateSlot(key, { overrideLevel: lvl })}
                                    className={`min-h-[44px] px-2 rounded-lg text-xs font-medium transition-colors duration-150 ${
                                      active
                                        ? 'bg-primary text-primary-fg'
                                        : 'text-fg-muted hover:text-fg'
                                    }`}
                                  >
                                    L{lvl}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {slotError && (
                      <p className="text-xs font-medium text-status-amber-fg">{slotError}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-edge bg-surface flex items-center justify-between gap-3 shrink-0 pb-safe">
          {readOnly ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150"
            >
              Close
            </button>
          ) : (
            <>
              {mode === 'edit' && player && onDeletePlayer ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg-muted hover:text-fg hover:bg-nested inline-flex items-center gap-2 transition-colors duration-150"
                >
                  <Trash2 size={20} />
                  <span>Delete</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                form="player-form"
                disabled={saving}
                className="flex-1 sm:flex-initial min-h-[44px] px-6 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                {saving
                  ? 'Saving...'
                  : mode === 'walkin'
                    ? walkInChoice === 'auto'
                      ? 'Save & Assign Team'
                      : walkInChoice === 'blue'
                        ? 'Save to Blue'
                        : walkInChoice === 'red'
                          ? 'Save to Red'
                          : 'Save Walk-In'
                    : mode === 'edit'
                      ? 'Save Changes'
                      : 'Save Player'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Move Team Confirmation Dialog (Section 10) */}
      {moveConfirmData && player && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-confirm-title"
        >
          <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-4 pb-safe">
            <h2 id="move-confirm-title" className="text-[16px] font-semibold text-fg">
              Move {player.name} from {moveConfirmData.fromTeam === 'blue' ? 'Blue' : 'Red'} to{' '}
              {moveConfirmData.toTeam === 'blue' ? 'Blue' : 'Red'}?
            </h2>

            {moveConfirmData.diffs.length === 0 ? (
              <p className="text-sm text-fg-muted">
                This player has no game entries. Moving them updates team headcount only.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                <p className="text-xs font-medium text-fg-muted">Game Balance Impact</p>
                {moveConfirmData.diffs.map(({ game, before, after }) => (
                  <div
                    key={game.id}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-edge bg-nested"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {game.iconKey && (
                        <SportIcon iconKey={game.iconKey} size={16} className="text-fg" />
                      )}
                      <span className="text-xs font-medium text-fg truncate">
                        {game.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <BalanceBadge status={before} />
                      <ArrowRight size={14} className="text-fg-muted" />
                      <BalanceBadge status={after} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setMoveConfirmData(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-edge text-sm font-medium text-fg bg-transparent hover:bg-nested disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmMoveSave}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? 'Moving...' : 'Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete Player"
        description={`Remove ${player?.name ?? 'this player'} from the roster? This cannot be undone.`}
        confirmLabel="Delete Player"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        busy={deleting}
      />
    </div>
  );
}
