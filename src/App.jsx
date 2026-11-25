import AppRouter from "./router/AppRouter";
import UpdaterProvider from "./context/UpdaterProvider";

function App() {
  return (
    <UpdaterProvider>
      <AppRouter />
      {import.meta.env.VITE_APP_ENV === "dev" && (
        <span className="pointer-events-none fixed left-1/2 top-[env(safe-area-inset-top)] z-50 -translate-x-1/2 rounded-b bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
          DEV
        </span>
      )}
    </UpdaterProvider>
  );
}

export default App;
