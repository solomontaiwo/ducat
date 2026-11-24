import { lazy, Suspense, useEffect } from "react";
import { useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { isMobile } from "../../platform/index.js";
import LandingPage from "./LandingPage";
import LoadingWrapper from "../../utils/loadingWrapper";

const MobileWelcome = lazy(() => import("./MobileWelcome"));

const Home = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { isDemo, loading: transactionsLoading } = useUnifiedTransactions();

  // Se autenticato o demo, reindirizza
  useEffect(() => {
    if (currentUser || isDemo) {
      navigate("/dashboard", { replace: true });
    }
  }, [currentUser, isDemo, navigate]);

  // Mostra solo il loader finché uno dei due loading è true OPPURE non è ancora chiaro se c'è utente o demo
  if (authLoading || transactionsLoading || typeof currentUser === "undefined" || typeof isDemo === "undefined") {
    return <LoadingWrapper loading={true}>{null}</LoadingWrapper>;
  }

  // Mostra l'onboarding mobile nativo su iOS, la landing web altrove
  if (!currentUser && !isDemo) {
    if (isMobile()) {
      return (
        <Suspense fallback={<LoadingWrapper loading={true}>{null}</LoadingWrapper>}>
          <MobileWelcome />
        </Suspense>
      );
    }
    return <LandingPage />;
  }

  return null;
};

export default Home;
