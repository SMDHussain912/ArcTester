import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ArcTester UI rendering failed.", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error" role="alert">
          <h1>Something went wrong</h1>
          <p>ArcTester could not display this screen. Reload the app to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload ArcTester</button>
        </main>
      );
    }
    return this.props.children;
  }
}
