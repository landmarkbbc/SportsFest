import { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Game, Player, TeamId } from '../types/models';
import { previewSingleTeamHint } from '../utils/balance';

interface AssignPlayerModalProps {
  open: boolean;
  player: Player | null;
  players: Player[];
  games: Game[];
  onClose: () => void;
  onAssignChoice: (player: Player, choice: TeamId | 'auto') => Promise<void>;
}

export function AssignPlayerModal({
  open,
  player,
  players,
  games,
  onClose,
  onAssignChoice,
}: AssignPlayerModalProps) {
  const [busyChoice, setBusyChoice] = useState<TeamId | 'auto' | null>(null);

  const blueHint = useMemo(() => {
    if (!player) return '';
    return previewSingleTeamHint(player, 'blue', players, games);
  }, [player, players, games]);

  const redHint = useMemo(() => {
    if (!player) return '';
    return previewSingleTeamHint(player, 'red', players, games);
  }, [player, players, games]);

  if (!open || !player) return null;

  async function handleSelect(choice: TeamId | 'auto') {
    if (!player || busyChoice !== null) return;
    setBusyChoice(choice);
    try {
      await onAssignChoice(player, choice);
    } finally {
      setBusyChoice(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-player-title"
    >
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5 pb-safe">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="assign-player-title"
              className="text-[16px] font-semibold text-fg break-words"
            >
              Assign {player.name}
            </h2>
            <p className="text-xs text-fg-muted mt-0.5">
              {player.department} · {player.gender === 'M' ? 'Male (M)' : 'Female (F)'}
            </p>
          </div>
          <button
            type="button"
            disabled={busyChoice !== null}
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-fg-muted hover:text-fg disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Blue team button */}
          <button
            type="button"
            disabled={busyChoice !== null}
            onClick={() => handleSelect('blue')}
            className="w-full min-h-[56px] px-4 py-3 rounded-xl border border-blue-edge bg-blue-tint hover:bg-blue-team/25 text-left transition-colors duration-150 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold text-blue-light">
                {busyChoice === 'blue' ? 'Assigning to Blue...' : 'Blue team'}
              </span>
            </div>
            <p className="text-xs text-blue-light/85 mt-1 pl-4.5">{blueHint}</p>
          </button>

          {/* Red team button */}
          <button
            type="button"
            disabled={busyChoice !== null}
            onClick={() => handleSelect('red')}
            className="w-full min-h-[56px] px-4 py-3 rounded-xl border border-red-edge bg-red-tint hover:bg-red-team/25 text-left transition-colors duration-150 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-team shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold text-red-light">
                {busyChoice === 'red' ? 'Assigning to Red...' : 'Red team'}
              </span>
            </div>
            <p className="text-xs text-red-light/85 mt-1 pl-4.5">{redHint}</p>
          </button>

          {/* Automatic (balance) button */}
          <button
            type="button"
            disabled={busyChoice !== null}
            onClick={() => handleSelect('auto')}
            className="w-full min-h-[56px] px-4 py-3 rounded-xl border border-edge bg-nested hover:bg-edge/60 text-left transition-colors duration-150 disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-fg shrink-0" />
              <span className="text-sm font-semibold text-fg">
                {busyChoice === 'auto' ? 'Assigning automatically...' : 'Automatic (balance)'}
              </span>
            </div>
            <p className="text-xs text-fg-muted mt-1 pl-6">
              Picks the team that keeps games most balanced
            </p>
          </button>
        </div>

        <button
          type="button"
          disabled={busyChoice !== null}
          onClick={onClose}
          className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg-muted hover:text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
