import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthProvider";
import { useUnifiedTransactions } from "../context/UnifiedTransactionProvider";
import AppLayout from "../components/Layout/AppLayout";
import { Button } from "../components/ui/button";
import { Navigate, RouteLocationScope, useLocation, useRememberedScroll } from "./RouterProvider";
import { resolveRouteAccess } from "./accessPolicy";
import { TAB_PATHS, isTabPath } from "./tabs.js";

const loaders = {
  dashboard: () => import("../components/Dashboard/Dashboard"),
  transactions: () => import("../components/Transaction/TransactionList"),
  analytics: () => import("../components/Analytics/TransactionAnalytics"),
  profile: () => import("../components/Profile/Profile"),
  updates: () => import("../components/Update/UpdatesPage"),
  recurring: () => import("../components/Planning/RecurringPage"),
  budgets: () => import("../components/Planning/BudgetsPage"),
  home: () => import("../components/Home/Home"),
  landing: () => import("../components/Home/LandingPage"),
  login: () => import("../components/Auth/Login"),
  register: () => import("../components/Auth/Register"),
  verifyEmail: () => import("../components/Auth/VerifyEmail"),
  forgotPassword: () => import("../components/Auth/ForgotPassword"),
  resetPassword: () => import("../components/Auth/ResetPassword"),
  legal: () => import("../components/Legal/LegalPage"),
};

const pages = Object.fromEntries(
  Object.entries(loaders).map(([key, loader]) => [key, lazy(loader)])
);

const PageLoader = () => {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-transparent" role="status" aria-label={t("common.loadingPage")}>
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
};

/** New pages start at the top; the main tabs come back where they were left. */
const ScrollManager = () => {
  const { pathname } = useLocation();
  const getRememberedScroll = useRememberedScroll();
  useLayoutEffect(() => {
    window.scrollTo(0, isTabPath(pathname) ? getRememberedScroll(pathname) ?? 0 : 0);
  }, [pathname, getRememberedScroll]);
  return null;
};

const slowConnection = () => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return Boolean(connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType));
};

/** Shown when the auth client cannot be reached, instead of a public-page flash. */
const AuthUnavailable = () => {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div role="alert" className="max-w-md space-y-3 text-center">
        <h1 className="text-xl font-bold">{t("auth.unavailable.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("auth.unavailable.description")}</p>
        <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
      </div>
    </main>
  );
};

const routeDefinitions = [
  { path: "/", page: "home", access: "public" },
  { path: "/landing", page: "landing", access: "public-only" },
  { path: "/login", page: "login", access: "public-only" },
  { path: "/register", page: "register", access: "public-only" },
  { path: "/forgot-password", page: "forgotPassword", access: "public-only" },
  { path: "/reset-password", page: "resetPassword", access: "public" },
  { path: "/verify-email", page: "verifyEmail", access: "authenticated-unverified" },
  { path: "/privacy", page: "legal", access: "public" },
  { path: "/terms", page: "legal", access: "public" },
  { path: "/dashboard", page: "dashboard", access: "app" },
  { path: "/transactions", page: "transactions", access: "app" },
  { path: "/analytics", page: "analytics", access: "app" },
  { path: "/profile", page: "profile", access: "authenticated" },
  { path: "/updates", page: "updates", access: "app" },
  { path: "/recurring", page: "recurring", access: "app" },
  { path: "/budgets", page: "budgets", access: "app" },
];

const AppRouter = () => {
  const { currentUser, loading: authLoading, authStalled } = useAuth();
  const { isDemo, loading: transactionLoading } = useUnifiedTransactions();
  const location = useLocation();

  // Main tabs kept mounted once opened, per signed-in account (or the demo).
  const session = currentUser?.emailVerified ? currentUser.uid : isDemo ? "demo" : null;
  const [kept, setKept] = useState({ session: null, paths: [] });
  const keptPaths = useMemo(() => (kept.session === session ? kept.paths : []), [kept, session]);

  useEffect(() => {
    if (slowConnection()) return undefined;

    const likelyLoader = currentUser?.emailVerified
      ? loaders.dashboard
      : currentUser
        ? loaders.verifyEmail
        : loaders.landing;
    const preload = () => {
      likelyLoader();
      if (currentUser?.emailVerified) {
        [loaders.transactions, loaders.analytics, loaders.profile].forEach((loader) => loader());
      }
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(preload, 800);
    return () => window.clearTimeout(timeoutId);
  }, [currentUser]);

  const route = routeDefinitions.find((candidate) => candidate.path === location.pathname);
  const redirect = route ? resolveRouteAccess({
    access: route.access,
    currentUser,
    isDemo,
    pathname: location.pathname,
  }) : null;
  const ready = !authLoading && !transactionLoading && !(authStalled && !currentUser);
  const activeTab = ready && route && !redirect && session && isTabPath(route.path) ? route.path : null;
  // Pages inside the app shell keep the opened tabs alive; leaving the app
  // (sign-out, public pages) releases them.
  const inApp = ready && route && !redirect && session && ["app", "authenticated"].includes(route.access);

  useEffect(() => {
    if (activeTab && !keptPaths.includes(activeTab)) {
      setKept({ session, paths: [...keptPaths, activeTab] });
    } else if (!inApp && ready && keptPaths.length) {
      setKept({ session: null, paths: [] });
    }
  }, [activeTab, inApp, keptPaths, ready, session]);

  // Warm up the other tabs once the first one is on screen: their code and
  // data load in the background, so the first switch is instant too.
  useEffect(() => {
    if (!activeTab || keptPaths.length >= TAB_PATHS.length || slowConnection()) return undefined;
    const warm = () => setKept((previous) => {
      if (previous.session !== session) return previous;
      const paths = [...previous.paths];
      for (const path of TAB_PATHS) if (!paths.includes(path)) paths.push(path);
      return { session, paths };
    });
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 4000 });
      else warm();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [activeTab, keptPaths.length, session]);

  if (authStalled && !currentUser) return <AuthUnavailable />;
  if (authLoading || transactionLoading) return <PageLoader />;

  if (!route) return <Navigate to="/" replace />;
  if (redirect) {
    return <Navigate to={redirect} replace state={{ from: location.pathname }} />;
  }

  const visibleTabs = activeTab && !keptPaths.includes(activeTab) ? [...keptPaths, activeTab] : inApp ? keptPaths : [];
  const tabPages = visibleTabs.map((path) => {
    const definition = routeDefinitions.find((candidate) => candidate.path === path);
    const TabPage = pages[definition.page];
    const active = path === activeTab;
    return (
      <div key={path} hidden={!active} data-tab-page={path} className="w-full">
        <RouteLocationScope active={active}>
          <Suspense fallback={active ? <PageLoader /> : null}>
            <TabPage />
          </Suspense>
        </RouteLocationScope>
      </div>
    );
  });

  const Page = pages[route.page];
  return (
    <AppLayout>
      <ScrollManager />
      {tabPages}
      {!activeTab && (
        <Suspense fallback={<PageLoader />}>
          <div className="w-full">
            <Page />
          </div>
        </Suspense>
      )}
    </AppLayout>
  );
};

export default AppRouter;
