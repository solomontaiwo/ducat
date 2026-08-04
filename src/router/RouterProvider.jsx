import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";

const RouterContext = createContext(null);

const normalizeBase = (base) => {
  if (!base || base === "/") return "";
  return `/${base.replace(/^\/+|\/+$/g, "")}`;
};

export const normalizeInternalPath = (path) => {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new Error("Only absolute internal application paths are allowed");
  }

  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) {
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
      state: window.history.state?.soldiSottoState ?? null,
    };
  }, [base]);

  const [location, setLocation] = useState(readLocation);

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
    const historyState = { soldiSottoState: options.state ?? null };

    if (options.replace) {
      window.history.replaceState(historyState, "", nextUrl);
    } else {
      window.history.pushState(historyState, "", nextUrl);
    }
    setLocation(readLocation());
    window.scrollTo?.(0, 0);
  }, [base, readLocation]);

  const value = useMemo(() => ({ base, location, navigate }), [base, location, navigate]);

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

export const useLocation = () => useRouter().location;
export const useNavigate = () => useRouter().navigate;

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
