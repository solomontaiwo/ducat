import { lazy, Suspense, useState, useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { usePrivacy } from "../../context/PrivacyProvider.jsx";
import { AddTransactionContext } from "../../context/AddTransactionContext.jsx";
import { BOTTOM_NAV_HEIGHT_PX } from "../../router/tabs.js";
import OfflineNotice from "./OfflineNotice.jsx";
import { currentVault } from "../../services/vaultSession.js";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";
import { useAnyDialogOpen } from "../ui/dialogStack.js";
import { isDesktop as isDesktopApp, isMobile as isMobileApp } from "../../platform/index.js";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const PendingDeviceApproval = lazy(() => import("../Profile/ApproveDeviceSheet.jsx")
  .then(({ PendingDeviceApproval }) => ({ default: PendingDeviceApproval })));
const BottomNavigation = lazy(() => import("./BottomNavigation"));
const Sidebar = lazy(() => import("./Sidebar"));
const loadTransactionModal = () => import("../Transaction/TransactionModal");
const TransactionModal = lazy(loadTransactionModal);
const AppLockOverlay = lazy(() => import("./AppLockOverlay"));
const ShortcutsDialog = lazy(() => import("./ShortcutsDialog"));
const DemoImportPrompt = lazy(() => import("./DemoImportPrompt"));
const NativeNavigationBridge = lazy(() => import("./NativeNavigationBridge"));

const PUBLIC_ROUTES = ["/", "/landing", "/login", "/register", "/forgot-password", "/verify-email", "/privacy", "/terms"];
const isEditableTarget = (el) => Boolean(el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)));

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions, pendingOfflineCount = 0, transactions = [], maxTransactions } = useUnifiedTransactions();
  const { error: planningError, retry: retryPlanning } = usePlanning();
  const { locked, toggleHideAmounts } = usePrivacy();
  const online = useOnlineStatus();
  const { t, i18n } = useTranslation();
  useEffect(() => {
    if (!isDesktopApp() || !navigator.platform.startsWith("Mac")) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_menu_language", { language: i18n.language })).catch(() => {});
  }, [i18n.language]);
  const isMobile = useMediaQuery({ maxWidth: 767 });
  const [showAddModal, setShowAddModal] = useState(false);
  // The native tab bar steps aside while any dialog or sheet is open.
  const anyDialogOpen = useAnyDialogOpen();
  const [hasOpenedAddModal, setHasOpenedAddModal] = useState(false);
  const [addDraft, setAddDraft] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  // True when iOS shows the native tab bar in the vertical bar instead of ours.
  const [nativeNavigation, setNativeNavigation] = useState(false);
  const [nativeProfileNavigation, setNativeProfileNavigation] = useState(false);
  const handleNativeAvailability = useCallback((available, profileNavigation) => {
    setNativeNavigation(available);
    setNativeProfileNavigation(available && profileNavigation);
  }, []);

  const isPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  const showNavigation = !isPublicRoute && (currentUser || isDemo);
  useEffect(() => {
    if (showNavigation) loadTransactionModal().catch(() => {});
  }, [showNavigation]);
  const addDisabled = isDemo && !canAddMoreTransactions;
  // Signed up, email not confirmed yet, trying the app with local data only.
  const pendingTrial = isDemo && Boolean(currentUser?.pending);
  // A real, verified account (the demo never runs for one).
  const hasAccount = Boolean(currentUser) && !isDemo;

  const openAddTransaction = useCallback((draft = null) => {
    if (addDisabled) return;
    setAddDraft(draft && typeof draft === "object" && !("nativeEvent" in draft) ? draft : null);
    setHasOpenedAddModal(true);
    setShowAddModal(true);
  }, [addDisabled]);
  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setAddDraft(null);
  }, []);
  const addContext = useMemo(() => ({ openAddTransaction, canAdd: !addDisabled }), [openAddTransaction, addDisabled]);

  const showWebBottomNav = showNavigation && isMobile && !nativeNavigation;

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

  // Global desktop keyboard shortcuts (`N`/`⌘N`, `/`/`⌘K`, `P`/`⌘⇧P`, `1-6`, `⌘,`, `?`).
  useEffect(() => {
    if (!showNavigation || locked) return undefined;
    const focusSearch = () => {
      if (location.pathname !== "/transactions") navigate("/transactions");
      window.setTimeout(() => document.querySelector("input[type='search']")?.focus(), 60);
    };
    const onKeyDown = (event) => {
      if (event.altKey || isEditableTarget(event.target) || document.querySelector("[role='dialog']")) return;
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (mod && key === "k") { event.preventDefault(); focusSearch(); return; }
      if (mod && key === "n") { event.preventDefault(); openAddTransaction(); return; }
      if (mod && event.shiftKey && key === "p") { event.preventDefault(); toggleHideAmounts(); return; }
      if (mod && key === "," && hasAccount) { event.preventDefault(); navigate("/profile"); return; }
      if (mod) return;
      if (key === "n") { event.preventDefault(); openAddTransaction(); }
      else if (key === "/") { event.preventDefault(); focusSearch(); }
      else if (key === "p") { event.preventDefault(); toggleHideAmounts(); }
      else if (key === "1") navigate("/dashboard");
      else if (key === "2") navigate("/transactions");
      else if (key === "3") navigate("/analytics");
      else if (key === "4" && hasAccount) navigate("/profile");
      else if (key === "5") navigate("/recurring");
      else if (key === "6") navigate("/budgets");
      else if (event.key === "?") { event.preventDefault(); setShowShortcuts(true); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showNavigation, locked, location.pathname, navigate, openAddTransaction, toggleHideAmounts, hasAccount]);

  // Native macOS/desktop menu actions emitted by Tauri.
  useEffect(() => {
    if (!isDesktopApp() || !showNavigation || locked) return undefined;
    let cancelled = false;
    let unlisten = null;
    import("@tauri-apps/api/event").then(async ({ listen }) => {
      if (cancelled) return;
      unlisten = await listen("ducat:menu-action", ({ payload }) => {
        if (payload === "new-transaction") openAddTransaction();
        else if (payload === "focus-search") {
          if (location.pathname !== "/transactions") navigate("/transactions");
          window.setTimeout(() => document.querySelector("input[type='search']")?.focus(), 60);
        } else if (payload === "toggle-privacy") toggleHideAmounts();
        else if (payload === "open-profile" && hasAccount) navigate("/profile");
        else if (payload === "nav-dashboard") navigate("/dashboard");
        else if (payload === "nav-transactions") navigate("/transactions");
        else if (payload === "nav-analytics") navigate("/analytics");
        else if (payload === "nav-recurring") navigate("/recurring");
        else if (payload === "nav-budgets") navigate("/budgets");
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
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
        data-native-profile-navigation={showNavigation && isMobile && nativeProfileNavigation ? "true" : undefined}
        style={{ "--mobile-nav-height": `${showWebBottomNav ? BOTTOM_NAV_HEIGHT_PX : 0}px` }}
      >
        {showNavigation && <div className="top-scroll-fade" aria-hidden="true" />}
        {showNavigation && !isMobile && (
          <Suspense fallback={null}>
            <Sidebar onAdd={openAddTransaction} addDisabled={addDisabled} />
          </Suspense>
        )}

        <main
          className={
            showNavigation
              ? `app-main relative flex-1 overflow-x-clip ${showWebBottomNav ? "app-content-safe-mobile" : isMobile ? "app-content-safe-bottom" : ""}`
              : "relative flex-1 overflow-x-clip p-0"
          }
        >
          <div className="w-full space-y-5">
            {showNavigation && !locked && currentUser?.emailVerified && currentVault(currentUser.uid)?.canPair() && (
              <Suspense fallback={null}>
                <PendingDeviceApproval key={currentUser.uid} uid={currentUser.uid} />
              </Suspense>
            )}
            {showNavigation && (!online || pendingOfflineCount > 0) && (
              <Suspense fallback={null}>
                <OfflineNotice />
              </Suspense>
            )}
            {showNavigation && planningError && (
              <div role="alert" className="workspace-width flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm">
                <p>{planningError}</p>
                <button type="button" onClick={retryPlanning} className="rounded-xl border border-warning/50 px-3 py-2 font-semibold">{t("planning.retry")}</button>
              </div>
            )}
            {showNavigation && pendingTrial && (
              <div role="status" className="workspace-width flex flex-col gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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
              <div className="workspace-width flex flex-col gap-3 rounded-2xl border border-warning/50 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
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

        {showWebBottomNav && <Suspense fallback={null}><BottomNavigation onAdd={openAddTransaction} addDisabled={addDisabled} /></Suspense>}
        {isMobileApp() && (
          <Suspense fallback={null}>
            <NativeNavigationBridge
              onAvailabilityChange={handleNativeAvailability}
              visible={Boolean(showNavigation && isMobile && !showAddModal && !anyDialogOpen && !(hasAccount && locked))}
              layout={isMobile ? "phone" : "sidebar"}
              path={location.pathname}
              badge={isDemo ? `${transactions.filter((item) => !item.isSample).length}/${maxTransactions}` : null}
              addEnabled={!addDisabled}
              profilePath={hasAccount ? "/profile" : pendingTrial ? "/verify-email" : "/register"}
              onNavigate={navigate}
              onAdd={openAddTransaction}
            />
          </Suspense>
        )}

        {showNavigation && hasOpenedAddModal && (
          <Suspense fallback={null}>
            <TransactionModal show={showAddModal} initialDraft={addDraft} onClose={closeAddModal} />
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
