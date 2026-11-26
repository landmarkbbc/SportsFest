import { AlertTriangle, ArrowRight, CheckCircle2, Lock, X } from 'lucide-react';
import {
  DEPT_GENDER_GROUPS,
  RebalancePlan,
} from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';

interface RebalancePreviewModalProps {
  open: boolean;
  plan: RebalancePlan | null;
  confirming: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function RebalancePreviewModal({
  open,
  plan,
  confirming,
  onConfirm,
  onCancel,
}: RebalancePreviewModalProps) {
  if (!open || !plan) return null;

  const hasMoves = plan.moves.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-stretch lg:items-center justify-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rebalance-preview-title"
    >
      <div className="bg-surface w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-3xl lg:rounded-xl lg:border lg:border-edge lg:shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <div>
            <h2 id="rebalance-preview-title" className="text-[16px] font-semibold text-fg">
              Re-balance Teams
            </h2>
            <p className="text-xs text-fg-muted tabular-nums">
              {hasMoves
                ? `${plan.moves.length} ${plan.moves.length === 1 ? 'player' : 'players'} to move · Cost ${plan.beforeCost} → ${plan.afterCost}`
                : `Current cost ${plan.beforeCost}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            aria-label="Close re-balance preview"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Locked Players Notice */}
          <div className="p-3 rounded-xl bg-nested border border-edge flex items-center gap-2 text-xs text-fg-muted">
            <Lock size={14} className="shrink-0 text-fg-muted" />
            <span className="tabular-nums">
              {plan.lockedCount} players are locked (their sport already has a bracket or pairs)
            </span>
          </div>

          {plan.unresolvedSeparations.length > 0 && (
            <div className="p-3 rounded-xl border border-status-amber-edge bg-status-amber-bg text-status-amber-fg text-xs font-medium space-y-1">
              {plan.unresolvedSeparations.map((u) => (
                <div key={u.id} className="flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>
                    Could not separate {u.aName} and {u.bName}
                  </span>
                </div>
              ))}
            </div>
          )}

          {!hasMoves ? (
            <div className="p-6 rounded-xl bg-nested border border-edge text-center space-y-2">
              <CheckCircle2 size={24} className="mx-auto text-status-green-fg" />
              <p className="text-sm font-semibold text-fg">
                Teams are already well balanced
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-fg-muted">
                Nothing is saved yet. Review the proposed moves and balance changes below, then tap Apply moves.
              </p>

              {/* Proposed Moves List */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">
                  Proposed moves ({plan.moves.length})
                </h3>
                <ul className="space-y-1.5">
                  {plan.moves.map(({ player, fromTeam, toTeam, reason }) => (
                    <li
                      key={player.id}
                      className="p-3 rounded-xl bg-nested border border-edge flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-fg break-words">
                            {player.name}
                          </span>
                          <span className="text-xs text-fg-muted">
                            {player.department} · {player.gender}
                          </span>
                        </div>
                        <p className="text-xs text-fg-muted mt-0.5">{reason}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                        <span
                          className={
                            fromTeam === 'blue' ? 'text-blue-light' : 'text-red-light'
                          }
                        >
                          {fromTeam === 'blue' ? 'Blue' : 'Red'}
                        </span>
                        <ArrowRight size={14} className="text-fg-muted" />
                        <span
                          className={
                            toTeam === 'blue' ? 'text-blue-light' : 'text-red-light'
                          }
                        >
                          {toTeam === 'blue' ? 'Blue' : 'Red'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Before / After Totals & Department/Gender Table */}
              <div className="rounded-xl border border-edge bg-nested overflow-hidden">
                <div className="px-3 py-2.5 border-b border-edge">
                  <h3 className="text-xs font-semibold text-fg">
                    Before / After (Blue vs Red)
                  </h3>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-edge text-fg-muted">
                      <th className="py-2 px-3 font-medium">Group</th>
                      <th className="py-2 px-3 font-medium text-right">Before</th>
                      <th className="py-2 px-3 font-medium text-right">After</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge tabular-nums">
                    <tr className="bg-surface font-semibold">
                      <td className="py-2 px-3 text-fg">Total</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-blue-light">{plan.totalsBefore.blue}</span>
                        <span className="text-fg-muted font-normal"> vs </span>
                        <span className="text-red-light">{plan.totalsBefore.red}</span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-blue-light">{plan.totalsAfter.blue}</span>
                        <span className="text-fg-muted font-normal"> vs </span>
                        <span className="text-red-light">{plan.totalsAfter.red}</span>
                      </td>
                    </tr>
                    {DEPT_GENDER_GROUPS.map((group) => (
                      <tr key={group.key}>
                        <td className="py-2 px-3 text-fg-muted">{group.label}</td>
                        <td className="py-2 px-3 text-right">
                          <span className="text-blue-light">
                            {plan.deptGenderBefore.blue[group.key]}
                          </span>
                          <span className="text-fg-muted"> vs </span>
                          <span className="text-red-light">
                            {plan.deptGenderBefore.red[group.key]}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          <span className="text-blue-light">
                            {plan.deptGenderAfter.blue[group.key]}
                          </span>
                          <span className="text-fg-muted font-normal"> vs </span>
                          <span className="text-red-light">
                            {plan.deptGenderAfter.red[group.key]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Game Badge Changes */}
              {plan.changedGames.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-fg">Game Balance Changes</h3>
                  <div className="space-y-2">
                    {plan.changedGames.map(({ game, beforeBadge, afterBadge }) => (
                      <div
                        key={game.id}
                        className="p-3 rounded-xl border border-edge bg-nested flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {game.iconKey && (
                            <SportIcon iconKey={game.iconKey} size={16} className="text-fg shrink-0" />
                          )}
                          <span className="text-xs font-medium text-fg truncate">
                            {game.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <BalanceBadge status={beforeBadge} />
                          <ArrowRight size={14} className="text-fg-muted" />
                          <BalanceBadge status={afterBadge} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-edge bg-surface flex items-center justify-end gap-3 shrink-0 pb-safe">
          <button
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-edge bg-transparent text-sm font-medium text-fg hover:bg-nested transition-colors duration-150 disabled:opacity-50"
          >
            Cancel
          </button>
          {hasMoves && (
            <button
              type="button"
              disabled={confirming}
              onClick={() => void onConfirm()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
            >
              {confirming ? 'Applying...' : 'Apply moves'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
