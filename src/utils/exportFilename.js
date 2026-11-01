import { format } from "date-fns";
import { dateToDateKey } from "./dateUtils.js";
import { APP_SLUG } from "./brand.js";

export const sanitizeFilename = (value) => {
  if (!value) return "user";
  return value.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase();
};

export const getUserName = (user) => {
  if (typeof user === "string") return user;
  return user?.displayName || user?.username || user?.email?.split("@")[0] || "user";
};

export const generateExportFileName = (periodText, startDate, endDate, user, extension) => {
  const userName = sanitizeFilename(getUserName(user));
  const period = sanitizeFilename(periodText || "period");
  const range = startDate && endDate
    ? `${dateToDateKey(startDate)}_${dateToDateKey(endDate)}`
    : "snapshot";
  const timestamp = format(new Date(), "yyyyMMdd-HHmmss");
  return `report-${APP_SLUG}-${userName}-${period}-${range}-${timestamp}.${sanitizeFilename(extension)}`;
};
