import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import PropTypes from "prop-types";
import { isTabPath } from "./tabs.js";

const RouterContext = createContext(null);
// Location seen by a page kept mounted in the background (see `RouteLocationScope`).
const LocationOverrideContext = createContext(null);

const prefersReducedMotion = () => typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const normalizeBase = (base) => {
  if (!base || base === "/") return "";
  return `/${base.replace(/^\/+|\/+$/g, "")}`;
};

export const normalizeInternalPath = (path) => {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Only absolute internal application paths are allowed");
  }

  const current = new URL(window.location.href);
  const url = new URL(path, current);
  if (url.protocol !== current.protocol || url.host !== current.host) {
    throw new Error("Cross-origin navigation is not allowed");
  }

  return `${url.pathname}${url.search}${url.hash}`;
};

export const RouterProvider = ({ basename = "", children }) => {
  const base = useMemo(() => normalizeBase(basename), [basename]);

  const readLocation = useCallback(() => {
    const rawPath = window.location.pathname.startsWith(base)
      ? window.location.pathname.slice(base.length) || "/"
      : "/";

    return {
      pathname: rawPath.startsWith("/") ? rawPath : `/${rawPath}`,
      search: window.location.search,
      hash: window.location.hash,
      state: window.history.state?.ducatState ?? null,
    };
  }, [base]);

  const [location, setLocation] = useState(readLocation);
  const locationRef = useRef(location);
  locationRef.current = location;
  // Scroll position of each page when the user navigated away from it.
  const scrollMemoryRef = useRef(new Map());
  const getRememberedScroll = useCallback((pathname) => scrollMemoryRef.current.get(pathname), []);

  useEffect(() => {
    const handlePopState = () => setLocation(readLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [readLocation]);

  const navigate = useCallback((to, options = {}) => {
    if (typeof to === "number") {
      window.history.go(to);
      return;
    }

    const normalized = normalizeInternalPath(to);
    const nextUrl = `${base}${normalized}`;
    const historyState = { ducatState: options.state ?? null };
    const from = locationRef.current.pathname;
    scrollMemoryRef.current.set(from, window.scrollY || 0);

    if (options.replace) {
      window.history.replaceState(historyState, "", nextUrl);
    } else {
      window.history.pushState(historyState, "", nextUrl);
    }
    const next = readLocation();
    // Switching between the main tabs cross-fades (View Transitions, where the
    // engine supports them and the user has not asked for reduced motion).
    const fade = from !== next.pathname && isTabPath(from) && isTabPath(next.pathname)
      && typeof document !== "undefined" && typeof document.startViewTransition === "function"
      && !prefersReducedMotion();
    if (fade) {
      document.startViewTransition(() => flushSync(() => setLocation(next)));
    } else {
      setLocation(next);
    }
    // Pages that stay mounted restore their own position (see AppRouter).
    if (!isTabPath(next.pathname)) window.scrollTo?.(0, 0);
  }, [base, readLocation]);

  const value = useMemo(
    () => ({ base, location, navigate, getRememberedScroll }),
    [base, location, navigate, getRememberedScroll]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

RouterProvider.propTypes = {
  basename: PropTypes.string,
  children: PropTypes.node.isRequired,
};

const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) throw new Error("Router hooks must be used inside RouterProvider");
  return context;
};

export const useLocation = () => {
  const override = useContext(LocationOverrideContext);
  const { location } = useRouter();
  return override ?? location;
};
export const useNavigate = () => useRouter().navigate;
export const useOptionalLocation = () => {
  const override = useContext(LocationOverrideContext);
  const router = useContext(RouterContext);
  return override ?? router?.location ?? null;
};
/** Scroll position a page had when the user last navigated away from it. */
export const useRememberedScroll = () => useRouter().getRememberedScroll;

/**
 * Gives a page kept mounted in the background the location it last had while
 * visible, so it does not react to navigations meant for another page (for
 * example the transaction list resetting its filters).
 */
export const RouteLocationScope = ({ active, children }) => {
  const live = useRouter().location;
  const lastRef = useRef(live);
  if (active) lastRef.current = live;
  return <LocationOverrideContext.Provider value={lastRef.current}>{children}</LocationOverrideContext.Provider>;
};

RouteLocationScope.propTypes = {
  active: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
};
export const useOptionalNavigate = () => useContext(RouterContext)?.navigate ?? null;

export const Link = forwardRef(({ to, onClick, target, children, ...props }, ref) => {
  const { base, navigate } = useRouter();
  const normalized = normalizeInternalPath(to);

  const handleClick = (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target === "_blank"
    ) return;

    event.preventDefault();
    navigate(normalized);
  };

  return (
    <a ref={ref} href={`${base}${normalized}`} target={target} onClick={handleClick} {...props}>
      {children}
    </a>
  );
});

Link.displayName = "Link";
Link.propTypes = {
  to: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  target: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export const Navigate = ({ to, replace = false, state = null }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, replace, state, to]);
  return null;
};

Navigate.propTypes = {
  to: PropTypes.string.isRequired,
  replace: PropTypes.bool,
  state: PropTypes.any,
};
