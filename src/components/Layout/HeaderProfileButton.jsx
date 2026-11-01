import PropTypes from "prop-types";
import { FiUserPlus } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { Link } from "../../router/RouterProvider";
import { cn } from "../../lib/utils.js";

/**
 * Mobile-only shortcut to profile and settings, sitting at the right end of a
 * page header (desktop keeps it at the bottom of the sidebar). In demo mode it
 * leads to sign-up instead.
 */
const HeaderProfileButton = ({ className }) => {
  const { t } = useTranslation();
  const { currentUser, profileName } = useAuth();
  const { isDemo } = useUnifiedTransactions();

  if (!currentUser && !isDemo) return null;
  const base = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition md:hidden";

  if (!currentUser) {
    return (
      <Link to="/register" aria-label={t("navbar.register")} className={cn(base, "border border-border bg-card text-foreground hover:bg-muted", className)}>
        <FiUserPlus className="h-[18px] w-[18px]" aria-hidden="true" />
      </Link>
    );
  }

  const initial = (profileName || currentUser.email || "?").charAt(0).toUpperCase();
  return (
    <Link
      to="/profile"
      aria-label={t("navbar.profileAndSettings")}
      data-testid="header-profile"
      className={cn(base, "bg-accent font-display text-[15px] font-bold text-accent-foreground hover:brightness-95", className)}
    >
      {initial}
    </Link>
  );
};

HeaderProfileButton.propTypes = {
  className: PropTypes.string,
};

export default HeaderProfileButton;
