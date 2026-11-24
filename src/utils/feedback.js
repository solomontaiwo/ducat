import { LEGAL_ENTITY } from "../content/legal.js";
import { APP_NAME } from "./brand.js";
import { APP_VERSION } from "./appVersion.js";
import { runtime } from "../platform/index.js";

const PLATFORM_LABELS = {
  mobile: "iOS",
  desktop: "Desktop",
  web: "Web",
};

/**
 * Builds a pre-filled `mailto:` link for bug reports and TestFlight feedback.
 * Carries only technical diagnostics (version, shell, language): never account
 * or financial data.
 */
export const buildFeedbackMailto = ({ language = "it", subjectPrefix, promptLine } = {}) => {
  const shell = PLATFORM_LABELS[runtime()] || "Web";
  const subject = `[${APP_NAME} v${APP_VERSION} · ${shell}] ${subjectPrefix || "Feedback"}`;
  const lines = [
    promptLine || "",
    "",
    "---",
    `App: ${APP_NAME} v${APP_VERSION}`,
    `Platform: ${shell}`,
    `Language: ${language}`,
  ];
  const params = new URLSearchParams({
    subject,
    body: lines.join("\n"),
  });
  return `mailto:${LEGAL_ENTITY.email}?${params.toString().replace(/\+/g, "%20")}`;
};
