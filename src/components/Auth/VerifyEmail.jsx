import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
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
        notification.success("Email verificata. Ora puoi usare tutte le funzionalità.");
        navigate("/dashboard", { replace: true });
      } else {
        notification.info("L'email non risulta ancora verificata.");
      }
    } catch {
      notification.error("Impossibile controllare la verifica. Riprova.");
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (!currentUser || cooldownSeconds > 0) return;
    setSending(true);
    try {
      await sendEmailVerification(currentUser);
      setCooldownSeconds(RESEND_COOLDOWN_MS / 1000);
      notification.success("Email di verifica inviata.");
    } catch (error) {
      notification.error(error.code === "auth/too-many-requests"
        ? "Troppi tentativi. Attendi prima di riprovare."
        : "Invio non riuscito. Riprova più tardi.");
    } finally {
      setSending(false);
    }
  };

  const exit = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Verifica la tua email</CardTitle>
          <CardDescription>
            Abbiamo inviato un link a {currentUser?.email}. Aprilo, poi torna qui e controlla la verifica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={checkVerification} disabled={checking}>
            {checking ? "Controllo in corso…" : "Ho verificato l'email"}
          </Button>
          <Button className="w-full" variant="outline" onClick={resend} disabled={sending || cooldownSeconds > 0}>
            {sending ? "Invio in corso…" : cooldownSeconds > 0 ? `Invia di nuovo tra ${cooldownSeconds}s` : "Invia di nuovo"}
          </Button>
          <Button className="w-full" variant="ghost" onClick={exit}>Esci</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
