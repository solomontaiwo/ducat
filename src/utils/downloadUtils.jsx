import { getUserName } from "./exportFilename.js";

export { generateExportFileName, getUserName, sanitizeFilename } from "./exportFilename.js";

// The profile row is the source of truth for the username shown in the app.
export const getCurrentProfileName = async (user) => {
  if (!user || typeof user === "string") return getUserName(user);
  if (!user.uid) return getUserName(user);

  try {
    const { getProfile } = await import("../services/profileService.js");
    const profile = await getProfile(user.uid);
    return profile?.displayName || profile?.username || getUserName(user);
  } catch (error) {
    console.warn("Unable to load the profile name", error);
    return getUserName(user);
  }
};
