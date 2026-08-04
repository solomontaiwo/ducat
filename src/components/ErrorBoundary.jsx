import { Component } from "react";
import PropTypes from "prop-types";
import { Button } from "./ui/button";

class ErrorBoundary extends Component {
  static propTypes = { children: PropTypes.node.isRequired };

  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Unhandled application error", error);
    console.error("Component stack", info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-lg" role="alert">
          <h1 className="text-xl font-bold">Impossibile mostrare questa pagina</h1>
          <p className="text-sm text-muted-foreground">
            Si è verificato un errore inatteso. I dati non sono stati modificati.
          </p>
          <Button onClick={() => window.location.reload()}>Ricarica l’app</Button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
