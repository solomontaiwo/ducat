import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider";
import { Link, useNavigate } from "../../router/RouterProvider";
import { useNotification } from "../../utils/notificationUtils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const MIN_LENGTH = 8;

/** Landing page of the password-reset email: the link signs the user in. */
const ResetPassword = () => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();
  const notification = useNotification();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasSession = Boolean(currentUser?.uid);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (password.length < MIN_LENGTH) return setError(t("validation.passwordMin"));
    if (password !== confirmPassword) return setError(t("validation.passwordMismatch"));
    setSaving(true);
    try {
      const { updatePassword } = await import("../../services/authService.js");
      await updatePassword(password);
      notification.success(t("auth.resetPassword.success"));
      navigate("/dashboard", { replace: true });
    } catch (updateError) {
      if (updateError.code === "auth/same-password") setError(t("auth.resetPassword.samePassword"));
      else if (updateError.code === "auth/weak-password") setError(t("errors.weakPassword"));
      else setError(t("auth.resetPassword.error"));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.resetPassword.title")}</CardTitle>
          <CardDescription>
            {loading || hasSession ? t("auth.resetPassword.prompt") : t("auth.resetPassword.invalidLink")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasSession && (
            <form onSubmit={submit} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("auth.resetPassword.newPassword")}</Label>
                <Input id="new-password" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t("auth.resetPassword.confirmPassword")}</Label>
                <Input id="confirm-new-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={saving}>
                {saving ? t("auth.resetPassword.saving") : t("auth.resetPassword.submit")}
              </Button>
            </form>
          )}
          {!loading && !hasSession && (
            <Link className="block text-center text-sm text-primary" to="/forgot-password">{t("auth.resetPassword.requestNew")}</Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
