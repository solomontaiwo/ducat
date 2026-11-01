import PropTypes from "prop-types";
import { motion } from "framer-motion";
import { FiArrowLeft } from "react-icons/fi";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../router/RouterProvider";
import { Button } from "../ui/button";

/** Shared frame for the sign-in and sign-up pages. */
const AuthShell = ({ title, subtitle, error, children, footer, backLabel }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface w-full max-w-md rounded-3xl p-6 sm:p-8"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="mb-4 gap-2 text-muted-foreground"
        >
          <FiArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel || t("login.backToHome")}
        </Button>

        <div className="mb-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="44" height="44" className="h-11 w-11 rounded-xl" />
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {children}

        {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </div>
  );
};

AuthShell.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  error: PropTypes.string,
  children: PropTypes.node.isRequired,
  footer: PropTypes.node,
  backLabel: PropTypes.string,
};

export default AuthShell;
