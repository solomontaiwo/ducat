import { supabase, unwrap } from "../utils/supabaseClient.js";
import { profileNameSchema } from "../schemas/profile";

const PROFILES = "profiles";

const fallbackProfileName = (user) => {
  const candidate = user?.displayName || user?.email?.split("@")[0] || "utente";
  const normalized = String(candidate).trim().slice(0, 50);
  return normalized.length >= 3 ? normalized : `user-${user.uid.replaceAll("-", "").slice(0, 8)}`;
};

const toProfile = (row) => (row ? {
  username: row.username,
  displayName: row.display_name,
  email: row.email ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
} : null);

export const getProfile = async (uid) => toProfile(unwrap(
  await supabase.from(PROFILES).select("username, display_name, email, created_at, updated_at").eq("id", uid).maybeSingle()
));

/**
 * The database creates the profile with the account; this covers accounts
 * imported without one and keeps the stored email current.
 */
export const ensureUserProfile = async (user) => {
  if (!user?.uid) return null;
  const existing = await getProfile(user.uid);
  if (existing) {
    if (user.email && existing.email !== user.email) {
      unwrap(await supabase.from(PROFILES).update({ email: user.email }).eq("id", user.uid));
      return { ...existing, email: user.email };
    }
    return existing;
  }

  const displayName = profileNameSchema.parse(fallbackProfileName(user));
  unwrap(await supabase.from(PROFILES).upsert(
    { id: user.uid, username: displayName, display_name: displayName, email: user.email },
    { onConflict: "id", ignoreDuplicates: true }
  ));
  return { username: displayName, displayName, email: user.email ?? null, createdAt: null, updatedAt: null };
};

/** Name used in greetings and exports; also stored on the account itself. */
export const saveProfileName = async (user, name) => {
  const displayName = profileNameSchema.parse(name);
  unwrap(await supabase.from(PROFILES).upsert(
    { id: user.uid, username: displayName, display_name: displayName, email: user.email },
    { onConflict: "id" }
  ));
  try {
    const { updateDisplayName } = await import("./authService.js");
    await updateDisplayName(displayName);
  } catch (error) {
    console.warn("Unable to copy the name onto the account", error);
  }
  return displayName;
};
