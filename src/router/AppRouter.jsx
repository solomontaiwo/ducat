import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PropTypes from "prop-types";
import { useAuth } from "../context/AuthProvider";
import AppLayout from "../components/Layout/AppLayout";

// Lazy load all main pages for better performance
const Dashboard = lazy(() => import("../components/Dashboard/Dashboard"));
const TransactionList = lazy(() => import("../components/Transaction/TransactionList"));
const Analytics = lazy(() => import("../components/Analytics/TransactionAnalytics"));
const Stats = lazy(() => import("../components/Stats/Stats"));
const Profile = lazy(() => import("../components/Profile/Profile"));
const BudgetList = lazy(() => import("../components/Budgets/BudgetList"));
const CashflowTimeline = lazy(() => import("../components/Cashflow/CashflowTimeline"));
const Home = lazy(() => import("../components/Home/Home"));
const LandingPage = lazy(() => import("../components/Home/LandingPage"));

// Lazy load components for better performance
const Login = lazy(() => import("../components/Auth/Login"));
const Register = lazy(() => import("../components/Auth/Register"));

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
    opacity: 0,
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
  duration: 0.35
};

const AppRouter = () => {
  const location = useLocation();

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
