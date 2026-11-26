import { CheckCircle2, AlertCircle } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
  warningText?: string;
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isRich = Boolean(toast.warningText || toast.action);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-6 lg:bottom-6 z-50 max-w-[calc(100vw-2rem)] sm:max-w-md pointer-events-none"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-3 py-2 border shadow-[0_6px_16px_rgba(0,0,0,0.45)] bg-surface transition-opacity duration-150 ${
          isRich ? 'rounded-xl' : 'rounded-full'
        } ${isSuccess ? 'border-edge' : 'border-status-red-edge'}`}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="cursor-pointer flex items-start gap-2 text-left min-w-0 flex-1"
        >
          {isSuccess ? (
            <CheckCircle2 size={16} className="text-status-green-fg shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={16} className="text-status-red-fg shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <span
              className={`block text-[13px] leading-snug ${
                isSuccess ? 'text-fg' : 'text-status-red-fg'
              }`}
            >
              {toast.text}
            </span>
            {toast.warningText && (
              <span className="block text-xs leading-snug text-status-amber-fg mt-0.5">
                {toast.warningText}
              </span>
            )}
          </div>
        </button>

        {toast.action && (
          <button
            type="button"
            onClick={() => {
              const fn = toast.action?.onClick;
              onDismiss();
              if (fn) void fn();
            }}
            className="shrink-0 min-h-[32px] px-2.5 py-1 rounded-lg bg-primary text-primary-fg text-xs font-semibold hover:bg-primary-hover transition-colors duration-150"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

