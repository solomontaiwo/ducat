import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import "../../utils/pairingTranslations.js";
import { decryptVaultPairing, openApprovedVaultPairing, vaultPairingConfirmation } from "../../utils/vaultCrypto.js";
import { cancelVaultPairing, formatPairingCode, normalizePairingCode, readVaultPairing, readVaultPairingKeyCheck, requestVaultPairing, watchVaultPairings } from "../../services/vaultPairingService.js";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Label } from "../ui/label.jsx";
import Sheet from "../ui/sheet.jsx";

export default function RequestDeviceSheet({ uid, onClose, onApproved }) {
  const { t } = useTranslation(["translation", "pairing"]);
  const [request, setRequest] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [legacyResponse, setLegacyResponse] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generation, setGeneration] = useState(0);
  const alive = useRef(false);
  const processing = useRef(false);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let pending;
    setRequest(null);
    setError(null);
    setComparison(null);
    setLegacyResponse(false);
    setCode("");
    requestVaultPairing(uid).then((value) => {
      pending = value;
      if (!disposed) setRequest(value);
      else cancelVaultPairing(uid, value.id).catch(() => {});
    }).catch(() => { if (!disposed) setError("failed"); });
    return () => {
      alive.current = false;
      disposed = true;
      if (pending) cancelVaultPairing(uid, pending.id).catch(() => {});
    };
  }, [uid, generation]);

  useEffect(() => {
    if (!request) return undefined;
    let active = true;
    let loading = false;
    let automaticFinished = false;
    const refresh = async () => {
      if (loading || automaticFinished || processing.current || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const response = await readVaultPairing(uid, request.id);
        if (!active) return;
        if (!response || response.rejected_at) {
          setComparison(null);
          setError(response?.rejected_at ? "rejected" : "expired");
        } else if (response.ciphertext && request.automatic && response.automatic_approval) {
          const keyCheck = await readVaultPairingKeyCheck(uid);
          if (!active) return;
          automaticFinished = true;
          try {
            const secret = await openApprovedVaultPairing(uid, request, response, keyCheck);
            if (active) onApproved(secret, true);
            else secret.fill(0);
          } catch {
            if (active) setError("automaticFailed");
          }
        } else if (response.ciphertext) {
          const value = await vaultPairingConfirmation(uid, request, response.sender_public);
          if (active) {
            setLegacyResponse(true);
            setComparison(value);
          }
        }
      } catch {
        // A failed refresh can recover on the next event or manual confirmation.
      } finally {
        loading = false;
      }
    };
    const stop = watchVaultPairings(uid, refresh);
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      stop();
      clearInterval(timer);
    };
  }, [uid, request, onApproved]);

  const confirm = async (confirmation) => {
    if (!request || processing.current) return;
    if (!/^[0-9a-f]{12}$/.test(confirmation)) {
      setError("invalidCode");
      return;
    }
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await readVaultPairing(uid, request.id);
      if (!alive.current) return;
      if (!response?.ciphertext || response.rejected_at) {
        setError(response?.rejected_at ? "rejected" : response ? "waiting" : "expired");
        return;
      }
      const secret = await decryptVaultPairing(uid, request, response, confirmation);
      if (alive.current) onApproved(secret);
      else secret.fill(0);
    } catch {
      if (alive.current) setError("confirmFailed");
    } finally {
      processing.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const ended = error === "expired" || error === "rejected" || error === "automaticFailed";

  return (
    <Sheet open title={t("pairing.request")} description={t("pairing:requestHelp")}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      {request ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("pairing:requestCode")}</p>
          <p data-testid="pairing-request-code" className="select-all rounded-xl bg-muted p-3 text-center font-mono">{formatPairingCode(request.id)}</p>
          {!comparison && !ended && error !== "waiting" && (
            <p role="status" className="text-sm font-medium">{t("pairing:awaitingApproval")}</p>
          )}
          {comparison && (
            <div className="space-y-2" role="status">
              <p className="text-sm">{t("pairing:compareConfirmation")}</p>
              <p data-testid="pairing-compare-confirmation" className="rounded-xl bg-muted p-3 text-center font-mono">{formatPairingCode(comparison)}</p>
              <Button type="button" disabled={busy} onClick={() => confirm(comparison)}>{t("pairing:codesMatch")}</Button>
            </div>
          )}
          {!ended && (!request.automatic || legacyResponse) && (
            <details className="border-t pt-3">
              <summary className="cursor-pointer rounded text-sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                {t("pairing:manualConfirmation")}
              </summary>
              <form onSubmit={(event) => { event.preventDefault(); confirm(normalizePairingCode(code)); }} className="mt-3 space-y-3">
                <Label htmlFor="pairing-confirmation">{t("pairing:confirmation")}</Label>
                <Input id="pairing-confirmation" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                  value={code} onChange={(event) => setCode(event.target.value)} maxLength={17} required disabled={busy} />
                <Button type="submit" variant="outline" disabled={busy}>{t("pairing:confirm")}</Button>
              </form>
            </details>
          )}
        </div>
      ) : !error && <p role="status">{t("common.loadingPage")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t(`pairing:${error}`)}</p>}
      {(ended || (!request && error)) && (
        <Button variant="outline" onClick={() => setGeneration((value) => value + 1)}>{t("common.retry")}</Button>
      )}
    </Sheet>
  );
}

RequestDeviceSheet.propTypes = {
  uid: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onApproved: PropTypes.func.isRequired,
};
