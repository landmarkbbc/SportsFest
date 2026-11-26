import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { DEPARTMENTS } from '../types/models';
import {
  BulkAssignmentPlan,
  DEPT_GENDER_GROUPS,
  getDisplayGameBalanceStatus,
} from '../utils/balance';
import { SportIcon } from './SportIcons';
import { BalanceBadge } from './TeamBadge';

interface BulkAssignPreviewModalProps {
  open: boolean;
  plan: BulkAssignmentPlan | null;
  confirming: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function BulkAssignPreviewModal({
  open,
  plan,
  confirming,
  onConfirm,
  onCancel,
}: BulkAssignPreviewModalProps) {
  if (!open || !plan) return null;

  const totalProposed = plan.proposedBlue.length + plan.proposedRed.length;

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-stretch lg:items-center justify-center lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-preview-title"
    >
      <div className="bg-surface w-full h-full lg:h-auto lg:max-h-[90vh] lg:max-w-3xl lg:rounded-xl lg:border lg:border-edge lg:shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
          <div>
            <h2 id="bulk-preview-title" className="text-[16px] font-semibold text-fg">
              Preview Team Assignments
            </h2>
            <p className="text-xs text-fg-muted tabular-nums">
              {totalProposed} unassigned players · Cost {plan.beforeCost} → {plan.afterCost}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            aria-label="Close preview"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-fg-muted hover:text-fg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="p-3 rounded-xl bg-nested border border-edge text-xs text-fg-muted">
            Nothing is saved yet. Review the proposed teams and game balance below, then tap Confirm Assignments.
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

          {/* Proposed Blue & Red Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-blue-edge bg-blue-tint p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-team" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-blue-light">Proposed Blue</h3>
                </div>
                <span className="text-xs font-medium text-blue-light tabular-nums">
                  {plan.proposedBlue.length} players
                </span>
              </div>
              {plan.proposedBlue.length === 0 ? (
                <p className="text-xs text-fg-muted">No players proposed for Blue.</p>
              ) : (
                <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {plan.proposedBlue.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-xs bg-surface border border-edge rounded-lg px-2.5 py-2"
                    >
                      <span className="font-medium text-fg truncate">{p.name}</span>
                      <span className="text-fg-muted shrink-0 ml-2">
                        {p.department} · {p.gender}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-red-edge bg-red-tint p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-team" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-red-light">Proposed Red</h3>
                </div>
                <span className="text-xs font-medium text-red-light tabular-nums">
                  {plan.proposedRed.length} players
                </span>
              </div>
              {plan.proposedRed.length === 0 ? (
                <p className="text-xs text-fg-muted">No players proposed for Red.</p>
              ) : (
                <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {plan.proposedRed.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-xs bg-surface border border-edge rounded-lg px-2.5 py-2"
                    >
                      <span className="font-medium text-fg truncate">{p.name}</span>
                      <span className="text-fg-muted shrink-0 ml-2">
                        {p.department} · {p.gender}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Departments Before / After */}
          <div className="p-3 rounded-xl border border-edge bg-nested space-y-2">
            <p className="text-xs font-semibold text-fg">Departments</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEPARTMENTS.map((dept) => {
                const beforeB = plan.departmentComparison.before.blue[dept];
                const beforeR = plan.departmentComparison.before.red[dept];
                const afterB = plan.departmentComparison.after.blue[dept];
                const afterR = plan.departmentComparison.after.red[dept];
                return (
                  <div
                    key={dept}
                    className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs"
                  >
                    <p className="text-fg-muted font-medium">{dept}</p>
                    <p className="tabular-nums mt-0.5">
                      <span className="text-blue-light">{beforeB}</span>
                      <span className="text-fg-muted"> vs </span>
                      <span className="text-red-light">{beforeR}</span>
                      <span className="text-fg-muted mx-1">→</span>
                      <span className="text-blue-light font-semibold">{afterB}</span>
                      <span className="text-fg-muted"> vs </span>
                      <span className="text-red-light font-semibold">{afterR}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Department by gender (after proposed assignment) */}
          <div className="p-3 rounded-xl border border-edge bg-nested space-y-2">
            <p className="text-xs font-semibold text-fg">
              Department by gender (after assignment)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEPT_GENDER_GROUPS.map((group) => {
                const afterB = plan.deptGenderAfter.blue[group.key];
                const afterR = plan.deptGenderAfter.red[group.key];
                return (
                  <div
                    key={group.key}
                    className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs"
                  >
                    <p className="text-fg-muted font-medium">{group.label}</p>
                    <p className="tabular-nums mt-0.5">
                      <span className="text-blue-light font-semibold">{afterB}</span>
                      <span className="text-fg-muted"> vs </span>
                      <span className="text-red-light font-semibold">{afterR}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Church (after proposed assignment) */}
          {plan.churchAfter.length > 0 && (
            <div className="p-3 rounded-xl border border-edge bg-nested space-y-2">
              <p className="text-xs font-semibold text-fg">
                Church (after assignment)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {plan.churchAfter.map((c) => (
                  <div
                    key={c.key || '__main__'}
                    className="px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs"
                  >
                    <p className="text-fg-muted font-medium truncate">{c.label}</p>
                    <p className="tabular-nums mt-0.5">
                      <span className="text-blue-light font-semibold">{c.blue}</span>
                      <span className="text-fg-muted"> vs </span>
                      <span className="text-red-light font-semibold">{c.red}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Before / After Game Balance */}
          <div>
            <h3 className="text-[16px] font-semibold text-fg mb-3">
              Before / After Balance by Game
            </h3>
            {plan.gameComparisons.length === 0 ? (
              <div className="p-4 rounded-xl border border-edge bg-nested text-xs text-fg-muted">
                No game entries among unassigned players. Assignments balance overall headcount and department counts.
              </div>
            ) : (
              <div className="space-y-2">
                {plan.gameComparisons.map(({ game, before, after }) => (
                  <div
                    key={game.id}
                    className="p-3 rounded-xl border border-edge bg-nested flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {game.iconKey && (
                        <SportIcon iconKey={game.iconKey} size={18} className="text-fg" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">{game.name}</p>
                        <p className="text-xs text-fg-muted tabular-nums">
                          Before: B {before.blue.headcount} vs R {before.red.headcount} → After: Blue{' '}
                          {after.blue.headcount}
                          {game.usesSkillLevel ? ` (L${after.blue.totalLevel})` : ''} vs Red{' '}
                          {after.red.headcount}
                          {game.usesSkillLevel ? ` (L${after.red.totalLevel})` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <BalanceBadge status={getDisplayGameBalanceStatus(before)} />
                      <ArrowRight size={16} className="text-fg-muted" />
                      <BalanceBadge status={getDisplayGameBalanceStatus(after)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-primary text-primary-fg text-sm font-medium hover:bg-primary-hover transition-colors duration-150 disabled:opacity-50"
          >
            {confirming ? 'Saving Assignments...' : 'Confirm Assignments'}
          </button>
        </div>
      </div>
    </div>
  );
}
