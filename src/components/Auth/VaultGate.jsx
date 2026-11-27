import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider.jsx";
import { isMobile } from "../../platform/index.js";
import { archiveKeychain } from "../../platform/authStorage.js";
import { clearOfflineForUser } from "../../utils/offlineCache.js";
import { createVaultKeys, decodeBytes, encodeBytes, newRecoveryCode, unwrapVaultKey } from "../../utils/vaultCrypto.js";
import { loadVaultAccount, openVault, startVault, watchVaultAccount } from "../../services/vaultService.js";
import { hasLegacyVaultQueue, runVaultQueue } from "../../services/vaultQueue.js";
import { currentVault, setCurrentVault } from "../../services/vaultSession.js";
import { Button } from "../ui/button.jsx";
import { Label } from "../ui/label.jsx";
import { Input } from "../ui/input.jsx";
import Sheet from "../ui/sheet.jsx";

const setupEnabled = import.meta.env.VITE_ENABLE_ENCRYPTED_VAULT === "true";

const VaultAccess = ({ uid, logout, children }) => {
  const { t } = useTranslation();
  const [account, setAccount] = useState(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [usingCode, setUsingCode] = useState(false);
  const [credential, setCredential] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState(false);
  const [remember, setRemember] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const alive = useRef(false);
  const processing = useRef(false);
  const opening = useRef(null);

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      opening.current?.close();
      if (currentVault(uid)) setCurrentVault(null);
    };
  }, [uid]);

  const unlock = useCallback(async (current, bytes, keepKey) => {
    const archive = await openVault(uid, bytes);
    opening.current = archive;
    try {
      if (!alive.current) return;
      await archive.initialize(current);
      if (!current.active) await archive.migrate();
      if (hasLegacyVaultQueue(uid)) await runVaultQueue(uid, () => {}, archive);
      clearOfflineForUser(uid);
      if (!alive.current) return;
      if (keepKey) await archiveKeychain.set(uid, encodeBytes(bytes)).catch(() => {});
      if (!alive.current) return;
      setCurrentVault(archive);
      setReady(true);
      setCredential("");
      setConfirmation("");
      setCode("");
      opening.current = null;
    } finally {
      if (opening.current === archive) {
        archive.close();
        opening.current = null;
      }
    }
  }, [uid]);

  const load = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = await loadVaultAccount(uid);
      if (!alive.current) return;
      setAccount(current);
      if (!current && setupEnabled) setCode((previous) => previous || newRecoveryCode());
      const remembered = current?.active && await archiveKeychain.get(uid).catch(() => null);
      if (remembered && alive.current) {
        const bytes = decodeBytes(remembered);
        try { await unlock(current, bytes, false); }
        catch { await archiveKeychain.remove(uid).catch(() => {}); }
        finally { bytes.fill(0); }
      }
    } catch (failure) {
      if (!alive.current) return;
      if (!setupEnabled && (navigator.onLine === false || ["42P01", "PGRST205"].includes(failure.code))) setAccount(null);
      else setError("unavailable");
    } finally {
      processing.current = false;
      if (alive.current) setBusy(false);
    }
  }, [uid, unlock]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (account !== null) return undefined;
    let first = true;
    return watchVaultAccount(uid, () => {
      if (first) { first = false; return; }
      load();
    });
  }, [account, load, uid]);

  const submit = async (event) => {
    event.preventDefault();
    if (processing.current) return;
    const setup = account === null;
    if (setup && (credential.length < 16 || credential !== confirmation || !savedCode)) {
      setError(credential !== confirmation ? "mismatch" : "requirements");
      return;
    }
    processing.current = true;
    setBusy(true);
    setError(null);
    let bytes;
    let current = account;
    try {
      if (setup) {
        const keys = await createVaultKeys(uid, credential, code);
        if (!alive.current) return;
        const created = await startVault(uid, keys);
        current = await loadVaultAccount(uid);
        if (!alive.current) return;
        setAccount(current);
        if (!created) { setError("alreadySetUp"); return; }
      }
      try { bytes = await unwrapVaultKey(uid, current.keys, credential, usingCode); }
      catch { setError("invalid"); return; }
      if (alive.current) await unlock(current, bytes, remember);
    } catch {
      if (alive.current) setError(current?.active ? "unavailable" : "migrationError");
    } finally {
      bytes?.fill(0);
      processing.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const removeAccount = async (event) => {
    event.preventDefault();
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      const { deleteCurrentAccount } = await import("../../services/accountService.js");
      await deleteCurrentAccount(password);
    } catch {
      if (alive.current) setError("deleteError");
    } finally {
      processing.current = false;
      if (alive.current) setBusy(false);
    }
  };

  if (ready || (account === null && !setupEnabled)) return children;
  const setup = account === null;
  const description = setup ? "setupDescription" : account?.active ? "unlockDescription" : "migrationDescription";
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="surface w-full max-w-md space-y-4 rounded-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold">{t(setup ? "vault.setup" : "vault.title")}</h1>
        {account !== undefined && <p className="text-sm text-muted-foreground">{t(`vault.${description}`)}</p>}
        {error && !deleting && <p role="alert" className="text-sm text-destructive">{t(`vault.${error}`)}</p>}
        {account === undefined ? (busy
          ? <p role="status">{t("common.loadingPage")}</p>
          : <Button onClick={load}>{t("common.retry")}</Button>) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="archive-credential">{t(usingCode ? "vault.recovery" : "vault.passphrase")}</Label>
              <Input id="archive-credential" type="password" autoComplete={setup ? "new-password" : "off"} required
                minLength={setup ? 16 : undefined} maxLength={1024} value={credential} disabled={busy}
                onChange={(event) => setCredential(event.target.value)} />
            </div>
            {setup && <>
              <div className="space-y-2">
                <Label htmlFor="archive-confirm">{t("vault.confirm")}</Label>
                <Input id="archive-confirm" type="password" autoComplete="new-password" required maxLength={1024}
                  value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("vault.recovery")}</p>
                <p className="select-all break-all rounded-xl bg-muted p-3 font-mono text-sm">{code}</p>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" required checked={savedCode} disabled={busy} onChange={(event) => setSavedCode(event.target.checked)} />
                  {t("vault.savedRecovery")}
                </label>
              </div>
            </>}
            {isMobile() && <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
              {t("vault.remember")}
            </label>}
            <Button type="submit" className="w-full" disabled={busy}>{t(busy ? "vault.opening" : setup ? "vault.activate" : "vault.unlock")}</Button>
            {!setup && <Button variant="ghost" className="w-full" disabled={busy} onClick={() => {
              setUsingCode(!usingCode);
              setCredential("");
              setError(null);
            }}>{t(usingCode ? "vault.usePassphrase" : "vault.useRecovery")}</Button>}
          </form>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => logout().catch(() => setError("unavailable"))}>{t("navbar.logout")}</Button>
          {import.meta.env.VITE_ENABLE_ACCOUNT_DELETION !== "false" && (
            <Button variant="ghost" disabled={busy} onClick={() => { setError(null); setDeleting(true); }}>{t("profile.deleteAccountButton")}</Button>
          )}
        </div>
        {deleting && <Sheet open title={t("profile.deleteAccountButton")} description={t("vault.deleteDescription")}
          onOpenChange={(open) => { if (!open && !busy) { setDeleting(false); setPassword(""); setError(null); } }}>
          <form onSubmit={removeAccount} className="space-y-3">
            <Label htmlFor="archive-delete-password">{t("vault.loginPassword")}</Label>
            <Input id="archive-delete-password" type="password" autoComplete="current-password" required disabled={busy}
              value={password} onChange={(event) => setPassword(event.target.value)} />
            {error && <p role="alert" className="text-sm text-destructive">{t(`vault.${error}`)}</p>}
            <Button variant="destructive" type="submit" disabled={busy}>{t(busy ? "profile.deleting" : "profile.deleteAccountButton")}</Button>
          </form>
        </Sheet>}
      </div>
    </main>
  );
};

VaultAccess.propTypes = { uid: PropTypes.string.isRequired, logout: PropTypes.func.isRequired, children: PropTypes.node.isRequired };

export default function VaultGate({ children }) {
  const { currentUser, logout } = useAuth();
  return <VaultAccess key={currentUser.uid} uid={currentUser.uid} logout={logout}>{children}</VaultAccess>;
}
VaultGate.propTypes = { children: PropTypes.node.isRequired };
