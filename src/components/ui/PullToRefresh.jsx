import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { hapticTap } from "../../platform/haptics.js";
import {
  isNativeRefreshAvailable,
  registerNativeRefresh,
  subscribeNativeRefreshAvailability,
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

/**
 * Pull to refresh for mobile views.
 *
 * In the iOS app it hands the gesture to the system refresh control (see
 * `platform/nativeRefresh.js`), on while this page is on screen and no dialog
 * is open. Elsewhere it is a light touch-only version that starts only at the
 * very top of the page, so normal scrolling and horizontal swipes are never
 * interfered with.
 */
const PullToRefresh = ({ onRefresh, disabled = false, children, className }) => {
  const native = useNativeRefreshAvailable();
  const active = useRouteActive();
  const anyDialogOpen = useAnyDialogOpen();
  const latestRefresh = useRef(onRefresh);
  latestRefresh.current = onRefresh;
  const nativeEnabled = native && active && !disabled && !anyDialogOpen;

  useEffect(() => {
    if (!nativeEnabled) return undefined;
    return registerNativeRefresh(() => latestRefresh.current?.());
  }, [nativeEnabled]);

  // Same tree either way, so the page never remounts if the native control
  // turns out to be unavailable; with it, the web gesture stays off.
  return (
    <WebPullToRefresh onRefresh={onRefresh} disabled={disabled || native} className={className}>
      {children}
    </WebPullToRefresh>
  );
};

const WebPullToRefresh = ({ onRefresh, disabled = false, children, className }) => {
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

  return (
    <div
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
          !dragging && "transition-[height,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          visible ? "opacity-100" : "opacity-0"
        )}
        style={{ height: visible ? `${Math.max(refreshing ? 44 : 0, pullDistance)}px` : "0px" }}
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
WebPullToRefresh.propTypes = PullToRefresh.propTypes;

export default PullToRefresh;
