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
  const loading = <main className="flex min-h-screen items-center justify-center" role="status">
    {t("common.loadingPage")}
  </main>;
  return <Suspense fallback={loading}><VaultGate>{children}</VaultGate></Suspense>;
}

AccountAccess.propTypes = { children: PropTypes.node.isRequired };
