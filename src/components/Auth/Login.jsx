import { useState } from "react";
import { Link, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useNotification } from "../../utils/notificationUtils";
import { FiLogIn, FiUser } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import AuthShell from "./AuthShell.jsx";
import PasswordField from "./PasswordField.jsx";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { markPendingVerification } = useAuth();
  const notification = useNotification();
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t("errors.missingCredentials"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const { signIn } = await import("../../services/authService.js");
      const user = await signIn(email, password);
      notification.success(t("login.success"));
      navigate(user?.emailVerified ? "/dashboard" : "/verify-email", { replace: true });
    } catch (err) {
      if (err.code === "auth/email-not-verified") {
        markPendingVerification(email);
        navigate("/verify-email", { replace: true });
        return;
      }
      let errorMessage;
      switch (err.code) {
        case "auth/user-not-found":
        case "auth/invalid-credential":
          errorMessage = t("errors.invalidCredentials");
          break;
        case "auth/wrong-password":
          errorMessage = t("errors.wrongPassword");
          break;
        case "auth/invalid-email":
          errorMessage = t("errors.invalidEmail");
          break;
        case "auth/too-many-requests":
          errorMessage = t("errors.tooManyRequests");
          break;
        default:
          console.error(t("errors.loginError"), err);
          errorMessage = t("errors.generic");
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      error={error}
      footer={(
        <>
          {t("login.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-primary">
            {t("login.registerNow")}
          </Link>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("login.usernameOrEmail")}</Label>
          <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
            <FiUser className="text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              placeholder={t("login.usernameOrEmailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0"
              autoComplete="email"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("login.usernameOrEmailHelp")}</p>
        </div>

        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-medium text-primary">
            {t("auth.forgotPassword.link")}
          </Link>
        </div>

        <PasswordField
          id="password"
          label={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder={t("login.passwordPlaceholder")}
        />

        <Button type="submit" className="w-full gap-2" size="lg" disabled={loading}>
          <FiLogIn className="h-4 w-4" aria-hidden="true" />
          {t("login.loginButton")}
        </Button>
      </form>
    </AuthShell>
  );
};

export default Login;
