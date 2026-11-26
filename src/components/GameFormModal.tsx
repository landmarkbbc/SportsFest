import React, { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import {
  Eligibility,
  GAME_SESSION_LABELS,
  Game,
  GameSession,
  GameType,
  MassGameDoc,
  SportIconKey,
} from '../types/models';
import { GameInput } from '../services/db';
import { SportIconPicker } from './SportIcons';
import { ConfirmDialog } from './TeamBadge';

interface GameFormModalProps {
  open: boolean;
  editingGame: Game | null;
  editingMassDoc?: MassGameDoc | null;
  existingGames: Game[];
  onClose: () => void;
  onSave: (input: GameInput, massGameCount?: number) => Promise<void>;
  onRequestDelete?: (game: Game) => void;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

function ToggleSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && (
          <span className="block text-xs text-fg-muted mt-0.5">{description}</span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex items-center w-12 h-7 rounded-full p-1 transition-colors duration-150 shrink-0 ${
          checked ? 'bg-primary' : 'bg-edge'
        }`}
      >
        <span
          className={`w-5 h-5 rounded-full shadow transition-transform duration-150 ${
            checked ? 'bg-primary-fg translate-x-5' : 'bg-fg translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export function GameFormModal({
  open,
  editingGame,
  editingMassDoc,
  existingGames,
  onClose,
  onSave,
  onRequestDelete,
  onShowToast,
}: GameFormModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<GameType>('individual');
  const [eligibility, setEligibility] = useState<Eligibility>('everyone');
  const [session, setSession] = useState<GameSession>('morning');
  const [iconKey, setIconKey] = useState<SportIconKey | null>(null);
  const [usesSkillLevel, setUsesSkillLevel] = useState(false);
  const [hasDivisions, setHasDivisions] = useState(false);
  const [allowsDraw, setAllowsDraw] = useState(false);
  const [minPlayersInput, setMinPlayersInput] = useState('');
  const [massCountInput, setMassCountInput] = useState('1');
  const [head, setHead] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingShrinkConfirm, setPendingShrinkConfirm] = useState<{
    input: GameInput;
    count: number;
    removedCount: number;
    decidedCount: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingGame) {
      setName(editingGame.name);
      setType(editingGame.type);
      setEligibility(editingGame.eligibility);
      setSession(editingGame.session);
      setIconKey(editingGame.iconKey);
      setUsesSkillLevel(editingGame.usesSkillLevel);
      setHasDivisions(editingGame.hasDivisions);
      setAllowsDraw(Boolean(editingGame.allowsDraw));
      setMinPlayersInput(
        editingGame.minPlayersPerTeam !== null && editingGame.minPlayersPerTeam !== undefined
          ? String(editingGame.minPlayersPerTeam)
          : ''
      );
      setMassCountInput(
        editingGame.type === 'mass'
          ? String(Math.max(1, editingMassDoc?.items.length ?? 1))
          : '1'
      );
      setHead(editingGame.head ?? '');
    } else {
      setName('');
      setType('individual');
      setEligibility('everyone');
      setSession('morning');
      setIconKey(null);
      setUsesSkillLevel(false);
      setHasDivisions(false);
      setAllowsDraw(false);
      setMinPlayersInput('');
      setMassCountInput('1');
      setHead('');
    }
    setPendingShrinkConfirm(null);
    setSaving(false);
  }, [open, editingGame, editingMassDoc]);

  if (!open) return null;

  const isMass = type === 'mass';
  const collapsedName = name.trim().replace(/\s+/g, ' ');
  const normalizedName = collapsedName.toLowerCase();
  const isDuplicateName =
    Boolean(normalizedName) &&
    existingGames.some(
      (g) =>
        g.id !== editingGame?.id &&
        g.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedName
    );

  function handleTypeChange(nextType: GameType) {
    const prevType = type;
    setType(nextType);
    if (nextType !== 'individual') {
      setHasDivisions(false);
      setAllowsDraw(false);
    }
    if (nextType !== 'team') {
      setMinPlayersInput('');
    }
    if (nextType === 'mass') {
      if (!editingGame || (prevType !== 'mass' && iconKey === null)) {
        setIconKey('users');
      }
      if (!massCountInput.trim()) {
        setMassCountInput('1');
      }
    } else if (prevType === 'mass' && !editingGame && iconKey === 'users') {
      setIconKey(null);
    }
  }

  function handleUsesSkillLevelChange(next: boolean) {
    setUsesSkillLevel(next);
    if (!next) {
      setHasDivisions(false);
    }
  }

  function handleHasDivisionsChange(next: boolean) {
    setHasDivisions(next);
    if (next) {
      setUsesSkillLevel(true);
    }
  }

  async function executeSave(input: GameInput, massGameCount?: number) {
    setSaving(true);
    try {
      await onSave(input, massGameCount);
      setPendingShrinkConfirm(null);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      onShowToast('error', 'Game name is required.');
      return;
    }
    if (isDuplicateName) {
      return;
    }

    const cleanHead = head.trim().slice(0, 40);

    if (isMass) {
      const parsedCount = Number(massCountInput.trim());
      if (
        !massCountInput.trim() ||
        !Number.isInteger(parsedCount) ||
        parsedCount < 1 ||
        parsedCount > 20
      ) {
        onShowToast('error', 'Number of games must be between 1 and 20.');
        return;
      }

      const payload: GameInput = {
        name: cleanName,
        type: 'mass',
        eligibility: 'everyone',
        session: 'morning',
        iconKey,
        usesSkillLevel: false,
        hasDivisions: false,
        minPlayersPerTeam: null,
        allowsDraw: false,
        head: cleanHead || null,
      };

      const existingItems = editingGame?.type === 'mass' ? (editingMassDoc?.items ?? []) : [];
      if (editingGame && parsedCount < existingItems.length) {
        const removed = existingItems.slice(parsedCount);
        const decidedCount = removed.filter((item) => item.winner !== null).length;
        if (decidedCount > 0) {
          setPendingShrinkConfirm({
            input: payload,
            count: parsedCount,
            removedCount: removed.length,
            decidedCount,
          });
          return;
        }
      }

      await executeSave(payload, parsedCount);
      return;
    }

    let minPlayersPerTeam: number | null = null;
    if (type === 'team' && minPlayersInput.trim() !== '') {
      const parsed = Number.parseInt(minPlayersInput.trim(), 10);
      if (Number.isNaN(parsed) || parsed < 1 || parsed > 99) {
        onShowToast('error', 'Minimum players per team must be between 1 and 99.');
        return;
      }
      minPlayersPerTeam = parsed;
    }

    const effectiveUsesSkill = type === 'individual' && hasDivisions ? true : usesSkillLevel;
    const effectiveHasDivisions =
      type === 'individual' && effectiveUsesSkill ? hasDivisions : false;

    await executeSave({
      name: cleanName,
      type,
      eligibility,
      session,
      iconKey,
      usesSkillLevel: effectiveUsesSkill,
      hasDivisions: effectiveHasDivisions,
      minPlayersPerTeam,
      allowsDraw: type === 'individual' ? allowsDraw : false,
      head: cleanHead || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-form-modal-title"
    >
      <div className="bg-surface w-full sm:max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-xl border border-edge shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-edge shrink-0">
          <h2
            id="game-form-modal-title"
            className="text-[16px] font-semibold text-fg truncate"
          >
            {editingGame ? `Edit "${editingGame.name}"` : 'Add Game'}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          id="game-popup-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5"
        >
          <div>
            <label
              htmlFor="game-name-input"
              className="block text-sm font-medium text-fg mb-1.5"
            >
              Game Name
            </label>
            <input
              id="game-name-input"
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder={isMass ? 'e.g. Mass Active Games' : 'e.g. Chess, Volleyball - Men'}
              aria-invalid={isDuplicateName}
              className={`w-full min-h-[44px] px-3 py-2 rounded-xl border bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 ${
                isDuplicateName
                  ? 'border-red-team focus:ring-red-team'
                  : 'border-edge focus:ring-fg'
              }`}
            />
            {isDuplicateName && (
              <p className="mt-1.5 text-xs font-medium text-red-light">
                A sport named &apos;{collapsedName}&apos; already exists.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="game-head-input"
              className="block text-sm font-medium text-fg mb-1.5"
            >
              Sport head (optional)
            </label>
            <input
              id="game-head-input"
              type="text"
              value={head}
              maxLength={40}
              onChange={(e) => setHead(e.target.value)}
              placeholder="Optional"
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
            />
          </div>

          <div className={`grid grid-cols-1 ${isMass ? '' : 'sm:grid-cols-2'} gap-3`}>
            <div>
              <label
                htmlFor="game-type-select"
                className="block text-sm font-medium text-fg mb-1.5"
              >
                Type
              </label>
              <select
                id="game-type-select"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as GameType)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg"
              >
                <option value="individual">Individual</option>
                <option value="pairs">Pairs</option>
                <option value="team">Team</option>
                <option value="mass">Mass game</option>
              </select>
            </div>

            {!isMass && (
              <div>
                <label
                  htmlFor="game-eligibility-select"
                  className="block text-sm font-medium text-fg mb-1.5"
                >
                  Eligibility
                </label>
                <select
                  id="game-eligibility-select"
                  value={eligibility}
                  onChange={(e) => setEligibility(e.target.value as Eligibility)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg"
                >
                  <option value="everyone">Everyone</option>
                  <option value="men">Men only</option>
                  <option value="women">Women only</option>
                </select>
              </div>
            )}
          </div>

          {isMass ? (
            <div>
              <label
                htmlFor="mass-games-count-input"
                className="block text-sm font-medium text-fg mb-1.5"
              >
                Number of games
              </label>
              <input
                id="mass-games-count-input"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={20}
                value={massCountInput}
                onChange={(e) => setMassCountInput(e.target.value)}
                placeholder="1-20"
                className="w-full sm:w-44 min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted tabular-nums focus:outline-none focus:ring-2 focus:ring-fg"
              />
              <p className="text-xs text-fg-muted mt-1.5">
                Between 1 and 20 games. Everyone plays automatically.
              </p>
            </div>
          ) : (
            <>
              <div>
                <span className="block text-sm font-medium text-fg mb-1.5">
                  Session
                </span>
                <div className="grid grid-cols-2 gap-1 p-1 bg-nested border border-edge rounded-xl">
                  {(['morning', 'afternoon'] as GameSession[]).map((sess) => {
                    const active = session === sess;
                    return (
                      <button
                        key={sess}
                        type="button"
                        onClick={() => setSession(sess)}
                        className={`min-h-[44px] px-3 rounded-lg text-xs font-medium transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-primary-fg'
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {GAME_SESSION_LABELS[sess]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Skill Level, Divisions, and Min Players */}
              <div className="p-3.5 rounded-xl border border-edge bg-nested divide-y divide-edge">
                <ToggleSwitch
                  id="game-uses-skill-level"
                  label="Use skill levels"
                  description="Track Beginner / Intermediate / Advanced ratings for balancing and brackets."
                  checked={usesSkillLevel}
                  onChange={handleUsesSkillLevelChange}
                />

                {type === 'individual' && usesSkillLevel && (
                  <ToggleSwitch
                    id="game-has-divisions"
                    label="Divisions by skill level"
                    description="Separate L1, L2, and L3 brackets so players compete within their division."
                    checked={hasDivisions}
                    onChange={handleHasDivisionsChange}
                  />
                )}

                {type === 'individual' && (
                  <ToggleSwitch
                    id="game-allows-draw"
                    label="Allow draws"
                    description="Allow matches to be recorded as a draw."
                    checked={allowsDraw}
                    onChange={setAllowsDraw}
                  />
                )}

                {type === 'team' && (
                  <div className="pt-3 pb-1">
                    <label
                      htmlFor="game-min-players"
                      className="block text-sm font-medium text-fg mb-1"
                    >
                      Minimum players per team
                    </label>
                    <p className="text-xs text-fg-muted mb-2">
                      Optional. Blocks starting the match until both teams reach this count.
                    </p>
                    <input
                      id="game-min-players"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={99}
                      value={minPlayersInput}
                      onChange={(e) => setMinPlayersInput(e.target.value)}
                      placeholder="Optional (e.g. 5)"
                      className="w-full sm:w-44 min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-surface text-sm text-fg placeholder:text-fg-muted tabular-nums focus:outline-none focus:ring-2 focus:ring-fg"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div>
            <span className="block text-sm font-medium text-fg mb-1.5">
              {isMass ? 'Icon (optional)' : 'Icon'}
            </span>
            <SportIconPicker value={iconKey} onChange={setIconKey} />
          </div>
        </form>

        {/* Sticky Save / Cancel Footer */}
        <div className="px-4 py-3 border-t border-edge bg-surface flex items-center justify-between gap-2 shrink-0 pb-safe rounded-b-xl">
          {editingGame && onRequestDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRequestDelete(editingGame)}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-red-light hover:bg-red-tint inline-flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-50"
            >
              <Trash2 size={18} />
              <span>Delete</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="game-popup-form"
              disabled={saving || isDuplicateName}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingShrinkConfirm)}
        title={
          pendingShrinkConfirm
            ? `Remove last ${pendingShrinkConfirm.removedCount} ${pendingShrinkConfirm.removedCount === 1 ? 'game' : 'games'}?`
            : ''
        }
        description={
          pendingShrinkConfirm
            ? `${pendingShrinkConfirm.decidedCount} of the removed ${pendingShrinkConfirm.decidedCount === 1 ? 'game already has a winner' : 'games already have winners'}. Reducing to ${pendingShrinkConfirm.count} will permanently clear ${pendingShrinkConfirm.decidedCount === 1 ? 'that result' : 'those results'}.`
            : ''
        }
        confirmLabel="Remove & Save"
        onConfirm={() => {
          if (pendingShrinkConfirm) {
            void executeSave(pendingShrinkConfirm.input, pendingShrinkConfirm.count);
          }
        }}
        onCancel={() => setPendingShrinkConfirm(null)}
        busy={saving}
      />
    </div>
  );
}
