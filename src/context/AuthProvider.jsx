import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { getCurrentProfileName } from "../utils/downloadUtils.jsx";
import { readLocalValue, removeLocalValue, writeLocalValue } from "../utils/storage.js";
import { AUTH_STORAGE_KEY } from "../utils/authStorageKey.js";
import i18n from "../utils/i18n.jsx";
import { toEmailLanguage } from "../utils/emailLanguage.js";

const AuthContext = createContext();
const PENDING_KEY = "ducat-pending-verification";

export const useAuth = () => useContext(AuthContext);

/**
 * Someone who signed up (or tried to sign in) without confirming the email
 * yet. Supabase gives no session until the link is opened, so the app keeps
 * just the address to show the "check your inbox" page.
 */
const pendingUser = (email) => (email
  ? { uid: null, email, emailVerified: false, displayName: null, metadata: {}, pending: true }
  : null);

const sameUser = (left, right) => Boolean(left && right)
  && left.uid === right.uid
  && left.email === right.email
  && left.emailVerified === right.emailVerified
  && left.displayName === right.displayName
  && left.language === right.language;

/** Removes OAuth/recovery tokens from the address bar once the session exists. */
const clearAuthHash = () => {
  if (!window.location.hash) return;
  if (!/(access_token|refresh_token|error_description|type=recovery)/.test(window.location.hash)) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`
  );
};

export const AuthProvider = ({ children }) => {
  const [sessionUser, setSessionUser] = useState(null);
  const [pendingEmail, setPendingEmail] = useState(() => readLocalValue(PENDING_KEY) || null);
  const [loading, setLoading] = useState(true);
  const [authStalled, setAuthStalled] = useState(false);
  const [profileName, setProfileName] = useState(null);
  const [profileNameLoading, setProfileNameLoading] = useState(true);
  const sessionUserRef = useRef(null);

  const refreshProfileName = useCallback(async (user) => {
    if (!user?.uid) {
      setProfileName(null);
      setProfileNameLoading(false);
      return "";
    }
    setProfileNameLoading(true);
    const name = await getCurrentProfileName(user);
    setProfileName(name);
    setProfileNameLoading(false);
    return name;
  }, []);

  const applySessionUser = useCallback((user) => {
    // Token refreshes produce a new object for the same account: keep the old
    // one so effects that depend on the user do not restart.
    if (sameUser(sessionUserRef.current, user)) return sessionUserRef.current;
    sessionUserRef.current = user;
    setSessionUser(user);
    if (user) {
      removeLocalValue(PENDING_KEY);
      setPendingEmail(null);
    }
    return user;
  }, []);

  const markPendingVerification = useCallback((email) => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized) return;
    writeLocalValue(PENDING_KEY, normalized);
    setPendingEmail(normalized);
  }, []);

  const logout = useCallback(async () => {
    removeLocalValue(PENDING_KEY);
    setPendingEmail(null);
    try {
      const { TransactionService } = await import("../services/transactionService.jsx");
      TransactionService.invalidateCache();
    } catch (cacheError) {
      console.warn("Unable to clear the transaction cache on logout", cacheError);
    }
    if (!sessionUserRef.current) return;
    try {
      const { signOut } = await import("../services/authService.js");
      await signOut();
    } catch (error) {
      console.error("Errore durante il logout:", error);
      throw error;
    }
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const { reloadUser } = await import("../services/authService.js");
    const user = await reloadUser();
    if (!user) return pendingUser(readLocalValue(PENDING_KEY));
    return applySessionUser(user);
  }, [applySessionUser]);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    // Safety timeout: if the auth client never answers (e.g. bad config),
    // stop the spinner and show a recoverable "server unreachable" screen
    // instead of flashing the public landing page to a signed-in user.
    const timeout = setTimeout(() => {
      setLoading(false);
      setProfileNameLoading(false);
      // A stored session means a signed-in user is waiting: avoid the landing
      // page flash. Otherwise the app is simply offline and can still demo.
      if (readLocalValue(AUTH_STORAGE_KEY)) setAuthStalled(true);
    }, 10000);

    import("../services/authService.js")
      .then(({ onAuthChange }) => {
        if (cancelled) return;
        unsubscribe = onAuthChange((user) => {
          clearTimeout(timeout);
          setAuthStalled(false);
          const current = applySessionUser(user);
          if (current) clearAuthHash();
          setLoading(false);
          // Supabase calls this inside its auth lock: further requests must
          // run after it returns.
          setTimeout(() => {
            if (current?.emailVerified) {
              import("../services/profileService.js")
                .then(({ ensureUserProfile }) => ensureUserProfile(current))
                .catch((error) => console.warn("Unable to provision the user profile", error));
            }
            refreshProfileName(current);
          }, 0);
        });
      })
      .catch((error) => {
        console.error("Unable to start authentication", error);
        clearTimeout(timeout);
        setLoading(false);
        setProfileNameLoading(false);
        if (readLocalValue(AUTH_STORAGE_KEY)) setAuthStalled(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [applySessionUser, refreshProfileName]);

  // The auth emails are written in the language the user picked in the app.
  const signedInUid = sessionUser?.uid;
  useEffect(() => {
    if (!signedInUid) return undefined;
    const sync = (language) => {
      const wanted = toEmailLanguage(language);
      if (!sessionUserRef.current || sessionUserRef.current.language === wanted) return;
      import("../services/authService.js")
        .then(({ updateLanguage }) => updateLanguage(wanted))
        .catch((error) => console.warn("Unable to store the email language", error));
    };
    sync(i18n.resolvedLanguage || i18n.language);
    i18n.on("languageChanged", sync);
    return () => i18n.off("languageChanged", sync);
  }, [signedInUid]);

  const pending = useMemo(() => pendingUser(pendingEmail), [pendingEmail]);
  const currentUser = sessionUser || pending;

  const value = useMemo(
    () => ({
      currentUser, loading, authStalled, logout, profileName, profileNameLoading, refreshProfileName, refreshCurrentUser, markPendingVerification,
    }),
    [currentUser, loading, authStalled, logout, profileName, profileNameLoading, refreshProfileName, refreshCurrentUser, markPendingVerification]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
