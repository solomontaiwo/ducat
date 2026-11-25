import { useCallback, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiRefreshCw } from "react-icons/fi";
import { hapticTap } from "../../platform/haptics.js";
import { cn } from "../../lib/utils.js";

const TRIGGER_PX = 64;
const MAX_PULL_PX = 108;

/**
 * Lightweight touch-only pull-to-refresh wrapper for mobile views.
 * Activates only when the page is already scrolled to the very top so normal
 * scrolling and horizontal swipes are never interfered with.
 */
const PullToRefresh = ({ onRefresh, disabled = false, children, className }) => {
  const { t } = useTranslation();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const startXRef = useRef(null);
  const crossedRef = useRef(false);

  const handleTouchStart = useCallback((event) => {
    if (disabled || refreshing || window.scrollY > 0 || event.touches.length !== 1) return;
    startYRef.current = event.touches[0].clientY;
    startXRef.current = event.touches[0].clientX;
    crossedRef.current = false;
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
          "flex items-center justify-center overflow-hidden transition-[height,opacity] duration-150",
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

export default PullToRefresh;
