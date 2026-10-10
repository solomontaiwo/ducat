import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";

/** "Ottobre 2026" / "Ott 2026", capitalised, in the active language. */
export const formatMonthLabel = (month, language, short = false) => {
  const label = format(month, short ? "MMM yyyy" : "MMMM yyyy", { locale: language === "en" ? enUS : it });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** "27 set – 26 ott" / "Sep 27 – Oct 26". */
export const formatCycleRange = (startDate, endDate, language) => {
  const locale = language === "en" ? enUS : it;
  const pattern = language === "en" ? "MMM d" : "d MMM";
  return `${format(startDate, pattern, { locale }).replace(".", "")} – ${format(endDate, pattern, { locale }).replace(".", "")}`;
};
