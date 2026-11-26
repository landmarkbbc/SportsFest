import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Clock,
  LayoutGrid,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  Trophy,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  AppSettings,
  AppTab,
  Department,
  EventProgram,
  Game,
  GamePairs,
  Gender,
  Player,
  PlayerEntry,
  Role,
  SeparationPair,
  SportNavigationTarget,
  TeamId,
} from './types/models';
import {
  GameInput,
  addChurchName,
  assignBulkTeams,
  assignPlayerTeam,
  createGame,
  createPlayer,
  deleteChurchAndUpdatePlayers,
  deleteGameAndCleanupPlayers,
  deletePlayer,
  ensureAnonymousAuth,
  renameChurchAndUpdatePlayers,
  resetAllTeamAssignments,
  saveInitialPins,
  saveProgram,
  saveSeparations,
  subscribeChurches,
  subscribeGames,
  subscribePairs,
  subscribePlayers,
  subscribeProgram,
  subscribeSeparations,
  subscribeSettings,
  testFirestoreConnection,
  updateGame,
  updateGamePoints,
  updateMassGameItemPoints,
  updatePins,
  updatePlayer,
} from './services/db';
import {
  BulkAssignmentPlan,
  RebalancePlan,
  SingleAssignmentResult,
  buildManualSingleAssignmentResult,
  getLockedGameIds,
  planBulkAssignment,
  planRebalance,
  planSingleAssignment,
} from './utils/balance';
import { useBracketsAndScoreboard } from './hooks/useScoreboard';
import { PlayersTab } from './components/PlayersTab';
import { ScoreboardTab } from './components/ScoreboardTab';
import { TeamsTab } from './components/TeamsTab';
import { SportsTab } from './components/SportsTab';
import { SettingsTab } from './components/SettingsTab';
import { SetupPinModal } from './components/SetupPinModal';
import { PlayerFormModal, WalkInTeamChoice } from './components/PlayerFormModal';
import { AssignPlayerModal } from './components/AssignPlayerModal';
import { AssignmentConfirmationModal } from './components/AssignmentConfirmationModal';
import { BulkAssignPreviewModal } from './components/BulkAssignPreviewModal';
import { RebalancePreviewModal } from './components/RebalancePreviewModal';
import { SportDetailView } from './components/SportDetailModal';
import { ProgramModal } from './components/ProgramModal';
import { Toast, ToastAction, ToastMessage } from './components/Toast';

const ROLE_STORAGE_KEY = 'sfm_device_role';
const TAB_STORAGE_KEY = 'sfm_active_tab';

