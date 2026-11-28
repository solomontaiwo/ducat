import { useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useCategories } from "../../utils/categories.jsx";
import { detectCsvColumns, mapCsvRowsToTransactions, parseCsvText } from "../../utils/csvImport.js";
import { formatSignedAmount } from "../../utils/formatCurrency.jsx";
import { useAccountCurrency } from "../../hooks/useAccountCurrency.js";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select } from "../ui/select";
import Sheet from "../ui/sheet";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;

const ImportCsvSheet = ({ onClose }) => {
  const { t } = useTranslation();
  const currency = useAccountCurrency();
  const { addTransaction, addTransactionsBatch, fetchAllTransactions } = useUnifiedTransactions();
  const { expenseCategories, incomeCategories } = useCategories();
  const [csv, setCsv] = useState(null);
  const [mapping, setMapping] = useState({ date: -1, description: -1, amount: -1, debit: -1, credit: -1, category: -1, type: -1, currency: -1 });
  const [defaultNegative, setDefaultNegative] = useState(false);
  const [categoryOverrides, setCategoryOverrides] = useState({});
  const [existing, setExisting] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const saving = useRef(false);
  const requestRef = useRef(0);

  const chooseFile = async (event) => {
    const req = ++requestRef.current;
    const file = event.target.files?.[0];
    setResult(null);
    setChecking(false);
    setCsv(null);
    setCategoryOverrides({});
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
      setChecking(true);
      try {
        const history = await fetchAllTransactions();
        if (req !== requestRef.current) return;
        setExisting(history);
        setCsv(parsed);
        setMapping(detectCsvColumns(parsed.headers));
      } catch {
        if (req === requestRef.current) {
          event.target.value = "";
          setError(t("csvImport.historyError"));
        }
      }
    } catch {
      if (req === requestRef.current) setError(t("csvImport.invalid"));
    } finally {
      if (req === requestRef.current) setChecking(false);
    }
  };

  const preview = useMemo(() => {
    if (!csv) return null;
    const mapped = mapCsvRowsToTransactions(csv.rows.slice(0, MAX_IMPORT_ROWS), mapping, {
      existing,
      expenseCategories,
      incomeCategories,
      defaultNegative,
      currency,
    });
    if (!Object.keys(categoryOverrides).length) return mapped;
    return {
      ...mapped,
      valid: mapped.valid.map((item) => (
        categoryOverrides[item.clientRequestId]
          ? { ...item, category: categoryOverrides[item.clientRequestId] }
          : item
      )),
    };
  }, [csv, mapping, existing, expenseCategories, incomeCategories, defaultNegative, categoryOverrides, currency]);

  const setCol = (field, value) => setMapping((prev) => ({ ...prev, [field]: Number(value) }));

  const runImport = async () => {
    const batch = result?.failed ?? preview?.valid;
    if (!batch?.length || saving.current) return;
    saving.current = true;
    setBusy(true);
    setProgress(0);
    try {
      if (typeof addTransactionsBatch === "function") {
        const outcome = await addTransactionsBatch(batch, { onProgress: setProgress });
        setResult({ imported: (result?.imported ?? 0) + outcome.imported, failed: outcome.failed });
        return;
      }
      const failed = [];
      for (const [index, item] of batch.entries()) {
        try {
          if (!await addTransaction(item, { silent: true })) failed.push(item);
        } catch {
          failed.push(item);
        }
        setProgress(Math.round(((index + 1) / batch.length) * 100));
      }
      setResult({ imported: (result?.imported ?? 0) + batch.length - failed.length, failed });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const renderColumnPicker = (field, label) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <Select value={String(mapping[field])} onChange={(event) => setCol(field, event.target.value)} disabled={busy || Boolean(result)}>
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
        result && !result.failed.length
          ? <Button size="lg" className="w-full" onClick={onClose}>{t("common.close")}</Button>
          : <Button size="lg" className="w-full" onClick={runImport} disabled={!preview?.valid.length || busy}>
              {busy ? t("csvImport.importing", { progress }) : result ? t("csvImport.retryFailed", { count: result.failed.length }) : t("csvImport.importAction", { count: preview?.valid.length || 0 })}
            </Button>
      )}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="csv-import-file">{t("csvImport.file")}</Label>
          <Input id="csv-import-file" type="file" accept=".csv,text/csv,text/plain" onChange={chooseFile} disabled={busy} />
        </div>

        {checking && <p role="status">{t("csvImport.checking")}</p>}
        {csv && !result && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {renderColumnPicker("date", t("transactionModal.date"))}
              {renderColumnPicker("description", t("transactionModal.description"))}
              {renderColumnPicker("amount", t("transactionModal.amount"))}
              {renderColumnPicker("category", t("transactionModal.category"))}
              {renderColumnPicker("debit", t("csvImport.debit"))}
              {renderColumnPicker("credit", t("csvImport.credit"))}
              {renderColumnPicker("type", t("csvImport.typeCol"))}
              {renderColumnPicker("currency", t("csvImport.currencyCol"))}
            </div>
            {mapping.amount >= 0 && (
              <label className="flex items-center gap-2.5 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={defaultNegative}
                  onChange={(event) => setDefaultNegative(event.target.checked)}
                  disabled={busy}
                />
                <span>{t("csvImport.defaultExpense")}</span>
              </label>
            )}
          </div>
        )}

        {csv?.rows.length > MAX_IMPORT_ROWS && <p className="text-sm">{t("csvImport.limit", { count: MAX_IMPORT_ROWS, extra: csv.rows.length - MAX_IMPORT_ROWS })}</p>}
        {result && (
          <div className="space-y-3 text-sm">
            <p role="status" className="font-semibold">{t("csvImport.outcome", { imported: result.imported, duplicates: preview.duplicates, skipped: preview.skipped, failed: result.failed.length })}</p>
            {result.failed.length > 0 && <ul className="divide-y divide-border">
              {result.failed.map(item => (
                <li key={item.clientRequestId} className="py-2">
                  {t("csvImport.record", { number: preview.recordNumbers.get(item.clientRequestId) })} · {item.dateKey} · {item.description} ·{" "}
                  <span data-amount="true">{formatSignedAmount(item.amount, item.type)}</span>
                </li>
              ))}
            </ul>}
          </div>
        )}
        {preview && !result && (
          <div className="space-y-2 rounded-2xl border border-border p-3.5 text-sm">
            <p className="font-semibold" role="status">
              {t("csvImport.readySummary", { ready: preview.valid.length, duplicates: preview.duplicates, skipped: preview.skipped })}
            </p>
            {preview.unsupportedCurrency.length > 0 && (
              <div role="alert" className="text-destructive">
                <p>{t("csvImport.unsupportedCurrency", { currency })}</p>
                <ul>{preview.unsupportedCurrency.map((number) => <li key={number}>{t("csvImport.record", { number })}</li>)}</ul>
              </div>
            )}
            {preview.valid.length > 0 && (
              <ul className="divide-y divide-border pt-1 text-xs">
                {preview.valid.slice(0, 6).map((item) => {
                  const list = item.type === "income" ? incomeCategories : expenseCategories;
                  return (
                    <li key={item.clientRequestId} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate font-medium">{item.dateKey} · {item.description}</span>
                      <select
                        aria-label={`${t("transactionModal.category")} ${item.description}`}
                        value={item.category}
                        disabled={busy}
                        onChange={(event) => setCategoryOverrides((prev) => ({ ...prev, [item.clientRequestId]: event.target.value }))}
                        className="max-w-[7.5rem] shrink-0 rounded-lg border border-input bg-card px-1.5 py-0.5 text-[11px] font-semibold text-foreground"
                      >
                        {list.map((cat) => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                      <span data-amount="true" className="shrink-0 font-bold tabular-nums">{formatSignedAmount(item.amount, item.type)}</span>
                    </li>
                  );
                })}
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
