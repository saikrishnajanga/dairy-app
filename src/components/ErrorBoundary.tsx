import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', padding: 32,
          textAlign: 'center', color: 'var(--text-primary, #fff)',
          background: 'var(--bg-primary, #0b1120)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😰</div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted, #888)', marginBottom: 24, fontSize: 14 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              padding: '12px 28px', borderRadius: 12, border: 'none',
              background: 'var(--accent, #6c63ff)', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            🔄 Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
