import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useTheme } from "../../utils/ThemeProvider";
import { useNotification } from "../../utils/notificationUtils";
import { useNavigate } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { firestore } from "../../utils/firebase.jsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

const Profile = () => {
  const { currentUser, loading: userLoading, logout, profileName, profileNameLoading, refreshProfileName } = useAuth();
  const { loading: transactionsLoading } = useUnifiedTransactions();
  const loading = userLoading || transactionsLoading || profileNameLoading;
  const { theme, toggleTheme } = useTheme();
  const notification = useNotification();
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (profileName) setCurrentUsername(profileName);
  }, [profileName]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const handleUsernameChange = async () => {
    if (!newUsername.trim() || newUsername.length < 3) {
      notification.error(t("profile.usernameMinLength"));
      return;
    }
    if (newUsername.toLowerCase() === currentUsername.toLowerCase()) {
      notification.info(t("profile.usernameSame"));
      return;
    }
    const confirmed = window.confirm(t("profile.usernameConfirm", { currentUsername, newUsername }));
    if (!confirmed) return;

    setUsernameLoading(true);
    try {
      const normalizedUsername = newUsername.trim();
      await setDoc(
        doc(firestore, "users", currentUser.uid),
        {
          username: normalizedUsername,
          displayName: normalizedUsername,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      await updateProfile(currentUser, {
        displayName: normalizedUsername,
      });

      const updatedProfileName = await refreshProfileName(currentUser);
      setCurrentUsername(updatedProfileName || normalizedUsername);
      setNewUsername("");
      notification.success(t("profile.usernameSuccess"));
    } catch (error) {
      console.error("Errore nell'aggiornamento username:", error);
      let errorMessage = t("profile.usernameError");
      if (error.code === "permission-denied") {
        errorMessage = t("profile.usernamePermissionError");
      } else if (error.code === "network-request-failed") {
        errorMessage = t("profile.usernameNetworkError");
      }
      notification.error(errorMessage);
    } finally {
      setUsernameLoading(false);
    }
  };

  const registrationDate = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).toLocaleDateString(i18n.language === 'it' ? 'it-IT' : 'en-US')
    : t("profile.dateNotAvailable");

  const themeOptions = [
    { value: "light", label: t("profile.themeLight") },
    { value: "dark", label: t("profile.themeDark") },
    { value: "system", label: t("profile.themeSystem") },
  ];

  const languageOptions = [
    { value: "it", label: "Italiano" },
    { value: "en", label: "English" },
  ];

  const handleLanguageChange = (e) => {
    i18n.changeLanguage(e.target.value);
    localStorage.setItem("appLanguage", e.target.value);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-xl border border-border bg-muted animate-pulse" />
        <div className="grid gap-3 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div>
        <Card className="glass">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-xl">
                {(currentUsername || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-2xl">{currentUsername || currentUser?.email}</CardTitle>
                {currentUser?.email && (
                    <CardDescription className="text-sm text-muted-foreground">
                        {t("profile.emailAddress")}: {currentUser.email}
                    </CardDescription>
                )}
                <CardDescription>
                  {t("profile.registeredOn")}: {registrationDate}
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={handleLogout}>
              {t("navbar.logout")}
            </Button>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.editUsername")}</CardTitle>
            <CardDescription>{t("profile.usernameHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>{t("profile.currentUsername")}</Label>
            <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
              {currentUsername || "—"}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newUsername">{t("profile.newUsername")}</Label>
              <Input
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder={t("profile.newUsernamePlaceholder")}
              />
            </div>
            <Button onClick={handleUsernameChange} disabled={usernameLoading}>
              {usernameLoading ? t("profile.updating") : t("save")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("profile.settingsTitle")}</CardTitle>
            <CardDescription>{t("profile.accountInfo")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>{t("profile.theme")}</Label>
              <select
                value={theme}
                onChange={(e) => toggleTheme(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {themeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("profile.language")}</Label>
              <select
                value={i18n.language}
                onChange={handleLanguageChange}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {languageOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default React.memo(Profile);
