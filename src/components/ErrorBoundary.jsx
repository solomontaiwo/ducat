import { Component } from "react";
import PropTypes from "prop-types";
import i18n from "../utils/i18n";
import { reportError } from "../utils/errorReporting";
import { Button } from "./ui/button";

class ErrorBoundary extends Component {
  static propTypes = { children: PropTypes.node.isRequired };

  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { source: "react.error-boundary", componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-lg" role="alert">
          <h1 className="text-xl font-bold">{i18n.t("errorBoundary.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {i18n.t("errorBoundary.description")}
          </p>
          <Button onClick={() => window.location.reload()}>{i18n.t("errorBoundary.reload")}</Button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
