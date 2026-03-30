import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import Navbar from "../Navbar/Navbar";
import BottomNavigation, { BOTTOM_NAV_HEIGHT_PX } from "./BottomNavigation";
import TransactionModal from "../Transaction/TransactionModal";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { FiPlus } from "react-icons/fi";

const AppLayout = ({ children }) => {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const [showFabModal, setShowFabModal] = useState(false);

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

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ "--mobile-nav-height": `${BOTTOM_NAV_HEIGHT_PX}px` }}
    >
      {showNavigation && !isMobile && <Navbar />}

        <main
          className={`flex-1 relative overflow-x-hidden transition-all ${
            showNavigation
              ? `pt-[calc(env(safe-area-inset-top)+1.5rem)] ${isMobile ? "app-content-safe-mobile" : ""} md:pt-20 md:pb-6 px-4 md:px-8`
              : "p-0"
          }`}
        >
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>

      {showNavigation && isMobile && <BottomNavigation navVisible={navVisible} />}

      {showNavigation && (
        <>
          <button
            onClick={() => setShowFabModal(true)}
            disabled={isDemo && !canAddMoreTransactions}
            aria-label="Add transaction"
            style={{ bottom: fabBottom, right: "1rem", transition: "bottom 0.3s ease" }}
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
