import { useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import {
  FiHome,
  FiList,
  FiBarChart,
  FiUser,
  FiLogIn,
  FiUserPlus,
} from "react-icons/fi";
import { Badge } from "../ui/badge";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

export const BOTTOM_NAV_HEIGHT_PX = 72;

const BottomNavigation = ({ navVisible }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, transactions, maxTransactions, startDemo } = useUnifiedTransactions();
  const { t } = useTranslation();

  const navigationItems = [
    { key: "/dashboard", icon: <FiHome size={22} />, label: t("navbar.dashboard"), path: "/dashboard" },
    { key: "/transactions", icon: <FiList size={22} />, label: t("navbar.transactions"), path: "/transactions", badge: isDemo ? `${transactions.length}/${maxTransactions}` : null },
    { key: "/analytics", icon: <FiBarChart size={22} />, label: t("navbar.analytics"), path: "/analytics" },
    ...(currentUser
      ? [{ key: "/profile", icon: <FiUser size={22} />, label: t("navbar.profile"), path: "/profile" }]
      : [
          { key: "login", icon: <FiLogIn size={22} />, label: t("navLogin"), action: () => navigate("/login") },
          { key: "register", icon: <FiUserPlus size={22} />, label: t("navRegister"), action: () => navigate("/register") },
        ]),
  ];

  const handleNavigation = (item) => {
    if (item.action) {
      item.action();
    } else {
      navigate(item.path);
    }
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)] ${
        navVisible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ minHeight: `${BOTTOM_NAV_HEIGHT_PX}px`, transition: "transform 0.25s ease" }}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <div
        className="mx-auto grid max-w-5xl items-center px-2"
        style={{ height: `${BOTTOM_NAV_HEIGHT_PX}px`, gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))` }}
      >
        {navigationItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.key}
              aria-label={item.label}
              onClick={() => handleNavigation(item)}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ minHeight: `${BOTTOM_NAV_HEIGHT_PX - 12}px`, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                    : "text-foreground"
                }`}
              >
                {item.icon}
              </div>
              <span className="max-w-full truncate text-[10px] font-medium leading-none">{item.label}</span>
              {item.badge && (
                <Badge variant="secondary" className="absolute -top-1 -right-2">
                  {item.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
      {!currentUser && !isDemo && (
        <div className="px-4 pb-3">
          <button
            onClick={startDemo}
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            className="w-full rounded-xl bg-gradient-to-r from-primary to-emerald-500 py-2 text-sm font-semibold text-white shadow-lg"
          >
            {t("landing.tryDemo")}
          </button>
        </div>
      )}
    </div>
  );
};

BottomNavigation.propTypes = {
  navVisible: PropTypes.bool.isRequired,
};

export default BottomNavigation;
