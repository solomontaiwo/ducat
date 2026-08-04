import { getUserName } from "./exportFilename.js";

export { generateExportFileName, getUserName, sanitizeFilename } from "./exportFilename.js";

// The profile document is the source of truth for the username shown in the app.
export const getCurrentProfileName = async (user) => {
  if (!user || typeof user === "string") return getUserName(user);

  try {
    const [{ firestore }, { doc, getDoc }] = await Promise.all([
      import("../utils/firebaseFirestore.js"),
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
