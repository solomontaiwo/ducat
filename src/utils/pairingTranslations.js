import i18n from "./i18n.jsx";
import translations from "../locales/pairing.json";

for (const [language, resource] of Object.entries(translations)) {
  i18n.addResourceBundle(language, "pairing", resource);
}
