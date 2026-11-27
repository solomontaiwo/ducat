import { useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { currentVault } from "../../services/vaultSession.js";
import { approveVaultPairing, formatPairingCode, normalizePairingCode } from "../../services/vaultPairingService.js";
import { Button } from "../ui/button.jsx";
import { Input } from "../ui/input.jsx";
import { Label } from "../ui/label.jsx";
import Sheet from "../ui/sheet.jsx";

export default function ApproveDeviceSheet({ uid, onClose }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);

  const approve = async (event) => {
    event.preventDefault();
    if (processing.current) return;
    const id = normalizePairingCode(code);
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
      const result = await approveVaultPairing(vault, id);
      if (result) setConfirmation(formatPairingCode(result));
      else setError("requestMissing");
    } catch {
      setError("failed");
    } finally {
      processing.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet open title={t("pairing.approve")} description={t(confirmation ? "pairing.approvedHelp" : "pairing.approveHelp")}
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      {confirmation ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("pairing.confirmation")}</p>
          <p data-testid="pairing-confirmation" className="select-all rounded-xl bg-muted p-3 text-center font-mono">{confirmation}</p>
        </div>
      ) : (
        <form onSubmit={approve} className="space-y-3">
          <Label htmlFor="pairing-code">{t("pairing.requestCode")}</Label>
          <Input id="pairing-code" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            value={code} onChange={(event) => setCode(event.target.value)} maxLength={23} required disabled={busy} />
          {error && <p role="alert" className="text-sm text-destructive">{t(`pairing.${error}`)}</p>}
          <Button type="submit" disabled={busy}>{t("pairing.approve")}</Button>
        </form>
      )}
    </Sheet>
  );
}

ApproveDeviceSheet.propTypes = { uid: PropTypes.string.isRequired, onClose: PropTypes.func.isRequired };
