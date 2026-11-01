import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "../../router/RouterProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { APP_NAME } from "../../utils/brand.js";
import {
  LEGAL_ENTITY,
  LEGAL_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
} from "../../content/legal.js";

const fill = (text) =>
  String(text)
    .replaceAll("{{app}}", APP_NAME)
    .replaceAll("{{entity}}", LEGAL_ENTITY.name)
    .replaceAll("{{address}}", LEGAL_ENTITY.address)
    .replaceAll("{{email}}", LEGAL_ENTITY.email);

/** Renders one section list for the current app language. */
const Sections = ({ sections }) => (
  <>
    {sections.map((section) => (
      <section key={section.title} className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">{fill(section.title)}</h2>
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{fill(paragraph)}</p>
        ))}
      </section>
    ))}
  </>
);

Sections.propTypes = {
  sections: PropTypes.arrayOf(PropTypes.shape({
    title: PropTypes.string.isRequired,
    paragraphs: PropTypes.arrayOf(PropTypes.string).isRequired,
  })).isRequired,
};

const LegalPage = () => {  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const isPrivacy = pathname === "/privacy";
  const language = i18n.language?.startsWith("en") ? "en" : "it";
  const sections = (isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS)[language];

  return (
    <main className="min-h-[100dvh] bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)] text-foreground">
      <Card className="mx-auto max-w-3xl">
        <CardHeader className="space-y-1">
          <CardTitle>{t(isPrivacy ? "legal.privacyTitle" : "legal.termsTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("legal.updated", { date: LEGAL_UPDATED })}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 text-sm leading-6 text-muted-foreground">
          <Sections sections={sections} />
          <div className="flex flex-wrap gap-4 border-t border-border pt-4">
            <Link to="/" className="font-semibold text-primary">{t("legal.back")}</Link>
            <Link to={isPrivacy ? "/terms" : "/privacy"} className="font-semibold text-primary">
              {t(isPrivacy ? "legal.termsTitle" : "legal.privacyTitle")}
            </Link>
            <a href={`mailto:${LEGAL_ENTITY.email}`} className="font-semibold text-primary">
              {t("legal.contact")}
            </a>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default LegalPage;
