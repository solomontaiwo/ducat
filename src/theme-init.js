(() => {
  const setThemeMeta = () => {
    let savedTheme = "system";
    try {
      savedTheme = localStorage.getItem("theme") || "system";
    } catch {
      // Storage can be unavailable in restrictive/private browsing contexts.
    }
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDarkMode = savedTheme === "dark" || (savedTheme === "system" && systemPrefersDark);
    document.documentElement.classList.toggle("dark", isDarkMode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDarkMode ? "#080c16" : "#f9f9fb");
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute("content", isDarkMode ? "black" : "default");
  };

  setThemeMeta();
  window.addEventListener("storage", setThemeMeta);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", setThemeMeta);
})();
