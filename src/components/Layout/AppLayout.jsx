import { lazy, Suspense, useState, useCallback, useMemo } from "react";
import { useLocation } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { AddTransactionContext } from "../../context/AddTransactionContext.jsx";
import Sidebar from "./Sidebar";
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from "./BottomNavigation";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const TransactionModal = lazy(() => import("../Transaction/TransactionModal"));

const PUBLIC_ROUTES = ["/", "/landing", "/login", "/register", "/forgot-password", "/verify-email", "/privacy", "/terms"];

const AppLayout = ({ children }) => {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const { t } = useTranslation();
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

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
