import { useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { useNotification } from "../../utils/notificationUtils.jsx";
import { detectCsvColumns, mapCsvRowsToTransactions, parseCsvText } from "../../utils/csvImport.js";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import Sheet from "../ui/sheet";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ImportCsvSheet = ({ onClose }) => {
  const { t } = useTranslation();
  const { addTransaction, fetchAllTransactions, transactions: recent } = useUnifiedTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const notification = useNotification();
  const [csv, setCsv] = useState(null);
  const [mapping, setMapping] = useState({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1, type: -1 });
  const [existing, setExisting] = useState(recent);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef(0);

  const chooseFile = async (event) => {
    const req = ++requestRef.current;
    const file = event.target.files?.[0];
    setCsv(null);
    setError("");
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { setError(t("csvImport.tooLarge")); return; }
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (req !== requestRef.current) return;
      if (!parsed.headers.length || !parsed.rows.length) {
        setError(t("csvImport.empty"));
        return;
      }
      setCsv(parsed);
      setMapping(detectCsvColumns(parsed.headers));
      fetchAllTransactions().then((all) => {
        if (req === requestRef.current && Array.isArray(all)) setExisting(all);
      }).catch(() => {});
    } catch {
      if (req === requestRef.current) setError(t("csvImport.invalid"));
    }
  };

  const preview = useMemo(() => {
    if (!csv) return null;
    return mapCsvRowsToTransactions(csv.rows.slice(0, MAX_IMPORT_ROWS), mapping, {
      existing,
      expenseCategories,
      incomeCategories,
    });
  }, [csv, mapping, existing, expenseCategories, incomeCategories]);

  const setCol = (field, value) => setMapping((prev) => ({ ...prev, [field]: Number(value) }));

  const runImport = async () => {
    if (!preview?.valid.length || busy) return;
    setBusy(true);
    setProgress(0);
    let imported = 0;
    try {
      for (let i = 0; i < preview.valid.length; i += 1) {
        const ok = await addTransaction(preview.valid[i], { silent: true });
        if (ok) imported += 1;
        setProgress(Math.round(((i + 1) / preview.valid.length) * 100));
      }
      notification.success(t("csvImport.success", { count: imported }));
      onClose();
    } catch (err) {
      console.error("CSV import failed", err);
      notification.error(t("csvImport.failed"));
    } finally {
      setBusy(false);
    }
  };

  const renderColumnPicker = (field, label) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <Select value={String(mapping[field])} onChange={(event) => setCol(field, event.target.value)} disabled={busy}>
        <option value="-1">—</option>
        {(csv?.headers || []).map((header, index) => (
          <option key={`${header}-${index}`} value={String(index)}>{header || `#${index + 1}`}</option>
        ))}
      </Select>
    </label>
  );

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title={t("csvImport.title")}
      description={t("csvImport.description")}
      footer={(
        <Button size="lg" className="w-full" onClick={runImport} disabled={!preview?.valid.length || busy}>
          {busy ? t("csvImport.importing", { progress }) : t("csvImport.importAction", { count: preview?.valid.length || 0 })}
        </Button>
      )}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csv-import-file">{t("csvImport.file")}</Label>
          <Input id="csv-import-file" type="file" accept=".csv,text/csv,text/plain" onChange={chooseFile} disabled={busy} />
        </div>

        {csv && (
          <div className="grid grid-cols-2 gap-3">
            {renderColumnPicker("date", t("transactionModal.date"))}
            {renderColumnPicker("description", t("transactionModal.description"))}
            {renderColumnPicker("amount", t("transactionModal.amount"))}
            {renderColumnPicker("category", t("transactionModal.category"))}
          </div>
        )}

        {preview && (
          <div className="space-y-2 rounded-2xl border border-border p-3.5 text-sm">
            <p className="font-semibold" role="status">
              {t("csvImport.readySummary", { ready: preview.valid.length, duplicates: preview.duplicates, skipped: preview.skipped })}
            </p>
            {preview.valid.length > 0 && (
              <ul className="divide-y divide-border pt-1 text-xs">
                {preview.valid.slice(0, 4).map((item) => (
                  <li key={item.clientRequestId} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate font-medium">{item.dateKey} · {item.description}</span>
                    <span className="shrink-0 font-bold tabular-nums">{formatSignedAmount(item.amount, item.type)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Sheet>
  );
};

ImportCsvSheet.propTypes = { onClose: PropTypes.func.isRequired };

export default ImportCsvSheet;
