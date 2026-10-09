import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";

/** "Ottobre 2026" / "Ott 2026", capitalised, in the active language. */
export const formatMonthLabel = (month, language, short = false) => {
  const label = format(month, short ? "MMM yyyy" : "MMMM yyyy", { locale: language === "en" ? enUS : it });
  return label.charAt(0).toUpperCase() + label.slice(1);
};
