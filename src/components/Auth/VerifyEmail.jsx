import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider";
import { useNavigate } from "../../router/RouterProvider";
import { useNotification } from "../../utils/notificationUtils";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const RESEND_COOLDOWN_MS = 60_000;

const VerifyEmail = () => {
  const { currentUser, refreshCurrentUser, logout } = useAuth();
  const navigate = useNavigate();
  const notification = useNotification();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const checkVerification = async () => {
    setChecking(true);
    try {
      const refreshed = await refreshCurrentUser();
      if (refreshed?.emailVerified) {
        notification.success(t("auth.verifyEmail.verified"));
        navigate("/dashboard", { replace: true });
      } else {
        notification.info(t("auth.verifyEmail.notVerified"));
      }
    } catch {
      notification.error(t("auth.verifyEmail.checkFailed"));
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (!currentUser?.email || cooldownSeconds > 0) return;
    setSending(true);
    try {
      const { resendVerificationEmail } = await import("../../services/authService.js");
      await resendVerificationEmail(currentUser.email);
      setCooldownSeconds(RESEND_COOLDOWN_MS / 1000);
      notification.success(t("auth.verifyEmail.sent"));
    } catch (error) {
      notification.error(error.code === "auth/too-many-requests"
        ? t("auth.verifyEmail.tooManyRequests")
        : t("auth.verifyEmail.sendFailed"));
    } finally {
      setSending(false);
    }
  };

  const returnToLogin = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const exit = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("auth.verifyEmail.title")}</CardTitle>
          <CardDescription>
            {t("auth.verifyEmail.description", { email: currentUser?.email })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {import.meta.env.MODE === "desktop" && currentUser?.pending && (
            <>
              <p className="text-sm text-muted-foreground">{t("auth.verifyEmail.desktopHint")}</p>
              <Button className="w-full" onClick={returnToLogin}>{t("auth.verifyEmail.desktopLogin")}</Button>
            </>
          )}
          <Button className="w-full" onClick={checkVerification} disabled={checking}>
            {checking ? t("auth.verifyEmail.checking") : t("auth.verifyEmail.check")}
          </Button>
          <Button className="w-full" variant="outline" onClick={resend} disabled={sending || cooldownSeconds > 0}>
            {sending ? t("auth.verifyEmail.sending") : cooldownSeconds > 0 ? t("auth.verifyEmail.resendIn", { seconds: cooldownSeconds }) : t("auth.verifyEmail.resend")}
          </Button>
          <Button className="w-full" variant="ghost" onClick={exit}>{t("auth.verifyEmail.exit")}</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
