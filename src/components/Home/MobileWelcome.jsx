import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FiChevronRight, FiLock, FiRepeat, FiZap } from "react-icons/fi";
import { Link, useNavigate } from "../../router/RouterProvider";
import { useAuth } from "../../context/AuthProvider.jsx";
import { useUnifiedTransactions } from "../../context/UnifiedTransactionProvider.jsx";
import { Button } from "../ui/button";
import { hapticTap } from "../../platform/haptics.js";
import { cn } from "../../lib/utils.js";

const logo = `${import.meta.env.BASE_URL}icon-192.png`;

const SLIDES = [
  { key: "fast", icon: FiZap, tone: "bg-primary/12 text-primary" },
  { key: "plan", icon: FiRepeat, tone: "bg-income/12 text-income" },
  { key: "private", icon: FiLock, tone: "bg-warning/15 text-warning-strong" },
];

/**
 * Compact native welcome screen shown on iOS instead of the marketing web
 * landing page. Keeps the first-run flow focused on three highlights and direct
 * actions (create account, sign in, or try demo).
 */
const MobileWelcome = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isDemo, startDemo } = useUnifiedTransactions();
  const [step, setStep] = useState(0);
  const [startingDemo, setStartingDemo] = useState(false);

  const slide = SLIDES[step];
  const Icon = slide.icon;

  const selectStep = (next) => {
    hapticTap();
    setStep(next);
  };

  const handleNext = () => {
    hapticTap();
    setStep((current) => (current + 1) % SLIDES.length);
  };

  const handleStartDemo = () => {
    hapticTap("medium");
    setStartingDemo(true);
    if (!isDemo && !currentUser) startDemo();
    navigate("/dashboard");
    setStartingDemo(false);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col justify-between overflow-x-clip pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[calc(env(safe-area-inset-top)+1.5rem)] text-foreground">
      <header className="flex items-center justify-center gap-2.5">
        <img src={logo} alt="" width="36" height="36" className="h-9 w-9 rounded-[11px] shadow-sm" />
        <span className="font-display text-2xl font-extrabold tracking-tight">{t("appName")}</span>
      </header>

      <section className="mx-auto my-auto flex w-full max-w-sm flex-col items-center py-8 text-center" aria-label={t("mobileWelcome.highlights")}>
        <div key={slide.key} className="animate-page-in flex flex-col items-center space-y-5">
          <span className={cn("flex h-16 w-16 items-center justify-center rounded-3xl", slide.tone)} aria-hidden="true">
            <Icon className="h-8 w-8" />
          </span>
          <div className="space-y-2.5">
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
              {t(`mobileWelcome.slides.${slide.key}.title`)}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {t(`mobileWelcome.slides.${slide.key}.body`)}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <div className="flex items-center gap-2" role="tablist" aria-label={t("mobileWelcome.highlights")}>
            {SLIDES.map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={index === step}
                aria-label={t(`mobileWelcome.slides.${item.key}.title`)}
                onClick={() => selectStep(index)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === step ? "w-7 bg-primary" : "w-2 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleNext}
            aria-label={t("mobileWelcome.next")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition hover:bg-muted/80"
          >
            <FiChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      <footer className="mx-auto w-full max-w-sm space-y-3">
        <Button
          size="lg"
          className="h-12 w-full rounded-2xl text-base"
          onClick={() => {
            hapticTap("medium");
            navigate("/register");
          }}
        >
          {t("landing.register")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12 w-full rounded-2xl bg-card/80 text-base"
          onClick={() => {
            hapticTap();
            navigate("/login");
          }}
        >
          {t("landing.login")}
        </Button>
        <button
          type="button"
          onClick={handleStartDemo}
          disabled={startingDemo}
          className="w-full py-2 text-center text-sm font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {t("mobileWelcome.tryDemo")}
        </button>
        <p className="flex justify-center gap-3 pt-1 text-xs text-muted-foreground">
          <Link to="/privacy" className="hover:underline">{t("landing.footer.privacy")}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="hover:underline">{t("landing.footer.terms")}</Link>
        </p>
      </footer>
    </div>
  );
};

export default MobileWelcome;
