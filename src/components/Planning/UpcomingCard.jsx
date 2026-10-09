import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../router/RouterProvider";
import { usePlanning } from "../../context/PlanningProvider.jsx";
import { todayDateKey } from "../../utils/dateUtils.js";
import { upcomingOccurrences } from "../../utils/recurrence.js";
import UpcomingList from "./UpcomingList.jsx";

/** Overview card, shown only when a recurring movement is due within a week. */
const UpcomingCard = () => {
  const { t } = useTranslation();
  const { recurring } = usePlanning();
  const items = useMemo(() => upcomingOccurrences(recurring, todayDateKey()), [recurring]);
  if (!items.length) return null;

  return (
    <section className="surface flex flex-col gap-1 p-4 sm:p-6" aria-labelledby="upcoming-title">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="upcoming-title" className="text-lg font-bold">{t("recurring.upcoming")}</h2>
        <Link to="/recurring" className="text-sm font-semibold text-primary hover:underline">{t("recurring.manage")}</Link>
      </div>
      <div className="px-1">
        <UpcomingList items={items} />
      </div>
    </section>
  );
};

export default UpcomingCard;
