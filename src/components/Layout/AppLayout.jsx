import { lazy, Suspense, useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { AddTransactionContext } from "../../context/AddTransactionContext.jsx";
import Sidebar from "./Sidebar";
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from "./BottomNavigation";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const TransactionModal = lazy(() => import("../Transaction/TransactionModal"));

// Base swipe routes for authenticated users
const BASE_SWIPE_ROUTES = ["/dashboard", "/transactions", "/analytics", "/profile"];
const SWIPE_THRESHOLD = 60; // px minimum horizontal swipe distance
const SWIPE_MAX_VERTICAL = 80; // px maximum vertical movement to count as horizontal swipe
const PUBLIC_ROUTES = ["/", "/landing", "/login", "/register", "/forgot-password", "/verify-email", "/privacy", "/terms"];

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const { t } = useTranslation();
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  const swipeRoutes = currentUser
    ? BASE_SWIPE_ROUTES
    : BASE_SWIPE_ROUTES.filter((r) => r !== "/profile");

  const touchStartRef = useRef(null);
  const handleTouchStart = useCallback((e) => {
    if (!e.touches || e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const target = e.target;
    if (target instanceof HTMLElement) {
      const interactiveSelector =
        'input, textarea, select, button, [contenteditable="true"], [data-swipe-ignore="true"]';
      if (target.closest(interactiveSelector)) {
        touchStartRef.current = null;
        return;
      }
    }
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return;
    if (!e.changedTouches || e.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dy) > SWIPE_MAX_VERTICAL) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    const currentIndex = swipeRoutes.indexOf(location.pathname);
    if (currentIndex === -1) return;
    if (dx < 0 && currentIndex < swipeRoutes.length - 1) {
      navigate(swipeRoutes[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      navigate(swipeRoutes[currentIndex - 1]);
    }
  }, [swipeRoutes, location.pathname, navigate]);

  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const showNavigation = !isPublicRoute && (currentUser || isDemo);
  const addDisabled = isDemo && !canAddMoreTransactions;

  const openAddTransaction = useCallback(() => {
    if (!addDisabled) setShowAddModal(true);
  }, [addDisabled]);
  const addContext = useMemo(() => ({ openAddTransaction, canAdd: !addDisabled }), [openAddTransaction, addDisabled]);

  const sendVerificationEmail = async () => {
    if (!currentUser) return;
    setIsSendingVerification(true);
    try {
      const { sendEmailVerification } = await import("firebase/auth");
      await sendEmailVerification(currentUser);
    } catch (error) {
      console.error("Unable to send verification email", error);
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <AddTransactionContext.Provider value={addContext}>
      <div
        className="flex min-h-screen flex-col bg-background text-foreground"
        style={{ "--mobile-nav-height": `${BOTTOM_NAV_HEIGHT_PX}px` }}
        onTouchStart={isMobile && showNavigation ? handleTouchStart : undefined}
        onTouchEnd={isMobile && showNavigation ? handleTouchEnd : undefined}
      >
        {showNavigation && !isMobile && <Sidebar onAdd={openAddTransaction} addDisabled={addDisabled} />}

        <main
          className={
            showNavigation
              ? `relative flex-1 overflow-x-hidden px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pl-[calc(248px+2.5rem)] md:pr-10 md:pt-8 md:pb-12 ${isMobile ? "app-content-safe-mobile" : ""}`
              : "relative flex-1 overflow-x-hidden p-0"
          }
        >
          <div className="w-full space-y-5">
            {showNavigation && currentUser && !currentUser.emailVerified && (
              <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p>{t("security.emailVerificationRequired")}</p>
                <button
                  type="button"
                  onClick={sendVerificationEmail}
                  disabled={isSendingVerification}
                  className="shrink-0 rounded-xl border border-warning/50 px-3 py-2 font-semibold disabled:opacity-60"
                >
                  {isSendingVerification ? t("security.sendingVerification") : t("security.resendVerification")}
                </button>
              </div>
            )}
            {children}
          </div>
        </main>

        {showNavigation && isMobile && <BottomNavigation onAdd={openAddTransaction} addDisabled={addDisabled} />}

        {showNavigation && showAddModal && (
          <Suspense fallback={null}>
            <TransactionModal show onClose={() => setShowAddModal(false)} />
          </Suspense>
        )}
      </div>
    </AddTransactionContext.Provider>
  );
};

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppLayout;
