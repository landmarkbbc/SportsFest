import { DisplayBalanceStatus, TeamId } from '../types/models';

export function TeamIndicator({
  team,
  compact = false,
}: {
  team: TeamId | null;
  compact?: boolean;
}) {
  if (team === 'blue') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-medium text-xs bg-blue-tint text-blue-light ${
          compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-blue-team shrink-0" aria-hidden="true" />
        <span>Blue</span>
      </span>
    );
  }

  if (team === 'red') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-medium text-xs bg-red-tint text-red-light ${
          compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-red-team shrink-0" aria-hidden="true" />
        <span>Red</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium text-xs bg-status-gray-bg text-status-gray-fg ${
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1'
      }`}
    >
      <span className="w-2 h-2 rounded-full bg-fg-muted shrink-0" aria-hidden="true" />
      <span>Unassigned</span>
    </span>
  );
}

export function BalanceBadge({ status }: { status: DisplayBalanceStatus }) {
  if (status === 'No players' || status === 'Not assigned yet') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-status-gray-bg text-status-gray-fg border border-edge whitespace-nowrap">
        {status}
      </span>
    );
  }
  if (status === 'Balanced') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-status-green-bg text-status-green-fg border border-status-green-edge whitespace-nowrap">
        Balanced
      </span>
    );
  }
  if (status === 'Fair') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-status-amber-bg text-status-amber-fg border border-status-amber-edge whitespace-nowrap">
        Fair
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-status-red-bg text-status-red-fg border border-status-red-edge whitespace-nowrap">
      Unbalanced
    </span>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-overlay flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-surface w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-edge p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-[16px] font-semibold text-fg mb-2">
          {title}
        </h2>
        {description && <p className="text-sm text-fg-muted mb-6">{description}</p>}
        <div className={`flex flex-col-reverse sm:flex-row gap-2 sm:justify-end ${description ? '' : 'mt-6'}`}>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-edge text-sm font-medium text-fg bg-transparent hover:bg-nested transition-colors duration-150 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${
              confirmVariant === 'danger'
                ? 'bg-status-red-bg border border-status-red-edge text-status-red-fg hover:opacity-90'
                : 'bg-primary text-primary-fg hover:bg-primary-hover'
            }`}
          >
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
