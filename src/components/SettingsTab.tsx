import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Database,
  Download,
  Edit3,
  KeyRound,
  Plus,
  RotateCcw,
  Trash2,
  Trophy,
} from 'lucide-react';
import {
  AppSettings,
  ELIGIBILITY_LABELS,
  GAME_SESSION_LABELS,
  GAME_TYPE_LABELS,
  Game,
  MassGameDoc,
  MassGameItem,
  Player,
  Role,
  SeparationPair,
} from '../types/models';
import { GameInput } from '../services/db';
import { hashPin } from '../utils/crypto';
import { GameFormModal } from './GameFormModal';
import { ChurchesSection } from './ChurchesSection';
import { SeparationsSection } from './SeparationsSection';
import { SportIcon } from './SportIcons';
import { ConfirmDialog } from './TeamBadge';

interface SettingsTabProps {
  role: Role;
  settings: AppSettings | null;
  games: Game[];
  players: Player[];
  massGamesByGameId: Map<string, MassGameDoc>;
  separations: SeparationPair[];
  churches: string[];
  onChangeRole: (role: Role) => void;
  onUpdatePins: (adminPinHash: string, scorerPinHash: string) => Promise<void>;
  onCreateGame: (input: GameInput, massGameCount?: number) => Promise<void>;
  onUpdateGame: (gameId: string, input: GameInput, massGameCount?: number) => Promise<void>;
  onUpdateGamePoints: (
    gameId: string,
    pointsPerMatchWin: number,
    pointsChampion: number
  ) => Promise<void>;
  onUpdateMassGameItemPoints: (
    gameId: string,
    itemId: string,
    points: number
  ) => Promise<void>;
  onDeleteGame: (gameId: string) => Promise<void>;
  onSaveSeparations: (pairs: SeparationPair[]) => Promise<void>;
  onAddChurch: (name: string) => Promise<string>;
  onRenameChurch: (oldName: string, newName: string) => Promise<void>;
  onDeleteChurch: (name: string) => Promise<void>;
  onResetAllTeams: () => Promise<void>;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

function clampPoints(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(val)));
}

function PointsGameRow({
  game,
  isAdmin,
  onSavePoints,
}: {
  game: Game;
  isAdmin: boolean;
  onSavePoints: (
    gameId: string,
    pointsPerMatchWin: number,
    pointsChampion: number
  ) => Promise<void>;
}) {
  const [winDraft, setWinDraft] = useState(String(game.pointsPerMatchWin));
  const [champDraft, setChampDraft] = useState(String(game.pointsChampion));

  useEffect(() => {
    setWinDraft(String(game.pointsPerMatchWin));
  }, [game.pointsPerMatchWin]);

  useEffect(() => {
    setChampDraft(String(game.pointsChampion));
  }, [game.pointsChampion]);

  function handleFieldChange(field: 'win' | 'champ', raw: string) {
    if (!isAdmin) return;
    if (field === 'win') setWinDraft(raw);
    else setChampDraft(raw);

    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) return;

    const nextWin = field === 'win' ? parsed : clampPoints(Number(winDraft || game.pointsPerMatchWin));
    const nextChamp =
      field === 'champ' ? parsed : clampPoints(Number(champDraft || game.pointsChampion));

    if (nextWin !== game.pointsPerMatchWin || nextChamp !== game.pointsChampion) {
      void onSavePoints(game.id, nextWin, nextChamp);
    }
  }

  function handleBlur(field: 'win' | 'champ') {
    if (!isAdmin) return;
    const raw = field === 'win' ? winDraft : champDraft;
    const parsed = raw.trim() === '' ? 0 : clampPoints(Number(raw));
    if (field === 'win') setWinDraft(String(parsed));
    else setChampDraft(String(parsed));

    const nextWin = field === 'win' ? parsed : game.pointsPerMatchWin;
    const nextChamp = field === 'champ' ? parsed : game.pointsChampion;
    if (nextWin !== game.pointsPerMatchWin || nextChamp !== game.pointsChampion) {
      void onSavePoints(game.id, nextWin, nextChamp);
    }
  }

  return (
    <div className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        {game.iconKey && <SportIcon iconKey={game.iconKey} size={18} className="text-fg" />}
        <span className="text-sm font-medium text-fg truncate">{game.name}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span>Per match win</span>
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            disabled={!isAdmin}
            value={winDraft}
            onChange={(e) => handleFieldChange('win', e.target.value)}
            onBlur={() => handleBlur('win')}
            aria-label={`${game.name} points per match win`}
            className="w-16 min-h-[36px] px-2 py-1 rounded-lg border border-edge bg-nested text-sm text-fg text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-fg disabled:opacity-65 disabled:cursor-not-allowed"
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs text-fg-muted">
          <span>Champion</span>
          <input
            type="number"
            min={0}
            max={99}
            inputMode="numeric"
            disabled={!isAdmin}
            value={champDraft}
            onChange={(e) => handleFieldChange('champ', e.target.value)}
            onBlur={() => handleBlur('champ')}
            aria-label={`${game.name} champion points`}
            className="w-16 min-h-[36px] px-2 py-1 rounded-lg border border-edge bg-nested text-sm text-fg text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-fg disabled:opacity-65 disabled:cursor-not-allowed"
          />
        </label>
      </div>
    </div>
  );
}

