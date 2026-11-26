import { lazy, Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { usePrivacy } from "../../context/PrivacyProvider.jsx";
import { AddTransactionContext } from "../../context/AddTransactionContext.jsx";
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from "./BottomNavigation";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const Sidebar = lazy(() => import("./Sidebar"));
const TransactionModal = lazy(() => import("../Transaction/TransactionModal"));
const AppLockOverlay = lazy(() => import("./AppLockOverlay"));
const OfflineNotice = lazy(() => import("./OfflineNotice"));
const ShortcutsDialog = lazy(() => import("./ShortcutsDialog"));
const DemoImportPrompt = lazy(() => import("./DemoImportPrompt"));

const PUBLIC_ROUTES = ["/", "/landing", "/login", "/register", "/forgot-password", "/verify-email", "/privacy", "/terms"];
const isEditableTarget = (el) => Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions, pendingOfflineCount = 0 } = useUnifiedTransactions();
  const { error: planningError, retry: retryPlanning } = usePlanning();
  const { locked, toggleHideAmounts } = usePrivacy();
  const online = useOnlineStatus();
  const { t } = useTranslation();
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const showNavigation = !isPublicRoute && (currentUser || isDemo);
  const addDisabled = isDemo && !canAddMoreTransactions;
  // Signed up, email not confirmed yet, trying the app with local data only.
  const pendingTrial = isDemo && Boolean(currentUser?.pending);
  // A real, verified account (the demo never runs for one).
  const hasAccount = Boolean(currentUser) && !isDemo;

  const openAddTransaction = useCallback((draft = null) => {
    if (addDisabled) return;
    setAddDraft(draft && typeof draft === "object" && !("nativeEvent" in draft) ? draft : null);
    setShowAddModal(true);
  }, [addDisabled]);
  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddDraft(null);
  }, []);
  const addContext = useMemo(() => ({ openAddTransaction, canAdd: !addDisabled }), [openAddTransaction, addDisabled]);

  // Open prefilled transaction modal from iOS Quick Actions / Shortcuts (`?quickAdd=1&...`).
  useEffect(() => {
    if (!showNavigation || addDisabled || !location.search?.includes("quickAdd=")) return;
    let cancelled = false;
    import("../../utils/quickAddDraft.js").then(({ parseQuickAddSearch }) => {
      if (cancelled) return;
      const draft = parseQuickAddSearch(location.search);
      if (!draft) return;
      openAddTransaction(draft);
      window.history.replaceState(window.history.state, "", location.pathname);
    });
    return () => { cancelled = true; };
  }, [showNavigation, addDisabled, location.search, location.pathname, openAddTransaction]);

  // Global desktop keyboard shortcuts (`N`, `/`, `P`, `1-4`, `?`).
  useEffect(() => {
    if (!showNavigation || locked) return undefined;
    const onKeyDown = (event) => {
      if (event.altKey || isEditableTarget(event.target) || document.querySelector("[role='dialog']")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        if (location.pathname !== "/transactions") navigate("/transactions");
        window.setTimeout(() => document.querySelector("input[type='search']")?.focus(), 60);
        return;
      }
      if (event.metaKey || event.ctrlKey) return;
      if (key === "n") { event.preventDefault(); openAddTransaction(); }
      else if (key === "/") {
        event.preventDefault();
        if (location.pathname !== "/transactions") navigate("/transactions");
        window.setTimeout(() => document.querySelector("input[type='search']")?.focus(), 60);
      } else if (key === "p") { event.preventDefault(); toggleHideAmounts(); }
      else if (key === "1") navigate("/dashboard");
      else if (key === "2") navigate("/transactions");
      else if (key === "3") navigate("/analytics");
      else if (key === "4" && hasAccount) navigate("/profile");
      else if (event.key === "?") { event.preventDefault(); setShowShortcuts(true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showNavigation, locked, location.pathname, navigate, openAddTransaction, toggleHideAmounts, hasAccount]);

  const sendVerificationEmail = async () => {
    if (!currentUser?.email) return;
    setIsSendingVerification(true);
    try {
      const { resendVerificationEmail } = await import("../../services/authService.js");
      await resendVerificationEmail(currentUser.email);
    } catch (error) {
      console.error("Unable to send verification email", error);
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <AddTransactionContext.Provider value={addContext}>
      <div
        className="flex min-h-screen flex-col text-foreground"
        style={{ "--mobile-nav-height": `${BOTTOM_NAV_HEIGHT_PX}px` }}
      >
        {showNavigation && <div className="ambient-backdrop" aria-hidden="true" />}
        {showNavigation && !isMobile && (
          <Suspense fallback={null}>
            <Sidebar onAdd={openAddTransaction} addDisabled={addDisabled} />
          </Suspense>
        )}

        <main
          className={
            showNavigation
              ? `relative flex-1 overflow-x-clip px-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pl-[calc(248px+2.5rem)] md:pr-10 md:pt-8 md:pb-12 ${isMobile ? "app-content-safe-mobile" : ""}`
              : "relative flex-1 overflow-x-clip p-0"
          }
        >
          <div className="w-full space-y-5">
            {showNavigation && (!online || pendingOfflineCount > 0) && (
              <Suspense fallback={null}>
                <OfflineNotice />
              </Suspense>
            )}
            {showNavigation && planningError && (
              <div role="alert" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
                <p>{planningError}</p>
                <button type="button" onClick={retryPlanning} className="rounded-xl border border-warning/50 px-3 py-2 font-semibold">{t("planning.retry")}</button>
              </div>
            )}
            {showNavigation && pendingTrial && (
              <div role="status" className="mx-auto flex max-w-6xl flex-col gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p>{t("demo.pendingTrialNotice", { email: currentUser.email })}</p>
                <button
                  type="button"
                  onClick={() => navigate("/verify-email")}
                  className="shrink-0 rounded-xl border border-warning/50 px-3 py-2 font-semibold"
                >
                  {t("demo.confirmEmail")}
                </button>
              </div>
            )}
            {showNavigation && hasAccount && currentUser.emailVerified && (
              <Suspense fallback={null}>
                <DemoImportPrompt />
              </Suspense>
            )}
            {showNavigation && hasAccount && !currentUser.emailVerified && (
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
            <TransactionModal show initialDraft={addDraft} onClose={closeAddModal} />
          </Suspense>
        )}
        {showNavigation && showShortcuts && (
          <Suspense fallback={null}>
            <ShortcutsDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
          </Suspense>
        )}
        {showNavigation && hasAccount && locked && (
          <Suspense fallback={null}>
            <AppLockOverlay />
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
