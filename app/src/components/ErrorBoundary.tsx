import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  crashCount: number;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, crashCount: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, crashCount: 0 };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in app:', error, info);
    // Count consecutive crashes so we can escalate the recovery offer
    // (just-dismiss → reset-to-safe-view → full-reload) if the same
    // view keeps blowing up.
    this.setState((s) => ({ crashCount: s.crashCount + 1 }));
  }

  // Dismiss: clear the error AND move the app to a known-safe state so
  // the crashing view isn't immediately re-rendered into the same
  // exception. We reset to the Dashboard tab + close any open right
  // panel, which are the simplest, most defensively-coded surfaces.
  // Done via a dynamic store import so the boundary stays decoupled.
  handleReset = () => {
    import('@/store/useAppStore')
      .then(({ useAppStore }) => {
        try {
          useAppStore.setState({ activeTab: 'dashboard', rightPanel: null } as any);
        } catch { /* store unavailable — dismiss anyway */ }
      })
      .finally(() => this.setState({ hasError: false, error: null }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen w-screen bg-[var(--bg)] p-6">
          <div className="max-w-md w-full text-center bg-[var(--panel)] border border-[var(--border)] rounded-xl p-8 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-[var(--danger)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-[var(--text)] mb-2">Something went wrong</h1>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              The app hit an unexpected error. Your work is saved automatically — you can dismiss this and keep going.
            </p>
            {this.state.error && (
              <pre className="text-[11px] text-[var(--text-muted)] bg-[var(--card)] border border-[var(--border)] rounded-lg p-3 mb-4 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-[var(--accent)] text-[var(--bg)] rounded-lg text-sm font-semibold hover:brightness-110 transition-all"
              >
                Dismiss &amp; go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[var(--card)] border border-[var(--border)] text-[var(--text-secondary)] rounded-lg text-sm font-semibold hover:text-[var(--text)] transition-all"
              >
                Reload
              </button>
            </div>
            {/* Escalated recovery — only shown if the app has crashed
                repeatedly, which usually means corrupt local state. This
                clears the cached UI/session keys (NOT the user's stories,
                which live in IndexedDB + cloud) and reloads clean. */}
            {this.state.crashCount >= 2 && (
              <button
                onClick={() => {
                  try {
                    // Wipe only volatile UI/session caches — never the
                    // story data stores.
                    Object.keys(localStorage)
                      .filter((k) => k.startsWith('kindling-') && !k.includes('comments-seen'))
                      .forEach((k) => { try { localStorage.removeItem(k); } catch {} });
                  } catch {}
                  window.location.reload();
                }}
                className="mt-3 text-[11px] text-[var(--text-muted)] underline hover:text-[var(--danger)]"
              >
                Still broken? Reset app settings &amp; reload (your stories are safe)
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
