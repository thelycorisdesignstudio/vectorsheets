import { Component, type ReactNode } from 'react';

/** Keeps a failing UI section from taking the character down with it. */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <p className="notice boundary">The {this.props.label} panel hit an error: {this.state.error.message}</p>;
    return this.props.children;
  }
}
