import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiAlertCircle, FiAlertTriangle, FiCheck, FiInfo, FiX } from "react-icons/fi";
import { cn } from "../lib/utils";

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

const MAX_TOASTS = 3;
const EXIT_MS = 150;
const TICK_MS = 100;

/** Default visible time per type: errors stay longer, successes are brief. */
const DURATIONS = {
  success: 3500,
  info: 4000,
  warning: 6000,
  danger: 8000,
};

const TYPES = {
  success: { Icon: FiCheck, badge: "bg-emerald-500", bar: "bg-emerald-500", role: "status" },
  danger: { Icon: FiAlertCircle, badge: "bg-rose-500", bar: "bg-rose-500", role: "alert" },
  warning: { Icon: FiAlertTriangle, badge: "bg-amber-500", bar: "bg-amber-500", role: "status" },
  info: { Icon: FiInfo, badge: "bg-primary", bar: "bg-primary", role: "status" },
};

const Toast = ({ toast, onDismiss }) => {
  const { t } = useTranslation();
  const { id, message, description, type, duration, action } = toast;
  const meta = TYPES[type] ?? TYPES.info;
  const Icon = meta.Icon;

  const [progress, setProgress] = useState(100);
  const [closing, setClosing] = useState(false);
  const remainingRef = useRef(duration);
  const lastTickRef = useRef(Date.now());
  const pausedRef = useRef(false);
  const closingRef = useRef(false);
  const tickRef = useRef(null);
  const dismissRef = useRef(null);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    dismissRef.current = window.setTimeout(() => onDismiss(id), EXIT_MS);
  }, [id, onDismiss]);

  useEffect(() => {
    lastTickRef.current = Date.now();
    tickRef.current = window.setInterval(() => {
      if (pausedRef.current || closingRef.current) return;
      const now = Date.now();
      remainingRef.current = Math.max(0, remainingRef.current - (now - lastTickRef.current));
      lastTickRef.current = now;
      setProgress((remainingRef.current / duration) * 100);
      if (remainingRef.current <= 0) requestClose();
    }, TICK_MS);
    return () => {
      window.clearInterval(tickRef.current);
      window.clearTimeout(dismissRef.current);
    };
  }, [duration, requestClose]);

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; lastTickRef.current = Date.now(); };

  return (
    <div
      role={meta.role}
      className={cn(
        "relative flex gap-3 overflow-hidden rounded-2xl border border-border bg-card p-3 pr-2.5 text-card-foreground shadow-[0_8px_24px_rgb(20_25_36/0.12)]",
        closing ? "animate-toast-out" : "animate-toast-in"
      )}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white", meta.badge)}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="break-words text-sm font-bold leading-snug">{message}</p>
        {description && <p className="mt-0.5 break-words text-[13px] leading-snug text-muted-foreground">{description}</p>}
        {action && (
          <button
            type="button"
            onClick={() => { action.onClick?.(); requestClose(); }}
            className="mt-1.5 text-[13px] font-semibold text-primary hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={requestClose}
        aria-label={t("notifications.close", { defaultValue: "Chiudi notifica" })}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <FiX className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        className={cn("absolute bottom-0 left-0 h-[3px] rounded-r-[3px]", meta.bar)}
        style={{ width: `${progress}%`, transition: "width 100ms linear" }}
        aria-hidden="true"
      />
    </div>
  );
};

Toast.propTypes = {
  toast: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    message: PropTypes.string.isRequired,
    description: PropTypes.string,
    type: PropTypes.oneOf(["success", "danger", "warning", "info"]).isRequired,
    duration: PropTypes.number.isRequired,
    action: PropTypes.shape({ label: PropTypes.string.isRequired, onClick: PropTypes.func }),
  }).isRequired,
  onDismiss: PropTypes.func.isRequired,
};

/**
 * Toast notifications: a solid card with a coloured type icon, the message as
 * the title, an optional detail line and action, and a thin timer bar. They
 * auto-dismiss after a type-dependent delay and pause while hovered or focused.
 */
export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info", options = {}) => {
    const opts = typeof options === "number" ? { duration: options } : (options || {});
    const duration = opts.duration ?? DURATIONS[type] ?? DURATIONS.info;
    setToasts((prev) => {
      // Ignore exact duplicates that are still on screen.
      if (prev.some((toast) => toast.type === type && toast.message === message)) return prev;
      const next = [...prev, {
        id: Date.now() + Math.random(),
        message,
        description: opts.description,
        type,
        duration,
        action: opts.action,
      }];
      // Keep only the most recent toasts; the oldest unmounts and clears its timers.
      return next.slice(-MAX_TOASTS);
    });
  }, []);

  const success = useCallback((message, options) => addToast(message, "success", options), [addToast]);
  const error = useCallback((message, options) => addToast(message, "danger", options), [addToast]);
  const warning = useCallback((message, options) => addToast(message, "warning", options), [addToast]);
  const info = useCallback((message, options) => addToast(message, "info", options), [addToast]);

  // Stable identity: consumers must not re-render (or rebuild callbacks) whenever a toast appears.
  const api = useMemo(() => ({ success, error, warning, info, addToast }), [success, error, warning, info, addToast]);

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] z-50 flex w-80 max-w-[90vw] -translate-x-1/2 flex-col gap-2 md:top-6"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={removeToast} />
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
