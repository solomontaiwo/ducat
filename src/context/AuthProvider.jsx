import { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { getCurrentProfileName } from "../utils/downloadUtils.jsx";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  AuthProvider.propTypes = {
    children: PropTypes.node.isRequired,
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState(null);
  const [profileNameLoading, setProfileNameLoading] = useState(true);

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
  const logout = async () => {
    try {
      const [{ auth }, { signOut }] = await Promise.all([
        import("../utils/firebase.jsx"),
        import("firebase/auth"),
      ]);
      await signOut(auth);
    } catch (error) {
      console.error("Errore durante il logout:", error);
      throw error;
    }
  };

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    // Safety timeout: if onAuthStateChanged never fires (e.g. bad Firebase config),
    // resolve loading after 5 s so the app doesn't stay on a blank page forever.
    const timeout = setTimeout(() => {
      setLoading(false);
      setProfileNameLoading(false);
    }, 5000);

    Promise.all([import("../utils/firebase.jsx"), import("firebase/auth")])
      .then(([{ auth }, { onAuthStateChanged }]) => {
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (user) => {
            clearTimeout(timeout);
            setCurrentUser(user);
            setLoading(false);
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

  return (
    <AuthContext.Provider value={{ currentUser, loading, logout, profileName, profileNameLoading, refreshProfileName }}>
      {children}
    </AuthContext.Provider>
  );
};
