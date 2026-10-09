import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useTheme } from "../../utils/ThemeProvider";
import { useNotification } from "../../utils/notificationUtils";
import { useNavigate } from "../../router/RouterProvider";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { firestore } from "../../utils/firebaseFirestore.js";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { buildAccountExport, downloadJson } from "../../utils/accountExport.js";
import { deleteCurrentAccount, requestEmailChange, requestPasswordReset } from "../../services/accountService.js";
import { removeLocalValue, writeLocalValue } from "../../utils/storage.js";

// Account deletion relies on the deleteAccount Cloud Function (Blaze plan).
// Enable it at build time with VITE_ENABLE_ACCOUNT_DELETION=true once it is deployed.
const ACCOUNT_DELETION_ENABLED = import.meta.env.VITE_ENABLE_ACCOUNT_DELETION === "true";

const Profile = () => {
  const { currentUser, loading: userLoading, logout, profileName, profileNameLoading, refreshProfileName } = useAuth();
  const { loading: transactionsLoading, fetchAllTransactions } = useUnifiedTransactions();
  const loading = userLoading || transactionsLoading || profileNameLoading;
  const { theme, toggleTheme } = useTheme();
  const notification = useNotification();
  const navigate = useNavigate();
  const [newUsername, setNewUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [accountAction, setAccountAction] = useState("");
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
          updatedAt: serverTimestamp(),
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
    writeLocalValue("appLanguage", e.target.value);
  };

  const handleExport = async () => {
    setAccountAction("export");
    try {
      const transactions = await fetchAllTransactions({ forceRefresh: true });
      const payload = buildAccountExport({ user: currentUser, profileName: currentUsername, transactions });
      downloadJson(payload, `soldi-sotto-account-${new Date().toISOString().slice(0, 10)}.json`);
      notification.success(t("profile.exportSuccess"));
    } catch (error) {
      console.error("Unable to export account data", error);
      notification.error(t("profile.exportError"));
    } finally {
      setAccountAction("");
    }
  };

  const handlePasswordReset = async () => {
    setAccountAction("password");
    try {
      await requestPasswordReset();
      notification.success(t("profile.passwordResetSuccess"));
    } catch (error) {
      console.error("Unable to request password reset", error);
      notification.error(t("profile.passwordResetError"));
    } finally {
      setAccountAction("");
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim() || !currentPassword) {
      notification.error(t("profile.emailFieldsRequired"));
      return;
    }
    setAccountAction("email");
    try {
      await requestEmailChange(newEmail, currentPassword);
      setNewEmail("");
      setCurrentPassword("");
      notification.success(t("profile.emailChangeSuccess"));
    } catch (error) {
      console.error("Unable to request email change", error);
      notification.error(error.code === "auth/invalid-credential"
        ? t("profile.invalidPassword")
        : t("profile.emailChangeError"));
    } finally {
      setAccountAction("");
    }
  };

  const handleDeleteAccount = async () => {
    if (!currentPassword) {
      notification.error(t("profile.deletePasswordRequired"));
      return;
    }
    const confirmed = window.confirm(t("profile.deleteConfirm"));
    if (!confirmed) return;

    setAccountAction("delete");
    try {
      await deleteCurrentAccount(currentPassword);
      removeLocalValue("soldi-sotto-demo-enabled");
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Unable to delete account", error);
      notification.error(error.code === "functions/failed-precondition"
        ? t("profile.sessionExpired")
        : t("profile.deleteError"));
    } finally {
      setCurrentPassword("");
      setAccountAction("");
    }
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.dataSecurityTitle")}</CardTitle>
            <CardDescription>{t("profile.dataSecurityDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={handleExport} disabled={Boolean(accountAction)}>
              {accountAction === "export" ? t("profile.exporting") : t("profile.exportAllData")}
            </Button>
            <Button variant="outline" onClick={handlePasswordReset} disabled={Boolean(accountAction)}>
              {accountAction === "password" ? t("profile.sending") : t("profile.sendPasswordReset")}
            </Button>
            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="newEmail">{t("profile.newEmail")}</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                autoComplete="email"
                maxLength={254}
              />
              <Label htmlFor="currentPassword">{t("profile.currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
              <Button onClick={handleEmailChange} disabled={Boolean(accountAction)}>
                {accountAction === "email" ? t("profile.sendingVerification") : t("profile.changeEmail")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {ACCOUNT_DELETION_ENABLED && (
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle>{t("profile.deleteAccountTitle")}</CardTitle>
              <CardDescription>
                {t("profile.deleteAccountDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("profile.deleteAccountHelp")}
              </p>
              <Button variant="destructive" onClick={handleDeleteAccount} disabled={Boolean(accountAction)}>
                {accountAction === "delete" ? t("profile.deleting") : t("profile.deleteAccountButton")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default React.memo(Profile);
