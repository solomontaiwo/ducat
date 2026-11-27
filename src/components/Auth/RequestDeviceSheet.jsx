import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { decryptVaultPairing } from "../../utils/vaultCrypto.js";
import { cancelVaultPairing, formatPairingCode, normalizePairingCode, readVaultPairing, requestVaultPairing } from "../../services/vaultPairingService.js";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Label } from "../ui/label.jsx";
import Sheet from "../ui/sheet.jsx";

export default function RequestDeviceSheet({ uid, onClose, onApproved }) {
  const { t } = useTranslation();
  const [request, setRequest] = useState(null);
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

  const confirm = async (event) => {
    event.preventDefault();
    if (!request || processing.current) return;
    const confirmation = normalizePairingCode(code);
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
      if (!response?.ciphertext) {
        setError(response ? "waiting" : "expired");
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

  return (
    <Sheet open title={t("pairing.request")} description={t("pairing.requestHelp")}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      {request ? (
        <form onSubmit={confirm} className="space-y-3">
          <p className="text-sm font-medium">{t("pairing.requestCode")}</p>
          <p data-testid="pairing-request-code" className="select-all rounded-xl bg-muted p-3 text-center font-mono">{formatPairingCode(request.id)}</p>
          <Label htmlFor="pairing-confirmation">{t("pairing.confirmation")}</Label>
          <Input id="pairing-confirmation" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            value={code} onChange={(event) => setCode(event.target.value)} maxLength={17} required disabled={busy} />
          <Button type="submit" disabled={busy}>{t("pairing.confirm")}</Button>
        </form>
      ) : !error && <p role="status">{t("common.loadingPage")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{t(`pairing.${error}`)}</p>}
      {(error === "expired" || (!request && error)) && (
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
