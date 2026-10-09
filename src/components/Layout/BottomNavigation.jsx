import { useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { FiBarChart2, FiHome, FiList, FiPlus, FiUser, FiUserPlus } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";
import { cn } from "../../lib/utils";

export const BOTTOM_NAV_HEIGHT_PX = 76;

/** Floating mobile tab bar with the "new transaction" action in the middle. */
const BottomNavigation = ({ onAdd, addDisabled = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, transactions, maxTransactions } = useUnifiedTransactions();
  const { t } = useTranslation();

  const demoCount = isDemo ? transactions.filter((item) => !item.isSample).length : 0;
  const leading = [
    { key: "/dashboard", icon: FiHome, label: t("navbar.dashboard"), path: "/dashboard" },
    { key: "/transactions", icon: FiList, label: t("navbar.transactions"), path: "/transactions", badge: isDemo ? `${demoCount}/${maxTransactions}` : null },
  ];
  const trailing = [
    { key: "/analytics", icon: FiBarChart2, label: t("navbar.analytics"), path: "/analytics" },
    currentUser
      ? { key: "/profile", icon: FiUser, label: t("navbar.profile"), path: "/profile" }
      : { key: "/register", icon: FiUserPlus, label: t("navbar.register"), path: "/register" },
  ];

  const renderItem = (item) => {
    const isActive = location.pathname === item.path;
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => navigate(item.path)}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold leading-none transition-colors",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
        <span className="max-w-full truncate px-0.5">{item.label}</span>
        {item.badge && (
          <span className="absolute right-1 top-1 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background tabular-nums">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label={t("navbar.mainNavigation")}
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)]"
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <div
        className="mx-auto grid max-w-md grid-cols-5 items-center rounded-[26px] border border-border bg-card/95 px-1.5 shadow-[0_10px_30px_rgb(20_25_36/0.12)] backdrop-blur-xl dark:shadow-[0_10px_30px_rgb(0_0_0/0.5)]"
        style={{ height: `${BOTTOM_NAV_HEIGHT_PX - 12}px` }}
      >
        {leading.map(renderItem)}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onAdd}
            disabled={addDisabled}
            aria-label={t("navbar.add")}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md transition active:scale-95 disabled:opacity-50"
          >
            <FiPlus className="h-6 w-6" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
        {trailing.map(renderItem)}
      </div>
    </nav>
  );
};

BottomNavigation.propTypes = {
  onAdd: PropTypes.func.isRequired,
  addDisabled: PropTypes.bool,
};

export default BottomNavigation;
