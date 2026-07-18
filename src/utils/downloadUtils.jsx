import { format } from "date-fns";

export const sanitizeFilename = (str) => {
  if (!str) return "user";
  return str.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase();
};

export const getUserName = (user) => {
  if (typeof user === "string") return user;
  return user?.displayName || user?.username || user?.email?.split("@")[0] || "user";
};

// The profile document is the source of truth for the username shown in the app.
export const getCurrentProfileName = async (user) => {
  if (!user || typeof user === "string") return getUserName(user);

  try {
    const [{ firestore }, { doc, getDoc }] = await Promise.all([
      import("../utils/firebase.jsx"),
      import("firebase/firestore"),
    ]);
    const profile = await getDoc(doc(firestore, "users", user.uid));
    const profileData = profile.data();
    return profileData?.displayName || profileData?.username || getUserName(user);
  } catch (error) {
    console.warn("Unable to load the profile name for the export", error);
    return getUserName(user);
  }
};

// Single source of truth for filename generation
export const generateExportFileName = (periodText, startDate, endDate, user, extension) => {
  const now = new Date();
  const userName = sanitizeFilename(getUserName(user));
  
  const timestamp = format(now, "yyyyMMdd-HHmm");
  const prefix = "report-soldisotto";
  
  // Format: report-soldisotto-[username]-[timestamp].[ext]
  
  return `${prefix}-${userName}-${timestamp}.${extension}`;
};
// Deprecated: generateExportFileName is used
export const generateCsvFileName = (periodText, startDate, endDate, user) => {
  return generateExportFileName(periodText, startDate, endDate, user, "csv");
};
