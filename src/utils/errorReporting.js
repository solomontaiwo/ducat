/**
 * Privacy-aware client error reporting.
 *
 * Nothing is sent unless VITE_ERROR_REPORT_URL is configured (the origin must
 * also be allowed by the CSP `connect-src`). Reports carry only the error
 * name, a scrubbed message/stack and the route path: no user ID, no email, no
 * query string and no financial data. They are de-duplicated and capped per
 * session so a render loop cannot flood the endpoint.
 */
const MAX_REPORTS_PER_SESSION = 5;
const MAX_TEXT_LENGTH = 1500;

const seen = new Set();
let sent = 0;

export const scrubText = (value) => String(value ?? "")
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
  .replace(/https?:\/\/[^\s)"']+/g, (url) => url.split(/[?#]/)[0])
  .replace(/\b\d{4,}\b/g, "[number]")
  .slice(0, MAX_TEXT_LENGTH);

export const buildErrorReport = (error, context = {}) => ({
  name: scrubText(error?.name || "Error"),
  message: scrubText(error?.message),
  stack: scrubText(error?.stack),
  source: scrubText(context.source || "unknown"),
  componentStack: context.componentStack ? scrubText(context.componentStack) : undefined,
  path: typeof window === "undefined" ? undefined : window.location.pathname,
  release: import.meta.env.VITE_APP_VERSION || undefined,
  timestamp: new Date().toISOString(),
});

export const reportError = (error, context = {}) => {
  console.error(`[${context.source || "error"}]`, error);
  const endpoint = import.meta.env.VITE_ERROR_REPORT_URL;
  if (!endpoint || sent >= MAX_REPORTS_PER_SESSION) return false;

  const report = buildErrorReport(error, context);
  const fingerprint = `${report.name}|${report.message}|${report.source}`;
  if (seen.has(fingerprint)) return false;
  seen.add(fingerprint);

  try {
    const body = JSON.stringify(report);
    const delivered = typeof navigator.sendBeacon === "function"
      && navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    if (!delivered) {
      fetch(endpoint, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
    sent += 1;
    return true;
  } catch {
    return false;
  }
};

export const installGlobalErrorReporting = () => {
  window.addEventListener("error", (event) => {
    reportError(event.error || new Error(event.message), { source: "window.error" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportError(reason, { source: "unhandledrejection" });
  });
};

export const resetErrorReportingForTests = () => {
  seen.clear();
  sent = 0;
};
