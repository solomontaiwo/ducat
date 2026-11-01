import PropTypes from "prop-types";
import { Link, useLocation, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { FiBarChart2, FiHome, FiList, FiLogOut, FiPlus, FiRefreshCw } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils.js";
import { canCheckForUpdates } from "../../services/updaterService";

const logo = `${import.meta.env.BASE_URL}icon-192.png`;

/** Desktop navigation column. */
const Sidebar = ({ onAdd, addDisabled = false }) => {
  const { currentUser, logout, profileName } = useAuth();
  const { isDemo, transactions, maxTransactions, clearTransactions, stopDemo } = useUnifiedTransactions();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const items = [
    { label: t("navbar.dashboard"), path: "/dashboard", icon: FiHome },
    { label: t("navbar.transactions"), path: "/transactions", icon: FiList },
    { label: t("navbar.analytics"), path: "/analytics", icon: FiBarChart2 },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleExitDemo = async () => {
    if (!window.confirm(t("navbar.demoExitConfirm"))) return;
    await clearTransactions?.();
    stopDemo?.();
    navigate("/");
  };

  const displayName = profileName || currentUser?.email || "";
  const demoCount = transactions.filter((item) => !item.isSample).length;

  return (
    <aside className="glass fixed bottom-4 left-4 top-4 z-30 flex w-[232px] flex-col gap-6 rounded-[28px] px-3.5 pb-4 pt-5">
      <Link to="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1">
        <img src={logo} alt="" width="34" height="34" className="h-[34px] w-[34px] rounded-[11px]" />
        <span className="font-display text-[19px] font-extrabold tracking-tight">{t("appName")}</span>
      </Link>

      <Button onClick={onAdd} disabled={addDisabled} size="lg" className="w-full">
        <FiPlus className="h-[18px] w-[18px]" strokeWidth={2.6} aria-hidden="true" />
        {t("navbar.add")}
      </Button>

      <nav aria-label={t("navbar.mainNavigation")} className="flex flex-col gap-1">
        {items.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
                active ? "glass-active text-accent-foreground" : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {canCheckForUpdates() && (
        <Link
          to="/updates"
          aria-current={location.pathname === "/updates" ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors",
            location.pathname === "/updates"
              ? "glass-active text-accent-foreground"
              : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
          )}
        >
          <FiRefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />
          {t("updater.title")}
        </Link>
      )}

      {isDemo && !currentUser && (
        <div className="space-y-3 rounded-2xl bg-foreground/5 p-4">
          <p className="text-sm font-semibold">
            {t("navbar.demoBadge", { count: demoCount, max: maxTransactions })}
          </p>
          <Button className="w-full" onClick={() => navigate("/register")}>{t("navbar.register")}</Button>
          <Button variant="ghost" className="w-full" onClick={handleExitDemo}>{t("navbar.backToHome")}</Button>
        </div>
      )}

      {currentUser && (
        <div className="flex items-center gap-1">
          <Link
            to="/profile"
            aria-current={location.pathname === "/profile" ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-foreground/5",
              location.pathname === "/profile" && "glass-active"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-display text-sm font-bold text-accent-foreground">
              {(displayName || "?").charAt(0).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-bold">{displayName}</span>
              <span className="truncate text-xs font-medium text-muted-foreground">{t("navbar.profileAndSettings")}</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            aria-label={t("navbar.logout")}
            title={t("navbar.logout")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
          >
            <FiLogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      )}
    </aside>
  );
};

Sidebar.propTypes = {
  onAdd: PropTypes.func.isRequired,
  addDisabled: PropTypes.bool,
};

export default Sidebar;
