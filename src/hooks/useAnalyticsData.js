import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnalyticsQueryRange } from "../utils/analyticsModel";

/**
 * Loads the transactions the analytics view needs (one bounded range, never the
 * full history) and ignores answers that arrive after a newer request.
 */
export const useAnalyticsData = ({ isDemo, recentTransactions, currentUser, fetchAllTransactions, startDate, endDate, compareStart = null }) => {
  const { t } = useTranslation();
  const [analyticsData, setAnalyticsData] = useState([]);
  const [isLoadingAnalyticsData, setIsLoadingAnalyticsData] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const loadData = async () => {
      const requestId = ++requestIdRef.current;
      if (isDemo) {
        setAnalyticsData(recentTransactions);
        setIsLoadingAnalyticsData(false);
      } else if (currentUser) {
        setIsLoadingAnalyticsData(true);
        setAnalyticsError("");
        try {
          const data = await fetchAllTransactions(getAnalyticsQueryRange(startDate, endDate, new Date(), compareStart));
          if (requestId === requestIdRef.current) setAnalyticsData(data);
        } catch (error) {
          if (requestId === requestIdRef.current) {
            setAnalyticsError(error.code === "permission-denied" ? t("security.emailVerificationRequired") : t("error"));
          }
        } finally {
          if (requestId === requestIdRef.current) setIsLoadingAnalyticsData(false);
        }
      } else {
        // Not demo and not logged in
        setAnalyticsData([]);
        setIsLoadingAnalyticsData(false);
      }
    };
    loadData();
  }, [isDemo, recentTransactions, currentUser, fetchAllTransactions, startDate, endDate, compareStart, t]);

  return { analyticsData, isLoadingAnalyticsData, analyticsError };
};
