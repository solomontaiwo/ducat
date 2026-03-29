import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import Navbar from "../Navbar/Navbar";
import BottomNavigation from "./BottomNavigation";
import TransactionModal from "../Transaction/TransactionModal";
import { useMediaQuery } from "react-responsive";
import PropTypes from "prop-types";
import { FiPlus } from "react-icons/fi";

// Must match the minHeight set in BottomNavigation
const BOTTOM_NAV_HEIGHT_PX = 70;

const AppLayout = ({ children }) => {
  AppLayout.propTypes = {
    children: PropTypes.node.isRequired,
  };

  const location = useLocation();
  const { currentUser } = useAuth();
  const { isDemo, canAddMoreTransactions } = useUnifiedTransactions();
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const [showFabModal, setShowFabModal] = useState(false);

  // Define public routes where navigation is not shown
  const publicRoutes = ["/", "/login", "/register"];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  // Show navigation if:
  // 1. It is not a public route AND
  // 2. (User is authenticated OR is in demo mode)
  const showNavigation = !isPublicRoute && (currentUser || isDemo);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {showNavigation && !isMobile && <Navbar />}

      <main
        className={`flex-1 relative overflow-x-hidden transition-all ${
          showNavigation
            ? "pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pt-20 md:pb-6 px-4 md:px-8"
            : "p-0"
        }`}
      >
        <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
      </main>

      {showNavigation && isMobile && <BottomNavigation />}

      {showNavigation && (
        <>
          <button
            onClick={() => setShowFabModal(true)}
            disabled={isDemo && !canAddMoreTransactions}
            aria-label="Add transaction"
            style={
              isMobile
                ? { bottom: `calc(${BOTTOM_NAV_HEIGHT_PX}px + env(safe-area-inset-bottom) + 1rem)`, right: "1rem" }
                : { bottom: "1.5rem", right: "1.5rem" }
            }
            className="fixed z-50 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl h-14 w-14 transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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

export default AppLayout;