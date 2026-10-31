import AppRouter from "./router/AppRouter";
import UpdaterProvider from "./context/UpdaterProvider";

function App() {
  return (
    <UpdaterProvider>
      <AppRouter />
    </UpdaterProvider>
  );
}

export default App;
