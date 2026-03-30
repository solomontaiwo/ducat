import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import { useAuth } from "../context/AuthProvider";
import AppLayout from "../components/Layout/AppLayout";

// Lazy load all main pages for better performance
const loadDashboard = () => import("../components/Dashboard/Dashboard");
const loadTransactionList = () => import("../components/Transaction/TransactionList");
const loadAnalytics = () => import("../components/Analytics/TransactionAnalytics");
const loadStats = () => import("../components/Stats/Stats");
const loadProfile = () => import("../components/Profile/Profile");
const loadBudgetList = () => import("../components/Budgets/BudgetList");
const loadCashflowTimeline = () => import("../components/Cashflow/CashflowTimeline");
const loadHome = () => import("../components/Home/Home");
const loadLandingPage = () => import("../components/Home/LandingPage");

const Dashboard = lazy(loadDashboard);
const TransactionList = lazy(loadTransactionList);
const Analytics = lazy(loadAnalytics);
const Stats = lazy(loadStats);
const Profile = lazy(loadProfile);
const BudgetList = lazy(loadBudgetList);
const CashflowTimeline = lazy(loadCashflowTimeline);
const Home = lazy(loadHome);
const LandingPage = lazy(loadLandingPage);

// Lazy load components for better performance
const loadLogin = () => import("../components/Auth/Login");
const loadRegister = () => import("../components/Auth/Register");

const Login = lazy(loadLogin);
const Register = lazy(loadRegister);

// Loading component
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

// Route guards
const PublicRoute = ({ children }) => {
  PublicRoute.propTypes = {
    children: PropTypes.node.isRequired,
  };
  
  const { currentUser, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  
  // If user is logged in, redirect to dashboard
  if (currentUser) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Page transition variants
const pageVariants = {
  initial: {
    opacity: 0.96,
    y: 8,
    scale: 0.995
  },
  in: {
    opacity: 1,
    y: 0,
    scale: 1
  },
  out: {
    opacity: 0,
    y: -8,
    scale: 0.995
  }
};

const pageTransition = {
  type: "tween",
  ease: [0.22, 1, 0.36, 1],
  duration: 0.18
};

const AppRouter = () => {
  const location = useLocation();
  const { currentUser } = useAuth();

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection?.saveData) return () => {};

    const likelyNextRoutes = currentUser
      ? [loadDashboard, loadTransactionList, loadAnalytics]
      : [loadLogin, loadRegister, loadLandingPage];

    const preload = () => {
      Promise.allSettled(likelyNextRoutes.map((loadRoute) => loadRoute()));
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timeoutId);
  }, [currentUser]);

  const routes = [
    { path: "/", element: <Home /> },
    { path: "/login", element: (
      <PublicRoute>
        <Login />
      </PublicRoute>
    ) },
    { path: "/register", element: (
      <PublicRoute>
        <Register />
      </PublicRoute>
    ) },
    { path: "/dashboard", element: <Dashboard /> },
    { path: "/transactions", element: <TransactionList /> },
    { path: "/analytics", element: <Analytics /> },
    { path: "/stats", element: <Stats /> },
    { path: "/profile", element: <Profile /> },
    { path: "/budgets", element: <BudgetList /> },
    { path: "/cashflow", element: <CashflowTimeline /> },
    { path: "/landing", element: <LandingPage /> },
    { path: "*", element: <Navigate to="/" replace /> },
  ];

  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {routes.map(({ path, element }) => (
            <Route
              key={path}
              path={path}
              element={
                <Suspense fallback={<PageLoader />}>
                  <motion.div
                    initial="initial"
                    animate="in"
                    exit="out"
                    variants={pageVariants}
                    transition={pageTransition}
                    style={{ width: "100%", minHeight: '100vh' }} // Ensure full width for smooth transition
                  >
                    {element}
                  </motion.div>
                </Suspense>
              }
            />
          ))}
        </Routes>
      </AnimatePresence>
    </AppLayout>
  );
};

export default AppRouter;
