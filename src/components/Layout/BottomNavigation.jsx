import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import {
  FiHome,
  FiList,
  FiBarChart,
  FiUser,
  FiLogIn,
  FiUserPlus,
  FiTarget,
  FiPieChart,
} from "react-icons/fi";
import { Badge } from "../ui/badge";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

export const BOTTOM_NAV_HEIGHT_PX = 78;

const BottomNavigation = ({ navVisible }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, transactions, maxTransactions, startDemo } = useUnifiedTransactions();
  const { t } = useTranslation();

  const navigationItems = [
    { key: "/dashboard", icon: <FiHome size={20} />, label: t("navbar.dashboard"), path: "/dashboard" },
    { key: "/transactions", icon: <FiList size={20} />, label: t("navbar.transactions"), path: "/transactions", badge: isDemo ? `${transactions.length}/${maxTransactions}` : null },
    { key: "/analytics", icon: <FiBarChart size={20} />, label: t("navbar.analytics"), path: "/analytics" },
    { key: "/goals", icon: <FiTarget size={20} />, label: t("navbar.goals"), path: "/goals" },
    { key: "/insights", icon: <FiPieChart size={20} />, label: t("navbar.insights"), path: "/insights" },
    ...(currentUser
      ? [{ key: "/profile", icon: <FiUser size={20} />, label: t("navbar.profile"), path: "/profile" }]
      : [
          { key: "login", icon: <FiLogIn size={20} />, label: t("navLogin"), action: () => navigate("/login") },
          { key: "register", icon: <FiUserPlus size={20} />, label: t("navRegister"), action: () => navigate("/register") },
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
      className={`fixed bottom-0 left-0 right-0 z-40 border-t border-border/80 bg-background/95 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-transform duration-300 pb-[env(safe-area-inset-bottom)] ${
        navVisible ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ minHeight: `${BOTTOM_NAV_HEIGHT_PX}px` }}
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
              onClick={() => handleNavigation(item)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              style={{ minHeight: `${BOTTOM_NAV_HEIGHT_PX - 16}px` }}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  isActive
                    ? "bg-gradient-to-br from-primary/20 to-primary/10 text-primary shadow-[0_6px_16px_rgba(37,99,235,0.25)]"
                    : "bg-muted/80 text-foreground"
                }`}
              >
                {item.icon}
              </div>
              <span className="w-full truncate text-center leading-none">{item.label}</span>
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
