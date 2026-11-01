import { format } from "date-fns";
import { enUS, it } from "date-fns/locale";
import { dateKeyToDate } from "../../utils/dateUtils.js";

const dateLocale = (language) => (language === "en" ? enUS : it);

/** "9 nov" / "Nov 9". */
export const shortDate = (dateKey, language) =>
  format(dateKeyToDate(dateKey), language === "en" ? "MMM d" : "d MMM", { locale: dateLocale(language) });

/** "oggi", "domani", "tra 3 giorni" or "dal 2 ott" for overdue items. */
export const describeWhen = ({ daysAway, dateKey }, language, t) => {
  if (daysAway < 0) return t("recurring.overdue", { date: shortDate(dateKey, language) });
  if (daysAway === 0) return t("recurring.today");
  if (daysAway === 1) return t("recurring.tomorrow");
  return t("recurring.inDays", { count: daysAway });
};
