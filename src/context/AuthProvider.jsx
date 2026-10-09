import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { getCurrentProfileName } from "../utils/downloadUtils.jsx";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState(null);
  const [profileNameLoading, setProfileNameLoading] = useState(true);
  const [, setAuthRevision] = useState(0);

  const refreshProfileName = useCallback(async (user) => {
    if (!user) {
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

  // Funzione per il logout
  const logout = useCallback(async () => {
    try {
      try {
        const { TransactionService } = await import("../services/transactionService.jsx");
        TransactionService.invalidateCache();
      } catch (cacheError) {
        console.warn("Unable to clear the transaction cache on logout", cacheError);
      }
      const [{ auth }, { signOut }] = await Promise.all([
        import("../utils/firebaseAuth.js"),
        import("firebase/auth"),
      ]);
      await signOut(auth);
    } catch (error) {
      console.error("Errore durante il logout:", error);
      throw error;
    }
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    const { auth } = await import("../utils/firebaseAuth.js");
    const user = auth.currentUser;
    if (!user) return null;
    await user.reload();
    await user.getIdToken(true);
    setCurrentUser(auth.currentUser);
    setAuthRevision((revision) => revision + 1);
    return auth.currentUser;
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    // Safety timeout: if onAuthStateChanged never fires (e.g. bad Firebase config),
    // resolve loading after 5 s so the app doesn't stay on a blank page forever.
    const timeout = setTimeout(() => {
      setLoading(false);
      setProfileNameLoading(false);
    }, 5000);

    Promise.all([import("../utils/firebaseAuth.js"), import("firebase/auth")])
      .then(([{ auth }, { onAuthStateChanged }]) => {
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (user) => {
            clearTimeout(timeout);
            setCurrentUser(user);
            setLoading(false);
            if (user) {
              import("../services/profileService.js")
                .then(({ ensureUserProfile }) => ensureUserProfile(user))
                .catch((error) => console.warn("Unable to provision the user profile", error));
            }
            refreshProfileName(user);
          },
          () => {
            clearTimeout(timeout);
            setLoading(false);
            setProfileNameLoading(false);
          }
        );
      })
      .catch(() => {
        clearTimeout(timeout);
        setLoading(false);
        setProfileNameLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [refreshProfileName]);

  const value = useMemo(
    () => ({ currentUser, loading, logout, profileName, profileNameLoading, refreshProfileName, refreshCurrentUser }),
    [currentUser, loading, logout, profileName, profileNameLoading, refreshProfileName, refreshCurrentUser]
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
