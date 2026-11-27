import { lazy, Suspense } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useLocation } from "../router/RouterProvider.jsx";
import { useAuth } from "./AuthProvider.jsx";

const VaultGate = lazy(() => import("../components/Auth/VaultGate.jsx"));

export default function AccountAccess({ children }) {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  if (!currentUser?.emailVerified || pathname === "/reset-password") return children;
  const loading = (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background" role="status" aria-label={t("common.loadingPage")}>
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </main>
  );
  return <Suspense fallback={loading}><VaultGate>{children}</VaultGate></Suspense>;
}

AccountAccess.propTypes = { children: PropTypes.node.isRequired };
