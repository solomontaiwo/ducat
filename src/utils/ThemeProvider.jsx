/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useLayoutEffect, useMemo, useState, useCallback } from "react";
import PropTypes from "prop-types";
import { readLocalValue, writeLocalValue } from "./storage.js";

// Creazione del contesto per il tema
const ThemeContext = createContext();

// Hook to access theme context
export const useTheme = () => useContext(ThemeContext);

// Toggles the theme class for Tailwind (dark mode)
const setCSSVariables = (isDark) => {
  document.documentElement.classList.toggle("dark", isDark);
  document.body.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("light", !isDark);
  document.body.classList.toggle("light", !isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#080c16" : "#f9f9fb");
};

// Componente principale per il tema
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return readLocalValue("theme", "system");
  });

  const getSystemPreference = useCallback(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, []);

  const applyTheme = useCallback((themeMode) => {
    let isDark;

    if (themeMode === "system") {
      isDark = getSystemPreference();
    } else {
      isDark = themeMode === "dark";
    }

    setCSSVariables(isDark);
    return isDark;
  }, [getSystemPreference]);

  const toggleTheme = useCallback((newTheme) => {
    setTheme(newTheme);
    writeLocalValue("theme", newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  const currentEffectiveTheme = theme === "system"
    ? (getSystemPreference() ? "dark" : "light")
    : theme;

  const value = useMemo(() => ({
    theme,
    toggleTheme,
    currentEffectiveTheme,
    isDarkMode: currentEffectiveTheme === "dark",
  }), [theme, toggleTheme, currentEffectiveTheme]);

  useLayoutEffect(() => {
    // Applica il tema iniziale prima del paint per evitare flash
    applyTheme(theme);

    // Ascolta i cambiamenti delle preferenze di sistema
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [theme, applyTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
