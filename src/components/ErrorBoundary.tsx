import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="bg-red-950 border border-red-700 rounded-2xl p-8 max-w-xl w-full shadow-2xl">
            <h1 className="text-xl font-bold text-red-300 mb-3">Application Error</h1>
            <p className="text-red-400 text-sm mb-4">{error.message}</p>
            <pre className="bg-slate-900 text-red-300 text-xs rounded-lg p-4 overflow-auto max-h-48 whitespace-pre-wrap">
              {error.stack}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-5 bg-red-700 hover:bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
