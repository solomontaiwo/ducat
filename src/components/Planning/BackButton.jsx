import { FiChevronLeft } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../router/RouterProvider";

/** Goes back when there is history inside the app, otherwise to the overview. */
const BackButton = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.state && window.history.length > 1) window.history.back();
    else navigate("/dashboard");
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t("recurring.back")}
      className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition hover:bg-muted"
    >
      <FiChevronLeft className="h-6 w-6" aria-hidden="true" />
    </button>
  );
};

export default BackButton;
