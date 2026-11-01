import { useState } from "react";
import { Link, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider";
import { useNotification } from "../../utils/notificationUtils";
import { FiMail, FiUser, FiUserPlus } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import AuthShell from "./AuthShell.jsx";
import PasswordField from "./PasswordField.jsx";
import { registrationSchema } from "../../schemas/profile";

const Register = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { markPendingVerification } = useAuth();
  const notification = useNotification();
  const { t, i18n } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const validation = registrationSchema.safeParse({ username, email, password, confirmPassword });
    if (!validation.success) {
      setError(t(validation.error.issues[0].message));
      setLoading(false);
      return;
    }

    try {
      const { username: usernameTrimmed, email: normalizedEmail } = validation.data;

      // The profile row is created by the database from the display name.
      const { signUp } = await import("../../services/authService.js");
      const { user, hasSession } = await signUp({
        email: normalizedEmail, password, displayName: usernameTrimmed, language: i18n?.resolvedLanguage || i18n?.language,
      });

      notification.success(t("errors.accountCreatedSuccess"));
      if (hasSession && user?.emailVerified) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (!hasSession) markPendingVerification(normalizedEmail);
      navigate("/verify-email", { replace: true });
    } catch (err) {
      let errorMessage;
      switch (err.code) {
        case "auth/email-already-in-use":
          errorMessage = t("errors.emailAlreadyInUse");
          break;
        case "auth/invalid-email":
          errorMessage = t("errors.invalidEmail");
          break;
        case "auth/weak-password":
          errorMessage = t("errors.weakPassword");
          break;
        case "auth/operation-not-allowed":
          errorMessage = t("errors.operationNotAllowed");
          break;
        default:
          console.error("Errore durante la registrazione:", err);
          errorMessage = t("errors.generic");
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      error={error}
      footer={(
        <>
          {t("register.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-primary">
            {t("register.loginNow")}
          </Link>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">{t("profile.username")}</Label>
          <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
            <FiUser className="text-muted-foreground" aria-hidden="true" />
            <Input
              id="username"
              type="text"
              placeholder="solomon"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0"
              autoComplete="username"
              minLength={3}
              maxLength={50}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t("auth.emailLabel")}</Label>
          <div className="flex items-center gap-2 rounded-xl border border-input bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
            <FiMail className="text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <PasswordField
          id="password"
          label={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />

        <PasswordField
          id="confirm"
          label={t("register.confirmPassword")}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />

        <Button type="submit" className="w-full gap-2" size="lg" disabled={loading}>
          <FiUserPlus className="h-4 w-4" aria-hidden="true" />
          {t("register.registerButton")}
        </Button>
      </form>
    </AuthShell>
  );
};

export default Register;
