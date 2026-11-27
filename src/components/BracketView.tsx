import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  Lock,
  RotateCcw,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  Bracket,
  BracketGroup,
  BracketMatch,
  BracketSlotSnapshot,
  Game,
  GamePairs,
  Player,
  Role,
  SkillLevel,
} from '../types/models';
import {
  decideBracketMatch,
  deleteBracket,
  pickBracketChampion,
  recordBracketDraw,
  resetBracketScores,
  restoreBracketBackup,
  undoBracketMatch,
  undoEliminationDraw,
} from '../services/db';
import {
  AlreadyDecidedError,
  DIVISION_LEVELS,
  StaleBracketError,
  canUndoMatch,
  computeRoundRobinStandings,
  countResettableResults,
  formatPoints,
  getBracketChampionPlayerId,
  getBracketDocId,
  getEliminationUndoImpact,
  getGamePairingMode,
  getGameParticipantsSummary,
  getRoundRobinTiedLeaders,
  getTeamMinPlayersError,
} from '../utils/bracket';
import { hasPairsRosterChanged } from '../utils/pairs';
import { CreateBracketModal } from './CreateBracketModal';
import { MakePairsModal } from './MakePairsModal';
import { ChurchMarker, PlayerNameWithChurch } from './PlayerMarkers';

interface BracketViewProps {
  game: Game;
  players: Player[];
  bracket: Bracket | null;
  gamePairs?: GamePairs | null;
  division?: SkillLevel | null;
  group?: BracketGroup;
  role: Role;
  focusTarget?: 'ongoing';
  navKey?: number;
  onShowToast: (type: 'success' | 'error', text: string) => void;
}

type PendingMatchDecision =
  | {
      kind: 'winner';
      matchId: string;
      side: 'a' | 'b';
      slot: BracketSlotSnapshot;
      drawCount: number;
    }
  | {
      kind: 'draw';
      matchId: string;
      match: BracketMatch;
      drawCount: number;
    };

interface PendingUndoRequest {
  matchId: string;
  laterRounds: number[];
  laterDecidedCount: number;
  expectedVersion: number;
}

interface EliminationColumnItem {
  round: number;
  title: string;
  isPlaceholder: boolean;
  matches: BracketMatch[];
  decidedCount: number;
  isComplete: boolean;
  placeholderPlayableCount: number;
  placeholderHasBye: boolean;
}

