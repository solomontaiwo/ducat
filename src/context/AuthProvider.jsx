import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../utils/firebase.jsx";
import { onAuthStateChanged, signOut } from "firebase/auth";
import PropTypes from "prop-types";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  AuthProvider.propTypes = {
    children: PropTypes.node.isRequired,
  };

  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Funzione per il logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Errore durante il logout:", error);
      throw error;
    }
  };

  useEffect(() => {
    // Safety timeout: if onAuthStateChanged never fires (e.g. bad Firebase config),
    // resolve loading after 5 s so the app doesn't stay on a blank page forever.
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        clearTimeout(timeout);
        setCurrentUser(user);
        setLoading(false);
      },
      () => {
        clearTimeout(timeout);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
