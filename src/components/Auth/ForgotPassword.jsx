import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../router/RouterProvider";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { t } = useTranslation();

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { sendPasswordReset } = await import("../../services/authService.js");
      await sendPasswordReset(email);
    } catch (error) {
      // Show the same confirmation either way so the form cannot be used to
      // discover which addresses are registered.
      console.warn("Password reset request failed", error?.code);
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("auth.forgotPassword.title")}</CardTitle>
          <CardDescription>
            {sent
              ? t("auth.forgotPassword.sent")
              : t("auth.forgotPassword.prompt")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent && import.meta.env.MODE === "desktop" && (
            <p className="text-sm text-muted-foreground">{t("auth.forgotPassword.desktopHint")}</p>
          )}
          {!sent && (
            <form onSubmit={submit} className="space-y-3">
              <Label htmlFor="reset-email">{t("auth.emailLabel")}</Label>
              <Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <Button className="w-full" type="submit" disabled={loading}>{loading ? t("auth.forgotPassword.sending") : t("auth.forgotPassword.submit")}</Button>
            </form>
          )}
          <Link className="block text-center text-sm text-primary" to="/login">{t("auth.forgotPassword.backToLogin")}</Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
