import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { hapticTap } from "../../platform/haptics.js";
import {
  isNativeRefreshAvailable,
  registerNativeRefresh,
  subscribeNativeRefreshAvailability,
  updateNativeRefreshOffset,
} from "../../platform/nativeRefresh.js";
import { useRouteActive } from "../../router/RouterProvider";
import { useAnyDialogOpen } from "./dialogStack.js";
import { cn } from "../../lib/utils.js";

const TRIGGER_PX = 64;
const MAX_PULL_PX = 108;

const useNativeRefreshAvailable = () => useSyncExternalStore(
  subscribeNativeRefreshAvailability,
  isNativeRefreshAvailable,
  () => false,
);

/** Keeps the spinner long enough to read as a refresh, even with cached data, and the content time to settle below it. */
export const MIN_REFRESH_MS = 800;
/** Room held above the content while the native-style spinner shows. */
const NATIVE_SPINNER_PX = 52;
/** Where the system spinner sits when the iOS app does not say: 30pt below the safe area. */
const DEFAULT_SPINNER_TOP = "calc(env(safe-area-inset-top) + 30px)";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The iOS activity indicator: eight ticks fading in turn. */
const IosSpinner = ({ paused }) => (
  <span className={cn("ios-spinner text-muted-foreground", paused && "is-paused")} aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
  </span>
);
IosSpinner.propTypes = { paused: PropTypes.bool };

/**
 * The page's spinner in the iOS app: fixed where the system one was when the
 * finger lifted, so it seems to stay put while the content springs back below.
 */
const NativeRefreshSpinner = ({ visible, at }) => createPortal(
  <div
    aria-hidden="true"
    className={cn(
      "pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 transition-opacity motion-reduce:transition-none",
      visible ? "opacity-100 duration-150" : "opacity-0 duration-300"
    )}
    style={{
      left: at?.x != null ? `${at.x}px` : "50%",
      top: at?.y != null ? `${at.y}px` : DEFAULT_SPINNER_TOP,
    }}
  >
    <IosSpinner paused={!visible} />
  </div>,
  document.body
);
NativeRefreshSpinner.propTypes = {
  visible: PropTypes.bool,
  at: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
};

/**
 * Pull to refresh for mobile views.
 *
 * In the iOS app the gesture belongs to the system refresh control (see
 * `platform/nativeRefresh.js`), on while this page is on screen and no dialog
 * is open. Once released, this page shows its own spinner exactly where the
 * system one was and holds the content below it, as in the App Store, while
 * the background and the bars never move. Elsewhere it is a light touch-only
 * version that starts only at the very top of the page, so normal scrolling
 * and horizontal swipes are never interfered with.
 */
const PullToRefresh = ({ onRefresh, disabled = false, children, className }) => {
  const native = useNativeRefreshAvailable();
  const active = useRouteActive();
  const anyDialogOpen = useAnyDialogOpen();
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  const [spinnerAt, setSpinnerAt] = useState(null);
  const rootRef = useRef(null);
  const latestRefresh = useRef(onRefresh);
  latestRefresh.current = onRefresh;
  const nativeEnabled = native && active && !disabled && !anyDialogOpen;

  useEffect(() => {
    if (!nativeEnabled) return undefined;
    const pageCenter = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      return rect && rect.width > 0 ? rect.left + rect.width / 2 : undefined;
    };
    return registerNativeRefresh(async (position) => {
      setSpinnerAt(position ?? { x: pageCenter(), y: null });
      setNativeRefreshing(true);
      const started = Date.now();
      try {
        await latestRefresh.current?.();
      } finally {
        const remaining = MIN_REFRESH_MS - (Date.now() - started);
        if (remaining > 0) await wait(remaining);
        setNativeRefreshing(false);
      }
    }, pageCenter);
  }, [nativeEnabled]);

  // The native spinner is centred over this page: follow its layout.
  useEffect(() => {
    const root = rootRef.current;
    if (!nativeEnabled || !root || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => updateNativeRefreshOffset());
    observer.observe(root);
    return () => observer.disconnect();
  }, [nativeEnabled]);

  // Same tree either way, so the page never remounts if the native control
  // turns out to be unavailable; with it, the web gesture stays off.
  return (
    <WebPullToRefresh
      onRefresh={onRefresh}
      disabled={disabled || native}
      native={native}
      nativeRefreshing={nativeRefreshing}
      spinnerAt={spinnerAt}
      rootRef={rootRef}
      className={className}
    >
      {children}
    </WebPullToRefresh>
  );
};

