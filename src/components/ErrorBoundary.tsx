import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-page flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-edge rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={20} className="text-fg shrink-0" />
              <h1 className="text-[16px] font-semibold text-fg">
                Something went wrong
              </h1>
            </div>
            <p className="text-sm text-fg-muted mb-4 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2 bg-primary text-primary-fg text-sm font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors duration-150"
            >
              <RefreshCw size={20} />
              <span>Reload app</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
