import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAnalyticsQueryRange } from "../utils/analyticsModel";

// Ranges already loaded in this session: shown at once when the user comes
// back to a period, then refreshed in the background.
const rangeCache = new Map();
const RANGE_CACHE_LIMIT = 8;
const remember = (key, data) => {
  rangeCache.delete(key);
  rangeCache.set(key, data);
  if (rangeCache.size > RANGE_CACHE_LIMIT) rangeCache.delete(rangeCache.keys().next().value);
};

/**
 * Loads the transactions the analytics view needs (one bounded range, never the
 * full history) and ignores answers that arrive after a newer request.
 *
 * `isLoadingAnalyticsData` is true only while there is nothing to show yet: a
 * refresh keeps the previous figures on screen instead of a skeleton.
 */
export const useAnalyticsData = ({ isDemo, recentTransactions, currentUser, fetchAllTransactions, startDate, endDate, compareStart = null, startDay = 1, refreshKey = 0 }) => {
  const { t } = useTranslation();
  const uid = currentUser?.uid ?? null;
  const cacheKey = useMemo(() => {
    if (isDemo || !uid || !startDate || !endDate) return null;
    const range = getAnalyticsQueryRange(startDate, endDate, new Date(), compareStart, startDay);
    return [uid, range.startDate?.getTime?.(), range.endDate?.getTime?.()].join("|");
  }, [isDemo, uid, startDate, endDate, compareStart, startDay]);
  const [analyticsData, setAnalyticsData] = useState(() => (cacheKey && rangeCache.get(cacheKey)) || []);
  const [isLoadingAnalyticsData, setIsLoadingAnalyticsData] = useState(() => !isDemo && !(cacheKey && rangeCache.has(cacheKey)));
  const [analyticsError, setAnalyticsError] = useState("");
  const requestIdRef = useRef(0);
  const shownKeyRef = useRef(cacheKey && rangeCache.has(cacheKey) ? cacheKey : null);

  useEffect(() => {
    const loadData = async () => {
      const requestId = ++requestIdRef.current;
      if (isDemo) {
        setAnalyticsData(recentTransactions);
        setIsLoadingAnalyticsData(false);
      } else if (currentUser) {
        setAnalyticsError("");
        const cached = cacheKey ? rangeCache.get(cacheKey) : undefined;
        if (cached) {
          setAnalyticsData(cached);
          setIsLoadingAnalyticsData(false);
          shownKeyRef.current = cacheKey;
        } else if (shownKeyRef.current !== cacheKey) {
          // A period never loaded before: nothing correct to show yet.
          setIsLoadingAnalyticsData(true);
        }
        try {
          const range = getAnalyticsQueryRange(startDate, endDate, new Date(), compareStart, startDay);
          const data = await fetchAllTransactions(refreshKey > 0 ? { ...range, forceRefresh: true } : range);
          if (cacheKey) remember(cacheKey, data);
          if (requestId === requestIdRef.current) {
            setAnalyticsData(data);
            shownKeyRef.current = cacheKey;
          }
        } catch (error) {
          if (requestId === requestIdRef.current) {
            setAnalyticsError(error.code === "permission-denied" ? t("security.emailVerificationRequired") : t("error"));
          }
        } finally {
          if (requestId === requestIdRef.current) setIsLoadingAnalyticsData(false);
        }
      } else {
        // Not demo and not logged in
        rangeCache.clear();
        setAnalyticsData([]);
        setIsLoadingAnalyticsData(false);
      }
    };
    loadData();
  }, [isDemo, recentTransactions, currentUser, fetchAllTransactions, startDate, endDate, compareStart, startDay, refreshKey, cacheKey, t]);

  return { analyticsData, isLoadingAnalyticsData, analyticsError };
};
