import { format } from "date-fns";

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
  const timestamp = format(new Date(), "yyyyMMdd-HHmm");
  return `report-soldisotto-${userName}-${timestamp}.${extension}`;
};
