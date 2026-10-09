import { useState } from "react";
import { Link, useNavigate } from "../../router/RouterProvider";
import { FiBarChart2, FiFileText, FiPlay, FiShield, FiUserPlus } from "react-icons/fi";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";

const logo = `${import.meta.env.BASE_URL}icon-192.png`;

const featureCards = [
  { icon: FiBarChart2, titleKey: "landing.features.analyticsTitle", descKey: "landing.features.analyticsDesc" },
  { icon: FiFileText, titleKey: "landing.features.pdfTitle", descKey: "landing.features.pdfDesc" },
  { icon: FiShield, titleKey: "landing.features.securityTitle", descKey: "landing.features.securityDesc" },
];

// Illustrative rows for the product preview (not user data).
const previewRows = [
  { category: "supermercato", type: "expense", labelKey: "categories.supermercato", amount: "−42,30 €" },
  { category: "trasporti", type: "expense", labelKey: "categories.trasporti", amount: "−25,00 €" },
  { category: "stipendio", type: "income", labelKey: "categories.stipendio", amount: "+1.850,00 €" },
];

const LandingPage = () => {
  const { currentUser } = useAuth();
  const { isDemo, startDemo } = useUnifiedTransactions();
  const navigate = useNavigate();
  const [startingDemo, setStartingDemo] = useState(false);
  const { t } = useTranslation();

  const handleStartDemo = async () => {
    setStartingDemo(true);
    if (!isDemo && !currentUser) startDemo();
    setTimeout(() => {
      navigate("/transactions");
      setStartingDemo(false);
    }, 400);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pb-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <span className="flex items-center gap-2.5">
          <img src={logo} alt="" width="32" height="32" className="h-8 w-8 rounded-[10px]" />
          <span className="font-display text-lg font-extrabold tracking-tight">Soldi Sotto</span>
        </span>
        <Button variant="ghost" onClick={() => navigate("/login")}>{t("landing.login")}</Button>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-5 py-8 lg:py-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="animate-page-in space-y-6">
            <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
              {t("landing.headline")}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {t("landing.lead")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={handleStartDemo} disabled={startingDemo} className="gap-2 sm:px-6">
                <FiPlay className="h-5 w-5" aria-hidden="true" />
                {t("landing.tryDemo")}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/register")} className="gap-2 sm:px-6">
                <FiUserPlus className="h-5 w-5" aria-hidden="true" />
                {t("landing.register")}
              </Button>
            </div>
          </div>

          <figure className="animate-page-in mx-auto w-full max-w-md lg:max-w-none" aria-label={t("landing.previewLabel")}>
            <div className="surface space-y-4 rounded-[28px] p-4 sm:p-5">
              <div className="space-y-3 rounded-3xl bg-hero p-5 text-hero-foreground">
                <p className="text-sm font-semibold text-hero-muted">{t("dashboard.leftThisMonth")}</p>
                <p className="amount text-4xl">1.782,70 €</p>
                <div className="h-2 rounded-full bg-white/20"><div className="h-full w-[4%] rounded-full bg-warning" /></div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="font-semibold text-hero-muted">{t("dashboard.income")}</p><p className="amount text-base">+1.850,00 €</p></div>
                  <div><p className="font-semibold text-hero-muted">{t("dashboard.expenses")}</p><p className="amount text-base">−67,30 €</p></div>
                </div>
              </div>
              <ul className="divide-y divide-border px-1">
                {previewRows.map((row) => (
                  <li key={row.category} className="flex items-center gap-3 py-2.5">
                    <CategoryBadge category={row.category} type={row.type} size="sm" />
                    <span className="flex-1 text-sm font-semibold">{t(row.labelKey)}</span>
                    <span className={`amount text-sm ${row.type === "income" ? "text-income" : ""}`}>{row.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </figure>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {featureCards.map((card) => {
            const Icon = card.icon;
            return (
              <li key={card.titleKey} className="surface flex items-start gap-3.5 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-bold">{t(card.titleKey)}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{t(card.descKey)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </main>

      <footer className="flex justify-center gap-6 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2 text-sm text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">{t("landing.footer.privacy")}</Link>
        <Link to="/terms" className="hover:text-foreground">{t("landing.footer.terms")}</Link>
      </footer>
    </div>
  );
};

export default LandingPage;
