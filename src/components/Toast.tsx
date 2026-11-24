import { CheckCircle2, AlertCircle } from 'lucide-react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const isSuccess = toast.type === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-6 lg:bottom-6 z-50 max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-[12px] py-[8px] rounded-full border shadow-[0_6px_16px_rgba(0,0,0,0.45)] bg-surface text-left transition-opacity duration-150 ${
          isSuccess ? 'border-edge' : 'border-status-amber-edge'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 size={16} className="text-status-green-fg shrink-0" />
        ) : (
          <AlertCircle size={16} className="text-status-amber-fg shrink-0" />
        )}
        <span className="text-[13px] leading-snug text-fg">{toast.text}</span>
      </button>
    </div>
  );
}
