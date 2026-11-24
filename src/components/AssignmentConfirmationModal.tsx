import { CheckCircle2, X } from 'lucide-react';
import { Player } from '../types/models';
import { SingleAssignmentResult } from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge, TeamIndicator } from './TeamBadge';

interface AssignmentConfirmationModalProps {
  open: boolean;
  player: Player | null;
  result: SingleAssignmentResult | null;
  onClose: () => void;
}

export function AssignmentConfirmationModal({
  open,
  player,
  result,
  onClose,
}: AssignmentConfirmationModalProps) {
  if (!open || !player || !result) return null;

  const isBlue = result.team === 'blue';

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-confirm-title"
    >
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isBlue ? 'bg-blue-tint text-blue-light' : 'bg-red-tint text-red-light'
              }`}
            >
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h2 id="assign-confirm-title" className="text-[16px] font-semibold text-fg">
                Assigned to {isBlue ? 'Blue' : 'Red'}
              </h2>
              <p className="text-xs text-fg-muted">{player.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 flex items-center justify-center text-fg-muted hover:text-fg"
          >
            <X size={20} />
          </button>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            isBlue
              ? 'bg-blue-tint border-blue-edge'
              : 'bg-red-tint border-red-edge'
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <TeamIndicator team={result.team} compact />
          </div>
          <p className="text-sm text-fg">{result.reason}.</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-fg-muted">Updated Game Balance</p>
          {result.joinedGames.length === 0 ? (
            <div className="p-3 rounded-xl border border-edge bg-nested">
              <p className="text-xs text-fg-muted">
                No game entries yet — assigned based on overall headcount and department balance.
              </p>
            </div>
          ) : (
            result.joinedGames.map((jg) => (
              <div
                key={jg.game.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-edge bg-nested"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {jg.game.iconKey && (
                    <SportIcon iconKey={jg.game.iconKey} size={18} className="text-fg" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg truncate">{jg.game.name}</p>
                    <p className="text-xs text-fg-muted tabular-nums">
                      {jg.game.usesSkillLevel
                        ? `Blue ${jg.blueCount} (L${jg.blueLevel}) · Red ${jg.redCount} (L${jg.redLevel})`
                        : `Blue ${jg.blueCount} · Red ${jg.redCount}`}
                    </p>
                  </div>
                </div>
                <BalanceBadge status={jg.badge} />
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150"
        >
          Done
        </button>
      </div>
    </div>
  );
}