function clampMassPoints(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(99, Math.round(val * 10) / 10));
}

function MassItemPointsRow({
  gameId,
  item,
  isAdmin,
  onSaveItemPoints,
}: {
  gameId: string;
  item: MassGameItem;
  isAdmin: boolean;
  onSaveItemPoints: (gameId: string, itemId: string, points: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(item.points));

  useEffect(() => {
    setDraft(String(item.points));
  }, [item.points]);

  function handleChange(raw: string) {
    if (!isAdmin) return;
    setDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.endsWith('.')) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99) return;
    const next = clampMassPoints(parsed);
    if (next !== item.points) {
      void onSaveItemPoints(gameId, item.id, next);
    }
  }

  function handleBlur() {
    if (!isAdmin) return;
    const trimmed = draft.trim();
    const parsed = trimmed === '' ? 0 : clampMassPoints(Number(trimmed));
    setDraft(String(parsed));
    if (parsed !== item.points) {
      void onSaveItemPoints(gameId, item.id, parsed);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs sm:text-sm text-fg truncate">{item.name}</span>
      <label className="flex items-center gap-1.5 text-xs text-fg-muted shrink-0">
        <span>Points</span>
        <input
          type="number"
          min={0}
          max={99}
          step="any"
          inputMode="decimal"
          disabled={!isAdmin}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          aria-label={`${item.name} points`}
          className="w-16 min-h-[36px] px-2 py-1 rounded-lg border border-edge bg-nested text-sm text-fg text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-fg disabled:opacity-65 disabled:cursor-not-allowed"
        />
      </label>
    </div>
  );
}

