import AppRouter from "./router/AppRouter";
import DesktopUpdateNotifier from "./components/Update/DesktopUpdateNotifier";

function App() {
  return (
    <>
      <AppRouter />
      <DesktopUpdateNotifier />
    </>
  );
}

export default App;
