import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import { useAuth } from "../context/AuthProvider";
import { useUnifiedTransactions } from "../context/UnifiedTransactionProvider";
import AppLayout from "../components/Layout/AppLayout";
import { Navigate, useLocation } from "./RouterProvider";
import { resolveRouteAccess } from "./accessPolicy";

const loaders = {
  dashboard: () => import("../components/Dashboard/Dashboard"),
  transactions: () => import("../components/Transaction/TransactionList"),
  analytics: () => import("../components/Analytics/TransactionAnalytics"),
  stats: () => import("../components/Stats/Stats"),
  profile: () => import("../components/Profile/Profile"),
  home: () => import("../components/Home/Home"),
  landing: () => import("../components/Home/LandingPage"),
  login: () => import("../components/Auth/Login"),
  register: () => import("../components/Auth/Register"),
  verifyEmail: () => import("../components/Auth/VerifyEmail"),
  forgotPassword: () => import("../components/Auth/ForgotPassword"),
  legal: () => import("../components/Legal/LegalPage"),
};

const pages = Object.fromEntries(
  Object.entries(loaders).map(([key, loader]) => [key, lazy(loader)])
);

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-label="Caricamento pagina">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const routeDefinitions = [
  { path: "/", page: "home", access: "public" },
  { path: "/landing", page: "landing", access: "public-only" },
  { path: "/login", page: "login", access: "public-only" },
  { path: "/register", page: "register", access: "public-only" },
  { path: "/forgot-password", page: "forgotPassword", access: "public-only" },
  { path: "/verify-email", page: "verifyEmail", access: "authenticated-unverified" },
  { path: "/privacy", page: "legal", access: "public" },
  { path: "/terms", page: "legal", access: "public" },
  { path: "/dashboard", page: "dashboard", access: "app" },
  { path: "/transactions", page: "transactions", access: "app" },
  { path: "/analytics", page: "analytics", access: "app" },
  { path: "/stats", page: "stats", access: "app" },
  { path: "/profile", page: "profile", access: "authenticated" },
];

const AppRouter = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { isDemo, loading: transactionLoading } = useUnifiedTransactions();
  const location = useLocation();

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType)) return undefined;

    const likelyLoader = currentUser?.emailVerified
      ? loaders.dashboard
      : currentUser
        ? loaders.verifyEmail
        : loaders.landing;
    const preload = () => likelyLoader();

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = window.setTimeout(preload, 800);
    return () => window.clearTimeout(timeoutId);
  }, [currentUser]);

  if (authLoading || transactionLoading) return <PageLoader />;

  const route = routeDefinitions.find((candidate) => candidate.path === location.pathname);
  if (!route) return <Navigate to="/" replace />;

  const redirect = resolveRouteAccess({
    access: route.access,
    currentUser,
    isDemo,
    pathname: location.pathname,
  });
  if (redirect) {
    return <Navigate to={redirect} replace state={{ from: location.pathname }} />;
  }

  const Page = pages[route.page];
  return (
    <AppLayout>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <div style={{ width: "100%", minHeight: "100vh" }}>
          <Page />
        </div>
      </Suspense>
    </AppLayout>
  );
};

export default AppRouter;