export function SettingsTab({
  role,
  settings,
  games,
  players,
  massGamesByGameId,
  separations,
  churches,
  onChangeRole,
  onUpdatePins,
  onCreateGame,
  onUpdateGame,
  onUpdateGamePoints,
  onUpdateMassGameItemPoints,
  onDeleteGame,
  onSaveSeparations,
  onAddChurch,
  onRenameChurch,
  onDeleteChurch,
  onResetAllTeams,
  onShowToast,
}: SettingsTabProps) {
  const isAdmin = role === 'admin';

  // PIN unlock state
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  // Change PINs state
  const [showChangePins, setShowChangePins] = useState(false);
  const [newAdminPin, setNewAdminPin] = useState('');
  const [newScorerPin, setNewScorerPin] = useState('');
  const [savingPins, setSavingPins] = useState(false);

  // Game management modal state
  const [gameFormOpen, setGameFormOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  // Delete game confirmation state
  const [deleteTargetGame, setDeleteTargetGame] = useState<Game | null>(null);
  const [deletingGame, setDeletingGame] = useState(false);

  // Double confirmation for Reset all team assignments
  const [resetStep1Open, setResetStep1Open] = useState(false);
  const [resetStep2Open, setResetStep2Open] = useState(false);
  const [resettingTeams, setResettingTeams] = useState(false);

  // Accordion states (collapsed by default, not remembered)
  const [pointsOpen, setPointsOpen] = useState(false);
  const [manageGamesOpen, setManageGamesOpen] = useState(false);

  const playerCountByGameId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of players) {
      for (const e of p.entries) {
        map.set(e.gameId, (map.get(e.gameId) ?? 0) + 1);
      }
    }
    return map;
  }, [players]);

  const assignedCount = useMemo(
    () => players.filter((p) => p.team !== null).length,
    [players]
  );

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = pinInput.trim();
    if (!clean || !settings) return;

    setVerifyingPin(true);
    try {
      const candidateHash = await hashPin(clean);
      if (candidateHash === settings.adminPinHash) {
        onChangeRole('admin');
        setPinInput('');
        onShowToast('success', 'Unlocked Admin mode on this device.');
      } else if (candidateHash === settings.scorerPinHash) {
        onChangeRole('scorer');
        setPinInput('');
        onShowToast('success', 'Unlocked Scorer mode on this device.');
      } else {
        onShowToast('error', 'Incorrect PIN. Please try again.');
      }
    } finally {
      setVerifyingPin(false);
    }
  }

  async function handleSaveNewPins(e: React.FormEvent) {
    e.preventDefault();
    const a = newAdminPin.trim();
    const s = newScorerPin.trim();
    if (a.length < 4 || s.length < 4) {
      onShowToast('error', 'Both PINs must be at least 4 characters.');
      return;
    }
    if (a === s) {
      onShowToast('error', 'Admin PIN and Scorer PIN must be different.');
      return;
    }

    setSavingPins(true);
    try {
      const [ah, sh] = await Promise.all([hashPin(a), hashPin(s)]);
      await onUpdatePins(ah, sh);
      setShowChangePins(false);
      setNewAdminPin('');
      setNewScorerPin('');
    } finally {
      setSavingPins(false);
    }
  }

  function openNewGameForm() {
    setEditingGame(null);
    setGameFormOpen(true);
  }

  function openEditGameForm(game: Game) {
    setEditingGame(game);
    setGameFormOpen(true);
  }

  async function handleSaveGame(input: GameInput, massGameCount?: number) {
    if (editingGame) {
      await onUpdateGame(editingGame.id, input, massGameCount);
    } else {
      await onCreateGame(input, massGameCount);
    }
    setGameFormOpen(false);
    setEditingGame(null);
  }

  async function handleConfirmDeleteGame() {
    if (!deleteTargetGame) return;
    setDeletingGame(true);
    try {
      const deletedId = deleteTargetGame.id;
      await onDeleteGame(deletedId);
      setDeleteTargetGame(null);
      if (editingGame?.id === deletedId) {
        setGameFormOpen(false);
        setEditingGame(null);
      }
    } finally {
      setDeletingGame(false);
    }
  }

  function handleExportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      games,
      players,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sports-fest-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('success', 'Exported all data as JSON.');
  }

  async function handleFinalResetTeams() {
    setResettingTeams(true);
    try {
      await onResetAllTeams();
      setResetStep2Open(false);
    } finally {
      setResettingTeams(false);
    }
  }

  const deleteTargetPlayerCount = deleteTargetGame
    ? (playerCountByGameId.get(deleteTargetGame.id) ?? 0)
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Role & PIN Card */}
      <section className="lg:col-span-2 bg-surface border border-edge rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KeyRound size={20} className="text-fg" />
            <h2 className="text-[16px] font-semibold text-fg">Role & Device PIN</h2>
          </div>
          <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-nested border border-edge text-fg capitalize">
            {role}
          </span>
        </div>

        <p className="text-sm text-fg-muted">
          {role === 'admin'
            ? 'Admin mode unlocked. You can manage players, games, and team assignments.'
            : role === 'scorer'
              ? 'Scorer mode unlocked. You can record match winners.'
              : 'Viewer mode is read-only. Enter a Scorer or Admin PIN to unlock actions.'}
        </p>

        <form onSubmit={handlePinSubmit} className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="Enter Admin or Scorer PIN"
            aria-label="Enter role PIN"
            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg"
          />
          <button
            type="submit"
            disabled={verifyingPin || !pinInput.trim()}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
          >
            Unlock
          </button>
        </form>

        <div className="flex flex-wrap gap-2 pt-1">
          {role !== 'viewer' && (
            <button
              type="button"
              onClick={() => {
                onChangeRole('viewer');
                onShowToast('success', 'Switched to Viewer mode.');
              }}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested"
            >
              Switch to Viewer
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowChangePins((v) => !v)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-edge bg-transparent text-xs font-medium text-fg hover:bg-nested"
            >
              {showChangePins ? 'Cancel PIN Update' : 'Change PINs'}
            </button>
          )}
        </div>

        {isAdmin && showChangePins && (
          <form onSubmit={handleSaveNewPins} className="pt-3 border-t border-edge space-y-3">
            <div>
              <label htmlFor="new-admin-pin" className="block text-xs font-medium text-fg mb-1">
                New Admin PIN
              </label>
              <input
                id="new-admin-pin"
                type="password"
                inputMode="numeric"
                value={newAdminPin}
                onChange={(e) => setNewAdminPin(e.target.value)}
                placeholder="At least 4 characters"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted"
              />
            </div>
            <div>
              <label htmlFor="new-scorer-pin" className="block text-xs font-medium text-fg mb-1">
                New Scorer PIN
              </label>
              <input
                id="new-scorer-pin"
                type="password"
                inputMode="numeric"
                value={newScorerPin}
                onChange={(e) => setNewScorerPin(e.target.value)}
                placeholder="At least 4 characters"
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested text-sm text-fg placeholder:text-fg-muted"
              />
            </div>
            <button
              type="submit"
              disabled={savingPins}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
            >
              {savingPins ? 'Updating PINs...' : 'Save New PINs'}
            </button>
          </form>
        )}
      </section>

      {/* Points Accordion (Collapsed by default, Admin only to edit) */}
      <section className="lg:col-span-2 bg-surface border border-edge rounded-xl px-4 sm:px-5 py-2.5">
        <button
          type="button"
          aria-expanded={pointsOpen}
          onClick={() => setPointsOpen((v) => !v)}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Trophy size={20} className="text-fg shrink-0" />
            <span className="text-[16px] font-semibold text-fg">Points</span>
          </div>
          <ChevronDown
            size={18}
            className={`text-fg-muted shrink-0 transition-transform duration-150 ${
              pointsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {pointsOpen && (
          <div className="pt-3 pb-2.5 border-t border-edge mt-2 space-y-4">
            <p className="text-xs text-fg-muted">
              {isAdmin
                ? 'Changes save instantly. Division games apply champion points per division.'
                : 'Admin only. Scorer and Viewer cannot edit.'}
            </p>
            <div className="divide-y divide-edge">
              {games.map((game) => {
                if (game.type === 'mass') {
                  const items = massGamesByGameId.get(game.id)?.items ?? [];
                  return (
                    <div key={game.id} className="py-2.5 first:pt-0 last:pb-0 space-y-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {game.iconKey && (
                          <SportIcon iconKey={game.iconKey} size={18} className="text-fg" />
                        )}
                        <span className="text-sm font-medium text-fg truncate">{game.name}</span>
                      </div>
                      <div className="pl-4 sm:pl-6 divide-y divide-edge/50">
                        {items.map((item) => (
                          <MassItemPointsRow
                            key={item.id}
                            gameId={game.id}
                            item={item}
                            isAdmin={isAdmin}
                            onSaveItemPoints={onUpdateMassGameItemPoints}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <PointsGameRow
                    key={game.id}
                    game={game}
                    isAdmin={isAdmin}
                    onSavePoints={onUpdateGamePoints}
                  />
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Manage Games Accordion (Collapsed by default) */}
      <section className="lg:col-span-2 bg-surface border border-edge rounded-xl px-4 sm:px-5 py-2.5">
        <button
          type="button"
          aria-expanded={manageGamesOpen}
          onClick={() => setManageGamesOpen((v) => !v)}
          className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-[16px] font-semibold text-fg">Manage Games</span>
            <span className="text-xs text-fg-muted tabular-nums">
              ({games.length})
            </span>
          </div>
          <ChevronDown
            size={18}
            className={`text-fg-muted shrink-0 transition-transform duration-150 ${
              manageGamesOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {manageGamesOpen && (
          <div className="pt-3 pb-2.5 border-t border-edge mt-2 space-y-4">
            {isAdmin && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openNewGameForm}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-xs font-medium hover:bg-primary-hover inline-flex items-center gap-1.5"
                >
                  <Plus size={18} />
                  <span>Add Game</span>
                </button>
              </div>
            )}

            <div className="divide-y divide-edge">
              {games.map((game) => {
                const pCount = playerCountByGameId.get(game.id) ?? 0;
                return (
                  <div
                    key={game.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {game.iconKey && (
                        <SportIcon iconKey={game.iconKey} size={20} className="text-fg" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{game.name}</p>
                        {game.type === 'mass' ? (
                          <p className="text-xs text-fg-muted tabular-nums">
                            Mass game · {massGamesByGameId.get(game.id)?.items.length ?? 0}{' '}
                            {(massGamesByGameId.get(game.id)?.items.length ?? 0) === 1
                              ? 'game'
                              : 'games'}
                          </p>
                        ) : (
                          <p className="text-xs text-fg-muted tabular-nums">
                            {GAME_TYPE_LABELS[game.type]} · {ELIGIBILITY_LABELS[game.eligibility]} ·{' '}
                            {GAME_SESSION_LABELS[game.session]} · {pCount}{' '}
                            {pCount === 1 ? 'player' : 'players'}
                          </p>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditGameForm(game)}
                          aria-label={`Edit ${game.name}`}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetGame(game)}
                          aria-label={`Delete ${game.name}`}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Keep apart (Collapsed by default, Admin only to edit) */}
      <SeparationsSection
        isAdmin={isAdmin}
        players={players}
        pairs={separations}
        onSaveSeparations={onSaveSeparations}
      />

      {/* Churches (Collapsed by default, Admin only to edit) */}
      <ChurchesSection
        isAdmin={isAdmin}
        churches={churches}
        players={players}
        onAddChurch={onAddChurch}
        onRenameChurch={onRenameChurch}
        onDeleteChurch={onDeleteChurch}
      />

      {/* Data Tools Card (Very bottom of Settings) */}
      <section className="lg:col-span-2 bg-surface border border-edge rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <Database size={20} className="text-fg" />
          <h2 className="text-[16px] font-semibold text-fg">Data Tools</h2>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleExportJson}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested flex items-center justify-between transition-colors duration-150"
          >
            <span>Export all data as JSON</span>
            <Download size={20} className="text-fg-muted" />
          </button>

          {isAdmin && (
            <button
              type="button"
              disabled={assignedCount === 0}
              onClick={() => setResetStep1Open(true)}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-status-amber-edge bg-status-amber-bg text-sm font-medium text-status-amber-fg hover:opacity-90 flex items-center justify-between transition-opacity duration-150 disabled:opacity-50"
            >
              <span>Reset all team assignments ({assignedCount})</span>
              <RotateCcw size={20} />
            </button>
          )}
        </div>
      </section>

      {/* Add / Edit Game Popup */}
      <GameFormModal
        open={isAdmin && gameFormOpen}
        editingGame={editingGame}
        editingMassDoc={editingGame ? massGamesByGameId.get(editingGame.id) ?? null : null}
        existingGames={games}
        onClose={() => {
          setGameFormOpen(false);
          setEditingGame(null);
        }}
        onSave={handleSaveGame}
        onRequestDelete={(game) => setDeleteTargetGame(game)}
        onShowToast={onShowToast}
      />

      {/* Confirm Delete Game */}
      <ConfirmDialog
        open={Boolean(deleteTargetGame)}
        title="Delete Game"
        description={
          deleteTargetGame
            ? deleteTargetGame.type === 'mass'
              ? `Delete ${deleteTargetGame.name}? All inner games and results will be removed. This cannot be undone.`
              : `Delete ${deleteTargetGame.name}? It will be removed from ${deleteTargetPlayerCount} player(s). This cannot be undone.`
            : ''
        }
        confirmLabel="Delete Game"
        onConfirm={handleConfirmDeleteGame}
        onCancel={() => setDeleteTargetGame(null)}
        busy={deletingGame}
      />

      {/* Double Confirmation for Reset All Team Assignments */}
      <ConfirmDialog
        open={resetStep1Open}
        title="Reset All Team Assignments?"
        description={`This will clear Blue and Red team assignments for ${assignedCount} players and set everyone back to Unassigned.`}
        confirmLabel="Continue"
        onConfirm={() => {
          setResetStep1Open(false);
          setResetStep2Open(true);
        }}
        onCancel={() => setResetStep1Open(false)}
      />

      <ConfirmDialog
        open={resetStep2Open}
        title="Confirm Permanent Reset"
        description="Are you sure? All current Blue and Red team assignments will be erased across all synced devices."
        confirmLabel="Yes, Reset All Teams"
        onConfirm={handleFinalResetTeams}
        onCancel={() => setResetStep2Open(false)}
        busy={resettingTeams}
      />
    </div>
  );
}
