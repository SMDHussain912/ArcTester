import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State {
  hasError: boolean;
  errorName: string;
  errorMessage: string;
  componentStack: string;
  referenceId: string;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorName: "", errorMessage: "", componentStack: "", referenceId: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorName: error.name || "Error",
      errorMessage: error.message || "An unexpected interface error occurred.",
      componentStack: "",
      referenceId: `UI-${Date.now().toString(36).toUpperCase()}`,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep diagnostics in developer tools/logging; never render raw stack details in production.
    console.error("ArcTester UI rendering failed.", error, info.componentStack);
    this.setState({ componentStack: info.componentStack || "" });
  }

  render() {
    if (this.state.hasError) {
      const isProduction = import.meta.env.PROD;
      const diagnostic = [`${this.state.errorName}: ${this.state.errorMessage}`, this.state.componentStack].filter(Boolean).join("\\n\\n");
      return (
        <main className="app-error" role="alert">
          <div className="app-error-content">
            <p className="app-error-eyebrow">ARCTESTER · APPLICATION ERROR</p>
            <h1>Something went wrong</h1>
            <p>ArcTester couldn't load this screen. Reload the app to try again.</p>
            {isProduction ? (
              <p className="app-error-reference">Reference ID: <code>{this.state.referenceId}</code></p>
            ) : (
              <section className="app-error-diagnostic">
                <strong>Developer details</strong>
                <code>{this.state.errorName}: {this.state.errorMessage}</code>
                {this.state.componentStack && <details><summary>Component trace</summary><pre>{this.state.componentStack}</pre></details>}
              </section>
            )}
            <div className="app-error-actions">
              <button type="button" onClick={() => window.location.reload()}>Reload ArcTester</button>
              {!isProduction && <button type="button" className="app-error-copy" onClick={() => void navigator.clipboard?.writeText(diagnostic).catch(() => undefined)}>Copy developer details</button>}
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
