import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { archiveKeychain } from "../../platform/authStorage.js";
import { clearOfflineForUser } from "../../utils/offlineCache.js";
import { createRecoveryVault, decodeBytes, encodeBytes, isVaultPin, newRecoveryCode, unwrapVaultKey } from "../../utils/vaultCrypto.js";
import { clearVaultDeviceSession, isVaultPinLocked, loadVaultPin, rememberVaultDeviceSession, resumeVaultDeviceSession, saveVaultPin, verifyVaultPin } from "../../utils/vaultDeviceUnlock.js";
import { loadVaultAccount, openVault, startVault, vaultAuthSession, watchVaultAccount } from "../../services/vaultService.js";
import { hasLegacyVaultQueue, runVaultQueue } from "../../services/vaultQueue.js";
import { currentVault, setCurrentVault } from "../../services/vaultSession.js";
import { Button } from "../ui/button.jsx";
import { Label } from "../ui/label.jsx";
import { Input } from "../ui/input.jsx";
import Sheet from "../ui/sheet.jsx";

const RequestDeviceSheet = lazy(() => import("./RequestDeviceSheet.jsx"));
const setupEnabled = import.meta.env.VITE_ENABLE_ENCRYPTED_VAULT === "true";

const VaultAccess = ({ uid, logout, children }) => {
  const { t } = useTranslation();
  const notification = useNotification();
  const [account, setAccount] = useState(undefined);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [usingCode, setUsingCode] = useState(false);
  const [credential, setCredential] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [savedCode, setSavedCode] = useState(false);
  const [remember, setRemember] = useState(false);
  const [deviceKey, setDeviceKey] = useState(null);
  const [pinEntry, setPinEntry] = useState(null);
  const [keepSession, setKeepSession] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [paired, setPaired] = useState(false);
  const pairedKey = useRef(null);
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
      pairedKey.current?.fill(0);
      pairedKey.current = null;
      if (currentVault(uid)) setCurrentVault(null);
    };
  }, [uid]);

  const unlock = useCallback(async (current, bytes, keepKey, trustedPin) => {
    const archive = await openVault(uid, bytes);
    opening.current = archive;
    try {
      if (!alive.current) return;
      await archive.initialize(current);
      if (!current.active) await archive.migrate();
      if (hasLegacyVaultQueue(uid)) await runVaultQueue(uid, () => {}, archive);
      clearOfflineForUser(uid);
      if (!alive.current) return;
      if (keepKey) {
        const saved = await archiveKeychain.set(uid, encodeBytes(bytes)).catch(() => false);
        if (!alive.current && saved) await archiveKeychain.remove(uid).catch(() => {});
        if (alive.current && !saved) notification.warning(t("vault.deviceSaveError"));
      }
      if (trustedPin && alive.current) {
        await vaultAuthSession(uid).then((session) => rememberVaultDeviceSession(uid, trustedPin, bytes, session)).catch(() => notification.warning(t("vault.sessionSaveError")));
        if (!alive.current) await clearVaultDeviceSession(uid);
      }
      if (!alive.current) return;
      setCurrentVault(archive);
      setReady(true);
      pairedKey.current?.fill(0);
      pairedKey.current = null;
      setCredential("");
      setPin("");
      setConfirmation("");
      setCode("");
      opening.current = null;
    } finally {
      if (opening.current === archive) {
        archive.close();
        opening.current = null;
      }
    }
  }, [uid, notification, t]);

  const load = useCallback(async () => {
    if (processing.current || currentVault(uid)) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      const current = await loadVaultAccount(uid);
      if (!alive.current) return;
      setAccount(current);
      if (!current && setupEnabled) setCode((previous) => previous || newRecoveryCode());
      const [localKey, localPin] = await Promise.all([
        archiveKeychain.status(uid).catch(() => null),
        loadVaultPin(uid, current?.keys).catch(() => null),
      ]);
      if (!alive.current) return;
      setDeviceKey(localKey);
      setPinEntry(localPin);
      if (current?.active && localPin) {
        const secret = await vaultAuthSession(uid).then((session) => resumeVaultDeviceSession(uid, localPin, session)).catch(() => null);
        if (secret) {
          try { if (alive.current) await unlock(current, secret, false); }
          catch { await clearVaultDeviceSession(uid); }
          finally { secret.fill(0); }
        }
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

  const setup = account === null;
  const devicePinArchive = account?.keys?.v === 2;
  const pinAvailable = Boolean(pinEntry) && !isVaultPinLocked(pinEntry);
  const usingPin = devicePinArchive && pinAvailable && !usingCode && !paired;
  const recovering = !setup && (devicePinArchive ? !usingPin : usingCode);
  const configurePin = setup || (devicePinArchive && recovering);

  const submit = async (event) => {
    event.preventDefault();
    if (processing.current) return;
    if (configurePin && (!isVaultPin(pin) || pin !== confirmation)) {
      setError(isVaultPin(pin) ? "pinMismatch" : "invalidPin");
      return;
    }
    if (setup && !savedCode) {
      setError("saveRecoveryError");
      return;
    }
    processing.current = true;
    setBusy(true);
    setError(null);
    let bytes;
    let current = account;
    let localPin = pinEntry;

    try {
      if (setup) {
        const { keys, secret } = await createRecoveryVault(uid, code);
        bytes = secret;
        if (!alive.current) return;
        const created = await startVault(uid, keys);
        current = await loadVaultAccount(uid);
        if (!alive.current) return;
        setAccount(current);
        if (!created) {
          setPinEntry(await loadVaultPin(uid, current?.keys).catch(() => null));
          setError("alreadySetUp");
          return;
        }
      } else if (paired) {
        bytes = pairedKey.current.slice();
      } else if (usingPin) {
        const result = await verifyVaultPin(uid, current.keys, credential);
        bytes = result.secret;
        if (!alive.current) return;
        if (!bytes) {
          setPinEntry(result.entry);
          if (result.locked) setUsingCode(true);
          setCredential("");
          setError(result.locked ? "pinLocked" : "incorrectPin");
          return;
        }
        localPin = result.entry;
      } else {
        try { bytes = await unwrapVaultKey(uid, current.keys, credential, recovering); }
        catch { setError(devicePinArchive ? "invalidRecovery" : "invalid"); return; }
      }

      if (!alive.current) return;
      if (configurePin) {
        try {
          localPin = await saveVaultPin(uid, current.keys, pin, bytes);
          setPinEntry(localPin);
        } catch {
          notification.warning(t("vault.pinSaveError"));
          localPin = null;
        }
      }
      await unlock(current, bytes, remember, !deviceKey?.available && keepSession && localPin);
    } catch {
      if (alive.current) setError(current?.active ? "unavailable" : "migrationError");
    } finally {
      bytes?.fill(0);
      processing.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const onDeviceApproved = (secret) => {
    pairedKey.current?.fill(0);
    pairedKey.current = secret;
    setPaired(true);
    setCredential("");
    setError(null);
    setShowPairing(false);
  };

  const unlockWithDevice = async () => {
    if (processing.current || !account?.active) return;
    processing.current = true;
    setBusy(true);
    setError(null);
    let bytes;
    try {
      const remembered = await archiveKeychain.get(uid, t("vault.deviceReason"));
      if (!alive.current) return;
      if (!remembered) {
        setDeviceKey((current) => ({ ...current, configured: false }));
        setError("deviceUnavailable");
        return;
      }
      bytes = decodeBytes(remembered);
      await unlock(account, bytes, false);
    } catch (failure) {
      if (alive.current && failure !== "userCancel" && failure?.code !== "userCancel") setError("deviceUnavailable");
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
  const canUseDevice = account?.active && deviceKey?.configured;
  const legacyDescription = account?.active ? "unlockDescription" : "migrationDescription";
  const accessDescription = paired ? "pairedDescription" : usingPin ? "pinDescription" : "recoverDeviceDescription";
  const description = canUseDevice && !paired ? "deviceDescription" : setup ? "setupDescription" : devicePinArchive ? accessDescription : legacyDescription;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="surface w-full max-w-md space-y-4 rounded-3xl p-6 sm:p-8">
        <h1 className="text-2xl font-extrabold">{t(setup ? "vault.setup" : "vault.title")}</h1>
        {account !== undefined && <p className="text-sm text-muted-foreground">{t(`vault.${description}`)}</p>}
        {error && !deleting && <p role="alert" className="text-sm text-destructive">{t(`vault.${error}`)}</p>}
        {canUseDevice && !paired && (
          <Button className="w-full" disabled={busy} onClick={unlockWithDevice}>{t("vault.unlockWithDevice")}</Button>
        )}
        {account === undefined ? (busy
          ? <p role="status">{t("common.loadingPage")}</p>
          : <Button onClick={load}>{t("common.retry")}</Button>) : (
          <form className="space-y-4" onSubmit={submit}>
            {!setup && !paired && (
              <div className="space-y-2">
                <Label htmlFor="archive-credential">{t(usingPin ? "vault.pin" : recovering ? "vault.recovery" : "vault.passphrase")}</Label>
                <Input id="archive-credential" type="password" autoComplete="off" required
                  inputMode={usingPin ? "numeric" : undefined} pattern={usingPin ? "[0-9]{6}" : undefined}
                  maxLength={usingPin ? 6 : 1024} value={credential} disabled={busy}
                  onChange={(event) => setCredential(event.target.value)} />
              </div>
            )}
            {configurePin && <>
              <div className="space-y-2">
                <Label htmlFor="archive-pin">{t("vault.newPin")}</Label>
                <p id="archive-pin-help" className="text-sm text-muted-foreground">{t("vault.pinHelp")}</p>
                <Input id="archive-pin" aria-describedby="archive-pin-help" type="password" inputMode="numeric"
                  autoComplete="off" pattern="[0-9]{6}" required maxLength={6}
                  value={pin} disabled={busy} onChange={(event) => setPin(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="archive-confirm">{t("vault.confirmPin")}</Label>
                <Input id="archive-confirm" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}"
                  required maxLength={6} value={confirmation} disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)} />
              </div>
            </>}
            {setup && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("vault.recovery")}</p>
                <p className="text-sm text-muted-foreground">{t("vault.recoveryHelp")}</p>
                <p id="archive-recovery-code" className="select-all break-all rounded-xl bg-muted p-3 font-mono text-sm">{code}</p>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" required checked={savedCode} disabled={busy} onChange={(event) => setSavedCode(event.target.checked)} />
                  {t("vault.savedRecovery")}
                </label>
              </div>
            )}
            {deviceKey?.available && !deviceKey.configured && <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
              {t("vault.remember")}
            </label>}
            {(setup || devicePinArchive) && !deviceKey?.available && <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={keepSession} disabled={busy} onChange={(event) => setKeepSession(event.target.checked)} />
              {t("vault.rememberSession")}
            </label>}
            <Button type="submit" className="w-full" disabled={busy}>{t(busy ? "vault.opening" : setup ? "vault.activate" : "vault.unlock")}</Button>
            {!setup && !paired && (!devicePinArchive || pinAvailable) && <Button variant="ghost" className="w-full" disabled={busy} onClick={() => {
              setUsingCode(!usingCode);
              setCredential("");
              setError(null);
            }}>{t(usingCode ? (devicePinArchive ? "vault.usePin" : "vault.usePassphrase") : "vault.useRecovery")}</Button>}
          </form>
        )}
        {devicePinArchive && account.active && recovering && !paired && (
          <Button variant="outline" className="w-full" disabled={busy} onClick={() => setShowPairing(true)}>
            {t("pairing.request")}
          </Button>
        )}
        {showPairing && <Suspense fallback={null}>
          <RequestDeviceSheet uid={uid} onClose={() => setShowPairing(false)} onApproved={onDeviceApproved} />
        </Suspense>}
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
