import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import Navbar from "../Navbar/Navbar";
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from "./BottomNavigation";
import TransactionModal from "../Transaction/TransactionModal";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { FiPlus } from "react-icons/fi";
import { useTranslation } from "react-i18next";

// Base swipe routes for authenticated users
const BASE_SWIPE_ROUTES = ["/dashboard", "/transactions", "/analytics", "/profile"];
const SWIPE_THRESHOLD = 60; // px minimum horizontal swipe distance
const SWIPE_MAX_VERTICAL = 80; // px maximum vertical movement to count as horizontal swipe

const AppLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const { t } = useTranslation();
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const [showFabModal, setShowFabModal] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  // Only include /profile in swipe routes when authenticated
  const swipeRoutes = currentUser
    ? BASE_SWIPE_ROUTES
    : BASE_SWIPE_ROUTES.filter((r) => r !== "/profile");

  // Scroll-visibility state lives here so the FAB can react to it
  const [navVisible, setNavVisible] = useState(true);
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY;
          setNavVisible(currentY < lastScrollY || currentY < 20);
          lastScrollY = currentY;
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Swipe gesture navigation (mobile only)
  const touchStartRef = useRef(null);
  const handleTouchStart = useCallback((e) => {
    // Ignore multi-touch gestures
    if (!e.touches || e.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }

    // Ignore touches that start on interactive elements or elements opting out
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

    // Only handle single-touch end events
    if (!e.changedTouches || e.changedTouches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    // Only treat as a horizontal swipe if vertical movement is small
    if (Math.abs(dy) > SWIPE_MAX_VERTICAL) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const currentIndex = swipeRoutes.indexOf(location.pathname);
    if (currentIndex === -1) return;

    if (dx < 0 && currentIndex < swipeRoutes.length - 1) {
      // Swipe left → next page
      navigate(swipeRoutes[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      // Swipe right → previous page
      navigate(swipeRoutes[currentIndex - 1]);
    }
  }, [swipeRoutes, location.pathname, navigate]);

  // Define public routes where navigation is not shown
  const publicRoutes = ["/", "/login", "/register"];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  // Show navigation if:
  // 1. It is not a public route AND
  // 2. (User is authenticated OR is in demo mode)
  const showNavigation = !isPublicRoute && (currentUser || isDemo);

  // FAB sits above the nav bar when it's visible; drops to the viewport edge when nav is hidden
  const fabBottom = isMobile
    ? navVisible
      ? `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1rem)`
      : `calc(env(safe-area-inset-bottom) + 1rem)`
    : "1.5rem";

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
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ "--mobile-nav-height": `${BOTTOM_NAV_HEIGHT_PX}px` }}
      onTouchStart={isMobile && showNavigation ? handleTouchStart : undefined}
      onTouchEnd={isMobile && showNavigation ? handleTouchEnd : undefined}
    >
      {showNavigation && !isMobile && <Navbar />}

        <main
          className={`flex-1 relative overflow-x-hidden transition-all ${
            showNavigation
              ? `pt-[calc(env(safe-area-inset-top)+1.5rem)] ${isMobile ? "app-content-safe-mobile" : ""} md:pt-20 md:pb-6 px-4 md:px-8`
              : "p-0"
          }`}
        >
        <div className="mx-auto w-full max-w-6xl space-y-6">
          {showNavigation && currentUser && !currentUser.emailVerified && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p>{t("security.emailVerificationRequired")}</p>
              <button
                type="button"
                onClick={sendVerificationEmail}
                disabled={isSendingVerification}
                className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-2 font-semibold disabled:opacity-60"
              >
                {isSendingVerification ? t("security.sendingVerification") : t("security.resendVerification")}
              </button>
            </div>
          )}
          {children}
        </div>
      </main>

      {showNavigation && isMobile && <BottomNavigation navVisible={navVisible} />}

      {showNavigation && (
        <>
          <button
            onClick={() => setShowFabModal(true)}
            disabled={isDemo && !canAddMoreTransactions}
            aria-label="Add transaction"
            style={{ bottom: fabBottom, right: "1rem", transition: "bottom 0.3s ease", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            className="fixed z-50 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl h-14 w-14 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiPlus className="h-6 w-6" />
          </button>
          <TransactionModal
            show={showFabModal}
            onClose={() => setShowFabModal(false)}
          />
        </>
      )}
    </div>
  );
};

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AppLayout;
