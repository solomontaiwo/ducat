/** Language of the auth emails (stored as user_metadata.lang): English or Italian, Italian by default. */
export const toEmailLanguage = (language) => (String(language || "").toLowerCase().startsWith("en") ? "en" : "it");
