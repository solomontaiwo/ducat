import { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { FiCalendar, FiCheck, FiFileText, FiMinus, FiMoon, FiSearch } from "react-icons/fi";
import { Link, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { Button } from "../ui/button";
import { CategoryBadge } from "../Transaction/TransactionRow.jsx";
import { cn } from "../../lib/utils.js";

const logo = `${import.meta.env.BASE_URL}icon-192.png`;

const EXTRAS = [
  { icon: FiCalendar, key: "payday" },
  { icon: FiSearch, key: "search" },
  { icon: FiFileText, key: "export" },
  { icon: FiMoon, key: "everywhere" },
];

const COMPARISON = [
  { key: "features", demo: true, account: true },
  { key: "movements", demo: "10", account: "unlimited" },
  { key: "devices", demo: false, account: true },
  { key: "backup", demo: false, account: true },
];

/** Illustrative overview (not user data), in the app's own components and colours. */
const ProductPreview = () => {
  const { t } = useTranslation();
  return (
    <figure className="relative mx-auto w-full max-w-[22rem] lg:max-w-md" aria-label={t("landing.previewLabel")}>
      <div className="relative rounded-[2.6rem] border-[7px] border-foreground/90 bg-background p-3.5 shadow-[0_30px_60px_rgb(20_25_36/0.25)] dark:border-white/15">
        <p className="px-1 text-xs font-semibold text-muted-foreground">{t("landing.preview.greeting")}</p>
        <p className="mb-2.5 px-1 font-display text-lg font-extrabold">{t("landing.preview.month")}</p>
        <div className="space-y-2 rounded-[22px] bg-hero p-4 text-hero-foreground">
          <p className="text-xs font-semibold text-hero-muted">{t("dashboard.leftThisMonth")}</p>
          <p className="amount text-[2rem] leading-none">1.240,50 €</p>
          <div className="h-2 rounded-full bg-white/20"><div className="h-full w-[58%] rounded-full bg-warning" /></div>
        </div>
        <div className="surface mt-2.5 space-y-2 rounded-2xl p-3">
          <p className="text-xs font-bold">{t("dashboard.whereMoneyGoes")}</p>
          <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
            <span className="bg-[hsl(var(--cat-1))]" style={{ flexGrow: 45 }} />
            <span className="bg-[hsl(var(--cat-2))]" style={{ flexGrow: 25 }} />
            <span className="bg-[hsl(var(--cat-3))]" style={{ flexGrow: 18 }} />
            <span className="bg-[hsl(var(--cat-4))]" style={{ flexGrow: 12 }} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("landing.preview.split")}</p>
        </div>
        <div className="surface mt-2.5 flex items-center gap-2.5 rounded-2xl p-2.5">
          <CategoryBadge category="casa" type="expense" size="sm" />
          <span className="min-w-0 flex-1 text-xs"><strong className="font-semibold">{t("landing.preview.rent")}</strong> · {t("recurring.tomorrow")}</span>
          <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">{t("recurring.register")}</span>
        </div>
      </div>
      <div className="glass absolute -bottom-6 -right-2 w-44 rounded-2xl px-3 py-2.5 text-xs sm:-right-10" aria-hidden="true">
        <p className="font-bold text-accent-foreground">{t("transactionModal.suggested")}</p>
        <p>{t("landing.preview.suggestion")}</p>
      </div>
      <div className="glass absolute -left-2 -top-5 w-40 rounded-2xl px-3 py-2.5 text-xs sm:-left-10" aria-hidden="true">
        <p className="font-bold text-warning-strong">{t("landing.preview.budgetTitle")}</p>
        <p>{t("landing.preview.budgetValue")}</p>
      </div>
    </figure>
  );
};

const Mark = ({ value }) => {
  const { t } = useTranslation();
  if (value === true) return <FiCheck className="mx-auto h-5 w-5 text-primary" aria-label={t("landing.compare.yes")} />;
  if (value === false) return <FiMinus className="mx-auto h-5 w-5 text-muted-foreground/60" aria-label={t("landing.compare.no")} />;
  return <span className="font-semibold">{value === "unlimited" ? t("landing.compare.unlimited") : value}</span>;
};

Mark.propTypes = { value: PropTypes.oneOfType([PropTypes.bool, PropTypes.string]).isRequired };

const LandingPage = () => {
  const { currentUser } = useAuth();
  const { isDemo, startDemo } = useUnifiedTransactions();
  const navigate = useNavigate();
  const [startingDemo, setStartingDemo] = useState(false);
  const { t } = useTranslation();

  const handleStartDemo = () => {
    setStartingDemo(true);
    if (!isDemo && !currentUser) startDemo();
    setTimeout(() => {
      navigate("/transactions");
      setStartingDemo(false);
    }, 400);
  };

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-clip text-foreground">
      <div className="ambient-backdrop" aria-hidden="true" />

      <header className="glass sticky top-[calc(env(safe-area-inset-top)+0.625rem)] z-30 mx-2.5 mt-[calc(env(safe-area-inset-top)+0.625rem)] flex items-center gap-6 rounded-full py-2 pl-4 pr-2 sm:mx-auto sm:w-[min(70rem,calc(100%-2.5rem))]">
        <span className="flex flex-1 items-center gap-2.5">
          <img src={logo} alt="" width="30" height="30" className="h-[30px] w-[30px] rounded-[10px]" />
          <span className="font-display text-lg font-extrabold tracking-tight">{t("appName")}</span>
        </span>
        <nav className="hidden items-center gap-6 text-[15px] font-semibold text-foreground/75 md:flex" aria-label={t("landing.sections")}>
          <button type="button" onClick={() => scrollTo("how")} className="hover:text-foreground">{t("landing.how.title")}</button>
          <button type="button" onClick={() => scrollTo("compare")} className="hover:text-foreground">{t("landing.compare.title")}</button>
        </nav>
        <Button variant="ghost" className="rounded-full" onClick={() => navigate("/login")}>{t("landing.login")}</Button>
        <Button className="hidden rounded-full md:inline-flex" onClick={() => navigate("/register")}>{t("landing.register")}</Button>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-20 px-5 pb-12 pt-10 sm:space-y-28 lg:pt-16">
        <section className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div className="animate-page-in space-y-6">
            <p className="inline-flex rounded-full border border-white/80 bg-card/70 px-3.5 py-1.5 text-[13px] font-bold text-accent-foreground backdrop-blur dark:border-white/10">
              {t("landing.badge")}
            </p>
            <h1 className="text-[2.75rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.5rem]">
              {t("landing.headlineStart")}<br />
              <span className="text-primary">{t("landing.headlineEnd")}</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">{t("landing.lead")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => navigate("/register")} className="h-14 rounded-full px-7 text-base">
                {t("landing.register")}
              </Button>
              <Button size="lg" variant="outline" onClick={handleStartDemo} disabled={startingDemo} className="h-14 rounded-full bg-card/70 px-7 text-base">
                {t("landing.tryDemo")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t("landing.demoNote")}</p>
          </div>
          <div className="animate-page-in px-4 sm:px-10">
            <ProductPreview />
          </div>
        </section>

        <section id="how" className="scroll-mt-24 space-y-6" aria-labelledby="how-title">
          <h2 id="how-title" className="text-3xl font-extrabold sm:text-4xl">{t("landing.how.title")}</h2>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {["add", "understand", "plan"].map((key, index) => (
              <li key={key} className="surface flex gap-4 p-5 md:flex-col md:p-6">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="space-y-1.5">
                  <span className="block font-display text-lg font-bold">{t(`landing.how.${key}Title`)}</span>
                  <span className="block text-[15px] leading-relaxed text-muted-foreground">{t(`landing.how.${key}Desc`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-6" aria-labelledby="extras-title">
          <h2 id="extras-title" className="text-3xl font-extrabold sm:text-4xl">{t("landing.extras.title")}</h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {EXTRAS.map(({ icon: Icon, key }) => (
              <li key={key} className="surface space-y-2 p-4 sm:p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="block font-bold">{t(`landing.extras.${key}Title`)}</span>
                <span className="block text-sm text-muted-foreground">{t(`landing.extras.${key}Desc`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="compare" className="grid scroll-mt-24 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" aria-labelledby="compare-title">
          <div className="surface space-y-4 p-5 sm:p-7">
            <h2 id="compare-title" className="text-2xl font-extrabold sm:text-3xl">{t("landing.compare.title")}</h2>
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wide">
                  <th scope="col" className="pb-2 text-left"><span className="sr-only">{t("landing.compare.feature")}</span></th>
                  <th scope="col" className="w-20 pb-2 text-muted-foreground">{t("landing.compare.demo")}</th>
                  <th scope="col" className="w-24 pb-2 text-primary">{t("landing.compare.account")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {COMPARISON.map((row) => (
                  <tr key={row.key}>
                    <th scope="row" className="py-2.5 text-left font-medium">{t(`landing.compare.${row.key}`)}</th>
                    <td className="py-2.5 text-center"><Mark value={row.demo} /></td>
                    <td className="py-2.5 text-center text-primary"><Mark value={row.account} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground">{t("landing.compare.note")}</p>
          </div>
          <div className={cn("flex flex-col justify-center gap-5 rounded-[28px] bg-hero p-7 text-hero-foreground sm:p-9", "shadow-[0_16px_36px_rgb(29_78_216/0.3)] dark:shadow-none")}>
            <h2 className="text-3xl font-extrabold leading-tight sm:text-4xl">{t("landing.final.title")}</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => navigate("/register")} className="h-14 rounded-full bg-white px-7 text-base !text-[#1d4ed8] hover:bg-white/90">
                {t("landing.register")}
              </Button>
              <button type="button" onClick={handleStartDemo} disabled={startingDemo} className="px-2 py-2 text-left font-bold underline-offset-4 hover:underline">
                {t("landing.final.demo")}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-4 border-t border-border/70 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 text-sm text-muted-foreground">
        <span>© {t("appName")}</span>
        <span className="flex gap-6">
          <Link to="/privacy" className="hover:text-foreground">{t("landing.footer.privacy")}</Link>
          <Link to="/terms" className="hover:text-foreground">{t("landing.footer.terms")}</Link>
          <Link to="/login" className="hover:text-foreground">{t("landing.login")}</Link>
        </span>
      </footer>
    </div>
  );
};

export default LandingPage;
