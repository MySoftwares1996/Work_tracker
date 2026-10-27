import { Component } from 'react';
import { reloadOnNewBuild } from './refresh';

/** A crash anywhere in the app shows this card (with the reason and a Reload that clears the old cached copy) instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { try { console.error('App crashed:', error); } catch { /* no console */ } }
  render() {
    if (!this.state.error) return this.props.children;
    const msg = String((this.state.error && this.state.error.message) || this.state.error).slice(0, 300);
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--ground, #F7F5EF)', color: 'var(--ink, #16231F)', fontFamily: 'var(--sans, system-ui, sans-serif)' }}>
        <div style={{ width: 'min(520px, 100%)', background: 'var(--card, #fff)', border: '1px solid var(--line, #E4E0D4)', borderRadius: 24, padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--serif, Georgia, serif)', fontWeight: 600, fontSize: 30 }}>Something went wrong</h1>
          <p style={{ margin: 0, color: 'var(--muted, #5E6B66)', lineHeight: 1.5 }}>The page hit a problem and stopped. Your tasks are safe - they are stored on the server. Reload to try again.</p>
          <code style={{ fontSize: 12, color: 'var(--muted, #5E6B66)', wordBreak: 'break-word' }}>{msg}</code>
          <button type="button" onClick={reloadOnNewBuild} style={{ alignSelf: 'flex-start', border: 0, borderRadius: 14, padding: '13px 22px', background: 'var(--primary, #0B6B52)', color: 'var(--on-primary, #fff)', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>Reload</button>
        </div>
      </div>
    );
  }
}
