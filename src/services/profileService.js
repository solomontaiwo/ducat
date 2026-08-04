import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "../utils/firebaseFirestore";
import { profileNameSchema } from "../schemas/profile";

const fallbackProfileName = (user) => {
  const candidate = user?.displayName || user?.email?.split("@")[0] || "utente";
  const normalized = String(candidate).trim().slice(0, 50);
  return normalized.length >= 3 ? normalized : `user-${user.uid.slice(0, 8)}`;
};

export const ensureUserProfile = async (user) => {
  if (!user) return null;
  const reference = doc(firestore, "users", user.uid);
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) {
    const profile = snapshot.data();
    if (user.email && profile.email !== user.email) {
      await setDoc(reference, { email: user.email, updatedAt: serverTimestamp() }, { merge: true });
      return { ...profile, email: user.email };
    }
    return profile;
  }

  const displayName = profileNameSchema.parse(fallbackProfileName(user));
  const profile = {
    username: displayName,
    displayName,
    email: user.email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(reference, profile);
  return profile;
};
