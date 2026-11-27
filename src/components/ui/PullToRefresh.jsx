import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/** Keeps the spinner long enough to read as a refresh, even with cached data. */
export const MIN_REFRESH_MS = 450;
const NATIVE_SPINNER_PX = 52;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The iOS activity indicator: eight ticks fading in turn. */
const IosSpinner = ({ paused }) => (
  <span className={cn("ios-spinner text-muted-foreground", paused && "is-paused")} aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
  </span>
);
IosSpinner.propTypes = { paused: PropTypes.bool };

/**
 * Pull to refresh for mobile views.
 *
 * In the iOS app the gesture belongs to the system refresh control (see
 * `platform/nativeRefresh.js`), on while this page is on screen and no dialog
 * is open; once released, the spinner shows here, in the content, so the
 * background and the bars never move. Elsewhere it is a light touch-only
 * version that starts only at the very top of the page, so normal scrolling
 * and horizontal swipes are never interfered with.
 */
const PullToRefresh = ({ onRefresh, disabled = false, children, className }) => {
  const native = useNativeRefreshAvailable();
  const active = useRouteActive();
  const anyDialogOpen = useAnyDialogOpen();
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  const rootRef = useRef(null);
  const latestRefresh = useRef(onRefresh);
  latestRefresh.current = onRefresh;
  const nativeEnabled = native && active && !disabled && !anyDialogOpen;

  useEffect(() => {
    if (!nativeEnabled) return undefined;
    return registerNativeRefresh(async () => {
      setNativeRefreshing(true);
      const started = Date.now();
      try {
        await latestRefresh.current?.();
      } finally {
        const remaining = MIN_REFRESH_MS - (Date.now() - started);
        if (remaining > 0) await wait(remaining);
        setNativeRefreshing(false);
      }
    }, () => {
      const rect = rootRef.current?.getBoundingClientRect();
      return rect && rect.width > 0 ? rect.left + rect.width / 2 : undefined;
    });
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
      rootRef={rootRef}
      className={className}
    >
      {children}
    </WebPullToRefresh>
  );
};

const WebPullToRefresh = ({ onRefresh, disabled = false, native = false, nativeRefreshing = false, rootRef, children, className }) => {
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

  const visible = nativeRefreshing || refreshing || pullDistance > 8;
  const ready = pullDistance >= TRIGGER_PX;
  const height = nativeRefreshing ? NATIVE_SPINNER_PX : Math.max(refreshing ? 44 : 0, pullDistance);

  return (
    <div
      ref={rootRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={className}
    >
      <div
        aria-live="polite"
        className={cn(
          // Follows the finger while dragging; eases back on release.
          "flex items-center justify-center overflow-hidden motion-reduce:transition-none",
          !dragging && "transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          // Takes over from the native spinner, which fades out as quickly.
          nativeRefreshing && "[transition-duration:300ms,150ms]",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ height: visible ? `${height}px` : "0px" }}
      >
        {/* With the native gesture this area only ever shows the spinner, also
            while it fades away. */}
        {native ? (
          <>
            <IosSpinner paused={!nativeRefreshing} />
            {nativeRefreshing && <span className="sr-only">{t("common.refreshing")}</span>}
          </>
        ) : (
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
        )}
      </div>
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
  rootRef: PropTypes.shape({ current: PropTypes.any }),
};

export default PullToRefresh;
