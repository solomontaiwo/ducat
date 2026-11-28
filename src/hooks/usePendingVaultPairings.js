import { useEffect, useState } from "react";
import { listPendingVaultPairings, watchVaultPairings } from "../services/vaultPairingService.js";

export function usePendingVaultPairings(uid) {
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!uid) return undefined;
    let active = true;
    let generation = 0;
    let expiryTimer;
    const reload = async () => {
      const load = ++generation;
      try {
        const pending = await listPendingVaultPairings(uid);
        if (!active || load !== generation) return;
        clearTimeout(expiryTimer);
        setRequests(pending);
        const expiry = Date.parse(pending.at(-1)?.expires_at);
        if (Number.isFinite(expiry)) {
          expiryTimer = setTimeout(reload, Math.min(30000, Math.max(1000, expiry - Date.now() + 100)));
        }
      } catch {
        if (active && load === generation) setRequests([]);
      }
    };
    const stop = watchVaultPairings(uid, reload);
    return () => {
      active = false;
      clearTimeout(expiryTimer);
      stop();
    };
  }, [uid]);

  return requests;
}
