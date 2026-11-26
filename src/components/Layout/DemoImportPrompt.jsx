import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FiUploadCloud } from "react-icons/fi";
import { useAuth } from "../../context/AuthProvider";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider";
import { useNotification } from "../../utils/notificationUtils";
import { clearDemoData, readImportableDemoTransactions, removeDemoTransactions } from "../../utils/demoStorage.js";
import { Button } from "../ui/button";

// "Later" hides the offer until the app is opened again.
const postponedFor = new Set();

/**
 * Offers a verified account the movements entered in the demo on this device
 * (typically while waiting for the confirmation email). The import is explicit
 * and idempotent: each movement keeps a stable id, so a retry never duplicates
 * it, and the local copy is removed only once the account holds it.
 */
const DemoImportPrompt = () => {
  const { currentUser } = useAuth();
  const { stopDemo } = useUnifiedTransactions();
  const notification = useNotification();
  const { t } = useTranslation();
  const uid = currentUser?.uid;
  const [items, setItems] = useState(() => readImportableDemoTransactions());
  const [hidden, setHidden] = useState(() => postponedFor.has(uid));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setItems(readImportableDemoTransactions());
    setHidden(postponedFor.has(uid));
  }, [uid]);

  const finish = useCallback(() => {
    clearDemoData();
    stopDemo?.();
    setItems([]);
  }, [stopDemo]);

  const importAll = async () => {
    if (!uid || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      notification.error(t("demo.import.offline"));
      return;
    }
    setBusy(true);
    const imported = [];
    try {
      const { TransactionService } = await import("../../services/transactionService.jsx");
      for (const item of items) {
        try {
          await TransactionService.add(uid, {
            type: item.type,
            amountMinor: item.amountMinor,
            amount: item.amount,
            currency: item.currency,
            description: item.description,
            category: item.category,
            dateKey: item.dateKey,
            date: item.date,
          }, { requestId: `demo-${item.id}` });
          imported.push(item.id);
        } catch (error) {
          console.error("Unable to import a demo movement", error);
        }
      }
    } catch (error) {
      console.error("Unable to load the transaction service", error);
    }
    const remaining = items.length - imported.length;
    if (remaining === 0) {
      finish();
      notification.success(t("demo.import.done", { count: imported.length }));
    } else {
      if (imported.length) removeDemoTransactions(imported);
      setItems(readImportableDemoTransactions());
      notification.error(imported.length
        ? t("demo.import.partial", { imported: imported.length, remaining })
        : t("demo.import.failed"));
    }
    setBusy(false);
  };

  const discard = () => {
    if (busy || !window.confirm(t("demo.import.discardConfirm"))) return;
    finish();
    notification.info(t("demo.import.discarded"));
  };

  const postpone = () => {
    postponedFor.add(uid);
    setHidden(true);
  };

  if (!uid || hidden || items.length === 0) return null;

  return (
    <section
      aria-labelledby="demo-import-title"
      className="workspace-width flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-sm shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <FiUploadCloud className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h2 id="demo-import-title" className="font-semibold">{t("demo.import.title")}</h2>
          <p className="text-muted-foreground">{t("demo.import.description", { count: items.length })}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={postpone} disabled={busy}>{t("demo.import.later")}</Button>
        <Button variant="outline" onClick={discard} disabled={busy}>{t("demo.import.discard")}</Button>
        <Button onClick={importAll} disabled={busy}>
          {busy ? t("demo.import.importing") : t("demo.import.action")}
        </Button>
      </div>
    </section>
  );
};

export default DemoImportPrompt;