const NAV_ITEMS: { id: AppTab; label: string; icon: typeof Users }[] = [
  { id: 'scoreboard', label: 'Scoreboard', icon: BarChart3 },
  { id: 'sports', label: 'Sports', icon: Trophy },
  { id: 'teams', label: 'Teams', icon: Shield },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

const TAB_TITLES: Record<AppTab, string> = {
  scoreboard: 'Scoreboard',
  sports: 'Sports',
  teams: 'Teams',
  players: 'Players',
  settings: 'Settings',
};

function readStoredTab(): AppTab {
  try {
    const val = localStorage.getItem(TAB_STORAGE_KEY);
    if (
      val === 'scoreboard' ||
      val === 'sports' ||
      val === 'teams' ||
      val === 'players' ||
      val === 'settings'
    ) {
      return val;
    }
  } catch {
    // Ignore storage errors
  }
  return 'scoreboard';
}

function readStoredRole(): Role {
  try {
    const val = localStorage.getItem(ROLE_STORAGE_KEY);
    if (val === 'admin' || val === 'scorer' || val === 'viewer') return val;
  } catch {
    // Ignore storage errors
  }
  return 'viewer';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>(() => readStoredTab());
  const [role, setRole] = useState<Role>(() => readStoredRole());

  // Firebase Anonymous Auth state
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authRetrying, setAuthRetrying] = useState(false);

  // Firestore real-time state
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pairsByGameId, setPairsByGameId] = useState<Map<string, GamePairs>>(
    () => new Map()
  );
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [program, setProgram] = useState<EventProgram | null>(null);
  const [separations, setSeparations] = useState<SeparationPair[]>([]);
  const [churches, setChurches] = useState<string[]>([]);
  const [programOpen, setProgramOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsExists, setSettingsExists] = useState(true);
  const [gamesLoaded, setGamesLoaded] = useState(false);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  // Network / sync state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [playersFromCache, setPlayersFromCache] = useState(false);

  // Teams tab collapsed sport outline keys (persisted while app is open)
  const [collapsedTeamGroupKeys, setCollapsedTeamGroupKeys] = useState<Set<string>>(
    () => new Set()
  );

  // Modals & sheets state
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModalMode, setPlayerModalMode] = useState<'add' | 'edit' | 'walkin'>('add');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  const [assignTargetPlayer, setAssignTargetPlayer] = useState<Player | null>(null);

  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);
  const [assignedPlayerRecord, setAssignedPlayerRecord] = useState<Player | null>(null);
  const [assignedResult, setAssignedResult] = useState<SingleAssignmentResult | null>(null);

  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false);
  const [bulkPlan, setBulkPlan] = useState<BulkAssignmentPlan | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  const [rebalancePreviewOpen, setRebalancePreviewOpen] = useState(false);
  const [rebalancePlan, setRebalancePlan] = useState<RebalancePlan | null>(null);
  const [rebalanceConfirming, setRebalanceConfirming] = useState(false);

  const [sportNav, setSportNav] = useState<(SportNavigationTarget & { key: number }) | null>(
    null
  );
  const sportNavCounterRef = useRef(0);

  // Toast state
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (
      type: 'success' | 'error',
      text: string,
      options?: { durationMs?: number; warningText?: string; action?: ToastAction }
    ) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({
        id: Date.now(),
        type,
        text,
        warningText: options?.warningText,
        action: options?.action,
      });
      const duration = options?.durationMs ?? (type === 'error' ? 4000 : 2500);
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
      }, duration);
    },
    []
  );

  const handleSelectTab = useCallback((nextTab: AppTab) => {
    setActiveTab(nextTab);
    setSportNav(null);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, nextTab);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const openSportPage = useCallback(
    (target: SportNavigationTarget) => {
      sportNavCounterRef.current += 1;
      setSportNav({
        ...target,
        fromTab: target.fromTab ?? activeTab,
        key: sportNavCounterRef.current,
      });
    },
    [activeTab]
  );

  const handleSetRole = useCallback((nextRole: Role) => {
    setRole(nextRole);
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Browser online/offline listeners
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Anonymous Authentication bootstrap
  const startAnonymousAuth = useCallback(async () => {
    setAuthError(null);
    setAuthRetrying(true);
    try {
      await ensureAnonymousAuth();
      setAuthReady(true);
      void testFirestoreConnection();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuthReady(false);
      setAuthError(msg);
    } finally {
      setAuthRetrying(false);
    }
  }, []);

  useEffect(() => {
    void startAnonymousAuth();
  }, [startAnonymousAuth]);

  // Firestore real-time listeners (only attached once authReady is true)
  useEffect(() => {
    if (!authReady) return;

    const unsubGames = subscribeGames(
      (data) => {
        setGames(data);
        setGamesLoaded(true);
      },
      (err) => {
        setGamesLoaded(true);
        showToast('error', `Games sync error: ${err.message}`);
      }
    );

    const unsubPlayers = subscribePlayers(
      (data, fromCache) => {
        setPlayers(data);
        setPlayersFromCache(fromCache);
        setPlayersLoaded(true);
      },
      (err) => {
        setPlayersLoaded(true);
        showToast('error', `Players sync error: ${err.message}`);
      }
    );

    const unsubSettings = subscribeSettings(
      (data, exists) => {
        setSettings(data);
        setSettingsExists(exists);
        setSettingsLoaded(true);
      },
      (err) => {
        setSettingsLoaded(true);
        showToast('error', `Settings sync error: ${err.message}`);
      }
    );

    const unsubProgram = subscribeProgram(
      (data) => {
        setProgram(data);
      },
      (err) => {
        showToast('error', `Program sync error: ${err.message}`);
      }
    );

    const unsubPairs = subscribePairs(
      (data) => {
        setPairsByGameId(data);
      },
      (err) => {
        showToast('error', `Pairs sync error: ${err.message}`);
      }
    );

    const unsubSeparations = subscribeSeparations(
      (data) => {
        setSeparations(data);
      },
      (err) => {
        showToast('error', `Keep apart sync error: ${err.message}`);
      }
    );

    const unsubChurches = subscribeChurches(
      (data) => {
        setChurches(data);
      },
      (err) => {
        showToast('error', `Churches sync error: ${err.message}`);
      }
    );

    return () => {
      unsubGames();
      unsubPlayers();
      unsubSettings();
      unsubProgram();
      unsubPairs();
      unsubSeparations();
      unsubChurches();
    };
  }, [authReady, showToast]);

  const handleBracketsSyncError = useCallback(
    (msg: string) => {
      showToast('error', msg);
    },
    [showToast]
  );

  const {
    bracketsByGameId,
    bracketsLoaded,
    massGamesByGameId,
    massGamesLoaded,
    scoreboard,
  } = useBracketsAndScoreboard(
    authReady,
    games,
    handleBracketsSyncError
  );

  const initialLoading =
    !authReady ||
    !gamesLoaded ||
    !playersLoaded ||
    !settingsLoaded ||
    !bracketsLoaded ||
    !massGamesLoaded;
  const isSynced = isOnline && !playersFromCache;
  const showInitialPinSetup = authReady && settingsLoaded && !settingsExists;

  const lockedGameIds = useMemo(
    () => getLockedGameIds(bracketsByGameId, pairsByGameId),
    [bracketsByGameId, pairsByGameId]
  );

  // Keep activeSport synchronized if games update
  const activeSport = useMemo(
    () => (sportNav ? games.find((g) => g.id === sportNav.gameId) ?? null : null),
    [sportNav, games]
  );

  // Handlers
  async function handleInitialPinSave(adminPinHash: string, scorerPinHash: string) {
    try {
      await saveInitialPins(adminPinHash, scorerPinHash, games.length === 0);
      handleSetRole('admin');
      showToast('success', 'PINs saved and default games ready. Admin mode active.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to initialize settings.');
      throw err;
    }
  }

  async function handleUpdatePins(adminPinHash: string, scorerPinHash: string) {
    try {
      await updatePins(adminPinHash, scorerPinHash);
      showToast('success', 'Role PINs updated.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update PINs.');
    }
  }

  async function handleSaveProgram(nextProgram: EventProgram) {
    await saveProgram(nextProgram);
    showToast('success', 'Program saved.');
  }

  async function handleSaveSeparations(nextPairs: SeparationPair[]) {
    try {
      await saveSeparations(nextPairs);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save keep apart rules.');
      throw err;
    }
  }

  async function handleAddChurch(name: string): Promise<string> {
    try {
      const added = await addChurchName(name);
      showToast('success', `Added church "${added}".`);
      return added;
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add church.');
      throw err;
    }
  }

  async function handleRenameChurch(oldName: string, newName: string) {
    if (role !== 'admin') return;
    try {
      await renameChurchAndUpdatePlayers(oldName, newName, churches, players);
      showToast('success', `Renamed church to "${newName.trim()}".`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to rename church.');
      throw err;
    }
  }

  async function handleDeleteChurch(name: string) {
    if (role !== 'admin') return;
    try {
      await deleteChurchAndUpdatePlayers(name, churches, players);
      showToast('success', `Deleted church "${name}".`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete church.');
      throw err;
    }
  }

  async function handleCreateGame(input: GameInput, massGameCount?: number): Promise<Game> {
    try {
      const created = await createGame(input, massGameCount);
      showToast('success', `Added game "${created.name}".`);
      return created;
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add game.');
      throw err;
    }
  }

  async function handleUpdateGame(
    gameId: string,
    input: GameInput,
    massGameCount?: number
  ) {
    try {
      await updateGame(gameId, input, massGameCount);
      showToast('success', `Updated "${input.name}".`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update game.');
    }
  }

  async function handleUpdateGamePoints(
    gameId: string,
    pointsPerMatchWin: number,
    pointsChampion: number
  ) {
    if (role !== 'admin') return;
    try {
      await updateGamePoints(gameId, pointsPerMatchWin, pointsChampion);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update points.');
    }
  }

  async function handleUpdateMassGameItemPoints(
    gameId: string,
    itemId: string,
    points: number
  ) {
    if (role !== 'admin') return;
    try {
      await updateMassGameItemPoints(gameId, itemId, points);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update points.');
    }
  }

  async function handleDeleteGame(gameId: string) {
    try {
      const target = games.find((g) => g.id === gameId);
      const cleanedCount = await deleteGameAndCleanupPlayers(
        gameId,
        players,
        target?.type === 'mass'
      );
      showToast(
        'success',
        cleanedCount > 0
          ? `Game deleted and removed from ${cleanedCount} player(s).`
          : 'Game deleted.'
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete game.');
    }
  }

  async function handleSavePlayer(payload: {
    name: string;
    department: Department;
    gender: Gender;
    church: string;
    entries: PlayerEntry[];
    isWalkIn: boolean;
    walkInChoice: WalkInTeamChoice;
    editTeam?: TeamId | null;
  }) {
    try {
      if (playerModalMode === 'edit' && selectedPlayer) {
        const nextTeam =
          payload.editTeam !== undefined ? payload.editTeam : selectedPlayer.team;
        await updatePlayer(selectedPlayer.id, {
          name: payload.name,
          department: payload.department,
          gender: payload.gender,
          church: payload.church,
          entries: payload.entries,
          isWalkIn: payload.isWalkIn,
          team: nextTeam,
        });
        setPlayerModalOpen(false);
        showToast('success', `Updated ${payload.name}.`);
        return;
      }

      // Add or Walk-in
      if (playerModalMode === 'walkin' && payload.walkInChoice !== 'unassigned') {
        const tempPlayer: Player = {
          id: 'temp_new_player',
          name: payload.name,
          department: payload.department,
          gender: payload.gender,
          church: payload.church,
          entries: payload.entries,
          team: null,
          isWalkIn: true,
          isDemo: false,
          createdAt: Date.now(),
        };

        const plan =
          payload.walkInChoice === 'auto'
            ? planSingleAssignment(tempPlayer, players, games, Math.random, separations)
            : buildManualSingleAssignmentResult(
                tempPlayer,
                payload.walkInChoice,
                players,
                games,
                separations
              );

        const created = await createPlayer({
          name: payload.name,
          department: payload.department,
          gender: payload.gender,
          church: payload.church,
          entries: payload.entries,
          team: plan.team,
          isWalkIn: true,
          isDemo: false,
        });
        setPlayerModalOpen(false);
        setAssignedPlayerRecord(created);
        setAssignedResult(plan);
        setAssignConfirmOpen(true);
      } else {
        await createPlayer({
          name: payload.name,
          department: payload.department,
          gender: payload.gender,
          church: payload.church,
          entries: payload.entries,
          team: null,
          isWalkIn: payload.isWalkIn,
          isDemo: false,
        });
        setPlayerModalOpen(false);
        showToast('success', `Saved ${payload.name}.`);
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save player.');
    }
  }

  async function handleDeletePlayer(playerId: string) {
    try {
      await deletePlayer(playerId);
      setPlayerModalOpen(false);
      showToast('success', 'Player removed.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete player.');
    }
  }

  async function handleAssignSingleChoice(player: Player, choice: TeamId | 'auto') {
    if (player.team !== null) return;
    try {
      const plan =
        choice === 'auto'
          ? planSingleAssignment(player, players, games, Math.random, separations)
          : buildManualSingleAssignmentResult(player, choice, players, games, separations);

      await assignPlayerTeam(player.id, plan.team);
      setAssignTargetPlayer(null);
      setAssignedPlayerRecord({ ...player, team: plan.team });
      setAssignedResult(plan);
      setAssignConfirmOpen(true);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to assign player.');
    }
  }

  function handleOpenBulkAssignPreview() {
    const plan = planBulkAssignment(players, games, separations);
    setBulkPlan(plan);
    setBulkPreviewOpen(true);
  }

  async function handleConfirmBulkAssign() {
    if (!bulkPlan) return;
    setBulkConfirming(true);
    try {
      await assignBulkTeams(bulkPlan.proposedTeamByPlayerId);
      const count = bulkPlan.proposedBlue.length + bulkPlan.proposedRed.length;
      const unresolvedText =
        bulkPlan.unresolvedSeparations.length > 0
          ? bulkPlan.unresolvedSeparations
              .map((u) => `Could not separate ${u.aName} and ${u.bName}`)
              .join(' · ')
          : undefined;
      setBulkPreviewOpen(false);
      setBulkPlan(null);
      showToast('success', `Assigned ${count} players to Blue and Red teams.`, {
        warningText: unresolvedText,
        durationMs: unresolvedText ? 5000 : undefined,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save team assignments.');
    } finally {
      setBulkConfirming(false);
    }
  }

  function handleOpenRebalancePreview() {
    if (role !== 'admin') return;
    const plan = planRebalance(players, games, bracketsByGameId, pairsByGameId, separations);
    setRebalancePlan(plan);
    setRebalancePreviewOpen(true);
  }

  async function handleConfirmRebalance() {
    if (!rebalancePlan || rebalancePlan.moves.length === 0) return;
    setRebalanceConfirming(true);
    try {
      await assignBulkTeams(rebalancePlan.changesByPlayerId);
      const count = rebalancePlan.moves.length;
      const unresolvedText =
        rebalancePlan.unresolvedSeparations.length > 0
          ? rebalancePlan.unresolvedSeparations
              .map((u) => `Could not separate ${u.aName} and ${u.bName}`)
              .join(' · ')
          : undefined;
      setRebalancePreviewOpen(false);
      setRebalancePlan(null);
      showToast('success', `${count} ${count === 1 ? 'player' : 'players'} moved`, {
        warningText: unresolvedText,
        durationMs: unresolvedText ? 5000 : undefined,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to re-balance teams.');
    } finally {
      setRebalanceConfirming(false);
    }
  }

  async function handleResetAllTeams() {
    try {
      await resetAllTeamAssignments(players);
      showToast('success', 'All team assignments reset to Unassigned.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to reset teams.');
    }
  }

  function handleToggleTeamGroupKey(groupKey: string) {
    setCollapsedTeamGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const roleLabel = role === 'admin' ? 'Admin' : role === 'scorer' ? 'Scorer' : 'Viewer';

  return (
    <div className="min-h-screen bg-page text-fg flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen bg-surface border-r border-edge">
        <div className="px-6 py-5 border-b border-edge">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-fg flex items-center justify-center shrink-0">
              <LayoutGrid size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg truncate">
                Sports Fest Manager
              </p>
              <p className="text-xs text-fg-muted truncate">Blue vs Red Fellowship</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors duration-150 ${
                  active
                    ? 'bg-primary text-primary-fg'
                    : 'text-fg-muted hover:text-fg hover:bg-nested'
                }`}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-edge space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted">Mode</span>
            <span className="font-semibold text-fg">{roleLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-muted">Status</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              {isSynced ? (
                <>
                  <Wifi size={14} className="text-status-green-fg" />
                  <span>Synced</span>
                </>
              ) : (
                <>
                  <WifiOff size={14} className="text-status-amber-fg" />
                  <span>Offline</span>
                </>
              )}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Top Header */}
        <header className="sticky top-0 z-30 h-14 bg-surface border-b border-edge px-4 lg:px-8 flex items-center justify-between gap-4">
          <h1 className="text-[24px] font-semibold text-fg leading-tight truncate">
            {TAB_TITLES[activeTab]}
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-nested border border-edge text-fg">
              {roleLabel}
            </span>
            <button
              type="button"
              onClick={() => setProgramOpen(true)}
              aria-label="Event program"
              title="Event program"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150"
            >
              <Clock size={18} />
            </button>
            <span
              role="status"
              aria-label={isSynced ? 'Synced' : 'Offline'}
              title={isSynced ? 'Synced' : 'Offline'}
              className={`w-8 h-8 inline-flex items-center justify-center rounded-lg border ${
                isSynced
                  ? 'bg-status-green-bg border-status-green-edge text-status-green-fg'
                  : 'bg-status-amber-bg border-status-amber-edge text-status-amber-fg'
              }`}
            >
              {isSynced ? <Wifi size={16} /> : <WifiOff size={16} />}
            </span>
          </div>
        </header>

        {/* Scrollable Screen Container */}
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 py-4 sm:py-6 pb-24 lg:pb-10">
          {authError && (
            <div
              role="alert"
              className="mb-4 bg-surface border border-status-red-edge rounded-xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.2)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-status-red-fg shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-fg">
                    Firebase sign-in failed
                  </p>
                  <p className="text-xs text-fg-muted mt-0.5 break-words">{authError}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={authRetrying}
                onClick={() => void startAnonymousAuth()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover inline-flex items-center justify-center gap-2 shrink-0 transition-colors duration-150 disabled:opacity-50"
              >
                <RefreshCw size={18} />
                <span>{authRetrying ? 'Retrying...' : 'Retry'}</span>
              </button>
            </div>
          )}

          {activeSport && sportNav ? (
            <SportDetailView
              game={activeSport}
              players={players}
              bracketsByGameId={bracketsByGameId}
              pairsByGameId={pairsByGameId}
              massGamesByGameId={massGamesByGameId}
              role={role}
              initialDivision={sportNav.division ?? null}
              initialTab={sportNav.tab}
              focusTarget={sportNav.focus}
              navKey={sportNav.key}
              backLabel={
                sportNav.fromTab === 'scoreboard'
                  ? 'Back to scoreboard'
                  : sportNav.fromTab === 'teams'
                    ? 'Back to teams'
                    : 'Back to sports'
              }
              onBack={() => setSportNav(null)}
              onOpenPlayerDetails={(player) => {
                setSelectedPlayer(player);
                setPlayerModalMode('edit');
                setPlayerModalOpen(true);
              }}
              onShowToast={showToast}
            />
          ) : (
            <>
              {activeTab === 'sports' && (
                <SportsTab
                  loading={initialLoading}
                  games={games}
                  players={players}
                  massGamesByGameId={massGamesByGameId}
                  onSelectGame={(game) => openSportPage({ gameId: game.id, fromTab: 'sports' })}
                />
              )}

              {activeTab === 'scoreboard' && (
                <ScoreboardTab
                  loading={initialLoading}
                  scoreboard={scoreboard}
                  onSelectSport={(target) =>
                    openSportPage({ ...target, fromTab: 'scoreboard' })
                  }
                />
              )}

              {activeTab === 'teams' && (
                <TeamsTab
                  loading={initialLoading}
                  players={players}
                  games={games}
                  role={role}
                  collapsedGroupKeys={collapsedTeamGroupKeys}
                  onToggleGroupKey={handleToggleTeamGroupKey}
                  onSetCollapsedGroupKeys={setCollapsedTeamGroupKeys}
                  onOpenBulkAssignPreview={handleOpenBulkAssignPreview}
                  onOpenRebalancePreview={handleOpenRebalancePreview}
                  onSelectSport={(target) => openSportPage({ ...target, fromTab: 'teams' })}
                  onSelectPlayer={(player) => {
                    setSelectedPlayer(player);
                    setPlayerModalMode('edit');
                    setPlayerModalOpen(true);
                  }}
                />
              )}

          {activeTab === 'players' && (
            <PlayersTab
              loading={initialLoading}
              players={players}
              games={games}
              role={role}
              onSelectPlayer={(player) => {
                setSelectedPlayer(player);
                setPlayerModalMode('edit');
                setPlayerModalOpen(true);
              }}
              onOpenAddPlayer={() => {
                setSelectedPlayer(null);
                setPlayerModalMode('add');
                setPlayerModalOpen(true);
              }}
              onOpenWalkIn={() => {
                setSelectedPlayer(null);
                setPlayerModalMode('walkin');
                setPlayerModalOpen(true);
              }}
              onOpenAssignSheet={(player) => setAssignTargetPlayer(player)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              role={role}
              settings={settings}
              games={games}
              players={players}
              massGamesByGameId={massGamesByGameId}
              separations={separations}
              churches={churches}
              onChangeRole={handleSetRole}
              onUpdatePins={handleUpdatePins}
              onCreateGame={async (input, massGameCount) => {
                await handleCreateGame(input, massGameCount);
              }}
              onUpdateGame={handleUpdateGame}
              onUpdateGamePoints={handleUpdateGamePoints}
              onUpdateMassGameItemPoints={handleUpdateMassGameItemPoints}
              onDeleteGame={handleDeleteGame}
              onSaveSeparations={handleSaveSeparations}
              onAddChurch={handleAddChurch}
              onRenameChurch={handleRenameChurch}
              onDeleteChurch={handleDeleteChurch}
              onResetAllTeams={handleResetAllTeams}
              onShowToast={showToast}
            />
          )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (< 1024px) */}
      <nav
        aria-label="Bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-edge pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`min-h-[44px] px-0.5 flex flex-col items-center justify-center gap-1 transition-colors duration-150 ${
                  active ? 'text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                <span
                  className={`text-[11px] sm:text-xs leading-none truncate max-w-full ${
                    active ? 'font-semibold' : 'font-medium'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Sheets */}
      <SetupPinModal open={showInitialPinSetup} onSave={handleInitialPinSave} />

      <ProgramModal
        open={programOpen}
        program={program}
        role={role}
        onSave={handleSaveProgram}
        onClose={() => setProgramOpen(false)}
      />

      <PlayerFormModal
        open={playerModalOpen}
        mode={playerModalMode}
        player={selectedPlayer}
        allPlayers={players}
        role={role}
        games={games}
        lockedGameIds={lockedGameIds}
        separations={separations}
        churches={churches}
        onClose={() => setPlayerModalOpen(false)}
        onSavePlayer={handleSavePlayer}
        onAddChurch={handleAddChurch}
        onDeletePlayer={handleDeletePlayer}
      />

      <AssignPlayerModal
        open={Boolean(assignTargetPlayer)}
        player={assignTargetPlayer}
        players={players}
        games={games}
        separations={separations}
        onClose={() => setAssignTargetPlayer(null)}
        onAssignChoice={handleAssignSingleChoice}
      />

      <AssignmentConfirmationModal
        open={assignConfirmOpen}
        player={assignedPlayerRecord}
        result={assignedResult}
        onClose={() => setAssignConfirmOpen(false)}
      />

      <BulkAssignPreviewModal
        open={bulkPreviewOpen}
        plan={bulkPlan}
        confirming={bulkConfirming}
        onConfirm={handleConfirmBulkAssign}
        onCancel={() => {
          setBulkPreviewOpen(false);
          setBulkPlan(null);
        }}
      />

      <RebalancePreviewModal
        open={rebalancePreviewOpen}
        plan={rebalancePlan}
        confirming={rebalanceConfirming}
        onConfirm={handleConfirmRebalance}
        onCancel={() => {
          setRebalancePreviewOpen(false);
          setRebalancePlan(null);
        }}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