function getEliminationRoundTitle(round: number, matchCount: number): string {
  if (matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Semifinals';
  if (matchCount === 4) return 'Quarterfinals';
  return `Round ${round}`;
}

function formatCreatedDate(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatBackupTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function MatchSlotRow({
  slot,
  church,
  showLevel,
  isWinner,
  isLoser,
  isLocked,
  canScore,
  onPick,
}: {
  slot: BracketSlotSnapshot | null;
  church?: string | null;
  showLevel: boolean;
  isWinner: boolean;
  isLoser: boolean;
  isLocked: boolean;
  canScore: boolean;
  onPick: () => void;
}) {
  if (!slot) {
    return (
      <div className="min-h-[44px] px-3 py-2 rounded-lg border border-dashed border-edge bg-surface flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span>Bye</span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted">
          Bye
        </span>
      </div>
    );
  }

  const interactive = canScore && !isLocked;
  const winnerRowStyle =
    slot.team === 'blue'
      ? 'bg-blue-tint border-blue-edge'
      : 'bg-red-tint border-red-edge';
  const winnerCheckStyle =
    slot.team === 'blue' ? 'bg-blue-team text-fg' : 'bg-red-team text-fg';

  const rowClasses = [
    'w-full min-h-[44px] px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-left transition-all duration-200 motion-reduce:transition-none',
    isWinner
      ? winnerRowStyle
      : isLoser
        ? 'bg-surface border-edge opacity-50'
        : interactive
          ? 'bg-surface border-edge hover:bg-nested active:bg-nested cursor-pointer'
          : 'bg-surface border-edge',
  ].join(' ');

  const content = (
    <>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0 flex-1">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            slot.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
          }`}
          aria-label={slot.team === 'blue' ? 'Blue team' : 'Red team'}
        />
        <PlayerNameWithChurch
          name={slot.name}
          church={church}
          className="text-sm font-medium text-fg break-words leading-snug"
        />
        {slot.dept && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted shrink-0">
            {slot.dept}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {showLevel && slot.level !== null && (
          <span className="px-1.5 py-0.5 rounded-md bg-nested border border-edge text-xs font-medium text-fg tabular-nums">
            L{slot.level}
          </span>
        )}
        {isWinner && (
          <span
            className={`animate-check-in inline-flex items-center justify-center w-5 h-5 rounded-full ${winnerCheckStyle}`}
          >
            <Check size={14} strokeWidth={2.5} />
          </span>
        )}
      </div>
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onPick} className={rowClasses}>
        {content}
      </button>
    );
  }

  return <div className={rowClasses}>{content}</div>;
}

function MatchCard({
  match,
  matchNumber,
  showLevel,
  showChurch,
  playerById,
  allowsDraw,
  canScore,
  canUndo,
  undoing,
  isPulsing = false,
  cardRef,
  leadPlayerId,
  onPickWinner,
  onPickDraw,
  onUndo,
  onUndoDraw,
}: {
  match: BracketMatch;
  matchNumber: number;
  showLevel: boolean;
  showChurch: boolean;
  playerById: ReadonlyMap<string, Player>;
  allowsDraw: boolean;
  canScore: boolean;
  canUndo: boolean;
  undoing: boolean;
  isPulsing?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
  leadPlayerId?: string;
  onPickWinner: (matchId: string, side: 'a' | 'b', slot: BracketSlotSnapshot, drawCount: number) => void;
  onPickDraw: (match: BracketMatch) => void;
  onUndo: (matchId: string) => void;
  onUndoDraw: (matchId: string) => void;
}) {
  const isLocked = match.winner !== null;
  const isDrawWinner = match.winner === 'draw';
  const drawCount = match.drawCount ?? 0;
  const swapOrder = Boolean(leadPlayerId && match.b?.playerId === leadPlayerId);
  const firstSide: 'a' | 'b' = swapOrder ? 'b' : 'a';
  const secondSide: 'a' | 'b' = swapOrder ? 'a' : 'b';
  const firstSlot = firstSide === 'a' ? match.a : match.b;
  const secondSlot = secondSide === 'a' ? match.a : match.b;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border bg-nested p-3 space-y-2 transition-shadow ${
        isPulsing ? 'border-fg animate-match-pulse' : 'border-edge'
      }`}
    >
      <div className="flex items-center justify-between gap-2 min-h-[20px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-fg-muted tabular-nums">
            Match {matchNumber}
          </span>
          {match.sameTeam && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface border border-edge text-fg-muted">
              Same-team
            </span>
          )}
          {match.bye && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface border border-edge text-fg-muted">
              Bye
            </span>
          )}
          {isDrawWinner && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg">
              Draw
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isLocked && (
            <Lock size={13} className="text-fg-muted shrink-0" aria-label="Match decided" />
          )}
          {canScore && canUndo && (
            <button
              type="button"
              disabled={undoing}
              onClick={() => onUndo(match.id)}
              className="min-h-[28px] px-2 py-0.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface border border-transparent hover:border-edge inline-flex items-center gap-1 transition-colors duration-150 disabled:opacity-50"
            >
              <RotateCcw size={12} />
              <span>{undoing ? 'Undoing...' : 'Undo'}</span>
            </button>
          )}
          {canScore && !isLocked && drawCount > 0 && (
            <button
              type="button"
              disabled={undoing}
              onClick={() => onUndoDraw(match.id)}
              className="min-h-[28px] px-2 py-0.5 rounded-lg text-xs font-medium text-fg-muted hover:text-fg hover:bg-surface border border-transparent hover:border-edge inline-flex items-center gap-1 transition-colors duration-150 disabled:opacity-50"
            >
              <RotateCcw size={12} />
              <span>{undoing ? 'Undoing...' : 'Undo draw'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <MatchSlotRow
          slot={firstSlot}
          church={showChurch && firstSlot ? playerById.get(firstSlot.playerId)?.church : undefined}
          showLevel={showLevel}
          isWinner={match.winner === firstSide}
          isLoser={match.winner !== null && !isDrawWinner && match.winner !== firstSide}
          isLocked={isLocked}
          canScore={canScore}
          onPick={() => {
            if (firstSlot && !isLocked && canScore) {
              onPickWinner(match.id, firstSide, firstSlot, drawCount);
            }
          }}
        />
        <MatchSlotRow
          slot={secondSlot}
          church={showChurch && secondSlot ? playerById.get(secondSlot.playerId)?.church : undefined}
          showLevel={showLevel}
          isWinner={match.winner === secondSide}
          isLoser={match.winner !== null && !isDrawWinner && match.winner !== secondSide}
          isLocked={isLocked}
          canScore={canScore}
          onPick={() => {
            if (secondSlot && !isLocked && canScore) {
              onPickWinner(match.id, secondSide, secondSlot, drawCount);
            }
          }}
        />
      </div>

      {!isLocked && drawCount > 0 && (
        <div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg">
            Draw x{drawCount} - replay, swap colors
          </span>
        </div>
      )}

      {allowsDraw && canScore && !isLocked && !match.bye && (
        <button
          type="button"
          onClick={() => onPickDraw(match)}
          className="w-full min-h-[34px] px-3 py-1 rounded-lg border border-edge bg-transparent hover:bg-surface text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
        >
          Draw
        </button>
      )}
    </div>
  );
}

function PlaceholderMatchCard({
  matchNumber,
  isBye,
}: {
  matchNumber: number;
  isBye?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-edge bg-surface/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 min-h-[20px]">
        <span className="text-xs font-medium text-fg-muted tabular-nums">
          Match {matchNumber}
        </span>
        {isBye && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-nested border border-edge text-fg-muted">
            Bye
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="min-h-[44px] px-3 py-2 rounded-lg border border-dashed border-edge bg-nested flex items-center text-sm font-medium text-fg-muted">
          TBD
        </div>
        <div className="min-h-[44px] px-3 py-2 rounded-lg border border-dashed border-edge bg-nested flex items-center justify-between text-sm font-medium text-fg-muted">
          <span>{isBye ? 'Bye' : 'TBD'}</span>
        </div>
      </div>
    </div>
  );
}

export function BracketView({
  game,
  players,
  bracket,
  gamePairs = null,
  division = null,
  group = 'main',
  role,
  focusTarget,
  navKey,
  onShowToast,
}: BracketViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [makePairsOpen, setMakePairsOpen] = useState(false);
  const [remakeConfirmOpen, setRemakeConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [pendingDecision, setPendingDecision] =
    useState<PendingMatchDecision | null>(null);
  const [confirmingDecision, setConfirmingDecision] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<PendingUndoRequest | null>(null);
  const [undoingMatchId, setUndoingMatchId] = useState<string | null>(null);
  const [pickingChampionId, setPickingChampionId] = useState<string | null>(null);

  const [resetScoresConfirm, setResetScoresConfirm] = useState<{
    count: number;
    expectedVersion: number;
  } | null>(null);
  const [resetScoresCountdown, setResetScoresCountdown] = useState(0);
  const [resettingScores, setResettingScores] = useState(false);

  const [restoreBackupConfirm, setRestoreBackupConfirm] = useState<{
    at: number;
    by: string;
    expectedVersion: number;
  } | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);

  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [rrTab, setRrTab] = useState<'standings' | 'matchdays'>('standings');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [viewedElimRound, setViewedElimRound] = useState<number>(() => {
    if (!bracket || bracket.matches.length === 0) return 1;
    const roundNums = Array.from(new Set(bracket.matches.map((m) => m.round))).sort(
      (a, b) => a - b
    );
    const active = roundNums.find((r) =>
      bracket.matches.filter((m) => m.round === r).some((m) => m.winner === null)
    );
    return active ?? roundNums[roundNums.length - 1] ?? 1;
  });
  const [animatedNewRound, setAnimatedNewRound] = useState<number | null>(null);

  const activeDivision = game.hasDivisions ? division : null;
  const effectiveGroup: BracketGroup =
    game.type === 'individual' ? group : 'main';
  const bracketDocId = getBracketDocId(game.id, activeDivision, effectiveGroup);
  const pairingMode = getGamePairingMode(game);
  const divisionMeta = activeDivision
    ? DIVISION_LEVELS.find((d) => d.level === activeDivision) ?? null
    : null;

  const bracketSessionKey = bracket
    ? `${bracketDocId}:${bracket.createdAt}`
    : bracketDocId;
  const prevBracketKeyRef = useRef<string>(bracketSessionKey);
  const prevHighestRoundRef = useRef<number>(0);
  const prevConfettiKeyRef = useRef<string>(bracketSessionKey);
  const prevConfettiStatusRef = useRef<Bracket['status'] | null>(bracket?.status ?? null);
  const suppressNextConfettiRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const championBannerRef = useRef<HTMLDivElement | null>(null);
  const appliedFocusKeyRef = useRef<string | null>(null);
  const [pulsingMatchId, setPulsingMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!resetScoresConfirm || resetScoresCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setResetScoresCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resetScoresConfirm, resetScoresCountdown]);

  useEffect(() => {
    const currentStatus = bracket?.status ?? null;
    if (prevConfettiKeyRef.current !== bracketSessionKey) {
      prevConfettiKeyRef.current = bracketSessionKey;
      prevConfettiStatusRef.current = currentStatus;
      suppressNextConfettiRef.current = false;
      return;
    }

    const prevStatus = prevConfettiStatusRef.current;
    prevConfettiStatusRef.current = currentStatus;

    if (
      prevStatus === 'active' &&
      currentStatus === 'complete' &&
      bracket?.championTeam
    ) {
      if (suppressNextConfettiRef.current) {
        suppressNextConfettiRef.current = false;
        return;
      }
      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) return;

      const colors =
        bracket.championTeam === 'blue'
          ? ['#3B82F6', '#93C5FD', '#F1F5F9']
          : ['#EF4444', '#FCA5A5', '#F1F5F9'];
      void confetti({
        particleCount: 70,
        spread: 65,
        origin: { y: 0.65 },
        colors,
        disableForReducedMotion: true,
      });
    } else if (currentStatus !== 'complete') {
      suppressNextConfettiRef.current = false;
    }
  }, [bracketSessionKey, bracket?.status, bracket?.championTeam]);

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players]
  );

  const summary = useMemo(
    () =>
      getGameParticipantsSummary(game.id, players, {
        division: activeDivision,
        usesSkillLevel: game.usesSkillLevel,
        group: effectiveGroup,
      }),
    [game.id, game.usesSkillLevel, players, activeDivision, effectiveGroup]
  );

  const minPlayersError = useMemo(
    () => getTeamMinPlayersError(game, summary.blue.length, summary.red.length),
    [game, summary.blue.length, summary.red.length]
  );

  const rounds = useMemo(() => {
    if (!bracket) return [];
    const grouped = new Map<number, BracketMatch[]>();
    for (const m of bracket.matches) {
      const list = grouped.get(m.round);
      if (list) list.push(m);
      else grouped.set(m.round, [m]);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, matches]) => ({
        round,
        matches,
        decidedCount: matches.filter((m) => m.winner !== null).length,
        isComplete: matches.every((m) => m.winner !== null),
      }));
  }, [bracket]);

  // Elimination columns: generated rounds + future TBD placeholder rounds
  const eliminationColumns = useMemo<EliminationColumnItem[]>(() => {
    if (!bracket || bracket.format !== 'elimination' || rounds.length === 0) {
      return [];
    }

    const cols: EliminationColumnItem[] = rounds.map((r) => ({
      round: r.round,
      title: getEliminationRoundTitle(r.round, r.matches.length),
      isPlaceholder: false,
      matches: r.matches,
      decidedCount: r.decidedCount,
      isComplete: r.isComplete,
      placeholderPlayableCount: 0,
      placeholderHasBye: false,
    }));

    if (bracket.status === 'active') {
      let survivors = rounds[rounds.length - 1].matches.length;
      let nextRound = rounds[rounds.length - 1].round + 1;
      while (survivors > 1) {
        const playableCount = Math.floor(survivors / 2);
        const hasBye = survivors % 2 === 1;
        const cardCount = playableCount + (hasBye ? 1 : 0);
        cols.push({
          round: nextRound,
          title: getEliminationRoundTitle(nextRound, cardCount),
          isPlaceholder: true,
          matches: [],
          decidedCount: 0,
          isComplete: false,
          placeholderPlayableCount: playableCount,
          placeholderHasBye: hasBye,
        });
        survivors = Math.ceil(survivors / 2);
        nextRound += 1;
      }
    }

    return cols;
  }, [bracket, rounds]);

  const highestRound = rounds.length > 0 ? rounds[rounds.length - 1].round : 0;

  const scrollToEliminationRound = useCallback((roundNum: number, instant = false) => {
    const container = scrollContainerRef.current;
    const colEl = columnRefs.current[roundNum];
    if (!container || !colEl) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollTo({
      left: Math.max(0, colEl.offsetLeft - container.offsetLeft),
      behavior: instant || prefersReduced ? 'auto' : 'smooth',
    });
    setViewedElimRound(roundNum);
  }, []);

  // Reset UI overrides when switching games, divisions, or recreating a bracket
  useEffect(() => {
    if (prevBracketKeyRef.current !== bracketSessionKey) {
      prevBracketKeyRef.current = bracketSessionKey;
      prevHighestRoundRef.current = highestRound;
      const activeRound =
        rounds.find((r) => !r.isComplete)?.round ?? highestRound ?? 1;
      setSummaryCollapsed(false);
      setRrTab(
        focusTarget === 'ongoing' &&
          bracket?.format === 'roundrobin' &&
          bracket.status !== 'complete'
          ? 'matchdays'
          : 'standings'
      );
      setSelectedPlayerId(null);
      setViewedElimRound(activeRound);
      setAnimatedNewRound(null);
      setPendingDecision(null);
      setPendingUndo(null);
      setResetConfirmOpen(false);
      setResetScoresConfirm(null);
      setRestoreBackupConfirm(null);
      if (bracket?.format === 'elimination' && activeRound > 1 && focusTarget !== 'ongoing') {
        window.requestAnimationFrame(() => {
          scrollToEliminationRound(activeRound, true);
        });
      }
    }
  }, [bracketSessionKey, bracket?.format, bracket?.status, focusTarget, highestRound, rounds, scrollToEliminationRound]);

  // Focus ongoing match (or Champion banner if complete) when navigated with focus="ongoing"
  useEffect(() => {
    if (focusTarget !== 'ongoing' || !bracket) return;
    const focusKey = `${bracketSessionKey}:${navKey ?? 0}`;
    if (appliedFocusKeyRef.current === focusKey) return;
    appliedFocusKeyRef.current = focusKey;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth';

    let pulseTimer: number | undefined;
    let rafId: number | undefined;

    if (bracket.status === 'complete') {
      const scrollTimer = window.setTimeout(() => {
        championBannerRef.current?.scrollIntoView({ behavior, block: 'center' });
      }, 60);
      return () => {
        window.clearTimeout(scrollTimer);
      };
    }

    let ongoingMatch: BracketMatch | null = null;
    for (const r of rounds) {
      const found = r.matches.find((m) => m.winner === null && !m.bye);
      if (found) {
        ongoingMatch = found;
        break;
      }
    }

    if (!ongoingMatch) return;

    if (bracket.format === 'roundrobin') {
      setRrTab('matchdays');
      setSelectedPlayerId(null);
    }

    const scrollTimer = window.setTimeout(() => {
      if (bracket.format === 'elimination' && ongoingMatch) {
        scrollToEliminationRound(ongoingMatch.round, true);
      }
      rafId = window.requestAnimationFrame(() => {
        if (!ongoingMatch) return;
        const el = matchRefs.current[ongoingMatch.id];
        if (!el) return;
        el.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
        setPulsingMatchId(ongoingMatch.id);
        pulseTimer = window.setTimeout(() => {
          setPulsingMatchId((cur) => (cur === ongoingMatch?.id ? null : cur));
        }, 2000);
      });
    }, 80);

    return () => {
      window.clearTimeout(scrollTimer);
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      if (pulseTimer !== undefined) window.clearTimeout(pulseTimer);
    };
  }, [focusTarget, navKey, bracket, bracketSessionKey, rounds, scrollToEliminationRound]);

  // Detect newly generated round in single elimination, animate + auto-scroll to it
  useEffect(() => {
    if (
      prevBracketKeyRef.current === bracketSessionKey &&
      prevHighestRoundRef.current > 0 &&
      highestRound > prevHighestRoundRef.current
    ) {
      setAnimatedNewRound(highestRound);
      setViewedElimRound(highestRound);
      const rafId = window.requestAnimationFrame(() => {
        scrollToEliminationRound(highestRound);
      });
      const timer = window.setTimeout(() => {
        setAnimatedNewRound(null);
      }, 450);
      prevHighestRoundRef.current = highestRound;
      return () => {
        window.cancelAnimationFrame(rafId);
        window.clearTimeout(timer);
      };
    }
    if (
      prevBracketKeyRef.current === bracketSessionKey &&
      prevHighestRoundRef.current > 0 &&
      highestRound > 0 &&
      highestRound < prevHighestRoundRef.current
    ) {
      setAnimatedNewRound(null);
      setViewedElimRound(highestRound);
      const rafId = window.requestAnimationFrame(() => {
        scrollToEliminationRound(highestRound);
      });
      prevHighestRoundRef.current = highestRound;
      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }
    prevHighestRoundRef.current = highestRound;
  }, [bracketSessionKey, highestRound, scrollToEliminationRound]);

  const standings = useMemo(
    () =>
      bracket && bracket.format === 'roundrobin'
        ? computeRoundRobinStandings(bracket)
        : [],
    [bracket]
  );

  const tiedLeaders = useMemo(
    () => (bracket ? getRoundRobinTiedLeaders(bracket) : []),
    [bracket]
  );

  // Global 1-based match numbers for Round Robin so Matchdays & Player Matches match
  const roundRobinMatchNumberById = useMemo(() => {
    const map = new Map<string, number>();
    if (!bracket || bracket.format !== 'roundrobin') return map;
    let counter = 1;
    for (const r of rounds) {
      for (const m of r.matches) {
        map.set(m.id, counter++);
      }
    }
    return map;
  }, [bracket, rounds]);

  const canScore = role === 'admin' || role === 'scorer';
  const isAdmin = role === 'admin';
  const isPairsGame = game.type === 'pairs';
  const showLevelChip = game.usesSkillLevel;
  const allowsDraw =
    Boolean(game.allowsDraw) && !isPairsGame && bracket?.format !== 'teammatch';

  const rosterChanged = useMemo(
    () =>
      isPairsGame && gamePairs
        ? hasPairsRosterChanged(gamePairs, game.id, players)
        : false,
    [isPairsGame, gamePairs, game.id, players]
  );

  const pairsSection =
    isPairsGame && gamePairs ? (
      <section className="bg-surface border border-edge rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="text-sm font-semibold text-fg">
              Pairs ({gamePairs.pairs.length})
            </h3>
            {rosterChanged && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg">
                <AlertTriangle size={12} className="shrink-0" />
                <span>Roster changed - re-make pairs</span>
              </span>
            )}
          </div>
          {isAdmin &&
            (!bracket ? (
              <button
                type="button"
                onClick={() => setRemakeConfirmOpen(true)}
                className="min-h-[36px] px-3 py-1 rounded-xl border border-edge bg-transparent hover:bg-nested text-xs font-medium text-fg transition-colors duration-150 shrink-0"
              >
                Re-make pairs
              </button>
            ) : (
              <span className="text-xs text-fg-muted">
                Reset the bracket first to change pairs
              </span>
            ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['blue', 'red'] as const).map((team) => {
            const isBlue = team === 'blue';
            const teamPairs = gamePairs.pairs.filter((p) => p.team === team);
            const teamUnpaired = gamePairs.unpaired.filter((u) => u.team === team);
            return (
              <div
                key={team}
                className="rounded-xl border border-edge bg-nested p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isBlue ? 'bg-blue-team' : 'bg-red-team'
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-xs font-semibold ${
                        isBlue ? 'text-blue-light' : 'text-red-light'
                      }`}
                    >
                      {isBlue ? 'Blue' : 'Red'}
                    </span>
                  </div>
                  <span className="text-xs text-fg-muted tabular-nums">
                    {teamPairs.length} {teamPairs.length === 1 ? 'pair' : 'pairs'}
                  </span>
                </div>

                <ul className="space-y-1.5">
                  {teamPairs.map((pair) => (
                    <li
                      key={pair.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface border border-edge"
                    >
                      <span className="text-xs font-medium break-words leading-snug min-w-0 flex-1 inline-flex flex-wrap items-center gap-1">
                        {pair.members.map((m, idx) => {
                          const liveMember = playerById.get(m.playerId);
                          return (
                            <span key={m.playerId} className="inline-flex items-center gap-1">
                              {idx > 0 && <span className="text-fg-muted">&amp;</span>}
                              <PlayerNameWithChurch
                                name={liveMember?.name ?? m.name}
                                church={liveMember?.church}
                                className={
                                  m.withdrawn ? 'text-fg-muted line-through' : 'text-fg'
                                }
                              />
                              {m.withdrawn && (
                                <span className="inline-flex items-center px-1 py-0.2 rounded text-[10px] font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg">
                                  Withdrawn
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </span>
                      {showLevelChip && (
                        <span
                          title={`Combined level ${pair.combined}`}
                          className="px-1.5 py-0.5 rounded bg-nested border border-edge text-[11px] font-medium text-fg tabular-nums shrink-0"
                        >
                          L{pair.combined}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {teamUnpaired.length > 0 && (
                  <p className="text-[11px] text-fg-muted leading-snug break-words">
                    No partner:{' '}
                    {teamUnpaired.map((u, idx) => {
                      const liveUnpaired = playerById.get(u.playerId);
                      return (
                        <span key={u.playerId}>
                          {idx > 0 && ', '}
                          <PlayerNameWithChurch
                            name={liveUnpaired?.name ?? u.name}
                            church={liveUnpaired?.church}
                          />
                        </span>
                      );
                    })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const pairsModals = isPairsGame ? (
    <>
      <MakePairsModal
        open={makePairsOpen}
        game={game}
        players={players}
        onClose={() => setMakePairsOpen(false)}
        onShowToast={onShowToast}
      />

      {remakeConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remake-pairs-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div>
              <h2
                id="remake-pairs-title"
                className="text-[16px] font-semibold text-fg"
              >
                Re-make pairs?
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                Regenerate Blue and Red pairs for {game.name}. Existing pairs will be
                replaced when you confirm.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRemakeConfirmOpen(false)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemakeConfirmOpen(false);
                  setMakePairsOpen(true);
                }}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  ) : null;

  // Empty states when no bracket exists
  if (!bracket) {
    if (isPairsGame && !gamePairs) {
      return (
        <>
          <div className="bg-surface border border-edge rounded-xl p-5 text-center space-y-4">
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="p-3 rounded-xl border border-blue-edge bg-blue-tint">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                  <span className="text-xs font-semibold text-blue-light">Blue</span>
                </div>
                <p className="text-base font-semibold text-fg tabular-nums mt-0.5">
                  {summary.blue.length}{' '}
                  <span className="text-xs font-normal text-fg-muted">
                    {summary.blue.length === 1 ? 'player' : 'players'}
                  </span>
                </p>
              </div>
              <div className="p-3 rounded-xl border border-red-edge bg-red-tint">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                  <span className="text-xs font-semibold text-red-light">Red</span>
                </div>
                <p className="text-base font-semibold text-fg tabular-nums mt-0.5">
                  {summary.red.length}{' '}
                  <span className="text-xs font-normal text-fg-muted">
                    {summary.red.length === 1 ? 'player' : 'players'}
                  </span>
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-fg">No pairs yet</p>
              <p className="text-xs text-fg-muted mt-1">
                {isAdmin
                  ? 'Pair up assigned Blue and Red players before creating a bracket.'
                  : 'Waiting for an Admin to make pairs.'}
              </p>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setMakePairsOpen(true)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 inline-flex items-center justify-center"
              >
                Make pairs
              </button>
            )}
          </div>

          {pairsModals}
        </>
      );
    }

    const createBlockedByMin = Boolean(minPlayersError);

    return (
      <>
        <div className="space-y-4">
          {pairsSection}

          <div className="bg-surface border border-edge rounded-xl p-5 text-center space-y-4">
            {(divisionMeta || effectiveGroup === 'backup') && (
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="p-3 rounded-xl border border-blue-edge bg-blue-tint">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-team" aria-hidden="true" />
                    <span className="text-xs font-semibold text-blue-light">Blue</span>
                  </div>
                  <p className="text-base font-semibold text-fg tabular-nums mt-0.5">
                    {summary.blue.length}{' '}
                    <span className="text-xs font-normal text-fg-muted">
                      {summary.blue.length === 1 ? 'player' : 'players'}
                    </span>
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-red-edge bg-red-tint">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-team" aria-hidden="true" />
                    <span className="text-xs font-semibold text-red-light">Red</span>
                  </div>
                  <p className="text-base font-semibold text-fg tabular-nums mt-0.5">
                    {summary.red.length}{' '}
                    <span className="text-xs font-normal text-fg-muted">
                      {summary.red.length === 1 ? 'player' : 'players'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-fg">
                {effectiveGroup === 'backup'
                  ? divisionMeta
                    ? `No ${divisionMeta.label} backup bracket yet`
                    : 'No backup bracket yet'
                  : divisionMeta
                    ? `No ${divisionMeta.label} bracket yet`
                    : 'No bracket yet'}
              </p>
              <p className="text-xs text-fg-muted mt-1">
                {isAdmin
                  ? isPairsGame
                    ? 'Create a match bracket from the confirmed Blue and Red pairs.'
                    : effectiveGroup === 'backup'
                      ? 'Create a match bracket from assigned Blue and Red backup players.'
                      : 'Create a match bracket from assigned Blue and Red players.'
                  : 'Waiting for an Admin to create the bracket.'}
              </p>
            </div>

            {minPlayersError && (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-status-amber-edge bg-status-amber-bg text-status-amber-fg text-left">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-relaxed">{minPlayersError}</p>
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                disabled={createBlockedByMin}
                onClick={() => setCreateOpen(true)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-45 disabled:cursor-not-allowed"
              >
                Create bracket
              </button>
            )}
          </div>
        </div>

        <CreateBracketModal
          open={createOpen}
          game={game}
          players={players}
          gamePairs={gamePairs}
          division={activeDivision}
          group={effectiveGroup}
          onClose={() => setCreateOpen(false)}
          onShowToast={onShowToast}
        />

        {pairsModals}
      </>
    );
  }

  const currentRoundObj =
    rounds.find((r) => !r.isComplete) ?? rounds[rounds.length - 1] ?? null;

  const advancingWinners: BracketSlotSnapshot[] =
    bracket.format === 'elimination' &&
    bracket.status === 'active' &&
    currentRoundObj
      ? currentRoundObj.matches
          .filter((m) => m.winner !== null)
          .map((m) => (m.winner === 'a' ? m.a! : m.b!))
      : [];

  // Summary card counts
  const uniqueParticipantIds = new Set<string>();
  for (const m of bracket.matches) {
    if (m.a) uniqueParticipantIds.add(m.a.playerId);
    if (m.b) uniqueParticipantIds.add(m.b.playerId);
  }
  const summaryPlayerCount =
    bracket.format === 'teammatch'
      ? summary.blue.length + summary.red.length
      : uniqueParticipantIds.size;

  const summaryMatchCount =
    bracket.format === 'elimination'
      ? eliminationColumns.reduce(
          (acc, col) =>
            acc +
            (col.isPlaceholder
              ? col.placeholderPlayableCount + (col.placeholderHasBye ? 1 : 0)
              : col.matches.length),
          0
        )
      : bracket.matches.length;

  const summaryFormatLabel =
    bracket.format === 'elimination'
      ? 'Single elimination'
      : bracket.format === 'roundrobin'
        ? 'Round robin'
        : 'Single match';

  const summaryTitle = divisionMeta ? `${game.name} · ${divisionMeta.label}` : game.name;
  const createdDateStr = formatCreatedDate(bracket.createdAt);

  // Round Robin: selected player details for Player Matches page
  const selectedPlayerStanding =
    bracket.format === 'roundrobin' && selectedPlayerId
      ? standings.find((s) => s.player.playerId === selectedPlayerId) ?? null
      : null;

  const selectedPlayerMatchdays =
    bracket.format === 'roundrobin' && selectedPlayerId
      ? rounds
          .map((r) => ({
            round: r.round,
            matches: r.matches.filter(
              (m) =>
                m.a?.playerId === selectedPlayerId || m.b?.playerId === selectedPlayerId
            ),
          }))
          .filter((r) => r.matches.length > 0)
      : [];

  const selectedPlayerMatchCount = selectedPlayerMatchdays.reduce(
    (sum, r) => sum + r.matches.length,
    0
  );

  const resettableResultCount = countResettableResults(bracket);
  const currentBracketVersion = bracket.updatedAt ?? bracket.createdAt;

  async function handleConfirmDecision() {
    if (!pendingDecision || confirmingDecision) return;
    setConfirmingDecision(true);
    try {
      const actor = role === 'admin' ? 'Admin' : 'Scorer';
      if (pendingDecision.kind === 'draw') {
        await recordBracketDraw(bracketDocId, pendingDecision.matchId, actor, {
          drawCount: pendingDecision.drawCount,
        });
      } else {
        await decideBracketMatch(
          bracketDocId,
          pendingDecision.matchId,
          pendingDecision.side,
          actor,
          pairingMode,
          { drawCount: pendingDecision.drawCount }
        );
      }
      setPendingDecision(null);
    } catch (err) {
      if (err instanceof AlreadyDecidedError) {
        onShowToast('error', 'Already decided by another scorer');
        setPendingDecision(null);
      } else if (err instanceof StaleBracketError) {
        onShowToast('error', 'Already updated, refresh');
        setPendingDecision(null);
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Failed to save match result.'
        );
      }
    } finally {
      setConfirmingDecision(false);
    }
  }

  function requestUndo(matchId: string) {
    if (!canScore || undoingMatchId || !bracket) return;
    const impact = getEliminationUndoImpact(bracket, matchId);
    setPendingUndo({
      matchId,
      laterRounds: impact.laterRounds,
      laterDecidedCount: impact.laterDecidedCount,
      expectedVersion: currentBracketVersion,
    });
  }

  async function handleConfirmUndo() {
    if (!canScore || !pendingUndo || undoingMatchId) return;
    setUndoingMatchId(pendingUndo.matchId);
    try {
      await undoBracketMatch(
        bracketDocId,
        pendingUndo.matchId,
        pendingUndo.expectedVersion
      );
      setPendingUndo(null);
      onShowToast('success', 'Match result undone.');
    } catch (err) {
      if (err instanceof StaleBracketError) {
        setPendingUndo(null);
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Could not undo match.'
        );
      }
    } finally {
      setUndoingMatchId(null);
    }
  }

  async function handleUndoDraw(matchId: string) {
    if (!canScore || undoingMatchId) return;
    setUndoingMatchId(matchId);
    try {
      await undoEliminationDraw(bracketDocId, matchId, currentBracketVersion);
      onShowToast('success', 'Draw undone.');
    } catch (err) {
      if (err instanceof StaleBracketError) {
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Could not undo draw.'
        );
      }
    } finally {
      setUndoingMatchId(null);
    }
  }

  function openResetScoresConfirm() {
    if (!canScore || resettableResultCount === 0) return;
    setResetScoresCountdown(3);
    setResetScoresConfirm({
      count: resettableResultCount,
      expectedVersion: currentBracketVersion,
    });
  }

  async function handleConfirmResetScores() {
    if (!canScore || !resetScoresConfirm || resetScoresCountdown > 0 || resettingScores) {
      return;
    }
    setResettingScores(true);
    try {
      const actor = role === 'admin' ? 'Admin' : 'Scorer';
      await resetBracketScores(
        bracketDocId,
        actor,
        resetScoresConfirm.expectedVersion
      );
      setResetScoresConfirm(null);
      onShowToast('success', 'Scores reset');
    } catch (err) {
      if (err instanceof StaleBracketError) {
        setResetScoresConfirm(null);
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Failed to reset scores.'
        );
      }
    } finally {
      setResettingScores(false);
    }
  }

  function openRestoreBackupConfirm() {
    if (!isAdmin || !bracket?.backup) return;
    setRestoreBackupConfirm({
      at: bracket.backup.at,
      by: bracket.backup.by,
      expectedVersion: currentBracketVersion,
    });
  }

  async function handleConfirmRestoreBackup() {
    if (!isAdmin || !restoreBackupConfirm || restoringBackup) return;
    setRestoringBackup(true);
    suppressNextConfettiRef.current = true;
    try {
      await restoreBracketBackup(
        bracketDocId,
        restoreBackupConfirm.expectedVersion
      );
      setRestoreBackupConfirm(null);
      onShowToast('success', 'Scores restored.');
    } catch (err) {
      suppressNextConfettiRef.current = false;
      if (err instanceof StaleBracketError) {
        setRestoreBackupConfirm(null);
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Failed to restore scores.'
        );
      }
    } finally {
      setRestoringBackup(false);
    }
  }

  async function handlePickTieChampion(player: BracketSlotSnapshot) {
    if (!isAdmin || pickingChampionId) return;
    setPickingChampionId(player.playerId);
    try {
      await pickBracketChampion(bracketDocId, player, currentBracketVersion);
      onShowToast('success', `${player.name} named champion.`);
    } catch (err) {
      if (err instanceof StaleBracketError) {
        onShowToast('error', 'Already updated, refresh');
      } else {
        onShowToast(
          'error',
          err instanceof Error ? err.message : 'Failed to pick champion.'
        );
      }
    } finally {
      setPickingChampionId(null);
    }
  }

  async function handleResetBracket() {
    if (!isAdmin || resetting) return;
    setResetting(true);
    try {
      await deleteBracket(bracketDocId);
      setResetConfirmOpen(false);
      onShowToast('success', 'Bracket deleted.');
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : 'Failed to reset bracket.'
      );
    } finally {
      setResetting(false);
    }
  }

  function openPlayerMatches(playerId: string) {
    setSelectedPlayerId(playerId);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function handleEliminationScroll() {
    const container = scrollContainerRef.current;
    if (!container || eliminationColumns.length === 0) return;
    const scrollLeft = container.scrollLeft;
    let closestRound = eliminationColumns[0].round;
    let smallestDist = Infinity;
    for (const col of eliminationColumns) {
      const el = columnRefs.current[col.round];
      if (!el) continue;
      const dist = Math.abs(el.offsetLeft - container.offsetLeft - scrollLeft);
      if (dist < smallestDist) {
        smallestDist = dist;
        closestRound = col.round;
      }
    }
    setViewedElimRound(closestRound);
  }

  const maxStandingsPts = standings[0]?.pts ?? 0;

  // Confirm Winner / Draw, Undo, Reset Scores, Restore Backup & Reset Bracket Modals
  const sharedModals = (
    <>
      {pendingDecision && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-winner-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="confirm-winner-title"
                  className="text-[16px] font-semibold text-fg break-words"
                >
                  {pendingDecision.kind === 'draw'
                    ? 'Record a draw?'
                    : `${pendingDecision.slot.name} wins?`}
                </h2>
                {pendingDecision.kind === 'draw' ? (
                  <p className="text-xs text-fg-muted mt-1 break-words">
                    {pendingDecision.match.a?.name ?? 'Player A'} vs{' '}
                    {pendingDecision.match.b?.name ?? 'Player B'}
                  </p>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        pendingDecision.slot.team === 'blue'
                          ? 'bg-blue-team'
                          : 'bg-red-team'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="text-xs text-fg-muted">
                      {pendingDecision.slot.team === 'blue' ? 'Blue Team' : 'Red Team'}
                      {pendingDecision.slot.dept ? ` · ${pendingDecision.slot.dept}` : ''}
                      {showLevelChip && pendingDecision.slot.level !== null
                        ? ` · L${pendingDecision.slot.level}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={confirmingDecision}
                onClick={() => setPendingDecision(null)}
                aria-label="Close"
                className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={confirmingDecision}
                onClick={() => setPendingDecision(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmingDecision}
                onClick={() => void handleConfirmDecision()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                {confirmingDecision ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUndo && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="undo-match-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div>
              {pendingUndo.laterDecidedCount > 0 ? (
                <>
                  <h2
                    id="undo-match-title"
                    className="text-[16px] font-semibold text-fg"
                  >
                    Undo and clear later rounds?
                  </h2>
                  <p className="text-sm text-fg-muted mt-1">
                    Undoing this also clears{' '}
                    {pendingUndo.laterRounds.length === 1
                      ? `Round ${pendingUndo.laterRounds[0]}`
                      : `Rounds ${pendingUndo.laterRounds.join(', ')}`}{' '}
                    ({pendingUndo.laterDecidedCount} decided{' '}
                    {pendingUndo.laterDecidedCount === 1 ? 'match' : 'matches'}).
                    Continue?
                  </p>
                </>
              ) : (
                <h2
                  id="undo-match-title"
                  className="text-[16px] font-semibold text-fg"
                >
                  Undo this result?
                </h2>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={undoingMatchId !== null}
                onClick={() => setPendingUndo(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              {pendingUndo.laterDecidedCount > 0 ? (
                <button
                  type="button"
                  disabled={undoingMatchId !== null}
                  onClick={() => void handleConfirmUndo()}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-red-tint border border-red-edge text-red-light text-sm font-medium hover:bg-red-team/25 transition-colors duration-150 disabled:opacity-50"
                >
                  {undoingMatchId ? 'Undoing...' : 'Undo and clear'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={undoingMatchId !== null}
                  onClick={() => void handleConfirmUndo()}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
                >
                  {undoingMatchId ? 'Undoing...' : 'Undo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {resetScoresConfirm && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-scores-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div>
              <h2
                id="reset-scores-title"
                className="text-[16px] font-semibold text-fg"
              >
                Reset scores?
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                Reset all scores for {summaryTitle}? {resetScoresConfirm.count}{' '}
                {resetScoresConfirm.count === 1 ? 'result' : 'results'} will be
                cleared. The bracket and pairings stay.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={resettingScores}
                onClick={() => setResetScoresConfirm(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetScoresCountdown > 0 || resettingScores}
                onClick={() => void handleConfirmResetScores()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-red-tint border border-red-edge text-red-light text-sm font-medium hover:bg-red-team/25 transition-colors duration-150 disabled:opacity-50"
              >
                {resettingScores
                  ? 'Resetting...'
                  : resetScoresCountdown > 0
                    ? `Reset (${resetScoresCountdown})`
                    : 'Reset scores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreBackupConfirm && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-backup-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div>
              <h2
                id="restore-backup-title"
                className="text-[16px] font-semibold text-fg"
              >
                Restore scores from {formatBackupTime(restoreBackupConfirm.at)} reset by{' '}
                {restoreBackupConfirm.by}?
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                Anything decided after the reset will be replaced by the restored data.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={restoringBackup}
                onClick={() => setRestoreBackupConfirm(null)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoringBackup}
                onClick={() => void handleConfirmRestoreBackup()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
              >
                {restoringBackup ? 'Restoring...' : 'Restore scores'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-bracket-title"
        >
          <div className="bg-surface w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
            <div>
              <h2
                id="reset-bracket-title"
                className="text-[16px] font-semibold text-fg"
              >
                Reset bracket?
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                This deletes the current bracket and all match results for{' '}
                {divisionMeta ? `${game.name} (${divisionMeta.label})` : game.name}
                {effectiveGroup === 'backup' ? ' (Backup)' : ''}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmOpen(false)}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => void handleResetBracket()}
                className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-red-tint border border-red-edge text-red-light text-sm font-medium hover:bg-red-team/25 transition-colors duration-150 disabled:opacity-50"
              >
                {resetting ? 'Deleting...' : 'Reset bracket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Round Robin "Player matches" subpage (keeps bottom nav visible)
  if (bracket.format === 'roundrobin' && selectedPlayerStanding) {
    const { player, wins, draws, losses, pts } = selectedPlayerStanding;

    return (
      <div className="space-y-4">
        {/* Top bar: circular 44px back button + player name title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedPlayerId(null)}
            aria-label="Back to standings"
            className="w-11 h-11 rounded-full border border-edge bg-surface hover:bg-nested text-fg flex items-center justify-center shrink-0 transition-colors duration-150"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-[20px] font-semibold text-fg leading-snug flex items-center gap-1.5 min-w-0">
            <span className="truncate">{player.name}</span>
            {!isPairsGame && (
              <ChurchMarker church={playerById.get(player.playerId)?.church} />
            )}
          </h2>
        </div>

        {/* Player summary card */}
        <div className="bg-surface border border-edge rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-fg break-words">
              <PlayerNameWithChurch
                name={player.name}
                church={!isPairsGame ? playerById.get(player.playerId)?.church : undefined}
              />
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                  player.team === 'blue'
                    ? 'bg-blue-tint border-blue-edge text-blue-light'
                    : 'bg-red-tint border-red-edge text-red-light'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    player.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                  }`}
                  aria-hidden="true"
                />
                {player.team === 'blue' ? 'Blue Team' : 'Red Team'}
              </span>
              <span className="text-xs text-fg-muted tabular-nums">
                {selectedPlayerMatchCount}{' '}
                {selectedPlayerMatchCount === 1 ? 'match' : 'matches'}
              </span>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-nested border border-edge text-center shrink-0">
            <p className="text-base font-semibold text-fg tabular-nums leading-tight">
              {formatPoints(pts)} pts
            </p>
            <p className="text-[11px] font-medium text-fg-muted tabular-nums mt-0.5">
              {allowsDraw ? `${wins}-${draws}-${losses}` : `${wins}-${losses}`}
            </p>
          </div>
        </div>

        {/* Matches grouped under Matchday N headings */}
        <div className="space-y-4">
          {selectedPlayerMatchdays.map(({ round, matches }) => (
            <section key={round} className="space-y-2">
              <h3 className="text-sm font-semibold text-fg">
                Matchday {round}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    matchNumber={roundRobinMatchNumberById.get(match.id) ?? 1}
                    showLevel={showLevelChip}
                    showChurch={!isPairsGame}
                    playerById={playerById}
                    allowsDraw={allowsDraw}
                    canScore={canScore}
                    canUndo={canUndoMatch(bracket, match)}
                    undoing={undoingMatchId === match.id}
                    leadPlayerId={player.playerId}
                    onPickWinner={(matchId, side, slot, drawCount) =>
                      setPendingDecision({ kind: 'winner', matchId, side, slot, drawCount })
                    }
                    onPickDraw={(m) =>
                      setPendingDecision({
                        kind: 'draw',
                        matchId: m.id,
                        match: m,
                        drawCount: m.drawCount ?? 0,
                      })
                    }
                    onUndo={requestUndo}
                    onUndoDraw={(matchId) => void handleUndoDraw(matchId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {sharedModals}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pairsSection}

      {/* 1. Collapsible Summary Card */}
      <section className="bg-surface border border-edge rounded-xl p-4">
        <button
          type="button"
          aria-expanded={!summaryCollapsed}
          aria-label={summaryCollapsed ? 'Expand match summary' : 'Collapse match summary'}
          onClick={() => setSummaryCollapsed((prev) => !prev)}
          className="w-full flex items-start justify-between gap-3 text-left"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-[20px] font-semibold text-fg leading-snug break-words">
              {summaryTitle}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  bracket.status === 'complete'
                    ? 'bg-primary text-primary-fg'
                    : 'bg-nested border border-edge text-fg'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    bracket.status === 'complete' ? 'bg-primary-fg' : 'bg-fg'
                  }`}
                  aria-hidden="true"
                />
                <span>{bracket.status === 'complete' ? 'Complete' : 'In Progress'}</span>
              </span>

              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-nested border border-edge text-fg-muted">
                {summaryFormatLabel}
              </span>

              {(effectiveGroup === 'backup' || bracket.group === 'backup') && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-status-amber-bg border border-status-amber-edge text-status-amber-fg">
                  Backup bracket
                </span>
              )}
            </div>
          </div>

          <span className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-fg-muted shrink-0">
            {summaryCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </span>
        </button>

        {!summaryCollapsed && (
          <div className="mt-3 pt-3 border-t border-edge space-y-2.5">
            {createdDateStr && (
              <p className="text-xs text-fg-muted">{createdDateStr}</p>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-medium text-fg min-w-0">
                <Users size={15} className="text-fg-muted shrink-0" />
                <span className="tabular-nums">
                  {summaryPlayerCount}{' '}
                  {isPairsGame && bracket.format !== 'teammatch'
                    ? summaryPlayerCount === 1
                      ? 'pair'
                      : 'pairs'
                    : summaryPlayerCount === 1
                      ? 'player'
                      : 'players'}{' '}
                  - {summaryMatchCount} {summaryMatchCount === 1 ? 'match' : 'matches'} -{' '}
                  {summaryFormatLabel}
                </span>
              </div>

              {(canScore || isAdmin) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {canScore && resettableResultCount > 0 && (
                    <button
                      type="button"
                      onClick={openResetScoresConfirm}
                      className="min-h-[36px] px-3 py-1.5 rounded-full border border-edge bg-transparent hover:bg-nested text-xs font-medium text-fg inline-flex items-center gap-1.5 transition-colors duration-150 shrink-0"
                    >
                      <RotateCcw size={14} />
                      <span>Reset scores</span>
                    </button>
                  )}
                  {isAdmin && bracket.backup && (
                    <button
                      type="button"
                      onClick={openRestoreBackupConfirm}
                      className="min-h-[36px] px-3 py-1.5 rounded-full border border-edge bg-transparent hover:bg-nested text-xs font-medium text-fg-muted hover:text-fg inline-flex items-center gap-1.5 transition-colors duration-150 shrink-0"
                    >
                      <History size={14} />
                      <span>Restore last reset</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setResetConfirmOpen(true)}
                      className="min-h-[36px] px-3 py-1.5 rounded-full border border-edge bg-transparent hover:bg-red-tint text-xs font-medium text-red-light inline-flex items-center gap-1.5 transition-colors duration-150 shrink-0"
                    >
                      <Trash2 size={14} />
                      <span>Reset bracket</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Champion Banner */}
      {bracket.status === 'complete' &&
        bracket.championName &&
        bracket.championTeam && (
          <div
            ref={championBannerRef}
            className={`rounded-xl border p-4 flex items-center gap-3 ${
              bracket.championTeam === 'blue'
                ? 'bg-blue-tint border-blue-edge'
                : 'bg-red-tint border-red-edge'
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-fg ${
                bracket.championTeam === 'blue' ? 'bg-blue-team' : 'bg-red-team'
              }`}
            >
              <Trophy size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {divisionMeta ? `Champion · ${divisionMeta.label}` : 'Champion'}
              </p>
              <p className="text-[16px] font-semibold text-fg break-words">
                <PlayerNameWithChurch
                  name={bracket.championName}
                  church={
                    !isPairsGame && bracket.format !== 'teammatch'
                      ? (() => {
                          const champId = getBracketChampionPlayerId(bracket);
                          return champId ? playerById.get(champId)?.church : undefined;
                        })()
                      : undefined
                  }
                />
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    bracket.championTeam === 'blue'
                      ? 'bg-blue-team'
                      : 'bg-red-team'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`text-xs font-semibold ${
                    bracket.championTeam === 'blue'
                      ? 'text-blue-light'
                      : 'text-red-light'
                  }`}
                >
                  {bracket.championTeam === 'blue' ? 'Blue Team' : 'Red Team'}
                </span>
              </div>
            </div>
          </div>
        )}

      {/* Tie for first (Round Robin) */}
      {tiedLeaders.length > 1 && (
        <div className="bg-surface border border-status-amber-edge rounded-xl p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-fg">Tie for first</h3>
            <p className="text-xs text-fg-muted mt-0.5">
              {isAdmin
                ? 'Select the champion from the tied leaders below.'
                : 'All matches finished in a tie. Only an Admin can pick the champion.'}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tiedLeaders.map((player) => {
              const busy = pickingChampionId === player.playerId;
              return isAdmin ? (
                <button
                  key={player.playerId}
                  type="button"
                  disabled={pickingChampionId !== null}
                  onClick={() => void handlePickTieChampion(player)}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested hover:border-edge-hover flex items-center justify-between gap-2 text-left transition-colors duration-150 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        player.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                      }`}
                      aria-hidden="true"
                    />
                    <PlayerNameWithChurch
                      name={player.name}
                      church={!isPairsGame ? playerById.get(player.playerId)?.church : undefined}
                      className="text-sm font-medium text-fg break-words"
                    />
                  </div>
                  <span className="text-xs font-semibold text-fg shrink-0">
                    {busy ? 'Saving...' : 'Pick'}
                  </span>
                </button>
              ) : (
                <div
                  key={player.playerId}
                  className="min-h-[44px] px-3 py-2 rounded-xl border border-edge bg-nested flex items-center gap-2"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      player.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                    }`}
                    aria-hidden="true"
                  />
                  <PlayerNameWithChurch
                    name={player.name}
                    church={!isPairsGame ? playerById.get(player.playerId)?.church : undefined}
                    className="text-sm font-medium text-fg break-words"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. SINGLE ELIMINATION VIEW */}
      {bracket.format === 'elimination' && (
        <div className="space-y-3">
          {/* Advancing Strip (current round winners) */}
          {advancingWinners.length > 0 && (
            <div className="bg-surface border border-edge rounded-xl p-3">
              <p className="text-xs font-semibold text-fg-muted mb-2">
                Advancing
              </p>
              <div className="flex flex-wrap gap-1.5">
                {advancingWinners.map((winner) => (
                  <span
                    key={winner.playerId}
                    className="animate-chip-in inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-nested border border-edge text-xs font-medium text-fg"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        winner.team === 'blue' ? 'bg-blue-team' : 'bg-red-team'
                      }`}
                      aria-hidden="true"
                    />
                    <PlayerNameWithChurch
                      name={winner.name}
                      church={!isPairsGame ? playerById.get(winner.playerId)?.church : undefined}
                    />
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sticky round title row */}
          {eliminationColumns.length > 0 && (
            <div className="sticky top-14 z-20 bg-surface border border-edge rounded-xl p-2">
              <div
                className="flex items-center gap-2 overflow-x-auto"
                role="tablist"
                aria-label="Bracket rounds"
              >
                {eliminationColumns.map((col) => {
                  const isViewed = viewedElimRound === col.round;
                  const isLiveRound =
                    bracket.status === 'active' &&
                    currentRoundObj?.round === col.round;

                  return (
                    <button
                      key={col.round}
                      type="button"
                      role="tab"
                      aria-selected={isViewed}
                      onClick={() => scrollToEliminationRound(col.round)}
                      className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors duration-150 shrink-0 ${
                        isViewed
                          ? 'bg-primary text-primary-fg'
                          : isLiveRound
                            ? 'bg-nested border border-fg text-fg'
                            : 'bg-transparent border border-edge text-fg-muted hover:text-fg'
                      }`}
                    >
                      {isLiveRound && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isViewed ? 'bg-primary-fg' : 'bg-fg'
                          }`}
                          aria-hidden="true"
                        />
                      )}
                      <span>{col.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Horizontally scrolling scroll-snap round columns (no connector lines) */}
          <div
            ref={scrollContainerRef}
            onScroll={handleEliminationScroll}
            className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 items-start"
          >
            {eliminationColumns.map((col) => {
              const isCurrentRound =
                bracket.status === 'active' &&
                !col.isPlaceholder &&
                currentRoundObj?.round === col.round;
              const isNewlyGenerated =
                !col.isPlaceholder && animatedNewRound === col.round;

              return (
                <div
                  key={col.round}
                  ref={(el) => {
                    columnRefs.current[col.round] = el;
                  }}
                  className={`snap-start shrink-0 w-[82%] sm:w-[78%] lg:w-[340px] rounded-xl p-3 space-y-3 ${
                    isCurrentRound
                      ? 'bg-surface border-2 border-fg'
                      : col.isPlaceholder
                        ? 'bg-surface/60 border border-edge'
                        : 'bg-surface border border-edge'
                  } ${isNewlyGenerated ? 'animate-round-in' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h3 className="text-sm font-semibold text-fg">
                      {col.title}
                    </h3>
                    {col.isPlaceholder ? (
                      <span className="text-xs font-medium text-fg-muted">
                        Upcoming
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-fg-muted tabular-nums">
                        {col.decidedCount} of {col.matches.length}
                      </span>
                    )}
                  </div>

                  {col.isPlaceholder ? (
                    <div className="space-y-3">
                      {Array.from({ length: col.placeholderPlayableCount }).map(
                        (_, idx) => (
                          <PlaceholderMatchCard
                            key={`p_${col.round}_${idx + 1}`}
                            matchNumber={idx + 1}
                          />
                        )
                      )}
                      {col.placeholderHasBye && (
                        <PlaceholderMatchCard
                          key={`p_${col.round}_bye`}
                          matchNumber={col.placeholderPlayableCount + 1}
                          isBye
                        />
                      )}
                      <p className="text-xs text-fg-muted text-center pt-1">
                        Pairings are set when the previous round finishes
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {col.matches.map((match, idx) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          matchNumber={idx + 1}
                          showLevel={showLevelChip}
                          showChurch={!isPairsGame}
                          playerById={playerById}
                          allowsDraw={allowsDraw}
                          canScore={canScore}
                          canUndo={canUndoMatch(bracket, match)}
                          undoing={undoingMatchId === match.id}
                          isPulsing={pulsingMatchId === match.id}
                          cardRef={(el) => {
                            matchRefs.current[match.id] = el;
                          }}
                          onPickWinner={(matchId, side, slot, drawCount) =>
                            setPendingDecision({ kind: 'winner', matchId, side, slot, drawCount })
                          }
                          onPickDraw={(m) =>
                            setPendingDecision({
                              kind: 'draw',
                              matchId: m.id,
                              match: m,
                              drawCount: m.drawCount ?? 0,
                            })
                          }
                          onUndo={requestUndo}
                          onUndoDraw={(matchId) => void handleUndoDraw(matchId)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. ROUND ROBIN VIEW */}
      {bracket.format === 'roundrobin' && (
        <div className="space-y-4">
          {/* Segmented Control: Standings | Matchdays */}
          <div
            role="tablist"
            aria-label="Round robin view"
            className="grid grid-cols-2 p-1 rounded-xl bg-surface border border-edge"
          >
            <button
              type="button"
              role="tab"
              aria-selected={rrTab === 'standings'}
              onClick={() => setRrTab('standings')}
              className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors duration-150 ${
                rrTab === 'standings'
                  ? 'bg-primary text-primary-fg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Standings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rrTab === 'matchdays'}
              onClick={() => setRrTab('matchdays')}
              className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors duration-150 ${
                rrTab === 'matchdays'
                  ? 'bg-primary text-primary-fg'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              Matchdays
            </button>
          </div>

          {rrTab === 'standings' ? (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted px-0.5">
                Tap a player to see their matches
              </p>

              <div className="bg-surface border border-edge rounded-xl overflow-x-clip">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-edge text-xs font-semibold text-fg-muted">
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 pl-3 pr-1.5 w-8 first:rounded-tl-xl">
                        #
                      </th>
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 px-1.5">
                        Player
                      </th>
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 px-1.5 text-right w-8">
                        P
                      </th>
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 px-1.5 text-right w-8">
                        W
                      </th>
                      {allowsDraw && (
                        <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 px-1.5 text-right w-8">
                          D
                        </th>
                      )}
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 px-1.5 text-right w-8">
                        L
                      </th>
                      <th className="sticky top-14 z-10 bg-surface border-b border-edge py-2.5 pl-1.5 pr-3 text-right w-11 last:rounded-tr-xl">
                        Pts
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {standings.map((row, idx) => {
                      const played = row.wins + row.draws + row.losses;
                      const isLeader = maxStandingsPts > 0 && row.pts === maxStandingsPts;

                      return (
                        <tr
                          key={row.player.playerId}
                          onClick={() => openPlayerMatches(row.player.playerId)}
                          className={`text-sm cursor-pointer transition-colors duration-150 hover:bg-nested ${
                            isLeader ? 'bg-nested' : 'bg-surface'
                          }`}
                        >
                          <td
                            className={`py-3 pl-3 pr-1.5 tabular-nums text-xs ${
                              isLeader
                                ? 'font-semibold text-fg border-l-2 border-l-fg'
                                : 'font-medium text-fg-muted'
                            }`}
                          >
                            {idx + 1}
                          </td>
                          <td className="py-3 px-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPlayerMatches(row.player.playerId);
                              }}
                              className="w-full flex items-center justify-between gap-2 text-left min-w-0"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    row.player.team === 'blue'
                                      ? 'bg-blue-team'
                                      : 'bg-red-team'
                                  }`}
                                  aria-label={
                                    row.player.team === 'blue' ? 'Blue team' : 'Red team'
                                  }
                                />
                                <PlayerNameWithChurch
                                  name={row.player.name}
                                  church={
                                    !isPairsGame
                                      ? playerById.get(row.player.playerId)?.church
                                      : undefined
                                  }
                                  className={`break-words ${
                                    isLeader
                                      ? 'font-semibold text-fg'
                                      : 'font-medium text-fg'
                                  }`}
                                />
                              </span>
                              <ChevronRight
                                size={16}
                                className="text-fg-muted shrink-0"
                                aria-hidden="true"
                              />
                            </button>
                          </td>
                          <td className="py-3 px-1.5 text-right text-fg-muted tabular-nums">
                            {played}
                          </td>
                          <td className="py-3 px-1.5 text-right text-fg tabular-nums">
                            {row.wins}
                          </td>
                          {allowsDraw && (
                            <td className="py-3 px-1.5 text-right text-fg-muted tabular-nums">
                              {row.draws}
                            </td>
                          )}
                          <td className="py-3 px-1.5 text-right text-fg-muted tabular-nums">
                            {row.losses}
                          </td>
                          <td className="py-3 pl-1.5 pr-3 text-right font-semibold text-fg tabular-nums">
                            {formatPoints(row.pts)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {rounds.map(({ round, matches }) => (
                <section key={round} className="space-y-2">
                  <h3 className="text-sm font-semibold text-fg">
                    Matchday {round}
                  </h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {matches.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        matchNumber={roundRobinMatchNumberById.get(match.id) ?? 1}
                        showLevel={showLevelChip}
                        showChurch={!isPairsGame}
                        playerById={playerById}
                        allowsDraw={allowsDraw}
                        canScore={canScore}
                        canUndo={canUndoMatch(bracket, match)}
                        undoing={undoingMatchId === match.id}
                        isPulsing={pulsingMatchId === match.id}
                        cardRef={(el) => {
                          matchRefs.current[match.id] = el;
                        }}
                        onPickWinner={(matchId, side, slot, drawCount) =>
                          setPendingDecision({ kind: 'winner', matchId, side, slot, drawCount })
                        }
                        onPickDraw={(m) =>
                          setPendingDecision({
                            kind: 'draw',
                            matchId: m.id,
                            match: m,
                            drawCount: m.drawCount ?? 0,
                          })
                        }
                        onUndo={requestUndo}
                        onUndoDraw={(matchId) => void handleUndoDraw(matchId)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TEAM MATCH VIEW */}
      {bracket.format === 'teammatch' && (
        <div className="space-y-3">
          {rounds.map(({ round, matches }) => (
            <div key={round} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {matches.map((match, idx) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  matchNumber={idx + 1}
                  showLevel={game.usesSkillLevel}
                  showChurch={false}
                  playerById={playerById}
                  allowsDraw={false}
                  canScore={canScore}
                  canUndo={canUndoMatch(bracket, match)}
                  undoing={undoingMatchId === match.id}
                  isPulsing={pulsingMatchId === match.id}
                  cardRef={(el) => {
                    matchRefs.current[match.id] = el;
                  }}
                  onPickWinner={(matchId, side, slot, drawCount) =>
                    setPendingDecision({ kind: 'winner', matchId, side, slot, drawCount })
                  }
                  onPickDraw={(m) =>
                    setPendingDecision({
                      kind: 'draw',
                      matchId: m.id,
                      match: m,
                      drawCount: m.drawCount ?? 0,
                    })
                  }
                  onUndo={requestUndo}
                  onUndoDraw={(matchId) => void handleUndoDraw(matchId)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {sharedModals}
      {pairsModals}
    </div>
  );
}
