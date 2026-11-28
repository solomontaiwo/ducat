import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import "../../utils/pairingTranslations.js";
import { usePendingVaultPairings } from "../../hooks/usePendingVaultPairings.js";
import { currentVault } from "../../services/vaultSession.js";
import { approveVaultPairing, formatPairingCode, normalizePairingCode, rejectVaultPairing } from "../../services/vaultPairingService.js";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Label } from "../ui/label.jsx";
import Sheet from "../ui/sheet.jsx";

export default function ApproveDeviceSheet({ uid, onClose }) {
  const { t } = useTranslation(["translation", "pairing"]);
  const requests = usePendingVaultPairings(uid);
  const [reviewing, setReviewing] = useState(null);
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);

  const resolve = async (id, reject = false) => {
    if (processing.current) return;
    if (!/^[0-9a-f]{16}$/.test(id)) {
      setError("invalidCode");
      return;
    }
    processing.current = true;
    setBusy(true);
    setError(null);
    try {
      const vault = currentVault(uid);
      if (!vault?.canPair()) throw new Error("Archive is locked");
      if (reject) {
        if (await rejectVaultPairing(vault, id)) onClose();
        else setError("requestMissing");
      } else {
        const result = await approveVaultPairing(vault, id);
        if (result) setConfirmation(formatPairingCode(result));
        else setError("requestMissing");
      }
    } catch {
      setError("failed");
    } finally {
      processing.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open title={t("pairing.approve")} description={t(confirmation ? "pairing:approvedHelp" : reviewing ? "pairing:reviewHelp" : "pairing:approveHelp")}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      {confirmation ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("pairing:confirmation")}</p>
          <p data-testid="pairing-confirmation" className="select-all rounded-xl bg-muted p-3 text-center font-mono">{confirmation}</p>
        </div>
      ) : reviewing ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-muted p-3 text-center font-mono">{formatPairingCode(reviewing)}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => resolve(reviewing)}>{t("pairing:codesMatch")}</Button>
            <Button variant="outline" disabled={busy} onClick={() => resolve(reviewing, true)}>{t("pairing:reject")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setReviewing(null); setError(null); }}>{t("pairing:back")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.length > 0 && (
            <ul className="space-y-2" aria-label={t("pairing:pending", { count: requests.length })}>
              {requests.map(({ id }) => (
                <li key={id}>
                  <Button variant="outline" className="w-full font-mono" disabled={busy}
                    onClick={() => { setReviewing(id); setError(null); }}>{formatPairingCode(id)}</Button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={(event) => { event.preventDefault(); resolve(normalizePairingCode(code)); }} className="space-y-3">
            <Label htmlFor="pairing-code">{t("pairing:requestCode")}</Label>
            <Input id="pairing-code" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              value={code} onChange={(event) => setCode(event.target.value)} maxLength={23} required disabled={busy} />
            <Button type="submit" disabled={busy}>{t("pairing.approve")}</Button>
          </form>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{t(`pairing:${error}`)}</p>}
    </Sheet>
  );
}

ApproveDeviceSheet.propTypes = { uid: PropTypes.string.isRequired, onClose: PropTypes.func.isRequired };

export function PendingDeviceApproval({ uid }) {
  const { t } = useTranslation(["translation", "pairing"]);
  const requests = usePendingVaultPairings(uid);
  const [open, setOpen] = useState(false);
  return (
    <>
      {requests.length > 0 && (
        <div className="workspace-width flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-sm">
          <p role="status">{t("pairing:pending", { count: requests.length })}</p>
          <Button variant="outline" onClick={() => setOpen(true)}>{t("pairing:review")}</Button>
        </div>
      )}
      {open && <ApproveDeviceSheet uid={uid} onClose={() => setOpen(false)} />}
    </>
  );
}

PendingDeviceApproval.propTypes = { uid: PropTypes.string.isRequired };