const WebPullToRefresh = ({
  onRefresh,
  disabled = false,
  native = false,
  nativeRefreshing = false,
  spinnerAt = null,
  rootRef,
  children,
  className,
}) => {
  const { t } = useTranslation();
  const [pullDistance, setPullDistance] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const startXRef = useRef(null);
  const crossedRef = useRef(false);

  const handleTouchStart = useCallback((event) => {
    if (disabled || refreshing || window.scrollY > 0 || event.touches.length !== 1) return;
    startYRef.current = event.touches[0].clientY;
    startXRef.current = event.touches[0].clientX;
    crossedRef.current = false;
    setDragging(true);
  }, [disabled, refreshing]);

  const handleTouchMove = useCallback((event) => {
    if (startYRef.current === null || disabled || refreshing) return;
    if (window.scrollY > 0) {
      startYRef.current = null;
      setPullDistance(0);
      return;
    }
    const deltaY = event.touches[0].clientY - startYRef.current;
    const deltaX = Math.abs(event.touches[0].clientX - (startXRef.current ?? 0));
    if (deltaY <= 0 || deltaX > deltaY) {
      if (pullDistance > 0) setPullDistance(0);
      return;
    }
    // Gentle resistance curve.
    const damped = Math.min(MAX_PULL_PX, Math.round(deltaY * 0.45));
    setPullDistance(damped);
    if (damped >= TRIGGER_PX && !crossedRef.current) {
      crossedRef.current = true;
      hapticTap();
    } else if (damped < TRIGGER_PX) {
      crossedRef.current = false;
    }
  }, [disabled, refreshing, pullDistance]);

  const handleTouchEnd = useCallback(async () => {
    setDragging(false);
    if (startYRef.current === null) return;
    startYRef.current = null;
    startXRef.current = null;
    const shouldRefresh = pullDistance >= TRIGGER_PX && !disabled && !refreshing;
    if (!shouldRefresh) {
      setPullDistance(0);
      return;
    }
    setRefreshing(true);
    setPullDistance(48);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [pullDistance, disabled, refreshing, onRefresh]);

  const visible = refreshing || pullDistance > 8;
  const ready = pullDistance >= TRIGGER_PX;
  const height = Math.max(refreshing ? 44 : 0, pullDistance);

  return (
    <div
      ref={rootRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={className}
    >
      {native ? (
        <>
          {/* Holds the content below the spinner while the page refreshes. */}
          <div
            aria-live="polite"
            className="overflow-hidden transition-[height] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
            style={{ height: nativeRefreshing ? `${NATIVE_SPINNER_PX}px` : "0px" }}
          >
            {nativeRefreshing && <span className="sr-only">{t("common.refreshing")}</span>}
          </div>
          <NativeRefreshSpinner visible={nativeRefreshing} at={spinnerAt} />
        </>
      ) : (
        <div
          aria-live="polite"
          className={cn(
            // Follows the finger while dragging; eases back on release.
            "flex items-center justify-center overflow-hidden motion-reduce:transition-none",
            !dragging && "transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
            visible ? "opacity-100" : "opacity-0"
          )}
          style={{ height: visible ? `${height}px` : "0px" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
            <FiRefreshCw
              aria-hidden="true"
              className={cn("h-3.5 w-3.5 transition-transform", refreshing && "animate-spin", ready && !refreshing && "rotate-180 text-primary")}
            />
            {refreshing
              ? t("common.refreshing")
              : ready
                ? t("common.releaseToRefresh")
                : t("common.pullToRefresh")}
          </span>
        </div>
      )}
      {children}
    </div>
  );
};

PullToRefresh.propTypes = {
  onRefresh: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
WebPullToRefresh.propTypes = {
  ...PullToRefresh.propTypes,
  native: PropTypes.bool,
  nativeRefreshing: PropTypes.bool,
  spinnerAt: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  rootRef: PropTypes.shape({ current: PropTypes.any }),
};

export default PullToRefresh;
