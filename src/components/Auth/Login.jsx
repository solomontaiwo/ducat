import { useState } from "react";
import { Link, useNavigate } from "../../router/RouterProvider";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../utils/firebaseAuth";
import { useNotification } from "../../utils/notificationUtils";
import { motion } from "framer-motion";
import { FiArrowLeft, FiEye, FiEyeOff, FiLock, FiLogIn, FiUser } from "react-icons/fi";
import { useMediaQuery } from "react-responsive";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const notification = useNotification();
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const { t } = useTranslation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      notification.success(t("login.title"));
      navigate(credential.user.emailVerified ? "/dashboard" : "/verify-email", { replace: true });
    } catch (err) {
      console.error(t("errors.loginError"), err);
      let errorMessage;
      switch (err.code) {
        case "auth/user-not-found":
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
        case "auth/invalid-credential":
          errorMessage = t("errors.invalidCredentials");
          break;
        default:
          errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-emerald-500/5 to-transparent" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-xl"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="mb-4 gap-2 text-muted-foreground"
        >
          <FiArrowLeft className="h-4 w-4" />
          {t("login.backToHome")}
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary text-2xl">
            💰
          </div>
          <div>
            <h2 className="text-2xl font-semibold">{t("login.title")}</h2>
            <p className="text-muted-foreground text-sm">{t("login.subtitle")}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("login.usernameOrEmail")}</Label>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <FiUser className="text-muted-foreground" />
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

          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring">
              <FiLock className="text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-muted-foreground"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                aria-pressed={showPassword}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            size={isMobile ? "default" : "lg"}
            disabled={loading}
          >
            <FiLogIn className="h-4 w-4" />
            {t("login.loginButton")}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-primary">
            {t("login.registerNow")}
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
