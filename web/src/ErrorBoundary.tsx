import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorName: string;
  errorMessage: string;
  componentStack: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorName: "", errorMessage: "", componentStack: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorName: error.name || "Error",
      errorMessage: error.message || "An unexpected interface error occurred.",
      componentStack: "",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ArcTester UI rendering failed.", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
  }

  render() {
    if (this.state.hasError) {
      const diagnostic = [`${this.state.errorName}: ${this.state.errorMessage}`, this.state.componentStack].filter(Boolean).join("\\n\\n");
      return (
        <main className="app-error" role="alert">
          <div className="app-error-content">
            <p className="app-error-eyebrow">ARCTESTER · APPLICATION ERROR</p>
            <h1>Something went wrong</h1>
            <p>ArcTester hit an unexpected interface error. Reload the app to try again.</p>
            <section className="app-error-diagnostic">
              <strong>Technical details</strong>
              <code>{this.state.errorName}: {this.state.errorMessage}</code>
              {this.state.componentStack && <details><summary>Component trace</summary><pre>{this.state.componentStack}</pre></details>}
            </section>
            <div className="app-error-actions">
              <button type="button" onClick={() => window.location.reload()}>Reload ArcTester</button>
              <button type="button" className="app-error-copy" onClick={() => void navigator.clipboard?.writeText(diagnostic).catch(() => undefined)}>Copy error details</button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
